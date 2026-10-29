import {
  CuratorNodeType,
  type CuratorAstNode,
  type CuratorSequentialNode,
  type CuratorAssignNode,
  type CuratorIfElseNode,
  type CuratorWhileNode,
  type CuratorLoopNode,
  type CuratorForEachNode,
  type CuratorAgentNode,
  type CuratorEmitEventNode,
  type CuratorSetStateNode,
  type CuratorHumanInputNode,
  type CuratorChoiceItem,
  type CuratorParallelNode,
  type CuratorScriptNode,
  type CuratorWaitEventNode,
  type CuratorToolNode,
  type CuratorReduceNode,
  type CuratorEmitEventsNode,
  type CuratorModuleNode,
  type CuratorSubroutine,
  type CuratorParamSpec,
  type CuratorCallNode,
  type CuratorSubscribeNode,
  type CuratorUnsubscribeNode,
  type CuratorGraphNode,
  type CuratorGraphTransition,
  type CuratorActorRefNode,
} from '../CuratorAst.js';
import {
  toVarName,
  type TypedPathProxy,
  createContextProxy,
  createCallbackContextProxy,
  isPathProxy,
  containsPathProxy,
  not,
  and,
  or,
  eq,
} from './CuratorProxy.js';

export { CuratorNodeType, toVarName, createContextProxy, createCallbackContextProxy, isPathProxy, type TypedPathProxy };

/**
 * Converts a string (e.g. 'PokerAgent', 'poker-agent', 'poker_agent') to camelCase.
 */
export function toCamelCase(str?: string): string {
  if (!str) return '';
  return str
    .replace(/[-_]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Recursively serializes JavaScript functions to `(${fn.toString()})(context)` for AST runtime evaluation,
 * or resolves callbacks that return `TypedPathProxy` trees directly into declarative AST paths.
 */
export function serializeClosure(val: any, defaultRoot = '$context'): any {
  if (isPathProxy(val)) {
    return String(val);
  }
  if (typeof val === 'function') {
    try {
      const probe = val(createCallbackContextProxy(defaultRoot));
      if (isPathProxy(probe)) {
        return String(probe);
      }
      if (
        probe &&
        typeof probe === 'object' &&
        containsPathProxy(probe) &&
        !val.toString().includes('randomUUID') &&
        !val.toString().includes('Date.')
      ) {
        return serializeClosure(probe, defaultRoot);
      }
    } catch (_) {
      // Fall back to runtime closure serialization
    }
    return `(${val.toString()})(context)`;
  }
  if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp) && !(val instanceof Date)) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeClosure(v, defaultRoot);
    }
    return res;
  }
  return val;
}

export function serializeExpr(expr: unknown, defaultRoot = '$context'): string {
  if (isPathProxy(expr)) return String(expr);
  if (typeof expr === 'function') {
    try {
      const probe = (expr as (c: any) => unknown)(createCallbackContextProxy(defaultRoot));
      if (isPathProxy(probe)) return String(probe);
    } catch (_) {
      // Fall back to runtime closure serialization
    }
    return `(${expr.toString()})(context)`;
  }
  return String(expr);
}

export interface ActiveModuleScope {
  name: string;
  subroutines: Record<string, CuratorSubroutine>;
  subscriptions: CuratorSubscribeNode[];
  params?: Record<string, CuratorParamSpec>;
  description?: string;
}

let activeModuleScope: ActiveModuleScope | null = null;

export function getActiveModuleScope(): ActiveModuleScope | null {
  return activeModuleScope;
}

/**
 * Normalizes a builder, node, or array of steps into a CuratorAstNode (or undefined if empty).
 */
export function resolveBuilderNode(branch: any): CuratorAstNode | undefined {
  if (!branch || (Array.isArray(branch) && branch.length === 0)) return undefined;
  if (Array.isArray(branch)) {
    return CuratorCoreBuilder.seq(...branch);
  }
  return typeof branch.build === 'function' ? branch.build() : branch;
}

/**
 * Normalizes an array or record of subroutine definitions / TypedSubroutines into a plain map.
 */
function normalizeSubroutinesMap(
  subroutines?: Record<string, CuratorSubroutine | TypedSubroutine> | TypedSubroutine[]
): Record<string, CuratorSubroutine> {
  const map: Record<string, CuratorSubroutine> = {};
  if (Array.isArray(subroutines)) {
    for (const subItem of subroutines) {
      const subName = subItem.subroutineName || subItem.name;
      map[subName] = subItem.definition;
    }
  } else if (subroutines) {
    for (const [key, val] of Object.entries(subroutines)) {
      map[key] = (val && typeof val === 'function' && 'definition' in val)
        ? (val as TypedSubroutine).definition
        : (val as CuratorSubroutine);
    }
  }
  return map;
}

/**
 * Core AST Node Factory for primitive computational and workflow verbs.
 */
export class CuratorCoreBuilder {
  static readonly NodeType = CuratorNodeType;

  /**
   * Evaluates an expression and assigns it to a key in `context.state`.
   * e.g. .assign('state.turn', (ctx) => ctx.state.turn + 1)
   */
  static assign(key: string | TypedPathProxy<any> | any, expression: string | TypedPathProxy<any> | ((ctx: any) => any)): CuratorAssignNode {
    const cleanKey = toVarName(key) || String(key);
    const exprStr = serializeExpr(expression);
    return { type: CuratorNodeType.Assign, key: cleanKey, expression: exprStr };
  }

