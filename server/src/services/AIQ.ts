/**
 * AIQ — fluent builder for composing agentic tool call pipelines.
 *
 * Produces the exact toolCalls[] JSON structure that RequestProcessor understands.
 * This builder has no side-effects — call .toJSON() to get the serializable result.
 *
 * Usage:
 *   const chain = AIQ
 *     .run("upsert_resource", { uri: "https://example.com" })
 *     .then("fetch_html",     { url: "{{resource.uri}}" })
 *     .spawn("ask_llm",       { prompt: "Summarize." })
 *     .toJSON();
 *
 * Plugin (jQuery-style) usage:
 *   // Register once (e.g. in your module's init):
 *   AIQ.register('feed');
 *   AIQ.register('upsert');
 *   AIQ.registerSpawn('ask_llm');
 *
 *   // Then chain naturally:
 *   AIQ.start()
 *     .feed({ url: 'https://example.com' })
 *     .upsert({ data: '{{feed.result}}' })
 *     .ask_llm({ prompt: 'Summarize.' })
 *     .toJSON();
 *
 * TypeScript augmentation (in your own .d.ts or module file):
 *   declare module './AIQ' {
 *     interface AIQPlugins {
 *       feed(args?: Record<string, any>): AIQ;
 *       upsert(args?: Record<string, any>): AIQ;
 *     }
 *   }
 */

import { TOOL_NAMES } from './tools/manifest.js';

/** Extend this interface to get type-safe plugin methods on AIQ. */
export interface AIQPlugins {
    ask(promptOrArgs: string | Record<string, any>): AIQ;
    feed(urlOrArgs: string | Record<string, any>): AIQ;
    foreach(chainOrFn: AIQ | ((item: any) => AIQ)): AIQ;
}

/**
 * AIQBuilder — Internal fluent builder for composing agentic tool call pipelines.
 */
export class AIQBuilder {
    /**
     * Track all root builder instances created during script execution.
     */
    static rootChains: AIQBuilder[] = [];

    /**
     * Track the last created builder instance globally. 
     */
    static lastCreated: AIQBuilder | null = null;

    /**
     * jQuery-style reference to the prototype — lets external code write:
     *   AIQ.fn.myTool = function(args) { return this.then('myTool', args); }
     */
    static readonly fn: Record<string, (...args: any[]) => any> =
        AIQBuilder.prototype as unknown as Record<string, (...args: any[]) => any>;

    private calls: any[] = [];
    private pendingSpawn = false;

    constructor(calls: any[] = []) {
        this.calls = calls;
        AIQBuilder.lastCreated = this;
        AIQBuilder.rootChains.push(this);
    }

    // ─── Plugin registration (jQuery $.fn pattern) ───────────────────────────

    /**
     * Register a tool name as an inline (sequential) plugin method.
     */
    static register(
        toolName: string,
        defaults: Record<string, any> = {},
    ): void {
        (AIQBuilder.prototype as any)[toolName] = function (
            args: Record<string, any> = {},
        ): AIQBuilder {
            return this.then(toolName, { ...defaults, ...args });
        };
    }

    /**
     * Like `register`, but the generated method calls `this.spawn()` instead of `this.then()`.
     */
    static registerSpawn(
        toolName: string,
        defaults: Record<string, any> = {},
    ): void {
        (AIQBuilder.prototype as any)[toolName] = function (
            args: Record<string, any> = {},
        ): AIQBuilder {
            return this.spawn(toolName, { ...defaults, ...args });
        };
    }

    // ─── Aliases ──────────────────────────────────────────────────────────────

    /** Shorthand for ask_llm. Accepts a string prompt or an args object. */
    ask(promptOrArgs: string | Record<string, any>): this {
        const args = typeof promptOrArgs === 'string' ? { prompt: promptOrArgs } : promptOrArgs;
        return (this as any).ask_llm(args);
    }

    /** Shorthand for process_feed. Accepts a string URL or an args object. */
    feed(urlOrArgs: string | Record<string, any>): this {
        const args = typeof urlOrArgs === 'string' ? { url: urlOrArgs } : urlOrArgs;
        return (this as any).process_feed(args);
    }

    // ─── Entry points ────────────────────────────────────────────────────────

    /** Entry point for in-process execution. */
    static chain(toolName?: string, args?: any): AIQBuilder & AIQPlugins {
        return new AIQBuilder().chain(toolName, args) as any;
    }

