import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { Curator, itemProxy, toolProxy, ref } from './Curator.js';
import { getRegisteredTools } from './ToolRegistry.js';
import { CoffeeFlow } from './ast/builder.js';

/**
 * ScriptRunner — evaluates a user-authored or LLM-generated script in a sandboxed vm context.
 *
 * The script must return a Curator instance. `toJSON()` is called automatically by the runner.
 * Scripts run inside a function body, so `return` works on any line.
 *
 * Examples:
 *   // Single expression (implicit return)
 *   Curator.start().upsert_resource({ uri: args.url })
 *
 *   // Multi-line with return
 *   const x = "https://example.com";
 *   return Curator.start().upsert_resource({ uri: x }).fetch_html({ url: x });
 *   return Curator().upsert_resource({ uri: x }).fetch_html({ url: x });
 *
 *   // Named helper
 *   return run("upsert_resource", { uri: args.url }).then("fetch_html", { url: args.url });
 *
 * Available globals: run(name, args), start(), Curator, args, tools, console
 */
export class ScriptRunner {
    static async evaluate(
        scriptBody: string,
        scriptArgs: Record<string, any> = {},
        prisma: PrismaClient,
        userId: string
    ): Promise<any[]> {
        // Reset static state to prevent leakage between executions
        if ((Curator as any).rootChains) {
            (Curator as any).rootChains.length = 0;
        }
        (Curator as any).lastCreated = null;

        const trimmedBody = scriptBody.trim();
        const isHybrid = trimmedBody.startsWith('meta:') ||
            trimmedBody.startsWith('pipeline:') ||
            trimmedBody.includes('\nrun:') ||
            trimmedBody.startsWith('run:');

        let pipeline: any = {};
        let meta: any = {};
        let finalBody = scriptBody;

        if (isHybrid) {
            const { CffeCompiler } = await import('./ast/cffeCompiler.js');
            const compiled = CffeCompiler.compile(scriptBody);
            pipeline = compiled.pipeline;
            meta = compiled.meta;
            finalBody = compiled.jsCode;
        }


        const sandbox: Record<string, any> = {
            args: scriptArgs,
            tools: getRegisteredTools(),
            chain: (name: string, toolArgs: Record<string, any> = {}) => Curator.chain(name, toolArgs),
            spawn: (name: string, toolArgs: Record<string, any> = {}) => Curator.spawn(name, toolArgs),
            start: () => Curator(),
            // Compatibility aliases
            run: (name: string, toolArgs: Record<string, any> = {}) => Curator.chain(name, toolArgs),
            step: (name: string, toolArgs: Record<string, any> = {}) => Curator.chain(name, toolArgs),
            // Aliases for jQuery-style flavor
            Curator,
            $: Curator,
            // Item proxy for onItemExtracted callbacks: item.uri → "{{item.uri}}"
            item: itemProxy,
            // toolProxy('process_feed').title → "{{process_feed.title}}"
            toolProxy,
            // ref('process_feed', 'title') → "{{process_feed.title}}"
            ref,
            console: {
                log: (...a: any[]) => console.log('[Script]', ...a),
                warn: (...a: any[]) => console.warn('[Script]', ...a),
                error: (...a: any[]) => console.error('[Script]', ...a),
            },
            // Flow — typed pipeline builder for CoffeeScript.
            // Variables returned by flow.tool() coerce directly in #{...} interpolation.
            // Example: formatData = flow.tool("format_list", {...}) → #{formatData} → {{toolData.format_list}}
            Flow: CoffeeFlow,
            pipeline,
            meta,
        };

        vm.createContext(sandbox);

        // Wrap in a function so `return` is valid anywhere in the body.
        // If the body has no explicit return, the last expression is returned
        // by wrapping it as an implicit-return arrow: () => { <body> }
        // We try explicit-return first, then fall back to expression mode.
        let chain: any = null;

        const wrappedFn = `(function() { ${finalBody} })()`;
        try {
            chain = vm.runInContext(wrappedFn, sandbox, { timeout: 5000, filename: 'curator-script' });
        } catch (e: any) {
            throw new Error(`Script evaluation failed: ${e.message}`);
        }

        // Fallback: body is a bare expression with no return / no assignment
        if (chain == null) {
            const expr = finalBody.trim().replace(/;+$/, '');
            try {
                chain = vm.runInContext(`(${expr})`, sandbox, { timeout: 5000, filename: 'curator-script-expr' });
            } catch {
                // not a plain expression — fall through to error
            }
        }

        if (chain == null && sandbox.Curator) {
            chain = sandbox.Curator.run();
        }

        if (chain == null) {
            throw new Error(
                'Script returned nothing. Use `return Curator()...` or write a single expression.'
            );
        }
        const rawAst = typeof chain.toJSON === 'function' ? chain.toJSON() : chain;

        // Deeply serialize to plain JSON to natively resolve all Proxies and stringify function objects
        const serialized = JSON.stringify(rawAst, (key, value) => {
            if (typeof value === 'function') {
                return value.toString();
            }
            return value;
        });

        return JSON.parse(serialized);
    }
}
