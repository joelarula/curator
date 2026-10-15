import os from 'node:os';
import path from 'node:path';
import { provisionSqliteDb } from '@curator/agent-server';

export interface PokerSeedOptions {
  dbName?: string;
  databasePath?: string;
  forceReset?: boolean;
  userEmail?: string;
  userName?: string;
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
 * Seeds the standard SQLite database for the Curator Texas Hold'em game session.
 * Ensures the system User, Project, Conversation, and initial Request records exist.
 */
export async function seedPokerDatabase(options: PokerSeedOptions = {}): Promise<PokerSeedResult> {
  const dbName = options.dbName || 'poker-minigame';
  const dbPath =
    options.databasePath ||
    process.env.CURATOR_DATABASE_PATH ||
    path.join(process.env.TEMP || os.tmpdir(), 'curator-poker.db');

  const prisma: any = await provisionSqliteDb(dbName, options.forceReset ?? false, {
    databasePath: dbPath,
  });

  const email = options.userEmail || 'hero@tabletop.local';
  const userName = options.userName || 'You (Hero)';

  let user = await prisma.user.findFirst({
    where: { email },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { id: 'hero-user-1', name: userName, email },
    });
  }

  const projectId = options.projectId || 'poker-project-1';
  const projectName = options.projectName || 'Texas Holdem Lounge';

  let project = await prisma.project.findFirst({
    where: { id: projectId },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { id: projectId, name: projectName, userId: user.id },
    });
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
          ruleset: options.ruleset || 'texas_holdem_nl',
          maxSeats: options.maxSeats || 4,
        },
      },
    });
  }

  const rootRequest = await prisma.request.create({
    data: {
      userId: user.id,
      projectId: project.id,
      conversationId: conversation.id,
      toolName: 'poker_session',
      status: 'NEW',
    },
  });

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
