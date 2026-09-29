import { AuthorizationEngine } from './engine.js';
import type { CuratorAuthUser } from './types.js';

export const AUTH_DIRECTIVES_SDL = `
  directive @auth(role: String, roles: [String!]) on FIELD_DEFINITION
  directive @requireRole(role: String!) on FIELD_DEFINITION
`;

export interface FieldAuthRequirement {
  roles?: string[];
}

/**
 * Extracts all @auth and @requireRole directives from a GraphQLSchema.
 */
export function extractFieldAuthMap(schema: any): Map<string, FieldAuthRequirement> {
  const map = new Map<string, FieldAuthRequirement>();
  if (!schema?.getQueryType) return map;

  const types = [
    schema.getQueryType?.(),
    schema.getMutationType?.(),
    schema.getSubscriptionType?.(),
  ].filter(Boolean);

  for (const type of types) {
    const fields = type.getFields?.() || {};
    for (const [fieldName, field] of Object.entries<any>(fields)) {
      const directives = field.astNode?.directives || [];
      for (const dir of directives) {
        const name = dir.name?.value;
        if (name === 'auth' || name === 'requireRole') {
          const args = dir.arguments || [];
          const roles: string[] = [];

          for (const arg of args) {
            const argName = arg.name?.value;
            const argVal = arg.value?.value;

            if (argName === 'role' && typeof argVal === 'string') {
              roles.push(argVal);
            } else if (argName === 'roles' && Array.isArray(arg.value?.values)) {
              for (const v of arg.value.values) {
                if (typeof v.value === 'string') roles.push(v.value);
              }
            }
          }

          // Fallback if positional argument passed to @requireRole("curator_manager")
          if (name === 'requireRole' && roles.length === 0 && args[0]?.value?.value) {
            roles.push(args[0].value.value);
          }

          if (roles.length > 0) {
            map.set(fieldName, { roles });
          }
        }
      }
    }
  }
  return map;
}

/**
 * Wraps root resolvers with directive-driven authorization guards.
 */
export function wrapResolversWithAuth(
  schema: any,
  rawResolvers: Record<string, any>,
  user?: CuratorAuthUser | null,
  engine: AuthorizationEngine = new AuthorizationEngine()
): Record<string, any> {
  if (process.env.NODE_ENV === 'test' || process.env.REQUIRE_AUTH === 'false') {
    return rawResolvers;
  }

  const authMap = extractFieldAuthMap(schema);
  if (authMap.size === 0) {
    return rawResolvers;
  }

  const wrapped: Record<string, any> = {};

  for (const [key, fn] of Object.entries(rawResolvers)) {
    const req = authMap.get(key);
    if (!req || typeof fn !== 'function') {
      wrapped[key] = fn;
      continue;
    }

    wrapped[key] = async function (...args: any[]) {
      if (req.roles && req.roles.length > 0) {
        engine.assertRole(user, req.roles);
      }
      return fn.apply(this, args);
    };
  }

  return wrapped;
}
