import vm from 'node:vm';
import { CuratorBuilder } from './CuratorBuilder.js';
import type { CuratorAstNode } from './CuratorAst.js';
import { validateCuratorAst } from './CuratorAstValidation.js';
import { vocabularyRegistry, type VocabularyComposable } from './builder/VocabularyRegistry.js';

export const coffeeAstVerbs: Record<string, any> = {
  // 1. Tool execution
  tool: (toolName: string, args?: Record<string, any>) =>
    CuratorBuilder.tool(toolName, args),

  // 2. Human in the loop / prompts
  prompt: (promptText: string, inputType: 'text' | 'choices' | 'file' = 'text', choices?: string[]) =>
    CuratorBuilder.humanInput(promptText, inputType, choices),
  humanInput: (promptText: string, inputType: 'text' | 'choices' | 'file' = 'text', choices?: string[]) =>
    CuratorBuilder.humanInput(promptText, inputType, choices),

  // 3. State management & variables
  set_state: (state: Record<string, any>) => CuratorBuilder.setState(state),
  setState: (state: Record<string, any>) => CuratorBuilder.setState(state),
  assign: (key: string, expression: string | ((ctx: any) => any)) =>
    CuratorBuilder.assign(key, expression),

  // 4. Control flow & branching
  seq: (name: string, ...nodes: CuratorAstNode[]) =>
    CuratorBuilder.seq(name, ...nodes),
  parallel: (name: string, ...nodes: CuratorAstNode[]) =>
    CuratorBuilder.parallel(name, ...nodes),
  if_else: (condition: string | ((ctx: any) => boolean), thenBranch: CuratorAstNode, elseBranch?: CuratorAstNode) =>
    CuratorBuilder.ifElse(condition, thenBranch, elseBranch),
  ifElse: (condition: string | ((ctx: any) => boolean), thenBranch: CuratorAstNode, elseBranch?: CuratorAstNode) =>
    CuratorBuilder.ifElse(condition, thenBranch, elseBranch),
  while_loop: (condition: string | ((ctx: any) => boolean), body: CuratorAstNode) =>
    CuratorBuilder.whileLoop(condition, body),
  whileLoop: (condition: string | ((ctx: any) => boolean), body: CuratorAstNode) =>
    CuratorBuilder.whileLoop(condition, body),
  for_each: (collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string) =>
    CuratorBuilder.forEach(collectionExpression, body, iteratorName),
  forEach: (collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string) =>
    CuratorBuilder.forEach(collectionExpression, body, iteratorName),

  // 5. Distributed Pub/Sub Events
  emit_event: (eventName: string, payload?: any, targetAgentId?: any) =>
    CuratorBuilder.emitEvent(eventName, payload, targetAgentId),
  emitEvent: (eventName: string, payload?: any, targetAgentId?: any) =>
    CuratorBuilder.emitEvent(eventName, payload, targetAgentId),
  wait_event: (eventName: string, payloadAlias?: string) =>
    CuratorBuilder.waitEvent(eventName, payloadAlias),
  waitEvent: (eventName: string, payloadAlias?: string) =>
    CuratorBuilder.waitEvent(eventName, payloadAlias),

  // 6. Embedded scripts & agent calls
  script: (code: string | ((ctx: any) => any), language: 'javascript' | 'coffeescript' = 'coffeescript') =>
    CuratorBuilder.script(code, language),
  agent: (options: any) => CuratorBuilder.agent(options),

  // 7. Sensitive tokens & secret placeholders
  secret: (key: string) => CuratorBuilder.secret(key),

  // 8. Agentic SpeechActs & Classical Discourse Forms
  ask: (options: any) => CuratorBuilder.ask(options),
  propose: (options: any) => CuratorBuilder.propose(options),
  inform: (options: any) => CuratorBuilder.inform(options),
  vote: (options: any) => CuratorBuilder.vote(options),
  synthesize: (options: any) => CuratorBuilder.synthesize(options),
  broadcast: (options: any) => CuratorBuilder.broadcast(options),
  dialog: (targetUri: string) => CuratorBuilder.dialog(targetUri),
  dialogue: (targetUri: string) => CuratorBuilder.dialogue(targetUri),
  forum: (roomUri: string) => CuratorBuilder.forum(roomUri),
  polylogue: (roomUri: string) => CuratorBuilder.polylogue(roomUri),
  enter_forum: (roomUri: string, options: any = {}) =>
    CuratorBuilder.enter_forum(roomUri, options),
  soliloquy: (thought: any) => CuratorBuilder.soliloquy(thought),
  monologue: (topic: string, narrative: any) => CuratorBuilder.monologue(topic, narrative),
  trialogue: (agentB: string, agentC: string, topic?: string) => CuratorBuilder.trialogue(agentB, agentC, topic),
  catechism: (targetUri: string, queryOrOptions: any) => CuratorBuilder.catechism(targetUri, queryOrOptions),
  dialectic: (options: any) => CuratorBuilder.dialectic(options),
  apostrophe: (absentEntity: string, assertion: any) => CuratorBuilder.apostrophe(absentEntity, assertion),
  grant_lease: (options: any) => CuratorBuilder.grant_lease(options),
  revoke_lease: (options: any) => CuratorBuilder.revoke_lease(options),
  as_role: (roleName: string, actionsOrFn?: any) => CuratorBuilder.as_role(roleName, actionsOrFn),
  with_role: (roleName: string, actionsOrFn?: any) => CuratorBuilder.with_role(roleName, actionsOrFn),
  role: (roleName: string) => CuratorBuilder.role(roleName),

  // 9. Vocabulary Extension
  extend_verbs: (verbs: Record<string, VocabularyComposable>) => extendCoffeeAstVerbs(verbs),

  // 10. Builder Reference
  CuratorBuilder,
  builder: CuratorBuilder,
};

