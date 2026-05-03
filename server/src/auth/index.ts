import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { setupGoogleStrategy } from './google.js';

const JWT_SECRET = process.env.JWT_SECRET || 'padagaskar-secret-key-change-me';

export function setupAuth(app: Express, prisma: PrismaClient) {
    // Setup Google Strategy
    setupGoogleStrategy(prisma);

    // Setup JWT Strategy
    passport.use(new JwtStrategy({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: JWT_SECRET
    },
        async (payload, done) => {
            try {
                const user = await prisma.user.findUnique({
                    where: { id: payload.sub }
                });
                if (user) {
                    return done(null, user);
                }
                return done(null, false);
            } catch (error) {
                return done(error, false);
            }
        }
    ));

    app.use(passport.initialize());

    // Auth routes
    app.get('/auth/google', (req, res, next) => {
        // If a callback param is present, encode it in the state param
        const { callback } = req.query;
        const state = callback ? Buffer.from(JSON.stringify({ callback })).toString('base64') : undefined;
        const authenticator = passport.authenticate('google', {
            scope: ['profile', 'email'],
            session: false,
            state
        });
        authenticator(req, res, next);
    });

    app.get('/auth/google/callback',
        passport.authenticate('google', { session: false, failureRedirect: '/login' }),
        (req: any, res: any) => {
            const user = req.user as any;
            const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

            // Try to extract callback from state param
            let callback: string | undefined = undefined;
            if (req.query.state) {
                try {
                    const stateObj = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString('utf8'));
                    if (typeof stateObj.callback === 'string') {
                        callback = stateObj.callback;
                    }
                } catch (e) {
                    // ignore
                }
            }
            if (callback && /^https?:\/\//.test(callback)) {
                res.redirect(`${callback}${callback.includes('?') ? '&' : '?'}token=${token}`);
            } else {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                res.redirect(`${frontendUrl}/?token=${token}`);
            }
        }
    );

    app.get('/auth/logout', (req: any, res: any) => {
        res.json({ success: true });
    });
}

export async function getUserFromToken(token: string, prisma: PrismaClient) {
    if (!token) return null;
    try {
        // First try to verify with our own secret
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            if (decoded?.sub) {
                return await prisma.user.findUnique({
                    where: { id: decoded.sub }
                });
            }
        } catch (e) {
            // Verification failed (maybe it's a wiki.js RS256 token), continue to fallback
        }

        // Fallback: decode without verification (useful for wiki.js integration where we don't have the pubkey)
        const decoded = jwt.decode(token) as any;
        if (!decoded || !decoded.email) return null;

        // Upsert user based on email from decoded payload
        let user = await prisma.user.findUnique({
            where: { email: decoded.email }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: decoded.email,
                    name: decoded.name || 'Wiki.js User'
                }
            });
        }
        return user;
    } catch (error) {
        console.error('JWT parsing failed:', error);
        return null;
    }
}
