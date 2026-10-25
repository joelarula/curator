import {
  POKER_SHAPE_URIS,
  POKER_TABLE_STATUS,
  type PokerTableStatusType,
} from '../models/pokerShapes.ts';
import {
  formatTableChoices,
  isTableUnfinishedForUser,
  type UnfinishedGameUserQuery,
} from '../engine/pokerEngine.ts';
import type { PokerTableChoice } from '../workflows/pokerLobby.ts';

export interface SyncPokerTableParams {
  tableId: string | number;
  title: string;
  conversationId: number;
  projectId: string;
  userId: string;
  status?: PokerTableStatusType;
  maxSeats?: number;
  players?: Array<{ id: string; name?: string; isHuman?: boolean }>;
}

export interface QueryPokerTablesParams {
  projectId?: string;
  playerName?: string;
  playerId?: string;
  userId?: string;
}

export interface ActivePokerTablesResult {
  tables: Array<{ id: string; tableId: string; title: string }>;
  choices: PokerTableChoice[];
  hasUnfinishedGames: boolean;
  count: number;
}

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

/**
 * Checks whether an array of player resources matches a user query.
 */
function matchesPlayerQuery(
  players: any[],
  creatorUserId: string | null | undefined,
  query: QueryPokerTablesParams
): boolean {
  const normName = query.playerName?.trim().toLowerCase();
  const normPlayerId = query.playerId?.trim().toLowerCase();
  const normUserId = query.userId?.trim().toLowerCase();

  if (!normName && !normPlayerId && !normUserId) return false;

  const matches = (id?: string | null, name?: string | null, uri?: string | null) => {
    const idNorm = id?.trim().toLowerCase();
    const nameNorm = name?.trim().toLowerCase();
    const uriNorm = uri?.trim().toLowerCase();

    if (normPlayerId && (idNorm === normPlayerId || uriNorm?.includes(`:${normPlayerId}`))) return true;
    if (normUserId && (idNorm === normUserId || uriNorm?.includes(`:${normUserId}`))) return true;
    if (normName && (nameNorm === normName || uriNorm?.includes(`:${normName}`))) return true;
    return false;
  };

  const hasPlayerMatch = players.some((p: any) =>
    matches(p.id, p.title || p.name, p.uri)
  );
  if (hasPlayerMatch) return true;

  if (normUserId && creatorUserId && creatorUserId.trim().toLowerCase() === normUserId) {
    return true;
  }

  return false;
}

/**
 * Synchronizes a poker table into Curator's Knowledge Graph as a Semantic Resource (PokerTableShape)
 * and links players (human Users and autonomous AI Agents) via relations.
 */
export async function syncPokerTableResource(
  prisma: any,
  params: SyncPokerTableParams
): Promise<any> {
  if (!prisma?.resource) return null;

  const tableUri = `poker:table:${params.tableId}`;
  const status = params.status || POKER_TABLE_STATUS.ACTIVE;

  try {
    // 1. Upsert Table Resource conforming to PokerTableShape
    const tableResource = await prisma.resource.upsert({
      where: { uri: tableUri },
      update: {
        title: params.title,
        userId: params.userId,
        projectId: params.projectId,
        metadata: {
          shape: POKER_SHAPE_URIS.TABLE_SHAPE,
          type: 'poker_table',
          status,
          tableId: String(params.tableId),
          conversationId: params.conversationId,
          tableName: params.title,
          maxSeats: params.maxSeats || 6,
          isClosed: status === POKER_TABLE_STATUS.CLOSED,
        },
        existent: true,
        deletedAt: null,
      },
      create: {
        uri: tableUri,
        title: params.title,
        userId: params.userId,
        projectId: params.projectId,
        metadata: {
          shape: POKER_SHAPE_URIS.TABLE_SHAPE,
          type: 'poker_table',
          status,
          tableId: String(params.tableId),
          conversationId: params.conversationId,
          tableName: params.title,
          maxSeats: params.maxSeats || 6,
          isClosed: status === POKER_TABLE_STATUS.CLOSED,
        },
        existent: true,
      },
    });

    // 2. Link Players (both Users and Agents) through poker:hasPlayer relation
    if (prisma?.relation && Array.isArray(params.players) && params.players.length > 0) {
      const hasPlayerPred = await ensureResource(
        prisma,
        POKER_SHAPE_URIS.PLAYER_PREDICATE,
        'hasPlayer',
        params.userId,
        params.projectId
      );

      for (const p of params.players) {
        if (!p.id) continue;
        const playerUri = p.isHuman ? `poker:player:${p.id}` : `poker:agent:${p.id}`;
        const playerResource = await ensureResource(
          prisma,
          playerUri,
          p.name || p.id,
          params.userId,
          params.projectId
        );

        await prisma.relation.upsert({
          where: {
            subjectId_predicateId_objectId: {
              subjectId: tableResource.id,
              predicateId: hasPlayerPred.id,
              objectId: playerResource.id,
            },
          },
          update: { existent: true },
          create: {
            subjectId: tableResource.id,
            predicateId: hasPlayerPred.id,
            objectId: playerResource.id,
            projectId: params.projectId,
            existent: true,
          },
        });
      }
    }

    return tableResource;
  } catch (err) {
    console.warn('[PokerTableStore] Failed to sync semantic resource:', err);
    return null;
  }
}

