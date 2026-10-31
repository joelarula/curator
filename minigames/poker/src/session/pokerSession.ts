import {
  stepInteractiveConversation,
  getWaitingChoice,
  type CuratorHost,
} from '../curatorHost.ts';
import { appendStatePatch, readSnapshot, logger } from '../curator.ts';
import type { ActionType, PlayerAction, PokerGameState, SpeechAct } from '../types.ts';
import {
  PokerEvent,
  PokerRole,
  PokerActionType,
  PokerStreet,
  PokerSpeechAct,
  PokerHistoryMode,
  PokerTool,
  PokerModule,
  PokerConversationType,
  CuratorCoreEvent,
  DEFAULT_LOBBY_CHOICES,
  type ChoiceOption,
  type PokerStreetType,
  type PokerWorkflowState,
  normalizeChoices,
} from '../models/index.ts';
import { syncPokerTableResource } from '../services/pokerTableStore.ts';
import { cashOutToBankroll } from '../services/pokerBankrollStore.ts';
import { resetPokerDatabaseLight, type ResetLightResult } from '../db/lightReset.ts';
import {
  pokerWorkflowAst,
  pokerLobbyAst,
  POKER_WORKFLOW_ASTS,
} from '../workflows/index.ts';

export { resetPokerDatabaseLight, type ResetLightResult, POKER_WORKFLOW_ASTS };

const OPEN_REQUEST_STATUSES = ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT'] as const;
const CHOICE_WAIT_EVENTS = new Set<string>([
  PokerEvent.HUMAN_ACTION,
  PokerEvent.LOBBY_CHOICE,
  PokerEvent.TABLE_SELECTED,
  PokerEvent.BUY_IN_CHOICE,
]);
const HUMAN_ROLES: PokerRole[] = [PokerRole.PLAYER, PokerRole.SPECTATOR];

const clampSeats = (seats?: number): number => Math.min(6, Math.max(2, seats || 4));
const isLobbyMeta = (meta: PokerWorkflowState): boolean =>
  Boolean(meta.isLobby) || meta.isLobby === 'true' || meta.type === PokerConversationType.LOBBY;
const isOpenMeta = (meta: PokerWorkflowState): boolean =>
  !meta.isClosed && meta.status !== 'closed';
const isTableMeta = (meta: PokerWorkflowState): boolean =>
  !isLobbyMeta(meta) &&
  (meta.type === PokerConversationType.TABLE || Boolean(meta.tableName) || meta.ruleset === 'texas_holdem_nl');

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
  sessionId?: string;
  newSession?: boolean;
  resetLight?: boolean;
  logLevel?: string;
  debug?: boolean;
}

export interface HumanTurnPromptInfo {
  requestId: number;
  player: string;
  name: string;
  chips: number;
  pot: number;
  toCall: number;
  street: PokerStreetType | string;
  choices: ChoiceOption[];
}

export type PlayerTurnPromptInfo = HumanTurnPromptInfo;

export interface PlayerActionInput {
  type?: ActionType | string;
  action?: ActionType | string;
  amount?: number;
}

export interface ActionResult {
  success: boolean;
  tableId: string;
  woken: boolean;
  action: ActionType;
  sessionId: string | null;
}

export interface SpeechInput {
  text: string;
  speechAct?: SpeechAct;
  targetId?: string;
  speakerName?: string;
  speakerId?: string;
}

export interface SpeechResult {
  success: boolean;
  tableId: string;
  text: string;
  aiReply: string | null;
  sessionId: string | null;
}

export interface CreateTableOptions {
  title?: string;
  maxSeats?: number;
  startingChips?: number;
  buyIn?: number;
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
  /** Earliest deadline (ISO) of a timed prompt or wait on the table; a direct client steps again then. */
  waitDeadline?: string;
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

export interface PokerGameSession {
  readonly tableId: string;
  readonly prisma: CuratorHost['prisma'];
  readonly host: CuratorHost;
  readonly processor: CuratorHost['processor'];
  readonly conversation: any;
  readonly project: CuratorHost['project'];
  readonly user: CuratorHost['user'];
  readonly rootRequestId: number;

