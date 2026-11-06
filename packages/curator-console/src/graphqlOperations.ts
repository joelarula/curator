/**
 * Dedicated GraphQL Operations for Curator Harness and Dev Console.
 * Decouples GraphQL query/mutation documents from Vue component templates.
 */

export const GET_AGENTS_QUERY = /* GraphQL */ `
  query GetAgents {
    agents {
      name
      description
      schedule
      enabled
    }
  }
`;

export const GET_TOOLS_QUERY = /* GraphQL */ `
  query GetTools {
    tools {
      name
      description
      accessLevel
      parameters
    }
  }
`;

export const GET_CURATOR_REQUESTS_QUERY = /* GraphQL */ `
  query GetCuratorRequests($limit: Int) {
    curatorRequests(limit: $limit) {
      id
      agentName
      toolName
      status
      createdAt
      ast
      context
      responses {
        content
      }
    }
  }
`;

export const GET_CURATOR_REQUEST_BY_ID_QUERY = /* GraphQL */ `
  query GetCuratorRequestById($id: ID!) {
    curatorRequest(id: $id) {
      id
      status
      ast
      responses {
        content
      }
    }
  }
`;

export const GET_DATABASE_HEALTH_QUERY = /* GraphQL */ `
  query GetDatabaseHealth {
    curatorDatabaseHealth {
      storageEngine
      isOpfs
      tables {
        name
        rowCount
      }
      requestsTotal
      requestsCompleted
      requestsFailed
      requestsPending
    }
  }
`;

export const TRIGGER_AGENT_MUTATION = /* GraphQL */ `
  mutation TriggerAgent($name: String!, $context: JSON) {
    triggerAgent(name: $name, context: $context) {
      success
      requestId
      agent
      status
      error
    }
  }
`;

export const EXECUTE_TOOL_MUTATION = /* GraphQL */ `
  mutation ExecTool($name: String!, $args: JSON) {
    executeTool(name: $name, args: $args) {
      success
      tool
      result
      error
    }
  }
`;

export const COMPILE_COFFEESCRIPT_MUTATION = /* GraphQL */ `
  mutation CompileCoffee($code: String!) {
    compileCoffeeScript(code: $code) {
      success
      ast
      error
    }
  }
`;

export const BROADCAST_EVENT_MUTATION = /* GraphQL */ `
  mutation BroadcastEvent($type: String!, $payload: JSON) {
    broadcastEvent(type: $type, payload: $payload)
  }
`;

export const TOGGLE_ENGINE_PAUSE_MUTATION = /* GraphQL */ `
  mutation ToggleEnginePause {
    toggleEnginePause
  }
`;

export const PRESET_GRAPHQL_QUERIES: Record<string, string> = {
  metrics: /* GraphQL */ `query GetOverview {
  metrics {
    totalRequests
    completedRequests
    failedRequests
    totalAgents
    activeAgents
    totalTools
    databaseEngine
  }
  curatorDatabaseHealth {
    requestsTotal
    requestsCompleted
    requestsPending
    storageEngine
  }
}`,
  tools_agents: /* GraphQL */ `query ListToolsAndAgents {
  tools {
    name
    description
    accessLevel
  }
  agents {
    name
    description
    schedule
    enabled
  }
}`,
  requests: /* GraphQL */ `query GetCuratorRequests {
  curatorRequests(limit: 5) {
    id
    agentName
    status
    retryCount
    ast
    responses {
      id
      content
      createdAt
    }
  }
}`,
  exec_tool: /* GraphQL */ `mutation RunTool {
  executeTool(name: "calculate_metric", args: "{\\"baseValue\\": 50, \\"multiplier\\": 4}") {
    success
    tool
    result
    error
  }
}`,
  trigger_agent: /* GraphQL */ `mutation TriggerAgent {
  triggerAgent(name: "web_assistant", context: "{\\"message\\": \\"Hello from GraphQL\\", \\"user\\": \\"graphql\\"}") {
    success
    requestId
    status
    error
  }
}`,
};

