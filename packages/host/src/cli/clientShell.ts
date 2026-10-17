import readline from 'node:readline';
import {
  promptGroupChatAction,
  promptGroupChatIntermission,
  type ChatChoice,
  type ChatParticipant,
  type ChatVerbDefinition,
  type ChatToolDefinition,
  type ChatActionCommand,
  type GroupChatContext,
} from './groupChatPrompt.js';

export interface ClientShellConfig<TState = any, TAction = any> {
  actorName?: string;
  defaultSpeechAct?: string;
  helpHeader?: string;
  getState?: () => TState | null;
  onSpeech?: (text: string, speechAct: string, targetId?: string) => Promise<{ aiReply?: string } | void>;
  onToolCall?: (toolName: string, args: Record<string, any>) => Promise<any>;
  onCommand?: (command: string, args: string) => Promise<boolean | void>;
  redrawView?: () => void;
  logTurn?: (msg: string) => Promise<void>;
  participants?: ChatParticipant[];
  availableTools?: (string | ChatToolDefinition)[];
  availableVerbs?: ChatVerbDefinition[];
  actionCommands?: ChatActionCommand<TAction>[];
}

/**
 * Universal Interactive Client Shell for Curator tabletop games and MiniApps.
 * Manages tiered command dispatching (Core Curator commands, Host mesh verbs,
 * and Domain-specific action commands) within an interactive REPL loop.
 */
export class ClientShell<TState = any, TAction = any> {
  private config: ClientShellConfig<TState, TAction>;
  private verbs: ChatVerbDefinition[];
  private tools: (string | ChatToolDefinition)[];
  private actions: ChatActionCommand<TAction>[];

  constructor(config: ClientShellConfig<TState, TAction> = {}) {
    this.config = config;
    this.verbs = [...(config.availableVerbs || [])];
    this.tools = [...(config.availableTools || [])];
    this.actions = [...(config.actionCommands || [])];
  }

  /**
   * Registers a non-consuming slash command verb (e.g. /standings, /whisper).
   */
  registerVerb(verb: ChatVerbDefinition): this {
    this.verbs.push(verb);
    return this;
  }

  /**
   * Registers a turn-consuming parameterized gameplay action (e.g. raise <amt>, call, fold).
   */
  registerAction(action: ChatActionCommand<TAction>): this {
    this.actions.push(action);
    return this;
  }

  /**
   * Registers a tool callable via /tool <name> [jsonArgs].
   */
  registerTool(tool: string | ChatToolDefinition): this {
    this.tools.push(tool);
    return this;
  }

  /**
   * Sets or updates the state getter provider.
   */
  setStateProvider(getter: () => TState | null): this {
    this.config.getState = getter;
    return this;
  }

  /**
   * Builds the composite GroupChatContext for the prompt runner.
   */
  buildContext(overrides?: Partial<GroupChatContext>): GroupChatContext {
    return {
      actorName: this.config.actorName,
      defaultSpeechAct: this.config.defaultSpeechAct,
      helpHeader: this.config.helpHeader,
      participants: this.config.participants || [],
      getState: this.config.getState,
      availableVerbs: this.verbs,
      availableTools: this.tools,
      actionCommands: this.actions,
      onSpeech: this.config.onSpeech || (async () => {}),
      onToolCall: this.config.onToolCall,
      onCommand: this.config.onCommand,
      redrawView: this.config.redrawView,
      logTurn: this.config.logTurn,
      ...overrides,
    };
  }

  /**
   * Prompts the human player for a turn action using the tiered command shell.
   */
  async promptAction(
    rl: readline.Interface,
    choices: ChatChoice<TAction>[],
    contextOverrides?: Partial<GroupChatContext>
  ): Promise<TAction> {
    const ctx = this.buildContext(contextOverrides);
    return promptGroupChatAction<TAction>(rl, choices, ctx);
  }

  /**
   * Prompts between rounds / intermission allowing chat and commands until ENTER.
   */
  async promptIntermission(
    rl: readline.Interface,
    contextOverrides?: Partial<GroupChatContext>,
    hint?: string
  ): Promise<'CONTINUE' | 'QUIT'> {
    const ctx = this.buildContext(contextOverrides);
    return promptGroupChatIntermission(rl, ctx, hint);
  }
}

/**
 * Factory for creating a ClientShell instance.
 */
export function createClientShell<TState = any, TAction = any>(
  config: ClientShellConfig<TState, TAction> = {}
): ClientShell<TState, TAction> {
  return new ClientShell<TState, TAction>(config);
}
