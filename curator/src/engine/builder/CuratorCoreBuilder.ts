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
  type CuratorModuleNode,
  type CuratorSubroutine,
  type CuratorParamSpec,
  type CuratorCallNode,
  type CuratorSubscribeNode,
  type CuratorUnsubscribeNode,
} from '../CuratorAst.js';
import { toVarName, type TypedPathProxy, createContextProxy } from './CuratorProxy.js';

export { CuratorNodeType, toVarName, createContextProxy, type TypedPathProxy };

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
 * Core AST Node Factory for primitive computational and workflow verbs.
 */
export class CuratorCoreBuilder {
  static readonly NodeType = CuratorNodeType;

  /**
   * Evaluates an expression and assigns it to a key in `context.state`.
   * e.g. .assign('state.turn', (ctx) => ctx.state.turn + 1)
   */
  static assign(key: string | TypedPathProxy<any> | any, expression: string | ((ctx: any) => any)): CuratorAssignNode {
    const cleanKey = toVarName(key) || String(key);
    const exprStr = typeof expression === 'function' ? `(${expression.toString()})(context)` : expression;
    return { type: CuratorNodeType.Assign, key: cleanKey, expression: exprStr };
  }

  /**
   * If the condition expression evaluates to true, executes `thenBranch`, else optionally executes `elseBranch`.
   * Automatically wraps arrays of steps into a sequential node.
   */
  static ifElse(
    condition: string | ((ctx: any) => boolean),
    thenBranch: CuratorAstNode | CuratorAstNode[] | any,
    elseBranch?: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorIfElseNode {
    const condStr = typeof condition === 'function' ? `(${condition.toString()})(context)` : condition;
    const resolveBranch = (b: any): CuratorAstNode | undefined => {
      if (!b) return undefined;
      if (Array.isArray(b)) {
        return CuratorCoreBuilder.seq(...b);
      }
      return typeof b.build === 'function' ? b.build() : b;
    };
    return {
      type: CuratorNodeType.IfElse,
      condition: condStr,
      thenBranch: resolveBranch(thenBranch)!,
      elseBranch: resolveBranch(elseBranch),
    };
  }

  /**
   * While the condition evaluates to true, loop over the `body`.
   * Automatically wraps arrays of steps into a sequential node.
   */
  static whileLoop(
    condition: string | ((ctx: any) => boolean),
    body: CuratorAstNode | CuratorAstNode[] | any
  ): CuratorWhileNode {
    const condStr = typeof condition === 'function' ? `(${condition.toString()})(context)` : condition;
    const resolveBody = (b: any): CuratorAstNode => {
      if (Array.isArray(b)) {
        return CuratorCoreBuilder.seq(...b);
      }
      return typeof b.build === 'function' ? b.build() : b;
    };
    return { type: CuratorNodeType.While, condition: condStr, body: resolveBody(body) };
  }

  /**
   * Repeat `body` until `until` is truthy or `maxIterations` is reached.
   */
  static repeat(body: CuratorAstNode, options: { until?: string | ((ctx: any) => boolean); while?: string | ((ctx: any) => boolean); over?: string | ((ctx: any) => any[]); as?: string; maxIterations?: number; name?: string; prompt?: string } = {}): CuratorLoopNode {
    const expr = (v: unknown) => (typeof v === 'function' ? `(${v.toString()})(context)` : (v as string | undefined));
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
  static forEach(collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string): CuratorForEachNode {
    const exprStr = typeof collectionExpression === 'function' ? `(${collectionExpression.toString()})(context)` : collectionExpression;
    return { type: CuratorNodeType.ForEach, collectionExpression: exprStr, body, iteratorName };
  }

  /**
   * Emit a Pub/Sub event to awaken listening AgentWorkflows.
   */
  static emitEvent(eventName: string, payload?: any | ((ctx: any) => any), targetAgentId?: number | string | ((ctx: any) => number | string)): CuratorEmitEventNode {
    const payloadVal = typeof payload === 'function' ? `(${payload.toString()})(context)` : payload;
    const targetAgentIdVal = typeof targetAgentId === 'function' ? `(${targetAgentId.toString()})(context)` : targetAgentId;
    return { type: CuratorNodeType.EmitEvent, eventName, payload: payloadVal, targetAgentId: targetAgentIdVal };
  }

  /**
   * Wait synchronously for a Pub/Sub event to be emitted.
   */
  static waitEvent(
    eventName: string,
    payloadAlias?: string | TypedPathProxy<any> | any,
    options: { timeoutSeconds?: number; replay?: boolean } = {}
  ): CuratorWaitEventNode {
    const cleanAlias = toVarName(payloadAlias);
    return {
      type: CuratorNodeType.WaitEvent,
      eventName,
      ...(cleanAlias ? { payloadAlias: cleanAlias } : {}),
      ...(options?.timeoutSeconds ? { timeoutSeconds: options.timeoutSeconds } : {}),
      ...(options?.replay ? { replay: true } : {}),
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
        },
    maybeSetup?: () => CuratorAstNode | CuratorAstNode[] | any
  ): CuratorModuleNode {
    if (typeof setupOrOptions === 'function' || typeof maybeSetup === 'function') {
      const setup = typeof setupOrOptions === 'function' ? setupOrOptions : maybeSetup!;
      const meta = typeof setupOrOptions === 'object' ? setupOrOptions : {};

      let initialSubroutines: Record<string, CuratorSubroutine> = {};
      if (Array.isArray(meta.subroutines)) {
        for (const subItem of meta.subroutines) {
          const subName = subItem.subroutineName || subItem.name;
          initialSubroutines[subName] = subItem.definition;
        }
      } else if (meta.subroutines) {
        for (const [key, val] of Object.entries(meta.subroutines)) {
          initialSubroutines[key] = (val && typeof val === 'function' && 'definition' in val)
            ? (val as TypedSubroutine).definition
            : (val as CuratorSubroutine);
        }
      }

      const prevScope = activeModuleScope;
      const scope: ActiveModuleScope = {
        name,
        subroutines: initialSubroutines,
        subscriptions: meta.subscriptions ? [...meta.subscriptions] : [],
        params: meta.params,
        description: meta.description,
      };

      activeModuleScope = scope;
      let mainNode: CuratorAstNode | undefined;
      try {
        const result = setup();
        if (Array.isArray(result)) {
          const flat = result.flat();
          const unwrapped = flat.map((n: any) =>
            n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n
          );
          mainNode = { type: 'Curator_Sequential', subAgents: unwrapped };
        } else if (result && typeof (result as any).build === 'function') {
          mainNode = (result as any).build();
        } else {
          mainNode = result;
        }
      } finally {
        activeModuleScope = prevScope;
      }

      return {
        type: CuratorNodeType.Module,
        name,
        ...(scope.description ? { description: scope.description } : {}),
        ...(scope.params ? { params: scope.params } : {}),
        main: mainNode,
        ...(Object.keys(scope.subroutines).length > 0 ? { subroutines: scope.subroutines } : {}),
        ...(scope.subscriptions.length > 0 ? { subscriptions: scope.subscriptions } : {}),
      };
    }

    const { main: rawMain, subroutines, ...restOptions } = setupOrOptions;
    const main = rawMain && typeof (rawMain as any).build === 'function' ? (rawMain as any).build() : rawMain;
    let subroutinesMap: Record<string, CuratorSubroutine> | undefined;
    if (Array.isArray(subroutines)) {
      subroutinesMap = {};
      for (const subItem of subroutines) {
        const subName = subItem.subroutineName || subItem.name;
        subroutinesMap[subName] = subItem.definition;
      }
    } else if (subroutines) {
      subroutinesMap = {};
      for (const [key, val] of Object.entries(subroutines)) {
        subroutinesMap[key] = (val && typeof val === 'function' && 'definition' in val)
          ? (val as TypedSubroutine).definition
          : (val as CuratorSubroutine);
      }
    }
    return {
      type: CuratorNodeType.Module,
      name,
      ...restOptions,
      main,
      ...(subroutinesMap ? { subroutines: subroutinesMap } : {}),
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
      ...(args ? { args } : {}),
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
   * Merge state with the provided record.
   */
  static setState(state: Record<string, any>): CuratorSetStateNode {
    return { type: CuratorNodeType.SetState, state };
  }

  /**
   * Wait for human input from the UI or CLI.
   */
  static humanInput(
    prompt: string,
    inputType: 'text' | 'choices' | 'file' = 'text',
    choices?: (string | CuratorChoiceItem)[] | string,
    options?: { targetUserId?: number; as?: string | TypedPathProxy<any> | any; blocking?: boolean; timeoutSeconds?: number; name?: string }
  ): CuratorHumanInputNode {
    const { as, ...rest } = options || {};
    const cleanAs = toVarName(as);
    return {
      type: CuratorNodeType.HumanInput,
      prompt,
      inputType,
      choices,
      ...rest,
      ...(cleanAs ? { as: cleanAs } : {}),
    };
  }

  /**
   * Universal affordance / choice verb.
   * Presents a set of choices to the user/actor and awaits selection if blocking.
   */
  static choice(
    prompt: string,
    choices: (string | CuratorChoiceItem)[] | string,
    options?: { targetUserId?: number; as?: string | TypedPathProxy<any> | any; blocking?: boolean; timeoutSeconds?: number; name?: string }
  ): CuratorHumanInputNode {
    return CuratorCoreBuilder.humanInput(prompt, 'choices', choices, {
      blocking: true,
      ...options,
    });
  }

  /**
   * Call an LLM agent with tools.
   */
  static agent(options: Omit<CuratorAgentNode, 'type'>): CuratorAgentNode {
    return { type: CuratorNodeType.Agent, ...options };
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
   */
  static tool(toolName: string, args?: Record<string, any>, as?: string | TypedPathProxy<any> | any): CuratorToolNode {
    const evaluatedArgs: Record<string, any> = {};
    if (args) {
      for (const [k, v] of Object.entries(args)) {
        evaluatedArgs[k] = typeof v === 'function' ? `(${v.toString()})(context)` : v;
      }
    }
    const cleanAs = toVarName(as);
    const node: CuratorToolNode = { type: CuratorNodeType.Tool, toolName, args: evaluatedArgs };
    if (cleanAs) node.as = cleanAs;
    return node;
  }

  /**
   * Reference a sensitive credential or API token via a secure placeholder.
   * e.g. CuratorCoreBuilder.secret('GITHUB_TOKEN') -> '$secret:GITHUB_TOKEN'
   */
  static secret(key: string): string {
    return `$secret:${key}`;
  }
}

/**
 * Composition API event listener hook.
 * Auto-registers to the active module's static subscriptions if called within defineModule setup(),
 * and returns the created CuratorSubscribeNode.
 */
export function onEvent(
  eventName: string,
  handler: string | TypedSubroutine,
  options: { as?: string | TypedPathProxy<any> | any; when?: string; scope?: 'conversation' | 'project' } = {}
): CuratorSubscribeNode {
  const node = CuratorCoreBuilder.subscribe(eventName, handler, options);
  if (activeModuleScope) {
    activeModuleScope.subscriptions.push(node);
    if (typeof handler === 'function' && 'definition' in handler) {
      const typed = handler as TypedSubroutine;
      const subName = (typed.subroutineName || typed.name).replace(/^#+/, '');
      activeModuleScope.subroutines[subName] = typed.definition;
    }
  }
  return node;
}

/**
 * First-class callable subroutine definition.
 * Calling the returned function produces a CuratorCallNode ({ type: 'Curator_Call', ref: '#name' }).
 */
export interface TypedSubroutine<TParams = any> {
  (args?: Record<string, any>, options?: { as?: string; mode?: 'child' | 'inline' }): CuratorCallNode;
  name: string;
  subroutineName: string;
  ref: string;
  definition: CuratorSubroutine;
  inline: (args?: Record<string, any>, options?: { as?: string }) => CuratorCallNode;
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
        returns?: string;
        description?: string;
        defaultMode?: 'child' | 'inline';
      },
  subOptions?: {
    params?: Record<string, CuratorParamSpec>;
    returns?: string;
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
    returns = subOptions?.returns;
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
    returns = opts.returns;
    description = opts.description;
    defaultMode = opts.defaultMode;
  } else {
    resolvedBody = bodyOrOptions;
    params = subOptions?.params;
    returns = subOptions?.returns;
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

  const fn = function (
    args?: Record<string, any>,
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
  fn.inline = (args?: Record<string, any>, callOptions?: { as?: string }): CuratorCallNode => {
    return CuratorCoreBuilder.call(ref, args, { mode: 'inline', ...callOptions });
  };

  return fn;
}

/**
 * Composition API module definition function.
 * e.g. defineModule('my_module', () => { ... })
 */
export const defineModule = CuratorCoreBuilder.defineModule;

// Core standalone workflow verbs for direct import
export const seq = CuratorCoreBuilder.seq;
export const choice = CuratorCoreBuilder.choice;
export const humanInput = CuratorCoreBuilder.humanInput;
export const ifElse = CuratorCoreBuilder.ifElse;
export const whileLoop = CuratorCoreBuilder.whileLoop;
export const repeat = CuratorCoreBuilder.repeat;
export const every = CuratorCoreBuilder.every;
export const forEach = CuratorCoreBuilder.forEach;
export const emitEvent = CuratorCoreBuilder.emitEvent;
export const waitEvent = CuratorCoreBuilder.waitEvent;
export const setState = CuratorCoreBuilder.setState;
export const callSubroutine = CuratorCoreBuilder.call;
export const sub = CuratorCoreBuilder.sub;
export const subscribe = CuratorCoreBuilder.subscribe;
export const unsubscribe = CuratorCoreBuilder.unsubscribe;
export const tool = CuratorCoreBuilder.tool;
export const script = CuratorCoreBuilder.script;
export const agent = CuratorCoreBuilder.agent;
export const secret = CuratorCoreBuilder.secret;
export const assign = CuratorCoreBuilder.assign;


