use crate::ast::{CuratorAstNode, CuratorGraphNode, CuratorInterruptNode, CuratorParallelNode, CuratorRouteNode, CuratorSequentialNode};
use crate::sqlite_store::{RequestRow, SqliteStore};
use serde_json::{json, Value};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Typed context structs for the SQLite-backed processor.
// These replace ad-hoc ctx["key"] JSON access with proper typed fields.
// They serialize to the same JSON shape so the DB format is unchanged.
// ---------------------------------------------------------------------------

/// State persisted by the processor while a Graph node is mid-flight.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct GraphContext {
    /// The graph state-machine node currently executing (e.g. "PENDING").
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub active_node: String,

    /// The last output/payload from the child node or edge router.
    #[serde(default)]
    pub state_data: serde_json::Value,

    /// What the graph is blocked on: None = just started,
    /// "NODE" = waiting for a state node child to finish,
    /// "ROUTER" = waiting for a dynamic-edge router to return the next name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waiting_for: Option<GraphWaitKind>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GraphWaitKind {
    Node,
    Router,
}

impl GraphContext {
    /// Deserialize from the raw JSON context blob stored in SQLite.
    pub fn from_ctx(ctx: &serde_json::Value) -> Self {
        serde_json::from_value(ctx.clone()).unwrap_or_default()
    }

    /// Merge back into the raw context blob (preserves other user-written keys).
    pub fn apply_to(&self, ctx: &mut serde_json::Value) {
        if let Ok(v) = serde_json::to_value(self) {
            if let (serde_json::Value::Object(src), serde_json::Value::Object(dst)) = (v, ctx) {
                for (k, val) in src { dst.insert(k, val); }
            }
        }
    }
}

/// State persisted by the processor while a Route node is mid-flight.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct RouteContext {
    /// true once the router sub-agent has been dispatched and we are
    /// waiting for its decision to come back via ctx["input"].
    #[serde(default)]
    pub route_decided: bool,
}

impl RouteContext {
    pub fn from_ctx(ctx: &serde_json::Value) -> Self {
        serde_json::from_value(ctx.clone()).unwrap_or_default()
    }

    pub fn apply_to(&self, ctx: &mut serde_json::Value) {
        if let Ok(v) = serde_json::to_value(self) {
            if let (serde_json::Value::Object(src), serde_json::Value::Object(dst)) = (v, ctx) {
                for (k, val) in src { dst.insert(k, val); }
            }
        }
    }
}


#[derive(Clone)]
pub struct CuratorProcessor {
    pub store: SqliteStore,
    pub worker_id: String,
    pub batch_size: i64,
}

impl CuratorProcessor {
    pub fn new(store: SqliteStore, batch_size: i64) -> Self {
        Self {
            store,
            worker_id: format!("curator-bevy-{}", Uuid::new_v4().simple()),
            batch_size,
        }
    }

    pub fn poll_once(&self) {
        if let Err(err) = self.poll_once_inner() {
            tracing::error!("poll_once error: {}", err);
        }
    }

    fn poll_once_inner(&self) -> anyhow::Result<()> {
        self.resume_waiting_for_user()?;

        let claimed = self
            .store
            .claim_new_requests(&self.worker_id, self.batch_size)?;

        for request_id in claimed {
            self.process_request(request_id)?;
        }

        Ok(())
    }

    fn resume_waiting_for_user(&self) -> anyhow::Result<()> {
        let candidates = self
            .store
            .waiting_for_user_with_response(self.batch_size)?;

        for request_id in candidates {
            let Some(req) = self.store.fetch_request(request_id)? else {
                continue;
            };
            let ctx = parse_context(req.context.as_deref());
            let target_user = ctx
                .get("targetUserId")
                .and_then(|x| x.as_i64())
                .filter(|x| *x > 0);
            if let Some(target_user_id) = target_user {
                let latest_user = self.store.latest_response_user(request_id)?;
                if latest_user != Some(target_user_id) {
                    continue;
                }
            }

            self.store
                .set_request_status_locked(request_id, "WAITING", Some(&self.worker_id))?;
            self.complete_request(request_id, "COMPLETED")?;
        }

        Ok(())
    }

