# Database Setup and Management

## Prerequisites

- PostgreSQL 15 or higher
- pgvector extension

## Database Schema

The main table structure:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the vector store table
CREATE TABLE "VectorStore" (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(384),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Common Database Commands

### Reset Database

To completely reset the database:

```sql
-- Drop the table if it exists
DROP TABLE IF EXISTS "VectorStore";

-- Create the table fresh
CREATE TABLE "VectorStore" (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(384),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Query Examples

View all documents:
```sql
SELECT * FROM "VectorStore";
```

Count documents:
```sql
SELECT COUNT(*) FROM "VectorStore";
```

View documents with metadata:
```sql
SELECT id, content, metadata FROM "VectorStore";
```

Delete all documents:
```sql
DELETE FROM "VectorStore";
```

### Using with Prisma

Reset database using Prisma:
```bash
npx prisma db reset --force   # Resets the entire database
npx prisma migrate reset      # Resets and runs migrations
npx prisma generate          # Updates Prisma client
```

## Troubleshooting

If you encounter the "relation does not exist" error:
1. Drop the table: `DROP TABLE IF EXISTS "VectorStore";`
2. Run `npx prisma migrate reset`
3. Create the vector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
4. Run the table creation SQL

## Vector Operations

The table uses pgvector's `vector` type with 384 dimensions to match the `all-MiniLM-L6-v2` model.

Example vector similarity search:
```sql
SELECT content, embedding <-> '[...]'::vector AS distance
FROM "VectorStore"
ORDER BY distance
LIMIT 5;
```