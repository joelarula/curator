# Curator - PostgreSQL with pgvector, Prisma & Langchain

A complete setup for building AI-powered applications with vector similarity search using PostgreSQL (pgvector), Prisma ORM, and Langchain.

## Features

- 🐘 PostgreSQL 16 with pgvector extension
- 🔷 Prisma ORM with TypeScript support
- 🦜 Langchain integration for RAG applications
- 🐳 Docker Compose for easy setup
- 🔍 Vector similarity search support
- 📝 Type-safe database queries

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ and npm/yarn
- OpenAI API key (optional, for embeddings)

## Quick Start

### 1. Start the Database

```powershell
docker-compose up -d
```

### 2. Install Dependencies

```powershell
npm install
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update with your settings:

```powershell
cp .env.example .env
```

Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=your-api-key-here
```

### 4. Setup Prisma

Generate Prisma Client:
```powershell
npm run prisma:generate
```

Push the schema to database:
```powershell
npm run prisma:push
```

Or create migrations:
```powershell
npm run prisma:migrate
```

### 5. View Database (Optional)

Open Prisma Studio to explore your data:
```powershell
npm run prisma:studio
```

## Database Connection

- **Host**: localhost
- **Port**: 5432
- **Database**: curator
- **Username**: postgres
- **Password**: postgres

Connection string:
```
postgresql://postgres:postgres@localhost:5432/curator
```

## Project Structure

```
curator/
├── docker-compose.yml      # Docker setup
├── prisma/
│   └── schema.prisma       # Database schema with vector support
├── src/
│   ├── prisma-client.ts    # Prisma client with vector helpers
│   └── langchain-integration.ts  # Langchain + RAG examples
├── .env                    # Environment variables
└── package.json           # Dependencies
```

## Usage Examples

### Basic Prisma Usage

```typescript
import prisma from './src/prisma-client';

// Create a document
await prisma.document.create({
  data: {
    content: 'Your text here',
    metadata: { source: 'example' }
  }
});

// Query documents
const docs = await prisma.document.findMany();
```

### Vector Search with Prisma

```typescript
import { findSimilarDocuments } from './src/prisma-client';

// Find similar documents by embedding
const embedding = [0.1, 0.2, 0.3, ...]; // 1536 dimensions
const similar = await findSimilarDocuments(embedding, 5);
```

### Langchain Integration

```typescript
import { 
  addDocuments, 
  semanticSearch, 
  ragQuery 
} from './src/langchain-integration';

// Add documents to vector store
await addDocuments(
  ['Document 1', 'Document 2'],
  [{ source: 'web' }, { source: 'api' }]
);

// Semantic search
const results = await semanticSearch('your query', 5);

// RAG query
const answer = await ragQuery('What is pgvector?');
```

## Prisma Schema

The schema includes models for:
- **Document**: General documents with embeddings
- **ChatMessage**: Chat history storage
- **VectorStore**: Langchain-compatible vector store

All models support vector embeddings (1536 dimensions for OpenAI text-embedding-3-small).

## Vector Search Operations

The pgvector extension supports three distance operators:
- `<->` - L2 distance
- `<#>` - Inner product
- `<=>` - Cosine distance (recommended for similarity)

## Managing Docker

```powershell
# View logs
docker-compose logs -f

# Stop database
docker-compose down

# Stop and remove all data (WARNING: destructive)
docker-compose down -v

# Restart database
docker-compose restart
```

## Customization

- **Database credentials**: Edit `docker-compose.yml` environment variables
- **Schema**: Modify `prisma/schema.prisma` and run `npm run prisma:migrate`
- **Vector dimensions**: Update `vector(1536)` in schema to match your embedding model
- **Embedding model**: Change in `langchain-integration.ts`

## Troubleshooting

**Prisma can't connect to database:**
```powershell
# Check if database is running
docker-compose ps

# Check logs
docker-compose logs postgres
```

**Vector extension not found:**
```powershell
# Restart database to ensure init.sql runs
docker-compose down -v
docker-compose up -d
```

**TypeScript errors:**
```powershell
# Regenerate Prisma Client
npm run prisma:generate
```

## Resources

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Langchain Documentation](https://js.langchain.com/docs)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
