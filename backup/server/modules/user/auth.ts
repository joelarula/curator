import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export function setupAuth(app: any) {
    // Passport Google OAuth Strategy
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: 'http://localhost:4000/auth/google/callback'
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Find or create user in database
                let user = await prisma.user.findUnique({
                    where: { email: profile.emails![0].value }
                })

                if (!user) {
                    user = await prisma.user.create({
                        data: {
                            email: profile.emails![0].value,
                            name: profile.displayName,
                            googleId: profile.id
                        }
                    })
                }

                return done(null, user)
            } catch (error) {
                return done(error as Error)
            }
        }
    ))

    // Passport JWT Strategy
    passport.use(new JwtStrategy({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: JWT_SECRET
    },
        async (payload, done) => {
            try {
                const user = await prisma.user.findUnique({
                    where: { id: payload.sub }
                })
                if (user) {
                    return done(null, user)
                }
                return done(null, false)
            } catch (error) {
                return done(error, false)
            }
        }
    ))

    app.use(passport.initialize())

    // Auth routes
    app.get('/auth/google',
        passport.authenticate('google', { scope: ['profile', 'email'], session: false })
    )

    app.get('/auth/google/callback',
        passport.authenticate('google', { session: false, failureRedirect: '/login' }),
        (req: any, res: any) => {
            const user = req.user as any
            const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })

            // Redirect to frontend with token
            const NODE_ENV = process.env.NODE_ENV || 'development'
            const redirectUrl = NODE_ENV === 'production'
                ? `/?token=${token}`
                : `http://localhost:3000/?token=${token}`

            res.redirect(redirectUrl)
        }
    )

    app.get('/auth/logout', (req: any, res: any) => {
        res.clearCookie('token')
        res.json({ success: true })
    })
}

export async function getUserFromToken(token: string) {
    if (!token) return null
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any
        return await prisma.user.findUnique({
            where: { id: decoded.sub }
        })
    } catch (error) {
        console.error('JWT verification failed:', error)
        return null
    }
}