  listTables(): Promise<PokerTableInfo[]>;
  getTable(tableId?: string | number): Promise<PokerTableInfo | null>;
  createTable(options?: CreateTableOptions): Promise<PokerTableInfo>;
  getGameState(tableId?: string | number): Promise<PokerGameState | null>;
  getWaitingTurn?(tableId?: string | number): Promise<PlayerTurnPromptInfo | null>;
  getWaitingHumanTurn(tableId?: string | number): Promise<HumanTurnPromptInfo | null>;
  getActors?(tableId?: string | number): Promise<CuratorActor[]>;
  resetLight?(): Promise<ResetLightResult>;
  runTool(toolName: string, args?: Record<string, any>, tableId?: string | number, sessionId?: string): Promise<any>;
  send(type: string, payload?: any, tableId?: string | number, sessionId?: string): Promise<any>;
  step(tableId?: string | number, maxSteps?: number): Promise<DirectStepResult>;
  submitAction(
    action: PlayerActionInput | string,
    options?: { tableId?: string | number; sessionId?: string; step?: boolean }
  ): Promise<ActionResult>;
  submitSpeech(
    params: SpeechInput,
    options?: { tableId?: string | number; sessionId?: string }
  ): Promise<SpeechResult>;
  getBankroll(): Promise<{ balance: number; currency: string } | null>;
  getStandings(tableId?: string | number): Promise<any[]>;
  close(): Promise<void>;
}

/**
 * Safely parses conversation metadata, handling JSON strings (common in SQLite) and object shapes.
 */
export function parseConversationMetadata(metadata: unknown): PokerWorkflowState {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata as PokerWorkflowState;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as PokerWorkflowState;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Live event-sourced state of a conversation (its materialized `metadata` view): the single source for
 * game and lifecycle state, instead of copies carried in request contexts.
 */
export async function readConversationState(prisma: any, conversationId: number): Promise<PokerWorkflowState> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { metadata: true } });
  return readSnapshot(conv?.metadata).state;
}

/**
 * Creates a conversation whose initial metadata is its first state event, so the materialized
 * `Conversation.metadata` view can always be rebuilt from the EventLog.
 */
async function createStatefulConversation(
  prisma: any,
  data: { userId: string; projectId: string },
  initialState: Record<string, unknown>
): Promise<any> {
  const conv = await prisma.conversation.create({ data });
  const { state } = await appendStatePatch(prisma, conv.id, { set: initialState });
  return { ...conv, metadata: state };
}

async function finalizeOpenRequests(
  prisma: any,
  conversationId: number,
  status: 'CANCELLED' | 'COMPLETED'
): Promise<void> {
  await prisma.request.updateMany({
    where: {
      conversationId,
      status: { in: [...OPEN_REQUEST_STATUSES] },
    },
    data: { status },
  });
}

async function markConversationClosed(
  prisma: any,
  conversationId: number,
  reason: string
): Promise<void> {
  await appendStatePatch(prisma, conversationId, {
    set: { isClosed: true, closingReason: reason, closedAt: new Date().toISOString() },
  });
}

/**
 * Creates a fresh, dedicated lounge lobby concierge conversation for a client run.
 */
export async function createLobbyConversation(
  host: CuratorHost,
  options: { playerName?: string; playerId?: string; sessionId?: string } = {}
): Promise<any> {
  const clientName = options.playerName || host.user.name || 'Player';
  return createStatefulConversation(host.prisma, { userId: host.user.id, projectId: host.project.id }, {
    type: PokerConversationType.LOBBY,
    isLobby: true,
    title: `${clientName}'s Lounge Concierge`,
    playerName: clientName,
    playerId: options.playerId || host.user.id,
    sessionId: options.sessionId,
    isClosed: false,
  });
}

/**
 * Closes an ephemeral poker lobby concierge conversation and cancels its pending requests.
 */
