/// Integration test for a running curator server.
/// Default usage:
///   1. Start the server separately with `cargo run`
///   2. Run `cargo test --test poem_test -- --nocapture`

use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use tokio::time::{sleep, Duration};

fn base_url() -> String {
    env::var("CURATOR_TEST_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".to_string())
}

fn test_model() -> String {
    env::var("CURATOR_TEST_MODEL").unwrap_or_else(|_| "gemma-3-1b-it".to_string())
}

fn test_prompt() -> String {
    env::var("CURATOR_TEST_PROMPT")
        .unwrap_or_else(|_| "Write a short 4-line poem about the Rust programming language.".to_string())
}

fn test_max_tokens() -> usize {
    env::var("CURATOR_TEST_MAX_TOKENS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(128)
}

async fn wait_for_server(base_url: &str) {
    let client = Client::new();

    for _ in 0..60 {
        if let Ok(resp) = client.get(format!("{}/health", base_url)).send().await {
            if resp.status().is_success() {
                return;
            }
        }
        sleep(Duration::from_secs(1)).await;
    }

    panic!("Timed out waiting for curator server on port 8080");
}

#[tokio::test]
async fn test_health_check_and_poem_generation() {
    let base_url = base_url();
    let model = test_model();
    let prompt = test_prompt();
    let max_tokens = test_max_tokens();

    wait_for_server(&base_url).await;

    let client = Client::new();

    let health = client
        .get(format!("{}/health", base_url))
        .send()
        .await
        .expect("Failed to reach running server");

    assert!(health.status().is_success(), "Health check returned non-200: {}", health.status());

    let health_body: Value = health.json().await.expect("Invalid JSON in health response");
    assert_eq!(health_body["status"], "healthy");
    println!("Health: {}", health_body);

    // Payload follows the OpenAI-compatible Chat Completions schema.
    // Reference: https://platform.openai.com/docs/api-reference/chat/create
    // Schema details: https://platform.openai.com/docs/api-reference/chat/object
    let request_body = json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_tokens": max_tokens
    });

    let resp = client
        .post(format!("{}/v1/chat/completions", base_url))
        .json(&request_body)
        .send()
        .await
        .expect("Failed to reach running server");

    assert!(resp.status().is_success(), "Request failed with status: {}", resp.status());

    let body: Value = resp.json().await.expect("Invalid JSON in completion response");

    println!("\n--- Response ---");
    println!("ID:      {}", body["id"]);
    println!("Model:   {}", body["model"]);
    println!("Tokens:  {}", body["usage"]["total_tokens"]);
    println!("Poem:\n{}", body["choices"][0]["message"]["content"]);
    println!("----------------\n");

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .expect("No content in response");

    assert!(!content.is_empty(), "Model returned an empty response");
}
