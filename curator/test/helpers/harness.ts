import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { provisionSqliteDb } from '../../src/db/sqliteProvisioner.js';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.js';
import { compileCoffeeScriptToAST } from '../../src/engine/CoffeeVerbs.js';
import { saveScriptVersion } from '../../src/engine/ScriptRegistry.js';
import { defineTool } from '../../src/tools/CuratorTool.js';
import { LlmFactory } from '../../src/engine/llm/LlmFactory.js';
import type { ILlmProvider, LlmRequest, LlmResponse } from '../../src/engine/llm/ILlmProvider.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(here, '..', 'fixtures');

export const FIXED_NOW = Date.UTC(2100, 0, 1, 0, 0, 0);

export interface RecordedCall {
  tool: string;
  args: any;
}

/** Deterministic tool registry: every tool records its call and returns a canned value. */
export function makeFakeEngine(canned: Record<string, (args: any) => any>) {
  const calls: RecordedCall[] = [];
  const tools = new Map<string, any>();
  for (const [name, fn] of Object.entries(canned)) {
    tools.set(
      name,
      defineTool({
        name,
        description: `fake ${name}`,
        parameters: { type: 'object', properties: {}, additionalProperties: true },
        execute: async (args: any) => {
          calls.push({ tool: name, args });
          return fn(args);
        },
      } as any),
    );
  }
  return { engine: { tools }, calls };
}

const SCHEMA_PATH = path.resolve(here, '..', '..', 'prisma-sqlite', 'schema.prisma');

