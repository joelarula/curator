use bevy_ecs::prelude::{Component, Entity};
use serde_json::Value;
use std::sync::{Arc, Mutex};

/// Represents a Conversation (Game Instance)
#[derive(Component, Debug, Clone)]
pub struct Conversation {
    pub id: String,
}

/// Holds the dynamic JSON state for a Conversation
#[derive(Component, Debug, Clone)]
pub struct ConversationState {
    pub state: Value,
}

/// Represents a running Agent
#[derive(Component, Debug, Clone)]
pub struct Agent {
    pub id: String,
    pub name: String,
}

/// Status of an executing Request
#[derive(Component, Debug, Clone, PartialEq, Eq)]
pub enum EcsRequestStatus {
    New,
    WaitingForDependencies,
    WaitingForUser,
    Completed,
    Skipped,
    Failed,
}

/// Core Request entity which binds to a Conversation
#[derive(Component, Clone)]
pub struct RequestComponent<T> {
    pub id: i64,
    pub conversation_id: String,
    pub notify_id: Option<i64>,
    pub parent_entity: Option<Entity>,
    pub context: Value,
    pub conversation_state: Option<Arc<Mutex<T>>>,
}

/// Holds the parsed AST node that this Entity is currently executing
#[derive(Component, Debug, Clone)]
pub struct AstNodeComponent<N> {
    pub node: N,
}

// ---------------------------------------------------------------------------
// Graph execution state — separate from user-facing `context`
// ---------------------------------------------------------------------------

/// Internal graph traversal state attached to Graph-type request entities.
///
/// Keeping this as a dedicated ECS component (rather than JSON keys in
/// `RequestComponent::context`) means:
///   - No stringly-typed key collisions with user/script context.
///   - Queries are type-safe and cheap.
///   - Graph bookkeeping never leaks into conversation state.
#[derive(Component, Debug, Clone)]
pub struct GraphExecState {
    /// The graph node currently being executed.
    pub current_node: String,
    /// `true` while a dynamic edge (Route/Script) child is in-flight and we are
    /// waiting for it to return the name of the next node.
    pub executing_edge: bool,
    /// Highest request-ID among children we have already processed.  Children
    /// with `id <= last_consumed_child_id` are skipped on subsequent ticks to
    /// prevent stale completions from re-triggering edge evaluation.
    pub last_consumed_child_id: i64,
}

impl GraphExecState {
    pub fn new(start_node: impl Into<String>) -> Self {
        Self {
            current_node: start_node.into(),
            executing_edge: false,
            last_consumed_child_id: -1,
        }
    }
}

/// Internal route node execution state attached to Route-type request entities.
///
/// This keeps Route control-flow bookkeeping out of `RequestComponent::context`.
#[derive(Component, Debug, Clone, Default)]
pub struct RouteExecState {
    /// Whether the router child has completed and selected a route.
    pub decided: bool,
    /// Whether the selected subagent has been spawned.
    pub executed: bool,
    /// Selection returned by the router child.
    pub selection: Option<String>,
    /// Highest child request id seen when the selected subagent was spawned.
    /// Only children with ids greater than this checkpoint are considered the
    /// selected subagent result in the executed phase.
    pub execution_start_child_id: i64,
}

// ---------------------------------------------------------------------------
// Typed node I/O — replaces context["input"] / context["output"] for
// structured data flowing between parent → child nodes.
// ---------------------------------------------------------------------------

/// Typed value passed from a parent node to its child when spawning.
/// Replaces the stringly-typed `context["input"]` pattern.
#[derive(Component, Debug, Clone)]
pub struct NodeInput {
    pub value: Value,
}

impl NodeInput {
    pub fn string(s: impl Into<String>) -> Self {
        Self { value: Value::String(s.into()) }
    }
    pub fn json(v: Value) -> Self {
        Self { value: v }
    }
    pub fn as_str(&self) -> Option<&str> {
        self.value.as_str()
    }
}
