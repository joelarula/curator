import AjvModule, { type ErrorObject } from 'ajv';
import type { CuratorAstNode } from './CuratorAst.js';

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
};

const schema: Record<string, any> = {
  $id: 'https://curator.local/schemas/curator-ast-v1.json',
  type: 'object',
  discriminator: { propertyName: 'type' },
  oneOf: [
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Agent' }, agentName: { type: 'string', minLength: 1 }, model: { type: 'string', minLength: 1 }, instruction: { type: 'string' }, prompt: { type: 'string' }, include_contents: { type: 'string', enum: ['default', 'none'] }, tools: { type: 'array', items: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'object' }] } }, provider: { type: 'string', enum: ['gemini', 'local'] }, baseUrl: { type: 'string', minLength: 1 }, input_schema: { type: 'object' }, output_schema: { type: 'object' } },
      required: ['type'],
      anyOf: [{ required: ['agentName'] }, { required: ['prompt'] }],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { enum: ['Curator_Sequential', 'Curator_Parallel'] }, name: { type: 'string' }, prompt: { type: 'string' }, subAgents: { type: 'array', minItems: 1, items: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } } },
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
      properties: { ...baseProperties, type: { const: 'Curator_Graph' }, name: { type: 'string' }, startNode: { type: 'string', minLength: 1 }, nodes: { type: 'object', minProperties: 1, additionalProperties: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } }, edges: { type: 'object', additionalProperties: { anyOf: [{ type: 'string' }, { $ref: 'https://curator.local/schemas/curator-ast-v1.json' }] } }, stateSchema: { type: 'string' } },
      required: ['type', 'startNode', 'nodes'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Loop' }, name: { type: 'string' }, prompt: { type: 'string' }, maxIterations: { type: 'integer', minimum: 1, maximum: AST_LIMITS.maxLoopIterations }, agent: { $ref: 'https://curator.local/schemas/curator-ast-v1.json' } },
      required: ['type', 'agent'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Tool' }, toolName: { type: 'string', minLength: 1 }, args: { type: 'object' }, parameters: { type: 'object' } },
      required: ['type', 'toolName'],
      additionalProperties: false,
      anyOf: [{ required: ['args'] }, { required: ['parameters'] }, { not: { anyOf: [{ required: ['args'] }, { required: ['parameters'] }] } }],
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_Script' }, language: { type: 'string', enum: ['javascript', 'coffeescript'] }, code: { type: 'string', minLength: 1 } },
      required: ['type', 'language', 'code'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { ...baseProperties, type: { const: 'Curator_HumanInput' }, name: { type: 'string' }, prompt: { type: 'string', minLength: 1 }, inputType: { type: 'string', enum: ['text', 'choices', 'file'] }, choices: { type: 'array', items: { type: 'string' } }, targetUserId: { type: 'integer' } },
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
      properties: { ...baseProperties, type: { const: 'Curator_SetState' }, state: { type: 'object' } },
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
      properties: { ...baseProperties, type: { const: 'Curator_WaitEvent' }, eventName: { type: 'string', minLength: 1 }, payloadAlias: { type: 'string' } },
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
  if (normalized.type === 'Curator_Tool' && normalized.args === undefined && normalized.parameters !== undefined) {
    normalized.args = normalized.parameters;
    delete normalized.parameters;
  }
  return normalized;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors || []).map(error => `${error.instancePath || '/'} ${error.message || 'is invalid'}`);
}

function validateReferences(root: any): string[] {
  const errors: string[] = [];
  const walk = (node: any, path: string) => {
    if (node.type === 'Curator_Route') {
      if (node.defaultRoute !== undefined && !(node.defaultRoute in node.subAgents)) errors.push(`${path}/defaultRoute references missing route '${node.defaultRoute}'`);
    }
    if (node.type === 'Curator_Graph') {
      if (!(node.startNode in node.nodes)) errors.push(`${path}/startNode references missing graph node '${node.startNode}'`);
      for (const [key, edge] of Object.entries(node.edges || {})) {
        if (!(key in node.nodes)) errors.push(`${path}/edges/${key} references missing graph node`);
        if (typeof edge === 'string' && edge !== '__end__' && !(edge in node.nodes)) errors.push(`${path}/edges/${key} targets missing graph node '${edge}'`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) value.forEach((child, index) => child && typeof child === 'object' && typeof child.type === 'string' && walk(child, `${path}/${key}/${index}`));
        else if (typeof (value as any).type === 'string') walk(value, `${path}/${key}`);
        else Object.entries(value).forEach(([childKey, child]) => child && typeof child === 'object' && typeof (child as any).type === 'string' && walk(child, `${path}/${key}/${childKey}`));
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