export async function closePokerLobbyConversation(
  host: CuratorHost,
  lobbyId: string | number,
  reason: string = 'user_exit'
): Promise<void> {
  const targetId = Number(lobbyId);
  if (Number.isNaN(targetId)) return;

  const conv = await host.prisma.conversation.findUnique({ where: { id: targetId } });
  if (!conv) return;

  await markConversationClosed(host.prisma, targetId, reason);
  await finalizeOpenRequests(host.prisma, targetId, 'CANCELLED');
}

/**
 * Resolves or creates a dedicated lounge lobby conversation scoped directly to the host's project and user.
 * Skips closed lobbies and creates an isolated concierge conversation for the client.
 */
export async function ensureLobbyConversation(
  host: CuratorHost,
  options: { forceNew?: boolean; playerName?: string; playerId?: string; sessionId?: string } = {}
): Promise<any> {
  if (options.forceNew) {
    return createLobbyConversation(host, options);
  }

  const convs = await host.prisma.conversation.findMany({
    where: { projectId: host.project.id, userId: host.user.id },
    orderBy: { id: 'desc' },
  });

  const existing = convs.find((c: any) => {
    const meta = parseConversationMetadata(c.metadata);
    return isLobbyMeta(meta) && isOpenMeta(meta);
  });

  return existing ?? createLobbyConversation(host, options);
}

/**
 * Resolves or creates a table conversation scoped directly to the host's project and user.
 */
export async function ensureTableConversation(
  host: CuratorHost,
  options: { tableId?: string | number; maxSeats?: number; title?: string } = {}
): Promise<any> {
  const { prisma, project, user } = host;
  const maxSeats = clampSeats(options.maxSeats);

  if (options.tableId !== undefined) {
    const targetId = Number(options.tableId);
    if (!Number.isNaN(targetId)) {
      const existing = await prisma.conversation.findFirst({
        where: { id: targetId, projectId: project.id },
      });
      if (existing) return existing;
    }
  }

  const convs = await prisma.conversation.findMany({
    where: { projectId: project.id },
    orderBy: { id: 'asc' },
  });

  const existingTable = convs.find((c: any) => !isLobbyMeta(parseConversationMetadata(c.metadata)));
  if (existingTable) return existingTable;

  return createStatefulConversation(prisma, { userId: user.id, projectId: project.id }, {
    type: PokerConversationType.TABLE,
    isLobby: false,
    tableName: options.title || 'Table #1',
    ruleset: 'texas_holdem_nl',
    maxSeats,
  });
}

/**
 * Consolidated factory for creating a new poker game table conversation,
 * seating the human player, and enqueuing the master game workflow.
 */
