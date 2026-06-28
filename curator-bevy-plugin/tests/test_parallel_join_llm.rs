use bevy_app::{App, ScheduleRunnerPlugin};
use curator_bevy_plugin::{
    ast::{CuratorAstNode, CuratorJoinNode, CuratorParallelNode, CuratorToolNode},
    builder::CuratorBuilder,
    components::{AstNodeComponent, EcsRequestStatus, RequestComponent},
    events::SpawnRequestEvent,
    CuratorAppExt, CuratorBevyPlugin,
};
use serde_json::json;

#[test]
fn test_parallel_scrape_join_then_llm_summary_tool() {
    let mut app = App::new();
    app.add_plugins(ScheduleRunnerPlugin::default());
    app.add_plugins(CuratorBevyPlugin {
        sqlite_path: "test_parallel_join_llm.db".to_string(),
        batch_size: 10,
        enable_sqlite_sync: false,
        auto_register_default_workflow: true,
    });

    let parallel_scrapes = CuratorAstNode::Parallel(CuratorParallelNode {
        base: Default::default(),
        name: Some("parallel_feed_scrapes".to_string()),
        prompt: Some("Scrape feed pages and links in parallel".to_string()),
        subAgents: vec![
            CuratorBuilder::script("SCRAPED_FEED_PAGE_CONTENT"),
            CuratorBuilder::script("SCRAPED_ALL_FEED_LINKS"),
        ],
    });

    let join_node = CuratorAstNode::Join(CuratorJoinNode {
        base: Default::default(),
        name: Some("join_scraped_results".to_string()),
        joinLogic: Some("wait_all_scrapes".to_string()),
        nextNode: None,
    });

    let llm_summary_tool = curator_bevy_plugin::ast::CuratorAstNode::Tool(CuratorToolNode {
        base: Default::default(),
        toolName: "llm_summarize_pages".to_string(),
        args: Some(json!({
            "task": "summarize pages",
            "model": "mock-llm",
            "inputs": ["feed pages", "feed links"]
        })),
        parameters: None,
    });

    let ast = CuratorBuilder::sequential(vec![parallel_scrapes, join_node, llm_summary_tool]);

    app.spawn_curator_request(SpawnRequestEvent::<serde_json::Value> {
        conversation_state: None,
        ast,
        context: json!({}),
        conversation_id: "parallel-join-llm-test".to_string(),
        notify_id: None,
        parent_entity: None,
        priority: 0,
    });

    for _ in 0..80 {
        app.update();
    }

    let mut script_q = app.world_mut().query::<(&AstNodeComponent<curator_bevy_plugin::ast::CuratorScriptNode<serde_json::Value>>, &RequestComponent<serde_json::Value>, &EcsRequestStatus)>();
    let mut saw_feed_page_scrape = false;
    let mut saw_feed_links_scrape = false;
    for (ast, req, status) in script_q.iter(app.world()) {
        if *status != EcsRequestStatus::Completed {
            continue;
        }
        let output = req.context.get("output").and_then(|v| v.as_str()).unwrap_or_default();
        if ast.node.code == "SCRAPED_FEED_PAGE_CONTENT" && output == "SCRAPED_FEED_PAGE_CONTENT" {
            saw_feed_page_scrape = true;
        }
        if ast.node.code == "SCRAPED_ALL_FEED_LINKS" && output == "SCRAPED_ALL_FEED_LINKS" {
            saw_feed_links_scrape = true;
        }
    }
    assert!(saw_feed_page_scrape, "Expected mock feed page scrape branch to complete");
    assert!(saw_feed_links_scrape, "Expected mock all-feed-links scrape branch to complete");

    let mut join_q = app.world_mut().query::<(&AstNodeComponent<CuratorJoinNode<serde_json::Value>>, &RequestComponent<serde_json::Value>, &EcsRequestStatus)>();
    let join_completed = join_q.iter(app.world()).any(|(_ast, req, status)| {
        *status == EcsRequestStatus::Completed
            && req.context.get("output").and_then(|v| v.as_str()) == Some("[Joined Output]")
    });
    assert!(join_completed, "Expected join node to complete after parallel scrapes");

    let mut tool_q = app.world_mut().query::<(&AstNodeComponent<CuratorToolNode>, &RequestComponent<serde_json::Value>, &EcsRequestStatus)>();
    let mut saw_llm_summary_tool = false;
    for (_ast, req, status) in tool_q.iter(app.world()) {
        if *status != EcsRequestStatus::Completed {
            continue;
        }
        let output = req.context.get("output").and_then(|v| v.as_str()).unwrap_or_default();
        let parsed = serde_json::from_str::<serde_json::Value>(output).ok();
        if let Some(v) = parsed {
            if v.get("tool").and_then(|x| x.as_str()) == Some("llm_summarize_pages")
                && v.get("args")
                    .and_then(|a| a.get("task"))
                    .and_then(|x| x.as_str())
                    == Some("summarize pages")
            {
                saw_llm_summary_tool = true;
                break;
            }
        }
    }
    assert!(saw_llm_summary_tool, "Expected mocked LLM summarize tool to run after join");
}
