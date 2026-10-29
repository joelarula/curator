import AjvModule, { type ErrorObject } from 'ajv';
import { CuratorNodeType, type CuratorAstNode } from './CuratorAst.js';

const Ajv = (AjvModule as any).default || AjvModule;

export const CURRENT_AST_VERSION = 1 as const;

export const AST_LIMITS = {
  maxDepth: 32,
  maxNodes: 1000,
  maxLoopIterations: 1000,
  maxSerializedBytes: 512 * 1024,
} as const;

const baseProperties = {
  astVersion: { type: 'integer', enum: [1] },
  exclude_from_history: { type: 'boolean' },
  scheduledAt: { type: 'string', minLength: 1 },
  priority: { type: 'number' },
  onError: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' },
  entryAction: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' },
  exitAction: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' },
  onTimeout: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' },
};

/** Subroutine reference: 'script', 'script#sub' or '#sub'. */
const REF_PATTERN = '^(?:#[A-Za-z_][A-Za-z0-9_]*|[A-Za-z0-9_.:-]+(?:#[A-Za-z_][A-Za-z0-9_]*)?)$';
/** Guarded graph transitions, checked in order (Curator_Graph edges and conditional start). */
const GRAPH_TRANSITIONS = { type: 'array', minItems: 1, items: { type: 'object', properties: { to: { type: 'string', minLength: 1 }, when: { type: 'string', minLength: 1 } }, required: ['to'], additionalProperties: false } };
const REF_RE = new RegExp(REF_PATTERN);

export interface CuratorRef {
  /** Script name; undefined for local ('#sub') refs. */
  script?: string;
  /** Subroutine name; undefined means the module's `main`. */
  entry?: string;
}

/** Parses a subroutine reference. Returns null when the syntax is invalid. */
export function parseCuratorRef(ref: string): CuratorRef | null {
  if (typeof ref !== 'string' || !REF_RE.test(ref)) return null;
  const hash = ref.indexOf('#');
  if (hash === -1) return { script: ref };
  const script = ref.slice(0, hash) || undefined;
  return { script, entry: ref.slice(hash + 1) };
}

/** Node types that cannot appear in an inline-expanded subroutine body. */
const INLINE_FORBIDDEN = new Set([
  CuratorNodeType.WaitEvent,
  CuratorNodeType.HumanInput,
  CuratorNodeType.Subscribe,
  CuratorNodeType.Unsubscribe,
  CuratorNodeType.Interrupt,
  CuratorNodeType.ActorRef,
]);

