# GraphQL API & Curator Bridge Reference

Curator MiniApps standardly use an Express server with `graphql` to provide a unified API schema for:
1. **Domain Data Operations**: Queries and mutations for app business logic.
2. **Curator Workflow Controls**: Real-time agent status, AST task execution status, and agent trigger mutations.

---

## 1. GraphQL Schema Template (`src/server/graphql.js`)

```javascript
import { buildSchema, graphql } from 'graphql';
import { provisionSqliteDb } from '@curator/agent-server';

const schema = buildSchema(`
  type Entity {
    id: ID!
    title: String!
    status: String!
    createdAt: String
  }

  type CuratorAgent {
    id: ID!
    name: String!
    ast: String
    schedule: String
    isActive: Boolean
    enabled: Boolean
  }

  type CuratorResponse {
    id: ID!
    requestId: ID!
    content: String
    createdAt: String
  }

  type CuratorRequest {
    id: ID!
    agentName: String
    ast: String
    createdAt: String
    responses: [CuratorResponse!]!
  }

  type Query {
    entities(search: String, limit: Int): [Entity!]!
    entity(id: ID!): Entity
    curatorAgents: [CuratorAgent!]!
    curatorRequests(limit: Int): [CuratorRequest!]!
  }

  type Mutation {
    createEntity(title: String!): Entity!
    triggerCuratorAgent(agentName: String!): CuratorRequest!
  }
`);

export function createResolvers({ db }) {
  return {
    async entities({ search, limit = 50 }) {
      const sql = search 
        ? `SELECT * FROM miniapp_entities WHERE title LIKE ? LIMIT ?` 
        : `SELECT * FROM miniapp_entities LIMIT ?`;
      const params = search ? [`%${search}%`, limit] : [limit];
      return db.prepare(sql).all(...params);
    },

    async entity({ id }) {
      return db.prepare('SELECT * FROM miniapp_entities WHERE id = ?').get(id);
    },

    async curatorAgents() {
      const curatorPrisma = await provisionSqliteDb(
        process.env.CURATOR_DATABASE_NAME ?? 'miniapp',
        false,
        { databasePath: process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db' }
      );
      return curatorPrisma.agent.findMany();
    },

    async curatorRequests({ limit = 20 }) {
      const curatorPrisma = await provisionSqliteDb(
        process.env.CURATOR_DATABASE_NAME ?? 'miniapp',
        false,
        { databasePath: process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db' }
      );
      return curatorPrisma.request.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { responses: true }
      });
    },

    async createEntity({ title }) {
      const res = await db.prepare('INSERT INTO miniapp_entities (title) VALUES (?)').run(title);
      return db.prepare('SELECT * FROM miniapp_entities WHERE id = ?').get(res.lastInsertRowid);
    },

    async triggerCuratorAgent({ agentName }) {
      const curatorPrisma = await provisionSqliteDb(
        process.env.CURATOR_DATABASE_NAME ?? 'miniapp',
        false,
        { databasePath: process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db' }
      );
      const agent = await curatorPrisma.agent.findUnique({ where: { name: agentName }, include: { script: true } });
      if (!agent) throw new Error(`Agent ${agentName} not found`);

      const request = await curatorPrisma.request.create({
        data: {
          scriptId: agent.scriptId,
          agentName: agent.name,
          ast: agent.script.ast,
          userId: agent.userId,
          projectId: agent.projectId
        }
      });
      return request;
    }
  };
}

export async function executeGraphQL({ db, query, variables }) {
  const rootValue = createResolvers({ db });
  return graphql({ schema, source: query, rootValue, variableValues: variables });
}
```

---

## 2. Express Server Integration (`src/server/index.js`)

```javascript
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDatabase } from '../db.js';
import { executeGraphQL } from './graphql.js';

const app = express();
const db = openDatabase();

app.use(express.json());

// GraphQL API HTTP Endpoint
app.post('/graphql', async (req, res) => {
  const { query, variables } = req.body;
  const result = await executeGraphQL({ db, query, variables });
  res.json(result);
});

// Serve Vue 3 Static Frontend
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, '../../web-dist')));

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`[MiniApp] Server running at http://localhost:${port}`);
});
```
