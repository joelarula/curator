/**
 * Node handler contract: one module per AST node type, dispatched by `NodeRegistry`.
 * A handler only touches the engine through `NodeContext`, so it can be tested with a fake context
 * and registered by plugins without editing `CuratorRequestProcessor`.
 */

/** Engine primitives a node handler may use. Implemented by `CuratorRequestProcessor`. */
export interface NodeContext {
  prisma: any;
  /** Clock (epoch ms) used for scheduling and deadlines. */
  now(): number;
  emit(type: string, payload: any): void;
  saveResponse(req: any, content: string): Promise<void>;
  completeRequest(requestId: number, status?: string, skipNotify?: boolean): Promise<void>;
  /** Creates a validated child Request that notifies `req`, and parks `req` until it completes. */
  spawnChildAndParkParent(req: any, childData: Record<string, any>, parentContextUpdates?: Record<string, any>, parentStatus?: 'WAITING' | 'NEW'): Promise<void>;
  /** Creates a Request after validating its AST (pins the executing script version). */
  createRequest(args: { data: Record<string, any> }): Promise<any>;
  /** Resolves a node's `scheduledAt` ('in 5 minutes' or ISO) against the clock. */
  resolveScheduledAt(node: any): Date | undefined;
  parseContext(ctx: any): any;
  isDynamicExpr(v: unknown): v is string;
  evaluateExpression(expr: string, req: any): Promise<any>;
  evaluateArgs(args: Record<string, any> | undefined, req: any, literalArgs?: boolean): Promise<Record<string, any>>;
  /** Conversation state; with `scope`, shared state overlaid with that private bucket. */
  readState(conversationId: any, scope?: string | null): Promise<Record<string, any>>;
  writeState(conversationId: any, scope: string | null | undefined, updates: Record<string, any>): Promise<void>;
}

export interface NodeHandler<N = any> {
  /** AST `type` discriminator, e.g. 'Curator_SetState'. Plugin types must not start with 'Curator_'. */
  type: string;
  run(node: N, req: any, ctx: NodeContext): Promise<void>;
  /** Extra validation for plugin node types (built-ins are covered by the AST schema). Returns error messages. */
  validate?(node: N): string[];
}

/** Engine state a maintenance system may use. */
export interface MaintenanceContext {
  prisma: any;
  now(): number;
  emit(type: string, payload: any): void;
}

/** A pass run in order at the start of every poll tick (like a Bevy system in a fixed schedule). */
export interface MaintenanceSystem {
  name: string;
  run(ctx: MaintenanceContext): Promise<void>;
}
