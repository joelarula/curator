# Curator Graph Architecture

## Overview

Curator leverages a powerful and flexible Knowledge Graph Schema, a combination of an RDF triplestore backing architecture and formal structural constraints.

When you combine **OWL** (for defining the domain vocabulary and meaning) with **SHACL** (for enforcing structural constraints), you are essentially creating a formal, machine-actionable **Knowledge Graph Schema**.

We frequently refer to this model as a **Semantic Schema** or **Semantic Data Model**.

## Semantic Schema Engine

The core logic mapping our relational SQLite database to this Semantic Schema is handled by the `SemanticSchemaEngine` (located in `src/services/SemanticSchemaEngine.ts`).

### The Triplestore (OWL Conceptual Model)
At the base level, the database consists of generic models that define our ontology:
- **Resources**: Nodes in the graph (e.g., a specific User, Article, or a property class).
- **Relations**: Edges connecting subject nodes to object nodes, or subjects to literal data (e.g., Strings, Booleans, Integers).

### The Constraints (SHACL Application Profile)
Rather than defining standard relational tables like `User`, `Article`, etc., we define formal **SemanticNodeShapes** (located in `src/semantic/`). 

These shapes dictate the "how"—the structural validation. When you ask the `SemanticSchemaEngine` to create a `schema:Article`, it uses the `ArticleShape` to ensure:
- Required relationships exist (e.g., `schema:headline` has a minCount of 1).
- Datatypes match (e.g., `xsd:string`).
- Links resolve to appropriate shapes (e.g., `schema:author` must point to a valid `schema:Person`).

## Why not a Traditional ERD?

While traditional ERDs (Entity-Relationship Diagrams) are excellent for planning physical database tables, our model is often described as a **Conceptual Schema** or **Domain Model**.

- **Traditional ERD**: Focuses on storage (Primary Keys, Foreign Keys, Normalization).
- **Our Semantic Model**: Focuses on intent and usage (what a "User" means, what relationships they must have to be valid, and how they connect to other concepts).

By utilizing a Semantic Schema, the database is highly dynamic, evolving naturally alongside the data without requiring constant Prisma schema migrations for every new business object. This represents true Model-Driven Development within the Semantic Web stack.
