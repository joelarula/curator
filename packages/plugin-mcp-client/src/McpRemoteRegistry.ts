import { defineTool, type CuratorTool } from '@curator/agent-server';
import { assertSecureUrl, createAuthFetch, type CuratorAuthProvider } from '@curator/auth-client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SERVER_NAME_PATTERN, accessLevelFromAnnotations, parseToolAlias, toolAlias, toolKey, type AccessLevel } from './naming.js';

type FetchLike = typeof fetch;

/** Structural subset of `AuthSessionManager` (@curator/auth-client). */
export interface McpClientAuth {
  provider(service: string): CuratorAuthProvider;
  serviceNames(): string[];
  addService?(name: string, service: { url: string; kind?: 'mcp' }): unknown;
}

/** What the registry needs from a running host (`CuratorHost` satisfies it). */
export interface McpRegistryHost {
  prisma: any;
  engine: {
    tools: Map<string, any>;
    registerTool(tool: CuratorTool): void;
    unregisterTool?(name: string): boolean;
    addToolResolver?(
      resolver: (name: string, scope: { projectId?: string | number | null }) => any,
      lister?: (scope: { projectId?: string | number | null }) => { name: string; tool: any }[]
    ): () => void;
  };
  events?: { broadcast(type: string, payload: any): void };
}

export interface McpRegistryOptions {
  /** Token source per server (`authService`); usually an `AuthSessionManager`. */
  auth?: McpClientAuth;
  /** Projects whose servers every project may use (default `['system']`). */
  sharedProjectIds?: string[];
  /** Access level for tools without read-only/destructive annotations (default `elevated`: approval-gated). */
  unannotatedAccessLevel?: AccessLevel;
  /** Roles every synced remote tool is granted to (ToolRole), e.g. the role of an agent that uses them. Must exist. */
  toolRoles?: string[];
  clientInfo?: { name: string; version: string };
  fetch?: FetchLike;
  /** Backoff of `tryConnect` after failed attempts: `minSeconds` (default 5) doubling up to `maxSeconds` (default 300). */
  retry?: { minSeconds?: number; maxSeconds?: number };
  /** Overrides the transport (tests, other transports); receives the auth-wrapped fetch. */
  createTransport?(server: McpServerRecord, fetchImpl: FetchLike): Transport;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface McpServerRecord {
  id: number;
  projectId: string;
  name: string;
  url: string;
  transport: string;
  authService: string | null;
  status: string;
  enabled: boolean;
  /** Declarations stored with the server (`McpServer.expectations`). */
  expect?: McpServerExpectations;
}

/** A remote tool declared before the server is reached. */
export interface McpToolExpectation {
  /** Roles granted the tool (ToolRole), replacing `toolRoles` for it; grants not listed are revoked. */
  roles?: string[];
  /** Access level owned by the declaration: wins over annotations and is reapplied on every register. */
  accessLevel?: AccessLevel;
  description?: string;
}

/**
 * What a server is expected to provide. Declared items get catalog rows at register time (existent=false
 * until a sync sees them), so roles and permissions exist before the first connection.
 */
export interface McpServerExpectations {
  tools?: Record<string, McpToolExpectation>;
  /** Resource URIs or URI templates. */
  resources?: string[];
  prompts?: string[];
  /** Undeclared items of a declared kind (tools, resources, prompts) are not imported. */
  strict?: boolean;
}

export interface RegisterMcpServerInput {
  projectId: string;
  name: string;
  url: string;
  /** Auth service name; defaults to none (unauthenticated server). */
  authService?: string | null;
  createdBy?: string;
  /** Connect and sync the catalog right away (default true). */
  sync?: boolean;
  /** Declared tools, resources and prompts, stored with the server (`null` clears; omitted keeps them). */
  expect?: McpServerExpectations | null;
}

/** Names per kind, for declared items the server did not list and undeclared ones a strict sync left out. */
export interface McpCatalogNames {
  tools: string[];
  resources: string[];
  prompts: string[];
}

export interface McpSyncResult {
  server: string;
  projectId: string;
  status: string;
  tools: number;
  resources: number;
  resourceTemplates: number;
  prompts: number;
  removed: { tools: number; resources: number; prompts: number };
  /** Declared but not listed by the server (their rows stay existent=false). */
  missing: McpCatalogNames;
  /** Listed by the server but not declared, left out by a strict declaration. */
  skipped: McpCatalogNames;
}

/** Outcome of one `tryConnect` attempt, as data for workflows (never thrown). */
export interface McpConnectResult {
  server: string;
  projectId: string;
  /** `connected`, `auth_required`, `error`, or `gone` when the server is no longer registered. */
  status: string;
  error?: string;
  /** Remote tools after a successful sync. */
  tools?: number;
  /** Declared items the server did not list, after a successful sync. */
  missing?: McpCatalogNames;
  /** Suggested delay before the next attempt after an `error`. */
  retryInSeconds?: number;
}

/** A server's status changed (`connected`, `error`, `auth_required`, ...); `error` is its last error. */
export interface McpStatusChange {
  projectId: string;
  server: string;
  status: string;
  previous: string;
  error?: string | null;
}

export interface RegisterMcpServerResult {
  server: McpServerRecord;
  sync?: McpSyncResult;
  /** Set when the server was saved but could not be synced (e.g. `auth_required`). */
  error?: { code?: string; message: string };
}

const MAX_PAGES = 100;
const SYNC_DEBOUNCE_MS = 200;

/**
 * Remote MCP providers registered per project. The database is the catalog (McpServer, Tool with
 * origin='remote', McpResource, McpPrompt); the engine gets one tool per remote tool under its
 * project-qualified key, and workflows reach it as `mcp.<server>.<tool>` through a resolver.
 */
export class McpRemoteRegistry {
  private prisma: any;
  private engine!: McpRegistryHost['engine'];
  private events?: McpRegistryHost['events'];
  private readonly servers = new Map<number, McpServerRecord>();
  /** `${projectId}\0${alias}` → tool key */
  private readonly aliases = new Map<string, string>();
  private readonly connections = new Map<number, Promise<Client>>();
  private readonly syncTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly statusListeners = new Set<(change: McpStatusChange) => void>();
  /** Consecutive failed `tryConnect` attempts per server id (backoff). */
  private readonly failures = new Map<number, number>();
  /** Servers with a `tryConnect` attempt in flight; their status changes are part of the attempt. */
  private readonly connecting = new Set<number>();
  private detachResolver?: () => void;
  readonly sharedProjectIds: string[];

