import type { CuratorPluginDefinition } from '../../../../curator/dist/src/index.js';

export const ASSISTANT_AGENT = 'web_assistant';
/** The agent's role; remote blueprint tools are granted to it (ToolRole) when synced. */
export const ASSISTANT_ROLE = 'web_assistant';

const INSTRUCTION = [
  'You are the Curator blueprint assistant, chatting with the user in a terminal.',
  'You can read public web pages with the web_scrape tool of the blueprint server.',
  'When the user mentions a URL or asks about a page, fetch it before answering and cite the page title.',
  'Answer concisely in plain text; summarize long pages instead of repeating them.',
  'If a tool reports that sign-in is required, tell the user to run /auth login google.',
].join(' ');

/** Harness agent: Gemini with the blueprint server's remote tools (`mcp.blueprint.*`). */
export function assistantPlugin(options: { model?: string } = {}): CuratorPluginDefinition {
  return {
    name: 'blueprint-assistant',
    version: '1.0.0',
    description: 'Blueprint harness: a Gemini agent using tools from remote MCP providers',
    roles: [{ name: ASSISTANT_ROLE, description: 'Runs the remote tools of the blueprint server' }] as any,
    agents: {
      [ASSISTANT_AGENT]: {
        description: 'Chat assistant with remote web reading (blueprint server)',
        enabled: true,
        roles: [ASSISTANT_ROLE],
        ast: {
          type: 'Curator_Agent',
          agentName: ASSISTANT_AGENT,
          provider: 'gemini',
          ...(options.model ? { model: options.model } : {}),
          instruction: INSTRUCTION,
          prompt: '{context.message}',
          tools: ['mcp.blueprint.*'],
        },
      } as any,
    },
  };
}
