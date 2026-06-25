#![allow(non_snake_case)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CuratorBaseNode {
    #[serde(default)]
    pub exclude_from_history: Option<bool>,
    #[serde(default)]
    pub scheduledAt: Option<String>,
    #[serde(default)]
    pub priority: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorInlineTool {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
    #[serde(default)]
    pub sourceCode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CuratorAstNode {
    #[serde(rename = "Curator_Agent")]
    Agent(CuratorAgentNode),
    #[serde(rename = "Curator_Sequential")]
    Sequential(CuratorSequentialNode),
    #[serde(rename = "Curator_Parallel")]
    Parallel(CuratorParallelNode),
    #[serde(rename = "Curator_Join")]
    Join(CuratorJoinNode),
    #[serde(rename = "Curator_Route")]
    Route(CuratorRouteNode),
    #[serde(rename = "Curator_Loop")]
    Loop(CuratorLoopNode),
    #[serde(rename = "Curator_Tool")]
    Tool(CuratorToolNode),
    #[serde(rename = "Curator_Script")]
    Script(CuratorScriptNode),
    #[serde(rename = "Curator_Graph")]
    Graph(CuratorGraphNode),
    #[serde(rename = "Curator_HumanInput")]
    HumanInput(CuratorHumanInputNode),
    #[serde(rename = "Curator_AgentRef")]
    AgentRef(CuratorAgentRefNode),
    #[serde(rename = "Curator_SetState")]
    SetState(CuratorSetStateNode),
    #[serde(rename = "Curator_Interrupt")]
    Interrupt(CuratorInterruptNode),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorAgentNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub agentName: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub instruction: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub include_contents: Option<String>,
    #[serde(default)]
    pub tools: Option<Vec<Value>>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub baseUrl: Option<String>,
    #[serde(default)]
    pub input_schema: Option<Value>,
    #[serde(default)]
    pub output_schema: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorSetStateNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub state: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorSequentialNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    pub subAgents: Vec<CuratorAstNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorParallelNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    pub subAgents: Vec<CuratorAstNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorJoinNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub joinLogic: Option<String>,
    #[serde(default)]
    pub nextNode: Option<Box<CuratorAstNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorRouteNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    pub router: Box<CuratorAstNode>,
    pub subAgents: HashMap<String, CuratorAstNode>,
    #[serde(default)]
    pub defaultRoute: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorGraphNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    pub startNode: String,
    pub nodes: HashMap<String, CuratorAstNode>,
    #[serde(default)]
    pub edges: Option<HashMap<String, Value>>,
    #[serde(default)]
    pub stateSchema: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorLoopNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub maxIterations: Option<u32>,
    pub agent: Box<CuratorAstNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorToolNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    pub toolName: String,
    #[serde(default)]
    pub args: Option<Value>,
    #[serde(default)]
    pub parameters: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorScriptNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    pub language: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorHumanInputNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    pub prompt: String,
    #[serde(default)]
    pub inputType: Option<String>,
    #[serde(default)]
    pub choices: Option<Vec<String>>,
    #[serde(default)]
    pub targetUserId: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorAgentRefNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    pub agentName: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuratorInterruptNode {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    pub priority: i64,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub cancelBelowPriority: Option<i64>,
    #[serde(default)]
    pub handler: Option<Box<CuratorAstNode>>,
    #[serde(default)]
    pub resume: Option<Box<CuratorAstNode>>,
}