  constructor(private readonly options: McpRegistryOptions = {}) {
    this.sharedProjectIds = options.sharedProjectIds ?? ['system'];
  }

  /** Loads registered servers and their tools from the database (no network) and installs the alias resolver. */
  async attach(host: McpRegistryHost): Promise<void> {
    if (!host.prisma?.mcpServer) throw new Error('Database has no McpServer table; update the Curator schema');
    this.prisma = host.prisma;
    this.engine = host.engine;
    this.events = host.events;
    this.detachResolver?.();
    this.detachResolver = host.engine.addToolResolver?.(
      (name, scope) => this.resolveTool(name, scope.projectId),
      (scope) => this.listToolAliases(scope.projectId)
    );
    if (!this.detachResolver) this.log('warn', 'Engine has no addToolResolver: mcp.<server>.<tool> aliases will not resolve');

    const servers = await this.prisma.mcpServer.findMany({
      where: { existent: true, enabled: true },
      include: { tools: { where: { existent: true, origin: 'remote' } } },
    });
    for (const server of servers) {
      const record = this.remember(server);
      for (const row of server.tools) this.registerEngineTool(record, row);
    }
  }

  /** `mcp.<server>.<tool>` in the request's project first, then shared projects. */
  resolveTool(name: string, projectId?: string | number | null): CuratorTool | undefined {
    if (!parseToolAlias(name)) return undefined;
    for (const scope of this.scopes(projectId)) {
      const key = this.aliases.get(`${scope}\0${name}`);
      if (key) return this.engine.tools.get(key);
    }
    return undefined;
  }

  /** Aliases visible to a project (own first, then shared), for patterns like `mcp.google.*`. */
  listToolAliases(projectId?: string | number | null): { name: string; tool: CuratorTool }[] {
    const seen = new Map<string, { name: string; tool: CuratorTool }>();
    for (const scope of this.scopes(projectId)) {
      const prefix = `${scope}\0`;
      for (const [aliasKey, key] of this.aliases) {
        if (!aliasKey.startsWith(prefix)) continue;
        const alias = aliasKey.slice(prefix.length);
        const tool = this.engine.tools.get(key);
        if (tool && !seen.has(alias)) seen.set(alias, { name: alias, tool });
      }
    }
    return [...seen.values()];
  }

  async register(input: RegisterMcpServerInput): Promise<RegisterMcpServerResult> {
    this.requireAttached();
    if (!SERVER_NAME_PATTERN.test(input.name)) {
      throw new Error(`Invalid MCP server name "${input.name}": use letters, digits, "_" or "-" (max 63)`);
    }
    assertSecureUrl(input.url, 'MCP server URL');
    const where = { projectId_name: { projectId: input.projectId, name: input.name } };
    const existing = await this.prisma.mcpServer.findUnique({ where });
    const data = {
      url: input.url,
      authService: input.authService ?? null,
      enabled: true,
      existent: true,
      // `{}` rather than null: Prisma Json fields need DbNull for SQL NULL.
      ...(input.expect !== undefined ? { expectations: input.expect ?? {} } : {}),
    };
    const row = existing
      ? await this.prisma.mcpServer.update({ where, data: { ...data, status: existing.url === input.url ? existing.status : 'registered' } })
      : await this.prisma.mcpServer.create({
          data: { ...data, projectId: input.projectId, name: input.name, createdBy: input.createdBy ?? null },
        });
    if (existing && (existing.url !== input.url || existing.authService !== data.authService)) await this.disconnect(row.id);
    const record = this.remember(row);
    if (record.expect) await this.declareCatalog(record, record.expect);

    if (input.sync === false) return { server: record };
    try {
      return { server: this.servers.get(record.id) ?? record, sync: await this.sync(input.projectId, input.name) };
    } catch (err: any) {
      return { server: this.servers.get(record.id) ?? record, error: { code: err?.code, message: err?.message || String(err) } };
    }
  }

