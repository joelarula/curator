import { shareStateProjectors } from './ConversationStateLog.js';

/**
 * `context.state` is a working copy of the conversation state: `evaluateExpression` rebuilds it from the
 * event-sourced live view each time, so it is never stored. Keys that exist only in a request (a resumed
 * request's `contextPatch`) are stored under `STATE_PATCH_KEY` instead and merged back when it is rebuilt.
 */
export const STATE_PATCH_KEY = '__statePatch';

const REQUEST_WRITES = ['create', 'update', 'updateMany', 'upsert', 'createMany'] as const;

function withoutState(context: any): any {
  if (!context || typeof context !== 'object' || Array.isArray(context) || !('state' in context)) return context;
  const { state: _copy, ...rest } = context;
  return rest;
}

function stripData(data: any): any {
  if (Array.isArray(data)) return data.map(stripData);
  if (!data || typeof data !== 'object' || !('context' in data)) return data;
  return { ...data, context: withoutState(data.context) };
}

/** Wraps a Prisma client so Request writes drop the `context.state` copy (a client without `$extends` is returned as is). */
export function withoutStoredStateCopies<T>(prisma: T): T {
  const client: any = prisma;
  if (typeof client?.$extends !== 'function') return prisma;
  const query: Record<string, (params: { args: any; query: (args: any) => Promise<any> }) => Promise<any>> = {};
  for (const op of REQUEST_WRITES) {
    query[op] = ({ args, query: run }) => {
      if (op === 'upsert') return run({ ...args, create: stripData(args.create), update: stripData(args.update) });
      return run({ ...args, data: stripData(args.data) });
    };
  }
  const extended = client.$extends({ query: { request: query } });
  // Same database: state written through either client reaches the same projectors
  shareStateProjectors(client, extended);
  return extended;
}
