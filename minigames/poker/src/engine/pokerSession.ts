import type { CuratorHost } from '../curatorHost.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';

export interface PokerSessionOptions {
  databasePath?: string;
  forceReset?: boolean;
  tableId?: string | number;
  maxSeats?: number;
  startingChips?: number;
  smallBlind?: number;
  bigBlind?: number;
  verbose?: boolean;
  quiet?: boolean;
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

export interface CreateTableOptions {
  title?: string;
  maxSeats?: number;
  startingChips?: number;
  smallBlind?: number;
  bigBlind?: number;
}

export interface PokerTableInfo {
  tableId: string;
  conversationId: number;
  title: string;
  createdAt: Date;
  status?: string;
  gameState: PokerGameState | null;
  waitingForHuman: boolean;
  humanTurn: HumanTurnPromptInfo | null;
}

export interface DirectStepResult {
  done: boolean;
  waitingForHuman: boolean;
  humanTurn: HumanTurnPromptInfo | null;
  gameState: PokerGameState | null;
  steps: number;
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

  listTables(): Promise<PokerTableInfo[]>;
  getTable(tableId?: string | number): Promise<PokerTableInfo | null>;
  createTable(options?: CreateTableOptions): Promise<PokerTableInfo>;
  getGameState(tableId?: string | number): Promise<PokerGameState | null>;
  getWaitingHumanTurn(tableId?: string | number): Promise<HumanTurnPromptInfo | null>;
  send(type: string, payload?: any, tableId?: string | number, sessionId?: string): Promise<any>;
  step(tableId?: string | number, maxSteps?: number): Promise<DirectStepResult>;
  close(): Promise<void>;
}

/**
 * Resolves or creates a table conversation scoped directly to the host's project and user.
 */
export async function ensureTableConversation(
  host: CuratorHost,
  options: { tableId?: string | number; maxSeats?: number } = {}
): Promise<any> {
  const prisma = host.prisma;
  const projectId = host.project.id;
  const userId = host.user.id;
  const maxSeats = Math.min(6, Math.max(2, options.maxSeats || 4));

  if (options.tableId !== undefined) {
    const targetId = Number(options.tableId);
    if (!Number.isNaN(targetId)) {
      const existing = await prisma.conversation.findFirst({
        where: { id: targetId, projectId },
      });
      if (existing) return existing;
    }
  }

  let conversation = await prisma.conversation.findFirst({
    where: { projectId },
    orderBy: { id: 'asc' },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId,
        projectId,
        metadata: {
          ruleset: 'texas_holdem_nl',
          maxSeats,
        },
      },
    });
  }

  return conversation;
}

async function getTableWorkflowAST(prisma: any): Promise<any> {
  const script =
    (await prisma.script.findUnique({ where: { name: 'poker_lobby' } })) ||
    (await prisma.script.findUnique({ where: { name: 'poker_workflow' } }));
  if (!script?.ast) {
    throw new Error('Script "poker_lobby" (or "poker_workflow") not found or missing compiled AST in database');
  }
  return script.ast;
}

/**
 * Enqueues the declarative Poker Engine AST workflow for a table conversation.
 */
export async function enqueueTableASTRequest(
  host: CuratorHost,
  conversationId: number,
  options: {
    startingChips?: number;
    smallBlind?: number;
    bigBlind?: number;
    maxSeats?: number;
    tableId?: string | number;
  } = {}
): Promise<any> {
  const ast = await getTableWorkflowAST(host.prisma);
  return host.prisma.request.create({
    data: {
      userId: host.user.id,
      projectId: host.project.id,
      conversationId,
      status: 'NEW',
      ast: ast as any,
      context: {
        tableId: String(options.tableId ?? conversationId),
        bypassLobby: true,
        startingChips: options.startingChips || 1000,
        sbAmount: options.smallBlind || 10,
        bbAmount: options.bigBlind || 20,
        maxSeats: options.maxSeats ? Math.min(6, Math.max(2, options.maxSeats)) : 4,
      },
    },
  });
}