  /** Connects (if needed) and mirrors the server's tools, resources, templates and prompts into the database. */
  async sync(projectId: string, name: string): Promise<McpSyncResult> {
    const server = await this.loadServer(projectId, name);
    const client = await this.connect(server, { recordErrors: true });
    try {
      const capabilities = client.getServerCapabilities() ?? {};
      const tools = capabilities.tools ? await collect((cursor) => client.listTools({ cursor }), 'tools') : [];
      const resources = capabilities.resources ? await collect((cursor) => client.listResources({ cursor }), 'resources') : [];
      const templates = capabilities.resources
        ? await collect((cursor) => client.listResourceTemplates({ cursor }), 'resourceTemplates').catch(() => [])
        : [];
      const prompts = capabilities.prompts ? await collect((cursor) => client.listPrompts({ cursor }), 'prompts') : [];

      const expect = server.expect;
      const kept = {
        tools: keepDeclared(tools, (t) => t.name, expect?.tools && Object.keys(expect.tools), expect?.strict),
        resources: keepDeclared(resources, (r) => r.uri, expect?.resources, expect?.strict),
        templates: keepDeclared(templates, (r) => r.uriTemplate, expect?.resources, expect?.strict),
        prompts: keepDeclared(prompts, (p) => p.name, expect?.prompts, expect?.strict),
      };
      const removed = {
        tools: await this.syncTools(server, kept.tools.items),
        resources: await this.syncResources(server, kept.resources.items, kept.templates.items),
        prompts: await this.syncPrompts(server, kept.prompts.items),
      };
      const listedUris = [...resources.map((r) => r.uri), ...templates.map((r) => r.uriTemplate)];
      const missing: McpCatalogNames = {
        tools: Object.keys(expect?.tools ?? {}).filter((name) => !tools.some((t) => t.name === name)),
        resources: (expect?.resources ?? []).filter((uri) => !listedUris.includes(uri)),
        prompts: (expect?.prompts ?? []).filter((name) => !prompts.some((p) => p.name === name)),
      };
      const skipped: McpCatalogNames = {
        tools: kept.tools.skipped,
        resources: [...kept.resources.skipped, ...kept.templates.skipped],
        prompts: kept.prompts.skipped,
      };
      if (missing.tools.length) this.log('warn', `MCP server "${server.name}" does not list declared tools: ${missing.tools.join(', ')}`);
      const version = client.getServerVersion();
      await this.updateServer(server, {
        status: 'connected',
        lastError: null,
        lastSyncedAt: new Date(),
        serverInfo: { ...(version ?? {}), capabilities },
        instructions: client.getInstructions() ?? null,
      });
      return {
        server: server.name,
        projectId: server.projectId,
        status: 'connected',
        tools: kept.tools.items.length,
        resources: kept.resources.items.length,
        resourceTemplates: kept.templates.items.length,
        prompts: kept.prompts.items.length,
        removed,
        missing,
        skipped,
      };
    } catch (err) {
      throw await this.handleFailure(server, err, { recordErrors: true });
    }
  }

  /** Soft-removes a server: catalog rows become existent=false, engine tools are unregistered. */
  async unregister(projectId: string, name: string): Promise<void> {
    const server = await this.loadServer(projectId, name, { includeDisabled: true });
    await this.prisma.tool.updateMany({ where: { mcpServerId: server.id }, data: { existent: false } });
    await this.prisma.mcpResource.updateMany({ where: { mcpServerId: server.id }, data: { existent: false } });
    await this.prisma.mcpPrompt.updateMany({ where: { mcpServerId: server.id }, data: { existent: false } });
    await this.prisma.mcpServer.update({ where: { id: server.id }, data: { existent: false, enabled: false, status: 'disabled' } });
    this.unregisterServerTools(server.id);
    await this.disconnect(server.id);
    this.servers.delete(server.id);
  }

  /** Servers visible to a project (its own plus shared). */
  async list(projectId: string | number | null | undefined) {
    this.requireAttached();
    const rows = await this.prisma.mcpServer.findMany({
      where: { projectId: { in: this.scopes(projectId) }, existent: true },
      orderBy: [{ projectId: 'asc' }, { name: 'asc' }],
      include: {
        tools: { where: { existent: true }, select: { name: true, remoteName: true, accessLevel: true } },
        _count: { select: { resources: { where: { existent: true } }, prompts: { where: { existent: true } } } },
      },
    });
    return rows.map((row: any) => ({
      name: row.name,
      projectId: row.projectId,
      shared: this.sharedProjectIds.includes(row.projectId),
      url: row.url,
      status: row.status,
      enabled: row.enabled,
      authService: row.authService,
      lastError: row.lastError,
      lastSyncedAt: row.lastSyncedAt,
      tools: row.tools.map((t: any) => ({ alias: toolAlias(row.name, t.remoteName), key: t.name, accessLevel: t.accessLevel })),
      resources: row._count.resources,
      prompts: row._count.prompts,
    }));
  }