/** One prisma db push per schema version; every test copies the resulting file. */
async function ensureTemplateDb(): Promise<string> {
  const hash = createHash('sha1').update(readFileSync(SCHEMA_PATH)).digest('hex').slice(0, 12);
  const templatePath = path.join(tmpdir(), `curator-test-template-${hash}.db`);
  if (existsSync(templatePath) && statSync(templatePath).size > 0) return templatePath;

  const stagingDir = mkdtempSync(path.join(tmpdir(), 'curator-test-tpl-'));
  const stagingPath = path.join(stagingDir, 'template.db');
  const prisma = await provisionSqliteDb('template', true, { databasePath: stagingPath });
  await prisma.$disconnect();
  try {
    // Atomic publish so parallel test files never read a half-written template.
    copyFileSync(stagingPath, `${templatePath}.${process.pid}`);
    renameSync(`${templatePath}.${process.pid}`, templatePath);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  return templatePath;
}

/** Saved/restored around each env so tests never leak a provider into each other. */
const FACTORY_PROVIDERS: Map<string, any> = (LlmFactory as any).providers;

export type FakeLlmReply = string | { text?: string; toolCalls?: { name: string; args?: any }[] };
export type FakeLlmScript = FakeLlmReply[] | ((req: LlmRequest, callIndex: number) => FakeLlmReply);

/**
 * Deterministic LLM: replies come from a queue (consumed in order) or a function of the request.
 * Every request is recorded so tests can assert on prompts, history, tools and jsonOutput.
 */
export function makeFakeLlm(script: FakeLlmScript) {
  const requests: LlmRequest[] = [];
  const provider: ILlmProvider = {
    providerName: 'fake',
    async generateContent(req: LlmRequest): Promise<LlmResponse> {
      const index = requests.length;
      // Deep copy: the engine keeps mutating its messages array after the call.
      requests.push(JSON.parse(JSON.stringify(req)));
      const reply = typeof script === 'function' ? script(req, index) : script[index];
      if (reply === undefined) throw new Error(`FakeLlm: no scripted reply for call #${index + 1}`);
      if (typeof reply === 'string') return { text: reply, finishReason: 'stop' };
      const toolCalls = reply.toolCalls?.map((tc, i) => ({ id: `call_${index}_${i}`, name: tc.name, args: tc.args ?? {} }));
      return { text: reply.text ?? '', toolCalls, finishReason: toolCalls?.length ? 'tool_use' : 'stop' };
    },
  };
  return { provider, requests };
}

/**
 * In-process MCP server over a linked in-memory transport (no subprocess/network).
 * Returns the transport for createMcpPlugin and a log of the calls the server received.
 */
export async function startFakeMcpServer(
  tools: Record<string, { description?: string; inputSchema?: any; handler: (args: any) => string | { error: string } }>,
) {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

  const received: { name: string; args: any }[] = [];
  const server = new Server({ name: 'fake-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, t]) => ({
      name,
      description: t.description ?? name,
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    received.push({ name, args });
    const out = tools[name].handler(args);
    return typeof out === 'string'
      ? { content: [{ type: 'text', text: out }] }
      : { isError: true, content: [{ type: 'text', text: out.error }] };
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return { transport: clientTransport, received, close: () => server.close() };
}

export interface TestEnv {
  prisma: any;
  processor: CuratorRequestProcessor;
  conversationId: any;
  userId: any;
  calls: RecordedCall[];
  /** Install a fake LLM as the default ('gemini') provider; restored on cleanup. */
  useLlm: (script: FakeLlmScript) => { requests: LlmRequest[] };
  cleanup: () => Promise<void>;
}

export async function createEnv(
  name: string,
  canned: Record<string, (args: any) => any> = {},
  processorOptions: Record<string, any> = {},
): Promise<TestEnv> {
  const dir = mkdtempSync(path.join(tmpdir(), 'curator-test-'));
  const dbPath = path.join(dir, `${name}.db`);
  copyFileSync(await ensureTemplateDb(), dbPath);
  const prisma = await provisionSqliteDb(name, false, { databasePath: dbPath });
  const { engine, calls } = makeFakeEngine(canned);
  const processor = new CuratorRequestProcessor(prisma, { engine, now: () => FIXED_NOW, ...processorOptions } as any);

  const user = await prisma.user.create({ data: { name: 'Tester', email: 'tester@example.com' } });
  await prisma.role.create({ data: { id: 'admin', name: 'admin' } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: 'admin' } });
  const conversation = await prisma.conversation.create({ data: { userId: user.id } });

  const saved = new Map<string, any>();
  const useLlm = (script: FakeLlmScript) => {
    for (const key of ['gemini', 'openai-compatible']) if (!saved.has(key)) saved.set(key, FACTORY_PROVIDERS.get(key));
    const fake = makeFakeLlm(script);
    FACTORY_PROVIDERS.set('gemini', fake.provider);
    // 'local' (and any baseUrl) resolves to the openai-compatible entry; point it at the fake too.
    FACTORY_PROVIDERS.set('openai-compatible', fake.provider);
    return fake;
  };

  return {
    prisma,
    processor,
    conversationId: conversation.id,
    userId: user.id,
    calls,
    useLlm,
    cleanup: async () => {
      for (const [key, value] of saved) {
        if (value === undefined) FACTORY_PROVIDERS.delete(key);
        else FACTORY_PROVIDERS.set(key, value);
      }
      await prisma.$disconnect();
      // Windows may keep the SQLite handle briefly; a leftover temp dir must not fail the test.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    },
  };
}

export async function compileFixture(file: string, ctx: Record<string, any> = {}) {
  const src = readFileSync(path.join(FIXTURES_DIR, file), 'utf8');
  return compileCoffeeScriptToAST(src, ctx);
}

/** Submit an AST as a workflow Request and step it to completion/wait. */
export async function runAst(env: TestEnv, ast: any, data: Record<string, any> = {}) {
  const req = await env.prisma.request.create({
    data: {
      userId: env.userId,
      conversationId: env.conversationId,
      status: 'NEW',
      toolName: 'Curator_Workflow',
      ast,
      ...data,
    },
  });
  const result = await env.processor.stepUntil({ conversationId: env.conversationId });
  return { requestId: req.id, result };
}

/** Store a script as an immutable ScriptVersion (hash-idempotent). */
export async function saveScript(env: TestEnv, name: string, ast: any, extra: Record<string, any> = {}) {
  return saveScriptVersion(env.prisma, { name, ast, userId: env.userId, ...extra });
}

/** Run a stored script by reference (no AST snapshot on the Request), like the engine does for calls. */
export async function runScript(env: TestEnv, scriptId: number, version?: number, data: Record<string, any> = {}) {
  const req = await env.prisma.request.create({
    data: {
      userId: env.userId,
      conversationId: env.conversationId,
      status: 'NEW',
      toolName: 'Curator_Workflow',
      scriptId,
      scriptVersion: version,
      context: { astPath: '' },
      ...data,
    },
  });
  const result = await env.processor.stepUntil({ conversationId: env.conversationId });
  return { requestId: req.id, result };
}

/** Order-stable, id/time-free view of the rows a workflow produced. */
export async function snapshotDb(env: TestEnv) {
  const requests = await env.prisma.request.findMany({ where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } });
  const responses = await env.prisma.response.findMany({ where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } });

  const reqIds = new Map<any, string>(requests.map((r: any, i: number) => [r.id, `<req:${i + 1}>`]));
  const norm = (v: any): any => {
    if (v instanceof Date) return '<ts>';
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, norm(x)]));
    }
    return v;
  };
  const strip = (row: any, drop: string[]) => {
    const out: any = {};
    for (const [k, v] of Object.entries(row)) {
      if (drop.includes(k)) continue;
      out[k] = v;
    }
    return norm(out);
  };

  return {
    requests: requests.map((r: any) =>
      strip(
        {
          ...r,
          id: reqIds.get(r.id),
          parentId: r.parentId == null ? null : reqIds.get(r.parentId) ?? '<req:?>',
          notifyId: r.notifyId == null ? null : reqIds.get(r.notifyId) ?? '<req:?>',
        },
        ['createdAt', 'updatedAt', 'lockedAt', 'lockedBy', 'scheduledAt', 'userId', 'conversationId', 'scriptId', 'scriptVersion', 'eventCursor'],
      ),
    ),
    responses: responses.map((r: any, i: number) =>
      strip(
        { ...r, id: `<res:${i + 1}>`, requestId: r.requestId == null ? null : reqIds.get(r.requestId) ?? '<req:?>' },
        ['createdAt', 'updatedAt', 'userId', 'conversationId'],
      ),
    ),
  };
}

/** Compare against a committed golden JSON; UPDATE_SNAPSHOTS=1 rewrites it. */
export function assertGolden(file: string, actual: unknown) {
  const full = path.join(FIXTURES_DIR, file);
  const text = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(full)) {
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
    return;
  }
  assert.deepEqual(JSON.parse(text), JSON.parse(readFileSync(full, 'utf8')), `golden mismatch: ${file}`);
}