  /**
   * If the condition expression evaluates to true, executes `thenBranch`, else optionally executes `elseBranch`.
   * Automatically wraps arrays of steps into a sequential node.
   */
  static ifElse<TContext = any>(
    condition: string | TypedPathProxy<any> | ((ctx: TContext) => boolean),
    thenBranch: CuratorAstNode | CuratorAstNode[] | any,
    elseBranch?: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorIfElseNode {
    const condStr = serializeExpr(condition);
    const thenNode = resolveBuilderNode(thenBranch);
    const elseNode = resolveBuilderNode(elseBranch);
    if (!thenNode && elseNode) {
      return { type: CuratorNodeType.IfElse, condition: `not (${condStr})`, thenBranch: elseNode };
    }
    return {
      type: CuratorNodeType.IfElse,
      condition: condStr,
      thenBranch: thenNode!,
      elseBranch: elseNode,
    };
  }

  /**
   * Rust-inspired pattern matching construct (`match` / `switchCase`).
   * Eliminates nested if-else ladders by matching a target expression against arms.
   *
   * Features inspired by Rust:
   * - Wildcard `_` (also accepts 'default' and '*')
   * - Multi-pattern arms using `|`: `'EXIT | QUIT' => branch`
   * - Match guards using `if <cond>`: `'RESUME if hasGames' => branch`
   * - Tuple arm arrays: `[[pattern, branch, optionalGuard], ...]`
   *
   * Compiles down to an optimized, nested IfElse AST structure.
   */
  static match(
    targetOrArms:
      | string
      | TypedPathProxy<any>
      | Array<
        | { when: string | TypedPathProxy<any> | ((ctx: any) => boolean); then: CuratorAstNode | CuratorAstNode[] | any }
        | { pat: string; guard?: string | TypedPathProxy<any> | ((ctx: any) => boolean); then: CuratorAstNode | CuratorAstNode[] | any }
        | [string | TypedPathProxy<any>, CuratorAstNode | CuratorAstNode[] | any, (string | TypedPathProxy<any> | ((ctx: any) => boolean))?]
      >,
    armsOrDefault?:
      | Record<string, CuratorAstNode | CuratorAstNode[] | any>
      | Array<[string | TypedPathProxy<any>, CuratorAstNode | CuratorAstNode[] | any, (string | TypedPathProxy<any> | ((ctx: any) => boolean))?]>
      | CuratorAstNode
      | CuratorAstNode[]
      | any,
    defaultBranch?: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorAstNode {
    const resolveBranch = (b: any): CuratorAstNode | undefined => {
      if (!b) return undefined;
      if (Array.isArray(b)) {
        return CuratorCoreBuilder.seq(...b);
      }
      return typeof b.build === 'function' ? b.build() : b;
    };

    const isWildcard = (k: string) => k === '_' || k === 'default' || k === '*';

    const buildCondition = (rawTarget: string, patternKey: string, guard?: string | TypedPathProxy<any> | ((ctx: any) => boolean)): string => {
      let key = patternKey.trim();
      let inlineGuard: string | undefined = undefined;

      const ifIdx = key.indexOf(' if ');
      if (ifIdx !== -1) {
        inlineGuard = key.substring(ifIdx + 4).trim();
        key = key.substring(0, ifIdx).trim();
      }

      const subPatterns = key.split('|').map((s) => s.trim()).filter(Boolean);
      const patternConds = subPatterns.map((p) => {
        return `(${rawTarget}.id == '${p}' or ${rawTarget} == '${p}' or ${rawTarget}.value == '${p}')`;
      });

      const basePatternCond = patternConds.length === 1 ? patternConds[0] : `(${patternConds.join(' or ')})`;
      const effectiveGuard = guard ? serializeExpr(guard) : inlineGuard;

      if (effectiveGuard) {
        return `${basePatternCond} and (${effectiveGuard})`;
      }
      return basePatternCond;
    };

    if (Array.isArray(targetOrArms)) {
      const armList = targetOrArms;
      let currentElse: CuratorAstNode | undefined = resolveBranch(armsOrDefault ?? defaultBranch);

      for (let i = armList.length - 1; i >= 0; i--) {
        const arm = armList[i];
        if (Array.isArray(arm)) {
          const [pat, branch, guard] = arm;
          const pStr = String(pat);
          if (isWildcard(pStr)) {
            currentElse = resolveBranch(branch);
          } else {
            const cond = guard ? `(${pStr}) and (${serializeExpr(guard)})` : pStr;
            currentElse = CuratorCoreBuilder.ifElse(cond, branch, currentElse);
          }
        } else if ('when' in arm) {
          currentElse = CuratorCoreBuilder.ifElse(arm.when, arm.then, currentElse);
        } else if ('pat' in arm) {
          const cond = arm.guard ? `(${arm.pat}) and (${serializeExpr(arm.guard)})` : arm.pat;
          currentElse = CuratorCoreBuilder.ifElse(cond, arm.then, currentElse);
        }
      }
      return currentElse!;
    }

    const rawTarget = String(targetOrArms);

    if (Array.isArray(armsOrDefault)) {
      let currentElse: CuratorAstNode | undefined = resolveBranch(defaultBranch);
      for (let i = armsOrDefault.length - 1; i >= 0; i--) {
        const arm = armsOrDefault[i];
        if (Array.isArray(arm)) {
          const [pat, branch, guard] = arm;
          const pStr = String(pat);
          if (isWildcard(pStr)) {
            currentElse = resolveBranch(branch);
          } else {
            const cond = buildCondition(rawTarget, pStr, guard);
            currentElse = CuratorCoreBuilder.ifElse(cond, branch, currentElse);
          }
        }
      }
      return currentElse || resolveBranch(defaultBranch) || CuratorCoreBuilder.seq();
    }

    const cases = (armsOrDefault || {}) as Record<string, any>;
    const effectiveDefault = defaultBranch ?? cases['_'] ?? cases['default'] ?? cases['*'];
    const caseEntries = Object.entries(cases).filter(([k]) => !isWildcard(k));

    let currentElse: CuratorAstNode | undefined = resolveBranch(effectiveDefault);

    for (let i = caseEntries.length - 1; i >= 0; i--) {
      const [key, branch] = caseEntries[i];
      const cond = buildCondition(rawTarget, key);
      currentElse = CuratorCoreBuilder.ifElse(cond, branch, currentElse);
    }

    return currentElse || resolveBranch(effectiveDefault) || CuratorCoreBuilder.seq();
  }

  /**
   * Alias for `match`. Matches a target expression against arms or case mappings.
   */
  static switchCase = CuratorCoreBuilder.match;

  /**
   * While the condition evaluates to true, loop over the `body`.
   * Automatically wraps arrays of steps into a sequential node.
   */
  static loopwhile<TContext = any>(
    condition: string | TypedPathProxy<any> | ((ctx: TContext) => boolean),
    body: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorWhileNode {
    const condStr = serializeExpr(condition);
    return { type: CuratorNodeType.While, condition: condStr, body: resolveBuilderNode(body)! };
  }

  /**
   * Dispatch to the handler registered for the actor's kind (Bevy `register_agent_system`).
   * The handler subroutine receives the actor as `$params.actor`; its result lands under `as`.
   */
  static actorRef<TActor = any>(
    actor: string | TypedPathProxy<TActor> | any,
    handlers: Record<string, string | { ref: string }>,
    options: {
      kind?: string | TypedPathProxy<any> | ((actor: TypedPathProxy<TActor> & { $actor: any }) => string | TypedPathProxy<any>);
      args?: Record<string, any>;
      as?: string | TypedPathProxy<any> | any;
    } = {}
  ): CuratorActorRefNode {
    const node: CuratorActorRefNode = {
      type: CuratorNodeType.ActorRef,
      actor: String(actor),
      handlers: Object.fromEntries(Object.entries(handlers).map(([kind, h]) => [kind, typeof h === 'string' ? h : h.ref])),
    };
    if (options.kind) node.kind = serializeExpr(options.kind, '$actor');
    if (options.args) node.args = options.args;
    if (options.as) node.as = toVarName(options.as);
    return node;
  }

  /**
   * Bevy-style state machine compiled to a Curator_Graph. Each state declares its body (`run`),
   * optional `onEnter`/`onExit` hooks and `next`: a state name, a router node, or guarded transitions
   * checked in order (`when` sees the state's output as `output`). No `next` ends the machine.
   */
  static stateMachine<TContext = any>(
    start: string | Array<{ to: string; when?: string | TypedPathProxy<any> | ((ctx: TContext) => boolean) }>,
    states: Record<string, {
      run: CuratorAstNode | CuratorAstNode[] | any;
      onEnter?: CuratorAstNode | CuratorAstNode[] | any;
      onExit?: CuratorAstNode | CuratorAstNode[] | any;
      next?: string | CuratorAstNode | Array<{ to: string; when?: string | TypedPathProxy<any> | ((ctx: TContext & { output: any }) => boolean) }>;
    }>,
    options: { name?: string; stateKey?: string | CuratorStates<any> } = {}
  ): CuratorGraphNode {
    const { stateKey, ...rest } = options;
    const resolve = (b: any): CuratorAstNode => (Array.isArray(b) ? CuratorCoreBuilder.seq(...b) : typeof b.build === 'function' ? b.build() : b);
    const transitions = (list: Array<{ to: string; when?: string | TypedPathProxy<any> | ((ctx: any) => boolean) }>) =>
      list.map(({ to, when }): CuratorGraphTransition => (
        when === undefined ? { to } : { to, when: serializeExpr(when) }
      ));
    const graph: CuratorGraphNode = {
      type: CuratorNodeType.Graph, ...rest, ...(stateKey ? { stateKey: String(stateKey) } : {}), startNode: Array.isArray(start) ? transitions(start) : start, nodes: {},
    };
    for (const [name, state] of Object.entries(states)) {
      graph.nodes[name] = resolve(state.run);
      if (state.onEnter) (graph.onEnter ??= {})[name] = resolve(state.onEnter);
      if (state.onExit) (graph.onExit ??= {})[name] = resolve(state.onExit);
      if (state.next === undefined) continue;
      (graph.edges ??= {})[name] = Array.isArray(state.next)
        ? transitions(state.next)
        : typeof state.next === 'string' ? state.next : resolve(state.next);
    }
    return graph;
  }

  /**
   * Repeat `body` until `until` is truthy or `maxIterations` is reached.
   */
  static repeat(body: CuratorAstNode, options: { until?: string | TypedPathProxy<any> | ((ctx: any) => boolean); while?: string | TypedPathProxy<any> | ((ctx: any) => boolean); over?: string | TypedPathProxy<any> | ((ctx: any) => any[]); as?: string; maxIterations?: number; name?: string; prompt?: string } = {}): CuratorLoopNode {
    const expr = (v: unknown) => (v !== undefined ? serializeExpr(v) : undefined);
    const { until, while: whileCond, over, ...rest } = options;
    return {
      type: CuratorNodeType.Loop,
      agent: body,
      ...rest,
      ...(until ? { until: expr(until) } : {}),
      ...(whileCond ? { while: expr(whileCond) } : {}),
      ...(over ? { over: expr(over) } : {}),
    };
  }

  /**
   * Scheduler: run `body` on a cron/interval `schedule` ("every 10 minutes", "0 14 * * 1-5", "at 14:00").
   */
  static every(schedule: string, body: CuratorAstNode, options: { until?: string; while?: string; over?: string; as?: string; maxIterations?: number; immediate?: boolean; name?: string } = {}): CuratorLoopNode {
    return { type: CuratorNodeType.Loop, agent: body, schedule, ...options };
  }

  /**
   * Iterate over a collection expression (evaluates to an array).
   */
  static forEach(collectionExpression: string | TypedPathProxy<any> | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string): CuratorForEachNode {
    const exprStr = serializeExpr(collectionExpression);
    return { type: CuratorNodeType.ForEach, collectionExpression: exprStr, body, iteratorName };
  }

  /**
   * Emit a Pub/Sub event to awaken listening AgentWorkflows.
   * Supports whole-payload closure (ctx) => ({ ... }) or object with closure properties.
   */
  static emitEvent(event: string | { name: string }, payload?: any | ((ctx: any) => any), targetAgentId?: number | string | ((ctx: any) => number | string)): CuratorEmitEventNode {
    const eventName = typeof event === 'string' ? event : event.name;
    const payloadVal = serializeClosure(payload);
    const targetAgentIdVal = typeof targetAgentId === 'function' ? serializeExpr(targetAgentId) : targetAgentId;
    return { type: CuratorNodeType.EmitEvent, eventName, payload: payloadVal, targetAgentId: targetAgentIdVal };
  }

  /**
   * Wait synchronously for a Pub/Sub event to be emitted.
   */
  static waitEvent(
    event: string | { name: string } | Array<string | { name: string }>,
    payloadAlias?: string | TypedPathProxy<any> | any,
    options: { timeoutSeconds?: number; replay?: boolean; onTimeout?: CuratorAstNode } = {}
  ): CuratorWaitEventNode {
    if (Array.isArray(event)) {
      return CuratorCoreBuilder.waitAnyEvent(event, payloadAlias, options);
    }
    const eventName = typeof event === 'string' ? event : event.name;
    const cleanAlias = toVarName(payloadAlias);
    return {
      type: CuratorNodeType.WaitEvent,
      eventName,
      ...(cleanAlias ? { payloadAlias: cleanAlias } : {}),
      ...(options?.timeoutSeconds ? { timeoutSeconds: options.timeoutSeconds } : {}),
      ...(options?.replay ? { replay: true } : {}),
      ...(options?.onTimeout ? { onTimeout: options.onTimeout } : {}),
    };
  }

  /**
   * Wait for the FIRST event among `events` to be emitted (race / "first wins" semantics, like Bevy `listen_any_event`).
   */
  static waitAnyEvent(
    events: Array<string | { name: string }>,
    payloadAlias?: string | TypedPathProxy<any> | any,
    options: { timeoutSeconds?: number; replay?: boolean; onTimeout?: CuratorAstNode } = {}
  ): CuratorWaitEventNode {
    const names = events.map((e) => (typeof e === 'string' ? e : e.name)).filter(Boolean);
    if (names.length === 0) throw new Error('waitAnyEvent requires at least one event');
    const [primary, ...rest] = names;
    const cleanAlias = toVarName(payloadAlias);
    return {
      type: CuratorNodeType.WaitEvent,
      eventName: primary,
      ...(rest.length > 0 ? { eventNames: rest } : {}),
      ...(cleanAlias ? { payloadAlias: cleanAlias } : {}),
      ...(options?.timeoutSeconds ? { timeoutSeconds: options.timeoutSeconds } : {}),
      ...(options?.replay ? { replay: true } : {}),
      ...(options?.onTimeout ? { onTimeout: options.onTimeout } : {}),
    };
  }

  /**
   * Declares a reusable module (root of a Script AST).
   * Supports Vue Composition API setup function: defineModule('name', () => [step1, step2])
   * Or traditional options: defineModule('name', { main, subroutines: [...] })
   */
  static defineModule(
    name: string,
    setupOrOptions:
      | (() => CuratorAstNode | CuratorAstNode[] | any)
      | {
        main?: CuratorAstNode | { build: () => CuratorAstNode };
        params?: Record<string, CuratorParamSpec>;
        subroutines?: Record<string, CuratorSubroutine | TypedSubroutine> | TypedSubroutine[];
        subscriptions?: CuratorSubscribeNode[];
        description?: string;
        /** Configuration defaults, keyed by namespace; workflows read them as `$config.<namespace>`. */
        config?: Record<string, any>;
      },
    maybeSetup?: () => CuratorAstNode | CuratorAstNode[] | any
  ): CuratorModuleNode {
    if (typeof setupOrOptions === 'function' || typeof maybeSetup === 'function') {
      const setup = typeof setupOrOptions === 'function' ? setupOrOptions : maybeSetup!;
      const meta = typeof setupOrOptions === 'object' ? setupOrOptions : {};

      const prevScope = activeModuleScope;
      const scope: ActiveModuleScope = {
        name,
        subroutines: normalizeSubroutinesMap(meta.subroutines),
        subscriptions: meta.subscriptions ? [...meta.subscriptions] : [],
        params: meta.params,
        description: meta.description,
      };

      activeModuleScope = scope;
      let mainNode: CuratorAstNode | undefined;
      try {
        mainNode = resolveBuilderNode(setup());
      } finally {
        activeModuleScope = prevScope;
      }
      includeReferencedSubroutines([mainNode, scope.subscriptions, Object.values(scope.subroutines).map((s) => s.body)], scope.subroutines);

      return {
        type: CuratorNodeType.Module,
        name,
        ...(scope.description ? { description: scope.description } : {}),
        ...(scope.params ? { params: scope.params } : {}),
        ...(meta.config ? { config: meta.config } : {}),
        main: mainNode,
        ...(Object.keys(scope.subroutines).length > 0 ? { subroutines: scope.subroutines } : {}),
        ...(scope.subscriptions.length > 0 ? { subscriptions: scope.subscriptions } : {}),
      };
    }

    const { main: rawMain, subroutines, ...restOptions } = setupOrOptions;
    const main = resolveBuilderNode(rawMain);
    const allSubroutines = normalizeSubroutinesMap(subroutines);
    includeReferencedSubroutines([main, restOptions.subscriptions, Object.values(allSubroutines).map((s) => s.body)], allSubroutines);
    return {
      type: CuratorNodeType.Module,
      name,
      ...restOptions,
      main,
      ...(Object.keys(allSubroutines).length > 0 ? { subroutines: allSubroutines } : {}),
    };
  }

  /** Declares a subroutine for a module's `subroutines` map. */
  static sub(params: Record<string, CuratorParamSpec> | undefined, body: CuratorAstNode | { build: () => CuratorAstNode }, returns?: string): CuratorSubroutine {
    const resolved = typeof (body as any).build === 'function' ? (body as any).build() : body;
    return { params, body: resolved, ...(returns ? { returns } : {}) };
  }

  /**
   * First-class subroutine factory. Returns a callable TypedSubroutine function that produces
   * a CuratorCallNode ({ type: 'Curator_Call', ref: '#name' }) when invoked, and exposes .ref,
   * .definition, and .inline().
   */
  static defineSubroutine = defineSubroutine;

  /**
   * Composition API event listener hook.
   * Auto-registers to the active module's static subscriptions, or returns a CuratorSubscribeNode.
   */
  static onEvent = onEvent;

  /** Invokes a subroutine by ref ('script', 'script#sub', '#sub') or TypedSubroutine reference. Default mode: 'child'. */
  static call(
    ref: string | TypedSubroutine,
    args?: Record<string, any>,
    options: { as?: string | TypedPathProxy<any> | any; mode?: 'child' | 'inline' } = {}
  ): CuratorCallNode {
    const rawRef = typeof ref === 'function' && 'ref' in ref ? (ref as TypedSubroutine).ref : String(ref);
    const targetRef = rawRef.startsWith('#') ? '#' + rawRef.replace(/^#+/, '') : rawRef;
    const { as, ...restOptions } = options;
    const cleanAs = toVarName(as);
    return {
      type: CuratorNodeType.Call,
      ref: targetRef,
      ...(args ? { args: serializeClosure(args) } : {}),
      ...restOptions,
      ...(cleanAs ? { as: cleanAs } : {}),
    };
  }

  /** Declares that `handler` runs whenever `eventName` is emitted. Accepts named ref string or TypedSubroutine reference. */
  static subscribe(
    eventName: string,
    handler: string | TypedSubroutine,
    options: { as?: string | TypedPathProxy<any> | any; when?: string; scope?: 'conversation' | 'project' } = {}
  ): CuratorSubscribeNode {
    const rawHandler = typeof handler === 'function' && 'ref' in handler ? (handler as TypedSubroutine).ref : String(handler);
    const targetHandler = rawHandler.startsWith('#') ? '#' + rawHandler.replace(/^#+/, '') : rawHandler;
    const { as, ...restOptions } = options;
    const cleanAs = toVarName(as);
    return {
      type: CuratorNodeType.Subscribe,
      eventName,
      handler: targetHandler,
      ...restOptions,
      ...(cleanAs ? { as: cleanAs } : {}),
    };
  }

  /** Removes dynamic subscriptions for `eventName` (optionally only for `handler`). */
  static unsubscribe(eventName: string, handler?: string | TypedSubroutine): CuratorUnsubscribeNode {
    const targetHandler = typeof handler === 'function' && 'ref' in handler ? (handler as TypedSubroutine).ref : handler ? String(handler) : undefined;
    return { type: CuratorNodeType.Unsubscribe, eventName, ...(targetHandler ? { handler: targetHandler } : {}) };
  }

  /**
   * Runs the provided nodes sequentially. Automatically resolves fluent builder instances.
   * Supports omitting name: seq(stepA, stepB) or with name: seq('stepName', stepA, stepB).
   */
  static seq(
    nameOrFirstNode?: string | CuratorAstNode | any,
    ...rest: (CuratorAstNode | { build: () => CuratorAstNode } | any)[]
  ): CuratorSequentialNode {
    let name: string | undefined;
    let allNodes: any[];
    if (typeof nameOrFirstNode === 'string' && rest.length > 0) {
      name = nameOrFirstNode;
      allNodes = rest;
    } else {
      allNodes = nameOrFirstNode !== undefined ? [nameOrFirstNode, ...rest] : rest;
    }
    const rawList = allNodes.length === 1 && Array.isArray(allNodes[0]) ? allNodes[0] : allNodes.flat();
    const unwrapped = rawList.map(n => (n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n));
    return { type: CuratorNodeType.Sequential, ...(name ? { name } : {}), subAgents: unwrapped };
  }

  /**
   * Runs the provided nodes in parallel. Automatically resolves fluent builder instances.
   */
  static parallel(name: string, ...nodes: (CuratorAstNode | { build: () => CuratorAstNode } | any)[]): CuratorParallelNode {
    const rawList = nodes.length === 1 && Array.isArray(nodes[0]) ? nodes[0] : nodes.flat();
    const unwrapped = rawList.map(n => (n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n));
    return { type: CuratorNodeType.Parallel, name, subAgents: unwrapped };
  }

  /**
   * Merge state with the provided record or closure.
   * Supports whole-object closure (ctx) => ({ ... }) or object with closure properties.
   */
  static setState<T = any>(stateOrFn: Record<string, any> | ((ctx: T) => Partial<T> | Record<string, any>)): CuratorSetStateNode {
    if (typeof stateOrFn === 'function') {
      return { type: CuratorNodeType.SetState, state: `(${stateOrFn.toString()})(context)` };
    }
    return { type: CuratorNodeType.SetState, state: serializeClosure(stateOrFn) };
  }

  /**
   * Universal input verb.
   * Prompts the user/actor for input (choices, free-form text, or file upload).
   *
   * Signatures:
   * 1. `input(prompt, choices, options)` - choice-based selection (e.g. menu)
   * 2. `input(prompt, 'choices' | 'text' | 'file', choices, options)` - explicit inputType
   */
  static input(
    prompt: string,
    inputTypeOrChoices: 'text' | 'choices' | 'file' | (string | CuratorChoiceItem)[] | string | TypedPathProxy<any> = 'text',
    choicesOrOptions?: (string | CuratorChoiceItem)[] | string | TypedPathProxy<any> | { targetUserId?: number; as?: string | TypedPathProxy<any> | any; blocking?: boolean; timeoutSeconds?: number; onTimeout?: CuratorAstNode; name?: string },
    explicitOptions?: { targetUserId?: number; as?: string | TypedPathProxy<any> | any; blocking?: boolean; timeoutSeconds?: number; onTimeout?: CuratorAstNode; name?: string }
  ): CuratorHumanInputNode {
    let inputType: 'text' | 'choices' | 'file' = 'text';
    let choices: (string | CuratorChoiceItem)[] | string | undefined;
    let options: { targetUserId?: number; as?: string | TypedPathProxy<any> | any; blocking?: boolean; timeoutSeconds?: number; onTimeout?: CuratorAstNode; name?: string } | undefined;

    if (inputTypeOrChoices === 'text' || inputTypeOrChoices === 'choices' || inputTypeOrChoices === 'file') {
      inputType = inputTypeOrChoices;
      choices = isPathProxy(choicesOrOptions) ? String(choicesOrOptions) : (choicesOrOptions as any);
      options = explicitOptions;
    } else {
      // Shorthand: input(prompt, choices, options)
      inputType = 'choices';
      choices = isPathProxy(inputTypeOrChoices) ? String(inputTypeOrChoices) : (inputTypeOrChoices as any);
      options = choicesOrOptions as any;
    }

    if (Array.isArray(choices)) {
      choices = choices.map((c) => {
        if (c && typeof c === 'object' && 'when' in c && isPathProxy((c as any).when)) {
          return { ...c, when: String((c as any).when) };
        }
        return c;
      });
    }

    const { as, blocking = true, ...rest } = options || {};
    const cleanAs = toVarName(as);
    return {
      type: CuratorNodeType.HumanInput,
      prompt,
      inputType,
      choices,
      blocking,
      ...rest,
      ...(cleanAs ? { as: cleanAs } : {}),
    };
  }

  /**
   * Aliases for `input`.
   */
  static humanInput = CuratorCoreBuilder.input;
  static humanSelection = CuratorCoreBuilder.input;
  static choice = CuratorCoreBuilder.input;

  /**
   * Call an LLM agent with tools.
   * Strict scoping: ensures output is stored under `as` (defaulting to camelCase(agentName) or 'decision').
   */
  static agent(options: Omit<CuratorAgentNode, 'type'>): CuratorAgentNode {
    const cleanAs = toVarName(options.as) || toCamelCase(options.agentName) || 'decision';
    return { type: CuratorNodeType.Agent, ...options, as: cleanAs };
  }

  /**
   * Execute an arbitrary script (e.g. for game logic evaluation).
   * Can accept a raw string or a closure that takes the `context` object.
   */
  static script(code: string | ((ctx: any) => any), language: 'javascript' | 'coffeescript' = 'javascript'): CuratorScriptNode {
    const codeStr = typeof code === 'function' ? `(${code.toString()})(context)` : code;
    return { type: CuratorNodeType.Script, language, code: codeStr };
  }

  /**
   * Execute a registered tool.
   * Accepts record arguments, closure returning arguments (ctx) => ({ ... }), or arguments containing closures.
   * `options.spread: false` keeps the output under `as` / toolName only, instead of also merging its fields into context.
   */
  static tool(toolName: string, args?: Record<string, any> | ((ctx: any) => Record<string, any>), as?: string | TypedPathProxy<any> | any, options: { spread?: boolean } = {}): CuratorToolNode {
    const evaluatedArgs = typeof args === 'function' ? `(${args.toString()})(context)` : (args ? serializeClosure(args) : {});
    const cleanAs = toVarName(as);
    const node: CuratorToolNode = { type: CuratorNodeType.Tool, toolName, args: evaluatedArgs as any };
    if (cleanAs) node.as = cleanAs;
    if (options.spread === false) node.spread = false;
    return node;
  }

  /**
   * Run a plugin's pure reducer (registered under `reducers`) on the given args.
   * Its output is bound like a tool's: spread into context and state, or kept under `as` when `spread` is false.
   */
  static reduce(reducer: string, args?: Record<string, any> | ((ctx: any) => Record<string, any>), as?: string | TypedPathProxy<any> | any, options: { spread?: boolean } = {}): CuratorReduceNode {
    const evaluatedArgs = typeof args === 'function' ? `(${args.toString()})(context)` : (args ? serializeClosure(args) : {});
    const cleanAs = toVarName(as);
    const node: CuratorReduceNode = { type: CuratorNodeType.Reduce, reducer, args: evaluatedArgs as any };
    if (cleanAs) node.as = cleanAs;
    if (options.spread === false) node.spread = false;
    return node;
  }

  /**
   * Emit every event of a list computed at run time (`[{ name, payload?, targetAgentId? }]`), e.g. `$state.events`
   * written by a reducer. Payloads are emitted as data, without expression evaluation.
   */
  static emitEvents(events: string | TypedPathProxy<any>): CuratorEmitEventsNode {
    return { type: CuratorNodeType.EmitEvents, events: String(events) };
  }

  /**
   * Reference a sensitive credential or API token via a secure placeholder.
   * e.g. CuratorCoreBuilder.secret('GITHUB_TOKEN') -> '$secret:GITHUB_TOKEN'
   */
  static secret(key: string): string {
    return `$secret:${key}`;
  }

  /**
   * Attaches an error recovery / fallback AST node (`.catch()` / Bevy `on_error`).
   */
  static withFallback<T extends CuratorAstNode | CuratorAstNode[]>(node: T, fallback: CuratorAstNode | CuratorAstNode[] | any): CuratorAstNode {
    const resolved = resolveBuilderNode(node)!;
    return { ...resolved, onError: resolveBuilderNode(fallback) };
  }

  /**
   * Attaches a timeout and optional timeout fallback AST node to a wait/input node.
   */
  static withTimeout<T extends CuratorAstNode>(node: T, timeoutSeconds: number, onTimeout?: CuratorAstNode | CuratorAstNode[] | any): T {
    return {
      ...node,
      timeoutSeconds,
      ...(onTimeout ? { onTimeout: resolveBuilderNode(onTimeout) } : {}),
    };
  }

  /**
   * Attaches an entry and/or exit action hook to any AST node (Bevy `with_entry` / `with_exit`).
   */
  static withHooks<T extends CuratorAstNode | CuratorAstNode[]>(
    node: T,
    hooks: {
      entry?: CuratorAstNode | CuratorAstNode[] | any;
      exit?: CuratorAstNode | CuratorAstNode[] | any;
      onEnter?: CuratorAstNode | CuratorAstNode[] | any;
      onExit?: CuratorAstNode | CuratorAstNode[] | any;
    }
  ): CuratorAstNode {
    const resolved = resolveBuilderNode(node)!;
    const entryNode = hooks.entry ?? hooks.onEnter;
    const exitNode = hooks.exit ?? hooks.onExit;
    return {
      ...resolved,
      ...(entryNode ? { entryAction: resolveBuilderNode(entryNode) } : {}),
      ...(exitNode ? { exitAction: resolveBuilderNode(exitNode) } : {}),
    };
  }
}

/**
 * Synthesizes a local subroutine inside the active module when an inline callback `(payloadProxy) => ...`
 * is passed to `onEvent`, `EventDef.on`, or `system`.
 */
function resolveInlineEventHandler<P = any>(
  eventName: string,
  handler: string | TypedSubroutine | ((payload: TypedPathProxy<P>) => CuratorAstNode | CuratorAstNode[] | any),
  asAlias?: string | TypedPathProxy<any>
): string | TypedSubroutine {
  if (typeof handler === 'function' && !('definition' in handler) && !('ref' in handler)) {
    const paramName = toVarName(asAlias) || 'event';
    const cleanEvent = eventName.replace(/[^A-Za-z0-9_]/g, '_');
    const existingCount = activeModuleScope ? Object.keys(activeModuleScope.subroutines).filter((k) => k.startsWith(`on_${cleanEvent}`)).length : 0;
    const subName = existingCount === 0 ? `on_${cleanEvent}` : `on_${cleanEvent}_${existingCount + 1}`;
    const payloadProxy = createContextProxy<P>(`$params.${paramName}`);
    const body = (handler as (p: TypedPathProxy<P>) => any)(payloadProxy);
    return defineSubroutine(subName, body, {
      params: { [paramName]: { type: 'object' } },
    });
  }
  return handler as string | TypedSubroutine;
}

/**
 * Composition API event listener hook.
 * Auto-registers to the active module's static subscriptions if called within defineModule setup(),
 * and returns the created CuratorSubscribeNode.
 */
export function onEvent<P = any>(
  event: string | { name: string },
  handler: string | TypedSubroutine | ((payload: TypedPathProxy<P>) => CuratorAstNode | CuratorAstNode[] | any),
  options: { as?: string | TypedPathProxy<any> | any; when?: string; scope?: 'conversation' | 'project' } = {}
): CuratorSubscribeNode {
  const eventName = typeof event === 'string' ? event : event.name;
  const resolvedHandler = resolveInlineEventHandler<P>(eventName, handler, options.as);
  const node = CuratorCoreBuilder.subscribe(eventName, resolvedHandler, options);
  if (activeModuleScope) {
    activeModuleScope.subscriptions.push(node);
    if (typeof resolvedHandler === 'function' && 'definition' in resolvedHandler) {
      const typed = resolvedHandler as TypedSubroutine;
      const subName = (typed.subroutineName || typed.name).replace(/^#+/, '');
      activeModuleScope.subroutines[subName] = typed.definition;
    }
  }
  return node;
}

/** A payload field given as a literal, an expression string or a path proxy. */
export type CuratorExpr<T = any> = T | string | TypedPathProxy<any>;

/**
 * First-class callable pure reducer (like Bevy `System` / pure reducer):
 * - Directly callable as the runtime reducer function `(args) => TOutput`
 * - `.reduce(args, options)` or `.node(args, options)` builds a `Curator_Reduce` AST node with typed `TArgs`
 */
export interface TypedReducer<TArgs extends Record<string, any> = Record<string, any>, TOutput extends Record<string, any> = Record<string, any>> {
  (args: TArgs, context?: Record<string, any>): TOutput;
  (args: Record<string, any>, context?: Record<string, any>): TOutput;
  readonly reducerName: string;
  reduce(
    args?: { [K in keyof TArgs]?: CuratorExpr<TArgs[K]> } | ((ctx: any) => Partial<TArgs>),
    options?: { as?: string | TypedPathProxy<any>; spread?: boolean }
  ): CuratorReduceNode;
  node(
    args?: { [K in keyof TArgs]?: CuratorExpr<TArgs[K]> } | ((ctx: any) => Partial<TArgs>),
    options?: { as?: string | TypedPathProxy<any>; spread?: boolean }
  ): CuratorReduceNode;
}

export function defineReducer<TArgs extends Record<string, any> = Record<string, any>, TOutput extends Record<string, any> = Record<string, any>>(
  name: string,
  fn: (args: TArgs) => TOutput
): TypedReducer<TArgs, TOutput> {
  const buildReduceNode = (
    args?: { [K in keyof TArgs]?: CuratorExpr<TArgs[K]> } | ((ctx: any) => Partial<TArgs>),
    options: { as?: string | TypedPathProxy<any>; spread?: boolean } = {}
  ): CuratorReduceNode => {
    const spread = options.spread ?? (options.as === undefined);
    return CuratorCoreBuilder.reduce(name, args as any, options.as, { spread });
  };
  const wrapped = function (args: TArgs): TOutput {
    return fn(args);
  } as unknown as TypedReducer<TArgs, TOutput>;
  Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
  Object.assign(wrapped, {
    reducerName: name,
    reduce: buildReduceNode,
    node: buildReduceNode,
  });
  return wrapped;
}

/** Typed event handle (Bevy `Message`): one name, one payload shape, used to emit, wait and subscribe. */
export interface CuratorEventDef<P extends Record<string, any> = Record<string, any>> {
  readonly name: string;
  /** Payload fields are checked against P; values may be expressions or a TypedPathProxy<P>. */
  emit(
    payload?: { [K in keyof P]?: CuratorExpr<P[K]> } | TypedPathProxy<P> | ((ctx: any) => Partial<P>),
    target?: number | string | ((ctx: any) => number | string)
  ): CuratorEmitEventNode;
  wait(as?: string | TypedPathProxy<any>, options?: { timeoutSeconds?: number; replay?: boolean; onTimeout?: CuratorAstNode }): CuratorWaitEventNode;
  /** Registers `handler` (a subroutine or inline `(payload) => ...` callback) for this event in the enclosing module. */
  on(
    handler: string | TypedSubroutine | ((payload: TypedPathProxy<P>) => CuratorAstNode | CuratorAstNode[] | any),
    options?: { as?: string | TypedPathProxy<any>; when?: string; scope?: 'conversation' | 'project' }
  ): CuratorSubscribeNode;
  /** Typed view of the payload inside a handler: `$params.<as>`. */
  payload(as?: string): TypedPathProxy<P>;
  /** True when a raced `waitAnyEvent` / `raceEvents` result was woken by this event. */
  is(raceResult?: TypedPathProxy<any> | string): TypedPathProxy<boolean>;
  toString(): string;
}

export function defineEvent<P extends Record<string, any> = Record<string, any>>(name: string): CuratorEventDef<P> {
  return {
    name,
    emit: (payload, target) => CuratorCoreBuilder.emitEvent(name, payload, target),
    wait: (as, options) => CuratorCoreBuilder.waitEvent(name, as, options),
    on: (handler, options) => onEvent<P>(name, handler, options),
    payload: (as = 'event') => createContextProxy<P>(`$params.${as}`),
    is: (raceResult) =>
      raceResult
        ? createContextProxy<boolean>(`((${raceResult} && ${raceResult}._eventName == '${name}') || $state.lastWokenEvent == '${name}')`)
        : createContextProxy<boolean>(`($state.lastWokenEvent == '${name}')`),
    toString: () => name,
  };
}

/** What starts a system: an event, optionally narrowed by a payload filter (e.g. a state being entered). */
export interface CuratorTrigger {
  name: string;
  when?: string;
}

/** Handle on a state machine's `stateKey` (Bevy `States`): run conditions and enter/exit triggers. */
export interface CuratorStates<S extends string = string> {
  readonly key: string;
  /** Run condition: the machine is currently in one of `states`. */
  in(...states: S[]): TypedPathProxy<boolean>;
  /** Run condition: the machine is NOT currently in any of `states`. */
  notIn(...states: S[]): TypedPathProxy<boolean>;
  /** Trigger: `state` was entered (Bevy `OnEnter`). */
  entered(state: S): CuratorTrigger;
  /** Trigger: `state` was left (Bevy `OnExit`). */
  exited(state: S): CuratorTrigger;
  /** Every transition of the machine, `{ from, to }`. */
  readonly changed: CuratorEventDef<{ from: S | null; to: S | '__end__' }>;
  toString(): string;
}

export function defineStates<S extends string>(key: string, _states?: Record<string, S>): CuratorStates<S> {
  const changed = defineEvent<{ from: S | null; to: S | '__end__' }>(`state:${key}`);
  const inFn = (...states: S[]): TypedPathProxy<boolean> =>
    createContextProxy<boolean>(`(${states.map((s) => `$state.${key} == '${s}'`).join(' or ')})`);
  return {
    key,
    in: inFn,
    notIn: (...states) => inFn(...states).not(),
    entered: (state) => ({ name: changed.name, when: `event.to == '${state}'` }),
    exited: (state) => ({ name: changed.name, when: `event.from == '${state}'` }),
    changed,
    toString: () => key,
  };
}

export interface CuratorSystemSpec<P extends Record<string, any> = Record<string, any>> {
  /** Event (name, typed handle) or state trigger that starts the system. */
  on: string | CuratorEventDef<P> | { name: string } | CuratorTrigger;
  /** Handler subroutine or inline `(payloadProxy) => ...` callback. */
  run: string | TypedSubroutine | ((payload: TypedPathProxy<P>) => CuratorAstNode | CuratorAstNode[] | any);
  /** Run condition, checked against the payload and `$state` before the system starts. */
  runIf?: string | TypedPathProxy<boolean> | ((ctx: any) => boolean);
  as?: string | TypedPathProxy<any>;
  scope?: 'conversation' | 'project';
}

/**
 * Declares a system (Bevy `add_systems`) in the enclosing module: `run` starts as its own flow whenever
 * `on` fires and `runIf` holds. Systems chain through the events they emit.
 */
export function system<P extends Record<string, any> = Record<string, any>>(spec: CuratorSystemSpec<P>): CuratorSubscribeNode {
  const trigger: CuratorTrigger = typeof spec.on === 'string' ? { name: spec.on } : spec.on;
  const runIf = spec.runIf ? serializeExpr(spec.runIf) : undefined;
  const when = [trigger.when, runIf].filter(Boolean).map((c) => `(${c})`).join(' and ');
  return onEvent<P>(trigger.name, spec.run, {
    ...(spec.as ? { as: spec.as } : {}),
    ...(spec.scope ? { scope: spec.scope } : {}),
    ...(when ? { when } : {}),
  });
}

/**
 * First-class callable subroutine definition.
 * Calling the returned function produces a CuratorCallNode ({ type: 'Curator_Call', ref: '#name' }).
 */
export type TypedSubroutineArgs<TParams> = TParams extends Record<string, any>
  ? { [K in keyof TParams]?: CuratorExpr<TParams[K]> } & Record<string, any>
  : Record<string, any>;

export interface TypedSubroutine<TParams = any> {
  (args?: TypedSubroutineArgs<TParams>, options?: { as?: string; mode?: 'child' | 'inline' }): CuratorCallNode;
  name: string;
  subroutineName: string;
  ref: string;
  definition: CuratorSubroutine;
  inline: (args?: TypedSubroutineArgs<TParams>, options?: { as?: string }) => CuratorCallNode;
}

/**
 * Creates a type-safe callable subroutine that can be invoked directly in workflows,
 * passed as event handler in subscriptions, and passed to module subroutines arrays.
 *
 * If called inside a `defineModule(name, () => { ... })` setup function, it automatically
 * registers into the active module's subroutines map.
 */
export function defineSubroutine<TParams = any>(
  name: string,
  bodyOrOptions:
    | (() => CuratorAstNode | CuratorAstNode[] | any)
    | CuratorAstNode
    | CuratorAstNode[]
    | {
      params?: Record<string, CuratorParamSpec>;
      body: CuratorAstNode | { build: () => CuratorAstNode } | any;
      returns?: string | TypedPathProxy<any>;
      description?: string;
      defaultMode?: 'child' | 'inline';
    },
  subOptions?: {
    params?: Record<string, CuratorParamSpec>;
    returns?: string | TypedPathProxy<any>;
    description?: string;
    defaultMode?: 'child' | 'inline';
  }
): TypedSubroutine<TParams> {
  let resolvedBody: any;
  let params: Record<string, CuratorParamSpec> | undefined;
  let returns: string | undefined;
  let description: string | undefined;
  let defaultMode: 'child' | 'inline' | undefined;

  if (typeof bodyOrOptions === 'function') {
    resolvedBody = bodyOrOptions();
    params = subOptions?.params;
    returns = subOptions?.returns ? String(subOptions.returns) : undefined;
    description = subOptions?.description;
    defaultMode = subOptions?.defaultMode;
  } else if (
    bodyOrOptions &&
    typeof bodyOrOptions === 'object' &&
    'body' in bodyOrOptions &&
    !('type' in bodyOrOptions)
  ) {
    const opts = bodyOrOptions as any;
    resolvedBody = opts.body;
    params = opts.params;
    returns = opts.returns ? String(opts.returns) : undefined;
    description = opts.description;
    defaultMode = opts.defaultMode;
  } else {
    resolvedBody = bodyOrOptions;
    params = subOptions?.params;
    returns = subOptions?.returns ? String(subOptions.returns) : undefined;
    description = subOptions?.description;
    defaultMode = subOptions?.defaultMode;
  }

  if (Array.isArray(resolvedBody)) {
    const flat = resolvedBody.flat();
    const unwrapped = flat.map((n: any) =>
      n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n
    );
    resolvedBody = { type: CuratorNodeType.Sequential, subAgents: unwrapped };
  } else if (resolvedBody && typeof resolvedBody.build === 'function') {
    resolvedBody = resolvedBody.build();
  }

  const cleanName = name.replace(/^#+/, '');
  const ref = `#${cleanName}`;
  const definition = CuratorCoreBuilder.sub(params, resolvedBody, returns);
  if (description) {
    definition.description = description;
  }

  // Auto-register to active module scope if called inside defineModule setup()
  if (activeModuleScope) {
    activeModuleScope.subroutines[cleanName] = definition;
  }
  if (knownSubroutines.has(cleanName) && knownSubroutines.get(cleanName) !== definition) ambiguousSubroutines.add(cleanName);
  knownSubroutines.set(cleanName, definition);

  const fn = function (
    args?: TypedSubroutineArgs<TParams>,
    callOptions?: { as?: string; mode?: 'child' | 'inline' }
  ): CuratorCallNode {
    return CuratorCoreBuilder.call(ref, args, {
      mode: callOptions?.mode ?? defaultMode ?? 'child',
      ...(callOptions?.as ? { as: callOptions.as } : {}),
    });
  } as TypedSubroutine<TParams>;

  Object.defineProperty(fn, 'name', { value: cleanName, configurable: true });
  fn.subroutineName = cleanName;
  fn.ref = ref;
  fn.definition = definition;
  fn.inline = (args?: TypedSubroutineArgs<TParams>, callOptions?: { as?: string }): CuratorCallNode => {
    return CuratorCoreBuilder.call(ref, args, { mode: 'inline', ...callOptions });
  };

  return fn;
}

/** Every subroutine declared with defineSubroutine, by name; modules pull in the ones they reference. */
const knownSubroutines = new Map<string, CuratorSubroutine>();
const ambiguousSubroutines = new Set<string>();

/**
 * Adds to `subs` every subroutine reachable through local refs ('#name' in calls, actor handlers and
 * subscriptions), following the added bodies transitively, so modules need not list them by hand.
 */
function includeReferencedSubroutines(roots: unknown[], subs: Record<string, CuratorSubroutine>): void {
  const localRefs = (node: any): string[] => {
    if (node.type === CuratorNodeType.Call) return [node.ref];
    if (node.type === CuratorNodeType.ActorRef) return Object.values(node.handlers ?? {});
    if (node.type === CuratorNodeType.Subscribe || node.type === CuratorNodeType.Unsubscribe) return [node.handler];
    return [];
  };
  const pending = [...roots];
  while (pending.length) {
    const value: any = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) { pending.push(...value); continue; }
    if (typeof value.type === 'string') {
      for (const ref of localRefs(value)) {
        const name = typeof ref === 'string' && ref.startsWith('#') ? ref.slice(1) : null;
        if (!name || subs[name] || !knownSubroutines.has(name)) continue;
        if (ambiguousSubroutines.has(name)) throw new Error(`Subroutine '#${name}' is defined more than once; list the intended one in the module's subroutines`);
        subs[name] = knownSubroutines.get(name)!;
        pending.push(subs[name].body);
      }
    }
    pending.push(...Object.values(value));
  }
}

/**
 * Pillar 5: Typed Workflow Scope Factory (`createWorkflowScope<TState, TContext, TParams>()`).
 * Pre-binds typed path proxies (`state`, `ctx`, `params`, `output`, `actor`) and pre-typed workflow builders
 * (`setState`, `ifElse`, `whileLoop`, `stateMachine`, `assign`) so workflow files never need manual
 * generic type annotations (`setState<MyContext>(...)`) or separate proxy boilerplate.
 */
export interface WorkflowScope<
  TState extends Record<string, any> = Record<string, any>,
  TContext extends Record<string, any> = Record<string, any>,
  TParams extends Record<string, any> = Record<string, any>
> {
  readonly state: TypedPathProxy<TState>;
  readonly ctx: TypedPathProxy<TContext>;
  readonly params: TypedPathProxy<TParams>;
  readonly output: TypedPathProxy<any>;
  readonly actor: TypedPathProxy<any>;
  setState(
    stateOrFn:
      | { [K in keyof TState]?: CuratorExpr<TState[K]> } & Record<string, any>
      | ((ctx: TContext & { state: TState }) => Partial<TState> | Record<string, any>)
  ): CuratorSetStateNode;
  ifElse<TExtra = Record<string, never>>(
    condition: string | TypedPathProxy<any> | ((ctx: TContext & { state: TState } & TExtra) => boolean),
    thenBranch: CuratorAstNode | CuratorAstNode[] | any,
    elseBranch?: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorIfElseNode;
  whileLoop(
    condition: string | TypedPathProxy<any> | ((ctx: TContext & { state: TState }) => boolean),
    body: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorWhileNode;
  stateMachine(
    start: string | Array<{ to: string; when?: string | TypedPathProxy<any> | ((ctx: TContext & { state: TState }) => boolean) }>,
    states: Record<string, {
      run: CuratorAstNode | CuratorAstNode[] | any;
      onEnter?: CuratorAstNode | CuratorAstNode[] | any;
      onExit?: CuratorAstNode | CuratorAstNode[] | any;
      next?: string | CuratorAstNode | Array<{ to: string; when?: string | TypedPathProxy<any> | ((ctx: TContext & { state: TState; output: any }) => boolean) }>;
    }>,
    options?: { name?: string; stateKey?: string | CuratorStates<any> }
  ): CuratorGraphNode;
  assign<K extends keyof TState & string>(
    key: K | TypedPathProxy<any> | string,
    expression: CuratorExpr<TState[K]> | ((ctx: TContext & { state: TState }) => TState[K])
  ): CuratorAssignNode;
}

export function createWorkflowScope<
  TState extends Record<string, any> = Record<string, any>,
  TContext extends Record<string, any> = Record<string, any>,
  TParams extends Record<string, any> = Record<string, any>
>(): WorkflowScope<TState, TContext, TParams> {
  return {
    state: createContextProxy<TState>('$state'),
    ctx: createContextProxy<TContext>('$context'),
    params: createContextProxy<TParams>('$params'),
    output: createContextProxy<any>('output'),
    actor: createContextProxy<any>('$params.actor'),
    setState: (stateOrFn) => CuratorCoreBuilder.setState(stateOrFn as any),
    ifElse: (cond, thenB, elseB) => CuratorCoreBuilder.ifElse(cond as any, thenB, elseB),
    whileLoop: (cond, body) => CuratorCoreBuilder.loopwhile(cond as any, body),
    stateMachine: (start, states, options) => CuratorCoreBuilder.stateMachine(start as any, states as any, options),
    assign: (key, expr) => CuratorCoreBuilder.assign(key, expr as any),
  };
}

/**
 * Composition API module definition function.
 * e.g. defineModule('my_module', () => { ... })
 */
export const defineModule = CuratorCoreBuilder.defineModule;

// Core standalone workflow verbs for direct import
export const seq = CuratorCoreBuilder.seq;
export const input = CuratorCoreBuilder.input;
export const humanInput = CuratorCoreBuilder.input;
export const humanSelection = CuratorCoreBuilder.input;
export const choice = CuratorCoreBuilder.input;
export const ifElse = CuratorCoreBuilder.ifElse;
export const match = CuratorCoreBuilder.match;
export const switchCase = CuratorCoreBuilder.switchCase;
export const whileLoop = CuratorCoreBuilder.loopwhile;
export const stateMachine = CuratorCoreBuilder.stateMachine;
export const actorRef = CuratorCoreBuilder.actorRef;
export const repeat = CuratorCoreBuilder.repeat;
export const every = CuratorCoreBuilder.every;
export const forEach = CuratorCoreBuilder.forEach;
export const emitEvent = CuratorCoreBuilder.emitEvent;
export const emitEvents = CuratorCoreBuilder.emitEvents;
export const waitEvent = CuratorCoreBuilder.waitEvent;
export const waitAnyEvent = CuratorCoreBuilder.waitAnyEvent;
export const raceEvents = CuratorCoreBuilder.waitAnyEvent;
export const setState = CuratorCoreBuilder.setState;
export const callSubroutine = CuratorCoreBuilder.call;
export const sub = CuratorCoreBuilder.sub;
export const subscribe = CuratorCoreBuilder.subscribe;
export const unsubscribe = CuratorCoreBuilder.unsubscribe;
export const tool = CuratorCoreBuilder.tool;
export const reduce = CuratorCoreBuilder.reduce;
export const script = CuratorCoreBuilder.script;
export const agent = CuratorCoreBuilder.agent;
export const secret = CuratorCoreBuilder.secret;
export const assign = CuratorCoreBuilder.assign;
export const withFallback = CuratorCoreBuilder.withFallback;
export const withTimeout = CuratorCoreBuilder.withTimeout;
export const withHooks = CuratorCoreBuilder.withHooks;
export { not, and, or, eq } from './CuratorProxy.js';