  /** Catalog from the database (no network): resources and URI templates of servers visible to the project. */
  async listResources(projectId: string | number | null | undefined, serverName?: string) {
    const servers = this.visibleServers(projectId, serverName);
    const rows = await this.prisma.mcpResource.findMany({
      where: { mcpServerId: { in: servers.map((s) => s.id) }, existent: true },
      orderBy: [{ mcpServerId: 'asc' }, { uri: 'asc' }],
    });
    const byId = new Map(servers.map((s) => [s.id, s.name]));
    return rows.map((r: any) => ({
      server: byId.get(r.mcpServerId),
      uri: r.uri,
      isTemplate: r.isTemplate,
      name: r.name,
      title: r.title,
      description: r.description,
      mimeType: r.mimeType,
    }));
  }

  async listPrompts(projectId: string | number | null | undefined, serverName?: string) {
    const servers = this.visibleServers(projectId, serverName);
    const rows = await this.prisma.mcpPrompt.findMany({
      where: { mcpServerId: { in: servers.map((s) => s.id) }, existent: true },
      orderBy: [{ mcpServerId: 'asc' }, { name: 'asc' }],
    });
    const byId = new Map(servers.map((s) => [s.id, s.name]));
    return rows.map((p: any) => ({ server: byId.get(p.mcpServerId), name: p.name, title: p.title, description: p.description, arguments: p.arguments }));
  }

  async readResource(projectId: string | number | null | undefined, serverName: string, uri: string) {
    const server = this.serverInScope(projectId, serverName);
    const client = await this.connect(server);
    try {
      return await client.readResource({ uri });
    } catch (err) {
      throw await this.handleFailure(server, err);
    }
  }

  async getPrompt(projectId: string | number | null | undefined, serverName: string, name: string, args?: Record<string, string>) {
    const server = this.serverInScope(projectId, serverName);
    const client = await this.connect(server);
    try {
      return await client.getPrompt({ name, arguments: args });
    } catch (err) {
      throw await this.handleFailure(server, err);
    }
  }

  /**
   * One connection attempt for workflows: syncs the server and reports the outcome instead of throwing.
   * After an `error` it suggests a backoff (`retryInSeconds`); `auth_required` waits for a sign-in instead.
   */
  async tryConnect(projectId: string, name: string): Promise<McpConnectResult> {
    let server: McpServerRecord;
    try {
      server = await this.loadServer(projectId, name);
    } catch (err: any) {
      return { server: name, projectId, status: 'gone', error: err?.message || String(err) };
    }
    this.connecting.add(server.id);
    try {
      const sync = await this.sync(projectId, name);
      this.failures.delete(server.id);
      return { server: name, projectId, status: 'connected', tools: sync.tools, missing: sync.missing };
    } catch (err: any) {
      const status = this.servers.get(server.id)?.status ?? 'error';
      const error = err?.message || String(err);
      if (status === 'auth_required') return { server: name, projectId, status, error };
      const failures = this.failures.get(server.id) ?? 0;
      this.failures.set(server.id, failures + 1);
      const { minSeconds = 5, maxSeconds = 300 } = this.options.retry ?? {};
      return { server: name, projectId, status: 'error', error, retryInSeconds: Math.min(maxSeconds, minSeconds * 2 ** failures) };
    } finally {
      this.connecting.delete(server.id);
    }
  }

  /** Whether a `tryConnect` attempt for this server is running (its status changes belong to the attempt). */
  isConnecting(projectId: string, name: string): boolean {
    for (const id of this.connecting) {
      const server = this.servers.get(id);
      if (server?.projectId === projectId && server.name === name) return true;
    }
    return false;
  }

  /** Whether this process holds a connection to the server (statuses loaded from the database may predate it). */
  isLive(projectId: string, name: string): boolean {
    for (const [id, server] of this.servers) {
      if (server.projectId === projectId && server.name === name && this.connections.has(id)) return true;
    }
    return false;
  }

  /** Current status of a server registered in `projectId` (from memory), or undefined when unknown. */
  statusOf(projectId: string, name: string): string | undefined {
    for (const server of this.servers.values()) {
      if (server.projectId === projectId && server.name === name && server.enabled) return server.status;
    }
    return undefined;
  }

