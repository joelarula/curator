# Consultant Module (Server)

Responsible for semantic search, RAG (Retrieval-Augmented Generation), and project suggestions.

## Components
- `consultant.schema.ts`: Defines `ConsultResult`, `RagResponse`, and search queries.
- `consultant.resolvers.ts`: Handles `consult` and `ragAgent` queries.
- `consultant.service.ts`: Orchestrates LLM generation and vector search.
- `langchain.ts`: Integration with LangChain for vector stores and embeddings.

## Features
- **Project Scoping**: Searches are performed within the `currentProject` scope if provided.
- **Project Suggestion**: If no project is selected, suggests relevant projects across the user's authorized accounts.