    /** Entry point for detached/database-backed execution. */
    static spawn(toolName?: string, args?: any): AIQBuilder & AIQPlugins {
        return new AIQBuilder().spawn(toolName, args) as any;
    }

    /** Entry point for an empty chain. */
    static empty(): AIQBuilder & AIQPlugins {
        return new AIQBuilder() as any;
    }

    /** Entry point used by the AIQ() factory. */
    static start(): AIQBuilder & AIQPlugins {
        return new AIQBuilder() as any;
    }

    /**
     * One-stop initialization: registers all known tools from the manifest.
     * Allows using AIQ.feed(), AIQ.ask(), etc. without manual registration.
     */
    static init(): typeof AIQ {
        TOOL_NAMES.forEach(name => {
            AIQBuilder.register(name);
        });
        return AIQ;
    }

    // ─── Factory helpers ──────────────────────────────────────────────────────

    /** Appends a tool call to the chain. (In-process execution) */
    chain(toolName?: string, args?: any): this {
        if (!toolName) {
            this.pendingSpawn = false;
            return this;
        }
        this.calls.push({ name: toolName, args: args ?? {}, spawn: false });
        return this;
    }

    /** Appends a tool call that should be spawned as a detached request. */
    spawn(toolName?: string, args?: any): this {
        if (!toolName) {
            this.pendingSpawn = true;
            return this;
        }
        this.calls.push({ name: toolName, args: args ?? {}, spawn: true });
        return this;
    }

    /**
     * Legacy support for functional chaining
     */
    then(
        nameOrFn: string | ((res: Record<string, string>) => AIQBuilder), 
        args: Record<string, any> = {}, 
        callbacks?: Record<string, any>
    ): this {
        if (typeof nameOrFn === 'function') {
            const childChain = nameOrFn(resourceProxy);
            this.onSuccess().chain(childChain);
            return this;
        }
        const spawn = this.pendingSpawn;
        this.pendingSpawn = false; // Reset after use
        this.calls.push({ name: nameOrFn, args, spawn, ...(callbacks ? { callbacks } : {}) });
        return this;
    }

    /**
     * Start a success flow callback.
     * Usage: .onSuccess().spawn(chain) or .onSuccess().chain(chain)
     */
    onSuccess(): ToolFlowBuilder {
        const last = this.calls[this.calls.length - 1];
        if (!last) throw new Error('AIQ.onSuccess() called on empty chain');
        return new ToolFlowBuilder(last, 'onSuccess', this, resourceProxy);
    }

    /** Alias for onSuccess() */
    onDone(): ToolFlowBuilder {
        return this.onSuccess();
    }

    /**
     * Start a fan-out flow callback for each item in a multivalued result.
     * Usage: .onItemExtracted().spawn(chain) or .onItemExtracted().chain(chain)
     */
    onItemExtracted(): ToolFlowBuilder {
        const last = this.calls[this.calls.length - 1];
        if (!last) throw new Error('AIQ.onItemExtracted() called on empty chain');
        return new ToolFlowBuilder(last, 'onItemExtracted', this, itemProxy);
    }

    /** Alias for onItemExtracted() */
    onItem(): ToolFlowBuilder {
        return this.onItemExtracted();
    }

    /**
     * Start a failure flow callback.
     */
    onFailure(): ToolFlowBuilder {
        const last = this.calls[this.calls.length - 1];
        if (!last) throw new Error('AIQ.onFailure() called on empty chain');
        return new ToolFlowBuilder(last, 'onFailure', this, resourceProxy);
    }

    /**
     * Legacy shorthand for onItemExtracted().spawn(fanOutChain).
     * @deprecated Use .onItemExtracted().spawn(...) or .chain(...)
     */
    foreach(chainOrFn: AIQBuilder | ((item: any) => AIQBuilder)): this {
        return this.onItemExtracted().spawn(chainOrFn) as any;
    }

    /** Serialize the chain to the toolCalls[] format used by RequestProcessor. */
    toJSON(): any[] {
        return JSON.parse(JSON.stringify(this.calls));
    }

    get primaryToolName(): string | null {
        return this.calls[0]?.name ?? null;
    }
}

/**
 * ToolFlowBuilder — handles the spawn/chain decision for callbacks.
 */
