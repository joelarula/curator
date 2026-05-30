use std::path::Path;
use std::sync::{Arc, Mutex};

use axum::{
    routing::{get, post},
    Extension, Json, Router,
};
use clap::Args;
use llama_cpp_v3::{Backend, LlamaBackend, LlamaContext, LlamaModel, LoadOptions};
use tower_http::cors::CorsLayer;
use tracing::{error, info};

pub mod server;

pub type CuratorResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Args, Debug, Clone)]
pub struct ServeArgs {
    /// Port to listen on
    #[arg(short, long, default_value = "8080")]
    pub port: u16,

    /// Path to the GGUF model file (overridable via MODEL_PATH env var)
    #[arg(short, long, env = "MODEL_PATH", default_value = "../models/google_gemma-3-1b-it-Q4_K_M.gguf")]
    pub model: String,

    /// Context size for inference
    #[arg(short, long, default_value = "2048")]
    pub ctx_size: u32,

    /// Default temperature for inference
    #[arg(short, long, default_value = "0.7")]
    pub temp: f32,

    /// Default max output tokens for chat completions
    #[arg(long, default_value = "256")]
    pub max_tokens: usize,

    /// Default top-k sampling parameter
    #[arg(long, default_value = "40")]
    pub top_k: i32,

    /// Default top-p sampling parameter
    #[arg(long, default_value = "0.95")]
    pub top_p: f32,

    /// Default repetition penalty (1.0 disables penalty)
    #[arg(long, default_value = "1.0")]
    pub repeat_penalty: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct RuntimeSamplingSettings {
    pub temperature: f32,
    pub max_tokens: usize,
    pub top_k: i32,
    pub top_p: f32,
    pub repeat_penalty: f32,
}

pub struct AppState {
    pub backend: LlamaBackend,
    pub model: LlamaModel,
    pub context: Mutex<LlamaContext>,
    pub args: ServeArgs,
    pub runtime_settings: Mutex<RuntimeSamplingSettings>,
}

pub fn init_tracing() {
    let _ = tracing_subscriber::fmt::try_init();
}

pub fn resolve_model_path(configured_path: &str) -> Option<String> {
    let candidate_paths = [
        configured_path,
        "assets/models/google_gemma-3-1b-it-Q4_K_M.gguf",
        "assets/models/google_gemma-3-1b-it-bf16.gguf",
        "../models/google_gemma-3-1b-it-Q4_K_M.gguf",
    ];

    candidate_paths
        .into_iter()
        .find(|path| Path::new(path).exists())
        .map(str::to_string)
}

pub async fn create_app_state(mut args: ServeArgs) -> CuratorResult<Arc<AppState>> {
    // The CLI/server layer accepts a preferred model path, but development setups
    // often move the GGUF between repo-local assets and a shared models folder.
    if let Some(model_path) = resolve_model_path(&args.model) {
        if model_path != args.model {
            info!("Model not found at configured path, using detected model at: {}", model_path);
            args.model = model_path;
        }
    }
    info!("CLI Configuration: {:?}", args);

    // llama-cpp-v3 is a Rust wrapper around a dynamically loaded llama.cpp runtime.
    // This keeps the higher-level Curator code in Rust while inference stays in the
    // native llama.cpp engine.
    info!("Loading llama.cpp backend dynamically...");
    let backend = LlamaBackend::load(LoadOptions {
        backend: Backend::Cpu,
        app_name: "curator_local_llm",
        version: None,
        explicit_path: None,
        cache_dir: None,
    })
    .map_err(|e| {
        error!("Failed to dynamically load llama.cpp backend: {:?}", e);
        e
    })?;

    // The GGUF file contains the model weights and tokenizer metadata used by the
    // runtime. Once loaded, the model object can tokenize prompts and detokenize
    // generated token ids in addition to driving inference through a context.
    info!("Loading GGUF model from: {}...", args.model);
    if !Path::new(&args.model).exists() {
        return Err(format!(
            "Model file not found at: {}. Checked configured path plus fallback locations under assets/models and ../models.",
            args.model
        )
        .into());
    }

    let model_params = LlamaModel::default_params(&backend);
    let model = LlamaModel::load_from_file(&backend, &args.model, model_params).map_err(|e| {
        error!("Failed to load GGUF model file: {:?}", e);
        e
    })?;

    info!("Initializing LlamaContext with context size: {}...", args.ctx_size);
    let mut ctx_params = LlamaContext::default_params(&model);
    ctx_params.n_ctx = args.ctx_size;

    // The context owns the mutable inference state, including KV cache contents.
    // It is shared behind a mutex because each request mutates the same native state.
    let context = LlamaContext::new(&model, ctx_params).map_err(|e| {
        error!("Failed to create LlamaContext: {:?}", e);
        e
    })?;

    Ok(Arc::new(AppState {
        backend,
        model,
        context: Mutex::new(context),
        args: args.clone(),
        runtime_settings: Mutex::new(RuntimeSamplingSettings {
            temperature: args.temp,
            max_tokens: args.max_tokens,
            top_k: args.top_k,
            top_p: args.top_p,
            repeat_penalty: args.repeat_penalty,
        }),
    }))
}

pub fn build_server_app(state: Arc<AppState>) -> Router {
    // The HTTP server is intentionally thin: routes expose metadata/settings and
    // forward generation requests into the same library path used by the CLI.
    Router::new()
        .route("/v1/chat/completions", post(server::chat_completions))
        .route("/v1/metadata", get(server::metadata))
        .route("/v1/settings", get(server::get_settings).post(server::update_settings))
        .route("/health", get(health_check))
        .layer(CorsLayer::permissive())
        .layer(Extension(state))
}

pub async fn run_server(args: ServeArgs) -> CuratorResult<()> {
    init_tracing();
    info!("Starting Curator Local LLM service...");

    let state = create_app_state(args).await?;
    let addr = format!("0.0.0.0:{}", state.args.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Curator local LLM server listening on http://{}", addr);
    axum::serve(listener, build_server_app(state)).await?;
    Ok(())
}

pub fn read_prompt_input(input: &str, literal: bool) -> std::io::Result<String> {
    // The command runner accepts either inline prompt text or a path to a prompt file.
    // This keeps the CLI ergonomic for both quick testing and checked-in prompt assets.
    if !literal && Path::new(input).exists() {
        std::fs::read_to_string(input)
    } else {
        Ok(input.to_string())
    }
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "curator-local-llm",
        "engine": "llama.cpp (via llama-cpp-v3)"
    }))
}