const schema: Record<string, any> = {
  $id: 'https://curator.local/schemas/curator-ast-v1.json',
  type: 'object',
  discriminator: { propertyName: 'type' },
  oneOf: [
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Agent' }, agentName: { type: 'string', minLength: 1 }, model: { type: 'string', minLength: 1 }, instruction: { type: 'string' }, prompt: { type: 'string' }, include_contents: { type: 'string', enum: ['default', 'none'] }, history_from: { type: 'string', enum: ['default', 'conversation'] }, history_events: { type: 'array', items: { type: 'string', minLength: 1 } }, tools: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'array', items: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'object' }] } }] }, provider: { anyOf: [{ type: 'string', enum: ['gemini', 'local'] }, { type: 'string', pattern: '^\\$' }] }, baseUrl: { type: 'string', minLength: 1 }, input_schema: { type: 'object' }, output_schema: { type: 'object' }, as: { type: 'string' } },
      required: ['type'],
      anyOf: [{ required: ['agentName'] }, { required: ['prompt'] }],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { enum: ['Curator_Sequential', 'Curator_Parallel'] }, name: { type: 'string' }, prompt: { type: 'string' }, isolate: { type: 'boolean' }, subAgents: { type: 'array', minItems: 1, items: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } } },
      required: ['type', 'subAgents'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Join' }, name: { type: 'string' }, joinLogic: { type: 'string' }, nextNode: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      required: ['type'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Route' }, name: { type: 'string' }, router: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }, subAgents: { type: 'object', minProperties: 1, additionalProperties: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } }, defaultRoute: { type: 'string', minLength: 1 } },
      required: ['type', 'router', 'subAgents'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Graph' }, name: { type: 'string' }, startNode: { anyOf: [{ type: 'string', minLength: 1 }, GRAPH_TRANSITIONS] }, nodes: { type: 'object', minProperties: 1, additionalProperties: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } }, edges: { type: 'object', additionalProperties: { anyOf: [{ type: 'string' }, { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }, GRAPH_TRANSITIONS] } }, onEnter: { type: 'object', additionalProperties: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } }, onExit: { type: 'object', additionalProperties: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } }, stateKey: { type: 'string', minLength: 1 }, stateSchema: { type: 'string' } },
      required: ['type', 'startNode', 'nodes'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Loop' }, name: { type: 'string' }, prompt: { type: 'string' }, maxIterations: { type: 'integer', minimum: 1, maximum: AST_LIMITS.maxLoopIterations },       agent: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }, until: { type: 'string', minLength: 1 }, while: { type: 'string', minLength: 1 }, over: { type: 'string', minLength: 1 }, as: { type: 'string', minLength: 1 }, schedule: { type: 'string', minLength: 1 }, immediate: { type: 'boolean' } },
      required: ['type', 'agent'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Tool' }, toolName: { type: 'string', minLength: 1 }, args: { anyOf: [{ type: 'object' }, { type: 'string' }] }, parameters: { type: 'object' }, as: { type: 'string' }, outputKey: { type: 'string' }, spread: { type: 'boolean' }, approvalTtlMs: { type: 'integer', minimum: 0 }, onApprovalExpired: { type: 'string', enum: ['fail', 'continue'] } },
      required: ['type', 'toolName'],
      additionalProperties: false,
      anyOf: [{ required: ['args'] }, { required: ['parameters'] }, { not: { anyOf: [{ required: ['args'] }, { required: ['parameters'] }] } }],
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Reduce' }, reducer: { type: 'string', minLength: 1 }, args: { anyOf: [{ type: 'object' }, { type: 'string' }] }, as: { type: 'string' }, spread: { type: 'boolean' } },
      required: ['type', 'reducer'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Script' }, language: { type: 'string', enum: ['javascript', 'coffeescript'] }, code: { type: 'string', minLength: 1 } },
      required: ['type', 'language', 'code'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        ...baseProperties,
        type: { const: 'Curator_HumanInput' },
        name: { type: 'string' },
        prompt: { type: 'string', minLength: 1 },
        inputType: { type: 'string', enum: ['text', 'choices', 'file'] },
        choices: {
          oneOf: [
            { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object' }] } },
            { type: 'string' }
          ]
        },
        targetUserId: { type: 'integer' },
        as: { type: 'string' },
        blocking: { type: 'boolean' },
        timeoutSeconds: { type: 'number' }
      },
      required: ['type', 'prompt'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_AgentRef' }, agentName: { type: 'string', minLength: 1 } },
      required: ['type', 'agentName'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_ActorRef' }, actor: { type: 'string', minLength: 1 }, kind: { type: 'string', minLength: 1 }, handlers: { type: 'object', minProperties: 1, additionalProperties: { type: 'string', pattern: REF_PATTERN } }, args: { type: 'object' }, as: { type: 'string' } },
      required: ['type', 'actor', 'handlers'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_SetState' }, state: { anyOf: [{ type: 'object' }, { type: 'string' }] } },
      required: ['type', 'state'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_EmitEvent' }, eventName: { type: 'string', minLength: 1 }, targetAgentId: { anyOf: [{ type: 'integer' }, { type: 'string' }] }, payload: {} },
      required: ['type', 'eventName'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_EmitEvents' }, events: { type: 'string', minLength: 1 } },
      required: ['type', 'events'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_WaitEvent' }, eventName: { type: 'string', minLength: 1 }, eventNames: { type: 'array', items: { type: 'string', minLength: 1 } }, payloadAlias: { type: 'string' }, timeoutSeconds: { type: 'number' }, replay: { type: 'boolean' } },
      required: ['type', 'eventName'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Assign' }, key: { type: 'string', minLength: 1 }, expression: { type: 'string', minLength: 1 } },
      required: ['type', 'key', 'expression'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_IfElse' }, condition: { type: 'string', minLength: 1 }, thenBranch: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }, elseBranch: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      required: ['type', 'condition', 'thenBranch'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_While' }, condition: { type: 'string', minLength: 1 }, body: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      required: ['type', 'condition', 'body'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_ForEach' }, collectionExpression: { type: 'string', minLength: 1 }, iteratorName: { type: 'string' }, body: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      required: ['type', 'collectionExpression', 'body'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Interrupt' }, priority: { type: 'number', minimum: 1 }, mode: { type: 'string', enum: ['stop', 'pause', 'play'] }, cancelBelowPriority: { type: 'number' }, handler: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }, resume: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      required: ['type', 'priority'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        ...baseProperties,
        type: { const: 'Curator_Module' },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        params: { type: 'object' },
        config: { type: 'object' },
        main: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' },
        subroutines: {
          type: 'object',
          propertyNames: { pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
          additionalProperties: {
            type: 'object',
            properties: { params: { type: 'object' }, body: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }, returns: { type: 'string' }, description: { type: 'string' } },
            required: ['body'],
            additionalProperties: false,
          },
        },
        subscriptions: { type: 'array', items: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      },
      required: ['type', 'name'],
      anyOf: [{ required: ['main'] }, { required: ['subroutines'] }],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Call' }, ref: { type: 'string', pattern: REF_PATTERN }, args: { type: 'object' }, as: { type: 'string' }, mode: { type: 'string', enum: ['child', 'inline'] } },
      required: ['type', 'ref'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Subscribe' }, eventName: { type: 'string', minLength: 1 }, handler: { type: 'string', pattern: REF_PATTERN }, as: { type: 'string' }, when: { type: 'string' }, scope: { type: 'string', enum: ['conversation', 'project'] } },
      required: ['type', 'eventName', 'handler'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Unsubscribe' }, eventName: { type: 'string', minLength: 1 }, handler: { type: 'string', pattern: REF_PATTERN } },
      required: ['type', 'eventName'],
      additionalProperties: false,
    },
  ],
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export interface AstValidationResult {
  valid: boolean;
  errors: string[];
  node?: CuratorAstNode;
}

function normalizeToolArgs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeToolArgs);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) normalized[key] = normalizeToolArgs(child);

  // Translate pipeline & MiniApp AST types into formal Curator_* types
  if (normalized.type === 'Sequence' && Array.isArray(normalized.steps)) {
    return {
      type: 'Curator_Sequential',
      name: (normalized.name as string) || (normalized.id as string) || 'sequence',
      subAgents: normalized.steps,
    };
  }

  if (normalized.type === 'ToolTask' || normalized.type === 'Tool') {
    return {
      type: 'Curator_Tool',
      toolName: (normalized.tool as string) || (normalized.toolName as string) || 'unknown_tool',
      args: (normalized.args as Record<string, any>) || (normalized.parameters as Record<string, any>) || {},
    };
  }

  if (normalized.type === 'ForEach') {
    return {
      type: 'Curator_ForEach',
      collectionExpression: (normalized.collection as string) || (normalized.collectionExpression as string) || '[]',
      iteratorName: (normalized.iterator as string) || (normalized.iteratorName as string) || 'item',
      body: normalized.body,
    };
  }

  if (normalized.type === 'Curator_Tool' && normalized.args === undefined && normalized.parameters !== undefined) {
    normalized.args = normalized.parameters;
    delete normalized.parameters;
  }
  return normalized;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors || []).map(error => `${error.instancePath || '/'} ${error.message || 'is invalid'}`);
}

/** Collects nodes of a subtree (not descending into nested modules). */
function collectNodes(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.type === 'string') {
    out.push(node);
    if (node.type === 'Curator_Module') return out;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(v => collectNodes(v, out));
    else if (value && typeof value === 'object') collectNodes(value, out);
  }
  return out;
}

/**
 * Inline calls are compile-time macros: every inline-called subroutine must be free of
 * suspending/side-channel nodes and child calls, and the local inline call graph must be acyclic.
 */
function validateInlineCalls(mod: any, path: string): string[] {
  const errors: string[] = [];
  const subs: Record<string, any> = mod.subroutines || {};
  const inlineEdges = new Map<string, string[]>();
  const inlineTargets = new Set<string>();

  const scopes: Array<[string, any]> = [['main', mod.main], ...Object.entries(subs).map(([n, s]) => [n, s.body] as [string, any])];
  for (const [scopeName, body] of scopes) {
    for (const n of collectNodes(body)) {
      if (n.type === 'Curator_Call' && n.mode === 'inline') {
        const target = parseCuratorRef(n.ref)?.entry;
        if (!target || parseCuratorRef(n.ref)?.script) continue;
        inlineTargets.add(target);
        inlineEdges.set(scopeName, [...(inlineEdges.get(scopeName) || []), target]);
      }
    }
  }

  for (const target of inlineTargets) {
    const body = subs[target]?.body;
    if (!body) continue;
    for (const n of collectNodes(body)) {
      if (INLINE_FORBIDDEN.has(n.type)) errors.push(`${path}/subroutines/${target} is called inline but contains ${n.type}`);
      if (n.type === 'Curator_Call' && n.mode !== 'inline') errors.push(`${path}/subroutines/${target} is called inline but contains a child Curator_Call`);
    }
  }

  const state = new Map<string, 0 | 1 | 2>(); // 0/undefined = new, 1 = visiting, 2 = done
  const visit = (name: string, trail: string[]) => {
    if (state.get(name) === 2) return;
    if (state.get(name) === 1) {
      errors.push(`${path} inline call cycle: ${[...trail, name].join(' -> ')}`);
      return;
    }
    state.set(name, 1);
    for (const next of inlineEdges.get(name) || []) visit(next, [...trail, name]);
    state.set(name, 2);
  };
  for (const name of inlineEdges.keys()) visit(name, []);
  return errors;
}

function validateReferences(root: any): string[] {
  const errors: string[] = [];
  const walk = (node: any, path: string, mod: any = null) => {
    if (node.type === 'Curator_Module') {
      const subs = node.subroutines || {};
      (node.subscriptions || []).forEach((s: any, i: number) => {
        if (s?.type !== 'Curator_Subscribe') errors.push(`${path}/subscriptions/${i} must be a Curator_Subscribe node`);
      });
      if (node.main) walk(node.main, `${path}/main`, node);
      for (const [name, sub] of Object.entries<any>(subs)) walk(sub.body, `${path}/subroutines/${name}/body`, node);
      (node.subscriptions || []).forEach((s: any, i: number) => s && typeof s === 'object' && walk(s, `${path}/subscriptions/${i}`, node));
      errors.push(...validateInlineCalls(node, path));
      return;
    }
    if (node.type === 'Curator_Call' || node.type === 'Curator_Subscribe' || node.type === 'Curator_Unsubscribe') {
      const refStr = node.type === 'Curator_Call' ? node.ref : node.handler;
      const parsed = refStr !== undefined ? parseCuratorRef(refStr) : null;
      // Local refs are checked only when the enclosing module is known; otherwise the runtime
      // resolves them against the Request's own Script.
      if (parsed && !parsed.script && mod && !(parsed.entry! in (mod.subroutines || {}))) {
        errors.push(`${path} references missing subroutine '${refStr}'`);
      }
      if (node.type === 'Curator_Call' && node.mode === 'inline' && parsed?.script) {
        errors.push(`${path} inline call must use a local ref ('#name'), got '${refStr}'`);
      }
    }
    if (node.type === 'Curator_ActorRef') {
      for (const [kind, handler] of Object.entries<any>(node.handlers || {})) {
        const parsed = parseCuratorRef(handler);
        if (!parsed) errors.push(`${path}/handlers/${kind} is not a valid ref '${handler}'`);
        else if (!parsed.script && mod && !(parsed.entry! in (mod.subroutines || {}))) errors.push(`${path}/handlers/${kind} references missing subroutine '${handler}'`);
      }
    }
    if (node.type === 'Curator_Route') {
      if (node.defaultRoute !== undefined && !(node.defaultRoute in node.subAgents)) errors.push(`${path}/defaultRoute references missing route '${node.defaultRoute}'`);
    }
    if (node.type === 'Curator_Graph') {
      for (const start of Array.isArray(node.startNode) ? node.startNode.map((t: any) => t?.to) : [node.startNode]) {
        if (start !== '__end__' && !(start in node.nodes)) errors.push(`${path}/startNode references missing graph node '${start}'`);
      }
      for (const [key, edge] of Object.entries(node.edges || {})) {
        if (!(key in node.nodes)) errors.push(`${path}/edges/${key} references missing graph node`);
        if (typeof edge === 'string' && edge !== '__end__' && !(edge in node.nodes)) errors.push(`${path}/edges/${key} targets missing graph node '${edge}'`);
        if (Array.isArray(edge)) edge.forEach((t: any, i: number) => {
          if (t?.to !== '__end__' && !(t?.to in node.nodes)) errors.push(`${path}/edges/${key}/${i} targets missing graph node '${t?.to}'`);
        });
      }
      for (const hook of ['onEnter', 'onExit'] as const) {
        for (const key of Object.keys(node[hook] || {})) {
          if (!(key in node.nodes)) errors.push(`${path}/${hook}/${key} references missing graph node`);
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) value.forEach((child, index) => child && typeof child === 'object' && typeof child.type === 'string' && walk(child, `${path}/${key}/${index}`, mod));
        else if (typeof (value as any).type === 'string') walk(value, `${path}/${key}`, mod);
        else Object.entries(value).forEach(([childKey, child]) => child && typeof child === 'object' && typeof (child as any).type === 'string' && walk(child, `${path}/${key}/${childKey}`, mod));
      }
    }
  };
  walk(root, '');
  return errors;
}

export function isCuratorAstNode(value: unknown): value is CuratorAstNode {
  return validateCuratorAst(value).valid;
}

export function validateCuratorAst(value: unknown): AstValidationResult {
  const normalizedValue = normalizeToolArgs(value);
  let serializedBytes: number;
  try {
    serializedBytes = Buffer.byteLength(JSON.stringify(normalizedValue));
  } catch {
    return { valid: false, errors: ['AST must be JSON serializable'] };
  }
  if (serializedBytes > AST_LIMITS.maxSerializedBytes) return { valid: false, errors: [`AST exceeds ${AST_LIMITS.maxSerializedBytes} serialized bytes`] };

  let nodeCount = 0;
  let tooDeep = false;
  const count = (node: any, depth: number) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') {
      nodeCount++;
      if (depth > AST_LIMITS.maxDepth) tooDeep = true;
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => count(item, depth + 1));
      else if (child && typeof child === 'object') count(child, depth + 1);
    }
  };
  count(normalizedValue, 0);
  if (nodeCount > AST_LIMITS.maxNodes) return { valid: false, errors: [`AST exceeds ${AST_LIMITS.maxNodes} nodes`] };
  if (tooDeep) return { valid: false, errors: [`AST exceeds maximum depth of ${AST_LIMITS.maxDepth}`] };
  if (!validateSchema(normalizedValue)) return { valid: false, errors: formatErrors(validateSchema.errors) };
  const referenceErrors = validateReferences(normalizedValue);
  if (referenceErrors.length) return { valid: false, errors: referenceErrors };
  return { valid: true, errors: [], node: normalizedValue as CuratorAstNode };
}

export function assertValidCuratorAst(value: unknown): asserts value is CuratorAstNode {
  const result = validateCuratorAst(value);
  if (!result.valid) throw new Error(`Invalid Curator AST: ${result.errors.join('; ')}`);
}

export function withCurrentAstVersion(value: CuratorAstNode): CuratorAstNode {
  return { ...value, astVersion: CURRENT_AST_VERSION };
}
