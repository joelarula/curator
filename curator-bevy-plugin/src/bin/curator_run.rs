//! curator_run — CLI for the Curator Bevy workflow runtime.
//!
//! Commands:
//!   run     Submit an AST workflow from a JSON file or inline string and tail its outputs.
//!   test    Run a built-in multi-step workflow smoke-test and verify it completes.
//!
//! Usage examples:
//!
//!   # Run a workflow from a JSON file, polling until done
//!   curator_run run --ast workflow.json
//!
//!   # Run inline JSON, custom db path, custom conversation
//!   curator_run run --ast '{"type":"Curator_Tool","toolName":"ping"}' --db ./my.db --conversation my-conv
//!
//!   # Post a "human response" into a paused WAITING_FOR_USER request
//!   curator_run respond --request 42 --content "my answer" --db ./my.db
//!
//!   # Built-in smoke-test (sequential → tool → set-state → parallel → join)
//!   curator_run test --db ./test.db

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use curator_bevy_plugin::{CuratorProcessor, SqliteStore};
use serde_json::{json, Value};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};
use tracing::{info, warn};

const DEFAULT_DB: &str = "curator_bevy_runtime.db";
const POLL_INTERVAL_MS: u64 = 200;
const DEFAULT_TIMEOUT_S: u64 = 120;

#[derive(Parser, Debug)]
#[command(
    name = "curator_run",
    about = "Curator Bevy workflow CLI – run AST workflows or smoke-test the runtime"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Submit a workflow AST and tail its responses until completion.
    Run(RunArgs),
    /// Post a user response into a WAITING_FOR_USER request.
    Respond(RespondArgs),
    /// Execute a built-in smoke-test workflow and verify each step completes.
    Test(TestArgs),
}

#[derive(Parser, Debug)]
struct RunArgs {
    /// Path to a JSON file containing the AST, or an inline JSON string.
    #[arg(long, value_name = "AST")]
    ast: String,

    /// SQLite database path.
    #[arg(long, env = "CURATOR_DB", default_value = DEFAULT_DB)]
    db: String,

    /// Conversation ID to scope this workflow under.
    #[arg(long, default_value = "cli-conversation")]
    conversation: String,

    /// User ID to attach to this request.
    #[arg(long, default_value_t = 1)]
    user_id: i64,

    /// Seconds to wait for the workflow to complete before timing out.
    #[arg(long, default_value_t = DEFAULT_TIMEOUT_S)]
    timeout: u64,

    /// Polling interval in milliseconds.
    #[arg(long, default_value_t = POLL_INTERVAL_MS)]
    poll_ms: u64,

    /// Claim batch size per tick.
    #[arg(long, default_value_t = 16)]
    batch: i64,
}

#[derive(Parser, Debug)]
struct RespondArgs {
    /// Request ID to respond to.
    #[arg(long)]
    request: i64,

    /// Response content.
    #[arg(long)]
    content: String,

    /// SQLite database path.
    #[arg(long, env = "CURATOR_DB", default_value = DEFAULT_DB)]
    db: String,

    /// User ID posting the response.
    #[arg(long, default_value_t = 1)]
    user_id: i64,

    /// Conversation ID.
    #[arg(long, default_value = "cli-conversation")]
    conversation: String,
}

#[derive(Parser, Debug)]
struct TestArgs {
    /// SQLite database path (will be created fresh for test).
    #[arg(long, default_value = "curator_test.db")]
    db: String,

    /// Seconds to wait per test case before considering it failed.
    #[arg(long, default_value_t = 30)]
    timeout: u64,

    /// Keep the database file after the test run.
    #[arg(long)]
    keep_db: bool,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Run(args) => run_workflow(args),
        Commands::Respond(args) => post_response(args),
        Commands::Test(args) => run_tests(args),
    }
}

// ─── run ─────────────────────────────────────────────────────────────────────

