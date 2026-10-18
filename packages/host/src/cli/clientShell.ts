import readline from 'node:readline';
import { Command } from 'commander';

/**
 * Universal Curator Tool-Centric Action.
 * Encapsulates a tool invocation with its target tool and action arguments.
 */
export interface ToolAction<TArgs = any> {
  tool?: string;
  type?: string;
  args?: TArgs;
  amount?: number;
  [key: string]: any;
}

export type CommandOutcome<TAction = ToolAction> =
  | { type: 'ACTION'; value: TAction }
  | { type: 'HANDLED'; message?: string }
  | void
  | null;

/**
 * Unified Shell Command & Turn Choice Specification.
 */
export interface ShellCommand<TAction = any> {
  name?: string;
  id?: string;
  label?: string;
  value?: TAction;
  aliases?: string[];
  syntax?: string;
  usage?: string;
  description?: string;
  parse?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => TAction | Promise<TAction> | null | undefined;
  execute?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => Promise<CommandOutcome<TAction>> | CommandOutcome<TAction>;
}

export interface ChatToolDefinition {
  name: string;
  description?: string;
  execute?: (args: any) => Promise<any>;
}

export interface ClientShellConfig<TState = any, TAction = ToolAction> {
  actorName?: string;
  conversationId?: string;
  program?: Command;
  commands?: ShellCommand<TAction>[];
  availableTools?: (string | ChatToolDefinition)[];
  getState?: () => TState | null;
  onSpeech?: (text: string) => Promise<any>;
  onToolCall?: (toolName: string, args: Record<string, any>, ctx?: ClientShellConfig) => Promise<any>;
  redrawView?: () => void;
}

export type ShellContext<TAction = any> = ClientShellConfig<any, TAction>;

