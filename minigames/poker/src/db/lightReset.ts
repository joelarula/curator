import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_POKER_DB = path.resolve(__dirname, '../../data/poker.db');

/**
 * History outside Request/Response/Conversation: the event log, conversation-scoped subscriptions, and the
 * projected `poker:table:*` resources (with their triples), which would otherwise list deleted tables.
 */
const HISTORY_SQL = [
  'DELETE FROM EventLog;',
  'DELETE FROM EventSubscription WHERE conversationId IS NOT NULL;',
  "DELETE FROM Relation WHERE subjectId IN (SELECT id FROM Resource WHERE uri LIKE 'poker:table:%') OR objectId IN (SELECT id FROM Resource WHERE uri LIKE 'poker:table:%');",
  "DELETE FROM Resource WHERE uri LIKE 'poker:table:%';",
];

export interface ResetLightResult {
  deletedResponses: number;
  deletedRequests: number;
  deletedConversations: number;
}

/**
 * Performs an ultra-fast, non-destructive light reset of the poker database (sub-millisecond).
 * Cleans all Response, Request, and Conversation records (plus their event history and table resources) so the game
 * can be tested completely from scratch without touching Users, Projects, Roles, or Tools.
 */
export async function resetPokerDatabaseLight(
  prismaOrOptions?: any,
  options: { databasePath?: string; quiet?: boolean } = {}
): Promise<ResetLightResult> {
  const prisma = prismaOrOptions && typeof prismaOrOptions === 'object' && prismaOrOptions.conversation ? prismaOrOptions : null;
  const opts = prisma ? options : (prismaOrOptions || options);

  // If active PrismaClient is passed, use it directly
  if (prisma) {
    try {
      await prisma.$executeRawUnsafe('DELETE FROM _RequestResources;').catch(() => {});
      await prisma.$executeRawUnsafe('DELETE FROM _ConversationResources;').catch(() => {});
      for (const sql of HISTORY_SQL) await prisma.$executeRawUnsafe(sql).catch(() => {});
    } catch (_) {}

    const deletedResponses = (await prisma.response.deleteMany({})).count;
    const deletedRequests = (await prisma.request.deleteMany({})).count;
    const deletedConversations = (await prisma.conversation.deleteMany({})).count;

    if (!opts?.quiet) {
      console.log(`\x1b[32m✔ [Curator Reset] Light reset completed:\x1b[0m`);
      console.log(`  - \x1b[33m${deletedRequests}\x1b[0m requests cleared`);
      console.log(`  - \x1b[33m${deletedResponses}\x1b[0m responses cleared`);
      console.log(`  - \x1b[33m${deletedConversations}\x1b[0m tables/conversations cleared`);
      console.log(`\x1b[36mDatabase is clean and ready to test from scratch.\x1b[0m\n`);
    }

    return { deletedResponses, deletedRequests, deletedConversations };
  }

  // Standalone mode: ultra-fast direct execution using Node's native DatabaseSync (zero network/Prisma overhead)
  const dbPath = opts?.databasePath || process.env.CURATOR_DATABASE_PATH || DEFAULT_POKER_DB;

  if (!fs.existsSync(dbPath)) {
    if (!opts?.quiet) {
      console.log(`\x1b[33m[Curator Reset] Database file does not exist yet at ${dbPath}\x1b[0m`);
    }
    return { deletedResponses: 0, deletedRequests: 0, deletedConversations: 0 };
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = OFF;');
  let deletedResponses = 0;
  let deletedRequests = 0;
  let deletedConversations = 0;
  try {
    deletedResponses = Number(db.prepare('DELETE FROM Response;').run().changes);
  } catch (_) {}
  try {
    deletedRequests = Number(db.prepare('DELETE FROM Request;').run().changes);
  } catch (_) {}
  try {
    deletedConversations = Number(db.prepare('DELETE FROM Conversation;').run().changes);
  } catch (_) {}
  try { db.exec('DELETE FROM _RequestResources;'); } catch (_) {}
  try { db.exec('DELETE FROM _ConversationResources;'); } catch (_) {}
  for (const sql of HISTORY_SQL) {
    try { db.exec(sql); } catch (_) {}
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.close();

  if (!opts?.quiet) {
    console.log(`\x1b[32m✔ [Curator Reset] Light reset completed:\x1b[0m`);
    console.log(`  - \x1b[33m${deletedRequests}\x1b[0m requests cleared`);
    console.log(`  - \x1b[33m${deletedResponses}\x1b[0m responses cleared`);
    console.log(`  - \x1b[33m${deletedConversations}\x1b[0m tables/conversations cleared`);
    console.log(`\x1b[36mDatabase is clean and ready to test from scratch.\x1b[0m\n`);
  }

  return { deletedResponses, deletedRequests, deletedConversations };
}
