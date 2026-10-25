import {
  stepInteractiveConversation,
  getWaitingChoice,
  type CuratorHost,
} from '../curatorHost.ts';
import { AgentRoleService } from '../curator.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';
import {
  PokerEvent,
  PokerRole,
  PokerActionType,
  PokerStreet,
  PokerTool,
  PokerModule,
  DEFAULT_LOBBY_CHOICES,
  DEFAULT_LOBBY_OPTIONS,
} from '../models/index.ts';
import { formatTableChoices } from './pokerEngine.ts';

export interface PokerSessionOptions {
  databasePath?: string;
  forceReset?: boolean;
  tableId?: string | number;
  maxSeats?: number;
  startingChips?: number;
  sbAmount?: number;
  bbAmount?: number;
  smallBlind?: number;
  bigBlind?: number;
  verbose?: boolean;
  quiet?: boolean;
  intervalMs?: number;
  playerName?: string;
  playerId?: string;
  resetLight?: boolean;
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

export type PlayerTurnPromptInfo = HumanTurnPromptInfo;

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
  getWaitingTurn?(tableId?: string | number): Promise<PlayerTurnPromptInfo | null>;
  getWaitingHumanTurn(tableId?: string | number): Promise<HumanTurnPromptInfo | null>;
  getActors?(tableId?: string | number): Promise<CuratorActor[]>;
  resetLight?(): Promise<any>;
  runTool(toolName: string, args?: Record<string, any>, tableId?: string | number, sessionId?: string): Promise<any>;
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

import { resetPokerDatabaseLight, type ResetLightResult } from '../db/lightReset.ts';
import {
  pokerWorkflowAst,
  pokerLobbyAst,
  humanTurnAst,
  agentTurnAst,
  pokerActionAst,
  ambientReactionAst,
  POKER_WORKFLOW_ASTS,
} from '../workflows/index.ts';
export { resetPokerDatabaseLight, type ResetLightResult, POKER_WORKFLOW_ASTS };

export async function getScriptAST(prisma: any, scriptName: string): Promise<any> {
  if (POKER_WORKFLOW_ASTS[scriptName]) {
    return POKER_WORKFLOW_ASTS[scriptName];
  }
  const script = await prisma?.script?.findUnique?.({ where: { name: scriptName } });
  if (script?.ast) return script.ast;
  return scriptName === PokerModule.LOBBY ? pokerLobbyAst : pokerWorkflowAst;
}

export async function getTableWorkflowAST(prisma: any): Promise<any> {
  return getScriptAST(prisma, PokerModule.WORKFLOW);
}

export async function getLobbyWorkflowAST(prisma: any): Promise<any> {
  return getScriptAST(prisma, PokerModule.LOBBY);
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
    playerName?: string;
    bypassLobby?: boolean;
    scriptName?: string;
  } = {}
): Promise<any> {
  const bypassLobby = options.bypassLobby ?? (options.tableId !== undefined);
  const targetScript = options.scriptName || PokerModule.WORKFLOW;
  const ast = await getScriptAST(host.prisma, targetScript);
  return host.prisma.request.create({
    data: {
      userId: host.user.id,
      projectId: host.project.id,
      conversationId,
      status: 'NEW',
      ast: ast as any,
      context: {
        ...(options.tableId !== undefined ? { tableId: String(options.tableId) } : {}),
        bypassLobby,
        playerName: options.playerName || 'You',
        startingChips: options.startingChips || 1000,
        sbAmount: options.smallBlind || 10,
        bbAmount: options.bigBlind || 20,
        maxSeats: options.maxSeats ? Math.min(6, Math.max(2, options.maxSeats)) : 4,
      },
    },
  });
}

export interface CuratorActor {
  id: string;
  kind: 'user' | 'agent';
  name: string;
  roles: string[];
  isHuman: boolean;
  persona?: string;
  instruction?: string;
  chips?: number;
  seatIdx?: number;
  status?: string;
  capabilities: string[];
}

