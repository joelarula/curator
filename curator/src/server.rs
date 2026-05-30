use axum::{Extension, Json};
use std::sync::Arc;
use crate::{AppState, RuntimeSamplingSettings};
use llama_cpp_v3::{LlamaBatch, LlamaSampler};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub top_k: Option<i32>,
    pub top_p: Option<f32>,
    pub repeat_penalty: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: ChatUsage,
}

#[derive(Debug, Serialize)]
pub struct ChatChoice {
    pub index: usize,
    pub message: ChatMessageOut,
    pub finish_reason: String,
}

#[derive(Debug, Serialize)]
pub struct ChatMessageOut {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ChatUsage {
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSamplingSettingsRequest {
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub top_k: Option<i32>,
    pub top_p: Option<f32>,
    pub repeat_penalty: Option<f32>,
}

pub async fn get_settings(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, String> {
    let settings = state
        .runtime_settings
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;

    Ok(Json(serde_json::json!({
        "settings": {
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
            "top_k": settings.top_k,
            "top_p": settings.top_p,
            "repeat_penalty": settings.repeat_penalty
        },
        "source": "runtime_mutable"
    })))
}

pub async fn update_settings(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<UpdateSamplingSettingsRequest>,
) -> Result<Json<serde_json::Value>, String> {
    let mut settings = state
        .runtime_settings
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;

    if let Some(v) = payload.temperature {
        if !(0.0..=2.0).contains(&v) {
            return Err("temperature must be in range [0.0, 2.0]".to_string());
        }
        settings.temperature = v;
    }

    if let Some(v) = payload.max_tokens {
        if v == 0 || v > 4096 {
            return Err("max_tokens must be in range [1, 4096]".to_string());
        }
        settings.max_tokens = v;
    }

    if let Some(v) = payload.top_k {
        if v < 1 || v > 200 {
            return Err("top_k must be in range [1, 200]".to_string());
        }
        settings.top_k = v;
    }

    if let Some(v) = payload.top_p {
        if !(0.0..=1.0).contains(&v) || v == 0.0 {
            return Err("top_p must be in range (0.0, 1.0]".to_string());
        }
        settings.top_p = v;
    }

    if let Some(v) = payload.repeat_penalty {
        if !(0.5..=2.0).contains(&v) {
            return Err("repeat_penalty must be in range [0.5, 2.0]".to_string());
        }
        settings.repeat_penalty = v;
    }

    Ok(Json(serde_json::json!({
        "updated": true,
        "settings": {
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
            "top_k": settings.top_k,
            "top_p": settings.top_p,
            "repeat_penalty": settings.repeat_penalty
        }
    })))
}

pub async fn metadata(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, String> {
    let settings = state
        .runtime_settings
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;

    Ok(Json(serde_json::json!({
        "service": "curator-local-llm",
        "engine": "llama.cpp (via llama-cpp-v3)",
        "model_path": state.args.model,
        "runtime": {
            "backend": "cpu",
            "context_size": state.args.ctx_size
        },
        "defaults": {
            "temperature": state.args.temp,
            "max_tokens": state.args.max_tokens,
            "top_k": state.args.top_k,
            "top_p": state.args.top_p,
            "repeat_penalty": state.args.repeat_penalty
        },
        "current_settings": {
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens,
            "top_k": settings.top_k,
            "top_p": settings.top_p,
            "repeat_penalty": settings.repeat_penalty
        },
        "request_overrides": ["temperature", "max_tokens", "top_k", "top_p", "repeat_penalty"],
        "endpoints": ["/health", "/v1/metadata", "/v1/settings", "/v1/chat/completions"]
    })))
}

pub async fn chat_completions(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, String> {
    let response = run_chat_completion(state, payload).await?;
    Ok(Json(response))
}

pub async fn run_chat_completion(
    state: Arc<AppState>,
    payload: ChatCompletionRequest,
) -> Result<ChatCompletionResponse, String> {
    info!("Received chat completion request for model: {}", payload.model);
    // Sampling precedence is: request override -> mutable runtime setting -> CLI default.
    let RuntimeSamplingSettings {
        temperature: default_temperature,
        max_tokens: default_max_tokens,
        top_k: default_top_k,
        top_p: default_top_p,
        repeat_penalty: default_repeat_penalty,
    } = *state
        .runtime_settings
        .lock()
        .map_err(|e| format!("Mutex lock failed: {}", e))?;

    let temperature = payload.temperature.unwrap_or(default_temperature);
    let max_gen_tokens = payload.max_tokens.unwrap_or(default_max_tokens);
    let top_k = payload.top_k.unwrap_or(default_top_k);
    let top_p = payload.top_p.unwrap_or(default_top_p);
    let repeat_penalty = payload.repeat_penalty.unwrap_or(default_repeat_penalty);

    info!(
        "Sampling params => temperature: {}, max_tokens: {}, top_k: {}, top_p: {}, repeat_penalty: {}",
        temperature, max_gen_tokens, top_k, top_p, repeat_penalty
    );

    // 1. Build the Gemma chat transcript expected by the instruction-tuned model.
    // The OpenAI-style JSON request is translated into the text template that the
    // model was trained on before tokenization happens.
    let mut prompt = String::new();
    for msg in &payload.messages {
        let role = match msg.role.as_str() {
            "assistant" => "model",
            other => other,
        };
        prompt.push_str(&format!("<start_of_turn>{}\n{}<end_of_turn>\n", role, msg.content));
    }
    prompt.push_str("<start_of_turn>model\n");

    // 2. Tokenize with the GGUF model's tokenizer metadata.
    info!("Tokenizing prompt...");
    let prompt_tokens = state.model.tokenize(&prompt, true, true)
        .map_err(|e| format!("Tokenization failed: {:?}", e))?;
    
    let prompt_len = prompt_tokens.len();
    info!("Prompt tokenized successfully ({} tokens).", prompt_len);
    let vocab = state.model.get_vocab();

    // 3. Acquire exclusive access to the mutable llama.cpp context.
    let mut ctx = state.context.lock().map_err(|e| format!("Mutex lock failed: {}", e))?;

    // Each HTTP request is independent; clear KV cache so token positions can restart at 0.
    ctx.kv_cache_clear();

    // 4. Prefill the full prompt so llama.cpp can build attention state for generation.
    let mut batch = LlamaBatch::new(state.backend.lib.clone(), 2048, 0, 1);

    for (i, &token) in prompt_tokens.iter().enumerate() {
        batch.add(token, i as i32, &[0], i == prompt_tokens.len() - 1);
    }

    info!("Decoding prefill batch...");
    ctx.decode(&batch)
        .map_err(|e| format!("Prefill decoding failed: {:?}", e))?;

    // 5. Generate one token at a time, feeding each sampled token back into the context.
    let mut generated_tokens = Vec::new();
    // NOTE: Some llama.cpp builds with Gemma + sampler-chain can hit a hard assert
    // (cur_p.selected) and terminate the process. Use greedy sampler for stability.
    if temperature > 0.0 || repeat_penalty > 1.0 || top_k != 40 || (top_p - 0.95).abs() > f32::EPSILON {
        warn!(
            "Sampler-chain requested (temp/top_k/top_p/repeat_penalty), but using greedy fallback for process stability"
        );
    }
    let sampler = LlamaSampler::new_greedy(state.backend.lib.clone());
    let mut current_pos = prompt_tokens.len() as i32;
    info!("Starting token generation loop (max {} tokens)...", max_gen_tokens);

    for i in 0..max_gen_tokens {
        let next_token = sampler.sample(&ctx, -1);

        if vocab.is_eog(next_token) {
            info!("Reached End-of-Stream token (ID: {}) at step {}.", next_token, i);
            break;
        }

        generated_tokens.push(next_token);

    // Feed the sampled token back into the context so the next sampling step sees it.
        batch.clear();
        batch.add(next_token, current_pos, &[0], true);
        current_pos += 1;

        ctx.decode(&batch)
            .map_err(|e| format!("Decoding step {} failed: {:?}", i, e))?;
    }

    // 6. Convert token ids back into model text pieces for the response payload.
    let mut generated_text = String::new();
    for token in generated_tokens {
        generated_text.push_str(&state.model.token_to_piece(token));
    }

    info!("Generation complete. Output length: {} chars.", generated_text.len());

    let choice = ChatChoice {
        index: 0,
        message: ChatMessageOut {
            role: "assistant".to_string(),
            content: generated_text,
        },
        finish_reason: "stop".to_string(),
    };

    let completion_tokens = choice.message.content.len() / 4; // rough estimate

    let response = ChatCompletionResponse {
        id: format!("chatcmpl-{}", uuid::Uuid::new_v4()),
        object: "chat.completion".to_string(),
        created: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        model: payload.model,
        choices: vec![choice],
        usage: ChatUsage {
            prompt_tokens: prompt_len,
            completion_tokens,
            total_tokens: prompt_len + completion_tokens,
        },
    };

    Ok(response)
}
