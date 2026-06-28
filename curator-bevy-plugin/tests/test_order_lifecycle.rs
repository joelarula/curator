use bevy_app::{App, ScheduleRunnerPlugin};
use bevy_ecs::prelude::Entity;
use curator_bevy_plugin::{CuratorAppExt, CuratorBevyPlugin, events::*, components::*, builder::{CuratorBuilder, GraphBuilder, RouteBuilder}};
use serde_json::json;

#[test]
fn test_order_lifecycle_state_machine() {
    let mut app = App::new();
    
    app.add_plugins(ScheduleRunnerPlugin::default());
    app.add_plugins(CuratorBevyPlugin {
        sqlite_path: "test_order_lifecycle.db".to_string(),
        batch_size: 10,
        enable_sqlite_sync: false,
        auto_register_default_workflow: true,
    });

    let conversation_id = "order-lifecycle-test";

    // Dynamic edge for PENDING: routes on user input
    let pending_edge = RouteBuilder::new(CuratorBuilder::script(""))
        .add_route("PAYMENT_RECEIVED", CuratorBuilder::script("PREPARING"))
        .add_route("CANCEL_REQUESTED", CuratorBuilder::script("CANCELLED"))
        .build();

    // Dynamic edge for PREPARING
    let preparing_edge = RouteBuilder::new(CuratorBuilder::script(""))
        .add_route("PACKAGE_PICKED_UP", CuratorBuilder::script("DISPATCHED"))
        .add_route("CANCEL_REQUESTED", CuratorBuilder::script("CANCELLED"))
        .build();

    // Dynamic edge for DISPATCHED (CANCEL_REQUESTED is a no-op here)
    let dispatched_edge = RouteBuilder::new(CuratorBuilder::script(""))
        .add_route("CUSTOMER_SIGNED", CuratorBuilder::script("DELIVERED"))
        .build();

    let ast = GraphBuilder::new("PENDING")
        .add_node("PENDING",    CuratorBuilder::human_input("Wait for PAYMENT or CANCEL", None, None))
        .add_node("PREPARING",  CuratorBuilder::human_input("Wait for PICKUP or CANCEL", None, None))
        .add_node("DISPATCHED", CuratorBuilder::human_input("Wait for SIGNED", None, None))
        .add_node("DELIVERED",  CuratorBuilder::script("Delivered"))
        .add_node("CANCELLED",  CuratorBuilder::script("Cancelled"))
        .add_dynamic_edge("PENDING",    pending_edge)
        .add_dynamic_edge("PREPARING",  preparing_edge)
        .add_dynamic_edge("DISPATCHED", dispatched_edge)
        .build();

    // Kick off the graph
    app.spawn_curator_request(SpawnRequestEvent::<serde_json::Value> {
        conversation_state: None,
        ast,
        context: json!({}),
        conversation_id: conversation_id.to_string(),
        notify_id: None,
        parent_entity: None,
        priority: 0,
    });

    // --- Helper: poll up to 50 ticks, find child WaitingForUser whose parent
    //     graph entity is on `expected_node`, then inject the user's answer ---
    let provide_input = |app: &mut App, expected_node: &str, input: &str| {
        let mut child_entity: Option<Entity> = None;
        'outer: for _ in 0..50 {
            app.update();

            // Find the graph entity currently on expected_node
            let mut graph_query = app.world_mut()
                .query::<(Entity, &GraphExecState)>();
            let graph_entity = graph_query.iter(app.world())
                .find(|(_, gs)| gs.current_node == expected_node)
                .map(|(e, _)| e);

            if let Some(graph_e) = graph_entity {
                // Find a child of that graph entity that is WaitingForUser
                let mut child_query = app.world_mut()
                    .query::<(Entity, &RequestComponent<serde_json::Value>, &EcsRequestStatus)>();
                for (e, req, status) in child_query.iter(app.world()) {
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
            // Debug dump
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
            .get_mut::<RequestComponent<serde_json::Value>>(e).unwrap();
        req.context["output"] = json!(input);
        *app.world_mut().get_mut::<EcsRequestStatus>(e).unwrap() = EcsRequestStatus::Completed;
    };

    // Walk the happy path: PENDING → PREPARING → DISPATCHED → DELIVERED
    provide_input(&mut app, "PENDING",    "PAYMENT_RECEIVED");
    provide_input(&mut app, "PREPARING",  "PACKAGE_PICKED_UP");
    provide_input(&mut app, "DISPATCHED", "CUSTOMER_SIGNED");

    // Let the graph settle to __end__
    for _ in 0..50 { app.update(); }

    // Verify the graph reached __end__
    let mut q = app.world_mut().query::<&GraphExecState>();
    let reached_end = q.iter(app.world()).any(|gs| gs.current_node == "__end__");
    assert!(reached_end, "Order graph should reach __end__ after delivery");
}
