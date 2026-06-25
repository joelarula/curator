pub mod ast;
pub mod memory;
pub mod processor;
pub mod sqlite_store;

use bevy_app::{App, Plugin, Update};
use bevy_ecs::prelude::{IntoScheduleConfigs, ResMut, Resource, SystemSet};

pub use ast::*;
pub use memory::*;
pub use processor::CuratorProcessor;
pub use sqlite_store::{RequestRow, SqliteStore};

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
}

impl Default for CuratorBevyPlugin {
    fn default() -> Self {
        Self {
            sqlite_path: "curator_bevy_runtime.db".to_string(),
            batch_size: 16,
        }
    }
}

impl Plugin for CuratorBevyPlugin {
    fn build(&self, app: &mut App) {
        let store = SqliteStore::open(&self.sqlite_path)
            .expect("failed to open sqlite runtime for curator-bevy-plugin");

        app.init_resource::<RuntimeConfigResource>()
            .init_resource::<MetricsResource>()
            .insert_resource(ProcessorResource {
                processor: CuratorProcessor::new(store, self.batch_size),
            })
            .configure_sets(Update, (CuratorRuntimeSet::Tick,).chain())
            .add_systems(Update, runtime_tick.in_set(CuratorRuntimeSet::Tick));
    }
}

fn runtime_tick(mut metrics: ResMut<MetricsResource>, runtime: bevy_ecs::prelude::Res<ProcessorResource>) {
    metrics.ticks = metrics.ticks.saturating_add(1);
    runtime.processor.poll_once();
}
