import type { ASTNode, SequenceNode, ToolNode, ForEachNode, SpawnNode } from './types.js';

let idCounter = 0;
function nextId(prefix: string) {
    return `${prefix}_${++idCounter}`;
}

export function compileToAST(legacyCalls: any[]): SequenceNode {
    const steps = legacyCalls.flatMap(call => compileCall(call));
    return {
        id: nextId('seq'),
        type: 'Sequence',
        steps
    };
}

function resolveCallbackSteps(chainOrSteps: any): ASTNode[] {
    if (!chainOrSteps) return [];
    if (typeof chainOrSteps === 'object' && !Array.isArray(chainOrSteps)) {
        if (chainOrSteps.type === 'Sequence') {
            return chainOrSteps.steps || [];
        }
        return [chainOrSteps as ASTNode];
    }
    if (Array.isArray(chainOrSteps)) {
        const first = chainOrSteps[0];
        if (first && typeof first === 'object' && 'type' in first) {
            return chainOrSteps as ASTNode[];
        }
        return chainOrSteps.flatMap((c: any) => compileCall(c));
    }
    return [];
}

function compileCall(call: any): ASTNode[] {
    if (call.name === 'iterate') {
        // Special internal marker for .foreach()
        const bodySteps = [];
        if (call.callbacks && call.callbacks.onItemExtracted) {
            const hook = call.callbacks.onItemExtracted;
            if (hook.chain) {
                bodySteps.push(...resolveCallbackSteps(hook.chain));
            } else if (hook.spawn) {
                const spawnSteps = resolveCallbackSteps(hook.spawn);
                bodySteps.push({
                    id: nextId('spawn'),
                    type: 'Spawn',
                    body: { id: nextId('seq'), type: 'Sequence', steps: spawnSteps }
                } as SpawnNode);
            }
        }
        
        const forEachNode: ForEachNode = {
            id: nextId('foreach'),
            type: 'ForEach',
            collection: typeof call.args.items === 'string' ? call.args.items : JSON.stringify(call.args.items),
            iterator: call.callbacks?.onItemExtracted?.as || 'item',
            body: {
                id: nextId('seq'),
                type: 'Sequence',
                steps: bodySteps
            }
        };
        return [forEachNode];
    }

    const toolNode: ToolNode = {
        id: nextId(`tool_${call.name}`),
        type: 'ToolTask',
        tool: call.name,
        args: call.args || {},
        ...(call.as ? { as: call.as } : {})
    };

    // Handle callbacks (onSuccess, onItemExtracted)
    const callbackNodes: ASTNode[] = [];
    if (call.callbacks) {
        if (call.callbacks.onSuccess) {
            const hook = call.callbacks.onSuccess;
            if (hook.chain) {
                callbackNodes.push(...resolveCallbackSteps(hook.chain));
            }
        }

        if (call.callbacks.onItemExtracted) {
            const hook = call.callbacks.onItemExtracted;
            const bodySteps = [];
            if (hook.chain) {
                bodySteps.push(...resolveCallbackSteps(hook.chain));
            }
            if (hook.spawn) {
                const spawnSteps = resolveCallbackSteps(hook.spawn);
                bodySteps.push({
                    id: nextId('spawn'),
                    type: 'Spawn',
                    body: { id: nextId('seq'), type: 'Sequence', steps: spawnSteps }
                } as SpawnNode);
            }

            const forEachNode: ForEachNode = {
                id: nextId('foreach'),
                type: 'ForEach',
                collection: `{{toolOutputs.${call.name}.items}}`, 
                iterator: hook.as || 'item',
                body: {
                    id: nextId('seq'),
                    type: 'Sequence',
                    steps: bodySteps
                }
            };
            callbackNodes.push(forEachNode);
        }
    }

    if (call.spawn) {
        return [{
            id: nextId('spawn'),
            type: 'Spawn',
            body: {
                id: nextId('seq'),
                type: 'Sequence',
                steps: [toolNode, ...callbackNodes]
            }
        } as SpawnNode];
    }

    return [toolNode, ...callbackNodes];
}
