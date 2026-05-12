/**
 * AIQ — fluent builder for composing agentic tool call pipelines.
 *
 * Produces the exact toolCalls[] JSON structure that RequestProcessor understands.
 * This builder has no side-effects — call .toJSON() to get the serializable result.
 */

import { TOOL_NAMES } from './tools/manifest.js';
import type { ToolName } from './tools/manifest.js';
import { VOCAB } from '../constants/vocabulary.js';

// ─── Proxies (Must be declared before ToolFlowBuilder uses them) ─────────────

let loopCounter = 0;

/**
 * createRecursiveProxy — helper for creating template-generating proxies.
 */
function createRecursiveProxy(root: string, path: string = ''): any {
    return new Proxy({}, {
        get(target, prop) {
            if (typeof prop === 'symbol') return undefined;
            if (prop === 'toJSON' || prop === 'then') return () => `{{${root}.${path}}}`;
            const fullPath = path ? `${path}.${String(prop)}` : String(prop);

            const proxy = createRecursiveProxy(root, fullPath);
            // Allow template string conversion
            (proxy as any).toString = () => `{{${root}.${fullPath}}}`;
            (proxy as any).valueOf = () => `{{${root}.${fullPath}}}`;
            return proxy;
        }
    });
}

/** itemProxy — generates templates for iterating items (e.g. {{item.id}}). */
export const itemProxy = createRecursiveProxy('item');

/** resourceProxy — generates templates for primary resource (e.g. {{resource.uri}}). */
export const resourceProxy = createRecursiveProxy('resource');

/** contextProxy — generates templates for request context (e.g. {{context.userId}}). */
export const contextProxy = createRecursiveProxy('context');

/** toolProxy — generates templates for tool results (e.g. {{toolData.myTool}}). */
export const toolProxy = createRecursiveProxy('toolData');

/** Shorthand for referencing tool output in templates: AIQ.ref('myTool') -> {{toolData.myTool}} */
export function ref(alias: string) {
    return `{{toolData.${alias}}}`;
}


// ─── Types ──────────────────────────────────────────────────────────────────

/** Generate fluent method signatures for all tools in the manifest */
export type AIQTools = {
    [K in ToolName]: (args?: any) => AIQ;
};

/** Extend this interface to get type-safe plugin methods on AIQ instances. */
export interface AIQPlugins extends AIQTools {
    ask(promptOrArgs: string | Record<string, any>): AIQ;
    feed(urlOrArgs: string | Record<string, any>): AIQ;
    foreach(chainOrFn: AIQ | ((item: any) => AIQ)): AIQ;
    wait(seconds: number): AIQ;
    schedule(date: Date): AIQ;
}

/**
 * AIQFlow — A union type representing a builder augmented with all registered plugins.
 */
export type AIQFlow<T = AIQBuilder> = T & AIQPlugins;

// ─── AIQBuilder ─────────────────────────────────────────────────────────────

export class AIQBuilder {
    private static _state = {
        args: {} as any,
        argString: "" as string
    };

    static init() {
        TOOL_NAMES.forEach(name => {
            if (name.includes('spawn')) {
                this.registerSpawn(name);
            } else {
                this.register(name);
            }
        });
        this.register('upsert_resource', { existent: true });
        this.register('upsert_relation', { existent: true });
    }

    static setArgs(args: any, argString: string = '') {
        this._state = { args, argString };
        (global as any).__AIQ_STATE__ = { args, argString };
    }

    static syncState() {
        const globalState = (global as any).__AIQ_STATE__;
        if (globalState) {
            this._state = globalState;
        }
    }

    static rootChains: AIQBuilder[] = [];
    static readonly VOCAB = VOCAB;
    static lastCreated: AIQBuilder | null = null;
    static readonly fn: Record<string, (...args: any[]) => any> =
        AIQBuilder.prototype as unknown as Record<string, (...args: any[]) => any>;

    private calls: any[] = [];
    private pendingSpawn = false;
    private nextExecutionScheduled: Date | null = null;

    wait(seconds: number): this {
        this.nextExecutionScheduled = new Date(Date.now() + seconds * 1000);
        return this;
    }

    schedule(date: Date): this {
        this.nextExecutionScheduled = date;
        return this;
    }

    constructor(calls: any[] = []) {
        this.calls = calls;
        AIQBuilder.lastCreated = this;
        AIQBuilder.rootChains.push(this);
    }