class ToolFlowBuilder {
    constructor(
        private call: any,
        private key: string,
        private parent: AIQBuilder,
        private proxy: any
    ) {}

    /**
     * Execute the callback as a new detached child Request in the database.
     */
    spawn(chainOrFn: AIQBuilder | ((item: Record<string, string>, context: any) => AIQBuilder)): AIQBuilder {
        const childChain = typeof chainOrFn === 'function' ? chainOrFn(this.proxy, contextProxy) : chainOrFn;
        this.call.callbacks = this.call.callbacks ?? {};
        this.call.callbacks[this.key] = { spawn: childChain.toJSON() };
        return this.parent;
    }

    /**
     * Execute the callback immediately in the same request loop (inline).
     */
    chain(chainOrFn: AIQBuilder | ((item: Record<string, string>, context: any) => AIQBuilder)): AIQBuilder {
        const childChain = typeof chainOrFn === 'function' ? chainOrFn(this.proxy, contextProxy) : chainOrFn;
        this.call.callbacks = this.call.callbacks ?? {};
        this.call.callbacks[this.key] = { chain: childChain.toJSON() };
        return this.parent;
    }

    /**
     * Yield to a saved script by name.
     */
    yieldScript(scriptName: string): AIQBuilder {
        this.call.callbacks = this.call.callbacks ?? {};
        this.call.callbacks[this.key] = { yieldTemplateName: scriptName };
        return this.parent;
    }
}

/**
 * AIQ — The primary entry point for the agentic toolkit.
 * Works as a function: AIQ().process_feed(...)
 * Or as a namespace: AIQ.run("tool", ...)
 */
export const AIQ = (() => {
    const factory = () => AIQBuilder.start();
    
    // Attach all static methods and properties from AIQBuilder
    Object.getOwnPropertyNames(AIQBuilder).forEach(name => {
        const desc = Object.getOwnPropertyDescriptor(AIQBuilder, name);
        if (desc) {
            Object.defineProperty(factory, name, desc);
        }
    });
    
    return factory as (typeof AIQBuilder & (() => AIQBuilder & AIQPlugins));
})();

// Auto-initialize behind the scenes
AIQBuilder.init();

/** Type alias for better clarity in external code */
export type AIQ = AIQBuilder & AIQPlugins;

/**
 * Build a runtime reference to a field produced by a previous tool call.
 * Resolved by RequestProcessor when the chain executes.
 *
 *   ref('feed')              → "{{feed}}"
 *   ref('feed', 'result')    → "{{feed.result}}"
 *   ref('feed', 'items[0]')  → "{{feed.items[0]}}"
 *   ref('item')              → "{{item}}"  (inside onItemExtracted child chains)
 */
export function ref(toolName: string, field?: string): string {
    return field ? `{{${toolName}.${field}}}` : `{{${toolName}}}`;
}

/**
 * A build-time proxy for the `item` variable inside `onItemExtracted` callbacks.
 * Property access produces `{{item.field}}` template strings.
 *
 * Used automatically when you pass a callback to `.onItemExtracted()`:
 *   .onItemExtracted(item => start().upsert_resource({ uri: item.uri, title: item.title }))
 */
function createRecursiveProxy(root: string, path: string[] = []): any {
    return new Proxy({}, {
        get(_target: any, prop: string) {
            if (typeof prop === 'symbol') return undefined;
            if (prop === 'toString' || prop === 'valueOf' || prop === 'toJSON') {
                const fullPath = [root, ...path].join('.');
                return () => `{{${fullPath}}}`;
            }
            return createRecursiveProxy(root, [...path, prop]);
        },
        [Symbol.toPrimitive](hint: string) {
            return `{{${[root, ...path].join('.')}}}`;
        }
    } as any);
}

export const itemProxy: any = createRecursiveProxy('item');
export const toolDataProxy: any = createRecursiveProxy('toolData');
export const contextProxy: any = new Proxy({}, {
    get(_target: any, prop: string) {
        if (typeof prop === 'symbol' || prop === 'toJSON') return undefined;
        if (TOOL_NAMES.includes(prop as any)) return toolProxy(prop);
        return toolDataProxy[prop];
    },
    has(_target, _prop) { return true; },
});
export const resourceProxy: any = createRecursiveProxy('resource');
export function toolProxy(toolName: string): any {
    return createRecursiveProxy(toolName);
}
