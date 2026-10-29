import type { StateProjector } from '../curator.ts';
import type { PokerWorkflowState } from '../models/pokerContext.ts';
import type { PokerLobbyTable } from '../models/pokerLobbyMenu.ts';
import {
  POKER_SHAPE_URIS,
  POKER_TABLE_STATUS,
  RESUMABLE_TABLE_STATUSES,
  TABLE_URI_PREFIX,
  pokerPlayerUri,
  pokerSeatUri,
  pokerTableStatusUri,
  pokerTableUri,
  type ActivePokerTablesResult,
  type PokerResourceRecord,
  type PokerSeat,
  type PokerStoreDb,
  type PokerTableResourceMetadata,
  type PokerTableStatusType,
  type QueryPokerTablesParams,
  type SyncPokerTableParams,
} from '../models/pokerShapes.ts';
import { DEFAULT_TABLE_SETTINGS } from '../pokerConfig.ts';

// Menu formatting is pure presentation and lives with the lobby menu models
export { formatTableChoices } from '../models/pokerLobbyMenu.ts';
export {
  pokerTableUri,
  pokerTableStatusUri,
  pokerPlayerUri,
  pokerSeatUri,
  type PokerSeat,
  type SyncPokerTableParams,
  type QueryPokerTablesParams,
  type ActivePokerTablesResult,
  type PokerResourceRecord,
  type PokerStoreDb,
  type PokerTableResourceMetadata,
};

type TableResourceRef = Pick<PokerResourceRecord, 'id' | 'userId' | 'projectId'>;

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
  prisma: PokerStoreDb,
  uri: string,
  title: string,
  userId: string,
  projectId?: string | null
): Promise<PokerResourceRecord> {
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
  prisma: PokerStoreDb,
  subjectId: number,
  predicateId: number,
  objectId: number,
  projectId?: string | null
): Promise<void> {
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
  prisma: PokerStoreDb,
  table: TableResourceRef,
  status: PokerTableStatusType
): Promise<void> {
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
  prisma: PokerStoreDb,
  table: TableResourceRef,
  before: PokerSeat[],
  after: PokerSeat[]
): Promise<void> {
  const hasPlayer = await ensureResource(prisma, POKER_SHAPE_URIS.PLAYER_PREDICATE, 'hasPlayer', table.userId, table.projectId);
  const seated = after.filter((p) => p.id);
  for (const p of seated) {
    const player = await ensureResource(prisma, pokerSeatUri(p), p.name || p.id, table.userId, table.projectId);
    await linkTriple(prisma, table.id, hasPlayer.id, player.id, table.projectId);
  }

  const seatedUris = new Set(seated.map(pokerSeatUri));
  const leftUris = before.filter((p) => p.id && !seatedUris.has(pokerSeatUri(p))).map(pokerSeatUri);
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
export function deriveTableStatus(state: PokerWorkflowState): PokerTableStatusType {
  if (state.isClosed || state.sessionEnded) return POKER_TABLE_STATUS.CLOSED;
  if (state.gameOver) return POKER_TABLE_STATUS.FINISHED;
  if (state.lastFailure) return POKER_TABLE_STATUS.FAILED;
  if (state.isPaused) return POKER_TABLE_STATUS.PAUSED;
  return POKER_TABLE_STATUS.ACTIVE;
}

const sameSeats = (a: PokerSeat[] | undefined, b: PokerSeat[] | undefined): boolean =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * Keeps a table's PokerTableShape triples in step with its conversation state. Runs inside the
 * transaction of every state event, so the graph never disagrees with the event log.
 */
export const pokerTableProjector: StateProjector = async ({ db, conversationId, previous, state }) => {
  const prevState = previous as PokerWorkflowState;
  const nextState = state as PokerWorkflowState;
  const storeDb = db as PokerStoreDb;

  const status = deriveTableStatus(nextState);
  const statusChanged = status !== deriveTableStatus(prevState);
  const seatsChanged = !sameSeats(prevState.seatedPlayers, nextState.seatedPlayers);
  if (!statusChanged && !seatsChanged) return;

  const table = await storeDb.resource.findFirst({
    where: { existent: true, uri: { startsWith: TABLE_URI_PREFIX }, conversations: { some: { id: conversationId } } },
  });
  if (!table) return;

  if (statusChanged) await setTableStatus(storeDb, table, status);
  if (seatsChanged) await syncSeats(storeDb, table, prevState.seatedPlayers ?? [], nextState.seatedPlayers ?? []);
};

/**
 * Registers a poker table in Curator's Knowledge Graph as a Semantic Resource (PokerTableShape):
 * status and players (human Users and autonomous AI Agents) as triples, the table conversation
 * through the native Conversation <-> Resource link. Later changes come from `pokerTableProjector`.
 */
export async function syncPokerTableResource(
  prisma: PokerStoreDb | null | undefined,
  params: SyncPokerTableParams
): Promise<PokerResourceRecord | null> {
  if (!prisma?.resource) return null;

  const uri = pokerTableUri(params.tableId);
  const metadata: PokerTableResourceMetadata = {
    shape: POKER_SHAPE_URIS.TABLE_SHAPE,
    maxSeats: params.maxSeats || DEFAULT_TABLE_SETTINGS.maxSeats,
  };
  const data = {
    title: params.title,
    userId: params.userId,
    projectId: params.projectId,
    metadata,
    existent: true,
    conversations: { connect: { id: params.conversationId } },
  };

  try {
    return await prisma.$transaction(async (db) => {
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
  prisma: PokerStoreDb | null | undefined,
  query: QueryPokerTablesParams
): Promise<ActivePokerTablesResult> {
  const userId = query.userId?.trim();
  const playerName = query.playerName?.trim();

  // Fail closed: without a session project or identity there is nothing to list
  if (!query.projectId || (!userId && !playerName) || !prisma?.resource) {
    return { tables: [] };
  }

  const projectScope = { projectId: { in: [query.projectId, 'system'] } };
  const playerUris = [userId, playerName]
    .filter((id): id is string => Boolean(id))
    .map((id) => pokerPlayerUri(id, true));
  const seatsUser = triple(POKER_SHAPE_URIS.PLAYER_PREDICATE, {
    OR: [{ uri: { in: playerUris } }, ...(playerName ? [{ title: playerName }] : [])],
  });

  const resumable = RESUMABLE_TABLE_STATUSES.map(pokerTableStatusUri);

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

  return {
    tables: resources.flatMap((r) =>
      (r.conversations ?? []).map((c): PokerLobbyTable => ({
        tableId: String(c.id),
        title: r.title ?? `Table #${c.id}`,
      }))
    ),
  };
}