    static register(toolName: string, defaults: Record<string, any> = {}): void {
        (AIQBuilder.prototype as any)[toolName] = function (args: any = {}) {
            return this.chain(toolName, { ...defaults, ...args });
        };
        (ToolFlowBuilder.prototype as any)[toolName] = function (args: any = {}) {
            return this.chain(toolName, { ...defaults, ...args });
        };
        (AIQBuilder as any)[toolName] = function (args: any = {}) {
            return new AIQBuilder().chain(toolName, { ...defaults, ...args });
        };
    }

    static registerSpawn(toolName: string, defaults: Record<string, any> = {}): void {
        (AIQBuilder.prototype as any)[toolName] = function (args: any = {}) {
            return this.spawn(toolName, { ...defaults, ...args });
        };
        (ToolFlowBuilder.prototype as any)[toolName] = function (args: any = {}) {
            return this.spawn(toolName, { ...defaults, ...args });
        };
        (AIQBuilder as any)[toolName] = function (args: any = {}) {
            return new AIQBuilder().spawn(toolName, { ...defaults, ...args });
        };
    }

    static wait(seconds: number): AIQFlow<AIQBuilder> {
        return new AIQBuilder().wait(seconds) as any;
    }

    static schedule(date: Date): AIQFlow<AIQBuilder> {
        return new AIQBuilder().schedule(date) as any;
    }

    ask(promptOrArgs: string | Record<string, any>): any {
        const args = typeof promptOrArgs === 'string' ? { prompt: promptOrArgs } : promptOrArgs;
        return (this as any).ask_llm(args);
    }

    feed(urlOrArgs: string | Record<string, any>): any {
        const args = typeof urlOrArgs === 'string' ? { url: urlOrArgs } : urlOrArgs;
        return (this as any).process_feed(args);
    }

    static chain(toolName?: string, args?: any): AIQBuilder & AIQPlugins {
        return new AIQBuilder().chain(toolName, args) as any;
    }

    static spawn(toolName?: string, args?: any): AIQBuilder & AIQPlugins {
        return new AIQBuilder().spawn(toolName, args) as any;
    }

    static empty(): AIQBuilder & AIQPlugins {
        return new AIQBuilder() as any;
    }

    static start(): AIQBuilder & AIQPlugins {
        return new AIQBuilder() as any;
    }

    chain(toolName?: string, args?: any): AIQFlow<this> {
        if (!toolName) {
            this.pendingSpawn = false;
            return this as any;
        }
        this.calls.push({ 
            name: toolName, 
            args: args ?? {}, 
            spawn: false,
            executionScheduled: this.nextExecutionScheduled 
        });
        this.nextExecutionScheduled = null;
        return this as any;
    }

    spawn(toolName?: string, args?: any): AIQFlow<this> {
        if (!toolName) {
            this.pendingSpawn = true;
            return this as any;
        }
        this.calls.push({ 
            name: toolName, 
            args: args ?? {}, 
            spawn: true,
            executionScheduled: this.nextExecutionScheduled 
        });
        this.nextExecutionScheduled = null;
        return this as any;
    }

    as(name: string): this {
        const last = this.calls[this.calls.length - 1];
        if (last) last.as = name;
        return this;
    }

    then(
        nameOrFn: string | ((res: Record<string, string>) => AIQFlow), 
        args: Record<string, any> = {}, 
        callbacks?: Record<string, any>
    ): AIQFlow<this> {
        if (typeof nameOrFn === 'function') {
            const childChain = nameOrFn(resourceProxy);
            (this.onSuccess() as any).chain(childChain);
            return this as any;
        }
        const spawn = this.pendingSpawn;
        this.pendingSpawn = false;
        this.calls.push({ name: nameOrFn, args, spawn, ...(callbacks ? { callbacks } : {}) });
        return this as any;
    }

    onSuccess(callback?: (item: any, context: any) => AIQFlow): AIQFlow<ToolFlowBuilder> {
        const last = this.calls[this.calls.length - 1];
        if (!last) throw new Error('AIQ.onSuccess() called on empty chain');
        const builder = new ToolFlowBuilder(last, 'onSuccess', this as any, resourceProxy) as any;
        if (callback) return builder.chain(callback);
        return builder;
    }

    onDone(): AIQFlow<ToolFlowBuilder> {
        return this.onSuccess();
    }

