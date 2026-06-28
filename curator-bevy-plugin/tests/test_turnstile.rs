use bevy_app::{App, ScheduleRunnerPlugin};
use bevy_ecs::prelude::Entity;
use curator_bevy_plugin::{CuratorAppExt, CuratorBevyPlugin, events::*, components::*, builder::{CuratorBuilder, GraphBuilder, RouteBuilder}};
use serde_json::json;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
struct TurnstileState {
    total_coins: u64,
}

// ---------------------------------------------------------------------------
// Test 1: Static edges (traffic light cycle)
// ---------------------------------------------------------------------------
#[test]
fn test_traffic_light_state_machine() {
    let mut app = App::new();
    app.add_plugins(ScheduleRunnerPlugin::default());
    app.add_plugins(CuratorBevyPlugin {
        sqlite_path: "test_traffic_light.db".to_string(),
        batch_size: 10,
        enable_sqlite_sync: false,
        auto_register_default_workflow: true,
    });

    let timed_light = |name: &'static str| {
        CuratorBuilder::rust_script(name, move |_input, _state| {
            thread::sleep(Duration::from_millis(5));
            name.to_string()
        })
    };

    let ast = GraphBuilder::new("RED")
        .add_node("RED", timed_light("RED"))
        .add_node("GREEN", timed_light("GREEN"))
        .add_node("YELLOW", timed_light("YELLOW"))
        .add_edge("RED",    "GREEN")
        .add_edge("GREEN",  "YELLOW")
        .add_edge("YELLOW", "RED")
        .build();

    app.spawn_curator_request(SpawnRequestEvent::<serde_json::Value> {
        conversation_state: None,
        ast,
        context: json!({}),
        conversation_id: "traffic-light-test".to_string(),
        notify_id: None,
        parent_entity: None,
        priority: 0,
    });

    let mut seen_states = HashSet::new();
    for _ in 0..30 {
        app.update();
        let mut gq = app.world_mut().query::<&GraphExecState>();
        for gs in gq.iter(app.world()) {
            seen_states.insert(gs.current_node.clone());
        }
    }

    let has_waiting_user = app.world_mut()
        .query::<&EcsRequestStatus>()
        .iter(app.world())
        .any(|s| *s == EcsRequestStatus::WaitingForUser);

    assert!(!has_waiting_user, "Traffic light should not wait for user input");
    assert!(seen_states.contains("RED"), "Expected RED state to be observed");
    assert!(seen_states.contains("GREEN"), "Expected GREEN state to be observed");
    assert!(seen_states.contains("YELLOW"), "Expected YELLOW state to be observed");
}

