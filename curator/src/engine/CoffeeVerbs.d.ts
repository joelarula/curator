import { CuratorBuilder } from './CuratorBuilder.js';
import type { CuratorAstNode } from './CuratorAst.js';
export declare const coffeeAstVerbs: {
    tool: (toolName: string, args?: Record<string, any>) => import("./CuratorAst.js").CuratorToolNode;
    prompt: (promptText: string, inputType?: "text" | "choices" | "file", choices?: string[]) => import("./CuratorAst.js").CuratorHumanInputNode;
    humanInput: (promptText: string, inputType?: "text" | "choices" | "file", choices?: string[]) => import("./CuratorAst.js").CuratorHumanInputNode;
    set_state: (state: Record<string, any>) => import("./CuratorAst.js").CuratorSetStateNode;
    setState: (state: Record<string, any>) => import("./CuratorAst.js").CuratorSetStateNode;
    assign: (key: string, expression: string | ((ctx: any) => any)) => import("./CuratorAst.js").CuratorAssignNode;
    seq: (name: string, ...nodes: CuratorAstNode[]) => import("./CuratorAst.js").CuratorSequentialNode;
    parallel: (name: string, ...nodes: CuratorAstNode[]) => import("./CuratorAst.js").CuratorParallelNode;
    if_else: (condition: string | ((ctx: any) => boolean), thenBranch: CuratorAstNode, elseBranch?: CuratorAstNode) => import("./CuratorAst.js").CuratorIfElseNode;
    ifElse: (condition: string | ((ctx: any) => boolean), thenBranch: CuratorAstNode, elseBranch?: CuratorAstNode) => import("./CuratorAst.js").CuratorIfElseNode;
    while_loop: (condition: string | ((ctx: any) => boolean), body: CuratorAstNode) => import("./CuratorAst.js").CuratorWhileNode;
    whileLoop: (condition: string | ((ctx: any) => boolean), body: CuratorAstNode) => import("./CuratorAst.js").CuratorWhileNode;
    for_each: (collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string) => import("./CuratorAst.js").CuratorForEachNode;
    forEach: (collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string) => import("./CuratorAst.js").CuratorForEachNode;
    emit_event: (eventName: string, payload?: any, targetAgentId?: any) => import("./CuratorAst.js").CuratorEmitEventNode;
    emitEvent: (eventName: string, payload?: any, targetAgentId?: any) => import("./CuratorAst.js").CuratorEmitEventNode;
    wait_event: (eventName: string, payloadAlias?: string) => import("./CuratorAst.js").CuratorWaitEventNode;
    waitEvent: (eventName: string, payloadAlias?: string) => import("./CuratorAst.js").CuratorWaitEventNode;
    script: (code: string | ((ctx: any) => any), language?: "javascript" | "coffeescript") => import("./CuratorAst.js").CuratorScriptNode;
    agent: (options: any) => import("./CuratorAst.js").CuratorAgentNode;
    secret: (key: string) => string;
    CuratorBuilder: typeof CuratorBuilder;
    builder: typeof CuratorBuilder;
};
/**
 * Compiles a natural CoffeeScript workflow string into a formal Execution AST.
 */
export declare function compileCoffeeScriptToAST(coffeeScriptCode: string, initialContext?: Record<string, any>): Promise<CuratorAstNode>;
//# sourceMappingURL=CoffeeVerbs.d.ts.map