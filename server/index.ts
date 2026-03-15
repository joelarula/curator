import express from 'express'
import { ApolloServer } from '@apollo/server'
import cors from 'cors'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import path from 'path'
import { typeDefs } from './schema/index'
import { resolvers } from './resolvers/index'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { setupAuth, getUserFromToken } from './modules/user/auth'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })
const app = express()
const PORT = process.env.PORT || 4000
const NODE_ENV = process.env.NODE_ENV || 'development'

// Middleware
app.use(cors({
  origin: NODE_ENV === 'production' ? false : 'http://localhost:3000',
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(cookieParser())

// Setup Modular Auth
setupAuth(app)

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
    const user = await getUserFromToken(token || '')
    const context = { user, prisma }

    try {
      const response = await server.executeOperation({
        query: req.body.query,
        variables: req.body.variables,
        operationName: req.body.operationName
      }, { contextValue: context })

      // Apollo Server 4 wraps response in body.kind and body.singleResult
      if (response.body.kind === 'single') {
        res.json(response.body.singleResult)
      } else {
        res.json(response.body)
      }
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
