import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPokerHost } from '../host.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_POKER_DB = path.resolve(__dirname, '../../data/poker.db');

export interface PokerSeedOptions {
  dbName?: string;
  databasePath?: string;
  forceReset?: boolean;
  userEmail?: string;
  userName?: string;
  userId?: string;
  projectId?: string;
  projectName?: string;
  ruleset?: string;
  maxSeats?: number;
}

export interface PokerSeedResult {
  prisma: any;
  user: any;
  project: any;
  conversation: any;
  rootRequest: any;
  dbPath: string;
}

/**
 * Seeds the standard SQLite database for the Curator Texas Hold'em game session via CuratorHost.
 * Idempotently provisions tables, scripts, agents, and default project/conversation records.
 */
export async function seedPokerDatabase(options: PokerSeedOptions = {}): Promise<PokerSeedResult> {
  const dbPath =
    options.databasePath ||
    process.env.CURATOR_DATABASE_PATH ||
    DEFAULT_POKER_DB;

  const email = options.userEmail || 'system@curator.local';
  const userName = options.userName || 'Curator System';
  const userId = options.userId || 'system';
  const projectId = options.projectId || 'poker-project-1';
  const projectName = options.projectName || 'Texas Holdem Lounge';

  // Delegate initial bootstrapping and idempotent script/agent/tool seeding to CuratorHost
  const host = await createPokerHost({
    projectId,
    projectName,
    userEmail: email,
    userName,
    userId,
    databasePath: dbPath,
    quiet: false,
    autoSeed: true,
  });

  const prisma: any = host.prisma;

  let user = await prisma.user.findFirst({
    where: { OR: [{ email }, { id: userId }] },
  });

  let project = await prisma.project.findFirst({
    where: { OR: [{ id: projectId }, { name: projectName }] },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        projectId: project.id,
        metadata: {
          ruleset: options.ruleset || 'texas_holdem_nl',
          maxSeats: options.maxSeats || 4,
        },
      },
    });
  }

  let rootRequest = await prisma.request.findFirst({
    where: {
      projectId: project.id,
      conversationId: conversation.id,
    },
  });
  if (!rootRequest) {
    rootRequest = await prisma.request.create({
      data: {
        userId: user.id,
        projectId: project.id,
        conversationId: conversation.id,
        toolName: 'poker_session',
        status: 'COMPLETED',
      },
    });
  }

  return {
    prisma,
    user,
    project,
    conversation,
    rootRequest,
    dbPath,
  };
}

// Standalone execution if invoked directly
if (process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))) {
  console.log('[Seed] Seeding Curator Texas Hold\'em database...');
  seedPokerDatabase()
    .then((res) => {
      console.log(`[Seed] ✔ Successfully seeded poker database at: ${res.dbPath}`);
      console.log(`[Seed] User: ${res.user.name} (${res.user.email})`);
      console.log(`[Seed] Project: ${res.project.name} (${res.project.id})`);
      console.log(`[Seed] Conversation ID: ${res.conversation.id}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] ✖ Failed to seed poker database:', err);
      process.exit(1);
    });
}
