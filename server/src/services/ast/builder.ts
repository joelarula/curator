import type { ASTNode, SequenceNode, ToolNode, ForEachNode, SpawnNode } from './types.js';
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
    constructor(private node: any) {}

    else(bodyFn: (flow: Pipeline) => void) {
        const falseFlow = new Pipeline();
        bodyFn(falseFlow);
        this.node.falseBranch = falseFlow.toAST();
    }
}

/**
 * The Phase 4 Typed Pipeline Builder.
 * Replaces the legacy AIQ fluent builder with a structured, strongly-typed approach.
 */
export class Pipeline {
    public steps: ASTNode[] = [];

    /**
     * Appends a ToolNode and returns a typed template proxy for its outputs.
     */
    tool<T = any>(name: ToolName, args: Record<string, any> = {}): Proxyfy<T> {
        const id = nextId(`tool_${name}`);
        const node: ToolNode = {
            id,
            type: 'ToolTask',
            tool: name,
            args
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
        bodyFn(trueFlow);
        
        const node: any = {
            id: nextId('if'),
            type: 'IfElse',
            condition: condition && condition.toString ? condition.toString() : String(condition),
            trueBranch: trueFlow.toAST()
        };
        this.steps.push(node);
        return new BranchBuilder(node);
    }

    /**
     * Evaluates equality between two templates.
     */
    match(left: any, right: any, bodyFn: (flow: Pipeline) => void): BranchBuilder {
        const trueFlow = new Pipeline();
        bodyFn(trueFlow);
        
        const node: any = {
            id: nextId('match'),
            type: 'Match',
            left: left && left.toString ? left.toString() : String(left),
            right: right && right.toString ? right.toString() : String(right),
            trueBranch: trueFlow.toAST()
        };
        this.steps.push(node);
        return new BranchBuilder(node);
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
}
