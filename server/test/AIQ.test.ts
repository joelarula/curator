import { describe, it, expect } from 'vitest';
import { AIQ } from '../src/services/AIQ.js';

describe('AIQ Pipeline Serialization', () => {
    
    it('should generate basic sequential tool calls', () => {
        const flow = AIQ.chain("upsert_resource", { uri: "test:1" })
                        .chain("debug", { message: "Hello" })
                        .toJSON();

        expect(flow).toHaveLength(2);
        expect(flow[0].name).toBe("upsert_resource");
        expect(flow[1].name).toBe("debug");
        expect(flow[0].args.uri).toBe("test:1");
    });

    it('should implement automatic lexical scoping for nested loops', () => {
        const flow = AIQ.chain("process_feed", { url: "test:feed" })
            .onItem().chain((item1) => {
                return AIQ.chain("iterate", { items: (item1 as any).tags })
                    .onItem().chain((item2) => {
                        return AIQ.chain("debug", { 
                            msg: "Nested", 
                            outer: (item1 as any).id, 
                            inner: item2 
                        });
                    });
            })
            .toJSON();

        // 1. Check outer loop
        const outerCallback = flow[0].callbacks.onItemExtracted;
        expect(outerCallback.as).toMatch(/_item_\d+/);
        const outerAlias = outerCallback.as;

        // 2. Check inner loop
        const innerIterate = outerCallback.chain[0];
        const innerCallback = innerIterate.callbacks.onItemExtracted;
        expect(innerCallback.as).toMatch(/_item_\d+/);
        expect(innerCallback.as).not.toBe(outerAlias);
        const innerAlias = innerCallback.as;

        // 3. Verify that proxies resolved to the correct unique IDs
        const debugTool = innerCallback.chain[0];
        expect(debugTool.args.outer).toBe(`{{${outerAlias}.id}}`);
        expect(debugTool.args.inner).toBe(`{{${innerAlias}}}`);
    });

    it('should support manual context aliasing with .as()', () => {
        const flow = AIQ.chain("process_feed", {})
            .onItem().as('article').chain((article) => {
                return AIQ.chain("debug", { uri: (article as any).uri });
            })
            .toJSON();

        const callback = flow[0].callbacks.onItemExtracted;
        expect(callback.as).toBe('article');
        expect(callback.chain[0].args.uri).toBe('{{article.uri}}');
    });

    it('should handle complex nested chains with mixed spawn/chain', () => {
        const flow = AIQ.chain("root", {})
            .onItem().spawn((item) => {
                return AIQ.chain("child", { id: (item as any).id });
            })
            .toJSON();

        const callback = flow[0].callbacks.onItemExtracted;
        expect(callback.spawn).toBeDefined();
        expect(callback.spawn[0].name).toBe("child");
    });

    it('should support strong typing with generics without affecting serialization', () => {
        interface MyItem { id: string; }
        const flow = AIQ.chain("test", {})
            .onItem().chain<MyItem>((item) => {
                return AIQ.chain("debug", { id: item.id });
            })
            .toJSON();

        const callback = flow[0].callbacks.onItemExtracted;
        expect(callback.chain[0].args.id).toMatch(/\{\{_item_\d+\.id\}\}/);
    });
});

