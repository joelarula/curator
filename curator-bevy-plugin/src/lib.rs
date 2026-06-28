pub mod ast;
pub mod builder;
pub mod memory;
pub mod processor;
pub mod sqlite_store;
pub mod components;
pub mod events;
pub mod systems;

use bevy_app::{App, Plugin, Update};
use bevy_ecs::prelude::{IntoScheduleConfigs, ResMut, Resource, SystemSet};
use std::any::TypeId;
use std::collections::HashSet;

pub use ast::*;
pub use memory::*;
pub use processor::CuratorProcessor;
pub use sqlite_store::{RequestRow, SqliteStore};
pub use components::*;
pub use events::*;
pub use systems::*;

#[derive(Debug, Clone, Resource)]
pub struct RuntimeConfigResource {
    pub tick_ms: u64,
    pub claim_batch_size: i64,
}

impl Default for RuntimeConfigResource {
    fn default() -> Self {
        Self {
            tick_ms: 100,
            claim_batch_size: 16,
        }
    }
}

#[derive(Debug, Clone, Default, Resource)]
pub struct MetricsResource {
    pub ticks: u64,
    pub claims: u64,
    pub completed: u64,
    pub failed: u64,
}

#[derive(Default, Resource)]
struct RegisteredWorkflowTypes {
    types: HashSet<TypeId>,
}

#[derive(Clone, Resource)]
pub struct ProcessorResource {
    pub processor: CuratorProcessor,
}

#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub enum CuratorRuntimeSet {
    Tick,
}

pub struct CuratorBevyPlugin {
    pub sqlite_path: String,
    pub batch_size: i64,
    pub enable_sqlite_sync: bool,
    pub auto_register_default_workflow: bool,
}

impl Default for CuratorBevyPlugin {
    fn default() -> Self {
        Self {
            sqlite_path: "curator_bevy_runtime.db".to_string(),
            batch_size: 16,
            enable_sqlite_sync: true,
            auto_register_default_workflow: true,
        }
    }
}

pub trait CuratorAppExt {
    fn add_curator_workflow<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(&mut self) -> &mut Self;
    fn spawn_curator_request<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
        &mut self,
        event: SpawnRequestEvent<T>,
    ) -> &mut Self;
}

impl Plugin for CuratorBevyPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<RuntimeConfigResource>()
            .init_resource::<MetricsResource>()
            .init_resource::<RegisteredWorkflowTypes>();

        // Register the default workflow runtime unless the caller provides a
        // custom typed workflow explicitly.
        if self.auto_register_default_workflow {
            app.add_curator_workflow::<serde_json::Value>();
        }

        if self.enable_sqlite_sync {
            let store = SqliteStore::open(&self.sqlite_path)
                .expect("failed to open sqlite runtime for curator-bevy-plugin");
            app.insert_resource(ProcessorResource {
                processor: CuratorProcessor::new(store, self.batch_size),
            });
            // Legacy tick system for sqlite processor
            app.configure_sets(Update, (CuratorRuntimeSet::Tick,).chain())
               .add_systems(Update, runtime_tick.in_set(CuratorRuntimeSet::Tick));
        }
    }
}

impl CuratorAppExt for App {
    fn add_curator_workflow<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(&mut self) -> &mut Self {
        if !self.world().contains_resource::<RegisteredWorkflowTypes>() {
            self.init_resource::<RegisteredWorkflowTypes>();
        }

        let type_id = TypeId::of::<T>();
        let already_registered = self
            .world()
            .get_resource::<RegisteredWorkflowTypes>()
            .map(|r| r.types.contains(&type_id))
            .unwrap_or(false);
        if already_registered {
            return self;
        }

        self.world_mut()
            .resource_mut::<RegisteredWorkflowTypes>()
            .types
            .insert(type_id);

        self.add_message::<SpawnRequestEvent<T>>()
            .add_message::<ResponseEvent>()
            .add_message::<PlayerActionEvent>();

        // Add the new native ECS granular systems
        self.add_systems(Update, (
            sync_requests_system::<T>,
            process_sequential_nodes_system::<T>,
            process_parallel_nodes_system::<T>,
            process_human_input_system::<T>,
            process_tool_nodes_system::<T>,
            process_set_state_nodes_system::<T>,
            process_agent_nodes_system::<T>,
            process_loop_nodes_system::<T>,
            process_script_nodes_system::<T>,
            process_route_nodes_system::<T>,
            process_join_nodes_system::<T>,
            process_graph_nodes_system::<T>,
            process_agent_ref_nodes_system::<T>,
            process_interrupt_nodes_system::<T>,
            crate::systems::spawn_request_message_system::<T>,
            crate::systems::response_message_system::<T>,
            crate::systems::player_action_message_system::<T>,
            crate::systems::resolve_dependencies_system::<T>,
        ));

        self

    }

    fn spawn_curator_request<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
        &mut self,
        event: SpawnRequestEvent<T>,
    ) -> &mut Self {
        self.add_curator_workflow::<T>();
        self.world_mut().write_message(event);
        self
    }
}

fn runtime_tick(mut metrics: ResMut<MetricsResource>, runtime: bevy_ecs::prelude::Res<ProcessorResource>) {
    metrics.ticks = metrics.ticks.saturating_add(1);
    runtime.processor.poll_once();
}
