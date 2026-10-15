import readline from 'node:readline';

export interface ChatParticipant {
  id: string;
  name: string;
  isHuman?: boolean;
  role?: string;
}

export interface ChatChoice<T = any> {
  id: string;
  label: string;
  value: T;
  aliases?: string[];
}

export interface ChatVerbDefinition {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  speechAct?: string;
  directed?: boolean;
  handler?: (
    args: string,
    ctx: GroupChatContext,
    target?: ChatParticipant
  ) => Promise<boolean | void | { aiReply?: string }>;
}

export interface ChatToolDefinition {
  name: string;
  description?: string;
  execute?: (args: any) => Promise<any>;
}

export interface GroupChatContext {
  actorName?: string;
  conversationId?: string;
  roomUri?: string;
  participants: ChatParticipant[];

  // Dynamic speech acts, verbs, and tools provided by conversation or setup context
  defaultSpeechAct?: string;
  availableVerbs?: ChatVerbDefinition[];
  availableTools?: (string | ChatToolDefinition)[];

  onSpeech: (
    text: string,
    speechAct: string,
    targetParticipantId?: string
  ) => Promise<{ aiReply?: string } | void>;
  onCommand?: (command: string, args: string) => Promise<boolean | void>;
  onToolCall?: (toolName: string, args: Record<string, any>) => Promise<any>;
  redrawView?: () => void;
  logTurn?: (msg: string) => Promise<void>;

  hint?: string;
  helpHeader?: string;
}

export const DEFAULT_CHAT_VERBS: ChatVerbDefinition[] = [
  {
    name: 'whisper',
    aliases: ['w'],
    description: 'Whisper privately to a participant',
    usage: '<name> <msg>',
    speechAct: 'WHISPER',
    directed: true,
  },
  {
    name: 'banter',
    aliases: ['b'],
    description: 'Banter or informal talk to the group',
    usage: '<msg>',
    speechAct: 'BANTER',
  },
];

