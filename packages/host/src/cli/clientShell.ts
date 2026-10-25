import readline from 'node:readline';
import { Command, CommanderError } from 'commander';
import type {
  CuratorToolDefinition,
  ReplCommand,
  ActiveChoice,
  ClientShellConfig,
  ToolAction,
  CommandOutcome,
  ShellCommand,
  ChatToolDefinition,
  ShellContext,
} from '../types.js';

export {
  type ToolAction,
  type CommandOutcome,
  type ShellCommand,
  type ChatToolDefinition,
  type ClientShellConfig,
  type ShellContext,
  type CuratorToolDefinition,
  type ReplCommand,
  type ActiveChoice,
};

function parseCommandLine(text: string): string[] {
  const matches = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!matches) return [];
  return matches.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}

/**
 * Universal Asynchronous REPL and Interactive Shell for Curator host and games.
 * Powered by Node Commander (`program`), strictly aligned to Curator Core:
 * Whitelisted tools, engine commands, non-blocking dynamic choices, and speech routing.
 */
export class ClientShell<TState = any, TAction = ToolAction> {
  public config: ClientShellConfig<TState, TAction>;
  private commands: ReplCommand[] = [];
  private tools: Map<string, CuratorToolDefinition> = new Map();
  private activeChoices: ActiveChoice[] = [];
  public activePromptContext?: Record<string, any>;
  private isBlockingStep: boolean = false;
  private blockingResolve?: (value: any) => void;
  private rl?: readline.Interface;
  private isRunning: boolean = false;
  private isHandlingLine: boolean = false;

  constructor(config: ClientShellConfig<TState, TAction> = {}) {
    this.config = config;
    const initialCmds = config.commands || [];
    for (const cmd of initialCmds) {
      this.registerCommand(cmd);
    }
    const initialTools = config.tools || config.availableTools || [];
    for (const t of initialTools) {
      this.registerTool(t);
    }
  }

  registerCommand(cmd: ReplCommand | ShellCommand<TAction>): this {
    this.commands.push(cmd);
    return this;
  }

  registerAction(action: ReplCommand | ShellCommand<TAction>): this {
    return this.registerCommand(action);
  }

  registerTool(tool: string | CuratorToolDefinition): this {
    if (typeof tool === 'string') {
      this.tools.set(tool, { name: tool, description: `Curator tool: ${tool}` });
    } else {
      this.tools.set(tool.name, tool);
    }
    return this;
  }

  setStateProvider(getter: () => TState | null): this {
    this.config.getState = getter;
    return this;
  }

  setChoices(
    choices: (ActiveChoice | any)[],
    options: {
      blocking?: boolean;
      hint?: string;
      as?: string;
      requestId?: any;
      conversationId?: any;
      prompt?: string;
      event?: string;
    } = {}
  ): this {
    this.activePromptContext = options;
    this.activeChoices = choices.map((c: any, i: number) => {
      const act = c.action || (c.type ? c : undefined);
      const actType = act?.type || c.type;
      const rawName = (c.id || actType || c.label || String(i + 1)).toLowerCase();

      // Auto-derive standard aliases if not explicitly provided
      const aliases = c.aliases ? [...c.aliases] : [];
      if (aliases.length === 0 && actType) {
        const atLower = String(actType).toLowerCase();
        if (atLower === 'check') aliases.push('k');
        else if (atLower === 'call') aliases.push('c');
        else if (atLower === 'fold') aliases.push('f');
        else if (atLower === 'bet') aliases.push('b');
        else if (atLower === 'raise') aliases.push('r');
        else if (atLower === 'all_in' || atLower === 'allin') aliases.push('allin', 'all-in', 'shove');
      } else if (aliases.length === 0 && c.id) {
        const idLower = String(c.id).toLowerCase();
        if (idLower === 'new') aliases.push('n');
        else if (idLower === 'resume') aliases.push('r', 'continue');
        else if (idLower === 'exit') aliases.push('q', 'quit');
      }

      const defaultAmount = act?.amount ?? c.amount;
      const label = c.label || (actType ? `${actType}${defaultAmount ? ` $${defaultAmount}` : ''}` : `Choice ${i + 1}`);
      const usage = c.usage || ((actType === 'RAISE' || actType === 'BET') ? '<amount>' : undefined);

      const event = c.event || (typeof c.value === 'object' ? c.value?.event : undefined);
      const payload = c.payload !== undefined ? c.payload : (typeof c.value === 'object' ? c.value?.payload : undefined);
      const tool = c.tool || (typeof c.value === 'object' ? c.value?.tool : undefined);
      let args = c.args || (typeof c.value === 'object' ? c.value?.args : undefined);
      if (tool && !args && act) {
        args = { action: act };
      }

      return {
        id: c.id || rawName,
        label,
        tool,
        args,
        action: act,
        amount: defaultAmount,
        value: c.value !== undefined ? c.value : (act || c),
        event,
        payload,
        aliases,
        usage,
        parse: c.parse,
        execute: c.execute,
      };
    });
    this.isBlockingStep = Boolean(options.blocking);
    this.printChoices();

    if (this.rl && this.isRunning && !this.isHandlingLine) {
      this.rl.prompt();
    }
    return this;
  }

