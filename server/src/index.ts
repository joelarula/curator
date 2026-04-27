import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import { setupAuth, getUserFromToken } from './auth/index.js';
import { WikiService } from './services/WikiService.js';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 4000;

async function startServer() {
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [
            ApolloServerPluginLandingPageLocalDefault({ footer: false }),
        ],
    });

    await server.start();

    // Global Middlewares
    app.use(cors());
    app.use(cookieParser());

    // Setup Auth
    setupAuth(app as any, prisma);

    // GraphQL middleware
    app.use('/graphql',
        express.json({ limit: '50mb' }),
        (req, res, next) => {
            // Apollo Server 4 expressMiddleware requires req.body to be set
            if (req.body === undefined) req.body = {};
            next();
        },
        expressMiddleware(server, {
            context: async ({ req }: { req: any }) => {
                const token = req.headers.authorization?.replace('Bearer ', '') 
                    || (req.query?.token as string)
                    || '';
                const user = await getUserFromToken(token, prisma);
                return { 
                    user, 
                    prisma,
                    wiki: new WikiService(prisma) 
                };
            }
        }) as any
    );

    app.listen(PORT, () => {
        console.log(`🚀 Server ready at http://localhost:${PORT}`);
        console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    });
}

startServer().catch((error) => {
    console.error('Error starting server:', error);
});
