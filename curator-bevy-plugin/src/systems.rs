use bevy_ecs::prelude::*;
use crate::components::*;
use crate::events::*;
use crate::ast::*;

/// Synchronizes new requests from the SQLite database into the ECS.
pub fn sync_requests_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    processor_res: Option<Res<crate::ProcessorResource>>,
) {
    if let Some(res) = processor_res {
        if let Ok(claimed) = res.processor.store.claim_new_requests(&res.processor.worker_id, res.processor.batch_size) {
            for req_id in claimed {
                if let Ok(Some(row)) = res.processor.store.fetch_request(req_id) {
                    spawn_requests.write(SpawnRequestEvent::<T> {
                        ast: row.ast.and_then(|s| serde_json::from_str::<CuratorAstNode<T>>(s.as_str()).ok()).unwrap_or_else(|| crate::builder::CuratorBuilder::script("")),
                        context: row.context.and_then(|s| serde_json::from_str(s.as_str()).ok()).unwrap_or_else(|| serde_json::json!({})),
                        conversation_state: None,
                    conversation_id: row.conversation_id,
                        notify_id: row.notify_id,
                        parent_entity: None,
                        priority: row.priority,
                    });
                }
            }
        }
    }
}

/// Processes nodes of type Sequential
pub fn process_sequential_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    mut query: Query<(Entity, &mut RequestComponent<T>, &mut AstNodeComponent<CuratorSequentialNode<T>>, &mut EcsRequestStatus)>,
) {
    for (entity, req, mut ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        if ast.node.subAgents.is_empty() {
            *status = EcsRequestStatus::Completed;
            continue;
        }
        let child_node = ast.node.subAgents.remove(0);
        spawn_requests.write(SpawnRequestEvent::<T> {
            ast: child_node,
            context: req.context.clone(),
            conversation_id: req.conversation_id.clone(),
            conversation_state: req.conversation_state.clone(),
                notify_id: req.notify_id,
            parent_entity: Some(entity),
            priority: 0,
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

/// Processes nodes of type Parallel
pub fn process_parallel_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    mut query: Query<(Entity, &RequestComponent<T>, &mut AstNodeComponent<CuratorParallelNode<T>>, &mut EcsRequestStatus)>,
) {
    for (entity, req, mut ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        if ast.node.subAgents.is_empty() {
            *status = EcsRequestStatus::Completed;
            continue;
        }
        for child_node in ast.node.subAgents.drain(..) {
            spawn_requests.write(SpawnRequestEvent::<T> {
                ast: child_node,
                context: req.context.clone(),
                conversation_id: req.conversation_id.clone(),
                conversation_state: req.conversation_state.clone(),
                notify_id: req.notify_id,
                parent_entity: Some(entity),
                priority: 0,
            });
        }
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

/// Processes Human Input nodes
pub fn process_human_input_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut player_actions: MessageWriter<PlayerActionEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorHumanInputNode>, &mut EcsRequestStatus)>,
) {
    for (entity, req, ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        player_actions.write(PlayerActionEvent {
            request_id: req.id,
            entity,
            conversation_id: req.conversation_id.clone(),
            prompt: ast.node.prompt.clone(),
            choices: ast.node.choices.clone(),
        });
        *status = EcsRequestStatus::WaitingForUser;
    }
}

pub fn process_tool_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorToolNode>, &mut EcsRequestStatus)>,
) {
    for (entity, req, ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        let args = ast.node.parameters.clone().or_else(|| ast.node.args.clone()).unwrap_or_default();
        let output = serde_json::json!({
            "tool": ast.node.toolName,
            "args": args,
            "conversationId": req.conversation_id,
            "requestId": req.id
        });
        responses.write(ResponseEvent {
            request_id: req.id,
            entity,
            conversation_id: req.conversation_id.clone(),
            content: serde_json::to_string(&output).unwrap_or_default(),
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

pub fn process_set_state_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorSetStateNode>, &mut EcsRequestStatus)>,
) {
    for (entity, req, ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        responses.write(ResponseEvent {
            request_id: req.id,
            entity,
            conversation_id: req.conversation_id.clone(),
            content: format!("Set state: {}", ast.node.state),
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

pub fn process_agent_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorAgentNode>, &mut EcsRequestStatus)>,
) {
    for (entity, req, ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        let prompt = ast.node.prompt.as_deref().unwrap_or("Hello");
        let input = req.context.get("input").and_then(|x| x.as_str()).unwrap_or("");
        let output = if prompt.is_empty() {
            input.to_string()
        } else if input.is_empty() {
            prompt.to_string()
        } else {
            format!("{}\n\n{}", prompt, input)
        };
        responses.write(ResponseEvent {
            request_id: req.id,
            entity,
            conversation_id: req.conversation_id.clone(),
            content: output,
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

/// Processes nodes of type Loop
pub fn process_loop_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut commands: Commands,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorLoopNode<T>>, &mut EcsRequestStatus)>,
) {
    for (entity, _req, ast, status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        let mut sub = vec![];
        for _ in 0..ast.node.maxIterations.unwrap_or(1).max(1) {
            sub.push((*ast.node.agent).clone());
        }
        let seq = CuratorSequentialNode::<T> {
            base: ast.node.base.clone(),
            name: ast.node.name.clone(),
            prompt: ast.node.prompt.clone(),
            subAgents: sub,
        };
        commands.entity(entity)
            .remove::<AstNodeComponent<CuratorLoopNode<T>>>()
            .insert(AstNodeComponent { node: seq });
    }
}

/// Processes nodes of type Script
pub fn process_script_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut commands: Commands,
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorScriptNode<T>>, &mut EcsRequestStatus)>,
) {
    for (entity, req, ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        
        // 1. Try to execute the native Rust closure if it exists
        if let Some(closure) = &ast.node.closure {
            let input = req.context.get("input").cloned().unwrap_or(serde_json::Value::Null);
            let result = (closure)(input, req.conversation_state.clone());
            responses.write(ResponseEvent {
                request_id: req.id,
                entity,
                conversation_id: req.conversation_id.clone(),
                content: result,
            });
            *status = EcsRequestStatus::WaitingForDependencies;
            continue;
        }

        // 2. Legacy fallback: Try parsing string code as an AST node (nested agent pattern)
        if let Ok(ast_value) = serde_json::from_str::<CuratorAstNode<T>>(&ast.node.code) {
            spawn_requests.write(SpawnRequestEvent::<T> {
                ast: ast_value,
                context: req.context.clone(),
                conversation_id: req.conversation_id.clone(),
                conversation_state: req.conversation_state.clone(),
                notify_id: req.notify_id,
                parent_entity: Some(entity),
                priority: 0,
            });
            commands.entity(entity).insert(EcsRequestStatus::WaitingForDependencies);
            continue;
        }

        // 3. Fallback: just return the code string
        responses.write(ResponseEvent {
            request_id: req.id,
            entity,
            conversation_id: req.conversation_id.clone(),
            content: ast.node.code.clone(),
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

pub fn process_route_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &mut RequestComponent<T>, &AstNodeComponent<CuratorRouteNode<T>>, &mut EcsRequestStatus, &mut RouteExecState)>,
    child_query: Query<(&RequestComponent<T>, &EcsRequestStatus), Without<AstNodeComponent<CuratorRouteNode<T>>>>,
) {
    for (entity, mut req, ast, mut status, mut route_state) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }

        // Route has two phases tracked by RouteExecState:
        //   decided = false -> spawn router script and wait
        //   decided = true, executed = false -> spawn chosen subagent
        //   executed = true -> collect subagent output, complete route
        let decided = route_state.decided;
        let executed = route_state.executed;

        if executed {
            // Subagent done - find its output (max child id among our children).
            let mut last_output = String::new();
            let mut max_child_id: i64 = -1;
            for (child_req, child_status) in child_query.iter() {
                if child_req.parent_entity == Some(entity)
                    && *child_status == EcsRequestStatus::Completed
                    && child_req.id > route_state.execution_start_child_id
                {
                    if child_req.id > max_child_id {
                        max_child_id = child_req.id;
                        if let Some(out) = child_req.context.get("output").and_then(|v| v.as_str()) {
                            last_output = out.to_string();
                        }
                    }
                }
            }
            if max_child_id < 0 {
                // Selected subagent has not completed yet.
                continue;
            }
            // Set output directly - response_observer cannot get &mut on an entity
            // already borrowed by iter_mut(), so we write it here first.
            req.context["output"] = serde_json::Value::String(last_output.clone());
            *status = EcsRequestStatus::Completed;
            responses.write(ResponseEvent {
                request_id: req.id,
                entity,
                conversation_id: req.conversation_id.clone(),
                content: last_output,
            });
            continue;
        }

        if !decided {
            // Check if router child just finished
            let mut router_output: Option<String> = None;
            for (child_req, child_status) in child_query.iter() {
                if child_req.parent_entity == Some(entity) && *child_status == EcsRequestStatus::Completed {
                    if let Some(out) = child_req.context.get("output").and_then(|v| v.as_str()) {
                        router_output = Some(out.to_string());
                        break;
                    }
                    // Router returned empty - still counts as decided (use input fallback)
                    router_output = Some(String::new());
                    break;
                }
            }

            if let Some(out) = router_output {
                let mut selection = out.trim().to_string();
                if selection.is_empty() {
                    selection = req.context
                        .get("input")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                }
                route_state.decided = true;
                route_state.selection = Some(selection);
                continue;
            }

            // Router not yet spawned - spawn it
            spawn_requests.write(SpawnRequestEvent::<T> {
                ast: (*ast.node.router).clone(),
                context: req.context.clone(),
                conversation_id: req.conversation_id.clone(),
                conversation_state: req.conversation_state.clone(),
                notify_id: req.notify_id,
                parent_entity: Some(entity),
                priority: 0,
            });
            *status = EcsRequestStatus::WaitingForDependencies;
        } else {
            // Router decided - spawn the chosen subagent
            let mut selection = route_state.selection.clone().unwrap_or_default();

            // Fallback: if router returned empty, use context["input"] (the value
            // the graph forwarded as the edge input).
            if selection.is_empty() {
                selection = req.context.get("input").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&selection) {
                    if let Some(route) = parsed.get("route").and_then(|x| x.as_str()) {
                        selection = route.to_string();
                    } else if let Some(output) = parsed.get("output").and_then(|x| x.as_str()) {
                        selection = output.to_string();
                    }
                }
            }

            let target_ast_opt = ast.node.subAgents.get(&selection)
                .or_else(|| ast.node.defaultRoute.as_ref().and_then(|d| ast.node.subAgents.get(d)));

            if let Some(target_ast) = target_ast_opt {
                let mut sub_ctx = req.context.clone();
                sub_ctx["input"] = serde_json::Value::String(selection.clone());

                let mut max_existing_child_id = -1;
                for (child_req, _) in child_query.iter() {
                    if child_req.parent_entity == Some(entity) {
                        max_existing_child_id = max_existing_child_id.max(child_req.id);
                    }
                }

                spawn_requests.write(SpawnRequestEvent::<T> {
                    ast: target_ast.clone(),
                    context: sub_ctx,
                    conversation_id: req.conversation_id.clone(),
                    conversation_state: req.conversation_state.clone(),
                    notify_id: req.notify_id,
                    parent_entity: Some(entity),
                    priority: 0,
                });
                route_state.executed = true;
                route_state.execution_start_child_id = max_existing_child_id;
                *status = EcsRequestStatus::WaitingForDependencies;
            } else {
                // No route matched - complete with empty output
                req.context["output"] = serde_json::Value::String(String::new());
                *status = EcsRequestStatus::Completed;
                responses.write(ResponseEvent {
                    request_id: req.id,
                    entity,
                    conversation_id: req.conversation_id.clone(),
                    content: format!("[Route Failed: No match for '{}']", selection),
                });
            }
        }
    }
}

pub fn process_join_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorJoinNode<T>>, &mut EcsRequestStatus)>,
) {
    for (entity, req, _ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        responses.write(ResponseEvent {
            request_id: req.id,
            entity,
            conversation_id: req.conversation_id.clone(),
            content: "[Joined Output]".to_string(),
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

/// Processes nodes of type Graph.
///
/// Internal traversal state lives in [`GraphExecState`] � a dedicated ECS
/// component � never in `RequestComponent::context`. Only user-facing data
/// (child node outputs) ever touches `context`.
pub fn process_graph_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    mut responses: MessageWriter<ResponseEvent>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorGraphNode<T>>, &mut EcsRequestStatus, &mut GraphExecState)>,
    child_query: Query<(&RequestComponent<T>, &EcsRequestStatus), Without<AstNodeComponent<CuratorGraphNode<T>>>>,
) {
    for (entity, req, ast, mut status, mut graph_state) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }

        // Scan direct children newer than our last-consumed checkpoint.
        let mut last_output: Option<String> = None;
        let mut max_child_id: i64 = graph_state.last_consumed_child_id;
        for (child_req, child_status) in child_query.iter() {
            if child_req.parent_entity == Some(entity)
                && *child_status == EcsRequestStatus::Completed
                && child_req.id > graph_state.last_consumed_child_id
            {
                if child_req.id > max_child_id {
                    max_child_id = child_req.id;
                    if let Some(out) = child_req.context.get("output").and_then(|v| v.as_str()) {
                        last_output = Some(out.to_string());
                    }
                }
            }
        }

        let current_node = graph_state.current_node.clone();
        eprintln!("[Graph {:?}] tick: node={:?} exec_edge={} consumed={} last_output={:?} max_child={}",
            entity, current_node, graph_state.executing_edge, graph_state.last_consumed_child_id,
            last_output, max_child_id);

        // Terminal
        if current_node == "__end__" {
            responses.write(ResponseEvent {
                request_id: req.id,
                entity,
                conversation_id: req.conversation_id.clone(),
                content: last_output.unwrap_or_default(),
            });
            continue;
        }

        // Waiting for a dynamic edge to return the next node name
        if graph_state.executing_edge {
            if let Some(ref output) = last_output {
                let next_node = if output.is_empty() { "__end__".to_string() } else { output.clone() };
                graph_state.current_node = next_node;
                graph_state.executing_edge = false;
                graph_state.last_consumed_child_id = max_child_id;
                // Stay `New` so next tick spawns the new node.
            }
            // Else: edge child not yet visible � stay WaitingForDependencies.
            continue;
        }

        // A node child just finished � evaluate its outgoing edge
        if last_output.is_some() {
            graph_state.last_consumed_child_id = max_child_id;

            if let Some(edges) = &ast.node.edges {
                if let Some(edge_val) = edges.get(&current_node) {
                    match edge_val {
                        crate::ast::CuratorEdge::Static(edge_str) => {
                            graph_state.current_node = edge_str.clone();
                            // Stay `New` � spawn new node next tick.
                            continue;
                        }
                        crate::ast::CuratorEdge::Dynamic(edge_ast) => {
                            // Forward the node's output as `input` to the edge router.
                            let mut edge_context = req.context.clone();
                            edge_context["input"] = serde_json::Value::String(
                                last_output.clone().unwrap()
                            );
                            spawn_requests.write(SpawnRequestEvent::<T> {
                                ast: edge_ast.clone(),
                                context: edge_context,
                                conversation_id: req.conversation_id.clone(),
                                conversation_state: req.conversation_state.clone(),
                                notify_id: req.notify_id,
                                parent_entity: Some(entity),
                                priority: 0,
                            });
                            graph_state.executing_edge = true;
                            *status = EcsRequestStatus::WaitingForDependencies;
                            continue;
                        }
                    }
                }
            }
            // No outgoing edge  go to terminal.
            graph_state.current_node = "__end__".to_string();
            continue;
        }

        let has_inflight_child = child_query.iter().any(|(child_req, child_status)| {
            child_req.parent_entity == Some(entity) && *child_status != EcsRequestStatus::Completed
        });
        if has_inflight_child {
            continue;
        }

        eprintln!("[Graph {:?}] no new output, spawning node {:?}", entity, current_node);
        // No new completed children and no in-flight child -- spawn the current node
        if let Some(target_ast) = ast.node.nodes.get(&current_node) {
            spawn_requests.write(SpawnRequestEvent::<T> {
                ast: target_ast.clone(),
                context: req.context.clone(),
                conversation_id: req.conversation_id.clone(),
                conversation_state: req.conversation_state.clone(),
                notify_id: req.notify_id,
                parent_entity: Some(entity),
                priority: 0,
            });
            *status = EcsRequestStatus::WaitingForDependencies;
        } else {
            responses.write(ResponseEvent {
                request_id: req.id,
                entity,
                conversation_id: req.conversation_id.clone(),
                content: format!("Node '{}' not found in graph", current_node),
            });
        }
    }
}

/// Processes nodes of type AgentRef
pub fn process_agent_ref_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut spawn_requests: MessageWriter<SpawnRequestEvent<T>>,
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorAgentRefNode>, &mut EcsRequestStatus)>,
) {
    for (entity, req, ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        let spawned = req.context.get("spawnedChild").and_then(|x| x.as_bool()).unwrap_or(false);
        if spawned {
            *status = EcsRequestStatus::Completed;
            continue;
        }
        let mock_agent = CuratorAgentNode {
            base: ast.node.base.clone(),
            agentName: Some(ast.node.agentName.clone()),
            prompt: Some(format!("Agent {} prompt", ast.node.agentName)),
            model: None,
            instruction: None,
            include_contents: None,
            tools: None,
            provider: None,
            baseUrl: None,
            input_schema: None,
            output_schema: None,
        };
        spawn_requests.write(SpawnRequestEvent::<T> {
            ast: CuratorAstNode::<T>::Agent(mock_agent),
            context: req.context.clone(),
            conversation_id: req.conversation_id.clone(),
            conversation_state: req.conversation_state.clone(),
                notify_id: req.notify_id,
            parent_entity: Some(entity),
            priority: 0,
        });
        *status = EcsRequestStatus::WaitingForDependencies;
    }
}

