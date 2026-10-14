import vm from 'node:vm';
import { CuratorBuilder } from './CuratorBuilder.js';
import { validateCuratorAst } from './CuratorAstValidation.js';
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
    secret: (key) => CuratorBuilder.secret(key),
    // 7. Builder Reference
    CuratorBuilder,
    builder: CuratorBuilder,
};
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
    if (!result || typeof result !== 'object' || !result.type) {
        throw new Error(`CoffeeScript compilation succeeded, but did not return a valid AST node. Received: ${typeof result}`);
    }
    const validation = validateCuratorAst(result);
    if (!validation.valid) {
        throw new Error(`Generated CoffeeScript AST is invalid: ${validation.errors.join('; ')}`);
    }
    return validation.node;
}
//# sourceMappingURL=CoffeeVerbs.js.map