    onItemExtracted(callback?: (item: any, context: any) => AIQFlow): AIQFlow<ToolFlowBuilder> {
        const last = this.calls[this.calls.length - 1];
        if (!last) throw new Error('AIQ.onItemExtracted() called on empty chain');
        const builder = new ToolFlowBuilder(last, 'onItemExtracted', this as any, itemProxy) as any;
        if (callback) return builder.chain(callback);
        return builder;
    }

    onItem(callback?: (item: any, context: any) => AIQFlow): AIQFlow<ToolFlowBuilder> {
        return this.onItemExtracted(callback);
    }

    onFailure(callback?: (item: any, context: any) => AIQFlow): ToolFlowBuilder {
        const last = this.calls[this.calls.length - 1];
        if (!last) throw new Error('AIQ.onFailure() called on empty chain');
        const builder = new ToolFlowBuilder(last, 'onFailure', this, resourceProxy);
        if (callback) return builder.chain(callback) as any;
        return builder;
    }

    foreach(items: any): ToolFlowBuilder {
        this.calls.push({ name: 'iterate', args: { items }, spawn: false });
        return this.onItem();
    }

    toJSON(): any[] {
        return JSON.parse(JSON.stringify(this.calls));
    }

    run(): any[] {
        return this.toJSON();
    }

    get primaryToolName(): string | null {
        return this.calls[0]?.name ?? null;
    }
}

// ─── ToolFlowBuilder ────────────────────────────────────────────────────────

export interface ToolFlowBuilder extends AIQPlugins {}
export class ToolFlowBuilder {
    private alias?: string;
    private hook: string;
    private pendingSpawn: boolean = false;
    private pendingChain: boolean = false;
    private nextExecutionScheduled: Date | null = null;

    ask(promptOrArgs: string | Record<string, any>): any {
        const args = typeof promptOrArgs === 'string' ? { prompt: promptOrArgs } : promptOrArgs;
        return (this as any).ask_llm(args);
    }

    feed(urlOrArgs: string | Record<string, any>): any {
        const args = typeof urlOrArgs === 'string' ? { url: urlOrArgs } : urlOrArgs;
        return (this as any).process_feed(args);
    }

    constructor(
        private call: any,
        private key: string,
        private parent: AIQBuilder & AIQPlugins,
        private proxy: any
    ) {
        this.hook = key;
        if (key === 'onItem') {
            this.as(`_item_${++loopCounter}`);
        }
    }

    as(name: string): this {
        this.alias = name;
        this.proxy = createRecursiveProxy(name);
        return this;
    }

    wait(seconds: number): this {
        this.nextExecutionScheduled = new Date(Date.now() + seconds * 1000);
        return this;
    }

    schedule(date: Date): this {
        this.nextExecutionScheduled = date;
        return this;
    }

    spawn<T = any>(toolNameOrFn?: string | AIQFlow | ((item: T, context: any) => AIQFlow), args?: any): AIQFlow<this> {
        if (!toolNameOrFn) {
            this.pendingSpawn = true;
            return this as any;
        }

        let childChain: any;
        if (typeof toolNameOrFn === 'function') {
            childChain = toolNameOrFn(this.proxy, contextProxy);
        } else if (typeof toolNameOrFn !== 'string') {
            childChain = toolNameOrFn;
        }

        if (childChain) {
            if (typeof childChain.toJSON !== 'function') {
                throw new Error(`The callback for ${this.hook} must return an AIQ.chain(...) or another builder instance.`);
            }
            this.call.callbacks = this.call.callbacks ?? {};
            this.call.callbacks[this.hook] = { spawn: childChain.toJSON(), as: this.alias };
            return this as any;
        }

        return this.addToolCall(toolNameOrFn as string, args, true);
    }

    chain<T = any>(toolNameOrFn?: string | AIQFlow | ((item: T, context: any) => AIQFlow), args?: any): AIQFlow<this> {
        if (!toolNameOrFn) {
            this.pendingChain = true;
            return this as any;
        }

        const isSpawn = this.pendingSpawn;
        this.pendingSpawn = false;
        this.pendingChain = false;

        if (typeof toolNameOrFn === 'string') {
            return this.addToolCall(toolNameOrFn, args, isSpawn);
        }

        const childChain = typeof toolNameOrFn === 'function' 
            ? toolNameOrFn(this.proxy, contextProxy)
            : toolNameOrFn as any;

        if (!childChain || typeof childChain.toJSON !== 'function') {
            throw new Error(`The callback for ${this.hook} must return an AIQ.chain(...) or another builder instance.`);
        }

        this.call.callbacks = this.call.callbacks ?? {};
        this.call.callbacks[this.hook] = { chain: childChain.toJSON(), as: this.alias };
        return this as any;
    }

