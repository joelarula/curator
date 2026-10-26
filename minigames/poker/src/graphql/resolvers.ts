import { graphql, type ExecutionResult } from 'graphql';
import { pokerGraphQLSchema } from './schema.ts';
import type { PokerGameSession, PokerTableInfo, HumanTurnPromptInfo } from '../session/pokerSession.ts';
import { normalizeChoices } from '../models/pokerContracts.ts';

function formatHumanTurn(turn: HumanTurnPromptInfo | null | undefined): any {
  if (!turn) return null;
  return {
    ...turn,
    choices: normalizeChoices(turn.choices),
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
      return await session.submitAction(action, { tableId, sessionId });
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
      return await session.submitSpeech({ text, speechAct, targetId }, { tableId, sessionId });
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
