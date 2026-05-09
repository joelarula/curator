# Project Module (Server)

Responsible for managing projects, file uploads, and multi-tenant isolation.

## Components
- `project.schema.ts`: Defines `Project`, `FileData`, and `FileInput` GraphQL types.
- `project.resolvers.ts`: Handles project CRUD and file upload mutations.
- `fileoperations.ts`: Utility for saving and removing files from storage.
- `projects.ts`: Core service for project database operations.

## RBAC & Multi-tenancy
- All project operations must be scoped to the `activeAccountId` in the context.
- Mutations require `WRITE` access.
