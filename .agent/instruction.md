# Project Instructions

This file contains instructions for AI agents working on this project.

## Project Overview
- **Name:** padagaskar
- **Description:** Online rhetoric analysis and fact checking AI RAG tool for textual data.

## Coding Standards
- we use typescript for the project
- we use prisma for database
- we use express for web server
- we use vue + vuetify for web frontend
- we use commander for command line interface
- we use graphql for api
- we use https://github.com/joelarula/curator for example of high level modules  and architecture
- curator is located in local file system  at C:\Users\joela\dev\curator 

## Project Structure
- **Root**: Coordinates the environment (Docker Compose).
- **`server/` module**:
    - Prisma database management.
    - GraphQL Express server.
    - Commander CLI.
    - Own `package.json`.
- **`frontend/` module**:
    - Vue + Vuetify web application.
    - Own `package.json`.

## Prisma Usage
Go to the `server/` directory and use the following commands:
- `npm run prisma:generate` - Regenerate Prisma Client after schema changes.
- `npm run prisma:migrate` - Create and apply migrations to the database.
- `npm run prisma:studio` - Open a GUI to view and edit data.
- All database operations are configured via `server/.env`.

## Data Model Architecture
- **Central Generic Entity (`Text`)**: All content (user uploads, context materials, and AI reports) are stored as `Text`. This ensures social features (ratings, comments) and analysis (tagging, feature indexing) are uniform across the platform.
- **Organizational Hub (`Topic`)**: Coordinates an analysis mission. Each topic has one `primaryText`, multiple `contextTexts` (for RAG), and multiple `AnalyzeRequests`.
- **Granular RAG (`Chunk`)**: Instead of storing embeddings on the total text, content is broken into `Chunk` entities. Each chunk tracks its position (`selectionStart`/`selectionEnd`) and is linked to the specific embedding `AIModel` used.
- **Taxonomy & Features**: `Taxonomy` provides a hierarchical classification (e.g., "Logical Fallacies"). `TextFeature` defines analytical markers within these taxonomies. Feature descriptions are themselves `Text` entities.
- **Fact-Checking Specifics (`Claim`)**: Reports are broken down into individual `Claim` entities. Each claim includes the original claim text and a **refutation or explanation**, which is itself a `Text` entity. Claims are linked to specific `Chunk` evidence and assigned truth/certainty values.
- **Prompt Management**: `PromptVersion` tracks the specific system instructions used for an analysis, ensuring long-term auditability and reproducibility.
- **Quotas & Notifications**: `UserQuota` manages server costs per user. `Notification` provides in-app alerts for completed analyses.
- **Aggregated Metrics**: Reports include `AnalysisMetric` scores (e.g., "Ethics Index", "Bias Score"). The justification for each score is its own `Text` entity, allowing for granular feedback on overall ratings.
- **Legal & Compliance**:
    - **RBAC**: Admin, Moderator, and User roles.
    - **Consent**: Granular `UserConsent` (Copyright, AI processing, etc.) linked to specific requests.
    - **Transparency**: Mandatory AI labeling and model tracking (EU AI Act).
    - **Moderation**: "Notice & Action" system (`ModerationReport`) for DSA compliance.
    - **Auditability**: `AuditLog` captures all legally relevant actions.
- **Privacy & Lifecycle**: 
    - Soft-delete using the `existent` (DateTime?) field.
    - `removeTextAfterReport` flag for automated cleanup of sensitive source materials.

## Workflows
- [Add specific workflows or command instructions here]


## Authentication
- we use google auth as set  up in [curator](C:\Users\joela\dev\curator )