/// Processes nodes of type Interrupt
pub fn process_interrupt_nodes_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut query: Query<(Entity, &RequestComponent<T>, &AstNodeComponent<CuratorInterruptNode<T>>, &mut EcsRequestStatus)>,
) {
    for (_entity, _req, _ast, mut status) in query.iter_mut() {
        if *status != EcsRequestStatus::New { continue; }
        *status = EcsRequestStatus::Completed;
    }
}

static REQUEST_ID_COUNTER: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(1);

/// Consumes `SpawnRequestEvent` messages and turns them into actual Bevy ECS entities.
pub fn spawn_request_message_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut messages: MessageReader<SpawnRequestEvent::<T>>,
    mut commands: Commands,
) {
    for ev in messages.read() {
        let ast_node = ev.ast.clone();

        let req = RequestComponent::<T> {
            id: REQUEST_ID_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst),
            conversation_id: ev.conversation_id.clone(),
            notify_id: ev.notify_id,
            parent_entity: ev.parent_entity,
            context: ev.context.clone(),
            conversation_state: ev.conversation_state.clone(),
        };

        let mut e = commands.spawn((req, EcsRequestStatus::New));

        match ast_node {
            CuratorAstNode::<T>::Sequential(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Parallel(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Join(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Route(node) => {
                e.insert(AstNodeComponent { node });
                e.insert(RouteExecState::default());
            },
            CuratorAstNode::<T>::Loop(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Tool(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Script(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Graph(node) => {
                let start = node.startNode.clone();
                e.insert(AstNodeComponent { node });
                e.insert(GraphExecState::new(start));
            },
            CuratorAstNode::<T>::HumanInput(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::AgentRef(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::SetState(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Interrupt(node) => { e.insert(AstNodeComponent { node }); },
            CuratorAstNode::<T>::Agent(node) => { e.insert(AstNodeComponent { node }); },
        }
    }
}

/// System that checks if parents WaitingForDependencies have all their children Completed.
pub fn resolve_dependencies_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut commands: Commands,
    query: Query<(Entity, &RequestComponent<T>, &EcsRequestStatus)>,
) {
    let mut waiting_parents = Vec::new();
    let mut child_statuses = std::collections::HashMap::new();
    
    for (entity, req, status) in query.iter() {
        if *status == EcsRequestStatus::WaitingForDependencies {
            waiting_parents.push(entity);
        }
        if let Some(parent) = req.parent_entity {
            child_statuses.entry(parent).or_insert_with(Vec::new).push(status.clone());
        }
    }
    
    let mut to_complete = Vec::new();
    for parent in waiting_parents {
        if let Some(children) = child_statuses.get(&parent) {
            if !children.is_empty() && children.iter().all(|s| *s == EcsRequestStatus::Completed) {
                to_complete.push(parent);
            }
        }
        // If no children recorded yet (commands not flushed), keep waiting.
    }
    
    for parent in to_complete {
        commands.entity(parent).insert(EcsRequestStatus::New);
    }
}

pub fn response_message_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut messages: MessageReader<ResponseEvent>,
    mut commands: Commands,
    mut query: Query<&mut RequestComponent<T>>,
    processor_res: Option<Res<crate::ProcessorResource>>,
) {
    for ev in messages.read() {
        commands.entity(ev.entity).insert(EcsRequestStatus::Completed);

        if let Ok(mut req) = query.get_mut(ev.entity) {
            req.context["output"] = serde_json::Value::String(ev.content.clone());
        }

        if let Some(res) = &processor_res {
            let _ = res.processor.store.create_response(ev.request_id, &ev.conversation_id, 0, &ev.content);
            let _ = res.processor.store.set_request_status_locked(ev.request_id, "COMPLETED", None);
        }
    }
}

pub fn player_action_message_system<T: Send + Sync + Clone + std::fmt::Debug + Default + serde::Serialize + serde::de::DeserializeOwned + 'static>(
    mut messages: MessageReader<PlayerActionEvent>,
    processor_res: Option<Res<crate::ProcessorResource>>,
) {
    for ev in messages.read() {
        if let Some(res) = &processor_res {
            let _ = res.processor.store.set_request_status_locked(ev.request_id, "WAITING_FOR_USER", None);
        }
    }
}