export async function ensureHumanActorInDatabase(
  host: CuratorHost,
  conversationId: number,
  options: { playerName?: string; playerId?: string } = {}
): Promise<any> {
  const prisma = host.prisma;
  const playerName = (options.playerName || host.user?.name || 'You').trim();
  const playerSlug = playerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'hero';
  const playerId = options.playerId || (playerSlug === 'you' || playerSlug === 'system' ? (host.user?.id || 'player') : `user_${playerSlug}`);
  const playerEmail = `${playerSlug}@local.curator`;

  // 1. Ensure User entity in DB
  let user: any = null;
  try {
    user = await prisma.user.findFirst({
      where: {
        OR: [{ id: playerId }, { email: playerEmail }, { name: playerName }],
      },
    });

    if (user) {
      if (user.name !== playerName) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name: playerName },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          id: playerId,
          name: playerName,
          email: playerEmail,
        },
      });
    }
  } catch (_) {
    user = host.user;
  }

  // 2. Assign poker roles to the human user under the active poker project (e.g. 'poker-project-1')
  const targetProjectId = host.project?.id || 'poker-project-1';
  const humanRoles = [PokerRole.PLAYER, PokerRole.SPECTATOR];
  for (const roleName of humanRoles) {
    try {
      if (typeof host.assignUserProjectRole === 'function') {
        await host.assignUserProjectRole(user.id, roleName, targetProjectId);
      } else {
        await prisma.userRole.upsert({
          where: {
            userId_roleId_projectId: {
              userId: user.id,
              roleId: roleName,
              projectId: targetProjectId,
            },
          },
          create: {
            userId: user.id,
            roleId: roleName,
            projectId: targetProjectId,
          },
          update: {},
        });
      }
    } catch (_) {}
  }

  // 3. Register human actor as active participant in Conversation metadata
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (conv) {
      const meta = typeof conv.metadata === 'object' && conv.metadata ? conv.metadata : {};
      const existingParticipants = Array.isArray(meta.participants) ? meta.participants : [];
      const existingIdx = existingParticipants.findIndex((p: any) => p.id === playerId || (user && p.id === user.id));
      if (existingIdx >= 0) {
        existingParticipants[existingIdx].name = playerName;
      } else {
        existingParticipants.push({
          id: user?.id || playerId,
          name: playerName,
          kind: 'user',
          isHuman: true,
          role: 'player',
          roles: humanRoles,
        });
      }
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { metadata: { ...meta, participants: existingParticipants } },
      });
    }
  } catch (_) {}

  return user;
}

