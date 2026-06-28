#![allow(non_snake_case)]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

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

pub type ArcScriptClosure<T> = Arc<dyn Fn(serde_json::Value, Option<Arc<Mutex<T>>>) -> String + Send + Sync>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(bound="")] pub enum CuratorAstNode<T> {
    #[serde(rename = "Curator_Agent")]
    Agent(CuratorAgentNode),
    #[serde(rename = "Curator_Sequential")]
    Sequential(CuratorSequentialNode<T>),
    #[serde(rename = "Curator_Parallel")]
    Parallel(CuratorParallelNode<T>),
    #[serde(rename = "Curator_Join")]
    Join(CuratorJoinNode<T>),
    #[serde(rename = "Curator_Route")]
    Route(CuratorRouteNode<T>),
    #[serde(rename = "Curator_Loop")]
    Loop(CuratorLoopNode<T>),
    #[serde(rename = "Curator_Tool")]
    Tool(CuratorToolNode),
    #[serde(rename = "Curator_Script")]
    Script(CuratorScriptNode<T>),
    #[serde(rename = "Curator_Graph")]
    Graph(CuratorGraphNode<T>),
    #[serde(rename = "Curator_HumanInput")]
    HumanInput(CuratorHumanInputNode),
    #[serde(rename = "Curator_AgentRef")]
    AgentRef(CuratorAgentRefNode),
    #[serde(rename = "Curator_SetState")]
    SetState(CuratorSetStateNode),
    #[serde(rename = "Curator_Interrupt")]
    Interrupt(CuratorInterruptNode<T>),
}

impl<T: std::fmt::Debug> std::fmt::Debug for CuratorAstNode<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Agent(arg0) => f.debug_tuple("Agent").field(arg0).finish(),
            Self::Sequential(arg0) => f.debug_tuple("Sequential").field(arg0).finish(),
            Self::Parallel(arg0) => f.debug_tuple("Parallel").field(arg0).finish(),
            Self::Join(arg0) => f.debug_tuple("Join").field(arg0).finish(),
            Self::Route(arg0) => f.debug_tuple("Route").field(arg0).finish(),
            Self::Loop(arg0) => f.debug_tuple("Loop").field(arg0).finish(),
            Self::Tool(arg0) => f.debug_tuple("Tool").field(arg0).finish(),
            Self::Script(arg0) => f.debug_tuple("Script").field(arg0).finish(),
            Self::Graph(arg0) => f.debug_tuple("Graph").field(arg0).finish(),
            Self::HumanInput(arg0) => f.debug_tuple("HumanInput").field(arg0).finish(),
            Self::AgentRef(arg0) => f.debug_tuple("AgentRef").field(arg0).finish(),
            Self::SetState(arg0) => f.debug_tuple("SetState").field(arg0).finish(),
            Self::Interrupt(arg0) => f.debug_tuple("Interrupt").field(arg0).finish(),
        }
    }
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
#[serde(bound="")] pub struct CuratorSequentialNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    pub subAgents: Vec<CuratorAstNode<T>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound="")] pub struct CuratorParallelNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    pub subAgents: Vec<CuratorAstNode<T>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound="")] pub struct CuratorJoinNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub joinLogic: Option<String>,
    #[serde(default)]
    pub nextNode: Option<Box<CuratorAstNode<T>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound="")] pub struct CuratorRouteNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    pub router: Box<CuratorAstNode<T>>,
    pub subAgents: HashMap<String, CuratorAstNode<T>>,
    #[serde(default)]
    pub defaultRoute: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
#[serde(bound="")] pub enum CuratorEdge<T> {
    Static(String),
    Dynamic(CuratorAstNode<T>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound="")] pub struct CuratorGraphNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    pub startNode: String,
    pub nodes: HashMap<String, CuratorAstNode<T>>,
    #[serde(default)]
    pub edges: Option<HashMap<String, CuratorEdge<T>>>,
    #[serde(default)]
    pub stateSchema: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound="")] pub struct CuratorLoopNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub maxIterations: Option<u32>,
    pub agent: Box<CuratorAstNode<T>>,
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(bound="")] pub struct CuratorScriptNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    pub language: String,
    pub code: String,
    #[serde(skip)]
    pub closure: Option<ArcScriptClosure<T>>,
}

impl<T: std::fmt::Debug> std::fmt::Debug for CuratorScriptNode<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CuratorScriptNode")
            .field("base", &self.base)
            .field("language", &self.language)
            .field("code", &self.code)
            .finish()
    }
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
    pub inputSchema: Option<String>,
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
#[serde(bound="")] pub struct CuratorInterruptNode<T> {
    #[serde(flatten)]
    pub base: CuratorBaseNode,
    #[serde(default)]
    pub name: Option<String>,
    pub signal: String,
    pub priority: i64,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub cancelBelowPriority: Option<i64>,
    #[serde(default)]
    pub handler: Option<Box<CuratorAstNode<T>>>,
    #[serde(default)]
    pub resume: Option<Box<CuratorAstNode<T>>>,
}