    private addToolCall(toolName: string, args: any, spawn: boolean): any {
        this.call.callbacks = this.call.callbacks ?? {};
        const hookData = this.call.callbacks[this.hook] || { chain: [], as: this.alias };
        this.call.callbacks[this.hook] = hookData;

        if (!hookData.chain) hookData.chain = [];
        hookData.chain.push({ 
            name: toolName, 
            args: args ?? {}, 
            spawn,
            executionScheduled: this.nextExecutionScheduled
        });
        this.nextExecutionScheduled = null;
        return this as any;
    }

    onItem(callback?: (item: any, context: any) => AIQFlow): AIQFlow<ToolFlowBuilder> {
        return this.onItemExtracted(callback);
    }

    onItemExtracted(callback?: (item: any, context: any) => AIQFlow): AIQFlow<ToolFlowBuilder> {
        const flow = this.call.callbacks?.[this.hook];
        const chain = flow?.chain || flow?.spawn;
        const last = chain && Array.isArray(chain) ? chain[chain.length - 1] : null;

        if (!last) return this.parent.onItemExtracted(callback);

        const builder = new ToolFlowBuilder(last, 'onItemExtracted', this.parent, itemProxy) as any;
        if (callback) return builder.chain(callback);
        return builder;
    }

    onSuccess(callback?: (item: any, context: any) => AIQFlow): AIQFlow<ToolFlowBuilder> {
        const flow = this.call.callbacks?.[this.hook];
        const chain = flow?.chain || flow?.spawn;
        const last = chain && Array.isArray(chain) ? chain[chain.length - 1] : null;

        if (!last) return this.parent.onSuccess(callback);

        const builder = new ToolFlowBuilder(last, 'onSuccess', this.parent, this.proxy) as any;
        if (callback) return builder.chain(callback);
        return builder;
    }

    onFailure(callback?: (item: any, context: any) => AIQFlow): ToolFlowBuilder {
        const flow = this.call.callbacks?.[this.hook];
        const chain = flow?.chain || flow?.spawn;
        const last = chain && Array.isArray(chain) ? chain[chain.length - 1] : null;

        if (!last) return this.parent.onFailure(callback);

        const builder = new ToolFlowBuilder(last, 'onFailure', this.parent, this.proxy);
        if (callback) return builder.chain(callback) as any;
        return builder;
    }

    yieldScript(scriptName: string): AIQBuilder {
        this.call.callbacks = this.call.callbacks ?? {};
        this.call.callbacks[this.hook] = { yieldTemplateName: scriptName };
        return this.parent;
    }

    toJSON(): any[] {
        return this.parent.toJSON();
    }

    run(): any[] {
        return this.toJSON();
    }
}


// ─── AIQ Factory ────────────────────────────────────────────────────────────

export type AIQExport = typeof AIQBuilder & AIQPlugins & {
    VOCAB: typeof VOCAB;
    item: any;
    resource: any;
    context: any;
    tool: any;
    ref: (path: string) => string;
    args: string[];
    argString: string;
};

export const AIQ = new Proxy(() => AIQBuilder.start(), {
    get(target, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (prop in AIQBuilder) return (AIQBuilder as any)[prop];
        if (prop in target) return (target as any)[prop];

        if (prop === 'args') {
            AIQBuilder.syncState();
            return (AIQBuilder as any)._state.args;
        }
        if (prop === 'argString') {
            AIQBuilder.syncState();
            return (AIQBuilder as any)._state.argString;
        }

        if (prop === 'VOCAB') return VOCAB;
        if (prop === 'item') return itemProxy;
        if (prop === 'resource') return resourceProxy;
        if (prop === 'context') return contextProxy;
        if (prop === 'tool') return toolProxy;
        if (prop === 'ref') return ref;
        
        if (prop === 'ask') return (args: any) => new AIQBuilder().ask(args);

        return undefined;
    },
    apply(target, thisArg, argArray: any[]) {
        return (target as Function).apply(thisArg, argArray);
    }
}) as any as AIQExport;
