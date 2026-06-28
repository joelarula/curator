use crate::ast::*;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct CuratorBuilder<T> {
    _marker: std::marker::PhantomData<T>,
}

impl<T> CuratorBuilder<T> {
    pub fn sequential(sub_agents: Vec<CuratorAstNode<T>>) -> CuratorAstNode<T> {
        CuratorAstNode::Sequential(CuratorSequentialNode {
            base: Default::default(),
            name: None,
            prompt: None,
            subAgents: sub_agents,
        })
    }

    pub fn loop_node(max_iterations: u32, agent: CuratorAstNode<T>) -> CuratorAstNode<T> {
        CuratorAstNode::Loop(CuratorLoopNode {
            base: Default::default(),
            name: None,
            prompt: None,
            agent: Box::new(agent),
            maxIterations: Some(max_iterations),
        })
    }

    pub fn graph(
        start_node: &str,
        nodes: HashMap<String, CuratorAstNode<T>>,
        edges: Option<HashMap<String, CuratorEdge<T>>>,
    ) -> CuratorAstNode<T> {
        CuratorAstNode::Graph(CuratorGraphNode {
            base: Default::default(),
            name: None,
            startNode: start_node.to_string(),
            nodes,
            edges,
            stateSchema: None,
        })
    }

    pub fn route(
        router: CuratorAstNode<T>,
        sub_agents: HashMap<String, CuratorAstNode<T>>,
        default_route: Option<&str>,
    ) -> CuratorAstNode<T> {
        CuratorAstNode::Route(CuratorRouteNode {
            base: Default::default(),
            name: None,
            router: Box::new(router),
            subAgents: sub_agents,
            defaultRoute: default_route.map(|s| s.to_string()),
        })
    }

    pub fn human_input(prompt: &str, input_type: Option<&str>, choices: Option<Vec<&str>>) -> CuratorAstNode<T> {
        CuratorAstNode::HumanInput(CuratorHumanInputNode {
            base: Default::default(),
            name: None,
            prompt: prompt.to_string(),
            inputType: input_type.map(|s| s.to_string()),
            inputSchema: None,
            choices: choices.map(|c| c.into_iter().map(|s| s.to_string()).collect()),
            targetUserId: None,
        })
    }

    pub fn agent(prompt: &str) -> CuratorAstNode<T> {
        CuratorAstNode::Agent(CuratorAgentNode {
            base: Default::default(),
            agentName: None,
            model: None,
            instruction: None,
            prompt: Some(prompt.to_string()),
            include_contents: None,
            tools: None,
            provider: None,
            baseUrl: None,
            input_schema: None,
            output_schema: None,
        })
    }

    pub fn set_state(state: Value) -> CuratorAstNode<T> {
        CuratorAstNode::SetState(CuratorSetStateNode {
            base: Default::default(),
            state,
        })
    }

    pub fn emit_event(event_name: &str) -> CuratorAstNode<T> {
        CuratorAstNode::Tool(CuratorToolNode {
            base: Default::default(),
            toolName: "emitEvent".to_string(),
            args: Some(serde_json::json!({ "eventName": event_name })),
            parameters: None,
        })
    }

    pub fn script(code: &str) -> CuratorAstNode<T> {
        CuratorAstNode::Script(CuratorScriptNode {
            base: Default::default(),
            language: "javascript".to_string(),
            code: code.to_string(),
            closure: None,
        })
    }

    pub fn rust_script<F>(name: &str, closure: F) -> CuratorAstNode<T>
    where
        F: Fn(serde_json::Value, Option<Arc<Mutex<T>>>) -> String + Send + Sync + 'static,
    {
        CuratorAstNode::Script(CuratorScriptNode {
            base: Default::default(),
            language: "rust".to_string(),
            code: name.to_string(),
            closure: Some(Arc::new(closure)),
        })
    }
}

pub struct GraphBuilder<T> {
    start_node: String,
    nodes: HashMap<String, CuratorAstNode<T>>,
    edges: HashMap<String, CuratorEdge<T>>,
}

impl<T> GraphBuilder<T> {
    pub fn new(start_node: &str) -> Self {
        Self {
            start_node: start_node.to_string(),
            nodes: HashMap::new(),
            edges: HashMap::new(),
        }
    }

    pub fn add_node(mut self, name: &str, node: CuratorAstNode<T>) -> Self {
        self.nodes.insert(name.to_string(), node);
        self
    }

    pub fn add_edge(mut self, from: &str, to: &str) -> Self {
        self.edges.insert(from.to_string(), CuratorEdge::Static(to.to_string()));
        self
    }

    pub fn add_dynamic_edge(mut self, from: &str, edge_node: CuratorAstNode<T>) -> Self {
        self.edges.insert(from.to_string(), CuratorEdge::Dynamic(edge_node));
        self
    }

    pub fn build(self) -> CuratorAstNode<T> {
        CuratorBuilder::graph(
            &self.start_node,
            self.nodes,
            if self.edges.is_empty() { None } else { Some(self.edges) }
        )
    }
}

pub struct RouteBuilder<T> {
    router: CuratorAstNode<T>,
    sub_agents: HashMap<String, CuratorAstNode<T>>,
    default_route: Option<String>,
}

impl<T> RouteBuilder<T> {
    pub fn new(router: CuratorAstNode<T>) -> Self {
        Self {
            router,
            sub_agents: HashMap::new(),
            default_route: None,
        }
    }

    pub fn add_route(mut self, condition: &str, target: CuratorAstNode<T>) -> Self {
        self.sub_agents.insert(condition.to_string(), target);
        self
    }

    pub fn default_route(mut self, target_name: &str) -> Self {
        self.default_route = Some(target_name.to_string());
        self
    }

    pub fn build(self) -> CuratorAstNode<T> {
        CuratorBuilder::route(self.router, self.sub_agents, self.default_route.as_deref())
    }
}
