import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';

export function setupGoogleStrategy(prisma: PrismaClient) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback'
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No email found in Google profile'));
                }

                let user = await prisma.user.findUnique({
                    where: { email }
                });

                if (!user) {
                    user = await prisma.user.create({
                        data: {
                            email,
                            name: profile.displayName,
                            googleId: profile.id
                        }
                    });
                } else if (!user.googleId) {
                    // Update user with googleId if they existed (e.g. created via email)
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: { googleId: profile.id }
                    });
                }

                return done(null, user);
            } catch (error) {
                return done(error as Error);
            }
        }
    ));
}
