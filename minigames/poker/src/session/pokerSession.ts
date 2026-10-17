import { seedPokerDatabase } from '../db/seed.ts';
import { createPokerHost } from '../host.ts';
import type { CuratorHost } from '../curatorHost.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';

export interface PokerSessionOptions {
  databasePath?: string;
  forceReset?: boolean;
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
  submitHumanAction(action: PlayerAction, tableId?: string | number, sessionId?: string): Promise<boolean>;
  submitHumanSpeech(params: { text: string; speechAct?: string; targetId?: string; tableId?: string | number; sessionId?: string }): Promise<any>;
  stepUntilHumanTurn(tableId?: string | number, maxSteps?: number): Promise<DirectStepResult>;
  submitHumanActionAndStep(action: PlayerAction, tableId?: string | number, sessionId?: string, maxSteps?: number): Promise<DirectStepResult>;
  close(): Promise<void>;
}

export interface InitialTableContext {
  user: any;
  project: any;
  conversation: any;
}

/**
 * Resolves the primary user, project, and initial table conversation,
 * creating the conversation if it does not yet exist.
 */
export async function ensureInitialTableConversation(
  prisma: any,
  options: { maxSeats?: number } = {}
): Promise<InitialTableContext> {
  const maxSeats = Math.min(6, Math.max(2, options.maxSeats || 4));

  let user = await prisma.user.findFirst({
    where: { OR: [{ id: 'hero-user-1' }, { email: 'hero@tabletop.local' }] },
  });
  if (!user) {
    user = await prisma.user.findFirst();
  }

  let project = await prisma.project.findFirst({
    where: { OR: [{ id: 'poker-project-1' }, { name: 'Texas Holdem Lounge' }] },
  });
  if (!project) {
    project = await prisma.project.findFirst();
  }

  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        projectId: project.id,
        metadata: {
          ruleset: 'texas_holdem_nl',
          maxSeats,
        },
      },
    });
  }

  return { user, project, conversation };
}

async function getTableWorkflowAST(prisma: any): Promise<any> {
  const script = await prisma.script.findUnique({ where: { name: 'poker_workflow' } });
  if (!script?.ast) {
    throw new Error('Script "poker_workflow" not found or missing compiled AST in database');
  }
  return script.ast;
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

  if (!options.quiet) {
    console.log(`\x1b[90m[Poker Session] Booting CuratorHost runtime (interval: ${options.intervalMs ?? 500}ms)...\x1b[0m`);
  }

  // 1. Instantiate CuratorHost (provisions SQLite and seeds tools, scripts, and agents idempotently)
  const host = await createPokerHost({
    databasePath: options.databasePath,
    forceReset: options.forceReset ?? false,
    quiet: options.quiet ?? false,
    intervalMs: options.intervalMs ?? 500,
  });

  const prisma = host.prisma;

  // 2. Ensure initial table conversation, user, and project scoping
  const { user, project, conversation } = await ensureInitialTableConversation(prisma, { maxSeats });

  // 3. Compile and enqueue the declarative Poker Engine AST workflow for initial table if not active
  let rootRequest = await prisma.request.findFirst({
    where: {
      conversationId: conversation.id,
      status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!rootRequest) {
    const workflowAst = await getTableWorkflowAST(prisma);
    rootRequest = await prisma.request.create({
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

    // 1. Check most recent request context with gameState for this conversation
    const latestReq = await prisma.request.findFirst({
      where: {
        conversationId: targetConvId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const ctx = latestReq?.context as any;
    if (ctx?.gameState) return ctx.gameState;
    if (ctx?.state?.gameState) return ctx.state.gameState;

    // 2. Check conversation metadata / state
    const conv = await prisma.conversation.findUnique({
      where: { id: targetConvId },
    });
    const cMeta = conv?.metadata as any;
    if (cMeta?.gameState) return cMeta.gameState;
    const cState = (conv as any)?.state as any;
    if (cState?.gameState) return cState.gameState;

    return null;
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

  const submitHumanAction = async (action: PlayerAction, tableId?: string | number, sessionId?: string): Promise<boolean> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    const waitingReqs = await prisma.request.findMany({
      where: {
        conversationId: targetConvId,
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
      host.events.broadcast('poker:human_action', {
        ...action,
        tableId: String(targetConvId),
        conversationId: targetConvId,
        ...(sessionId ? { sessionId } : {}),
      });
    }
    return woken;
  };

  const submitHumanSpeech = async (params: { text: string; speechAct?: string; targetId?: string; tableId?: string | number; sessionId?: string }): Promise<any> => {
    const targetConvId = params.tableId !== undefined ? Number(params.tableId) : conversation.id;
    const tool = host.engine.tools.get('poker_human_speech');
    if (!tool) return null;

    const heroUser = await prisma.user.findFirst({ where: { email: 'hero@tabletop.local' } });
    const currentGameState = await getGameState(targetConvId);

    const result: any = await tool.runAsync({
      args: {
        state: currentGameState,
        speechAct: params.speechAct || 'TABLE_TALK',
        text: params.text || '',
        targetId: params.targetId,
        speakerId: heroUser?.id || 'hero',
        speakerName: heroUser?.name || 'You',
      },
      toolContext: { prisma, conversationId: targetConvId },
    });

    host.events.broadcast('poker:speech_response', {
      speaker: heroUser?.name || 'You',
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

    const ast = await getTableWorkflowAST(prisma);
    await prisma.request.create({
      data: {
        userId: user.id,
        projectId: project.id,
        conversationId: newConv.id,
        status: 'NEW',
        ast: ast as any,
        context: {
          tableId: String(newConv.id),
          startingChips: tableChips,
          sbAmount: tableSb,
          bbAmount: tableBb,
          maxSeats: tableSeats,
        },
      },
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
      list.push({
        tableId: String(c.id),
        conversationId: c.id,
        title: meta.tableName || c.title || `Table #${c.id}`,
        createdAt: c.createdAt,
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
  const stepUntilHumanTurn = async (
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

  const submitHumanActionAndStep = async (
    action: PlayerAction,
    tableId?: string | number,
    sessionId?: string,
    maxSteps: number = 500
  ): Promise<DirectStepResult> => {
    await submitHumanAction(action, tableId, sessionId);
    return stepUntilHumanTurn(tableId, maxSteps);
  };

  const close = async (): Promise<void> => {
    await host.stop();
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
    submitHumanAction,
    submitHumanSpeech,
    stepUntilHumanTurn,
    submitHumanActionAndStep,
    close,
  };
}