  /** Notifies `listener` whenever a server's recorded status changes. Returns the unsubscribe function. */
  onStatus(listener: (change: McpStatusChange) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async close(): Promise<void> {
    for (const timer of this.syncTimers.values()) clearTimeout(timer);
    this.syncTimers.clear();
    await Promise.all([...this.connections.keys()].map((id) => this.disconnect(id)));
    this.detachResolver?.();
    this.detachResolver = undefined;
  }

  // ── catalog sync ──────────────────────────────────────────────────────────

  private async syncTools(server: McpServerRecord, tools: any[]): Promise<number> {
    const fallback = this.options.unannotatedAccessLevel ?? 'elevated';
    const declared = server.expect?.tools ?? {};
    const keys: string[] = [];
    for (const tool of tools) {
      const key = toolKey(server.projectId, server.name, tool.name);
      keys.push(key);
      const existing = await this.prisma.tool.findUnique({ where: { name: key } });
      if (existing && existing.origin !== 'remote') {
        throw new Error(`Tool "${key}" already exists as a local tool`);
      }
      const expected = declared[tool.name];
      const shared = {
        description: expected?.description ?? tool.description ?? tool.title ?? tool.name,
        origin: 'remote',
        mcpServerId: server.id,
        projectId: server.projectId,
        remoteName: tool.name,
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        annotations: tool.annotations ?? null,
        existent: true,
      };
      // Access level comes from the declaration, else once from annotations (a declared row that was never
      // synced has no inputSchema yet); afterwards it belongs to the admin.
      const firstSync = !existing || existing.inputSchema == null;
      const accessLevel: AccessLevel | undefined =
        expected?.accessLevel ?? (firstSync ? accessLevelFromAnnotations(tool.annotations, fallback) : undefined);
      const level = accessLevel ? { accessLevel, requiresConfirmation: accessLevel === 'destructive' } : {};
      const row = existing
        ? await this.prisma.tool.update({ where: { id: existing.id }, data: { ...shared, ...level } })
        : await this.prisma.tool.create({ data: { ...shared, ...level, name: key, version: '1.0.0' } });
      await this.grantExecutePermission(row);
      await this.grantToolRoles(row, expected?.roles);
      this.registerEngineTool(server, row);
    }

    const stale = await this.prisma.tool.findMany({
      where: { mcpServerId: server.id, existent: true, name: { notIn: keys } },
      select: { name: true, remoteName: true },
    });
    if (stale.length) {
      await this.prisma.tool.updateMany({ where: { name: { in: stale.map((t: any) => t.name) } }, data: { existent: false } });
      for (const t of stale) this.unregisterEngineTool(server, t.name, t.remoteName);
    }
    return stale.length;
  }

  private async syncResources(server: McpServerRecord, resources: any[], templates: any[]): Promise<number> {
    const entries = [
      ...resources.map((r) => ({ uri: r.uri, isTemplate: false, r })),
      ...templates.map((r) => ({ uri: r.uriTemplate, isTemplate: true, r })),
    ];
    for (const { uri, isTemplate, r } of entries) {
      const data = {
        isTemplate,
        name: r.name ?? uri,
        title: r.title ?? null,
        description: r.description ?? null,
        mimeType: r.mimeType ?? null,
        size: typeof r.size === 'number' ? r.size : null,
        annotations: r.annotations ?? null,
        existent: true,
      };
      await this.prisma.mcpResource.upsert({
        where: { mcpServerId_uri: { mcpServerId: server.id, uri } },
        update: data,
        create: { ...data, mcpServerId: server.id, uri },
      });
    }
    const { count } = await this.prisma.mcpResource.updateMany({
      where: { mcpServerId: server.id, existent: true, uri: { notIn: entries.map((e) => e.uri) } },
      data: { existent: false },
    });
    return count;
  }

  private async syncPrompts(server: McpServerRecord, prompts: any[]): Promise<number> {
    for (const p of prompts) {
      const data = { title: p.title ?? null, description: p.description ?? null, arguments: p.arguments ?? [], existent: true };
      await this.prisma.mcpPrompt.upsert({
        where: { mcpServerId_name: { mcpServerId: server.id, name: p.name } },
        update: data,
        create: { ...data, mcpServerId: server.id, name: p.name },
      });
    }
    const { count } = await this.prisma.mcpPrompt.updateMany({
      where: { mcpServerId: server.id, existent: true, name: { notIn: prompts.map((p) => p.name) } },
      data: { existent: false },
    });
    return count;
  }

  /** Mirrors the processor's RBAC seeding for databases with a Permission table (MariaDB/Postgres). */
  private async grantExecutePermission(row: any): Promise<void> {
    const prisma = this.prisma;
    if (!prisma.permission?.upsert || !prisma.rolePermission?.upsert) return;
    const name = `tool:${row.name}:execute`;
    const fields = { toolName: row.name, accessLevel: row.accessLevel, requiresConfirmation: row.requiresConfirmation };
    const permission = await prisma.permission.upsert({
      where: { name },
      update: fields,
      create: { ...fields, name, description: `Execute remote tool ${row.name}` },
    });
    const roles = ['Admin', ...(row.accessLevel === 'read_only' || row.accessLevel === 'safe_write' ? ['AgentWorker'] : [])];
    for (const roleName of roles) {
      const role = await prisma.role.findFirst({ where: { name: roleName } });
      if (!role) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  /** Grants `declared` roles exactly (others revoked) or, without a declaration, adds the `toolRoles`. */
  private async grantToolRoles(row: any, declared?: string[]): Promise<void> {
    const prisma = this.prisma;
    const roleNames = declared ?? this.options.toolRoles ?? [];
    if (!prisma.toolRole?.upsert || (!declared && !roleNames.length)) return;
    const roleIds: string[] = [];
    for (const roleName of roleNames) {
      const role = await prisma.role.findFirst({ where: { OR: [{ id: roleName }, { name: roleName }] } });
      if (!role) {
        this.log('warn', `Role "${roleName}" does not exist; remote tool ${row.name} not granted to it`);
        continue;
      }
      roleIds.push(role.id);
      await prisma.toolRole.upsert({
        where: { toolId_roleId: { toolId: row.id, roleId: role.id } },
        update: {},
        create: { toolId: row.id, roleId: role.id },
      });
    }
    if (declared) await prisma.toolRole.deleteMany({ where: { toolId: row.id, roleId: { notIn: roleIds } } });
  }

  /**
   * Catalog rows for declared tools, resources and prompts, before any connection: not-yet-seen items are
   * existent=false (not callable, not listed); declared tools get their access level and grants right away.
   */
  private async declareCatalog(server: McpServerRecord, expect: McpServerExpectations): Promise<void> {
    const fallback = this.options.unannotatedAccessLevel ?? 'elevated';
    for (const [remoteName, expected] of Object.entries(expect.tools ?? {})) {
      const key = toolKey(server.projectId, server.name, remoteName);
      const existing = await this.prisma.tool.findUnique({ where: { name: key } });
      if (existing && existing.origin !== 'remote') throw new Error(`Tool "${key}" already exists as a local tool`);
      const level = expected?.accessLevel
        ? { accessLevel: expected.accessLevel, requiresConfirmation: expected.accessLevel === 'destructive' }
        : {};
      const row = existing
        ? await this.prisma.tool.update({
            where: { id: existing.id },
            data: { ...level, ...(expected?.description ? { description: expected.description } : {}) },
          })
        : await this.prisma.tool.create({
            data: {
              accessLevel: fallback,
              requiresConfirmation: fallback === 'destructive',
              ...level,
              name: key,
              version: '1.0.0',
              description: expected?.description ?? remoteName,
              origin: 'remote',
              mcpServerId: server.id,
              projectId: server.projectId,
              remoteName,
              existent: false,
            },
          });
      await this.grantExecutePermission(row);
      await this.grantToolRoles(row, expected?.roles);
    }
    for (const uri of expect.resources ?? []) {
      await this.prisma.mcpResource.upsert({
        where: { mcpServerId_uri: { mcpServerId: server.id, uri } },
        update: {},
        create: { mcpServerId: server.id, uri, isTemplate: /\{[^}]+\}/.test(uri), name: uri, existent: false },
      });
    }
    for (const name of expect.prompts ?? []) {
      await this.prisma.mcpPrompt.upsert({
        where: { mcpServerId_name: { mcpServerId: server.id, name } },
        update: {},
        create: { mcpServerId: server.id, name, arguments: [], existent: false },
      });
    }
  }

  // ── engine registration ───────────────────────────────────────────────────

  private registerEngineTool(server: McpServerRecord, row: any): void {
    const remoteName: string = row.remoteName;
    const tool = defineTool({
      name: row.name,
      description: row.description ?? remoteName,
      parameters: row.inputSchema ?? { type: 'object', properties: {} },
      accessLevel: row.accessLevel,
      requiredRole: row.requiredRole ?? undefined,
      requiresConfirmation: row.requiresConfirmation,
      // Never re-exposed on Curator's own MCP server (avoids proxy loops).
      mcp: { expose: false },
      execute: (args: Record<string, unknown>, ctx: any) => this.callTool(server.id, remoteName, args, ctx?.projectId),
    });
    Object.assign(tool, { origin: 'remote', mcpServer: server.name, remoteName });
    this.engine.registerTool(tool);
    this.aliases.set(`${server.projectId}\0${toolAlias(server.name, remoteName)}`, row.name);
  }

  private unregisterEngineTool(server: McpServerRecord, key: string, remoteName: string): void {
    if (this.engine.unregisterTool) this.engine.unregisterTool(key);
    else this.engine.tools.delete(key);
    this.aliases.delete(`${server.projectId}\0${toolAlias(server.name, remoteName)}`);
  }

  private unregisterServerTools(serverId: number): void {
    const server = this.servers.get(serverId);
    if (!server) return;
    for (const [aliasKey, key] of [...this.aliases]) {
      const tool = this.engine.tools.get(key);
      if (tool?.mcpServer === server.name && aliasKey.startsWith(`${server.projectId}\0`)) {
        this.unregisterEngineTool(server, key, tool.remoteName);
      }
    }
  }

  // ── calls & connections ───────────────────────────────────────────────────

  private async callTool(serverId: number, remoteName: string, args: Record<string, unknown>, projectId?: string | number | null) {
    const server = this.servers.get(serverId);
    if (!server || !server.enabled) throw new Error(`MCP server for tool "${remoteName}" is not available`);
    this.assertScope(server, projectId);
    const client = await this.connect(server);
    let result: any;
    try {
      result = await client.callTool({ name: remoteName, arguments: args ?? {} });
    } catch (err: any) {
      // An unreachable server is a lost connection (status `error`, connector flows reconnect it), not a tool error.
      const unreachable = err?.message === 'fetch failed' || !!err?.cause?.code;
      if (unreachable) await this.disconnect(server.id);
      throw await this.handleFailure(server, err, { recordErrors: unreachable });
    }
    return toToolOutput(result, `${server.name}.${remoteName}`);
  }

  private connect(server: McpServerRecord, opts: { recordErrors?: boolean } = {}): Promise<Client> {
    let pending = this.connections.get(server.id);
    if (!pending) {
      pending = this.openClient(server);
      this.connections.set(server.id, pending);
      pending.catch(() => {
        if (this.connections.get(server.id) === pending) this.connections.delete(server.id);
      });
    }
    return pending.catch(async (err) => {
      throw await this.handleFailure(server, err, { recordErrors: opts.recordErrors ?? true });
    });
  }

  private async openClient(server: McpServerRecord): Promise<Client> {
    const baseFetch = this.options.fetch ?? fetch;
    const fetchImpl = server.authService ? createAuthFetch(this.authProviderFor(server), baseFetch) : baseFetch;
    const transport = this.options.createTransport
      ? this.options.createTransport(server, fetchImpl)
      : new StreamableHTTPClientTransport(new URL(server.url), { fetch: fetchImpl });
    const client = new Client(this.options.clientInfo ?? { name: 'curator', version: '1.0.0' }, { capabilities: {} });
    const resync = () => this.scheduleSync(server.id);
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => resync());
    client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => resync());
    client.setNotificationHandler(PromptListChangedNotificationSchema, async () => resync());
    client.onclose = () => {
      this.connections.delete(server.id);
    };
    await client.connect(transport);
    return client;
  }

