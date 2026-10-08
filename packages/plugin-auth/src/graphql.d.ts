import { AuthorizationEngine } from './engine.js';
import type { CuratorAuthUser } from './types.js';
export declare const AUTH_DIRECTIVES_SDL = "\n  directive @auth(role: String, roles: [String!]) on FIELD_DEFINITION\n  directive @requireRole(role: String!) on FIELD_DEFINITION\n";
export interface FieldAuthRequirement {
    roles?: string[];
}
/**
 * Extracts all @auth and @requireRole directives from a GraphQLSchema.
 */
export declare function extractFieldAuthMap(schema: any): Map<string, FieldAuthRequirement>;
/**
 * Wraps root resolvers with directive-driven authorization guards.
 */
export declare function wrapResolversWithAuth(schema: any, rawResolvers: Record<string, any>, user?: CuratorAuthUser | null, engine?: AuthorizationEngine): Record<string, any>;
//# sourceMappingURL=graphql.d.ts.map