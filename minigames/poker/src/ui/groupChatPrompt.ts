import readline from 'node:readline';

export interface ChatParticipant {
  id: string;
  name: string;
  isHuman?: boolean;
}

export interface ChatChoice<T = any> {
  id: string;
  label: string;
  value: T;
  aliases?: string[];
}

export interface GroupChatContext {
  actorName?: string;
  participants: ChatParticipant[];
  onSpeech: (
    text: string,
    speechAct: 'TABLE_TALK' | 'BANTER' | 'WHISPER',
    targetParticipantId?: string
  ) => Promise<{ aiReply?: string } | void>;
  onCommand?: (command: string, args: string) => Promise<boolean | void>;
  redrawView?: () => void;
  logTurn?: (msg: string) => Promise<void>;
}

export function askUser(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

export function printChatHelp(): void {
  console.log(`
\x1b[1m\x1b[36m=== Group Chat & Interaction Commands ===\x1b[0m
  \x1b[1m<message>\x1b[0m                   Speak to the group / table (TABLE_TALK)
  \x1b[1m1, 2, 3...\x1b[0m                 Select an action choice during your turn
  \x1b[1m/w, /whisper <name> <msg>\x1b[0m  Whisper privately to a participant
  \x1b[1m/b, /banter <msg>\x1b[0m          Banter or trash talk to the group
  \x1b[1m/info, /narratives\x1b[0m         View subjective inner narratives & memories
  \x1b[1m/standings, /score\x1b[0m         View current chip standings and leaderboard
  \x1b[1m/view, /table\x1b[0m              Redraw the room / table interface
  \x1b[1m/help, /?\x1b[0m                 Show this help message
  \x1b[1m/quit, /exit, /q\x1b[0m           Exit the session
`);
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

  while (true) {
    if (ctx.redrawView) {
      ctx.redrawView();
    }

    const choiceList = choices.map((c, i) => `\x1b[1m[${i + 1}]\x1b[0m ${c.label}`).join('   ');
    console.log(`\n\x1b[36mChoices:\x1b[0m ${choiceList}`);
    console.log('\x1b[90m(Enter 1-' + choices.length + ' to act, type to chat in room, /w <player> <msg> to whisper, /help)\x1b[0m');

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

      if (cmd === 'help' || cmd === '?') {
        printChatHelp();
        await askUser(rl, '\x1b[33mPress ENTER to return to action...\x1b[0m');
        continue;
      }

      if (cmd === 'w' || cmd === 'whisper') {
        const whisperParts = rest.split(/\s+/);
        const targetQuery = whisperParts[0] || '';
        const whisperMsg = whisperParts.slice(1).join(' ').trim();

        if (!targetQuery || !whisperMsg) {
          console.log('\x1b[33mUsage: /w <playerName> <message>\x1b[0m');
          continue;
        }

        const target = ctx.participants.find(
          (p) => !p.isHuman && p.name.toLowerCase().includes(targetQuery.toLowerCase())
        );

        if (!target) {
          const avail = ctx.participants.filter((p) => !p.isHuman).map((p) => p.name).join(', ');
          console.log(`\x1b[31mParticipant "${targetQuery}" not found. Available: ${avail}\x1b[0m`);
          continue;
        }

        console.log(`\x1b[35m[WHISPER to ${target.name}] ${actor}: "${whisperMsg}"\x1b[0m`);
        if (ctx.logTurn) await ctx.logTurn(`[WHISPER to ${target.name}] ${actor}: "${whisperMsg}"`);
        const res = await ctx.onSpeech(whisperMsg, 'WHISPER', target.id);
        if (res?.aiReply) {
          console.log(`\x1b[35m[WHISPER from ${target.name}] ${target.name}: "${res.aiReply}"\x1b[0m`);
        }
        await askUser(rl, '\x1b[33mPress ENTER to return to action...\x1b[0m');
        continue;
      }

      if (cmd === 'b' || cmd === 'banter') {
        if (!rest) {
          console.log('\x1b[33mUsage: /b <message>\x1b[0m');
          continue;
        }
        console.log(`\x1b[33m[BANTER] ${actor}: "${rest}"\x1b[0m`);
        if (ctx.logTurn) await ctx.logTurn(`[BANTER] ${actor}: "${rest}"`);
        const res = await ctx.onSpeech(rest, 'BANTER');
        if (res?.aiReply) {
          console.log(`\x1b[33m[REPLY] ${res.aiReply}\x1b[0m`);
        }
        await askUser(rl, '\x1b[33mPress ENTER to return to action...\x1b[0m');
        continue;
      }

      if (ctx.onCommand) {
        const handled = await ctx.onCommand(cmd, rest);
        if (handled) {
          await askUser(rl, '\x1b[33mPress ENTER to return to action...\x1b[0m');
          continue;
        }
      }

      console.log(`\x1b[31mUnknown command: /${cmd}. Type /help for available commands.\x1b[0m`);
      continue;
    }

    // 4. Free-form text: It is direct group chat speech!
    console.log(`\x1b[36m[CHAT] ${actor}: "${rawInput}"\x1b[0m`);
    if (ctx.logTurn) await ctx.logTurn(`[CHAT] ${actor}: "${rawInput}"`);
    const speechRes = await ctx.onSpeech(rawInput, 'TABLE_TALK');
    if (speechRes?.aiReply) {
      console.log(`\x1b[36m[REPLY] ${speechRes.aiReply}\x1b[0m`);
    }
    await askUser(rl, '\x1b[33mPress ENTER to return to action...\x1b[0m');
  }
}

