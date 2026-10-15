import type { Card, PlayerState, PokerGameState, SpeechAct, AmbientRemark, ActionType, PlayerAction } from '../types.js';
import { evaluateBestHand } from './pokerEvaluator.js';
import { curatorEngine, LlmFactory, GeminiLlmProvider } from '@curator/agent-server';

export interface AgenticSpeechResult {
  speakerId: string;
  speakerName: string;
  speechAct: SpeechAct;
  recipientId?: string;
  text: string;
  innerMonologue: string;
}

export function formatCards(cards: Card[]): string {
  return cards.map((c) => `[${c.rank}${c.suit}]`).join(' ');
}

/**
 * Resolves the agent's dynamic instruction. Prioritizes explicit `instruction`
 * (from the CoffeeScript AST or dynamic seat), then persona description, then generic fallback.
 */
export function getAgentInstruction(agent: PlayerState): string {
  if (agent.instruction && agent.instruction.trim().length > 0) {
    return agent.instruction;
  }
  if (agent.persona && typeof agent.persona === 'string') {
    return `You are ${agent.name}, an autonomous poker agent. Character disposition: ${agent.persona}.`;
  }
  return `You are ${agent.name}, an autonomous poker player aiming to maximize chips through strategic analysis and game theory.`;
}

import {
  evaluateCoffeeScriptSync,
  loadAgentPromptCoffeeScript,
  formatAgentPromptCoffeeScript,
} from '../scripts/pokerHandScript.js';

let cachedPromptFn: ((player: PlayerState) => string) | null = null;

/**
 * Builds the unified Agent System Prompt directly from the standalone agent_prompt.coffee specification.
 */
export function buildAgentSystemPrompt(player: PlayerState): string {
  if (!cachedPromptFn) {
    const coffeeCode = loadAgentPromptCoffeeScript();
    cachedPromptFn = evaluateCoffeeScriptSync<(p: PlayerState) => string>(coffeeCode);
  }
  return cachedPromptFn!(player);
}

/**
 * Ensures Curator's Gemini LLM provider is registered in Curator's LlmFactory and engine.
 */
function ensureCuratorGeminiProvider(): void {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return;

  if (!curatorEngine.llmProviders.has('gemini')) {
    const provider = new GeminiLlmProvider();
    LlmFactory.registerProvider('gemini', provider);
    curatorEngine.registerLlmProvider('gemini', provider);
  }
}

/**
 * Invokes the Curator LLM Engine with JSON output requirement.
 */
export async function callCuratorLlm<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<T | null> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    ensureCuratorGeminiProvider();
  }

  try {
    const response = await curatorEngine.generateContent({
      provider: 'gemini',
      model: options.model || 'gemini-2.5-flash',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      jsonOutput: true,
      apiKey: apiKey || 'curator-local-key',
      temperature: options.temperature ?? 0.8,
      maxTokens: options.maxTokens ?? 350,
    });

    if (!response?.text) return null;
    return JSON.parse(response.text) as T;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Curator-Driven Agentic Poker Turn Decision
// ----------------------------------------------------------------------------

export async function agenticDecidePokerAction(
  player: PlayerState,
  gameState: PokerGameState
): Promise<PlayerAction> {
  const toCall = Math.max(0, gameState.currentBet - player.streetBet);
  const canCheck = toCall === 0;
  const handEval = evaluateBestHand(player.holeCards, gameState.board);
  const chips = player.chips;
  const minRaise = gameState.minRaise || 20;

  // Formulate both System Prompt and Contextual User Prompt with Conversation History in CoffeeScript
  const { systemPrompt, userPrompt } = formatAgentPromptCoffeeScript({
    player,
    gameState,
    handDesc: handEval.description,
    cardsStr: formatCards(player.holeCards),
    boardStr: formatCards(gameState.board) || 'None',
  });

  const res = await callCuratorLlm<{
    action: string;
    amount?: number;
    speech?: string;
    speechAct?: SpeechAct;
    innerMonologue?: string;
  }>(systemPrompt, userPrompt, { model: player.model });

  if (res?.action) {
    let actionType = res.action.toUpperCase() as ActionType;
    if (canCheck && actionType === 'FOLD') actionType = 'CHECK';
    if (!canCheck && actionType === 'CHECK') actionType = 'CALL';

    let amount = res.amount;
    if (actionType === 'CALL') {
      amount = Math.min(chips, toCall);
    } else if (actionType === 'RAISE') {
      const minReq = toCall + minRaise;
      if (!amount || amount < minReq) amount = minReq;
      if (amount >= chips) {
        actionType = 'ALL_IN';
        amount = chips;
      }
    } else if (actionType === 'ALL_IN') {
      amount = chips;
    }

    return {
      type: actionType,
      amount,
      speech: res.speech,
      speechAct: res.speechAct || 'TABLE_TALK',
      innerMonologue: res.innerMonologue,
    };
  }

  // If LLM response unavailable, default to minimal legal table action
  return canCheck ? { type: 'CHECK' } : { type: 'FOLD' };
}
