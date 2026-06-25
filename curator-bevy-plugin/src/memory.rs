use std::collections::HashMap;
use std::fmt::{Display, Formatter};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use bevy_ecs::prelude::Resource;

pub type MemoryResult<T> = Result<T, MemoryError>;

#[derive(Debug)]
pub enum MemoryError {
    Io(std::io::Error),
    Serde(serde_json::Error),
    Backend(String),
}

impl Display for MemoryError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "I/O error: {}", err),
            Self::Serde(err) => write!(f, "Serialization error: {}", err),
            Self::Backend(msg) => write!(f, "Backend error: {}", msg),
        }
    }
}

impl std::error::Error for MemoryError {}

impl From<std::io::Error> for MemoryError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for MemoryError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RequestStatus {
    New,
    Waiting,
    WaitingForUser,
    Completed,
    Failed,
    Skipped,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestState {
    pub request_id: u64,
    pub conversation_id: String,
    pub status: RequestStatus,
    pub retry_count: u32,
    pub pending_dependencies: u32,
    pub context: Value,
    pub latest_response: Option<String>,
    pub updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemorySnapshot {
    pub requests: HashMap<u64, RequestState>,
    pub conversation_state: HashMap<String, Value>,
    pub last_sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEvent {
    pub sequence: u64,
    pub timestamp_epoch_ms: u64,
    pub kind: MemoryEventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryEventKind {
    UpsertRequest {
        request_id: u64,
        conversation_id: String,
        status: RequestStatus,
        retry_count: u32,
        pending_dependencies: u32,
        context: Value,
    },
    SetRequestStatus {
        request_id: u64,
        status: RequestStatus,
    },
    IncrementRetry {
        request_id: u64,
    },
    SetPendingDependencies {
        request_id: u64,
        pending_dependencies: u32,
    },
    SaveResponse {
        request_id: u64,
        response: String,
    },
    MergeConversationState {
        conversation_id: String,
        patch: Value,
    },
}

pub trait CrashLogStore: Send + Sync {
    fn append(&self, event: &MemoryEvent) -> MemoryResult<()>;
    fn load_since(&self, sequence: u64) -> MemoryResult<Vec<MemoryEvent>>;
}

#[derive(Default)]
pub struct NoopCrashLogStore;

impl CrashLogStore for NoopCrashLogStore {
    fn append(&self, _event: &MemoryEvent) -> MemoryResult<()> {
        Ok(())
    }

    fn load_since(&self, _sequence: u64) -> MemoryResult<Vec<MemoryEvent>> {
        Ok(vec![])
    }
}

pub struct JsonlCrashLogStore {
    path: PathBuf,
    io_lock: Mutex<()>,
}

impl JsonlCrashLogStore {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            io_lock: Mutex::new(()),
        }
    }
}

impl CrashLogStore for JsonlCrashLogStore {
    fn append(&self, event: &MemoryEvent) -> MemoryResult<()> {
        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| MemoryError::Backend("jsonl log mutex poisoned".to_string()))?;

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;

        let line = serde_json::to_string(event)?;
        writeln!(file, "{}", line)?;
        Ok(())
    }

    fn load_since(&self, sequence: u64) -> MemoryResult<Vec<MemoryEvent>> {
        if !self.path.exists() {
            return Ok(vec![]);
        }

        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| MemoryError::Backend("jsonl log mutex poisoned".to_string()))?;

        let file = File::open(&self.path)?;
        let reader = BufReader::new(file);
        let mut out = Vec::new();

        for line in reader.lines() {
            let raw = line?;
            if raw.trim().is_empty() {
                continue;
            }
            let event: MemoryEvent = serde_json::from_str(&raw)?;
            if event.sequence > sequence {
                out.push(event);
            }
        }

        out.sort_by_key(|e| e.sequence);
        Ok(out)
    }
}

#[derive(Debug, Clone)]
pub struct OrmEventRow {
    pub sequence: u64,
    pub timestamp_epoch_ms: u64,
    pub payload_json: String,
}

pub trait OrmCrashLogRepository: Send + Sync {
    fn insert_event_row(&self, row: OrmEventRow) -> MemoryResult<()>;
    fn list_rows_since(&self, sequence: u64) -> MemoryResult<Vec<OrmEventRow>>;
}

pub struct OrmCrashLogStore<R: OrmCrashLogRepository> {
    repo: R,
}

impl<R: OrmCrashLogRepository> OrmCrashLogStore<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

impl<R: OrmCrashLogRepository> CrashLogStore for OrmCrashLogStore<R> {
    fn append(&self, event: &MemoryEvent) -> MemoryResult<()> {
        self.repo.insert_event_row(OrmEventRow {
            sequence: event.sequence,
            timestamp_epoch_ms: event.timestamp_epoch_ms,
            payload_json: serde_json::to_string(event)?,
        })
    }

    fn load_since(&self, sequence: u64) -> MemoryResult<Vec<MemoryEvent>> {
        let mut events = Vec::new();
        for row in self.repo.list_rows_since(sequence)? {
            let parsed: MemoryEvent = serde_json::from_str(&row.payload_json)?;
            events.push(parsed);
        }
        events.sort_by_key(|e| e.sequence);
        Ok(events)
    }
}