export async function createPokerGameTable(
  host: CuratorHost,
  options: CreateTableOptions & { playerName?: string; playerId?: string } = {}
): Promise<PokerTableInfo> {
  const { prisma, user, project } = host;
  const maxSeats = clampSeats(options.maxSeats);
  const startingChips = options.startingChips || options.buyIn || 1000;
  const smallBlind = options.smallBlind || 10;
  const bigBlind = options.bigBlind || 20;

  const convs = await prisma.conversation.findMany({ where: { projectId: project.id } });
  const tableCount = convs.filter((c: any) => !isLobbyMeta(parseConversationMetadata(c.metadata))).length;
  const title = options.title || `Table #${tableCount + 1}`;

  const newConv = await createStatefulConversation(prisma, { userId: user.id, projectId: project.id }, {
    type: PokerConversationType.TABLE,
    isLobby: false,
    tableName: title,
    maxSeats,
    startingChips,
    smallBlind,
    bigBlind,
  });

  await ensureHumanActorInDatabase(host, newConv.id, {
    playerName: options.playerName,
    playerId: options.playerId,
  });

  await enqueueTableASTRequest(host, newConv.id, {
    startingChips,
    smallBlind,
    bigBlind,
    maxSeats,
    playerName: options.playerName,
    scriptName: PokerModule.WORKFLOW,
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

  await syncPokerTableResource(prisma, {
    tableId: newConv.id,
    title,
    conversationId: newConv.id,
    projectId: project.id,
    userId: user.id,
    maxSeats,
    players: [
      {
        id: options.playerId || options.playerName || user.id,
        name: options.playerName || user.name || 'Hero',
        isHuman: true,
      },
    ],
  });

  host.events.broadcast(PokerEvent.TABLE_CREATED, {
    tableId: info.tableId,
    conversationId: info.conversationId,
    title: info.title,
  });

  return info;
}

/**
 * Consolidated helper for closing a poker table conversation and cleanly finalizing requests.
 */
export async function closePokerGameTable(
  host: CuratorHost,
  tableId: string | number,
  reason: string = 'closed',
  broadcast: boolean = true
): Promise<void> {
  const { prisma, user, project } = host;
  const convId = Number(tableId);

  // Cash out human player chips back into their persistent bankroll
  try {
    const gState = (await readConversationState(prisma, convId)).gameState;
    const human = gState?.players?.find(
      (p) => p.isHuman || p.id === user.id || p.name === user.name
    );
    if (human && typeof human.chips === 'number' && human.chips > 0) {
      await cashOutToBankroll(prisma, user.id, human.chips, convId, project.id);
    }
  } catch {
    // Best-effort cash out on table close
  }

  await finalizeOpenRequests(prisma, convId, 'COMPLETED');
  // The state event is the audit record; pokerTableProjector moves the table resource to closed with it
  await markConversationClosed(prisma, convId, reason);

  if (broadcast) {
    host.events.broadcast(PokerEvent.SESSION_EXITED, {
      tableId: String(convId),
      conversationId: convId,
      reason,
    });
  }
}

export async function getScriptAST(prisma: any, scriptName: string): Promise<any> {
  if (POKER_WORKFLOW_ASTS[scriptName]) {
    return POKER_WORKFLOW_ASTS[scriptName];
  }
  const script = await prisma?.script?.findUnique?.({ where: { name: scriptName } });
  if (script?.ast) return script.ast;
  return scriptName === PokerModule.LOBBY ? pokerLobbyAst : pokerWorkflowAst;
}

export const getTableWorkflowAST = (prisma: any): Promise<any> => getScriptAST(prisma, PokerModule.WORKFLOW);
export const getLobbyWorkflowAST = (prisma: any): Promise<any> => getScriptAST(prisma, PokerModule.LOBBY);

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
    scriptName?: string;
  } = {}
): Promise<any> {
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
        playerName: options.playerName || 'You',
        startingChips: options.startingChips || 1000,
        sbAmount: options.smallBlind || 10,
        bbAmount: options.bigBlind || 20,
        maxSeats: clampSeats(options.maxSeats),
      },
    },
  });
}

export async function ensureHumanActorInDatabase(
  host: CuratorHost,
  conversationId: number,
  options: { playerName?: string; playerId?: string } = {}
): Promise<any> {
  const { prisma } = host;
  const playerName = (options.playerName || host.user?.name || 'You').trim();
  const playerSlug = playerName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'hero';
  const playerId =
    options.playerId ||
    (playerSlug === 'you' || playerSlug === 'system' ? (host.user?.id || 'player') : `user_${playerSlug}`);
  const playerEmail = `${playerSlug}@local.curator`;

  // 1. Ensure User entity in DB
  let user: any = null;
  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ id: playerId }, { email: playerEmail }, { name: playerName }] },
    });
    if (existing) {
      user = existing.name !== playerName
        ? await prisma.user.update({ where: { id: existing.id }, data: { name: playerName } })
        : existing;
    } else {
      user = await prisma.user.create({
        data: { id: playerId, name: playerName, email: playerEmail },
      });
    }
  } catch {
    user = host.user;
  }

  // 2. Assign poker roles to the human user under the active poker project
  const targetProjectId = host.project?.id || 'poker-project-1';
  for (const roleId of HUMAN_ROLES) {
    try {
      if (typeof host.assignUserProjectRole === 'function') {
        await host.assignUserProjectRole(user.id, roleId, targetProjectId);
      } else {
        await prisma.userRole.upsert({
          where: { userId_roleId_projectId: { userId: user.id, roleId, projectId: targetProjectId } },
          create: { userId: user.id, roleId, projectId: targetProjectId },
          update: {},
        });
      }
    } catch {
      // Role may already be assigned or project not yet seeded
    }
  }

  // 3. Register human actor as active participant in Conversation metadata
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (conv) {
      const meta = parseConversationMetadata(conv.metadata);
      const participants = Array.isArray(meta.participants) ? [...meta.participants] : [];
      const idx = participants.findIndex((p: any) => p.id === playerId || (user && p.id === user.id));
      if (idx >= 0) {
        participants[idx] = { ...participants[idx], name: playerName };
      } else {
        participants.push({
          id: user?.id || playerId,
          name: playerName,
          kind: 'user',
          isHuman: true,
          role: 'player',
          roles: HUMAN_ROLES,
        });
      }
      await appendStatePatch(prisma, conversationId, { set: { participants } });
    }
  } catch {
    // Conversation may be ephemeral or already closed
  }

  return user;
}

