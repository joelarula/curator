import type { ASTNode, SequenceNode, ToolNode, ForEachNode, SpawnNode, WhileNode, StateMachineNode, TransitionNode } from './types.js';
import type { ToolName } from '../tools/manifest.js';

let _idCounter = 0;
function nextId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${++_idCounter}`;
}

/**
 * Deeply maps a TypeScript shape into a template proxy shape.
 * This guarantees IDE autocompletion for AST properties, while ensuring
 * every property ultimately resolves to a string template at runtime.
 */
export type Proxyfy<T> = {
    [P in keyof T]: T[P] extends (infer U)[] 
        ? Proxyfy<U>[] & string 
        : T[P] extends object 
            ? Proxyfy<T[P]> & string
            : string;
} & string;

/**
 * Creates a recursive proxy that generates `{{path.to.prop}}` strings
 * whenever it is evaluated or coerced to a string.
 */
export function createTemplateProxy<T = any>(path: string): Proxyfy<T> {
    const proxy = new Proxy({}, {
        get(target, prop) {
            if (typeof prop === 'symbol') return undefined;
            if (prop === 'toJSON') return () => `{{${path}}}`;
            if (prop === 'toString' || prop === 'valueOf') return () => `{{${path}}}`;
            if (prop === 'id') {
                const parts = path.split('.');
                return parts[parts.length - 1];
            }
            return createTemplateProxy(`${path}.${String(prop)}`);
        }
    });
    
    // Explicitly define toString so template literals like `${proxy.prop}` work
    (proxy as any).toString = () => `{{${path}}}`;
    return proxy as unknown as Proxyfy<T>;
}

/**
 * Builder class for constructing if/else branches.
 */
export class BranchBuilder {
    constructor(private node: any, private stateVar?: string) {}

    else(bodyFn: (flow: Pipeline) => void) {
        const falseFlow = new Pipeline();
        falseFlow._activeStateVar = this.stateVar;
        bodyFn(falseFlow);
        this.node.falseBranch = falseFlow.toAST();
    }
}

/**
 * The Phase 4 Typed Pipeline Builder.
 * Replaces the legacy Curator fluent builder with a structured, strongly-typed approach.
 */
export class Pipeline {
    public steps: ASTNode[] = [];
    public meta: Record<string, any> = {};
    public context: Record<string, any> = {};
    public _activeStateVar: string | undefined;

    constructor(options: { meta?: Record<string, any>, context?: Record<string, any> } = {}) {
        this.meta = options.meta || {};
        this.context = options.context || {};
    }

    /**
     * Appends a ToolNode and returns a typed template proxy for its outputs.
     */
    /**
     * Appends a ToolNode and returns a typed template proxy for its outputs.
     */
    tool<T = any>(name: ToolName, args: any = {}): Proxyfy<T> {
        const id = args && args.id ? args.id : nextId(`tool_${name}`);
        
        let sanitizedArgs: any;
        if (typeof args === 'string') {
            sanitizedArgs = args;
        } else if (args && typeof args === 'object') {
            // Remove 'id' from args so it doesn't pollute the tool's runtime arguments
            const { id: _, ...actualArgs } = args;
            // Deep clone and stringify functions to preserve them in AST
            const argsJson = JSON.stringify(actualArgs, (key, value) => {
                if (typeof value === 'function') return value.toString();
                return value;
            });
            sanitizedArgs = argsJson ? JSON.parse(argsJson) : {};
        } else {
            sanitizedArgs = args;
        }

        const node: ToolNode = {
            id,
            type: 'ToolTask',
            tool: name,
            args: sanitizedArgs
        };
        this.steps.push(node);
        return createTemplateProxy<T>(`toolOutputs.${id}`);
    }

    /**
     * Executes the body pipeline for every item in the collection.
     * Iterators are auto-generated behind the scenes for robust type safety.
     */
    forEach<T = any>(
        collection: any, 
        bodyFn: (item: Proxyfy<T>, flow: Pipeline) => void
    ): ForEachNode {
        const childWorkflow = new Pipeline();
        const iteratorName = nextId('iter');
        const itemProxy = createTemplateProxy<T>(iteratorName);
        
        bodyFn(itemProxy, childWorkflow);
        
        const node: ForEachNode = {
            id: nextId('foreach'),
            type: 'ForEach',
            collection: collection && collection.toString ? collection.toString() : String(collection),
            iterator: iteratorName,
            body: childWorkflow.toAST()
        };
        this.steps.push(node);
        return node;
    }

    /**
     * Spawns a detached background request that executes the body pipeline.
     */
    spawn(bodyFn: (flow: Pipeline) => void): SpawnNode {
        const childWorkflow = new Pipeline();
        bodyFn(childWorkflow);
        
        const node: SpawnNode = {
            id: nextId('spawn'),
            type: 'Spawn',
            body: childWorkflow.toAST()
        };
        this.steps.push(node);
        return node;
    }

    /**
     * Executes steps concurrently, waiting for all of them to complete before moving to the next step.
     */
    parallel(bodyFn: (flow: Pipeline) => void): import('./types.js').ParallelNode {
        const childWorkflow = new Pipeline();
        childWorkflow._activeStateVar = this._activeStateVar;
        bodyFn(childWorkflow);

        const node: import('./types.js').ParallelNode = {
            id: nextId('parallel'),
            type: 'Parallel',
            steps: childWorkflow.steps
        };
        this.steps.push(node);
        return node;
    }

    /**
     * Evaluates a condition.
     */
    if(condition: any, bodyFn: (flow: Pipeline) => void): BranchBuilder {
        const trueFlow = new Pipeline();
        trueFlow._activeStateVar = this._activeStateVar;
        bodyFn(trueFlow);
        
        const node: any = {
            id: nextId('if'),
            type: 'IfElse',
            condition: condition && condition.toString ? condition.toString() : String(condition),
            trueBranch: trueFlow.toAST()
        };
        this.steps.push(node);
        return new BranchBuilder(node, this._activeStateVar);
    }

    /**
     * Evaluates equality between two templates.
     */
    match(left: any, right: any, bodyFn: (flow: Pipeline) => void): BranchBuilder {
        const trueFlow = new Pipeline();
        trueFlow._activeStateVar = this._activeStateVar;
        bodyFn(trueFlow);
        
        const node: any = {
            id: nextId('match'),
            type: 'Match',
            left: left && left.toString ? left.toString() : String(left),
            right: right && right.toString ? right.toString() : String(right),
            trueBranch: trueFlow.toAST()
        };
        this.steps.push(node);
        return new BranchBuilder(node, this._activeStateVar);
    }

    /**
     * Evaluates a condition and repeats the body while the condition is true.
     */
    while(condition: any, bodyFn: (flow: Pipeline) => void): WhileNode {
        const bodyFlow = new Pipeline();
        bodyFlow._activeStateVar = this._activeStateVar;
        bodyFn(bodyFlow);
        
        const node: WhileNode = {
            id: nextId('while'),
            type: 'While',
            condition: condition && condition.toString ? condition.toString() : String(condition),
            body: bodyFlow.toAST()
        };
        this.steps.push(node);
        return node;
    }

    /**
     * Creates an autonomous ReAct (Reasoning + Acting) execution loop.
     * Generates a dynamic While/IfElse AST chain that asks the LLM, parses tool calls,
     * executes the mapped tools, appends responses, and repeats until completion.
     */
    react(options: {
        model: string;
        systemPrompt: string;
        messages: any; // e.g. '{{conversation.messages}}'
        tools: ToolName[];
    }): WhileNode {
        const loopActiveKey = nextId('loop_active');
        
        // 1. Initialize loop state context
        this.context[loopActiveKey] = "true";
        this.context.messages = options.messages;

        // 2. Build the while loop
        return this.while(`{{conversation.${loopActiveKey}}} === "true"`, (loop) => {
            const toolListStr = options.tools.join(', ');

            // Ask the LLM to decide on the next step
            const response = loop.tool('ask_llm', {
                model: options.model,
                prompt: `${options.systemPrompt}