  private authProviderFor(server: McpServerRecord): CuratorAuthProvider {
    const auth = this.options.auth;
    const service = server.authService!;
    if (!auth) {
      throw Object.assign(new Error(`MCP server "${server.name}" needs auth service "${service}" but no auth manager is configured`), {
        code: 'AUTH_REQUIRED',
        service,
      });
    }
    // Services not in auth.json are added with the server URL; their IdP is then discovered (RFC 9728).
    if (!auth.serviceNames().includes(service)) auth.addService?.(service, { url: server.url, kind: 'mcp' });
    return auth.provider(service);
  }

  private async disconnect(serverId: number): Promise<void> {
    const pending = this.connections.get(serverId);
    this.connections.delete(serverId);
    if (!pending) return;
    try {
      await (await pending).close();
    } catch {
      // already closed or never connected
    }
  }

  private scheduleSync(serverId: number): void {
    clearTimeout(this.syncTimers.get(serverId));
    const timer = setTimeout(() => {
      this.syncTimers.delete(serverId);
      const server = this.servers.get(serverId);
      if (!server) return;
      this.sync(server.projectId, server.name).catch((err) => this.log('warn', `Resync of MCP server "${server.name}" failed: ${err?.message || err}`));
    }, SYNC_DEBOUNCE_MS);
    timer.unref?.();
    this.syncTimers.set(serverId, timer);
  }

