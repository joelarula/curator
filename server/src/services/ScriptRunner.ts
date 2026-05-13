import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { Curator, itemProxy, toolProxy, ref } from './Curator.js';
import { getRegisteredTools } from './ToolRegistry.js';

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
        const sandbox: Record<string, any> = {
            args: scriptArgs,
            tools: getRegisteredTools(),
            chain: (name: string, toolArgs: Record<string, any> = {}) => Curator.chain(name, toolArgs),
            spawn: (name: string, toolArgs: Record<string, any> = {}) => Curator.spawn(name, toolArgs),
            start: () => Curator(),
            // Compatibility aliases
            run:   (name: string, toolArgs: Record<string, any> = {}) => Curator.chain(name, toolArgs),
            step:  (name: string, toolArgs: Record<string, any> = {}) => Curator.chain(name, toolArgs),
            Curator,
            // Aliases for jQuery-style flavor
            Curator: Curator,
            $: Curator,
            // Item proxy for onItemExtracted callbacks: item.uri → "{{item.uri}}"
            item: itemProxy,
            // toolProxy('process_feed').title → "{{process_feed.title}}"
            toolProxy,
            // ref('process_feed', 'title') → "{{process_feed.title}}"
            ref,
            console: {
                log:   (...a: any[]) => console.log('[Script]', ...a),
                warn:  (...a: any[]) => console.warn('[Script]', ...a),
                error: (...a: any[]) => console.error('[Script]', ...a),
            },
        };

        vm.createContext(sandbox);

        // Wrap in a function so `return` is valid anywhere in the body.
        // If the body has no explicit return, the last expression is returned
        // by wrapping it as an implicit-return arrow: () => { <body> }
        // We try explicit-return first, then fall back to expression mode.
        let chain: any = null;

        const wrappedFn = `(function() { ${scriptBody} })()`;
        try {
            chain = vm.runInContext(wrappedFn, sandbox, { timeout: 5000, filename: 'curator-script' });
        } catch (e: any) {
            throw new Error(`Script evaluation failed: ${e.message}`);
        }

        // Fallback: body is a bare expression with no return / no assignment
        if (chain == null) {
            const expr = scriptBody.trim().replace(/;+$/, '');
            try {
                chain = vm.runInContext(`(${expr})`, sandbox, { timeout: 5000, filename: 'curator-script-expr' });
            } catch {
                // not a plain expression — fall through to error
            }
        }

        if (chain == null) {
            throw new Error(
                'Script returned nothing. Use `return Curator()...` or write a single expression.'
            );
        }
        if (typeof chain.toJSON !== 'function') {
            throw new Error(
                `Script must return an Curator instance, got: ${typeof chain}. Did you accidentally call .toJSON() before returning?`
            );
        }

        return chain.toJSON();
    }
}
