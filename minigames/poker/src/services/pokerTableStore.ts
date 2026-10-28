import type { StateProjector } from '../curator.ts';
import {
  POKER_SHAPE_URIS,
  POKER_TABLE_STATUS,
  type PokerTableStatusType,
} from '../models/pokerShapes.ts';
import type { PokerLobbyTable } from '../models/pokerLobbyMenu.ts';

// Menu formatting is pure presentation and lives with the lobby menu models
export { formatTableChoices } from '../models/pokerLobbyMenu.ts';

export interface PokerSeat {
  id: string;
  name?: string;
  isHuman?: boolean;
}

export interface SyncPokerTableParams {
  tableId: string | number;
  title: string;
  conversationId: number;
  projectId: string;
  userId: string;
  status?: PokerTableStatusType;
  maxSeats?: number;
  players?: PokerSeat[];
}

export interface QueryPokerTablesParams {
  projectId: string;
  userId?: string;
  playerName?: string;
}

export interface ActivePokerTablesResult {
  tables: PokerLobbyTable[];
}

const TABLE_URI_PREFIX = 'poker:table:';
export const pokerTableUri = (tableId: string | number) => `${TABLE_URI_PREFIX}${tableId}`;
export const pokerTableStatusUri = (status: PokerTableStatusType) => `${POKER_SHAPE_URIS.STATUS_PREDICATE}:${status}`;
const playerUri = (p: PokerSeat) => (p.isHuman ? `poker:player:${p.id}` : `poker:agent:${p.id}`);

/** Prisma relation filter for a live `subject -predicate-> object` triple. */
const triple = (predicateUri: string, object: Record<string, unknown>) => ({
  existent: true,
  predicate: { uri: predicateUri },
  object,
});

/**
 * Ensures a semantic resource exists in the database.
 */
async function ensureResource(
  prisma: any,
  uri: string,
  title: string,
  userId: string,
  projectId?: string | null
) {
  const existing = await prisma.resource.findUnique({ where: { uri } });
  if (existing) {
    if (!existing.existent) {
      return prisma.resource.update({
        where: { id: existing.id },
        data: { existent: true, deletedAt: null },
      });
    }
    return existing;
  }
  return prisma.resource.create({
    data: {
      uri,
      title,
      userId,
      projectId: projectId || null,
      existent: true,
    },
  });
}

async function linkTriple(
  prisma: any,
  subjectId: number,
  predicateId: number,
  objectId: number,
  projectId?: string | null
) {
  await prisma.relation.upsert({
    where: { subjectId_predicateId_objectId: { subjectId, predicateId, objectId } },
    update: { existent: true },
    create: { subjectId, predicateId, objectId, projectId, existent: true },
  });
}

/**
 * Replaces the table's single `poker:status` triple (maxCount 1 in PokerTableShape).
 */
async function setTableStatus(
  prisma: any,
  table: { id: number; userId: string; projectId?: string | null },
  status: PokerTableStatusType
) {
  const predicate = await ensureResource(prisma, POKER_SHAPE_URIS.STATUS_PREDICATE, 'status', table.userId, table.projectId);
  const value = await ensureResource(prisma, pokerTableStatusUri(status), status, table.userId, table.projectId);
  await prisma.relation.updateMany({
    where: { subjectId: table.id, predicateId: predicate.id, objectId: { not: value.id } },
    data: { existent: false },
  });
  await linkTriple(prisma, table.id, predicate.id, value.id, table.projectId);
}

/**
 * Links `after` players via `poker:hasPlayer` and retires the links of players in `before` who left.
 * Links nobody listed in `before` (e.g. written at table creation) are never retired.
 */
async function syncSeats(
  prisma: any,
  table: { id: number; userId: string; projectId?: string | null },
  before: PokerSeat[],
  after: PokerSeat[]
) {
  const hasPlayer = await ensureResource(prisma, POKER_SHAPE_URIS.PLAYER_PREDICATE, 'hasPlayer', table.userId, table.projectId);
  const seated = after.filter((p) => p?.id);
  for (const p of seated) {
    const player = await ensureResource(prisma, playerUri(p), p.name || p.id, table.userId, table.projectId);
    await linkTriple(prisma, table.id, hasPlayer.id, player.id, table.projectId);
  }

  const seatedUris = new Set(seated.map(playerUri));
  const leftUris = before.filter((p) => p?.id && !seatedUris.has(playerUri(p))).map(playerUri);
  if (leftUris.length) {
    await prisma.relation.updateMany({
      where: { subjectId: table.id, predicateId: hasPlayer.id, object: { uri: { in: leftUris } } },
      data: { existent: false },
    });
  }
}

/**
 * The lifecycle status a table conversation's workflow state implies. Ordered by precedence:
 * an explicit close wins over game over, which wins over a crash, which wins over a pause.
 */