  /**
   * Normalizes failures: missing/rejected tokens become AUTH_REQUIRED errors (server status
   * `auth_required`, `auth:required` broadcast for REPLs); connection failures mark the server `error`.
   */
  private async handleFailure(server: McpServerRecord, err: any, opts: { recordErrors?: boolean } = {}): Promise<Error> {
    if (err?.mcpHandled) return err;
    const authErr = findAuthError(err);
    if (authErr) {
      const service = server.authService ?? server.name;
      const out = Object.assign(new Error(authErr.message || `Authentication required for "${service}"`), {
        code: 'AUTH_REQUIRED',
        service,
        idp: authErr.idp,
        mcpHandled: true,
      });
      await this.updateServer(server, { status: 'auth_required', lastError: out.message });
      this.events?.broadcast('auth:required', { service, idp: authErr.idp, server: server.name, projectId: server.projectId });
      return out;
    }
    const out = err instanceof Error ? err : new Error(String(err));
    // Node's fetch reports every network failure as "fetch failed"; the cause names it (ECONNREFUSED, ...).
    const cause = out.cause as any;
    if (out.message === 'fetch failed' && cause) out.message = `fetch ${server.url} failed: ${cause.code || cause.message || cause}`;
    if (opts.recordErrors) await this.updateServer(server, { status: 'error', lastError: out.message });
    return Object.assign(out, { mcpHandled: true });
  }

  // ── records & scope ───────────────────────────────────────────────────────