/**
 * Creates and initializes the unified PokerGameSession.
 * Provisions the SQLite database, boots CuratorHost, and enqueues the AST root request.
 */
export async function createPokerGameSession(
  host: CuratorHost,
  options: PokerSessionOptions = {}
): Promise<PokerGameSession> {
  const maxSeats = Math.min(6, Math.max(2, options.maxSeats || 4));
  const startingChips = options.startingChips || 1000;
  const smallBlind = options.smallBlind || 10;
  const bigBlind = options.bigBlind || 20;

  const prisma = host.prisma;
  const user = host.user;
  const project = host.project;

  // 1. Ensure initial table conversation scoped to the host project
  const conversation = await ensureTableConversation(host, {
    tableId: options.tableId,
    maxSeats,
  });

  // 2. Resume active request or enqueue declarative AST workflow for table
  let rootRequest = await prisma.request.findFirst({
    where: {
      conversationId: conversation.id,
      status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!rootRequest) {
    rootRequest = await enqueueTableASTRequest(host, conversation.id, {
      startingChips,
      smallBlind,
      bigBlind,
      maxSeats,
      tableId: options.tableId,
    });
    if (!options.quiet) {
      console.log(`\x1b[32m✔ [Poker Session] Table #${conversation.id} initialized with root AST Request #${rootRequest.id}\x1b[0m`);
    }
  } else {
    if (!options.quiet) {
      console.log(`\x1b[32m✔ [Poker Session] Resuming Table #${conversation.id} with active Request #${rootRequest.id}\x1b[0m`);
    }
  }

  const defaultTableId = String(conversation.id);

  const getGameState = async (tableId?: string | number): Promise<PokerGameState | null> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    // Check most recent request context with gameState for this conversation
    const latestReq = await prisma.request.findFirst({
      where: {
        conversationId: targetConvId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const ctx = latestReq?.context as any;
    return ctx?.gameState || ctx?.state?.gameState || null;
  };

  const getWaitingHumanTurn = async (tableId?: string | number): Promise<HumanTurnPromptInfo | null> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    const waitingReq = await prisma.request.findFirst({
      where: {
        conversationId: targetConvId,
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

  const submitHumanSpeech = async (params: {
    text: string;
    speechAct?: string;
    targetId?: string;
    speakerName?: string;
    speakerId?: string;
    tableId?: string | number;
    sessionId?: string;
  }): Promise<any> => {
    const targetConvId = params.tableId !== undefined ? Number(params.tableId) : conversation.id;
    const tool = host.engine.tools.get('poker_human_speech');
    if (!tool) return null;

    const currentGameState = await getGameState(targetConvId);
    const speakerName = params.speakerName || 'You';
    const speakerId = params.speakerId || params.sessionId || 'player-human';

    const result: any = await tool.runAsync({
      args: {
        state: currentGameState,
        speechAct: params.speechAct || 'TABLE_TALK',
        text: params.text || '',
        targetId: params.targetId,
        speakerId,
        speakerName,
      },
      toolContext: { prisma, conversationId: targetConvId },
    });

    host.events.broadcast('poker:speech_response', {
      speaker: speakerName,
      text: params.text,
      speechAct: params.speechAct || 'TABLE_TALK',
      aiReply: result?.aiResponse?.text,
      targetId: params.targetId,
      tableId: String(targetConvId),
      conversationId: targetConvId,
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    });

    return result;
  };

  const send = async (
    eventName: string,
    payload?: any,
    tableId?: string | number,
    sessionId?: string
  ): Promise<any> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    if (eventName === 'poker:speech') {
      return submitHumanSpeech({ ...payload, tableId: targetConvId, sessionId });
    }

    if (eventName === 'poker:pause') {
      return send('poker:human_action', { type: 'PAUSE' }, targetConvId, sessionId);
    }

    if (eventName === 'poker:resume') {
      return send('poker:resume_action', { type: 'RESUME' }, targetConvId, sessionId);
    }

    if (eventName === 'poker:human_action' && payload) {
      if (payload.type === 'RESUME' || payload.type === 'EXIT') {
        const wokenResume = await send('poker:resume_action', payload, targetConvId, sessionId);
        if (wokenResume) return true;
      }
    }

    const waitingReqs = await prisma.request.findMany({
      where: {
        conversationId: targetConvId,
        status: 'WAITING_FOR_EVENT',
      },
    });

    let woken = false;
    for (const req of waitingReqs) {
      const ctx = (req.context as any) || {};
      if (ctx.waitEvent === eventName) {
        const alias = ctx.payloadAlias;
        const updatedContext = { ...ctx };
        delete updatedContext.waitEvent;
        delete updatedContext.payloadAlias;

        if (alias) {
          updatedContext.state = { ...(updatedContext.state || {}), [alias]: payload };
          updatedContext[alias] = payload;
        }

        if (sessionId) {
          updatedContext.sessionId = sessionId;
          if (updatedContext.state) {
            updatedContext.state.sessionId = sessionId;
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
      host.events.broadcast(eventName, {
        payload,
        tableId: String(targetConvId),
        conversationId: targetConvId,
        ...(sessionId ? { sessionId } : {}),
      });
    }
    return woken;
  };

  const createTable = async (tableOpts: CreateTableOptions = {}): Promise<PokerTableInfo> => {
    const tableSeats = Math.min(6, Math.max(2, tableOpts.maxSeats || maxSeats));
    const tableChips = tableOpts.startingChips || startingChips;
    const tableSb = tableOpts.smallBlind || smallBlind;
    const tableBb = tableOpts.bigBlind || bigBlind;

    const existingCount = await prisma.conversation.count({
      where: { projectId: project.id },
    });
    const title = tableOpts.title || `Table #${existingCount + 1}`;

    const newConv = await prisma.conversation.create({
      data: {
        userId: user.id,
        projectId: project.id,
        metadata: {
          tableName: title,
          maxSeats: tableSeats,
          startingChips: tableChips,
          smallBlind: tableSb,
          bigBlind: tableBb,
        },
      },
    });

    await enqueueTableASTRequest(host, newConv.id, {
      startingChips: tableChips,
      smallBlind: tableSb,
      bigBlind: tableBb,
      maxSeats: tableSeats,
    });

    const info: PokerTableInfo = {
      tableId: String(newConv.id),
      conversationId: newConv.id,
      title,
      createdAt: newConv.createdAt,
      gameState: null,
      waitingForHuman: false,
      humanTurn: null,
    };

    host.events.broadcast('poker:table_created', {
      tableId: info.tableId,
      conversationId: info.conversationId,
      title: info.title,
    });

    return info;
  };

  const listTables = async (): Promise<PokerTableInfo[]> => {
    const convs = await prisma.conversation.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' },
    });

    const list: PokerTableInfo[] = [];
    for (const c of convs) {
      const gState = await getGameState(c.id);
      const waiting = await getWaitingHumanTurn(c.id);
      const meta = (c.metadata as any) || {};
      const latestReq = await prisma.request.findFirst({
        where: { conversationId: c.id },
        orderBy: { updatedAt: 'desc' },
      });
      const isPaused = latestReq?.status === 'PAUSED' || (latestReq?.context as any)?.isPaused === true;
      list.push({
        tableId: String(c.id),
        conversationId: c.id,
        title: meta.tableName || c.title || `Table #${c.id}`,
        createdAt: c.createdAt,
        status: isPaused ? 'PAUSED' : (latestReq?.status || 'ACTIVE'),
        gameState: gState,
        waitingForHuman: waiting !== null,
        humanTurn: waiting,
      });
    }
    return list;
  };

  const getTable = async (tableId?: string | number): Promise<PokerTableInfo | null> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;
    const c = await prisma.conversation.findUnique({
      where: { id: targetConvId },
    });
    if (!c) return null;
    const gState = await getGameState(c.id);
    const waiting = await getWaitingHumanTurn(c.id);
    const meta = (c.metadata as any) || {};
    return {
      tableId: String(c.id),
      conversationId: c.id,
      title: meta.tableName || c.title || `Table #${c.id}`,
      createdAt: c.createdAt,
      gameState: gState,
      waitingForHuman: waiting !== null,
      humanTurn: waiting,
    };
  };

  /**
   * Advances the Curator RequestProcessor synchronously step-by-step
   * until a human turn gate is reached (waiting for 'poker:human_action')
   * or the tournament finishes. Direct in-process execution from state A to state B.
   */
  const step = async (
    tableId?: string | number,
    maxSteps: number = 500
  ): Promise<DirectStepResult> => {
    let steps = 0;
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    while (steps < maxSteps) {
      const waiting = await getWaitingHumanTurn(targetConvId);
      if (waiting) {
        if (!options.quiet) {
          console.log(`\x1b[32m✔ [Curator Engine] Action required from ${waiting.name} (chips: $${waiting.chips}, to call: $${waiting.toCall})\x1b[0m`);
        }
        return {
          done: false,
          waitingForHuman: true,
          humanTurn: waiting,
          gameState: await getGameState(targetConvId),
          steps,
        };
      }

      // Check for any waiting event gate (poker:lobby_choice, poker:table_selected, etc.)
      const anyWaitingReq = await prisma.request.findFirst({
        where: {
          conversationId: targetConvId,
          status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER', 'PAUSED'] },
        },
        orderBy: { updatedAt: 'desc' },
      });

      if (anyWaitingReq) {
        const ctx = (anyWaitingReq.context as any) || {};
        if (ctx.waitEvent && ctx.waitEvent !== 'poker:human_action') {
          return {
            done: false,
            waitingForHuman: true,
            humanTurn: null,
            gameState: await getGameState(targetConvId),
            steps,
          };
        }
      }

      if (!options.quiet && steps === 0) {
        console.log(`\x1b[90m[Curator Engine] Stepping AST workflow on Table #${targetConvId}...\x1b[0m`);
      }

      const processed = await host.processor.step({ conversationId: targetConvId });
      if (processed === 0) {
        const waitingAfter = await getWaitingHumanTurn(targetConvId);
        const gameState = await getGameState(targetConvId);
        if (waitingAfter) {
          if (!options.quiet) {
            console.log(`\x1b[32m✔ [Curator Engine] Action required from ${waitingAfter.name} (chips: $${waitingAfter.chips}, to call: $${waitingAfter.toCall})\x1b[0m`);
          }
          return {
            done: false,
            waitingForHuman: true,
            humanTurn: waitingAfter,
            gameState,
            steps,
          };
        }
        const anyWaitingAfter = await prisma.request.findFirst({
          where: {
            conversationId: targetConvId,
            status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER', 'PAUSED'] },
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (anyWaitingAfter) {
          return {
            done: false,
            waitingForHuman: true,
            humanTurn: null,
            gameState,
            steps,
          };
        }
        return {
          done: Boolean(gameState?.gameOver),
          waitingForHuman: false,
          humanTurn: null,
          gameState,
          steps,
        };
      }
      steps++;
    }

    const gameState = await getGameState(targetConvId);
    return {
      done: Boolean(gameState?.gameOver),
      waitingForHuman: false,
      humanTurn: null,
      gameState,
      steps,
    };
  };





  const close = async (): Promise<void> => {
    // Session cleanup hook
  };

  return {
    tableId: defaultTableId,
    prisma,
    host,
    processor: host.processor,
    conversation,
    project,
    user,
    rootRequestId: rootRequest.id,
    listTables,
    getTable,
    createTable,
    getGameState,
    getWaitingHumanTurn,
    send,
    step,
    close,
  };
}