fn run_workflow(args: RunArgs) -> Result<()> {
    let ast_value = load_ast(&args.ast)?;

    let store = SqliteStore::open(&args.db)
        .with_context(|| format!("cannot open db: {}", args.db))?;
    let processor = CuratorProcessor::new(store.clone(), args.batch);

    store
        .ensure_conversation(&args.conversation, args.user_id)
        .context("ensure_conversation")?;

    let ast_str = serde_json::to_string(&ast_value)?;
    let request_id = store
        .insert_request(
            args.user_id,
            &args.conversation,
            "NEW",
            0,
            None,
            Some(&ast_str),
            None,
            0,
            None,
        )
        .context("insert_request")?;

    info!("Submitted request id={} conversation={}", request_id, args.conversation);
    println!("▶  request_id={}", request_id);

    poll_until_done(&processor, &store, request_id, &args.conversation, args.timeout, args.poll_ms)
}

// ─── respond ─────────────────────────────────────────────────────────────────

fn post_response(args: RespondArgs) -> Result<()> {
    let store = SqliteStore::open(&args.db)
        .with_context(|| format!("cannot open db: {}", args.db))?;
    store
        .ensure_conversation(&args.conversation, args.user_id)
        .context("ensure_conversation")?;
    store
        .create_response(args.request, &args.conversation, args.user_id, &args.content)
        .context("create_response")?;
    println!("✓  response posted to request_id={}", args.request);
    Ok(())
}

// ─── test ─────────────────────────────────────────────────────────────────────

fn run_tests(args: TestArgs) -> Result<()> {
    let db = &args.db;

    // Start fresh
    if Path::new(db).exists() {
        std::fs::remove_file(db).with_context(|| format!("cannot remove old test db: {}", db))?;
    }

    let store = SqliteStore::open(db).context("open test db")?;
    let processor = CuratorProcessor::new(store.clone(), 32);

    let mut passed = 0usize;
    let mut failed = 0usize;

    macro_rules! tc {
        ($name:expr, $ast:expr) => {{
            let name = $name;
            let ast_str = serde_json::to_string(&$ast).unwrap();
            let conv = format!("test-conv-{}", uuid::Uuid::new_v4().simple());
            store.ensure_conversation(&conv, 1).unwrap();
            let req_id = store
                .insert_request(1, &conv, "NEW", 0, None, Some(&ast_str), None, 0, None)
                .unwrap();
            let ok = poll_until_done(&processor, &store, req_id, &conv, args.timeout, 50).is_ok();
            if ok {
                println!("  ✓  {}", name);
                passed += 1;
            } else {
                println!("  ✗  {} (timed out or failed)", name);
                failed += 1;
            }
        }};
    }

    println!("\n── Curator Bevy Plugin Smoke Tests ──\n");

    // 1. simple tool node
    tc!(
        "Curator_Tool",
        json!({ "type": "Curator_Tool", "toolName": "echo", "args": { "msg": "hello" } })
    );

    // 2. set state
    tc!(
        "Curator_SetState",
        json!({ "type": "Curator_SetState", "state": { "x": 1 } })
    );

    // 3. sequential: tool → set-state
    tc!(
        "Curator_Sequential",
        json!({
            "type": "Curator_Sequential",
            "subAgents": [
                { "type": "Curator_Tool", "toolName": "step1", "args": {} },
                { "type": "Curator_SetState", "state": { "seq_done": true } }
            ]
        })
    );

    // 4. parallel → join
    tc!(
        "Curator_Parallel + Join",
        json!({
            "type": "Curator_Parallel",
            "subAgents": [
                { "type": "Curator_Tool", "toolName": "branch_a", "args": {} },
                { "type": "Curator_Tool", "toolName": "branch_b", "args": {} }
            ]
        })
    );

    // 5. route node (phase 1 + 2 with script router that outputs route key)
    tc!(
        "Curator_Route",
        json!({
            "type": "Curator_Route",
            "router": {
                "type": "Curator_Script",
                "language": "javascript",
                "code": "\"alpha\""
            },
            "subAgents": {
                "alpha": { "type": "Curator_Tool", "toolName": "alpha_handler", "args": {} }
            },
            "defaultRoute": "alpha"
        })
    );

    // 6. graph: two states + terminal edge
    tc!(
        "Curator_Graph (linear)",
        json!({
            "type": "Curator_Graph",
            "startNode": "A",
            "nodes": {
                "A": { "type": "Curator_Tool", "toolName": "graph_a", "args": {} },
                "B": { "type": "Curator_Tool", "toolName": "graph_b", "args": {} }
            },
            "edges": {
                "A": "B",
                "B": "__end__"
            }
        })
    );

    // 7. interrupt stop mode
    tc!(
        "Curator_Interrupt (stop)",
        json!({
            "type": "Curator_Interrupt",
            "priority": 100,
            "mode": "stop",
            "handler": { "type": "Curator_Tool", "toolName": "interrupt_handler", "args": {} }
        })
    );

    // 8. agent ref (agent not in db → graceful error response)
    tc!(
        "Curator_AgentRef (missing, graceful)",
        json!({ "type": "Curator_AgentRef", "agentName": "nonexistent_agent" })
    );

    // 9. loop (2 iterations of a tool)
    tc!(
        "Curator_Loop (2 iterations)",
        json!({
            "type": "Curator_Loop",
            "maxIterations": 2,
            "agent": { "type": "Curator_Tool", "toolName": "loop_tool", "args": {} }
        })
    );

    // 10. end-to-end: sequential wrapping a parallel inside a graph node
    tc!(
        "Nested: Sequential → Parallel inside Graph",
        json!({
            "type": "Curator_Graph",
            "startNode": "start",
            "nodes": {
                "start": {
                    "type": "Curator_Sequential",
                    "subAgents": [
                        { "type": "Curator_Tool", "toolName": "seq_a" },
                        {
                            "type": "Curator_Parallel",
                            "subAgents": [
                                { "type": "Curator_Tool", "toolName": "par_x" },
                                { "type": "Curator_Tool", "toolName": "par_y" }
                            ]
                        }
                    ]
                }
            },
            "edges": { "start": "__end__" }
        })
    );

    println!("\n── Results: {passed} passed, {failed} failed ──\n");

    if !args.keep_db {
        let _ = std::fs::remove_file(db);
    }

    if failed > 0 {
        anyhow::bail!("{} test(s) failed", failed);
    }

    Ok(())
}