export function askUser(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

export function printChatHelp(ctx?: GroupChatContext): void {
  const header = ctx?.helpHeader || '=== Group Chat & Interaction Commands ===';
  console.log(`\n\x1b[1m\x1b[36m${header}\x1b[0m`);

  const defaultAct = ctx?.defaultSpeechAct || 'TABLE_TALK';
  console.log(`  \x1b[1m<message>\x1b[0m                   Speak to the group (${defaultAct})`);
  console.log(`  \x1b[1m1, 2, 3...\x1b[0m                 Select an action choice during your turn`);

  const verbs = ctx?.availableVerbs ?? DEFAULT_CHAT_VERBS;
  for (const v of verbs) {
    const aliasStr = v.aliases && v.aliases.length > 0 ? `, /${v.aliases.join(', /')}` : '';
    const cmdStr = `/${v.name}${aliasStr}${v.usage ? ` ${v.usage}` : ''}`;
    console.log(`  \x1b[1m${cmdStr.padEnd(28)}\x1b[0m ${v.description}`);
  }

  if (ctx?.availableTools && ctx.availableTools.length > 0) {
    const toolNames = ctx.availableTools.map((t) => (typeof t === 'string' ? t : t.name)).join(', ');
    console.log(`  \x1b[1m${'/tool <name> [json]'.padEnd(28)}\x1b[0m Invoke available tool (${toolNames})`);
  }

  console.log(`  \x1b[1m${'/help, /?'.padEnd(28)}\x1b[0m Show this help message`);
  console.log(`  \x1b[1m${'/quit, /exit, /q'.padEnd(28)}\x1b[0m Exit the session\n`);
}

interface CommandDispatchResult {
  handled: boolean;
  shouldQuit?: boolean;
}

async function dispatchSlashCommand(
  cmd: string,
  rest: string,
  ctx: GroupChatContext,
  actor: string,
  rl: readline.Interface
): Promise<CommandDispatchResult> {
  if (cmd === 'help' || cmd === '?') {
    printChatHelp(ctx);
    await askUser(rl, '\x1b[33mPress ENTER to return to action...\x1b[0m');
    return { handled: true };
  }

  if (cmd === 'quit' || cmd === 'exit' || cmd === 'q') {
    return { handled: true, shouldQuit: true };
  }

  // 1. Tool execution: /tool <toolName> [jsonArgs]
  if (cmd === 'tool' || cmd === 'call') {
    const parts = rest.split(/\s+/);
    const toolName = parts[0];
    const rawArgs = parts.slice(1).join(' ').trim();
    if (!toolName) {
      console.log('\x1b[33mUsage: /tool <toolName> [jsonArgs]\x1b[0m');
      return { handled: true };
    }

    let parsedArgs: Record<string, any> = {};
    if (rawArgs) {
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch (err) {
        console.log(`\x1b[31mInvalid JSON arguments for tool "${toolName}": ${(err as Error).message}\x1b[0m`);
        return { handled: true };
      }
    }

    if (ctx.availableTools && ctx.availableTools.length > 0) {
      const allowed = ctx.availableTools.some((t) =>
        typeof t === 'string' ? t === toolName : t.name === toolName
      );
      if (!allowed) {
        const allowedNames = ctx.availableTools
          .map((t) => (typeof t === 'string' ? t : t.name))
          .join(', ');
        console.log(`\x1b[31mTool "${toolName}" is not available in this conversation. Available: ${allowedNames}\x1b[0m`);
        return { handled: true };
      }
    }

    if (ctx.logTurn) await ctx.logTurn(`[TOOL CALL] ${actor} invoked ${toolName}`);
    try {
      const toolDef = ctx.availableTools?.find(
        (t) => typeof t !== 'string' && t.name === toolName
      ) as ChatToolDefinition | undefined;
      let result: any;
      if (toolDef?.execute) {
        result = await toolDef.execute(parsedArgs);
      } else if (ctx.onToolCall) {
        result = await ctx.onToolCall(toolName, parsedArgs);
      } else {
        console.log(`\x1b[31mNo tool executor configured for "${toolName}".\x1b[0m`);
        return { handled: true };
      }
      console.log(`\x1b[32m[TOOL RESULT] ${toolName}:\x1b[0m`, typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(`\x1b[31m[TOOL ERROR] ${toolName}: ${(err as Error).message}\x1b[0m`);
    }
    return { handled: true };
  }

  // 2. Resolve against available verbs
  const verbs = ctx.availableVerbs ?? DEFAULT_CHAT_VERBS;
  const matchedVerb = verbs.find(
    (v) => v.name.toLowerCase() === cmd || v.aliases?.some((a) => a.toLowerCase() === cmd)
  );

  if (matchedVerb) {
    if (matchedVerb.handler) {
      let target: ChatParticipant | undefined;
      let argsToPass = rest;
      if (matchedVerb.directed) {
        const parts = rest.split(/\s+/);
        const targetQuery = parts[0] || '';
        argsToPass = parts.slice(1).join(' ').trim();
        target = ctx.participants.find(
          (p) => !p.isHuman && p.name.toLowerCase().includes(targetQuery.toLowerCase())
        );
      }
      const res = await matchedVerb.handler(argsToPass, ctx, target);
      if (res && typeof res === 'object' && res.aiReply) {
        console.log(`\x1b[36m[REPLY] ${res.aiReply}\x1b[0m`);
      }
      return { handled: true };
    }

    if (matchedVerb.directed) {
      const parts = rest.split(/\s+/);
      const targetQuery = parts[0] || '';
      const msg = parts.slice(1).join(' ').trim();

      if (!targetQuery || !msg) {
        console.log(`\x1b[33mUsage: /${matchedVerb.name} ${matchedVerb.usage || '<name> <message>'}\x1b[0m`);
        return { handled: true };
      }

      const target = ctx.participants.find(
        (p) => !p.isHuman && p.name.toLowerCase().includes(targetQuery.toLowerCase())
      );

      if (!target) {
        const avail = ctx.participants.filter((p) => !p.isHuman).map((p) => p.name).join(', ');
        console.log(`\x1b[31mParticipant "${targetQuery}" not found. Available: ${avail}\x1b[0m`);
        return { handled: true };
      }

      const act = matchedVerb.speechAct || 'WHISPER';
      console.log(`\x1b[35m[${act} to ${target.name}] ${actor}: "${msg}"\x1b[0m`);
      if (ctx.logTurn) await ctx.logTurn(`[${act} to ${target.name}] ${actor}: "${msg}"`);
      const res = (await ctx.onSpeech(msg, act, target.id)) as { aiReply?: string } | undefined;
      if (res?.aiReply) {
        console.log(`\x1b[35m[${act} from ${target.name}] ${target.name}: "${res.aiReply}"\x1b[0m`);
      }
      return { handled: true };
    }

    if (matchedVerb.speechAct) {
      if (!rest) {
        console.log(`\x1b[33mUsage: /${matchedVerb.name} ${matchedVerb.usage || '<message>'}\x1b[0m`);
        return { handled: true };
      }
      const act = matchedVerb.speechAct;
      console.log(`\x1b[33m[${act}] ${actor}: "${rest}"\x1b[0m`);
      if (ctx.logTurn) await ctx.logTurn(`[${act}] ${actor}: "${rest}"`);
      const res = (await ctx.onSpeech(rest, act)) as { aiReply?: string } | undefined;
      if (res?.aiReply) {
        console.log(`\x1b[33m[REPLY] ${res.aiReply}\x1b[0m`);
      }
      return { handled: true };
    }
  }

  // 3. Fallback to generic onCommand
  if (ctx.onCommand) {
    const handled = await ctx.onCommand(cmd, rest);
    if (handled) {
      return { handled: true };
    }
  }

  console.log(`\x1b[31mUnknown command: /${cmd}. Type /help for available commands.\x1b[0m`);
  return { handled: true };
}

/**
 * Generalized group chat prompt for an interactive turn with choices.
 * Seamlessly integrates action choice selection, free-form group dialogue, and slash commands.
 */
export async function promptGroupChatAction<T>(
  rl: readline.Interface,
  choices: ChatChoice<T>[],
  ctx: GroupChatContext
): Promise<T> {
  const actor = ctx.actorName || 'You';
  const defaultAct = ctx.defaultSpeechAct || 'TABLE_TALK';

  while (true) {
    if (ctx.redrawView) {
      ctx.redrawView();
    }

    const choiceList = choices.map((c, i) => `\x1b[1m[${i + 1}]\x1b[0m ${c.label}`).join('   ');
    console.log(`\n\x1b[36mChoices:\x1b[0m ${choiceList}`);
    const hintText =
      ctx.hint ||
      `Enter 1-${choices.length} to act, type to chat (${defaultAct}), /help for commands`;
    console.log(`\x1b[90m(${hintText})\x1b[0m`);

    const rawInput = (await askUser(rl, `\x1b[1m\x1b[32m${actor} > \x1b[0m`)).trim();

    if (!rawInput) {
      continue;
    }

    // 1. Check numerical choice selection (e.g. "1", "2")
    const choiceNum = parseInt(rawInput, 10);
    if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= choices.length) {
      const selected = choices[choiceNum - 1];
      if (ctx.logTurn) await ctx.logTurn(`${actor} chose: ${selected.label}`);
      return selected.value;
    }

    // 2. Check name / alias matching choice (e.g. "check", "call", "fold", "raise")
    const lowerInput = rawInput.toLowerCase();
    const matchedChoice = choices.find((c) => {
      const lowerLabel = c.label.toLowerCase();
      if (lowerLabel.startsWith(lowerInput) || lowerInput.startsWith(lowerLabel)) return true;
      if (c.aliases?.some((a) => a.toLowerCase() === lowerInput)) return true;
      return false;
    });
    if (matchedChoice) {
      if (ctx.logTurn) await ctx.logTurn(`${actor} chose: ${matchedChoice.label}`);
      return matchedChoice.value;
    }

    // 3. Slash commands
    if (rawInput.startsWith('/')) {
      const parts = rawInput.slice(1).split(/\s+/);
      const cmd = parts[0]?.toLowerCase() || '';
      const rest = parts.slice(1).join(' ').trim();

      const result = await dispatchSlashCommand(cmd, rest, ctx, actor, rl);
      if (result.shouldQuit) {
        console.log('\x1b[33mExiting turn...\x1b[0m');
      }
      continue;
    }

    // 4. Free-form text: Direct group chat speech using context speechAct
    console.log(`\x1b[36m[CHAT] ${actor}: "${rawInput}"\x1b[0m`);
    if (ctx.logTurn) await ctx.logTurn(`[CHAT] ${actor}: "${rawInput}"`);
    const speechRes = (await ctx.onSpeech(rawInput, defaultAct)) as { aiReply?: string } | undefined;
    if (speechRes?.aiReply) {
      console.log(`\x1b[36m[REPLY] ${speechRes.aiReply}\x1b[0m`);
    }
  }
}

/**
 * Generalized group chat prompt between rounds / during intermission.
 * Allows chatting freely with participants or pressing ENTER to proceed to next round.
 */
export async function promptGroupChatIntermission(
  rl: readline.Interface,
  ctx: GroupChatContext,
  hint?: string
): Promise<'CONTINUE' | 'QUIT'> {
  const actor = ctx.actorName || 'You';
  const defaultAct = ctx.defaultSpeechAct || 'TABLE_TALK';
  const defaultHint =
    hint ||
    ctx.hint ||
    `Press ENTER for next round, type to chat (${defaultAct}), or /help for commands`;

  while (true) {
    console.log(`\n\x1b[90m(${defaultHint})\x1b[0m`);
    const rawInput = (await askUser(rl, `\x1b[1m\x1b[32m${actor} > \x1b[0m`)).trim();

    // Pressing ENTER proceeds!
    if (!rawInput) {
      return 'CONTINUE';
    }

    // Slash commands
    if (rawInput.startsWith('/')) {
      const parts = rawInput.slice(1).split(/\s+/);
      const cmd = parts[0]?.toLowerCase() || '';
      const rest = parts.slice(1).join(' ').trim();

      const result = await dispatchSlashCommand(cmd, rest, ctx, actor, rl);
      if (result.shouldQuit) {
        return 'QUIT';
      }
      continue;
    }

    // Direct chat
    console.log(`\x1b[36m[CHAT] ${actor}: "${rawInput}"\x1b[0m`);
    if (ctx.logTurn) await ctx.logTurn(`[CHAT] ${actor}: "${rawInput}"`);
    const speechRes = (await ctx.onSpeech(rawInput, defaultAct)) as { aiReply?: string } | undefined;
    if (speechRes?.aiReply) {
      console.log(`\x1b[36m[REPLY] ${speechRes.aiReply}\x1b[0m`);
    }
  }
}