export function deriveTableStatus(state: Record<string, any>): PokerTableStatusType {
  if (state.isClosed || state.sessionEnded) return POKER_TABLE_STATUS.CLOSED;
  if (state.gameOver) return POKER_TABLE_STATUS.FINISHED;
  if (state.lastFailure) return POKER_TABLE_STATUS.FAILED;
  if (state.isPaused) return POKER_TABLE_STATUS.PAUSED;
  return POKER_TABLE_STATUS.ACTIVE;
}

const sameSeats = (a: unknown, b: unknown) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * Keeps a table's PokerTableShape triples in step with its conversation state. Runs inside the
 * transaction of every state event, so the graph never disagrees with the event log.
 */
export const pokerTableProjector: StateProjector = async ({ db, conversationId, previous, state }) => {
  const status = deriveTableStatus(state);
  const statusChanged = status !== deriveTableStatus(previous);
  const seatsChanged = !sameSeats(previous.seatedPlayers, state.seatedPlayers);
  if (!statusChanged && !seatsChanged) return;

  const table = await db.resource.findFirst({
    where: { existent: true, uri: { startsWith: TABLE_URI_PREFIX }, conversations: { some: { id: conversationId } } },
  });
  if (!table) return;

  if (statusChanged) await setTableStatus(db, table, status);
  if (seatsChanged) await syncSeats(db, table, previous.seatedPlayers ?? [], state.seatedPlayers ?? []);
};

/**
 * Registers a poker table in Curator's Knowledge Graph as a Semantic Resource (PokerTableShape):
 * status and players (human Users and autonomous AI Agents) as triples, the table conversation
 * through the native Conversation <-> Resource link. Later changes come from `pokerTableProjector`.
 */
export async function syncPokerTableResource(
  prisma: any,
  params: SyncPokerTableParams
): Promise<any> {
  if (!prisma?.resource) return null;

  const uri = pokerTableUri(params.tableId);
  const data = {
    title: params.title,
    userId: params.userId,
    projectId: params.projectId,
    metadata: { shape: POKER_SHAPE_URIS.TABLE_SHAPE, maxSeats: params.maxSeats || 6 },
    existent: true,
    conversations: { connect: { id: params.conversationId } },
  };

  try {
    return await prisma.$transaction(async (db: any) => {
      const table = await db.resource.upsert({
        where: { uri },
        update: { ...data, deletedAt: null },
        create: { uri, ...data },
      });
      await setTableStatus(db, table, params.status || POKER_TABLE_STATUS.ACTIVE);
      await syncSeats(db, table, [], params.players ?? []);
      return table;
    });
  } catch (err) {
    console.warn('[PokerTableStore] Failed to sync semantic resource:', err);
    return null;
  }
}

/**
 * Finds the user's resumable poker tables in one graph query: table resources in project scope
 * whose `poker:status` is active or paused, that the user created or sits at (`poker:hasPlayer`).
 */
export async function queryActivePokerTables(
  prisma: any,
  query: QueryPokerTablesParams
): Promise<ActivePokerTablesResult> {
  const userId = query.userId?.trim();
  const playerName = query.playerName?.trim();

  // Fail closed: without a session project or identity there is nothing to list
  if (!query.projectId || (!userId && !playerName) || !prisma?.resource) return toTablesResult([]);

  const projectScope = { projectId: { in: [query.projectId, 'system'] } };
  const playerUris = [userId, playerName].filter(Boolean).map((id) => `poker:player:${id}`);
  const seatsUser = triple(POKER_SHAPE_URIS.PLAYER_PREDICATE, {
    OR: [{ uri: { in: playerUris } }, ...(playerName ? [{ title: playerName }] : [])],
  });

  const resumable = [POKER_TABLE_STATUS.ACTIVE, POKER_TABLE_STATUS.PAUSED].map(pokerTableStatusUri);

  const resources = await prisma.resource.findMany({
    where: {
      ...projectScope,
      existent: true,
      uri: { startsWith: TABLE_URI_PREFIX },
      AND: [
        { subjectRelations: { some: triple(POKER_SHAPE_URIS.STATUS_PREDICATE, { uri: { in: resumable } }) } },
        { OR: [...(userId ? [{ userId }] : []), { subjectRelations: { some: seatsUser } }] },
      ],
    },
    select: {
      title: true,
      conversations: { where: { ...projectScope, existent: true }, select: { id: true }, orderBy: { id: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return toTablesResult(
    resources.flatMap((r: any) => r.conversations.map((c: any) => ({ tableId: String(c.id), title: r.title })))
  );
}

function toTablesResult(tables: ActivePokerTablesResult['tables']): ActivePokerTablesResult {
  return { tables };
}
