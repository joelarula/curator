# Agent Instructions for Curator

Welcome, Agent. This document provides the essential context and patterns required to work effectively on the **Curator** project.

## Key Architectural Decisions

- **Modular Architecture**: The project is split into high-level logical modules (`User`, `Project`, `Consultant`).
  - **Server Modularity**: Located in `server/modules/[name]/`. Each folder contains its own schema, resolvers, and services.
  - **Client Modularity**: Located in `client/src/modules/[name]/`. Each folder contains components and local state.
  - **Model Modularity**: `prisma/schema.prisma` is organized by module-specific comments.
- **Module READMEs**: Every module folder MUST contain a `README.md` file providing specific context and instructions for AI agents working on that module.
- **Phased Workflow**: Development follows the **Model -> Server -> UI** order.
  1. Define database changes in `schema.prisma`.
  2. Implement GraphQL schema, resolvers, and business logic in the server module.
  3. Build components and UI logic in the client module.
- **Vector Database**: PostgreSQL with `pgvector` for semantic search.
- **Authentication**: JWT-based session management with Google OAuth.
- **Multi-tenancy**: All project and AI operations are scoped to an `Account` via `accountId`.

## Technology Stack
- **Backend**: Node.js, Express, Apollo Server 4 (GraphQL), Passport.js (Google OAuth + JWT).
- **Frontend**: Vue 3, Vite, Vuetify 3, Apollo Client.
- **Database**: PostgreSQL with `pgvector` extension.
- **ORM**: Prisma with support for vector columns.
- **AI/ML**: LangChain, HuggingFace Transformers (Xenova), Google Generative AI.

## Core Architecture Patterns

### 1. GraphQL Layer
The API is entirely GraphQL-based.
- **Schema**: Defined in `server/schema/index.ts`.
- **Resolvers**: Located in `server/resolvers/`. They are split into `queries/` and `mutations/`.
- **Context**: The GraphQL context contains the `user` (if authenticated) and the `prisma` client.

### 2. Database & ORM
Prisma is used for all database interactions.
- **Schema**: `prisma/schema.prisma`.
- **Vector Support**: We use `Unsupported("vector(384)")` for vector columns (specifically for `xenova_all_minilm_l6_v2`).
- **Migrations**: Use `npm run prisma:migrate` for development changes.

### 3. Authentication
- **Flow**: Google OAuth -> JWT issued -> JWT sent in `Authorization: Bearer <token>` header.
- **Passport**: Configured in `server/index.ts`.
- **User Model**: Managed by Prisma.

### 4. AI & RAG (Retrieval-Augmented Generation)
- **Embeddings**: Generated using HuggingFace Transformers (in-process) or external providers via LangChain.
- **Vector Search**: Performed using raw SQL queries via Prisma (since Prisma doesn't natively support vector similarity operators yet in all versions, check `server/service.ts` or `server/langchain.ts` for patterns).
- **LangChain**: Logic lives in `server/langchain.ts`.

## Development Workflows

### How to Add a New Feature
1.  **Database**: Update `prisma/schema.prisma` if needed. Run `npm run prisma:migrate`.
2.  **GraphQL Schema**: Add types, queries, or mutations to `server/schema/index.ts`.
3.  **Resolvers**: Create a new resolver in `server/resolvers/queries/` or `server/resolvers/mutations/`.
4.  **Index**: Register the resolver in `server/resolvers/index.ts`.
5.  **Service/Logic**: Add core logic to `server/service.ts` or a new service file.
6.  **Frontend**: Update/add Vue components in `client/src/`. Use Apollo composables (`useQuery`, `useMutation`).

### Running the Project
- **Dev Mode**: `npm run dev` (runs both server and client concurrently).
- **Prisma Studio**: `npm run prisma:studio`.

### Common Commands
- `npm run prisma:generate`: Regenerate Prisma client.
- `npm run prisma:push`: Fast sync schema to DB (for prototyping).

## Best Practices
- **Type Safety**: Use TypeScript everywhere. Ensure Prisma models are correctly typed.
- **Error Handling**: Use the patterns in `server/errors.ts`.
- **Security**: Always check the `user` object in the GraphQL context for authorized operations.
- **Performance**: Be mindful of vector search performance and large file uploads.