// ---------------------------------------------------------------------------
// Test 2: Dynamic edges (turnstile state machine)
//
//   LOCKED  --[Coin]--> UNLOCKED
//   LOCKED  --[Push]--> LOCKED   (stay)
//   UNLOCKED--[Coin]--> UNLOCKED (stay)
//   UNLOCKED--[Push]--> LOCKED
// ---------------------------------------------------------------------------
#[test]
fn test_turnstile_dynamic() {
    let mut app = App::new();
    app.add_plugins(ScheduleRunnerPlugin::default());
    app.add_plugins(CuratorBevyPlugin {
        sqlite_path: "test_turnstile_dynamic.db".to_string(),
        batch_size: 10,
        enable_sqlite_sync: false,
        auto_register_default_workflow: false,
    });

    let conversation_state = Arc::new(Mutex::new(TurnstileState::default()));

    let coin_route = |script_name: &'static str| {
        CuratorBuilder::<TurnstileState>::rust_script(script_name, |_input, state| {
            if let Some(state) = state {
                if let Ok(mut guard) = state.lock() {
                    guard.total_coins += 1;
                }
            }
            "UNLOCKED".to_string()
        })
    };

    let locked_edge = RouteBuilder::new(CuratorBuilder::script(""))
        .add_route("Coin", coin_route("coin_to_unlocked"))
        .add_route("Push", CuratorBuilder::script("LOCKED"))
        .build();

    let unlocked_edge = RouteBuilder::new(CuratorBuilder::script(""))
        .add_route("Coin", coin_route("coin_stay_unlocked"))
        .add_route("Push", CuratorBuilder::script("LOCKED"))
        .build();

    let ast = GraphBuilder::new("LOCKED")
        .add_node("LOCKED",   CuratorBuilder::human_input("LOCKED", None, None))
        .add_node("UNLOCKED", CuratorBuilder::human_input("UNLOCKED", None, None))
        .add_dynamic_edge("LOCKED",   locked_edge)
        .add_dynamic_edge("UNLOCKED", unlocked_edge)
        .build();

    app.spawn_curator_request(SpawnRequestEvent::<TurnstileState> {
        conversation_state: Some(conversation_state.clone()),
        ast,
        context: json!({}),
        conversation_id: "turnstile-dynamic-test".to_string(),
        notify_id: None,
        parent_entity: None,
        priority: 0,
    });

    // Helper: poll up to 50 ticks to find a WaitingForUser child of the graph
    // node currently on `expected_node`, then inject the user's answer.
    let provide_input = |app: &mut App, expected_node: &str, input: &str| {
        let mut child_entity: Option<Entity> = None;
        'outer: for _ in 0..50 {
            app.update();

            let mut gq = app.world_mut().query::<(Entity, &GraphExecState)>();
            let graph_e = gq.iter(app.world())
                .find(|(_, gs)| gs.current_node == expected_node)
                .map(|(e, _)| e);

            if let Some(graph_e) = graph_e {
                let mut cq = app.world_mut()
                    .query::<(Entity, &RequestComponent<TurnstileState>, &EcsRequestStatus)>();
                for (e, req, status) in cq.iter(app.world()) {
                    if *status == EcsRequestStatus::WaitingForUser
                        && req.parent_entity == Some(graph_e)
                    {
                        child_entity = Some(e);
                        break 'outer;
                    }
                }
            }
        }

        if child_entity.is_none() {
            let mut q = app.world_mut()
                .query::<(Entity, Option<&GraphExecState>, &EcsRequestStatus)>();
            for (e, gs, status) in q.iter(app.world()) {
                let node = gs.map(|g| g.current_node.as_str()).unwrap_or("(not graph)");
                println!("  Entity {:?}: node={}, status={:?}", e, node, status);
            }
        }
        assert!(child_entity.is_some(),
            "Should be waiting for user input at state '{}'", expected_node);

        let e = child_entity.unwrap();
        let mut req = app.world_mut()
            .get_mut::<RequestComponent<TurnstileState>>(e).unwrap();
        req.context["output"] = json!(input);
        *app.world_mut().get_mut::<EcsRequestStatus>(e).unwrap() = EcsRequestStatus::Completed;
    };

    // LOCKED --[Push]--> LOCKED  (stays locked)
    provide_input(&mut app, "LOCKED", "Push");

    // LOCKED --[Coin]--> UNLOCKED
    provide_input(&mut app, "LOCKED", "Coin");

    // UNLOCKED --[Coin]--> UNLOCKED  (stays unlocked)
    provide_input(&mut app, "UNLOCKED", "Coin");

    // UNLOCKED --[Push]--> LOCKED
    provide_input(&mut app, "UNLOCKED", "Push");

    for _ in 0..20 { app.update(); }

    // Graph should be back on LOCKED
    let mut gq = app.world_mut().query::<&GraphExecState>();
    let in_locked = gq.iter(app.world()).any(|gs| gs.current_node == "LOCKED");
    assert!(in_locked, "Should be back in LOCKED state");

    let total_coins = conversation_state.lock().unwrap().total_coins;
    assert_eq!(total_coins, 2, "Expected exactly two inserted coins");
}
