import express from 'express'
import { ApolloServer } from '@apollo/server'
import cors from 'cors'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import jwt from 'jsonwebtoken'
import path from 'path'
import { typeDefs } from './schema'
import { resolvers } from './resolvers'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })
const app = express()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const NODE_ENV = process.env.NODE_ENV || 'development'

// Middleware
app.use(cors({
  origin: NODE_ENV === 'production' ? false : 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())
app.use(passport.initialize())

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

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
)

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user as any
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
    
    // Redirect to frontend with token
    const redirectUrl = NODE_ENV === 'production' 
      ? `/?token=${token}`
      : `http://localhost:3000/?token=${token}`
    
    res.redirect(redirectUrl)
  }
)

app.get('/auth/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ success: true })
})

// Apollo Server setup
const server = new ApolloServer({
  typeDefs,
  resolvers,
})

async function startServer() {
  await server.start()

  // GraphQL middleware with context
  app.post('/graphql', bodyParser.json(), async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    let user = null
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any
        user = await prisma.user.findUnique({
          where: { id: decoded.sub }
        })
      } catch (error) {
        console.error('JWT verification failed:', error)
      }
    }

    const context = { user, prisma }
    
    try {
      const response = await server.executeOperation({
        query: req.body.query,
        variables: req.body.variables,
        operationName: req.body.operationName
      }, { contextValue: context })
      
      res.json(response.body)
    } catch (error) {
      console.error('GraphQL execution error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Serve static files in production
  if (NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')))
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/dist/index.html'))
    })
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`)
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`)
  })
}

startServer().catch(console.error)
