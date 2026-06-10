import { Pipeline } from './builder.js';
import type { ASTNode, SequenceNode } from './types.js';
import { 
    BaseAgent, 
    isSequentialAgent, 
    isParallelAgent, 
    isLoopAgent, 
    isLlmAgent,
    Agent 
} from '@google/adk';

// Helper to map unique ID prefix names
let _idCounter = 0;
function nextId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${++_idCounter}`;
}

export interface ADKNode {
    id: string;
    type: 'tool' | 'agent' | 'condition';
    // For 'tool' node
    toolName?: string;
    args?: Record<string, any>;
    // For 'agent' (ReAct autonomous loop) node
    model?: string;
    systemPrompt?: string;
    messages?: string;
    tools?: string[];
    // For 'condition' node
    conditionExpr?: string; // e.g. `{{toolData.some_tool.result}} === "true"`
    // Routing transitions
    next?: string; // Node ID to transition to next (default terminal is 'END')
    // For condition type
    trueNext?: string;
    falseNext?: string;
}

export interface ADKWorkflow {
    startNode: string;
    nodes: ADKNode[];
}

/**
 * Maps Google ADK tools to Curator tool names.
 */
function mapADKToolToCurator(tool: any): string | null {
    if (!tool) return null;
    const name = tool.name || (tool.constructor && tool.constructor.name);
    if (name === 'GoogleSearchTool' || name === 'google_search') {
        return 'web_search';
    }
    return tool.name || name || null;
}

/**
 * Compiles a live `@google/adk` agent instance (SequentialAgent, ParallelAgent, LlmAgent)
 * into a structured, database-persisted Curator AST.
 */
export function compileADKAgent(agent: BaseAgent): ASTNode {
    const pipeline = new Pipeline();

    if (isSequentialAgent(agent)) {
        const steps = (agent.subAgents || []).map(sub => compileADKAgent(sub));
        return {
            id: nextId(`seq_adk_${agent.name}`),
            type: 'Sequence',
            steps
        };
    }

    if (isParallelAgent(agent)) {
        const steps = (agent.subAgents || []).map(sub => compileADKAgent(sub));
        return {
            id: nextId(`parallel_adk_${agent.name}`),
            type: 'Parallel',
            steps
        };
    }

    if (isLoopAgent(agent)) {
        const loopedAgent = (agent.subAgents || [])[0];
        const bodyAST = loopedAgent ? compileADKAgent(loopedAgent) : { id: 'empty', type: 'Sequence', steps: [] } as ASTNode;

        return {
            id: nextId(`loop_adk_${agent.name}`),
            type: 'While',
            condition: `{{conversation.loop_active_${agent.name}}} !== "false"`,
            body: bodyAST
        };
    }

    if (isLlmAgent(agent) || agent instanceof Agent) {
        const systemPrompt = typeof agent.instruction === 'string' 
            ? agent.instruction 
            : 'You are an autonomous agent.';

        const toolsList = (agent.tools || [])
            .map(t => mapADKToolToCurator(t))
            .filter(Boolean) as string[];

        // Compile ReAct loop using pipeline builder
        return pipeline.react({
            model: typeof agent.model === 'string' ? agent.model : 'local-gemma-3-1b-it',
            systemPrompt: systemPrompt,
            messages: '{{conversation.messages}}',
            tools: toolsList as any[]
        });
    }

    // Fallback for custom or unmapped base agents
    return {
        id: nextId(`tool_adk_${agent.name}`),
        type: 'ToolTask',
        tool: 'debug',
        args: { message: `Executing agent step: ${agent.name}` }
    };
}

/**
 * Compiles a directed graph-based Google ADK/Workflow definition 
 * into a structured, database-persisted Curator AST.
 * 
 * Uses a State Machine compilation strategy.
 */
export function compileADKWorkflow(workflow: ADKWorkflow): SequenceNode {
    const pipeline = new Pipeline();
    
    // Initialize the starting state context
    const stateKey = 'adk_current_state';
    pipeline.context[stateKey] = workflow.startNode;
    
    // Outer loop: while currentState !== "END"
    pipeline.while(`{{conversation.${stateKey}}} !== "END"`, (loop) => {
        for (const node of workflow.nodes) {
            // Check if current state matches the node ID
            loop.match(`{{conversation.${stateKey}}}`, node.id, (branch) => {
                if (node.type === 'tool' && node.toolName) {
                    // 1. Run the local tool task
                    branch.tool(node.toolName as any, node.args || {});
                    
                    // 2. Transition state
                    const nextState = node.next || 'END';
                    branch.tool('set_context', { key: stateKey, value: nextState });
                } 
                else if (node.type === 'agent') {
                    // 1. Run the ReAct agent loop
                    branch.react({
                        model: node.model || 'local-gemma-3-1b-it',
                        systemPrompt: node.systemPrompt || '',
                        messages: node.messages || '{{conversation.messages}}',
                        tools: (node.tools || []) as any
                    });
                    
                    // 2. Transition state
                    const nextState = node.next || 'END';
                    branch.tool('set_context', { key: stateKey, value: nextState });
                } 
                else if (node.type === 'condition' && node.conditionExpr) {
                    // 1. Check condition and transition state accordingly
                    branch.if(node.conditionExpr, (trueBranch) => {
                        trueBranch.tool('set_context', { key: stateKey, value: node.trueNext || 'END' });
                    }).else((falseBranch) => {
                        falseBranch.tool('set_context', { key: stateKey, value: node.falseNext || 'END' });
                    });
                }
            });
        }
    });

    return pipeline.toAST();
}