  public printChoices(): void {
    if (this.activeChoices.length > 0) {
      const choiceList = this.activeChoices
        .map((c, i) => {
          const alias = c.aliases?.[0] ? ` \x1b[90m(/${c.aliases[0]})\x1b[0m` : '';
          return `\x1b[1m[${i + 1}]\x1b[0m ${c.label}${alias}`;
        })
        .join('   ');
      console.log(`\n\x1b[36mChoices:\x1b[0m ${choiceList}`);
      if (this.isBlockingStep) {
        console.log(`\x1b[33m(Mandatory: Please select 1-${this.activeChoices.length} to proceed)\x1b[0m`);
      } else {
        console.log(`\x1b[90m(Enter 1-${this.activeChoices.length} to act, type to talk, /help for commands)\x1b[0m`);
      }
    } else {
      console.log('\x1b[90mNo active turn choices currently awaiting action.\x1b[0m');
    }
  }

  clearChoices(): this {
    this.activeChoices = [];
    this.isBlockingStep = false;
    this.blockingResolve = undefined;
    return this;
  }

  buildContext(): ClientShellConfig<TState, TAction> & { activePrompt?: Record<string, any>; activeChoices?: ActiveChoice[] } {
    return {
      ...this.config,
      commands: this.commands,
      tools: [...this.tools.values()],
      availableTools: [...this.tools.values()],
      activePrompt: this.activePromptContext,
      activeChoices: this.activeChoices,
    };
  }

