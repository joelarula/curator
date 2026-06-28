use bevy_ecs::prelude::{Entity, Message};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use crate::ast::CuratorAstNode;

/// Emitted when a new request needs to be spawned in the ECS.
/// If `sqlite_sync` is enabled, this might also trigger an SQLite write, 
/// but it immediately spawns an ECS entity.
#[derive(Message, Clone)]
pub struct SpawnRequestEvent<T> {
    pub ast: CuratorAstNode<T>,
    pub context: Value,
    pub conversation_state: Option<Arc<Mutex<T>>>,
    pub conversation_id: String,
    pub notify_id: Option<i64>,
    pub parent_entity: Option<Entity>,
    pub priority: i64,
}

/// Emitted when an AST node (e.g. ToolNode) generates a response back to the user/system.
#[derive(Message, Debug, Clone)]
pub struct ResponseEvent {
    pub request_id: i64,
    pub entity: Entity,
    pub conversation_id: String,
    pub content: String,
}

/// Emitted when the engine needs input from the user/UI (WAtingForUser).
#[derive(Message, Debug, Clone)]
pub struct PlayerActionEvent {
    pub request_id: i64,
    pub entity: Entity,
    pub conversation_id: String,
    pub prompt: String,
    pub choices: Option<Vec<String>>,
}