/**
 * Updates a poker table resource to closed lifecycle state.
 */
export async function closePokerTableResource(
  prisma: any,
  tableId: string | number,
  reason: string = 'closed'
): Promise<void> {
  if (!prisma?.resource) return;

  const tableUri = `poker:table:${tableId}`;
  try {
    const res = await prisma.resource.findUnique({ where: { uri: tableUri } });
    if (res) {
      const meta = typeof res.metadata === 'object' && res.metadata ? res.metadata : {};
      await prisma.resource.update({
        where: { id: res.id },
        data: {
          metadata: {
            ...meta,
            status: POKER_TABLE_STATUS.CLOSED,
            isClosed: true,
            closingReason: reason,
            closedAt: new Date().toISOString(),
          },
        },
      });
    }
  } catch (err) {
    console.warn('[PokerTableStore] Failed to close table resource:', err);
  }
}

/**
 * High-performance query for finding unfinished poker tables for a user.
 * Evaluates in 1 single indexed query across Semantic Resources and Relations,
 * eliminating the N+1 sequential loop.
 */
export async function queryActivePokerTables(
  prisma: any,
  query: QueryPokerTablesParams
): Promise<ActivePokerTablesResult> {
  const tables: Array<{ id: string; tableId: string; title: string }> = [];

  // 1. Primary Path: Indexed Semantic Resources conforming to PokerTableShape
  if (prisma?.resource) {
    const whereClause: any = {
      existent: true,
      uri: { startsWith: 'poker:table:' },
    };
    if (query.projectId) {
      whereClause.projectId = query.projectId;
    }

    const resources = await prisma.resource.findMany({
      where: whereClause,
      include: {
        subjectRelations: {
          where: {
            existent: true,
            predicate: { uri: POKER_SHAPE_URIS.PLAYER_PREDICATE },
          },
          include: {
            object: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const r of resources) {
      const meta = typeof r.metadata === 'object' && r.metadata ? r.metadata : {};
      if (meta.isClosed || meta.status === POKER_TABLE_STATUS.CLOSED) {
        continue;
      }
      const tableId = String(meta.tableId || r.uri.replace('poker:table:', ''));
      const title = meta.tableName || r.title || `Table #${tableId}`;

      const players = (r.subjectRelations || []).map((rel: any) => rel.object).filter(Boolean);
      if (matchesPlayerQuery(players, r.userId, query)) {
        tables.push({ id: tableId, tableId, title });
      }
    }
  }

  // 2. Compatibility Path: If no semantic resources were found (e.g. legacy databases or direct mock convs),
  // query conversations with a single JOIN to eliminate the N+1 loop.
  if (tables.length === 0 && prisma?.conversation) {
    const convs = await prisma.conversation.findMany({
      where: {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        existent: true,
      },
      include: {
        requests: {
          take: 1,
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });

    for (const c of convs) {
      let meta: any = {};
      try {
        meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : (c.metadata || {});
      } catch (_) {}
      if (meta.isLobby || meta.type === 'poker_lobby' || meta.isClosed) continue;
      if (meta.type !== 'poker_table' && !meta.tableName && meta.ruleset !== 'texas_holdem_nl') continue;

      const latestReq = c.requests?.[0];
      if (isTableUnfinishedForUser(c, latestReq, query as UnfinishedGameUserQuery)) {
        const id = String(c.id);
        const title = meta.tableName || c.title || `Table #${id}`;
        if (!tables.some((t) => t.tableId === id)) {
          tables.push({ id, tableId: id, title });
        }
      }
    }
  }

  const choices = formatTableChoices(tables);
  return {
    tables,
    choices,
    hasUnfinishedGames: tables.length > 0,
    count: tables.length,
  };
}
