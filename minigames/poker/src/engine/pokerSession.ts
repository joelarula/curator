import type { CuratorHost } from '../curatorHost.ts';
import { AgentRoleService } from '../curator.ts';
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
  playerName?: string;
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
  getActors?(tableId?: string | number): Promise<CuratorActor[]>;
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
export { resetPokerDatabaseLight, type ResetLightResult };

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
    playerName?: string;
    bypassLobby?: boolean;
  } = {}
): Promise<any> {
  const ast = await getTableWorkflowAST(host.prisma);
  const bypassLobby = options.bypassLobby ?? (options.tableId !== undefined);
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
  const playerId = options.playerId || 'hero';
  const playerName = options.playerName || 'You (Hero)';

  // 1. Ensure User entity in DB
  let user: any = null;
  try {
    user = await prisma.user.upsert({
      where: { id: playerId },
      create: {
        id: playerId,
        name: playerName,
        email: `${playerId}@local.curator`,
      },
      update: {
        name: playerName,
      },
    });
  } catch (_) {
    user = host.user;
  }

  // 2. Assign poker roles to the human user under the active poker project (e.g. 'poker-project-1')
  const targetProjectId = host.project?.id || 'poker-project-1';
  for (const roleName of ['poker:player', 'poker:spectator']) {
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
      if (!existingParticipants.some((p: any) => p.id === playerId)) {
        existingParticipants.push({
          id: playerId,
          name: playerName,
          kind: 'user',
          isHuman: true,
          role: 'player',
          roles: ['poker:player', 'poker:spectator'],
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { metadata: { ...meta, participants: existingParticipants } },
        });
      }
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
    id: user?.id || 'hero',
    kind: 'user',
    name: user?.name || 'You (Hero)',
    roles: ['poker:player', 'poker:spectator'],
    isHuman: true,
    persona: 'human',
    status: 'ACTIVE',
    capabilities: ['table_action', 'TABLE_TALK', 'WHISPER', 'BANTER'],
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
    if (agent.id === 'hero' || agent.id === user?.id) continue;
    const roleNames = agent.roles?.map((r: any) => r.role?.name || r.roleId) || [];
    const pluginDef = (host.engine?.agents?.get(agent.id) as any) || {};
    const seated = seatedMap.get(agent.id.toLowerCase());

    const isLobby = agent.id === 'lobby';
    const isDealer = roleNames.includes('poker:dealer') || agent.id === 'dealer';

    let status = 'LOUNGE';
    if (isLobby) status = 'LOBBY_CONCIERGE';
    else if (isDealer) status = 'DEALER';
    else if (seated) status = seated.folded ? 'FOLDED' : (seated.allIn ? 'ALL_IN' : 'SEATED');

    let capabilities = ['table_action', 'TABLE_TALK', 'WHISPER', 'BANTER'];
    if (isLobby) capabilities = ['lobby_guidance', 'table_matching', 'TABLE_TALK', 'WHISPER'];
    else if (isDealer) capabilities = ['deal_cards', 'manage_pots', 'TABLE_TALK', 'rules_inquiry'];

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
  const smallBlind = options.smallBlind || 10;
  const bigBlind = options.bigBlind || 20;

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
    playerId: 'hero',
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

    const waitingReq = await prisma.request.findFirst({
      where: {
        conversationId: targetConvId,
        status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER'] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!waitingReq) return null;
    const ctx = (waitingReq.context as any) || {};
    const ast = waitingReq.ast as any;
    const isHumanTurn =
      ctx.waitEvent === 'poker:human_action' ||
      ctx.waitEvent === 'curator:choice' ||
      ast?.type === 'Curator_HumanInput';
    if (!isHumanTurn) return null;

    const choicesInfo = ctx.activeChoices || ctx.poker_get_choices?.choices || ctx.poker_get_choices || [];
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
      choices: Array.isArray(choicesInfo) ? choicesInfo : (choicesInfo.choices || []),
    };
  };

  const send = async (
    eventName: string,
    payload?: any,
    tableId?: string | number,
    sessionId?: string
  ): Promise<any> => {
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    if (eventName === 'poker:speech') {
      const tool = host.engine.tools.get('poker_human_speech');
      if (!tool) return null;

      const currentGameState = await getGameState(targetConvId);
      const speakerName = payload?.speakerName || 'You';
      const speakerId = payload?.speakerId || sessionId || 'player-human';

      const actorUserId = payload?.userId || host.user?.id;
      const actorAgentId = payload?.agentId;
      const actorProjectId = payload?.projectId || host.project?.id || conversation?.projectId;
      const access = await AgentRoleService.validateActorToolAccess(
        prisma,
        { userId: actorUserId, agentId: actorAgentId, projectId: actorProjectId },
        tool.name,
        {
          name: tool.name,
          requiredRole: (tool as any).requiredRole,
          accessLevel: (tool as any).accessLevel,
        }
      );
      if (!access.allowed) {
        console.warn(`[PokerSession] Speech tool access blocked: ${access.reason}`);
        throw new Error(access.reason);
      }

      const speechAct = payload?.speechAct || payload?.args?.speechAct || 'TABLE_TALK';
      const text = payload?.text || payload?.args?.text || '';
      const targetId = payload?.targetId || payload?.args?.targetId;

      const result: any = await tool.runAsync({
        args: {
          state: currentGameState,
          speechAct,
          text,
          targetId,
          speakerId,
          speakerName,
        },
        toolContext: { prisma, host, conversationId: targetConvId, userId: actorUserId, agentId: actorAgentId, projectId: actorProjectId },
      });

      host.events.broadcast('poker:speech_response', {
        speaker: speakerName,
        text,
        speechAct,
        aiSpeaker: result?.aiResponse?.speakerName,
        aiReply: result?.aiResponse?.text,
        targetId,
        tableId: String(targetConvId),
        conversationId: targetConvId,
        ...(sessionId ? { sessionId } : {}),
      });

      return result;
    }

    if (eventName === 'curator:tool_call' || eventName === 'poker:tool_call') {
      const toolName = payload?.tool || payload?.name;
      const tool = host.engine.tools.get(toolName);
      if (!tool) {
        console.warn(`[PokerSession] Tool "${toolName}" not found on engine.`);
        return null;
      }

      const actorUserId = payload?.userId || host.user?.id;
      const actorAgentId = payload?.agentId;
      const actorProjectId = payload?.projectId || host.project?.id || conversation?.projectId;
      const access = await AgentRoleService.validateActorToolAccess(
        prisma,
        { userId: actorUserId, agentId: actorAgentId, projectId: actorProjectId },
        tool.name,
        {
          name: tool.name,
          requiredRole: (tool as any).requiredRole,
          accessLevel: (tool as any).accessLevel,
        }
      );
      if (!access.allowed) {
        console.warn(`[PokerSession] Tool access blocked: ${access.reason}`);
        throw new Error(access.reason);
      }

      const currentGameState = await getGameState(targetConvId);
      const result: any = await tool.runAsync({
        args: { state: currentGameState, ...(payload?.args || {}) },
        toolContext: { prisma, host, conversationId: targetConvId, state: currentGameState, userId: actorUserId, agentId: actorAgentId, projectId: actorProjectId },
      });
      return result;
    }

    // 2. Normalize canonical event names and payloads
    let targetEvent = eventName;
    let targetPayload = payload;

    if (eventName === 'poker:pause') {
      targetEvent = 'poker:human_action';
      targetPayload = { type: 'PAUSE' };
    } else if (eventName === 'poker:resume') {
      targetEvent = 'poker:resume_action';
      targetPayload = { type: 'RESUME' };
    } else if (eventName === 'poker:get_actors') {
      const actors = await getConversationActors(host, targetConvId);
      return { actors };
    } else if (eventName === 'poker:list_tables') {
      const tables = await listTables();
      const choices = tables.map((t: any, idx: number) => ({
        id: String(t.id || t.tableId || idx + 1),
        label: `Table #${t.tableId || t.id || idx + 1} (${t.title || 'Table'})`,
        aliases: [String(idx + 1), String(t.tableId || t.id || idx + 1)],
        event: 'poker:table_selected',
        payload: { id: String(t.tableId || t.id || idx + 1) },
        value: { id: String(t.tableId || t.id || idx + 1) },
      }));
      host.events.broadcast('poker:request_table_selection', { tables, choices });
      return tables;
    } else if (eventName === 'poker:reset_light') {
      const res = await resetPokerDatabaseLight(prisma, { quiet: false });
      const newConv = await ensureTableConversation(host, { maxSeats });
      await enqueueTableASTRequest(host, newConv.id, {
        startingChips,
        smallBlind,
        bigBlind,
        maxSeats,
        bypassLobby: false,
      });
      host.events.broadcast('poker:lobby_prompt', {
        options: [
          { id: 'new', label: 'New Game', description: 'Start fresh table' },
          { id: 'resume', label: 'Resume Game', description: 'Select from active/paused tables' },
          { id: 'exit', label: 'Exit', description: 'Quit session' },
        ],
        choices: [
          { id: 'new', label: 'New Game - Start fresh table', aliases: ['n'], event: 'poker:lobby_choice', payload: { id: 'new' }, value: { id: 'new' } },
          { id: 'resume', label: 'Resume Game - Select from active/paused tables', aliases: ['r', 'continue'], event: 'poker:lobby_choice', payload: { id: 'resume' }, value: { id: 'resume' } },
          { id: 'exit', label: 'Exit - Quit session', aliases: ['q', 'exit', 'quit'], event: 'poker:lobby_choice', payload: { id: 'exit' }, value: { id: 'exit' } },
        ],
      });
      return res;
    }

    // 3. Wake matching waiting requests in the AST state machine
    const waitingReqs = await prisma.request.findMany({
      where: {
        conversationId: targetConvId,
        status: { in: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER'] },
      },
    });

    let woken = false;
    for (const req of waitingReqs) {
      const ctx = (req.context as any) || {};

      // Match direct target event, universal curator:choice, or resume action
      const matches =
        ctx.waitEvent === targetEvent ||
        targetEvent === 'curator:choice' ||
        (ctx.waitEvent === 'curator:choice' &&
          (targetEvent === 'poker:human_action' ||
            targetEvent === 'poker:lobby_choice' ||
            targetEvent === 'poker:table_selected')) ||
        (ctx.waitEvent === 'poker:resume_action' &&
          targetEvent === 'poker:human_action' &&
          (targetPayload?.type === 'RESUME' || targetPayload?.type === 'EXIT'));

      if (matches) {
        const alias = ctx.payloadAlias || ctx.choiceAs || ctx.as;
        const updatedContext = { ...ctx };
        delete updatedContext.waitEvent;
        delete updatedContext.payloadAlias;
        updatedContext.__humanInputReceived__ = true;

        const actualValue =
          targetPayload?.choice !== undefined ? targetPayload.choice : targetPayload;

        if (alias) {
          updatedContext.state = { ...(updatedContext.state || {}), [alias]: actualValue };
          updatedContext[alias] = actualValue;
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
      host.events.broadcast(targetEvent, {
        payload: targetPayload,
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
    const targetConvId = tableId !== undefined ? Number(tableId) : conversation.id;

    if (!options.quiet) {
      const currentGState = await getGameState(targetConvId);
      if (currentGState) {
        console.log(`\x1b[90m[Curator Engine] Stepping AST workflow on Table #${targetConvId}...\x1b[0m`);
      } else {
        console.log(`\x1b[90m[Curator Engine] Stepping Poker Lobby AST workflow...\x1b[0m`);
      }
    }

    const result = await host.processor.stepUntil({
      conversationId: targetConvId,
      maxSteps,
    });

    const humanTurn = await getWaitingHumanTurn(targetConvId);
    const gameState = await getGameState(targetConvId);

    if (humanTurn && !options.quiet) {
      console.log(`\x1b[32m✔ [Curator Engine] Action required from ${humanTurn.name} (chips: $${humanTurn.chips}, to call: $${humanTurn.toCall})\x1b[0m`);
    }

    return {
      done: result.done || Boolean(gameState?.gameOver),
      waitingForHuman: result.waiting,
      humanTurn,
      gameState,
      steps: result.steps,
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
    getActors: (convId?: string | number) => getConversationActors(host, convId !== undefined ? convId : conversation.id),
    send,
    step,
    close,
  };
}
