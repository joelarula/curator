/**
 * Master Poker Agent Prompt & Conversation History Formatter.
 * Pure TypeScript implementation replacing legacy agent_prompt.coffee.
 */

import { getRulesDescription } from './pokerRules.ts';

export function formatConversationHistory(remarks: any[] = [], playerId?: string): string {
  if (!remarks || remarks.length === 0) return 'None';

  const lines = remarks.slice(-6).map((r) => {
    if (r.speechAct === 'WHISPER') {
      if (r.speakerId === playerId) {
        return `[YOU WHISPERED to ${r.recipientId}]: "${r.text}"`;
      } else if (r.recipientId === playerId) {
        return `[${r.speakerName} WHISPERED to you]: "${r.text}"`;
      } else {
        return `[OBSERVED]: ${r.speakerName} leaned over and whispered secretly to ${r.recipientId}.`;
      }
    } else {
      return `${r.speakerName} (${r.speechAct || 'TABLE_TALK'}): "${r.text}"`;
    }
  });

  return lines.join('\n');
}

export function buildAgentPrompt(args: any): any {
  const ctx = args?.context || args || {};
  const player = ctx.player || (args?.id || args?.name ? args : {});
  const gameState = ctx.gameState || args?.gameState || {};
  const handDesc = ctx.handDesc || args?.handDesc || 'Evaluating hand strength';
  const cardsStr = ctx.cardsStr || args?.cardsStr || 'Hidden';
  const boardStr = ctx.boardStr || args?.boardStr || 'None';

  // 1. Inject persona instruction from context
  const instruction =
    player.instruction ||
    (player.persona
      ? `You are ${player.name}, an autonomous poker agent. Character disposition: ${player.persona}.`
      : `You are ${player.name}, an autonomous poker agent.`);

  // 2. Extract table dynamics
  const toCall = Math.max(0, (gameState.currentBet || 0) - (player.streetBet || 0));
  const pot = gameState.pot || 0;
  const minRaise = gameState.minRaise || 20;
  const street = gameState.currentStreet || 'PREFLOP';

  // 3. Form game conversation history from context
  const remarks = ctx.recentRemarks || gameState.recentRemarks || [];
  const conversationHistory = formatConversationHistory(remarks, player.id);

  // 4. Active opponents at the table
  const opponentsList = (gameState.players || [])
    .filter((p: any) => p.id !== player.id)
    .map((p: any) => {
      const status = p.folded ? 'FOLDED' : p.allIn ? 'ALL-IN' : 'ACTIVE';
      return `${p.name} ($${p.chips}, ${status})`;
    });
  const opponentsStr = opponentsList.length > 0 ? opponentsList.join(', ') : 'None';

  const rulesBlock = ctx.rulesDescription || getRulesDescription();

  // 5. Formulate unified Agent System Prompt with Texas Hold'em Rules
  const systemPrompt = `You are ${player.name}, an autonomous agent playing Texas Hold'em Poker in the Curator ecosystem.

Agent Persona & Character Instruction:
${instruction}

${rulesBlock}
- Output Format: You MUST strictly respond in valid JSON format:
{
  "action": "CHECK" | "CALL" | "RAISE" | "ALL_IN" | "FOLD",
  "amount": number (required if RAISE or CALL; for RAISE, specify total street bet or raise amount),
  "speech": "dialogue spoken out loud to the table (optional, 1 sentence in character)",
  "speechAct": "TABLE_TALK" | "BANTER" | "WHISPER" | "PROVOKE" | "GOSSIP",
  "innerMonologue": "private strategic reasoning about this turn (1 sentence)"
}`;

  // 6. Formulate turn state & contextual dialogue prompt
  const userPrompt = `Current Texas Hold'em Turn State:
- Hole Cards: ${cardsStr} (${handDesc})
- Community Cards: ${boardStr}
- Street: ${street}
- Pot: $${pot}
- Bet to match: $${gameState.currentBet || 0}
- Your Stack: $${player.chips}
- Cost to Call: $${toCall}
- Min Raise: $${minRaise}
- Opponents: ${opponentsStr}
- Recent Table Dialogue & Conversation History:
${conversationHistory}`;

  // If called with single player object, return systemPrompt string for backward compatibility
  if (!(ctx.gameState || args?.gameState)) {
    return systemPrompt;
  }

  return { systemPrompt, userPrompt, conversationHistory };
}

export const formatAgentPrompt = buildAgentPrompt;