You have access to the following tools: [${toolListStr}].
If you need to call a tool, you MUST reply with exactly:
<tool_call>{"name": "tool_name", "arguments": {"arg1": "val1"}}</tool_call>
Wait for the tool result. Do not output anything else.

If you have enough information to answer the user's prompt directly, write the response normally.

Current Conversation History:
{{conversation.messages}}`
            }) as any;

            // Evaluate if response contains a tool call tag
            const checkCall = loop.tool('evaluate_condition', {
                data: { text: response.result },
                evalFn: (data: { text: string }) => {
                    return data.text.includes('<tool_call>');
                }
            }) as any;

            // Branch on whether a tool call is requested
            loop.if(checkCall.data.result, (hasCall) => {
                
                // Parse the tool name and arguments
                const parsed = hasCall.tool('evaluate_condition', {
                    data: { text: response.result },
                    evalFn: (data: { text: string }) => {
                        const match = data.text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
                        if (!match) return { name: '', args: {} };
                        try {
                            const p = JSON.parse(match[1] || '{}');
                            return { name: p.name, args: p.arguments || p.args || {} };
                        } catch {
                            return { name: '', args: {} };
                        }
                    }
                }) as any;

                // Create a dynamic match router for each allowed tool
                for (const tool of options.tools) {
                    hasCall.match(parsed.data.rawValue.name, tool, (branch) => {
                        // Run the actual tool
                        const toolResult = branch.tool(tool, `{{toolData.${parsed.id}.rawValue.args}}`);

                        // Append the results to the message list
                        const appendMsg = branch.tool('evaluate_condition', {
                            data: {
                                currentMessages: '{{conversation.messages}}',
                                modelResponse: response.result,
                                result: toolResult
                            },
                            evalFn: (data: any) => {
                                const msgs = Array.isArray(data.currentMessages) ? data.currentMessages : [];
                                msgs.push({ role: 'assistant', content: data.modelResponse });
                                msgs.push({ role: 'user', content: `Tool response: ${JSON.stringify(data.result.data ?? data.result)}` });
                                return msgs;
                            }
                        }) as any;

                        branch.tool('set_context', { key: 'messages', value: `{{toolData.${appendMsg.id}.rawValue}}` });
                    });
                }
                
            }).else((noCall) => {
                // Terminate loop
                noCall.tool('set_context', { key: loopActiveKey, value: "false" });
            });
        });
    }

    /**
     * Compiles the pipeline to a strict SequenceNode AST.
     */
    toAST(): SequenceNode {
        return {
            id: nextId('seq'),
            type: 'Sequence',
            steps: this.steps
        };
    }

    /**
     * Declares a state machine with a starting state.
     */
    stateMachine(startState: string, buildFn: (sm: StateMachineBuilder) => void): StateMachineNode {
        const stateVar = nextId('state_var');
        const builder = new StateMachineBuilder(nextId('sm'), startState, stateVar);
        buildFn(builder);
        this.steps.push(builder.node);
        return builder.node;
    }

    /**
     * Declares a transition to a target state in the current StateMachine.
     */
    transitionTo(targetState: string): TransitionNode {
        if (!this._activeStateVar) {
            throw new Error(`transitionTo('${targetState}') can only be called inside a StateMachine state flow.`);
        }
        const node: TransitionNode = {
            id: nextId('transition'),
            type: 'Transition',
            targetState,
            stateVar: this._activeStateVar
        };
        this.steps.push(node);
        return node;
    }
}

/**
 * CoffeeFlow — a Pipeline variant designed for CoffeeScript/CffeScript.
 *
 * Unlike Pipeline (which uses auto-generated IDs like `toolOutputs.tool_format_list_2`),
 * CoffeeFlow returns proxies rooted at `toolData.<tool_name>`, which resolve to the
 * already-unwrapped `result.data` value stored by the executor.
 *
 * This means CoffeeScript variables can be used directly in #{...} interpolation:
 *
 *   formatData = flow.tool "format_list", { items: queryData.items, ... }
 *   "REPORTS: #{formatData}"  →  "REPORTS: {{toolData.format_list}}"
 *
 * which resolves at runtime to the formatted string — just like TypeScript's Pipeline.
 */
export class CoffeeFlow {
    public steps: ASTNode[] = [];

    /**
     * Appends a ToolNode and returns a typed template proxy at toolData.<name>.
     * Sub-properties (e.g. queryData.items) resolve to {{toolData.query_resources.items}}.
     */
    tool<T = any>(name: ToolName, args: any = {}): Proxyfy<T> {
        const id = args && args.id ? args.id : nextId(`tool_${name}`);
        
        let sanitizedArgs: any;
        if (typeof args === 'string') {
            sanitizedArgs = args;
        } else if (args && typeof args === 'object') {
            const { id: _, ...actualArgs } = args as any;
            const argsJson = JSON.stringify(actualArgs, (key, value) => {
                if (typeof value === 'function') return value.toString();
                return value;
            });
            sanitizedArgs = argsJson ? JSON.parse(argsJson) : {};
        } else {
            sanitizedArgs = args;
        }

        const node: ToolNode = {
            id,
            type: 'ToolTask',
            tool: name,
            args: sanitizedArgs
        };
        this.steps.push(node);

        // Proxy rooted at toolData.<name> so #{variable} → {{toolData.<name>}}
        return createTemplateProxy<T>(`toolData.${name}`);
    }

    /**
     * Compiles the flow to a strict SequenceNode AST.
     */
    toAST(): SequenceNode {
        return {
            id: nextId('seq'),
            type: 'Sequence',
            steps: this.steps
        };
    }

    /**
     * Alias for toAST() — allows ScriptRunner to evaluate CoffeeFlow scripts
     * the same way it evaluates CuratorBuilder scripts.
     */
    toJSON(): SequenceNode {
        return this.toAST();
    }
}

/**
 * Helper builder class to compile a StateMachine node using fluent API.
 */
export class StateMachineBuilder {
    public node: StateMachineNode;

    constructor(id: string, startState: string, stateVar: string) {
        this.node = {
            id,
            type: 'StateMachine',
            startState,
            stateVar,
            states: {}
        };
    }

    state(stateName: string, bodyFn: (flow: Pipeline) => void): this {
        const flow = new Pipeline();
        flow._activeStateVar = this.node.stateVar;
        bodyFn(flow);
        this.node.states[stateName] = flow.toAST();
        return this;
    }
}
