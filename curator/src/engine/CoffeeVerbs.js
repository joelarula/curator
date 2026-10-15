import vm from 'node:vm';
import { CuratorBuilder } from './CuratorBuilder.js';
import { validateCuratorAst } from './CuratorAstValidation.js';
import { vocabularyRegistry } from './builder/VocabularyRegistry.js';
export const coffeeAstVerbs = {
    // 1. Tool execution
    tool: (toolName, args) => CuratorBuilder.tool(toolName, args),
    // 2. Human in the loop / prompts
    prompt: (promptText, inputType = 'text', choices) => CuratorBuilder.humanInput(promptText, inputType, choices),
    humanInput: (promptText, inputType = 'text', choices) => CuratorBuilder.humanInput(promptText, inputType, choices),
    // 3. State management & variables
    set_state: (state) => CuratorBuilder.setState(state),
    setState: (state) => CuratorBuilder.setState(state),
    assign: (key, expression) => CuratorBuilder.assign(key, expression),
    // 4. Control flow & branching
    seq: (name, ...nodes) => CuratorBuilder.seq(name, ...nodes),
    parallel: (name, ...nodes) => CuratorBuilder.parallel(name, ...nodes),
    if_else: (condition, thenBranch, elseBranch) => CuratorBuilder.ifElse(condition, thenBranch, elseBranch),
    ifElse: (condition, thenBranch, elseBranch) => CuratorBuilder.ifElse(condition, thenBranch, elseBranch),
    while_loop: (condition, body) => CuratorBuilder.whileLoop(condition, body),
    whileLoop: (condition, body) => CuratorBuilder.whileLoop(condition, body),
    for_each: (collectionExpression, body, iteratorName) => CuratorBuilder.forEach(collectionExpression, body, iteratorName),
    forEach: (collectionExpression, body, iteratorName) => CuratorBuilder.forEach(collectionExpression, body, iteratorName),
    // 5. Distributed Pub/Sub Events
    emit_event: (eventName, payload, targetAgentId) => CuratorBuilder.emitEvent(eventName, payload, targetAgentId),
    emitEvent: (eventName, payload, targetAgentId) => CuratorBuilder.emitEvent(eventName, payload, targetAgentId),
    wait_event: (eventName, payloadAlias) => CuratorBuilder.waitEvent(eventName, payloadAlias),
    waitEvent: (eventName, payloadAlias) => CuratorBuilder.waitEvent(eventName, payloadAlias),
    // 6. Embedded scripts & agent calls
    script: (code, language = 'coffeescript') => CuratorBuilder.script(code, language),
    agent: (options) => CuratorBuilder.agent(options),
    // 7. Sensitive tokens & secret placeholders
    secret: (key) => CuratorBuilder.secret(key),
    // 8. Agentic SpeechActs & Classical Discourse Forms
    ask: (options) => CuratorBuilder.ask(options),
    propose: (options) => CuratorBuilder.propose(options),
    inform: (options) => CuratorBuilder.inform(options),
    vote: (options) => CuratorBuilder.vote(options),
    synthesize: (options) => CuratorBuilder.synthesize(options),
    broadcast: (options) => CuratorBuilder.broadcast(options),
    dialog: (targetUri) => CuratorBuilder.dialog(targetUri),
    dialogue: (targetUri) => CuratorBuilder.dialogue(targetUri),
    forum: (roomUri) => CuratorBuilder.forum(roomUri),
    polylogue: (roomUri) => CuratorBuilder.polylogue(roomUri),
    enter_forum: (roomUri, options = {}) => CuratorBuilder.enter_forum(roomUri, options),
    soliloquy: (thought) => CuratorBuilder.soliloquy(thought),
    monologue: (topic, narrative) => CuratorBuilder.monologue(topic, narrative),
    trialogue: (agentB, agentC, topic) => CuratorBuilder.trialogue(agentB, agentC, topic),
    catechism: (targetUri, queryOrOptions) => CuratorBuilder.catechism(targetUri, queryOrOptions),
    dialectic: (options) => CuratorBuilder.dialectic(options),
    apostrophe: (absentEntity, assertion) => CuratorBuilder.apostrophe(absentEntity, assertion),
    grant_lease: (options) => CuratorBuilder.grant_lease(options),
    revoke_lease: (options) => CuratorBuilder.revoke_lease(options),
    as_role: (roleName, actionsOrFn) => CuratorBuilder.as_role(roleName, actionsOrFn),
    with_role: (roleName, actionsOrFn) => CuratorBuilder.with_role(roleName, actionsOrFn),
    role: (roleName) => CuratorBuilder.role(roleName),
    // 9. Vocabulary Extension
    extend_verbs: (verbs) => extendCoffeeAstVerbs(verbs),
    // 10. Builder Reference
    CuratorBuilder,
    builder: CuratorBuilder,
};
/**
 * Dynamically extends coffeeAstVerbs and registers new vocabulary composables into the engine.
 */
export function extendCoffeeAstVerbs(newVerbs) {
    Object.assign(coffeeAstVerbs, newVerbs);
    vocabularyRegistry.registerMany(newVerbs);
}
/**
 * Compiles a natural CoffeeScript workflow string into a formal Execution AST.
 */
export async function compileCoffeeScriptToAST(coffeeScriptCode, initialContext = {}) {
    const coffee = (await import('coffeescript')).default;
    const compiledJs = coffee.compile(coffeeScriptCode, { bare: true, header: false });
    const sandbox = {
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
    }
    else if (sandbox.exports?.run) {
        result = sandbox.exports.run;
    }
    // If the script returned a function (factory), execute it
    if (typeof result === 'function') {
        result = result({ context: initialContext, ...coffeeAstVerbs });
    }
    // If result is a fluent builder with a .build() method, automatically resolve it
    if (result && typeof result === 'object' && typeof result.build === 'function') {
        result = result.build();
    }
    if (!result || typeof result !== 'object' || !result.type) {
        throw new Error(`CoffeeScript compilation succeeded, but did not return a valid AST node. Received: ${typeof result}`);
    }
    const validation = validateCuratorAst(result);
    if (!validation.valid) {
        throw new Error(`Generated CoffeeScript AST is invalid: ${validation.errors.join('; ')}`);
    }
    return validation.node;
}
