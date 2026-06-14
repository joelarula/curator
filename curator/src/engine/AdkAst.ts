export type AdkAstNode = 
  | AdkAgentNode 
  | AdkSequentialNode 
  | AdkParallelNode 
  | AdkJoinNode 
  | AdkRouteNode 
  | AdkLoopNode
  | AdkToolNode
  | AdkScriptNode;

export interface AdkInlineTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  sourceCode: string;
}

export interface AdkAgentNode {
  type: 'ADK_Agent';
  agentName?: string;
  model?: string;
  instruction?: string;
  prompt?: string;
  tools?: (string | AdkInlineTool)[]; // String for registry tools, AdkInlineTool for ad-hoc tools
}

export interface AdkSequentialNode {
  type: 'ADK_Sequential';
  name?: string;
  prompt?: string;
  subAgents: AdkAstNode[];
}

export interface AdkParallelNode {
  type: 'ADK_Parallel';
  name?: string;
  prompt?: string;
  subAgents: AdkAstNode[];
}

export interface AdkJoinNode {
  type: 'ADK_Join';
  name?: string;
  joinLogic?: string; // "concat", "array", etc.
  nextNode?: AdkAstNode; // what to do after join
}

export interface AdkRouteNode {
  type: 'ADK_Route';
  name?: string;
  prompt?: string;
  subAgents: Record<string, AdkAstNode>;
  routerCode?: string; // fallback if JS evaluation used
}

export interface AdkLoopNode {
  type: 'ADK_Loop';
  name?: string;
  prompt?: string;
  maxIterations?: number;
  agent: AdkAstNode;
}

export interface AdkToolNode {
  type: 'ADK_Tool';
  toolName: string;
  args?: Record<string, any>;
}

export interface AdkScriptNode {
  type: 'ADK_Script';
  language: 'javascript' | 'coffeescript';
  code: string;
}
