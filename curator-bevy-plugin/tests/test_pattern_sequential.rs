use curator_bevy_plugin::{CuratorProcessor, SqliteStore};
use serde_json::json;
use std::path::PathBuf;

#[test]
fn test_pattern_sequential_equivalent() {
    let db_path: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data").join(format!(
        "curator_bevy_sequential_test_{}.db",
        uuid::Uuid::new_v4().simple()
    ));
    println!("sqlite db path: {}", db_path.display());
    let store = SqliteStore::open(db_path.to_str().expect("db path as str")).expect("open sqlite db file");
    let processor = CuratorProcessor::new(store.clone(), 16);

    let conversation_id = "sequential-pattern-conv";
    store
        .ensure_conversation(conversation_id, 1)
        .expect("ensure conversation");

    // This mirrors curator/scripts/test_pattern_sequential.ts.
    // The Rust runtime uses script nodes as state-emitting steps, so we encode
    // the expected step payloads directly as JSON text responses.
    let ast = json!({
        "type": "Curator_Sequential",
        "name": "SequentialPipeline",
        "prompt": "Write an article about the future of AI agents.",
        "subAgents": [
            {
                "type": "Curator_Script",
                "language": "javascript",
                "code": "{\"facts\":[\"AI will be autonomous\",\"Agents will collaborate\"]}"
            },
            {
                "type": "Curator_Script",
                "language": "javascript",
                "code": "{\"draft\":\"The future of AI is collaborative autonomy.\"}"
            },
            {
                "type": "Curator_Script",
                "language": "javascript",
                "code": "{\"final_article\":\"The future of AI is collaborative autonomy. It will revolutionize workflows.\"}"
            }
        ]
    });

    let request_id = store
        .insert_request(
            1,
            conversation_id,
            "NEW",
            0,
            None,
            Some(&serde_json::to_string(&ast).expect("serialize ast")),
            None,
            0,
            None,
        )
        .expect("insert root request");

    for _ in 0..50 {
        processor.poll_once();
        if store
            .conversation_pending_request_count(conversation_id)
            .expect("pending count")
            == 0
        {
            break;
        }
    }

    assert_eq!(store.conversation_pending_request_count(conversation_id).unwrap(), 0);
    assert!(store.request_is_done(request_id).unwrap());

    let state: serde_json::Value = serde_json::from_str(
        &store
            .get_conversation_state(conversation_id)
            .expect("conversation state")
            .expect("state exists"),
    )
    .expect("parse conversation state");

    assert_eq!(state["facts"], json!(["AI will be autonomous", "Agents will collaborate"]));
    assert_eq!(state["draft"], json!("The future of AI is collaborative autonomy."));
    assert!(state.get("final_article").is_none());

    let responses = store
        .conversation_responses(conversation_id)
        .expect("conversation responses");
    assert_eq!(responses.len(), 3);
    assert_eq!(responses[0].1, "{\"facts\":[\"AI will be autonomous\",\"Agents will collaborate\"]}");
    assert_eq!(responses[1].1, "{\"draft\":\"The future of AI is collaborative autonomy.\"}");
    assert_eq!(
        responses[2].1,
        "{\"final_article\":\"The future of AI is collaborative autonomy. It will revolutionize workflows.\"}"
    );

    assert_eq!(
        responses.last().unwrap().1,
        "{\"final_article\":\"The future of AI is collaborative autonomy. It will revolutionize workflows.\"}"
    );

    if std::env::var("CURATOR_CLEANUP_TEST_DB").is_ok() {
        let _ = std::fs::remove_file(&db_path);
        println!("removed sqlite db after test: {}", db_path.display());
    } else {
        println!("keeping sqlite db for inspection: {}", db_path.display());
    }
}
