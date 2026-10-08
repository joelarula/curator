import { createRequire } from 'node:module';
import { CURATOR_ROLES } from './types.js';
import { AuthorizationEngine } from './engine.js';
function loadModule(name) {
    try {
        const appRequire = createRequire(process.cwd() + '/package.json');
        return appRequire(name);
    }
    catch (_) {
        try {
            const localRequire = createRequire(import.meta.url);
            return localRequire(name);
        }
        catch (_) {
            return null;
        }
    }
}
const passport = loadModule('passport');
const googleStrategyModule = loadModule('passport-google-oauth20');
const GoogleStrategy = googleStrategyModule?.Strategy || googleStrategyModule;
const jwt = loadModule('jsonwebtoken');
export function setupGoogleAuth(app, options, engine = new AuthorizationEngine({ defaultManagers: options.defaultManagers })) {
    const clientID = options.googleClientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = options.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = options.googleCallbackUrl || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4001/auth/google/callback';
    const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'keeris-curator-secret-key-change-me';
    const getPrisma = options.getPrisma || (() => null);
    if (clientID && clientSecret) {
        passport.use(new GoogleStrategy({
            clientID,
            clientSecret,
            callbackURL,
        }, async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No email found in Google profile'));
                }
                const prisma = getPrisma();
                let user = null;
                if (prisma?.user) {
                    user = await prisma.user.findUnique({
                        where: { email },
                    });
                    if (!user) {
                        user = await prisma.user.create({
                            data: {
                                id: profile.id || `u_${Date.now()}`,
                                email,
                                name: profile.displayName || email,
                                googleId: profile.id,
                            },
                        });
                    }
                    else if (!user.googleId && profile.id) {
                        try {
                            user = await prisma.user.update({
                                where: { id: user.id },
                                data: { googleId: profile.id },
                            });
                        }
                        catch (_) { }
                    }
                    // Auto-assign curator_manager if default manager
                    if (engine.isDefaultManager(email)) {
                        try {
                            if (prisma.userRole) {
                                await prisma.userRole.upsert({
                                    where: { userId_roleId: { userId: user.id, roleId: 'role_curator_manager' } },
                                    update: {},
                                    create: { userId: user.id, roleId: 'role_curator_manager' },
                                });
                            }
                        }
                        catch (_) { }
                    }
                }
                else {
                    // Minimal in-memory user if DB is not attached
                    user = {
                        id: profile.id || `u_${Date.now()}`,
                        email,
                        name: profile.displayName || email,
                        googleId: profile.id,
                    };
                }
                const roles = await engine.getUserRoles(user.id, user.email, prisma);
                const authUser = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    googleId: user.googleId,
                    roles,
                };
                return done(null, authUser);
            }
            catch (error) {
                return done(error);
            }
        }));
    }
    app.use(passport.initialize());
    // Google OAuth entrypoint
    app.get('/auth/google', (req, res, next) => {
        if (!clientID || !clientSecret) {
            res.status(500).json({ error: 'Google OAuth credentials not configured on server' });
            return;
        }
        const { callback } = req.query;
        const state = callback ? Buffer.from(JSON.stringify({ callback })).toString('base64') : undefined;
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            session: false,
            state,
        })(req, res, next);
    });
    // Google OAuth callback
    app.get('/auth/google/callback', (req, res, next) => {
        passport.authenticate('google', { session: false, failureRedirect: '/login?error=auth_failed' })(req, res, next);
    }, async (req, res) => {
        const user = req.user;
        const prisma = getPrisma();
        const roles = user ? await engine.getUserRoles(user.id, user.email, prisma) : [];
        const tokenPayload = {
            sub: user.id,
            email: user.email,
            name: user.name,
            roles,
        };
        const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '7d' });
        let callback = undefined;
        if (req.query.state) {
            try {
                const stateObj = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
                if (typeof stateObj.callback === 'string') {
                    callback = stateObj.callback;
                }
            }
            catch (_) { }
        }
        if (callback && /^https?:\/\//.test(callback)) {
            res.redirect(`${callback}${callback.includes('?') ? '&' : '?'}token=${token}`);
        }
        else {
            const frontendUrl = options.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3001';
            res.redirect(`${frontendUrl}/?token=${token}`);
        }
    });
    // Verify current user from Authorization header or query param
    app.get('/auth/me', async (req, res) => {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query?.token;
        if (!token) {
            return res.status(401).json({ user: null });
        }
        const prisma = getPrisma();
        const user = await getUserFromToken(token, prisma, jwtSecret, engine);
        if (!user) {
            return res.status(401).json({ user: null });
        }
        res.json({ user });
    });
    // Logout route
    app.get('/auth/logout', (_req, res) => {
        res.json({ success: true, message: 'Logged out successfully' });
    });
    app.post('/auth/logout', (_req, res) => {
        res.json({ success: true, message: 'Logged out successfully' });
    });
}
export async function getUserFromToken(token, prisma, jwtSecret = process.env.JWT_SECRET || 'keeris-curator-secret-key-change-me', engine = new AuthorizationEngine()) {
    if (!token)
        return null;
    try {
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
        let decoded = null;
        try {
            decoded = jwt.verify(cleanToken, jwtSecret);
        }
        catch (_) {
            decoded = jwt.decode(cleanToken);
        }
        if (!decoded || (!decoded.sub && !decoded.email)) {
            return null;
        }
        const email = decoded.email;
        const userId = decoded.sub || `u_${email?.replace(/[^a-zA-Z0-9]/g, '_')}`;
        let roles = Array.isArray(decoded.roles) ? decoded.roles : [];
        if (prisma) {
            const dbRoles = await engine.getUserRoles(userId, email, prisma);
            roles = Array.from(new Set([...roles, ...dbRoles]));
        }
        else if (engine.isDefaultManager(email)) {
            roles = Array.from(new Set([...roles, CURATOR_ROLES.MANAGER]));
        }
        return {
            id: userId,
            email,
            name: decoded.name || email?.split('@')[0],
            googleId: decoded.googleId,
            roles,
        };
    }
    catch (error) {
        return null;
    }
}
export function requireRole(roleName = CURATOR_ROLES.MANAGER, engine = new AuthorizationEngine()) {
    return (req, res, next) => {
        const user = req.user;
        try {
            engine.assertRole(user, roleName);
            next();
        }
        catch (err) {
            res.status(err.status || 403).json({ error: err.message, code: err.code || 'FORBIDDEN' });
        }
    };
}
//# sourceMappingURL=passport.js.map