// ─── shared helpers ───────────────────────────────────────────────────────────

fn load_ast(input: &str) -> Result<Value> {
    let trimmed = input.trim();
    // File path
    if !trimmed.starts_with('{') && !trimmed.starts_with('[') {
        let content = std::fs::read_to_string(trimmed)
            .with_context(|| format!("cannot read AST file: {}", trimmed))?;
        return serde_json::from_str(&content).context("invalid JSON in AST file");
    }
    serde_json::from_str(trimmed).context("invalid inline AST JSON")
}

fn poll_until_done(
    processor: &CuratorProcessor,
    store: &SqliteStore,
    request_id: i64,
    conversation_id: &str,
    timeout_s: u64,
    poll_ms: u64,
) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(timeout_s);
    let interval = Duration::from_millis(poll_ms);
    let mut last_seen_count = 0usize;

    loop {
        processor.poll_once();

        // Print any new responses since last check
        let responses = store
            .conversation_responses(conversation_id)
            .context("read responses")?;
        for (req_id, content) in responses.iter().skip(last_seen_count) {
            println!("  ← [req {}] {}", req_id, truncate(content, 160));
        }
        last_seen_count = responses.len();

        // Check root request status
        if store.request_is_done(request_id).context("request_is_done")? {
            let status = store
                .request_status(request_id)
                .context("request_status")?
                .unwrap_or_else(|| "UNKNOWN".to_string());
            println!("✓  request_id={} final_status={}", request_id, status);
            if status == "FAILED" {
                anyhow::bail!("workflow ended in FAILED status");
            }
            return Ok(());
        }

        if Instant::now() >= deadline {
            warn!("Timeout reached waiting for request_id={}", request_id);
            anyhow::bail!("timed out after {}s", timeout_s);
        }

        thread::sleep(interval);
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}