    fn process_request(&self, request_id: i64) -> anyhow::Result<()> {
        let Some(req) = self.store.fetch_request(request_id)? else {
            return Ok(());
        };

        let Some(ast_raw) = req.ast.as_ref() else {
            self.complete_request(request_id, "COMPLETED")?;
            return Ok(());
        };

        let ast: CuratorAstNode<serde_json::Value> = match serde_json::from_str(ast_raw) {
            Ok(x) => x,
            Err(err) => {
                tracing::warn!("Unknown AST for request {}: {}", req.id, err);
                self.store.set_request_status_locked(req.id, "SKIPPED", None)?;
                return Ok(());
            }
        };

        let result = match ast {
            CuratorAstNode::Sequential(node) => self.handle_sequential(&node, &req),
            CuratorAstNode::Parallel(node) => self.handle_parallel(&node, &req),
            CuratorAstNode::Join(_) => self.handle_join(&req),
            CuratorAstNode::Route(node) => self.handle_route(&node, &req),
            CuratorAstNode::Graph(node) => self.handle_graph(&node, &req),
            CuratorAstNode::HumanInput(node) => self.handle_human_input(&node, &req),
            CuratorAstNode::Tool(node) => self.handle_tool(&node.toolName, node.parameters.or(node.args), &req),
            CuratorAstNode::Script(node) => self.handle_script(&node.code, &req),
            CuratorAstNode::AgentRef(node) => self.handle_agent_ref(&node.agentName, &req),
            CuratorAstNode::SetState(node) => self.handle_set_state(&node.state, &req),
            CuratorAstNode::Interrupt(node) => self.handle_interrupt(&node, &req),
            CuratorAstNode::Agent(node) => self.handle_agent(node.prompt.as_deref().unwrap_or("Hello"), &req),
            CuratorAstNode::Loop(node) => {
                // Simple loop parity: expand as sequential copies of the same node.
                let mut sub = vec![];
                for _ in 0..node.maxIterations.unwrap_or(1).max(1) {
                    sub.push((*node.agent).clone());
                }
                self.handle_sequential(
                    &CuratorSequentialNode {
                        base: node.base,
                        name: node.name,
                        prompt: node.prompt,
                        subAgents: sub,
                    },
                    &req,
                )
            }
        };

        if let Err(err) = result {
            self.handle_processing_error(&req, &err.to_string())?;
        }

        Ok(())
    }

    fn handle_processing_error(&self, req: &RequestRow, msg: &str) -> anyhow::Result<()> {
        let is_rate = msg.contains("429") || msg.contains("Quota exceeded") || msg.contains("retry in");
        if is_rate && req.retry_count < 5 {
            let delay_ms = 5_000_i64.saturating_mul(2_i64.saturating_pow(req.retry_count as u32));
            let scheduled = SqliteStore::now_ms() + delay_ms;
            self.store
                .set_retry_new_scheduled(req.id, req.retry_count + 1, scheduled)?;
            return Ok(());
        }

        self.store.create_response(
            req.id,
            &req.conversation_id,
            req.user_id,
            &format!("ERROR: {}", msg),
        )?;
        self.store.set_request_status_locked(req.id, "FAILED", None)?;
        Ok(())
    }

