import { graphql, type ExecutionResult } from 'graphql';
import { pokerGraphQLSchema } from './schema.ts';
import type { PokerGameSession, PokerTableInfo, HumanTurnPromptInfo } from '../engine/pokerSession.ts';
import type { PlayerAction } from '../types.ts';

function formatChoices(rawChoices: any[] | undefined): Array<{ action: string; amount?: number; min?: number; max?: number }> {
  if (!rawChoices || !Array.isArray(rawChoices)) return [];
  return rawChoices.map((c) => {
    if (typeof c === 'string') {
      return { action: c };
    }
    return {
      action: c.action || c.type || 'check',
      amount: c.amount,
      min: c.min,
      max: c.max,
    };
  });
}

function formatHumanTurn(turn: HumanTurnPromptInfo | null | undefined): any {
  if (!turn) return null;
  return {
    ...turn,
    choices: formatChoices(turn.choices),
  };
}

function formatTable(t: PokerTableInfo): any {
  return {
    tableId: t.tableId,
    conversationId: t.conversationId,
    title: t.title,
    createdAt: t.createdAt ? (typeof (t.createdAt as any).toISOString === 'function' ? (t.createdAt as any).toISOString() : String(t.createdAt)) : null,
    gameState: t.gameState,
    waitingForHuman: t.waitingForHuman,
    humanTurn: formatHumanTurn(t.humanTurn),
  };
}

export function createPokerResolvers(session: PokerGameSession) {
  return {
    async tables() {
      const list = await session.listTables();
      return list.map(formatTable);
    },

    async table({ id }: { id: string }) {
      const t = await session.getTable(id);
      return t ? formatTable(t) : null;
    },

    async waitingTurn({ tableId }: { tableId?: string }) {
      const turn = await session.getWaitingHumanTurn(tableId);
      return formatHumanTurn(turn);
    },

    async gameState({ tableId }: { tableId?: string }) {
      return await session.getGameState(tableId);
    },

    async createTable({ input }: { input?: any }) {
      const t = await session.createTable(input || {});
      return formatTable(t);
    },

    async submitAction({ tableId, action, sessionId }: { tableId?: string; action: { action: string; amount?: number }; sessionId?: string }) {
      const targetTableId = tableId || session.tableId;
      const playerAction: PlayerAction = {
        type: action.action as any,
        amount: action.amount,
      };
      const woken = await session.send('poker:human_action', playerAction, targetTableId, sessionId);
      if (woken) {
        await session.step(targetTableId);
      }
      return {
        success: true,
        tableId: String(targetTableId),
        woken,
        action: action.action,
        sessionId: sessionId || null,
      };
    },

    async submitSpeech({
      tableId,
      text,
      speechAct,
      targetId,
      sessionId,
    }: {
      tableId?: string;
      text: string;
      speechAct?: string;
      targetId?: string;
      sessionId?: string;
    }) {
      const targetTableId = tableId || session.tableId;
      const result = await session.send(
        'poker:speech',
        { text, speechAct, targetId },
        targetTableId,
        sessionId
      );

      return {
        success: true,
        tableId: String(targetTableId),
        text,
        aiReply: result?.aiResponse?.text || null,
        sessionId: sessionId || null,
      };
    },
  };
}

export async function executePokerGraphQL(params: {
  session: PokerGameSession;
  query: string;
  variables?: Record<string, any>;
  context?: any;
}): Promise<ExecutionResult> {
  const rootValue = createPokerResolvers(params.session);
  return graphql({
    schema: pokerGraphQLSchema,
    source: params.query,
    rootValue,
    variableValues: params.variables,
    contextValue: params.context,
  });
}
