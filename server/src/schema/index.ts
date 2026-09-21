import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { gql } from 'graphql-tag';

/**
 * schema/index.ts
 *
 * GraphQL SDL type definitions for the Curator knowledge platform.
 * The SDL source of truth lives in schema.graphql -- edit that file directly.
 *
 * Architecture overview:
 *   Resource -- Core identity node. Every piece of knowledge is anchored to a
 *               Resource with a unique URI (and optional URL). Resources have
 *               integer primary keys for triple-join performance.
 *   Text     -- Content layer. A Resource can have many Text records with
 *               different roles (MAIN, SUMMARY, TRANSCRIPT).
 *   Relation -- RDF triple: subject -> predicate -> object. All three positions
 *               reference Resource nodes (including predicates like rdf:type).
 *   Request  -- Queued agentic request (status lifecycle: NEW->WAITING->COMPLETED/FAILED).
 *   Response -- AI response with parsed Relations and raw tool call output.
 *   Agent    -- Polling agent with schedule and prompt template.
 *
 * All queries and mutations require a valid Bearer JWT (Google OAuth).
 */
const sdl = readFileSync(
  fileURLToPath(new URL('./schema.graphql', import.meta.url)),
  'utf-8'
);

export const typeDefs = gql(sdl);