    fn handle_agent(&self, prompt: &str, req: &RequestRow) -> anyhow::Result<()> {
        let ctx = parse_context(req.context.as_deref());
        let input = ctx.get("input").and_then(|x| x.as_str()).unwrap_or("");
        let output = if input.is_empty() {
            prompt.to_string()
        } else {
            format!("{}\n\n{}", prompt, input)
        };
        self.store
            .create_response(req.id, &req.conversation_id, req.user_id, &output)?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_tool(&self, tool_name: &str, args: Option<Value>, req: &RequestRow) -> anyhow::Result<()> {
        let output = json!({
            "tool": tool_name,
            "args": args.unwrap_or_else(|| Value::Object(Default::default())),
            "conversationId": req.conversation_id,
            "requestId": req.id
        });
        println!("[curator-bevy] tool={} request_id={} output={}", tool_name, req.id, output);
        self.store.create_response(
            req.id,
            &req.conversation_id,
            req.user_id,
            &serde_json::to_string(&output)?,
        )?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_script(&self, code: &str, req: &RequestRow) -> anyhow::Result<()> {
        // Rust runtime cannot execute JS directly. If script returns JSON AST string, emulate spawn behavior.
        if let Ok(ast_value) = serde_json::from_str::<Value>(code) {
            if ast_value.get("type").is_some() {
                println!("[curator-bevy] script-spawn request_id={} ast_type={}", req.id, ast_value.get("type").and_then(|v| v.as_str()).unwrap_or("unknown"));
                self.store.insert_request(
                    req.user_id,
                    &req.conversation_id,
                    "NEW",
                    0,
                    Some(req.id),
                    Some(&serde_json::to_string(&ast_value)?),
                    req.context.as_deref(),
                    req.priority,
                    None,
                )?;
                self.store.set_request_status_locked(req.id, "WAITING", None)?;
                return Ok(());
            }
        }

        println!("[curator-bevy] script request_id={} output={}", req.id, code);
        self.store
            .create_response(req.id, &req.conversation_id, req.user_id, code)?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_agent_ref(&self, agent_name: &str, req: &RequestRow) -> anyhow::Result<()> {
        let mut ctx = parse_context(req.context.as_deref());
        let spawned = ctx
            .get("spawnedChild")
            .and_then(|x| x.as_bool())
            .unwrap_or(false);

        if spawned {
            let output = ctx
                .get("input")
                .cloned()
                .unwrap_or_else(|| Value::String(String::new()));
            let content = match output {
                Value::String(s) => s,
                other => serde_json::to_string(&other)?,
            };
            self.store
                .create_response(req.id, &req.conversation_id, req.user_id, &content)?;
            return self.complete_request(req.id, "COMPLETED");
        }

        let Some(agent_ast) = self.store.find_agent_ast(agent_name)? else {
            self.store.create_response(
                req.id,
                &req.conversation_id,
                req.user_id,
                &format!("[Agent Error] Agent '{}' not found", agent_name),
            )?;
            return self.complete_request(req.id, "COMPLETED");
        };

        let input = ctx.get("input").cloned().unwrap_or(Value::Null);
        self.store.insert_request(
            req.user_id,
            &req.conversation_id,
            "NEW",
            0,
            Some(req.id),
            Some(&agent_ast),
            Some(&serde_json::to_string(&json!({"input": input}))?),
            0,
            None,
        )?;

        ctx["spawnedChild"] = Value::Bool(true);
        self.store
            .set_request_context_and_new(req.id, 1, &ctx)?;
        Ok(())
    }

    fn handle_set_state(&self, state_patch: &Value, req: &RequestRow) -> anyhow::Result<()> {
        println!("[curator-bevy] set-state request_id={} patch={}", req.id, state_patch);
        self.store
            .merge_conversation_state(&req.conversation_id, state_patch)?;
        self.store.create_response(
            req.id,
            &req.conversation_id,
            req.user_id,
            &serde_json::to_string(&json!({"status":"State updated","state": state_patch}))?,
        )?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_human_input(&self, node: &crate::ast::CuratorHumanInputNode, req: &RequestRow) -> anyhow::Result<()> {
        let mut ctx = parse_context(req.context.as_deref());
        let target = node.targetUserId.unwrap_or(0);
        if target > 0 {
            ctx["targetUserId"] = Value::Number(target.into());
        }
        self.store
            .set_request_context_and_new(req.id, req.pending_dependencies, &ctx)?;
        self.store
            .set_request_status_locked(req.id, "WAITING_FOR_USER", None)?;
        Ok(())
    }

    fn handle_sequential(&self, ast: &CuratorSequentialNode<serde_json::Value>, req: &RequestRow) -> anyhow::Result<()> {
        if ast.subAgents.is_empty() {
            return self.complete_request(req.id, "COMPLETED");
        }

        let mut current_notify = req.notify_id;
        for i in (0..ast.subAgents.len()).rev() {
            let is_first = i == 0;
            let mut node_value = serde_json::to_value(&ast.subAgents[i])?;
            if is_first {
                if let Some(prompt) = &ast.prompt {
                    if node_value.get("prompt").is_none() {
                        if let Value::Object(map) = &mut node_value {
                            map.insert("prompt".to_string(), Value::String(prompt.clone()));
                        }
                    }
                }
            }

            let priority = node_value
                .get("priority")
                .and_then(|x| x.as_i64())
                .unwrap_or(0);
            let scheduled = self.resolve_scheduled_at(node_value.get("scheduledAt"));
            let new_id = self.store.insert_request(
                req.user_id,
                &req.conversation_id,
                "NEW",
                if is_first { 0 } else { 1 },
                current_notify,
                Some(&serde_json::to_string(&node_value)?),
                None,
                priority,
                scheduled,
            )?;
            current_notify = Some(new_id);
        }

        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_parallel(&self, ast: &CuratorParallelNode<serde_json::Value>, req: &RequestRow) -> anyhow::Result<()> {
        if ast.subAgents.is_empty() {
            return self.complete_request(req.id, "COMPLETED");
        }

        let join = json!({
            "type":"Curator_Join",
            "name": format!("{}_join", ast.name.clone().unwrap_or_else(|| "parallel".to_string()))
        });

        let join_id = self.store.insert_request(
            req.user_id,
            &req.conversation_id,
            "NEW",
            ast.subAgents.len() as i64,
            req.notify_id,
            Some(&serde_json::to_string(&join)?),
            None,
            0,
            None,
        )?;

        for sub in &ast.subAgents {
            let mut node_value = serde_json::to_value(sub)?;
            if let Some(prompt) = &ast.prompt {
                if node_value.get("prompt").is_none() {
                    if let Value::Object(map) = &mut node_value {
                        map.insert("prompt".to_string(), Value::String(prompt.clone()));
                    }
                }
            }
            let priority = node_value
                .get("priority")
                .and_then(|x| x.as_i64())
                .unwrap_or(0);
            let scheduled = self.resolve_scheduled_at(node_value.get("scheduledAt"));

            self.store.insert_request(
                req.user_id,
                &req.conversation_id,
                "NEW",
                0,
                Some(join_id),
                Some(&serde_json::to_string(&node_value)?),
                None,
                priority,
                scheduled,
            )?;
        }

        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_join(&self, req: &RequestRow) -> anyhow::Result<()> {
        let children = self.store.completed_children_with_last_response(req.id)?;
        let text = format!("[Joined Output]\n{}", children.join("\n\n---\n\n"));
        self.store
            .create_response(req.id, &req.conversation_id, req.user_id, &text)?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_route(&self, ast: &CuratorRouteNode<serde_json::Value>, req: &RequestRow) -> anyhow::Result<()> {
        let mut ctx = parse_context(req.context.as_deref());
        let mut route_ctx = RouteContext::from_ctx(&ctx);
        let decided = route_ctx.route_decided;

        if !decided {
            self.store.insert_request(
                req.user_id,
                &req.conversation_id,
                "NEW",
                0,
                Some(req.id),
                Some(&serde_json::to_string(&ast.router)?),
                None,
                0,
                None,
            )?;
            route_ctx.route_decided = true;
            route_ctx.apply_to(&mut ctx);
            self.store.set_request_context_and_new(req.id, 1, &ctx)?;
            return Ok(());
        }

        let mut decision = ctx
            .get("input")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        if let Ok(parsed) = serde_json::from_str::<Value>(&decision) {
            if let Some(route) = parsed.get("route").and_then(|x| x.as_str()) {
                decision = route.to_string();
            } else if let Some(output) = parsed.get("output").and_then(|x| x.as_str()) {
                decision = output.to_string();
            }
        }

        let target = ast
            .subAgents
            .get(&decision)
            .or_else(|| ast.defaultRoute.as_ref().and_then(|d| ast.subAgents.get(d)));

        if let Some(target_ast) = target {
            let parent_notify = req.notify_id;
            self.store.update_request_notify(req.id, None)?;
            self.store.insert_request(
                req.user_id,
                &req.conversation_id,
                "NEW",
                0,
                parent_notify,
                Some(&serde_json::to_string(target_ast)?),
                Some(&serde_json::to_string(&json!({"input": ctx.get("input").cloned().unwrap_or(Value::Null)}))?),
                0,
                None,
            )?;
            self.store.create_response(
                req.id,
                &req.conversation_id,
                req.user_id,
                &format!("[Route Decided: {}]", decision),
            )?;
            return self.complete_request(req.id, "COMPLETED");
        }

        self.store.create_response(
            req.id,
            &req.conversation_id,
            req.user_id,
            &format!("[Route Failed: No Match for '{}']", decision),
        )?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn handle_graph(&self, ast: &CuratorGraphNode<serde_json::Value>, req: &RequestRow) -> anyhow::Result<()> {
        let mut ctx = parse_context(req.context.as_deref());
        let mut graph_ctx = GraphContext::from_ctx(&ctx);
        let mut active_node = if graph_ctx.active_node.is_empty() {
            ast.startNode.clone()
        } else {
            graph_ctx.active_node.clone()
        };
        let waiting_for = graph_ctx.waiting_for.clone();
        let mut state_data = if graph_ctx.state_data.is_null() {
            ctx.get("input").cloned().unwrap_or(Value::String(String::new()))
        } else {
            graph_ctx.state_data.clone()
        };

        if let Some(ref waiting) = waiting_for {
            if *waiting == GraphWaitKind::Node {
                state_data = ctx.get("input").cloned().unwrap_or(state_data);
                if let Some(edges) = &ast.edges {
                    if let Some(edge) = edges.get(&active_node) {
                        match edge {
                            crate::ast::CuratorEdge::Static(next_str) => {
                                if next_str == "__end__" {
                                    self.store.create_response(
                                        req.id,
                                        &req.conversation_id,
                                        req.user_id,
                                        &to_text(&state_data),
                                    )?;
                                    return self.complete_request(req.id, "COMPLETED");
                                }
                                active_node = next_str.to_string();
                            }
                            crate::ast::CuratorEdge::Dynamic(edge_ast) => {
                                self.store.insert_request(
                                    req.user_id,
                                    &req.conversation_id,
                                    "NEW",
                                    0,
                                    Some(req.id),
                                    Some(&serde_json::to_string(&edge_ast)?),
                                    Some(&serde_json::to_string(&json!({"input": state_data}))?),
                                    0,
                                    None,
                                )?;
                                graph_ctx.active_node = active_node;
                                graph_ctx.state_data = state_data;
                                graph_ctx.waiting_for = Some(GraphWaitKind::Router);
                                graph_ctx.apply_to(&mut ctx);
                                self.store.set_request_context_and_new(req.id, 1, &ctx)?;
                                return Ok(());
                            }
                        }
                    } else {
                        self.store.create_response(
                            req.id,
                            &req.conversation_id,
                            req.user_id,
                            &to_text(&state_data),
                        )?;
                        return self.complete_request(req.id, "COMPLETED");
                    }
                }
            } else if *waiting == GraphWaitKind::Router {
                let route_dest = ctx
                    .get("input")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                active_node = route_dest;
            }
        }

        if active_node == "__end__" {
            self.store.create_response(
                req.id,
                &req.conversation_id,
                req.user_id,
                &to_text(&state_data),
            )?;
            return self.complete_request(req.id, "COMPLETED");
        }

        let Some(target_ast) = ast.nodes.get(&active_node) else {
            self.store.create_response(
                req.id,
                &req.conversation_id,
                req.user_id,
                &format!("[Graph Failed: Unknown state '{}']\n{}", active_node, to_text(&state_data)),
            )?;
            return self.complete_request(req.id, "COMPLETED");
        };

        self.store.insert_request(
            req.user_id,
            &req.conversation_id,
            "NEW",
            0,
            Some(req.id),
            Some(&serde_json::to_string(target_ast)?),
            Some(&serde_json::to_string(&json!({"input": state_data}))?),
            0,
            None,
        )?;

        graph_ctx.active_node = active_node;
        graph_ctx.state_data = state_data;
        graph_ctx.waiting_for = Some(GraphWaitKind::Node);
        graph_ctx.apply_to(&mut ctx);
        self.store.set_request_context_and_new(req.id, 1, &ctx)?;
        Ok(())
    }

    fn handle_interrupt(&self, ast: &CuratorInterruptNode<serde_json::Value>, req: &RequestRow) -> anyhow::Result<()> {
        let mode = ast.mode.clone().unwrap_or_else(|| "stop".to_string());
        let priority = ast.priority;
        let threshold = ast.cancelBelowPriority.unwrap_or(priority);

        if mode == "play" {
            let resumed = self
                .store
                .update_many_status(&req.conversation_id, "PAUSED", "NEW")?;
            self.store.create_response(
                req.id,
                &req.conversation_id,
                req.user_id,
                &serde_json::to_string(&json!({"status":"play","resumed":resumed}))?,
            )?;
            return self.complete_request(req.id, "COMPLETED");
        }

        if mode == "pause" {
            let paused = self.store.update_many_new_to_status_by_priority(
                &req.conversation_id,
                threshold,
                "PAUSED",
            )?;
            if let Some(handler) = &ast.handler {
                self.store.insert_request(
                    req.user_id,
                    &req.conversation_id,
                    "NEW",
                    0,
                    Some(req.id),
                    Some(&serde_json::to_string(handler)?),
                    None,
                    priority,
                    None,
                )?;
                self.store.create_response(
                    req.id,
                    &req.conversation_id,
                    req.user_id,
                    &serde_json::to_string(&json!({"status":"pause","paused":paused}))?,
                )?;
                return self.complete_request(req.id, "WAITING");
            }
            self.store.create_response(
                req.id,
                &req.conversation_id,
                req.user_id,
                &serde_json::to_string(&json!({"status":"pause","paused":paused}))?,
            )?;
            return self.complete_request(req.id, "COMPLETED");
        }

        let cancelled = self.store.update_many_new_to_status_by_priority(
            &req.conversation_id,
            threshold,
            "FAILED",
        )?;

        if let Some(handler) = &ast.handler {
            let mut notify = req.notify_id;
            if let Some(resume) = &ast.resume {
                let resume_id = self.store.insert_request(
                    req.user_id,
                    &req.conversation_id,
                    "NEW",
                    1,
                    req.notify_id,
                    Some(&serde_json::to_string(resume)?),
                    None,
                    0,
                    None,
                )?;
                notify = Some(resume_id);
            }

            self.store.insert_request(
                req.user_id,
                &req.conversation_id,
                "NEW",
                0,
                notify,
                Some(&serde_json::to_string(handler)?),
                None,
                priority,
                None,
            )?;
        }

        self.store.create_response(
            req.id,
            &req.conversation_id,
            req.user_id,
            &serde_json::to_string(&json!({"status":"stop","cancelled":cancelled}))?,
        )?;
        self.complete_request(req.id, "COMPLETED")
    }

    fn complete_request(&self, request_id: i64, status: &str) -> anyhow::Result<()> {
        self.store.set_request_status_locked(request_id, status, None)?;

        if status != "COMPLETED" {
            return Ok(());
        }

        let Some(req) = self.store.fetch_request(request_id)? else {
            return Ok(());
        };

        let Some(notify_id) = req.notify_id else {
            return Ok(());
        };

        let last_content = self.store.last_response_content(request_id)?;

        let merged_input = if let Some(content) = last_content {
            let patch = parse_response_patch(&content);
            let merged_state = self
                .store
                .merge_conversation_state(&req.conversation_id, &patch)?;
            Some(serde_json::to_string(&merged_state)?)
        } else {
            None
        };

        self.store
            .decrement_dependency_and_set_context(notify_id, merged_input.as_deref())?;
        Ok(())
    }

    fn resolve_scheduled_at(&self, raw: Option<&Value>) -> Option<i64> {
        let raw = raw?.as_str()?.trim().to_lowercase();
        if raw.is_empty() {
            return None;
        }

        if let Some(rest) = raw.strip_prefix("in ") {
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(amount) = parts[0].parse::<f64>() {
                    let unit = parts[1].trim_end_matches('s');
                    let mult = match unit {
                        "second" => 1_000.0,
                        "minute" => 60_000.0,
                        "hour" => 3_600_000.0,
                        "day" => 86_400_000.0,
                        "week" => 604_800_000.0,
                        _ => 0.0,
                    };
                    if mult > 0.0 {
                        return Some(SqliteStore::now_ms() + (amount * mult) as i64);
                    }
                }
            }
        }

        None
    }
}

fn parse_context(raw: Option<&str>) -> Value {
    raw.and_then(|x| serde_json::from_str::<Value>(x).ok())
        .unwrap_or_else(|| Value::Object(Default::default()))
}

fn parse_response_patch(content: &str) -> Value {
    match serde_json::from_str::<Value>(content) {
        Ok(Value::Object(map)) => Value::Object(map),
        Ok(other) => json!({"output": other}),
        Err(_) => json!({"output": content}),
    }
}

fn to_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => serde_json::to_string(other).unwrap_or_else(|_| String::new()),
    }
}
