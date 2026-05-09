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

/** Extend this interface to get type-safe plugin methods on AIQ. */
export interface AIQPlugins {
    ask(promptOrArgs: string | Record<string, any>): AIQ;
    feed(urlOrArgs: string | Record<string, any>): AIQ;
    foreach(chainOrFn: AIQ | ((item: ItemProxyType) => AIQ)): AIQ;
}

/**
 * AIQBuilder — Internal fluent builder for composing agentic tool call pipelines.
 */
class AIQBuilder {
    /**
     * jQuery-style reference to the prototype — lets external code write:
     *   AIQ.fn.myTool = function(args) { return this.then('myTool', args); }
     */
    static readonly fn: Record<string, (...args: any[]) => any> =
        AIQBuilder.prototype as unknown as Record<string, (...args: any[]) => any>;

    private calls: any[] = [];

    constructor(calls: any[] = []) {
        this.calls = calls;
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

    // ─── Factory helpers ──────────────────────────────────────────────────────

    /**
     * Start a new toolchain that executes IMMEDIATELY in the current thread.
     */
    static chain(name: string, args: Record<string, any> = {}): AIQBuilder & AIQPlugins {
        return new AIQBuilder().then(name, args) as any;
    }

    /**
     * Start a new toolchain where the first tool is SPAWNED as a detached request.
     */
    static spawn(name: string, args: Record<string, any> = {}): AIQBuilder & AIQPlugins {
        return new AIQBuilder().spawn(name, args) as any;
    }

    /**
     * Internal factory for empty builder. Use AIQ() function for public access.
     */
    static start(): AIQBuilder & AIQPlugins {
        return new AIQBuilder() as AIQBuilder & AIQPlugins;
    }

    /**
     * Add a tool call that executes INLINE in the current thread (sequential).
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
        this.calls.push({ name: nameOrFn, args, ...(callbacks ? { callbacks } : {}) });
        return this;
    }

    /**
     * Add a tool call that is SPAWNED as a new child Request (parallel).
     */
    spawn(name: string, args: Record<string, any> = {}, callbacks?: Record<string, any>): this {
        this.calls.push({ name, args, spawn: true, ...(callbacks ? { callbacks } : {}) });
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
    foreach(chainOrFn: AIQBuilder | ((item: ItemProxyType) => AIQBuilder)): this {
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
    spawn(chainOrFn: AIQBuilder | ((item: any) => AIQBuilder)): AIQBuilder {
        const childChain = typeof chainOrFn === 'function' ? chainOrFn(this.proxy) : chainOrFn;
        this.call.callbacks = this.call.callbacks ?? {};
        this.call.callbacks[this.key] = { spawn: childChain.toJSON() };
        return this.parent;
    }

    /**
     * Execute the callback immediately in the same request loop (inline).
     */
    chain(chainOrFn: AIQBuilder | ((item: any) => AIQBuilder)): AIQBuilder {
        const childChain = typeof chainOrFn === 'function' ? chainOrFn(this.proxy) : chainOrFn;
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
    
    // Attach static methods
    (factory as any).start = AIQBuilder.start;
    (factory as any).chain = AIQBuilder.chain;
    (factory as any).spawn = AIQBuilder.spawn;
    (factory as any).register = AIQBuilder.register;
    (factory as any).registerSpawn = AIQBuilder.registerSpawn;
    (factory as any).fn = AIQBuilder.fn;
    
    return factory as (typeof AIQBuilder & (() => AIQBuilder & AIQPlugins));
})();

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
export type ItemProxyType = Record<string, string>;

export const itemProxy: ItemProxyType = new Proxy({} as ItemProxyType, {
    get(_target, prop: string) {
        return `{{item.${prop}}}`;
    },
    has(_target, _prop) { return true; },
});

/**
 * A build-time proxy for the `resource` variable inside `onSuccess` or `.then(res => ...)` callbacks.
 * Property access produces `{{resource.field}}` template strings.
 */
export const resourceProxy: Record<string, string> = new Proxy({} as Record<string, string>, {
    get(_target, prop: string) {
        return `{{resource.${prop}}}`;
    },
    has(_target, _prop) { return true; },
});

/**
 * Create a build-time proxy for the output of a named tool in the chain.
 * Property access produces `{{toolName.field}}` template strings.
 *
 *   const feed = toolProxy('process_feed');
 *   start().process_feed({ url: '...' }).upsert_resource({ title: feed.title })
 */
export function toolProxy(toolName: string): Record<string, string> {
    return new Proxy({} as Record<string, string>, {
        get(_target, prop: string) {
            return `{{${toolName}.${prop}}}`;
        },
        has(_target, _prop) { return true; },
    });
}
