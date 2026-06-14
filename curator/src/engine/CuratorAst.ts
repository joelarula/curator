export type CuratorAstNode = 
  | CuratorAgentNode 
  | CuratorSequentialNode 
  | CuratorParallelNode 
  | CuratorJoinNode 
  | CuratorRouteNode 
  | CuratorLoopNode
  | CuratorToolNode
  | CuratorScriptNode;

export interface CuratorInlineTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  sourceCode: string;
}

export interface CuratorAgentNode {
  type: 'Curator_Agent';
  agentName?: string;
  model?: string;
  instruction?: string;
  prompt?: string;
  tools?: (string | CuratorInlineTool)[];
}

export interface CuratorSequentialNode {
  type: 'Curator_Sequential';
  name?: string;
  prompt?: string;
  subAgents: CuratorAstNode[];
}

export interface CuratorParallelNode {
  type: 'Curator_Parallel';
  name?: string;
  prompt?: string;
  subAgents: CuratorAstNode[];
}

export interface CuratorJoinNode {
  type: 'Curator_Join';
  name?: string;
  joinLogic?: string; // "concat", "array", etc.
  nextNode?: CuratorAstNode;
}

export interface CuratorRouteNode {
  type: 'Curator_Route';
  name?: string;
  prompt?: string;
  subAgents: Record<string, CuratorAstNode>;
  routerCode?: string;
}

export interface CuratorLoopNode {
  type: 'Curator_Loop';
  name?: string;
  prompt?: string;
  maxIterations?: number;
  agent: CuratorAstNode;
}

export interface CuratorToolNode {
  type: 'Curator_Tool';
  toolName: string;
  args?: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface CuratorScriptNode {
  type: 'Curator_Script';
  language: 'javascript' | 'coffeescript';
  code: string;
}