  /**
   * Instantiates and configures the Commander Command program for the REPL.
   */
  public buildProgram(onResult?: (res: any) => void): Command {
    const program = new Command();
    program.name(this.config.actorName || 'curator');
    program.description('Curator Client REPL');
    program.exitOverride();
    program.configureOutput({
      writeOut: (str) => console.log(str.trimEnd()),
      writeErr: () => {},
    });

    const registeredNames = new Set<string>();
    const markRegistered = (name: string) => {
      registeredNames.add(name.toLowerCase());
    };

    // Core built-in commands
    ['help', 'choices', 'actions', 'menu', 'state', 'status', 'tools', 'exec', 'exit', 'quit', 'q'].forEach(markRegistered);

    // 1. Built-in 'help' command
    program
      .command('help')
      .description('Show available commands and whitelisted tools')
      .action(() => {
        console.log('\n\x1b[1m\x1b[36m=== Curator REPL Commands & Whitelisted Tools ===\x1b[0m');
        if (this.activeChoices.length > 0) {
          console.log('\x1b[33mActive Turn Choices (Subshell Commands):\x1b[0m');
          this.activeChoices.forEach((c, idx) => {
            const rawName = (c.id || c.label).trim().split(/\s+/)[0].toLowerCase();
            const usage = c.usage ? ` ${c.usage}` : (rawName === 'raise' || rawName === 'bet' ? ' [amount]' : '');
            const aliases = c.aliases?.length ? ` (${c.aliases.join(', ')})` : '';
            console.log(`  [${idx + 1}] ${c.id || c.label}${usage}${aliases} - ${c.label}`);
          });
        }
        console.log('\x1b[33mCore Curator Commands:\x1b[0m');
        console.log('  help - Show available commands and whitelisted tools');
        console.log('  choices (actions, menu) - Redisplay active turn choices and commands');
        console.log('  state - Inspect current application/game state');
        console.log('  status - View active session, table, and connection status');
        console.log('  tools - List all registered and permitted tools');
        console.log('  exec <toolName> [args] - Execute a whitelisted tool directly with JSON args');
        console.log('  exit (quit, q) - Exit client REPL session');

        if (this.commands.length > 0) {
          console.log('\x1b[33mGame Commands:\x1b[0m');
          for (const cmd of this.commands) {
            const usage = cmd.usage ? ` ${cmd.usage}` : '';
            const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
            console.log(`  ${cmd.name}${usage}${aliases} - ${cmd.description || ''}`);
          }
        }
        console.log('\x1b[33mTools:\x1b[0m');
        for (const [name, tool] of this.tools.entries()) {
          const usage = tool.usage ? ` ${tool.usage}` : '';
          const aliases = tool.aliases?.length ? ` (${tool.aliases.join(', ')})` : '';
          console.log(`  ${name}${usage}${aliases} - ${tool.description || ''}`);
        }
        if (this.config.defaultToolName) {
          console.log(
            `\x1b[90m(Free text is automatically routed to speech tool: ${this.config.defaultToolName})\x1b[0m\n`
          );
        }
      });

    // 2. Built-in 'choices' command
    program
      .command('choices')
      .alias('actions')
      .alias('menu')
      .description('Redisplay currently active turn choices and subshell commands')
      .action(() => {
        this.printChoices();
      });

    // 3. Built-in 'state' command
    program
      .command('state')
      .description('Inspect current application state')
      .action(() => {
        const state = this.config.getState?.();
        if (state !== undefined) {
          console.log('\x1b[36m[STATE]\x1b[0m', typeof state === 'string' ? state : JSON.stringify(state, null, 2));
        } else {
          console.log('\x1b[90mNo active state available.\x1b[0m');
        }
      });

    // 3. Built-in 'status' command
    program
      .command('status')
      .description('Inspect current session, table, and connection status')
      .action(async () => {
        const state: any = this.config.getState?.();
        const info: Record<string, any> = {
          actor: this.config.actorName || 'You',
        };

        if (this.config.getWallet) {
          try {
            const w = await this.config.getWallet();
            if (w !== undefined && w !== null) {
              info.wallet = typeof w === 'number' ? `$${w.toLocaleString()}` : String(w);
            }
          } catch (_) {}
        } else if (this.config.channel && typeof (this.config.channel as any).runTool === 'function') {
          try {
            const bankroll = await (this.config.channel as any).runTool('poker_get_bankroll', {
              playerName: this.config.actorName || 'You',
            });
            if (bankroll?.balance !== undefined) {
              info.wallet = `$${Number(bankroll.balance).toLocaleString()}`;
            }
          } catch (_) {}
        }

        if (state) {
          const me = state.players?.find(
            (p: any) => p.name === (this.config.actorName || 'You') || p.id === (this.config.actorName || 'You')
          );
          if (!info.wallet && me?.wallet !== undefined) {
            info.wallet = `$${Number(me.wallet).toLocaleString()}`;
          }
          if (me?.chips !== undefined) info.tableChips = `$${Number(me.chips).toLocaleString()}`;
          if (state.pot !== undefined) info.pot = `$${state.pot}`;
          if (state.currentStreet) info.street = state.currentStreet;
          if (state.handNumber) info.hand = state.handNumber;
          if (state.players) info.players = state.players.length;
        }

        info.tableId = this.config.channel?.tableId || (state as any)?.tableId || '1';
        info.connected = Boolean(this.config.channel);
        info.activeChoices = this.activeChoices.length;

        console.log('\x1b[36m[STATUS]\x1b[0m', JSON.stringify(info, null, 2));
      });

    // 4. Built-in 'tools' command
    program
      .command('tools')
      .description('List available and whitelisted tools')
      .action(() => {
        console.log('\n\x1b[1m\x1b[36m=== Whitelisted Curator Tools ===\x1b[0m');
        for (const [name, tool] of this.tools.entries()) {
          const usage = tool.usage ? ` ${tool.usage}` : '';
          const aliases = tool.aliases?.length ? ` (${tool.aliases.join(', ')})` : '';
          console.log(`  \x1b[32m${name}${usage}\x1b[0m${aliases} - ${tool.description || ''}`);
        }
        console.log('');
      });

    // 5. Built-in 'exec' command
    program
      .command('exec <toolName> [args...]')
      .description('Execute a whitelisted Curator tool directly')
      .action(async (toolName: string, strArgs: string[]) => {
        const rawArg = strArgs.join(' ').trim();
        let parsedArgs: Record<string, any> = {};
        if (rawArg) {
          try {
            parsedArgs = JSON.parse(rawArg);
          } catch {
            try {
              const fixed = rawArg.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
              parsedArgs = JSON.parse(fixed);
            } catch {
              parsedArgs = { input: rawArg };
            }
          }
        }
        console.log(`\x1b[36m[Exec]\x1b[0m Executing tool "${toolName}"...`);
        try {
          const result = await this.dispatchTool(toolName, parsedArgs);
          if (result !== undefined) {
            console.log('\x1b[32m[Result]\x1b[0m', typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
          }
        } catch (err: any) {
          console.log(`\x1b[31m[Exec Error]\x1b[0m ${err.message}`);
        }
      });

    // 6. Built-in 'exit' / 'quit' command
    program
      .command('exit')
      .alias('quit')
      .alias('q')
      .description('Exit client REPL')
      .action(async () => {
        console.log('\x1b[33m[REPL] Exiting session...\x1b[0m');
        if (this.config.channel) {
          try {
            await this.config.channel.send('curator:exit');
            await this.config.channel.close();
          } catch (_) {}
        }
        this.stop();
        process.exit(0);
      });

    // 7. Register dynamic active choices as first-class Commander subshell commands
    if (this.activeChoices.length > 0) {
      this.activeChoices.forEach((choice, idx) => {
        const numStr = String(idx + 1);
        const rawName = (choice.id || choice.label).trim().split(/\s+/)[0].toLowerCase();
        const usage = choice.usage
          ? ` ${choice.usage}`
          : (rawName === 'raise' || rawName === 'bet' ? ' [amount]' : ' [args...]');

        // Dynamic action command (e.g. `raise [amount]`, `check`, `call`, `fold`)
        if (!registeredNames.has(rawName)) {
          markRegistered(rawName);
          const c = program.command(`${rawName}${usage}`).description(choice.label);
          if (choice.aliases) {
            for (const a of choice.aliases) {
              const aLower = a.toLowerCase();
              if (!registeredNames.has(aLower)) {
                markRegistered(aLower);
                c.alias(a);
              }
            }
          }
          c.allowUnknownOption(true);
          c.action(async (...args) => {
            const strTokens = args.flatMap((a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : typeof a === 'string' ? [a] : []));
            this.activeChoices = [];
            const res = await this.executeChoice(choice, strTokens);
            onResult?.(res);
          });
        }

        // Numeric shortcut command (e.g. `1`, `2`, `3`)
        if (!registeredNames.has(numStr)) {
          markRegistered(numStr);
          program
            .command(`${numStr} [args...]`)
            .description(`Select [${numStr}]: ${choice.label}`)
            .allowUnknownOption(true)
            .action(async (...args) => {
              const strTokens = args.flatMap((a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : typeof a === 'string' ? [a] : []));
              this.activeChoices = [];
              const res = await this.executeChoice(choice, strTokens);
              onResult?.(res);
            });
        }
      });
    }

    // 8. Register custom REPL commands (skipping any shadowed by active turn choices)
    for (const cmd of this.commands) {
      const cmdName = cmd.name.toLowerCase();
      if (registeredNames.has(cmdName)) continue;
      markRegistered(cmdName);
      const usage = cmd.usage ? ` ${cmd.usage}` : ' [args...]';
      const c = program.command(`${cmd.name}${usage}`).description(cmd.description || '');
      if (cmd.aliases) {
        for (const a of cmd.aliases) {
          const aLower = a.toLowerCase();
          if (!registeredNames.has(aLower)) {
            markRegistered(aLower);
            c.alias(a);
          }
        }
      }
      c.allowUnknownOption(true);
      c.action(async (...args) => {
        const strTokens = args.flatMap((a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : typeof a === 'string' ? [a] : []));
        const joinedArgs = strTokens.join(' ');
        if ((cmd as any).parse) {
          const parsed = await (cmd as any).parse(joinedArgs, strTokens, this.config);
          if (parsed !== null && parsed !== undefined) {
            onResult?.(parsed);
            return;
          }
        }
        if (cmd.execute) {
          const outcome = await cmd.execute(joinedArgs, strTokens, this.config);
          if (outcome && typeof outcome === 'object' && outcome.type === 'ACTION') {
            onResult?.(outcome.value);
            return;
          }
        }
        if ((cmd as any).value !== undefined) {
          onResult?.((cmd as any).value);
        }
      });
    }

    // 9. Register whitelisted tools
    for (const [name, tool] of this.tools.entries()) {
      const toolName = name.toLowerCase();
      if (registeredNames.has(toolName)) continue;
      markRegistered(toolName);
      const usage = tool.usage ? ` ${tool.usage}` : ' [args...]';
      const c = program.command(`${name}${usage}`).description(tool.description || '');
      if (tool.aliases) {
        for (const a of tool.aliases) {
          const aLower = a.toLowerCase();
          if (!registeredNames.has(aLower)) {
            markRegistered(aLower);
            c.alias(a);
          }
        }
      }
      c.allowUnknownOption(true);
      c.action(async (...args) => {
        const res = await this.dispatchTool(name, args);
        onResult?.(res);
      });
    }

    return program;
  }

  /**
   * Dispatches a tool call either via local execution, onToolCall handler, or channel event.
   */
  async dispatchTool(toolName: string, rawArgs: any = {}): Promise<any> {
    const tool = this.tools.get(toolName);
    const args =
      typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
        ? rawArgs
        : { args: rawArgs };

    if (this.config.onToolCall) {
      return await this.config.onToolCall(toolName, args, this.config);
    }

    // Prefer the channel: the host runs the call as a Request (RBAC, approval, Response).
    if (this.config.channel) {
      return await this.config.channel.send('curator:tool_call', {
        tool: toolName,
        args,
        tableId: this.config.channel.tableId,
        conversationId: this.config.conversationId,
      });
    }

    // Host-less fallback (no channel): local client-side tool definition, not recorded as a Request.
    if (tool && (tool.runAsync || tool.execute)) {
      const state = this.config.getState?.();
      if (tool.runAsync) {
        return await tool.runAsync({
          args: { state, ...args },
          toolContext: { state, ...this.config },
        });
      }
      if (tool.execute) {
        return await tool.execute({ state, ...args }, { state, ...this.config });
      }
    }

    throw new Error(`Tool "${toolName}" not found. Available tools: ${[...this.tools.keys()].join(', ')}`);
  }

  /**
   * Spawns an asynchronous parallel request branch for user speech emitting a user:speech event.
   * Does not block the current turn, choices, or game loop.
   */
  async spawnSpeechBranch(text: string): Promise<any> {
    if (this.config.onSpeech) {
      return await this.config.onSpeech(text);
    }

    if (this.config.channel) {
      return await this.config.channel.send('curator:tool_call', {
        tool: 'userSpeech',
        args: { text, speaker: this.config.actorName },
        async: true,
        tableId: this.config.channel.tableId,
        conversationId: this.config.conversationId,
      });
    }

    if (this.config.defaultToolName) {
      return await this.dispatchTool(this.config.defaultToolName, { text, speaker: this.config.actorName });
    }

    return await this.dispatchTool('userSpeech', { text, speaker: this.config.actorName });
  }

  /**
   * Routes free-text input (unmatched by Commander program) to miniapp speech tool / async parallel branch.
   */
  async handleFreeText(text: string): Promise<void> {
    await this.spawnSpeechBranch(text);
  }

  /**
   * Executes a chosen action from activeChoices, supporting parameter passing (e.g. "raise 150").
   */
  async executeChoice(choice: ActiveChoice, choiceTokens: string[] = []): Promise<any> {
    const rawArgs = choiceTokens.join(' ');
    if (choice.parse) {
      const parsed = await choice.parse(rawArgs, choiceTokens, this.config);
      if (parsed !== null && parsed !== undefined) return parsed;
    }

    if (choice.execute) {
      const outcome = await choice.execute(rawArgs, choiceTokens, this.config);
      if (outcome && typeof outcome === 'object' && outcome.type === 'ACTION') {
        return outcome.value;
      }
      if (outcome !== undefined) return outcome;
    }

    // 1. Dispatch tool if specified on choice (Primary Curator Architecture: all commands derive from tools)
    if (choice.tool) {
      const toolArgs = { ...(choice.args || {}) };
      if (choiceTokens.length > 0) {
        const num = parseInt(choiceTokens[0], 10);
        if (!isNaN(num) && num > 0) {
          if (toolArgs.action && typeof toolArgs.action === 'object') {
            toolArgs.action = { ...toolArgs.action, amount: num };
          } else {
            toolArgs.amount = num;
          }
        }
      }
      const res = await this.dispatchTool(choice.tool, toolArgs);
      return choice.value !== undefined ? choice.value : (res !== undefined ? res : choice);
    }

    // 2. Dispatch declarative event (e.g. event: 'poker:lobby_choice', payload: { id: 'new' })
    if (choice.event && this.config.channel) {
      const basePayload = choice.payload !== undefined ? choice.payload : (choice.value !== undefined ? choice.value : choice);
      const payload = typeof basePayload === 'object' && basePayload !== null
        ? {
            conversationId: this.activePromptContext?.conversationId,
            requestId: this.activePromptContext?.requestId,
            as: this.activePromptContext?.as,
            ...basePayload,
          }
        : basePayload;
      await this.config.channel.send(choice.event, payload);
      return payload;
    }

    // 3. Fallback onAction handler (if consumer configured onAction)
    const action = choice.action || (typeof choice.value === 'object' && choice.value?.action ? choice.value.action : undefined);
    if (action) {
      const actionPayload = typeof action === 'object' ? { ...action } : { type: action };
      if (choiceTokens.length > 0) {
        const num = parseInt(choiceTokens[0], 10);
        if (!isNaN(num) && num > 0) {
          actionPayload.amount = num;
        }
      }
      if (this.config.onAction) {
        return await this.config.onAction(actionPayload, choiceTokens, this.buildContext());
      }
    }

    // 4. Dispatch value / channel choice / onChoice
    if (this.config.onChoice) {
      return await this.config.onChoice(choice.value !== undefined ? choice.value : choice, this.buildContext());
    }

    if (choice.value !== undefined) {
      const val = choice.value;
      if (typeof val === 'object' && val !== null && val.tool) {
        await this.dispatchTool(val.tool, val.args || val);
      } else if (this.config.channel) {
        const payload = {
          choice: val,
          conversationId: this.activePromptContext?.conversationId,
          requestId: this.activePromptContext?.requestId,
          as: this.activePromptContext?.as,
        };
        const eventName = this.activePromptContext?.event || 'curator:choice';
        await this.config.channel.send(eventName, payload);
      }
      return val;
    }

    return choice;
  }

  /**
   * Primary asynchronous line processor for the REPL.
   */
  async handleLine(line: string): Promise<any> {
    const trimmed = line.trim();
    if (!trimmed) return;

    // 1. Mandatory/blocking step handling (e.g. asking consent)
    if (this.isBlockingStep && this.blockingResolve) {
      const res = this.blockingResolve;
      this.isBlockingStep = false;
      this.blockingResolve = undefined;
      res(trimmed);
      return;
    }

    // 2. Tokenize command for Commander program
    const isSlash = trimmed.startsWith('/');
    const clean = isSlash ? trimmed.slice(1) : trimmed;
    const tokens = parseCommandLine(clean);
    if (tokens.length === 0) return;

    // 2b. Direct choice selection against active choices (e.g. user typed "1", "2", or alias)
    if (!isSlash && this.activeChoices.length > 0) {
      const numIdx = parseInt(tokens[0], 10);
      if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= this.activeChoices.length) {
        const choice = this.activeChoices[numIdx - 1];
        this.activeChoices = [];
        return await this.executeChoice(choice, tokens.slice(1));
      }

      const targetClean = clean.toLowerCase();
      const matchedChoice = this.activeChoices.find((c) => {
        const id = String(c.id || '').toLowerCase();
        return id === targetClean || c.aliases?.some((a: string) => String(a).toLowerCase() === targetClean);
      });
      if (matchedChoice) {
        this.activeChoices = [];
        return await this.executeChoice(matchedChoice, tokens.slice(1));
      }
    }

    // 3. Parse using Commander program instance (subshell handles choices, commands, and tools)
    try {
      let commandResult: any = undefined;
      const program = this.buildProgram((res) => {
        commandResult = res;
      });
      await program.parseAsync(tokens, { from: 'user' });
      if (commandResult !== undefined) {
        return commandResult;
      }
    } catch (err: any) {
      if (
        err instanceof CommanderError &&
        (err.code === 'commander.unknownCommand' || err.code === 'commander.unknownOption')
      ) {
        // A. Direct numeric index selection against active choices (e.g. user typed "1")
        const numIdx = parseInt(tokens[0], 10);
        if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= this.activeChoices.length) {
          const choice = this.activeChoices[numIdx - 1];
          this.activeChoices = [];
          return await this.executeChoice(choice, tokens.slice(1));
        }

        // B. Match alias against active choices (case-insensitive)
        const targetClean = clean.toLowerCase();
        const matchedChoice = this.activeChoices.find((c) => {
          const id = String(c.id || '').toLowerCase();
          return id === targetClean || c.aliases?.some((a: string) => String(a).toLowerCase() === targetClean);
        });
        if (matchedChoice) {
          this.activeChoices = [];
          return await this.executeChoice(matchedChoice, tokens.slice(1));
        }

        // C. If blocking input step and user provided a numeric amount for choices accepting amounts (e.g. buy-in / raise)
        const isAmountInput = /^\$?\d+([.,]\d+)?$/.test(trimmed);
        const acceptsAmount = this.activeChoices.some((c) => c.amount !== undefined || c.action === 'RAISE' || c.action === 'BET') ||
          this.activePromptContext?.inputType === 'amount';

        if (this.isBlockingStep && isAmountInput && acceptsAmount) {
          const matchedChoice = this.activeChoices.find((c) => c.amount !== undefined || c.action === 'RAISE' || c.action === 'BET');
          const ctx = this.buildContext();
          this.activeChoices = [];
          if (this.config.onChoice) {
            const parsedNum = parseInt(trimmed.replace(/[$,]/g, ''), 10);
            return await this.config.onChoice(
              matchedChoice
                ? { ...matchedChoice, id: 'custom', amount: parsedNum, value: parsedNum, payload: { ...(matchedChoice.payload || {}), id: 'custom', amount: parsedNum } }
                : trimmed,
              ctx
            );
          }
          if (this.config.channel) {
            const parsedNum = parseInt(trimmed.replace(/[$,]/g, ''), 10);
            const payload = { id: 'custom', amount: parsedNum, choice: parsedNum };
            await this.config.channel.send('curator:choice', payload);
            return payload;
          }
        }

        // D. Free text input (unmatched conversational speech) -> spawned as userSpeech parallel branch emitting user:speech
        await this.spawnSpeechBranch(trimmed);
      } else if (
        err instanceof CommanderError &&
        (err.code === 'commander.helpDisplayed' || err.code === 'commander.version')
      ) {
        // Output already handled by Commander
      } else {
        console.error(`\x1b[31m[Command Error] ${err?.message || err}\x1b[0m`);
      }
    }
  }

  /**
   * Starts the continuous asynchronous REPL.
   */
  start(rl?: readline.Interface): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.rl =
      rl ||
      readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

    const promptStr =
      typeof this.config.prompt === 'function'
        ? this.config.prompt()
        : this.config.prompt || `\x1b[1m\x1b[32m${this.config.actorName || 'You'} > \x1b[0m`;

    this.rl.setPrompt(promptStr);
    this.rl.prompt();

    this.rl.on('line', async (line) => {
      this.isHandlingLine = true;
      try {
        await this.handleLine(line);
      } catch (err: any) {
        console.error(`\x1b[31m[REPL Error] ${err?.message || err}\x1b[0m`);
      } finally {
        this.isHandlingLine = false;
      }
      if (this.isRunning && this.rl) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.stop();
    });

    return this;
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
  }

  /**
   * Prompts the user synchronously for testing or mandatory blocking modal workflows.
   */
  async promptAction(
    rl: readline.Interface,
    choices: (ActiveChoice | ShellCommand<TAction>)[]
  ): Promise<TAction> {
    this.setChoices(choices as any);
    const actor = this.config.actorName || 'You';

    return new Promise((resolve) => {
      const ask = () => {
        rl.question(`\x1b[1m\x1b[32m${actor} > \x1b[0m`, async (raw) => {
          const trimmed = raw.trim();
          if (!trimmed) return ask();

          const result = await this.handleLine(trimmed);
          if (result !== undefined && result !== null) {
            this.clearChoices();
            return resolve(result);
          }
          ask();
        });
      };
      ask();
    });
  }
}

export function createClientShell<TState = any, TAction = ToolAction>(
  config: ClientShellConfig<TState, TAction> = {}
): ClientShell<TState, TAction> {
  return new ClientShell<TState, TAction>(config);
}

export const promptAction = <T = any>(
  rl: readline.Interface,
  choices: ShellCommand<T>[],
  ctx?: ClientShellConfig<any, T>
): Promise<T> => new ClientShell<any, T>(ctx || {}).promptAction(rl, choices);

