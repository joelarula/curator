import { seedPokerDatabase } from '../db/seed.js';
import { createPokerHost } from '../host.js';
import { getPokerWorkflowAST } from '../scripts/pokerHandScript.js';
import type { CuratorHost } from '@curator/host';
import type { PlayerAction, PokerGameState } from '../types.js';

export interface PokerSessionOptions {
  databasePath?: string;
  forceReset?: boolean;
  maxSeats?: number;
  startingChips?: number;
  smallBlind?: number;
  bigBlind?: number;
  verbose?: boolean;
  intervalMs?: number;
}

export interface HumanTurnPromptInfo {
  requestId: number;
  player: string;
  name: string;
  chips: number;
  pot: number;
  toCall: number;
  street: string;
  choices: any[];
}

export interface PokerGameSession {
  readonly tableId: string;
  readonly prisma: any;
  readonly host: CuratorHost;
  readonly processor: any;
  readonly conversation: any;
  readonly project: any;
  readonly user: any;
  readonly rootRequestId: number;

  getGameState(): Promise<PokerGameState | null>;
  getWaitingHumanTurn(): Promise<HumanTurnPromptInfo | null>;
  submitHumanAction(action: PlayerAction): Promise<boolean>;
  submitHumanSpeech(params: { text: string; speechAct?: string; targetId?: string }): Promise<any>;
  close(): Promise<void>;
}

/**
 * Creates and initializes the unified PokerGameSession.
 * Provisions the SQLite database, boots CuratorHost, and enqueues the AST root request.
 */
export async function createPokerGameSession(options: PokerSessionOptions = {}): Promise<PokerGameSession> {
  const maxSeats = Math.min(6, Math.max(2, options.maxSeats || 4));
  const startingChips = options.startingChips || 1000;
  const smallBlind = options.smallBlind || 10;
  const bigBlind = options.bigBlind || 20;

  // 1. Provision SQLite database
  const seed = await seedPokerDatabase({
    databasePath: options.databasePath,
    forceReset: options.forceReset,
    maxSeats,
  });

  const { prisma, user, project, conversation, dbPath } = seed;

  // 2. Instantiate CuratorHost
  const host = await createPokerHost({
    databasePath: dbPath,
    quiet: !options.verbose,
    intervalMs: options.intervalMs ?? 500,
  });

  // 3. Compile and enqueue the declarative Poker Engine AST workflow
  const workflowAst = await getPokerWorkflowAST();
  const rootRequest = await prisma.request.create({
    data: {
      userId: user.id,
      projectId: project.id,
      conversationId: conversation.id,
      status: 'NEW',
      ast: workflowAst as any,
      context: {
        tableId: String(conversation.id),
        startingChips,
        sbAmount: smallBlind,
        bbAmount: bigBlind,
        maxSeats,
      },
    },
  });

  const tableId = String(conversation.id);

  const getGameState = async (): Promise<PokerGameState | null> => {
    // 1. Check most recent request context with gameState
    const latestReq = await prisma.request.findFirst({
      where: {
        conversationId: conversation.id,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const ctx = latestReq?.context as any;
    if (ctx?.gameState) return ctx.gameState;
    if (ctx?.state?.gameState) return ctx.state.gameState;

    // 2. Check conversation metadata / state
    const conv = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    const cMeta = conv?.metadata as any;
    if (cMeta?.gameState) return cMeta.gameState;
    const cState = (conv as any)?.state as any;
    if (cState?.gameState) return cState.gameState;

    return null;
  };

  const getWaitingHumanTurn = async (): Promise<HumanTurnPromptInfo | null> => {
    const waitingReq = await prisma.request.findFirst({
      where: {
        conversationId: conversation.id,
        status: 'WAITING_FOR_EVENT',
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!waitingReq) return null;
    const ctx = (waitingReq.context as any) || {};
    if (ctx.waitEvent !== 'poker:human_action') return null;

    const choicesInfo = ctx.poker_get_choices || {};
    const gameState = ctx.gameState;
    const activePlayer = gameState?.players?.[gameState?.activePlayerIdx];

    return {
      requestId: waitingReq.id,
      player: activePlayer?.id || 'hero',
      name: activePlayer?.name || 'You',
      chips: activePlayer?.chips ?? 0,
      pot: gameState?.pot ?? 0,
      toCall: (gameState?.currentBet ?? 0) - (activePlayer?.streetBet ?? 0),
      street: gameState?.currentStreet || 'PREFLOP',
      choices: choicesInfo.choices || [],
    };
  };

  const submitHumanAction = async (action: PlayerAction): Promise<boolean> => {
    const waitingReqs = await prisma.request.findMany({
      where: {
        conversationId: conversation.id,
        status: 'WAITING_FOR_EVENT',
      },
    });

    let woken = false;
    for (const req of waitingReqs) {
      const ctx = (req.context as any) || {};
      if (ctx.waitEvent === 'poker:human_action') {
        const alias = ctx.payloadAlias;
        const updatedContext = { ...ctx };
        delete updatedContext.waitEvent;
        delete updatedContext.payloadAlias;

        if (alias) {
          updatedContext.state = { ...(updatedContext.state || {}), [alias]: action };
          if (alias === 'humanAction') {
            updatedContext.humanAction = action;
          }
        }

        await prisma.request.update({
          where: { id: req.id },
          data: { status: 'NEW', context: updatedContext },
        });
        woken = true;
      }
    }

    if (woken) {
      host.events.broadcast('poker:human_action', action);
    }
    return woken;
  };

  const submitHumanSpeech = async (params: { text: string; speechAct?: string; targetId?: string }): Promise<any> => {
    const tool = host.engine.tools.get('poker_human_speech');
    if (!tool) return null;

    const heroUser = await prisma.user.findFirst({ where: { email: 'hero@tabletop.local' } });
    const currentGameState = await getGameState();

    const result: any = await tool.runAsync({
      args: {
        state: currentGameState,
        speechAct: params.speechAct || 'TABLE_TALK',
        text: params.text || '',
        targetId: params.targetId,
        speakerId: heroUser?.id || 'hero',
        speakerName: heroUser?.name || 'You',
      },
      toolContext: { prisma, conversationId: conversation.id },
    });

    host.events.broadcast('poker:speech_response', {
      speaker: heroUser?.name || 'You',
      text: params.text,
      speechAct: params.speechAct || 'TABLE_TALK',
      aiReply: result?.aiResponse?.text,
      targetId: params.targetId,
    });

    return result;
  };

  const close = async (): Promise<void> => {
    await host.stop();
  };

  return {
    tableId,
    prisma,
    host,
    processor: host.processor,
    conversation,
    project,
    user,
    rootRequestId: rootRequest.id,
    getGameState,
    getWaitingHumanTurn,
    submitHumanAction,
    submitHumanSpeech,
    close,
  };
}