function queryUser(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

/**
 * Universal Interactive Client Shell for Curator tabletop games and MiniApps.
 * Powered by Commander (`program`) for command routing, argument parsing, and help,
 * with pure event dispatch over a CuratorChannel.
 */
export class ClientShell<TState = any, TAction = ToolAction> {
  public program: Command;
  private config: ClientShellConfig<TState, TAction>;
  private commands: ShellCommand<TAction>[] = [];
  private tools: (string | ChatToolDefinition)[] = [];
  private lastAction?: TAction;
  private shouldQuit = false;

  constructor(config: ClientShellConfig<TState, TAction> = {}) {
    this.config = config;
    this.tools = [...(config.availableTools || [])];

    this.program = (config.program || new Command())
      .name('/')
      .exitOverride()
      .configureOutput({
        writeOut: (str) => console.log(str),
        writeErr: (str) => console.error(`\x1b[31m${str}\x1b[0m`),
      });

    // Core inspection & controls
    this.program
      .command('state')
      .description('Inspect current runtime state')
      .action(() => {
        const state = this.config.getState?.();
        console.log('\x1b[36m[STATE]\x1b[0m', typeof state === 'string' ? state : JSON.stringify(state, null, 2));
      });

    this.program
      .command('quit')
      .alias('exit')
      .alias('q')
      .description('Exit session')
      .action(() => {
        this.shouldQuit = true;
      });

    this.program
      .command('tool <name> [jsonArgs...]')
      .alias('invoke')
      .description('Invoke tool')
      .action(async (toolName: string, jsonTokens: string[] = []) => {
        const rawArgs = jsonTokens.join(' ').trim();
        let parsedArgs: Record<string, any> = {};
        if (rawArgs) {
          try {
            parsedArgs = JSON.parse(rawArgs);
          } catch (e: any) {
            console.log(`\x1b[31mInvalid JSON arguments for tool "${toolName}": ${e.message}\x1b[0m`);
            return;
          }
        }
        try {
          const toolDef = this.tools.find(
            (t) => typeof t !== 'string' && t.name === toolName
          ) as ChatToolDefinition | undefined;
          let result: any;
          if (this.config.onToolCall) {
            result = await this.config.onToolCall(toolName, parsedArgs, this.config);
          } else if (toolDef?.execute) {
            result = await toolDef.execute(parsedArgs);
          }
          console.log(`\x1b[32m[TOOL RESULT] ${toolName}:\x1b[0m`, typeof result === 'string' ? result : JSON.stringify(result, null, 2));
        } catch (err: any) {
          console.log(`\x1b[31m[TOOL ERROR] ${toolName}: ${err.message}\x1b[0m`);
        }
      });

    if (config.commands) {
      for (const cmd of config.commands) {
        this.registerCommand(cmd);
      }
    }
  }

  registerCommand(cmd: ShellCommand<TAction>): this {
    this.commands.push(cmd);
    const key = cmd.name || cmd.id;
    if (!key) return this;

    const sub = this.program
      .command(cmd.usage ? `${key} ${cmd.usage}` : `${key} [args...]`)
      .description(cmd.description || '')
      .allowExcessArguments(true)
      .allowUnknownOption(true);

    if (cmd.aliases) {
      for (const a of cmd.aliases) sub.alias(a);
    }

    sub.action(async (...actionArgs: any[]) => {
      const passedArgs = actionArgs.slice(0, -1).flat().map(String);
      const rest = passedArgs.join(' ');
      if (cmd.parse) {
        const parsed = await cmd.parse(rest, passedArgs, this.config);
        if (parsed !== null && parsed !== undefined) {
          this.lastAction = parsed;
          return;
        }
      }
      if (cmd.execute) {
        const outcome = await cmd.execute(rest, passedArgs, this.config);
        if (outcome && typeof outcome === 'object' && outcome.type === 'ACTION') {
          this.lastAction = outcome.value;
        }
      }
    });

    return this;
  }

  registerAction(action: ShellCommand<TAction>): this {
    return this.registerCommand(action);
  }

  registerTool(tool: string | ChatToolDefinition): this {
    this.tools.push(tool);
    return this;
  }

  setStateProvider(getter: () => TState | null): this {
    this.config.getState = getter;
    return this;
  }

  buildContext(): ClientShellConfig<TState, TAction> {
    return {
      ...this.config,
      commands: this.commands,
      availableTools: this.tools,
    };
  }

  async runCommand(line: string): Promise<boolean> {
    const isSlash = line.startsWith('/');
    const tokens = (isSlash ? line.slice(1) : line).split(/\s+/).filter(Boolean);
    const cmd = tokens[0]?.toLowerCase() || '';
    if (!cmd) return false;

    if (cmd === 'help' || cmd === '?') {
      this.program.outputHelp();
      return true;
    }

    if (cmd === 'quit' || cmd === 'exit' || cmd === 'q') {
      this.shouldQuit = true;
      return true;
    }

    const isMatch =
      isSlash ||
      ['state', 'tool', 'invoke'].includes(cmd) ||
      this.program.commands.some((c) => c.name() === cmd || c.aliases().includes(cmd));

    if (isMatch) {
      try {
        await this.program.parseAsync(tokens, { from: 'user' });
      } catch (err: any) {
        if (err.code !== 'commander.helpDisplayed') {
          console.error(`\x1b[31m${err.message || err}\x1b[0m`);
        }
      }
      return true;
    }

    return false;
  }

  async handleAmbientInput(
    rawInput: string,
    _contextOverrides?: any,
    _rl?: readline.Interface
  ): Promise<void> {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    if (await this.runCommand(trimmed)) {
      return;
    }

    if (this.config.onSpeech) {
      await this.config.onSpeech(trimmed);
    }
  }

  async promptAction(
    rl: readline.Interface,
    choices: ShellCommand<TAction>[],
    _contextOverrides?: any
  ): Promise<TAction> {
    const actor = this.config.actorName || 'You';
    const choiceList = choices
      .map((c, i) => `\x1b[1m[${i + 1}]\x1b[0m ${c.label || c.description || c.name || 'Choice'}`)
      .join('   ');

    while (true) {
      if (this.config.redrawView) this.config.redrawView();
      console.log(`\n\x1b[36mChoices:\x1b[0m ${choiceList}`);
      console.log(`\x1b[90m(Enter 1-${choices.length} to act, type to talk, /help for commands)\x1b[0m`);

      const rawInput = await queryUser(rl, `\x1b[1m\x1b[32m${actor} > \x1b[0m`);
      const trimmed = rawInput.trim();
      if (!trimmed) continue;

      // 1. Number index
      const choiceNum = parseInt(trimmed, 10);
      if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= choices.length) {
        const selected = choices[choiceNum - 1];
        if (selected.execute) {
          const outcome = await selected.execute('', [], this.config);
          if (outcome && typeof outcome === 'object' && outcome.type === 'ACTION') {
            return outcome.value;
          }
        }
        return selected.value;
      }

      // 2. Named choice or choice parser
      const isSlash = trimmed.startsWith('/');
      const clean = isSlash ? trimmed.slice(1) : trimmed;
      const tokens = clean.split(/\s+/);
      const first = tokens[0]?.toLowerCase() || '';
      const rest = tokens.slice(1).join(' ');

      const matchedChoice = choices.find((c) => {
        const k = (c.id || c.name || '').toLowerCase();
        const l = (c.label || c.description || '').toLowerCase();
        if (k === first || l === first) return true;
        if (c.aliases?.some((a) => a.toLowerCase() === first)) return true;
        if (!isSlash && l && (l.startsWith(trimmed.toLowerCase()) || trimmed.toLowerCase().startsWith(l))) return true;
        return false;
      });

      if (matchedChoice) {
        if (matchedChoice.parse) {
          const parsed = await matchedChoice.parse(rest, tokens.slice(1), this.config);
          if (parsed !== null && parsed !== undefined) {
            return parsed;
          }
        }
        if (matchedChoice.execute) {
          const outcome = await matchedChoice.execute(rest, tokens.slice(1), this.config);
          if (outcome && typeof outcome === 'object' && outcome.type === 'ACTION') {
            return outcome.value;
          }
        }
        return matchedChoice.value;
      }

      // 3. Program command
      this.lastAction = undefined;
      if (await this.runCommand(trimmed)) {
        if (this.lastAction !== undefined) {
          return this.lastAction;
        }
        continue;
      }

      // 4. Ambient speech
      if (this.config.onSpeech) {
        await this.config.onSpeech(trimmed);
      }
    }
  }

  async promptIntermission(
    rl: readline.Interface,
    hintOrOverrides?: string | any,
    maybeHint?: string
  ): Promise<'CONTINUE' | 'QUIT'> {
    const actor = this.config.actorName || 'You';
    const defaultHint =
      typeof hintOrOverrides === 'string'
        ? hintOrOverrides
        : maybeHint || 'Press ENTER for next round, type to send message, or /help for commands';

    while (true) {
      console.log(`\n\x1b[90m(${defaultHint})\x1b[0m`);
      const rawInput = await queryUser(rl, `\x1b[1m\x1b[32m${actor} > \x1b[0m`);
      const trimmed = rawInput.trim();
      const lower = trimmed.toLowerCase();

      if (!trimmed || ['resume', 'continue', 'c', 'r'].includes(lower)) {
        return 'CONTINUE';
      }
      if (['quit', 'exit', 'q'].includes(lower)) {
        return 'QUIT';
      }

      this.shouldQuit = false;
      if (await this.runCommand(trimmed)) {
        if (this.shouldQuit) return 'QUIT';
        continue;
      }

      if (this.config.onSpeech) {
        await this.config.onSpeech(trimmed);
      }
    }
  }
}

export function createClientShell<TState = any, TAction = ToolAction>(
  config: ClientShellConfig<TState, TAction> = {}
): ClientShell<TState, TAction> {
  return new ClientShell<TState, TAction>(config);
}

export async function promptAction<T = any>(
  rl: readline.Interface,
  choices: ShellCommand<T>[],
  ctx?: ClientShellConfig<any, T>,
  _overrides?: any
): Promise<T> {
  const shell = new ClientShell<any, T>(ctx || {});
  return shell.promptAction(rl, choices);
}

export async function promptIntermission(
  rl: readline.Interface,
  ctxOrHint?: ClientShellConfig | string,
  hint?: string
): Promise<'CONTINUE' | 'QUIT'> {
  const config = typeof ctxOrHint === 'object' && ctxOrHint !== null ? ctxOrHint : {};
  const hintText = typeof ctxOrHint === 'string' ? ctxOrHint : hint;
  const shell = new ClientShell(config);
  return shell.promptIntermission(rl, hintText);
}