  private remember(row: any): McpServerRecord {
    const record: McpServerRecord = {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      url: row.url,
      transport: row.transport,
      authService: row.authService ?? null,
      status: row.status,
      enabled: row.enabled !== false && row.existent !== false,
      expect: row.expectations ?? undefined,
    };
    this.servers.set(record.id, record);
    return record;
  }

  private async updateServer(server: McpServerRecord, data: Record<string, any>): Promise<void> {
    try {
      const previous = this.servers.get(server.id)?.status ?? server.status;
      const row = await this.prisma.mcpServer.update({ where: { id: server.id }, data });
      this.remember(row);
      if (row.status !== previous) this.notifyStatus({ projectId: row.projectId, server: row.name, status: row.status, previous, error: row.lastError });
    } catch (err: any) {
      this.log('warn', `Could not update MCP server "${server.name}": ${err?.message || err}`);
    }
  }

  private notifyStatus(change: McpStatusChange): void {
    for (const listener of this.statusListeners) {
      try {
        listener(change);
      } catch (err: any) {
        this.log('warn', `MCP status listener failed: ${err?.message || err}`);
      }
    }
  }

  private async loadServer(projectId: string, name: string, opts: { includeDisabled?: boolean } = {}): Promise<McpServerRecord> {
    this.requireAttached();
    const row = await this.prisma.mcpServer.findUnique({ where: { projectId_name: { projectId, name } } });
    if (!row || row.existent === false || (!opts.includeDisabled && !row.enabled)) {
      throw new Error(`MCP server "${name}" is not registered in project ${projectId}`);
    }
    return this.remember(row);
  }

  private scopes(projectId: string | number | null | undefined): string[] {
    const list = projectId !== undefined && projectId !== null && projectId !== '' ? [String(projectId)] : [];
    for (const shared of this.sharedProjectIds) if (!list.includes(shared)) list.push(shared);
    return list;
  }

  private visibleServers(projectId: string | number | null | undefined, serverName?: string): McpServerRecord[] {
    this.requireAttached();
    if (serverName) return [this.serverInScope(projectId, serverName)];
    const scopes = this.scopes(projectId);
    return [...this.servers.values()].filter((s) => s.enabled && scopes.includes(s.projectId));
  }

  /** A server by name as seen from a project: its own first, then shared. */
  private serverInScope(projectId: string | number | null | undefined, name: string): McpServerRecord {
    for (const scope of this.scopes(projectId)) {
      for (const server of this.servers.values()) {
        if (server.enabled && server.projectId === scope && server.name === name) return server;
      }
    }
    throw new Error(`MCP server "${name}" is not available in this project`);
  }

  /** Remote tools run only for requests of the owning project, or from a shared project. */
  private assertScope(server: McpServerRecord, projectId: string | number | null | undefined): void {
    if (this.sharedProjectIds.includes(server.projectId)) return;
    if (projectId !== undefined && projectId !== null && String(projectId) === server.projectId) return;
    throw new Error(`MCP server "${server.name}" belongs to another project`);
  }

  private requireAttached(): void {
    if (!this.prisma) throw new Error('McpRemoteRegistry is not attached to a host; call attach(host) first');
  }

  private log(level: 'warn' | 'error', message: string): void {
    (this.options.logger ?? console)[level](`[mcp-client] ${message}`);
  }
}

async function collect<K extends string>(
  page: (cursor?: string) => Promise<Record<K, any[]> & { nextCursor?: string }>,
  key: K
): Promise<any[]> {
  const items: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const result = await page(cursor);
    items.push(...(result[key] ?? []));
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return items;
}

/** With a strict declaration of this kind, only declared items are kept; the rest are reported as skipped. */
function keepDeclared<T>(items: T[], idOf: (item: T) => string, declared: string[] | undefined, strict?: boolean) {
  if (!strict || !declared) return { items, skipped: [] as string[] };
  const kept = items.filter((item) => declared.includes(idOf(item)));
  return { items: kept, skipped: items.filter((item) => !kept.includes(item)).map(idOf) };
}

function findAuthError(err: any): { message: string; idp?: string } | null {
  for (let e = err, depth = 0; e && depth < 6; e = e.cause, depth++) {
    if (e.code === 'AUTH_REQUIRED' || e.name === 'AuthRequiredError' || e.name === 'UnauthorizedError') {
      return { message: e.message, idp: e.idp };
    }
  }
  return null;
}

function textOf(content: any[] | undefined): string {
  return (content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n');
}

/** MCP call result → tool output: structured content, parsed JSON text, plain text, or the raw content list. */
export function toToolOutput(result: any, label: string): unknown {
  if ('toolResult' in (result ?? {})) return result.toolResult;
  if (result?.isError) throw new Error(`Remote tool ${label} failed: ${textOf(result.content) || 'unknown error'}`);
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const content: any[] = result?.content ?? [];
  if (content.length > 0 && content.every((c) => c?.type === 'text')) {
    const text = textOf(content);
    if (content.length === 1) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }
  return { content };
}