/**
 * Generalized group chat prompt between rounds / during intermission.
 * Allows chatting freely with participants or pressing ENTER to proceed to next round.
 */
export async function promptGroupChatIntermission(
  rl: readline.Interface,
  ctx: GroupChatContext,
  hint = 'Press ENTER for next round, type to chat with the room, or /help for commands'
): Promise<'CONTINUE' | 'QUIT'> {
  const actor = ctx.actorName || 'You';

  while (true) {
    console.log(`\n\x1b[90m(${hint})\x1b[0m`);
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

      if (cmd === 'quit' || cmd === 'exit' || cmd === 'q') {
        return 'QUIT';
      }

      if (cmd === 'help' || cmd === '?') {
        printChatHelp();
        continue;
      }

      if (cmd === 'w' || cmd === 'whisper') {
        const whisperParts = rest.split(/\s+/);
        const targetQuery = whisperParts[0] || '';
        const whisperMsg = whisperParts.slice(1).join(' ').trim();

        if (!targetQuery || !whisperMsg) {
          console.log('\x1b[33mUsage: /w <playerName> <message>\x1b[0m');
          continue;
        }

        const target = ctx.participants.find(
          (p) => !p.isHuman && p.name.toLowerCase().includes(targetQuery.toLowerCase())
        );

        if (!target) {
          const avail = ctx.participants.filter((p) => !p.isHuman).map((p) => p.name).join(', ');
          console.log(`\x1b[31mParticipant "${targetQuery}" not found. Available: ${avail}\x1b[0m`);
          continue;
        }

        console.log(`\x1b[35m[WHISPER to ${target.name}] ${actor}: "${whisperMsg}"\x1b[0m`);
        if (ctx.logTurn) await ctx.logTurn(`[WHISPER to ${target.name}] ${actor}: "${whisperMsg}"`);
        const res = await ctx.onSpeech(whisperMsg, 'WHISPER', target.id);
        if (res?.aiReply) {
          console.log(`\x1b[35m[WHISPER from ${target.name}] ${target.name}: "${res.aiReply}"\x1b[0m`);
        }
        continue;
      }

      if (cmd === 'b' || cmd === 'banter') {
        if (!rest) {
          console.log('\x1b[33mUsage: /b <message>\x1b[0m');
          continue;
        }
        console.log(`\x1b[33m[BANTER] ${actor}: "${rest}"\x1b[0m`);
        if (ctx.logTurn) await ctx.logTurn(`[BANTER] ${actor}: "${rest}"`);
        const res = await ctx.onSpeech(rest, 'BANTER');
        if (res?.aiReply) {
          console.log(`\x1b[33m[REPLY] ${res.aiReply}\x1b[0m`);
        }
        continue;
      }

      if (ctx.onCommand) {
        const handled = await ctx.onCommand(cmd, rest);
        if (handled) continue;
      }

      console.log(`\x1b[31mUnknown command: /${cmd}. Type /help for available commands.\x1b[0m`);
      continue;
    }

    // Direct chat
    console.log(`\x1b[36m[CHAT] ${actor}: "${rawInput}"\x1b[0m`);
    if (ctx.logTurn) await ctx.logTurn(`[CHAT] ${actor}: "${rawInput}"`);
    const speechRes = await ctx.onSpeech(rawInput, 'TABLE_TALK');
    if (speechRes?.aiReply) {
      console.log(`\x1b[36m[REPLY] ${speechRes.aiReply}\x1b[0m`);
    }
  }
}