#[derive(Clone, Default, Resource)]
pub struct MemoryStore {
    snapshot: Arc<RwLock<MemorySnapshot>>,
    crash_log: Option<Arc<dyn CrashLogStore>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            snapshot: Arc::new(RwLock::new(MemorySnapshot::default())),
            crash_log: None,
        }
    }

    pub fn with_crash_log(crash_log: Arc<dyn CrashLogStore>) -> Self {
        Self {
            snapshot: Arc::new(RwLock::new(MemorySnapshot::default())),
            crash_log: Some(crash_log),
        }
    }

    pub async fn recover_from_log(&self) -> MemoryResult<u64> {
        let from_sequence = {
            let guard = self.snapshot.read().await;
            guard.last_sequence
        };

        let Some(crash_log) = &self.crash_log else {
            return Ok(from_sequence);
        };

        let events = crash_log.load_since(from_sequence)?;
        let mut last = from_sequence;

        for event in events {
            self.apply_event(event.clone()).await?;
            last = event.sequence;
        }

        Ok(last)
    }

    pub async fn snapshot(&self) -> MemorySnapshot {
        self.snapshot.read().await.clone()
    }

    pub async fn get_request(&self, request_id: u64) -> Option<RequestState> {
        self.snapshot.read().await.requests.get(&request_id).cloned()
    }

    pub async fn upsert_request(
        &self,
        request_id: u64,
        conversation_id: impl Into<String>,
        status: RequestStatus,
        pending_dependencies: u32,
        context: Value,
    ) -> MemoryResult<u64> {
        self.record_event(MemoryEventKind::UpsertRequest {
            request_id,
            conversation_id: conversation_id.into(),
            status,
            retry_count: 0,
            pending_dependencies,
            context,
        })
        .await
    }

    pub async fn set_status(&self, request_id: u64, status: RequestStatus) -> MemoryResult<u64> {
        self.record_event(MemoryEventKind::SetRequestStatus { request_id, status })
            .await
    }

    pub async fn increment_retry(&self, request_id: u64) -> MemoryResult<u64> {
        self.record_event(MemoryEventKind::IncrementRetry { request_id })
            .await
    }

    pub async fn set_pending_dependencies(
        &self,
        request_id: u64,
        pending_dependencies: u32,
    ) -> MemoryResult<u64> {
        self.record_event(MemoryEventKind::SetPendingDependencies {
            request_id,
            pending_dependencies,
        })
        .await
    }

    pub async fn save_response(
        &self,
        request_id: u64,
        response: impl Into<String>,
    ) -> MemoryResult<u64> {
        self.record_event(MemoryEventKind::SaveResponse {
            request_id,
            response: response.into(),
        })
        .await
    }

    pub async fn merge_conversation_state(
        &self,
        conversation_id: impl Into<String>,
        patch: Value,
    ) -> MemoryResult<u64> {
        self.record_event(MemoryEventKind::MergeConversationState {
            conversation_id: conversation_id.into(),
            patch,
        })
        .await
    }

    async fn record_event(&self, kind: MemoryEventKind) -> MemoryResult<u64> {
        let next_sequence = {
            let guard = self.snapshot.read().await;
            guard.last_sequence + 1
        };

        let event = MemoryEvent {
            sequence: next_sequence,
            timestamp_epoch_ms: now_epoch_ms(),
            kind,
        };

        if let Some(crash_log) = &self.crash_log {
            crash_log.append(&event)?;
        }

        self.apply_event(event).await?;
        Ok(next_sequence)
    }

    async fn apply_event(&self, event: MemoryEvent) -> MemoryResult<()> {
        let mut guard = self.snapshot.write().await;

        if event.sequence <= guard.last_sequence {
            return Ok(());
        }

        match event.kind {
            MemoryEventKind::UpsertRequest {
                request_id,
                conversation_id,
                status,
                retry_count,
                pending_dependencies,
                context,
            } => {
                guard.requests.insert(
                    request_id,
                    RequestState {
                        request_id,
                        conversation_id,
                        status,
                        retry_count,
                        pending_dependencies,
                        context,
                        latest_response: None,
                        updated_at_epoch_ms: event.timestamp_epoch_ms,
                    },
                );
            }
            MemoryEventKind::SetRequestStatus { request_id, status } => {
                if let Some(req) = guard.requests.get_mut(&request_id) {
                    req.status = status;
                    req.updated_at_epoch_ms = event.timestamp_epoch_ms;
                }
            }
            MemoryEventKind::IncrementRetry { request_id } => {
                if let Some(req) = guard.requests.get_mut(&request_id) {
                    req.retry_count = req.retry_count.saturating_add(1);
                    req.updated_at_epoch_ms = event.timestamp_epoch_ms;
                }
            }
            MemoryEventKind::SetPendingDependencies {
                request_id,
                pending_dependencies,
            } => {
                if let Some(req) = guard.requests.get_mut(&request_id) {
                    req.pending_dependencies = pending_dependencies;
                    req.updated_at_epoch_ms = event.timestamp_epoch_ms;
                }
            }
            MemoryEventKind::SaveResponse {
                request_id,
                response,
            } => {
                if let Some(req) = guard.requests.get_mut(&request_id) {
                    req.latest_response = Some(response);
                    req.updated_at_epoch_ms = event.timestamp_epoch_ms;
                }
            }
            MemoryEventKind::MergeConversationState {
                conversation_id,
                patch,
            } => {
                let existing = guard
                    .conversation_state
                    .entry(conversation_id)
                    .or_insert_with(|| Value::Object(Default::default()));
                deep_merge(existing, &patch);
            }
        }

        guard.last_sequence = event.sequence;
        Ok(())
    }
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn deep_merge(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(target_map), Value::Object(patch_map)) => {
            for (key, patch_value) in patch_map {
                match target_map.get_mut(key) {
                    Some(existing) => deep_merge(existing, patch_value),
                    None => {
                        target_map.insert(key.clone(), patch_value.clone());
                    }
                }
            }
        }
        (target_value, patch_value) => {
            *target_value = patch_value.clone();
        }
    }
}