export async function getConversationActors(
  host: CuratorHost,
  conversationId: number | string
): Promise<CuratorActor[]> {
  const { prisma } = host;
  const convIdNum = Number(conversationId);

  const conv = await prisma.conversation
    .findUnique({ where: { id: convIdNum }, include: { project: true } })
    .catch(() => null);

  const user =
    (conv?.userId
      ? await prisma.user.findUnique({ where: { id: conv.userId } }).catch(() => null)
      : null) || host.user;

  const actors: CuratorActor[] = [
    {
      id: user?.id || host.user?.id || 'player',
      kind: 'user',
      name: user?.name || host.user?.name || 'You',
      roles: [...HUMAN_ROLES],
      isHuman: true,
      persona: 'human',
      status: 'ACTIVE',
      capabilities: ['table_action', 'speech', 'whisper'],
    },
  ];

  const projectId = conv?.projectId || host.project?.id;
  const dbAgents: any[] = await prisma.agent
    .findMany({
      where: { OR: [{ projectId }, { existent: true }] },
      include: { roles: { include: { role: true } }, script: true },
      orderBy: { id: 'asc' },
    })
    .catch(() => []);

  const gameState = await readConversationState(prisma, convIdNum)
    .then((s) => s.gameState ?? null)
    .catch(() => null);

  const seatedMap = new Map((gameState?.players || []).map((p) => [p.id.toLowerCase(), p]));

  for (const agent of dbAgents) {
    if (agent.id === user?.id || agent.id === host.user?.id) continue;
    const roleNames: string[] = agent.roles?.map((r: any) => r.role?.name || r.roleId) || [];
    const pluginDef = (host.engine?.agents?.get(agent.id) as Record<string, any>) || {};
    const seated = seatedMap.get(agent.id.toLowerCase());

    const isLobby = agent.id === 'lobby';
    const isDealer = roleNames.includes(PokerRole.DEALER) || agent.id === 'dealer';

    const status = isLobby
      ? 'LOBBY_CONCIERGE'
      : isDealer
        ? 'DEALER'
        : seated
          ? seated.folded
            ? 'FOLDED'
            : seated.allIn
              ? 'ALL_IN'
              : 'SEATED'
          : 'LOUNGE';

    const capabilities = isLobby
      ? ['lobby_guidance', 'table_matching', 'speech', 'whisper']
      : isDealer
        ? ['deal_cards', 'manage_pots', 'speech', 'rules_inquiry']
        : ['table_action', 'speech', 'whisper'];

    actors.push({
      id: agent.id,
      kind: 'agent',
      name: seated?.name || agent.name,
      roles: roleNames,
      isHuman: false,
      persona: pluginDef.persona || (isLobby ? 'concierge' : isDealer ? 'dealer' : 'player'),
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
  const maxSeats = clampSeats(options.maxSeats);
  const startingChips = options.startingChips || 1000;
  const smallBlind = options.sbAmount ?? options.smallBlind ?? 10;
  const bigBlind = options.bbAmount ?? options.bigBlind ?? 20;

  const { prisma, user, project } = host;

  if (options.resetLight) {
    await resetPokerDatabaseLight(prisma, { quiet: options.quiet });
  }

  const isTableTargeted = options.tableId !== undefined;
  const conversation = isTableTargeted
    ? await ensureTableConversation(host, { tableId: options.tableId, maxSeats })
    : await ensureLobbyConversation(host, {
        playerName: options.playerName,
        playerId: options.playerId,
        sessionId: options.sessionId,
        forceNew: options.newSession,
      });

  await ensureHumanActorInDatabase(host, conversation.id, {
    playerName: options.playerName,
    playerId: options.playerId || user?.id || 'player',
  });

  let rootRequest = isTableTargeted
    ? await prisma.request.findFirst({
        where: {
          conversationId: conversation.id,
          status: { in: [...OPEN_REQUEST_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  if (!rootRequest) {
    await finalizeOpenRequests(prisma, conversation.id, 'CANCELLED');
    rootRequest = await enqueueTableASTRequest(host, conversation.id, {
      startingChips,
      smallBlind,
      bigBlind,
      maxSeats,
      tableId: options.tableId,
      playerName: options.playerName,
      scriptName: isTableTargeted ? PokerModule.WORKFLOW : PokerModule.LOBBY,
    });
    if (!options.quiet) {
      const targetLabel = isTableTargeted ? `Table #${conversation.id}` : 'Poker Lounge Lobby';
      console.log(`\x1b[32m✔ [Poker Session] ${targetLabel} initialized with root AST Request #${rootRequest.id}\x1b[0m`);
    }
  } else if (!options.quiet) {
    console.log(`\x1b[32m✔ [Poker Session] Resuming Table #${conversation.id} with active Request #${rootRequest.id}\x1b[0m`);
  }

  const defaultTableId = String(conversation.id);
  const resolveConvId = (tableId?: string | number): number =>
    tableId !== undefined ? Number(tableId) : conversation.id;

  const getGameState = async (tableId?: string | number): Promise<PokerGameState | null> =>
    (await readConversationState(prisma, resolveConvId(tableId))).gameState ?? null;

  const getWaitingHumanTurn = async (tableId?: string | number): Promise<HumanTurnPromptInfo | null> => {
    const targetConvId = resolveConvId(tableId);
    const choiceInfo = await getWaitingChoice(prisma, targetConvId);
    if (!choiceInfo) return null;

    const gameState = await getGameState(targetConvId);
    if (!gameState?.players?.length) return null;
    const activePlayer = gameState.players[gameState.activePlayerIdx];

    return {
      requestId: choiceInfo.requestId,
      player: activePlayer?.id || user?.id || 'player',
      name: activePlayer?.name || user?.name || 'You',
      chips: activePlayer?.chips ?? 0,
      pot: gameState.pot ?? 0,
      toCall: (gameState.currentBet ?? 0) - (activePlayer?.streetBet ?? 0),
      street: gameState.currentStreet || PokerStreet.PREFLOP,
      choices: normalizeChoices(choiceInfo.choices),
    };
  };

  const runTool = async (
    toolName: string,
    args: Record<string, any> = {},
    tableId?: string | number,
    sessionId?: string
  ): Promise<any> => {
    const targetConvId = resolveConvId(tableId);
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
      broadcastToolEvents: false,
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
    let targetConvId =
      payload?.conversationId !== undefined ? Number(payload.conversationId) : resolveConvId(tableId);

    // 1. Native Table Speech / Whispers
    if (eventName === PokerEvent.SPEECH) {
      const speakerName = payload?.speakerName || user?.name || 'You';
      const speakerId = payload?.speakerId || sessionId || user?.id || 'player';
      const targetId = payload?.targetId ?? payload?.args?.targetId;
      const speechAct: SpeechAct =
        payload?.speechAct ||
        payload?.args?.speechAct ||
        (targetId ? PokerSpeechAct.WHISPER : PokerSpeechAct.TABLE_TALK);
      const text = payload?.text || payload?.args?.text || '';

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
        // How seats remember it: table talk as a line, whispers not at all
        from: speakerName,
        mode: speechAct === PokerSpeechAct.WHISPER ? PokerHistoryMode.OFF_RECORD : PokerHistoryMode.LINE,
      };

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
    const emitToConversation = (conversationId: number) =>
      host.emitEvent(eventName, payload, {
        conversationId,
        origin: 'REPL',
        broadcast: false,
        matchWait: (waitEvent, evt, p) =>
          evt === CuratorCoreEvent.CHOICE ||
          (waitEvent === CuratorCoreEvent.CHOICE && CHOICE_WAIT_EVENTS.has(evt)) ||
          (waitEvent === PokerEvent.RESUME_ACTION &&
            evt === PokerEvent.HUMAN_ACTION &&
            (p?.type === PokerActionType.RESUME || p?.type === PokerActionType.EXIT)),
        waitValue: (p) => (p?.choice !== undefined ? p.choice : p),
        contextPatch: sessionId ? { sessionId } : undefined,
      });

    let emitted = await emitToConversation(targetConvId);
    let woken = emitted.woken.length > 0;

    // Resilient fallback: if nothing was waiting on targetConvId, check root session conversation (e.g. Lobby)
    if (!woken && targetConvId !== conversation.id) {
      emitted = await emitToConversation(conversation.id);
      if (emitted.woken.length > 0) {
        targetConvId = conversation.id;
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

  const resetLight = async (): Promise<ResetLightResult> => {
    const res = await resetPokerDatabaseLight(prisma, { quiet: false });
    const newConv = await ensureTableConversation(host, { maxSeats });
    await enqueueTableASTRequest(host, newConv.id, {
      startingChips,
      smallBlind,
      bigBlind,
      maxSeats,
    });
    host.events.broadcast(PokerEvent.LOBBY_PROMPT, {
      choices: DEFAULT_LOBBY_CHOICES,
    });
    return res;
  };

  const createTable = (tableOpts: CreateTableOptions = {}): Promise<PokerTableInfo> =>
    createPokerGameTable(host, {
      ...tableOpts,
      playerName: options.playerName,
      playerId: options.playerId,
      maxSeats: tableOpts.maxSeats || maxSeats,
      startingChips: tableOpts.startingChips || startingChips,
      smallBlind: tableOpts.smallBlind || smallBlind,
      bigBlind: tableOpts.bigBlind || bigBlind,
    });

  const resolveTableInfo = async (c: any): Promise<PokerTableInfo> => {
    const [gState, waiting, latestReq] = await Promise.all([
      getGameState(c.id),
      getWaitingHumanTurn(c.id),
      prisma.request.findFirst({
        where: { conversationId: c.id },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const meta = parseConversationMetadata(c.metadata);
    const isPaused = latestReq?.status === 'PAUSED' || meta.isPaused === true;
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

    const openTableConvs = convs.filter((c: any) => {
      const meta = parseConversationMetadata(c.metadata);
      return isOpenMeta(meta) && isTableMeta(meta);
    });

    return Promise.all(openTableConvs.map(resolveTableInfo));
  };

  const getTable = async (tableId?: string | number): Promise<PokerTableInfo | null> => {
    const c = await prisma.conversation.findUnique({ where: { id: resolveConvId(tableId) } });
    return c ? resolveTableInfo(c) : null;
  };

  /**
   * Advances the Curator RequestProcessor synchronously step-by-step
   * until a human turn gate is reached or the tournament finishes.
   */
  const step = async (
    tableId?: string | number,
    maxSteps: number = 500
  ): Promise<DirectStepResult> => {
    const targetConvId = resolveConvId(tableId);

    const currentGState = await getGameState(targetConvId);
    logger.debug(
      currentGState
        ? `[Curator Engine] Stepping AST workflow on Table #${targetConvId}...`
        : `[Curator Engine] Stepping Poker Lobby AST workflow...`
    );

    const stepRes = await stepInteractiveConversation(host, targetConvId, maxSteps);
    const [humanTurn, gameState, parked] = await Promise.all([
      getWaitingHumanTurn(targetConvId),
      getGameState(targetConvId),
      prisma.request.findMany({
        where: { conversationId: targetConvId, status: { in: ['WAITING_FOR_USER', 'WAITING_FOR_EVENT'] } },
        select: { context: true },
      }),
    ]);
    // Timeouts only fire when the processor steps; nothing polls in direct mode, so report the next deadline
    const waitDeadline = parked
      .map((r: any) => (typeof r.context === 'string' ? JSON.parse(r.context || '{}') : r.context || {}).waitDeadline as string | undefined)
      .filter((d): d is string => Boolean(d))
      .sort()[0];

    if (humanTurn) {
      logger.debug(
        `[Curator Engine] Action required from ${humanTurn.name} (chips: $${humanTurn.chips}, to call: $${humanTurn.toCall})`
      );
    }

    if (stepRes.done) {
      const conv = await prisma.conversation.findUnique({ where: { id: targetConvId } });
      if (isLobbyMeta(parseConversationMetadata(conv?.metadata))) {
        await closePokerLobbyConversation(host, targetConvId, 'lobby_completed');
      }
    }

    return {
      done: stepRes.done || Boolean(gameState?.gameOver),
      waitingForHuman: stepRes.waiting,
      humanTurn,
      gameState,
      steps: stepRes.steps,
      ...(waitDeadline ? { waitDeadline } : {}),
    };
  };

  const submitAction = async (
    action: PlayerActionInput | string,
    actionOpts?: { tableId?: string | number; sessionId?: string; step?: boolean }
  ): Promise<ActionResult> => {
    const targetTableId = actionOpts?.tableId ?? defaultTableId;
    const rawType = typeof action === 'string' ? action : (action.type || action.action || PokerActionType.CHECK);
    const normalizedAction: PlayerAction = {
      type: rawType.toUpperCase() as ActionType,
      ...(typeof action === 'object' && action.amount !== undefined ? { amount: action.amount } : {}),
    };

    const woken = Boolean(
      await send(PokerEvent.HUMAN_ACTION, normalizedAction, targetTableId, actionOpts?.sessionId)
    );
    if (woken && actionOpts?.step !== false) {
      await step(targetTableId);
    }

    return {
      success: true,
      tableId: String(targetTableId),
      woken,
      action: normalizedAction.type,
      sessionId: actionOpts?.sessionId || null,
    };
  };

  const submitSpeech = async (
    speech: SpeechInput,
    speechOpts?: { tableId?: string | number; sessionId?: string }
  ): Promise<SpeechResult> => {
    const targetTableId = speechOpts?.tableId ?? defaultTableId;
    const result = await send(PokerEvent.SPEECH, speech, targetTableId, speechOpts?.sessionId);

    return {
      success: true,
      tableId: String(targetTableId),
      text: speech.text,
      aiReply: result?.aiResponse?.text || null,
      sessionId: speechOpts?.sessionId || null,
    };
  };

  const getBankroll = async (): Promise<{ balance: number; currency: string } | null> => {
    try {
      const res = await runTool(PokerTool.GET_BANKROLL, {});
      return res?.balance !== undefined
        ? { balance: Number(res.balance), currency: res.currency || 'CHIPS' }
        : null;
    } catch {
      return null;
    }
  };

  const getStandings = async (tableId?: string | number): Promise<any[]> => {
    const state = await getGameState(tableId);
    if (!state) return [];
    try {
      const res = await runTool(PokerTool.GET_STANDINGS, { state }, tableId);
      return res?.standings || [];
    } catch {
      return [];
    }
  };

  const close = async (): Promise<void> => {
    if (isLobbyMeta(parseConversationMetadata(conversation.metadata))) {
      await closePokerLobbyConversation(host, conversation.id, 'session_closed');
    }
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
    getActors: (convId?: string | number) => getConversationActors(host, convId ?? conversation.id),
    send,
    step,
    submitAction,
    submitSpeech,
    getBankroll,
    getStandings,
    runTool,
    resetLight,
    close,
  };
}