/**
 * Dynamically extends coffeeAstVerbs and registers new vocabulary composables into the engine.
 */
export function extendCoffeeAstVerbs(newVerbs: Record<string, VocabularyComposable>): void {
  Object.assign(coffeeAstVerbs, newVerbs);
  vocabularyRegistry.registerMany(newVerbs);
}

/**
 * Compiles a natural CoffeeScript workflow string into a formal Execution AST.
 */
export async function compileCoffeeScriptToAST(
  coffeeScriptCode: string,
  initialContext: Record<string, any> = {}
): Promise<CuratorAstNode> {
  const coffee = (await import('coffeescript')).default;
  const compiledJs = coffee.compile(coffeeScriptCode, { bare: true, header: false });

  const sandbox: Record<string, any> = {
    console,
    input: initialContext.input ?? '',
    context: initialContext,
    ...coffeeAstVerbs,
    ...vocabularyRegistry.getAll(),
    exports: {},
    module: { exports: {} },
  };

  const vmContext = vm.createContext(sandbox);
  let result = vm.runInContext(compiledJs, vmContext);

  // If module.exports or exports.run was defined, use that
  if (sandbox.module?.exports && Object.keys(sandbox.module.exports).length > 0) {
    result = sandbox.module.exports.run || sandbox.module.exports.default || sandbox.module.exports;
  } else if (sandbox.exports?.run) {
    result = sandbox.exports.run;
  }

  // If the script returned a function (factory), execute it
  if (typeof result === 'function') {
    result = result({ context: initialContext, ...coffeeAstVerbs });
  }

  // If result is a fluent builder with a .build() method, automatically resolve it
  if (result && typeof result === 'object' && typeof (result as any).build === 'function') {
    result = (result as any).build();
  }

  if (!result || typeof result !== 'object' || !result.type) {
    throw new Error(
      `CoffeeScript compilation succeeded, but did not return a valid AST node. Received: ${typeof result}`
    );
  }

  const validation = validateCuratorAst(result);
  if (!validation.valid) {
    throw new Error(`Generated CoffeeScript AST is invalid: ${validation.errors.join('; ')}`);
  }

  return validation.node!;
}

/**
 * Evaluates any natural CoffeeScript code snippet in a sandboxed context and returns the exported result.
 */
export async function evaluateCoffeeScript<T = any>(
  coffeeScriptCode: string,
  initialContext: Record<string, any> = {}
): Promise<T> {
  const coffee = (await import('coffeescript')).default;
  const compiledJs = coffee.compile(coffeeScriptCode, { bare: true, header: false });

  const sandbox: Record<string, any> = {
    console,
    context: initialContext,
    ...coffeeAstVerbs,
    ...vocabularyRegistry.getAll(),
    exports: {},
    module: { exports: {} },
  };

  const vmContext = vm.createContext(sandbox);
  let result = vm.runInContext(compiledJs, vmContext);

  if (sandbox.module?.exports && Object.keys(sandbox.module.exports).length > 0) {
    result = sandbox.module.exports.default || sandbox.module.exports.run || sandbox.module.exports;
  } else if (sandbox.exports?.default || sandbox.exports?.run) {
    result = sandbox.exports.default || sandbox.exports.run;
  }

  return result as T;
}

/**
 * Compiles a raw CoffeeScript string into JavaScript.
 */
export async function compileCoffeeScript(
  coffeeScriptCode: string,
  options: Record<string, any> = { bare: true, header: false }
): Promise<string> {
  const coffee = (await import('coffeescript')).default;
  return coffee.compile(coffeeScriptCode, options);
}
