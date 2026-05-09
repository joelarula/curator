# User Module (Server)

Responsible for user authentication, account management, and role-based access control.

## Components
- `user.schema.ts`: Defines `User`, `Account`, `Operator`, and `Role` GraphQL types.
- `user.resolvers.ts`: Handles authentication queries (`me`) and mutations (`logout`).
- `auth.service.ts`: Core logic for passport strategies and token management.

## Integration
- Regsiter resolvers in `server/resolvers/index.ts`.
- Register schema in `server/schema/index.ts`.