export async function getConversationActors(
  host: CuratorHost,
  conversationId: number | string
): Promise<CuratorActor[]> {
  const prisma = host.prisma;
  const convIdNum = Number(conversationId);

  // 1. Fetch Conversation from DB
  let conv: any = null;
  try {
    conv = await prisma.conversation.findUnique({
      where: { id: convIdNum },
      include: { project: true },
    });
  } catch (_) {}

  const actors: CuratorActor[] = [];

  // 2. Resolve Human User Actor (from prisma.user)
  let user: any = null;
  if (conv?.userId) {
    try {
      user = await prisma.user.findUnique({ where: { id: conv.userId } });
    } catch (_) {}
  }
  if (!user) user = host.user;

  actors.push({
    id: user?.id || host.user?.id || 'player',
    kind: 'user',
    name: user?.name || host.user?.name || 'You',
    roles: [PokerRole.PLAYER, PokerRole.SPECTATOR],
    isHuman: true,
    persona: 'human',
    status: 'ACTIVE',
    capabilities: ['table_action', 'speech', 'whisper'],
  });

  // 3. Resolve Project / Conversation Agent Actors (from prisma.agent)
  const projectId = conv?.projectId || host.project?.id;
  let dbAgents: any[] = [];
  try {
    dbAgents = await prisma.agent.findMany({
      where: { OR: [{ projectId }, { existent: true }] },
      include: {
        roles: { include: { role: true } },
        script: true,
      },
      orderBy: { id: 'asc' },
    });
  } catch (_) {}

  // 4. Merge with live gameState.players if table is seated
  let gameState: PokerGameState | null = null;
  try {
    const latestReq = await prisma.request.findFirst({
      where: { conversationId: convIdNum },
      orderBy: { id: 'desc' },
      select: { context: true },
    });
    if (latestReq?.context?.gameState) {
      gameState = latestReq.context.gameState as PokerGameState;
    }
  } catch (_) {}

  const seatedMap = new Map((gameState?.players || []).map((p: any) => [p.id.toLowerCase(), p]));

  for (const agent of dbAgents) {
    if (agent.id === user?.id || agent.id === host.user?.id) continue;
    const roleNames = agent.roles?.map((r: any) => r.role?.name || r.roleId) || [];
    const pluginDef = (host.engine?.agents?.get(agent.id) as any) || {};
    const seated = seatedMap.get(agent.id.toLowerCase());

    const isLobby = agent.id === 'lobby';
    const isDealer = roleNames.includes(PokerRole.DEALER) || agent.id === 'dealer';

    let status = 'LOUNGE';
    if (isLobby) status = 'LOBBY_CONCIERGE';
    else if (isDealer) status = 'DEALER';
    else if (seated) status = seated.folded ? 'FOLDED' : (seated.allIn ? 'ALL_IN' : 'SEATED');

    let capabilities = ['table_action', 'speech', 'whisper'];
    if (isLobby) capabilities = ['lobby_guidance', 'table_matching', 'speech', 'whisper'];
    else if (isDealer) capabilities = ['deal_cards', 'manage_pots', 'speech', 'rules_inquiry'];

    actors.push({
      id: agent.id,
      kind: 'agent',
      name: seated?.name || agent.name,
      roles: roleNames,
      isHuman: false,
      persona: pluginDef.persona || (isLobby ? 'concierge' : (isDealer ? 'dealer' : 'player')),
      instruction: pluginDef.instruction || agent.script?.body || '',
      chips: seated?.chips,
      seatIdx: seated?.seatIdx,
      status,
      capabilities,
    });
  }

  return actors;
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
  const smallBlind = options.sbAmount ?? options.smallBlind ?? 10;
  const bigBlind = options.bbAmount ?? options.bigBlind ?? 20;

  const prisma = host.prisma;
  const user = host.user;
  const project = host.project;

  // 0. Optional light reset: wipe conversations, requests, and responses before bootstrapping
  if (options.resetLight) {
    await resetPokerDatabaseLight(prisma, { quiet: options.quiet });
  }

  // 1. Ensure initial table conversation scoped to the host project
  const conversation = await ensureTableConversation(host, {
    tableId: options.tableId,
    maxSeats,
  });

  // 1b. Ensure human user actor exists in database with roles and conversation participant metadata
  await ensureHumanActorInDatabase(host, conversation.id, {
    playerName: options.playerName,
    playerId: options.playerId || host.user?.id || 'player',
  });

  // 2. Resume active request only if a specific table was targeted.
  // When launching default session (no --table), enter the interactive lobby flow.
  let rootRequest: any = null;
  if (options.tableId !== undefined) {
    rootRequest = await prisma.request.findFirst({
      where: {
        conversationId: conversation.id,
        status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!rootRequest) {
    // Cancel any stale/hung requests on the conversation to start fresh
    await prisma.request.updateMany({
      where: {
        conversationId: conversation.id,
        status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT'] },
      },
      data: { status: 'CANCELLED' },
    });

    rootRequest = await enqueueTableASTRequest(host, conversation.id, {
      startingChips,
      smallBlind,
      bigBlind,
      maxSeats,
      tableId: options.tableId,
      playerName: options.playerName,
      bypassLobby: options.tableId !== undefined,
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
    const choiceInfo = await getWaitingChoice(prisma, targetConvId);
    if (!choiceInfo) return null;

    const gameState = choiceInfo.context?.gameState;
    if (!gameState || !Array.isArray(gameState.players) || gameState.players.length === 0) {
      return null;
    }
    const activePlayer = gameState.players[gameState.activePlayerIdx];

    return {
      requestId: choiceInfo.requestId,
      player: activePlayer?.id || user?.id || host.user?.id || 'player',
      name: activePlayer?.name || user?.name || host.user?.name || 'You',
      chips: activePlayer?.chips ?? 0,
      pot: gameState?.pot ?? 0,
      toCall: (gameState?.currentBet ?? 0) - (activePlayer?.streetBet ?? 0),
      street: gameState?.currentStreet || PokerStreet.PREFLOP,
      choices: choiceInfo.choices,
    };
  };

  const runTool = async (
    toolName: string,
    args: Record<string, any> = {},
    tableId?: string | number,
    sessionId?: string
  ): Promise<any> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;
    if (!host.engine.tools.get(toolName)) {
      console.warn(`[PokerSession] Tool "${toolName}" not found on engine.`);
      return null;
    }

    const currentGameState = await getGameState(targetConvId);
    const run = await host.runTool(toolName, args, {
      conversationId: targetConvId,
      origin: 'REPL' as const,
      context: sessionId ? { sessionId } : undefined,
      runtimeArgs: { state: currentGameState },
      runtimeContext: { state: currentGameState },
      broadcastToolEvents: false, // broadcast below with table scoping
    });

    if (run.status === 'WAITING_FOR_USER') return run.record;
    const result: any = run.result;

    if (result && typeof result === 'object' && result.event) {
      const evtName = typeof result.event === 'string' ? result.event : result.event.name;
      const evtPayload = result.event.payload !== undefined ? result.event.payload : result;
      host.events.broadcast(evtName, {
        tableId: String(targetConvId),
        conversationId: targetConvId,
        ...(typeof evtPayload === 'object' ? evtPayload : { data: evtPayload }),
      });
    }

    return result;
  };

  const send = async (
    eventName: string,
    payload?: any,
    tableId?: string | number,
    sessionId?: string
  ): Promise<any> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    // 1. Native Table Speech / Whispers
    if (eventName === PokerEvent.SPEECH) {
      const speakerName = payload?.speakerName || user?.name || host.user?.name || 'You';
      const speakerId = payload?.speakerId || sessionId || user?.id || host.user?.id || 'player';
      const speechAct = payload?.speechAct || payload?.args?.speechAct || (payload?.targetId ? 'WHISPER' : 'TABLE_TALK');
      const text = payload?.text || payload?.args?.text || '';
      const targetId = payload?.targetId || payload?.args?.targetId;

      const speechPayload = {
        speaker: speakerName,
        speakerName,
        speakerId,
        text,
        speechAct,
        targetId,
        tableId: String(targetConvId),
        conversationId: targetConvId,
        ...(sessionId ? { sessionId } : {}),
      };

      // Poker speech is an event: emit into Curator engine to spawn subscriptions (ambient reaction)
      await host.emitEvent(PokerEvent.SPEECH, speechPayload, {
        conversationId: targetConvId,
        origin: 'REPL',
        broadcast: true,
        contextPatch: sessionId ? { sessionId } : undefined,
      });

      host.events.broadcast(PokerEvent.SPEECH_RESPONSE, speechPayload);
      return speechPayload;
    }

    // 2. Compatibility: If a tool call was dispatched over event transport, delegate directly to runTool
    if (eventName === 'curator:tool_call' || eventName === PokerEvent.TOOL_CALL) {
      return runTool(payload?.tool || payload?.name, payload?.args || {}, targetConvId, sessionId);
    }

    // 3. Emit as a Request: the core matcher spawns subscriptions and resumes matching waits.
    //    Poker adds its event families on top of exact `waitEvent` matching.
    const choiceFamily = new Set<string>([PokerEvent.HUMAN_ACTION, PokerEvent.LOBBY_CHOICE, PokerEvent.TABLE_SELECTED]);
    const emitted = await host.emitEvent(eventName, payload, {
      conversationId: targetConvId,
      origin: 'REPL',
      broadcast: false, // broadcast below with table scoping, only when something was resumed
      matchWait: (waitEvent, evt, p) =>
        evt === 'curator:choice' ||
        (waitEvent === 'curator:choice' && choiceFamily.has(evt)) ||
        (waitEvent === PokerEvent.RESUME_ACTION && evt === PokerEvent.HUMAN_ACTION && (p?.type === PokerActionType.RESUME || p?.type === PokerActionType.EXIT)),
      waitValue: (p) => (p?.choice !== undefined ? p.choice : p),
      contextPatch: sessionId ? { sessionId } : undefined,
    });
    const woken = emitted.woken.length > 0;

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

  const resetLight = async (): Promise<any> => {
    const res = await resetPokerDatabaseLight(prisma, { quiet: false });
    const newConv = await ensureTableConversation(host, { maxSeats });
    await enqueueTableASTRequest(host, newConv.id, {
      startingChips,
      smallBlind,
      bigBlind,
      maxSeats,
      bypassLobby: false,
    });
    host.events.broadcast(PokerEvent.LOBBY_PROMPT, {
      options: DEFAULT_LOBBY_OPTIONS,
      choices: DEFAULT_LOBBY_CHOICES,
    });
    return res;
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

    host.events.broadcast(PokerEvent.TABLE_CREATED, {
      tableId: info.tableId,
      conversationId: info.conversationId,
      title: info.title,
    });

    return info;
  };

  const resolveTableInfo = async (c: any): Promise<PokerTableInfo> => {
    const gState = await getGameState(c.id);
    const waiting = await getWaitingHumanTurn(c.id);
    const meta = (c.metadata as any) || {};
    const latestReq = await prisma.request.findFirst({
      where: { conversationId: c.id },
      orderBy: { updatedAt: 'desc' },
    });
    const isPaused = latestReq?.status === 'PAUSED' || (latestReq?.context as any)?.isPaused === true;
    return {
      tableId: String(c.id),
      conversationId: c.id,
      title: meta.tableName || c.title || `Table #${c.id}`,
      createdAt: c.createdAt,
      status: isPaused ? 'PAUSED' : (latestReq?.status || 'ACTIVE'),
      gameState: gState,
      waitingForHuman: waiting !== null,
      humanTurn: waiting,
    };
  };

  const listTables = async (): Promise<PokerTableInfo[]> => {
    const convs = await prisma.conversation.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' },
    });

    const list: PokerTableInfo[] = [];
    for (const c of convs) {
      list.push(await resolveTableInfo(c));
    }
    return list;
  };

  const getTable = async (tableId?: string | number): Promise<PokerTableInfo | null> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;
    const c = await prisma.conversation.findUnique({
      where: { id: targetConvId },
    });
    if (!c) return null;
    return resolveTableInfo(c);
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
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    if (!options.quiet) {
      const currentGState = await getGameState(targetConvId);
      if (currentGState) {
        console.log(`\x1b[90m[Curator Engine] Stepping AST workflow on Table #${targetConvId}...\x1b[0m`);
      } else {
        console.log(`\x1b[90m[Curator Engine] Stepping Poker Lobby AST workflow...\x1b[0m`);
      }
    }

    const stepRes = await stepInteractiveConversation(host, targetConvId, maxSteps);
    const humanTurn = await getWaitingHumanTurn(targetConvId);
    const gameState = await getGameState(targetConvId);

    if (humanTurn && !options.quiet) {
      console.log(`\x1b[32m✔ [Curator Engine] Action required from ${humanTurn.name} (chips: $${humanTurn.chips}, to call: $${humanTurn.toCall})\x1b[0m`);
    }

    return {
      done: stepRes.done || Boolean(gameState?.gameOver),
      waitingForHuman: stepRes.waiting,
      humanTurn,
      gameState,
      steps: stepRes.steps,
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
    getWaitingTurn: getWaitingHumanTurn,
    getWaitingHumanTurn,
    getActors: (convId?: string | number) => getConversationActors(host, convId !== undefined ? convId : conversation.id),
    send,
    step,
    runTool,
    resetLight,
    close,
  };
}
