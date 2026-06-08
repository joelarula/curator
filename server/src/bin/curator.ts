#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { RequestProcessor } from '../services/RequestProcessor.js';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { Command } from 'commander';

import { Curator, CuratorBuilder } from '../services/Curator.js';
import { getRegisteredTools } from '../services/Tools.js';
import { TOOL_NAMES } from '../services/tools/manifest.js';
import { ensureDefaultProject } from '../services/DefaultProjectService.js';

const program = new Command();
const TOOL_NAME_SET = new Set<string>(TOOL_NAMES);

type CliOptions = {
  db?: string;
  reset?: boolean;
  printAst?: boolean;
  dryRun?: boolean;
  user?: string;
  project?: string;
};

type StageMode = 'chain' | 'spawn';

type ParsedStage = {
  mode: StageMode;
  tool: string;
  args: Record<string, any>;
};

const POSITIONAL_ARG_MAP: Record<string, string[]> = {
  process_feed: ['url'],
  fetch_html: ['url'],
  scrape_resource: ['url'],
  web_search: ['query'],
  ask_llm: ['prompt']
};

function isRegisteredTool(name: string): boolean {
  return TOOL_NAME_SET.has(name);
}

function coerceValue(raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed.length) return raw;

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }

  return raw;
}

function addArg(args: Record<string, any>, key: string, value: any): void {
  if (!(key in args)) {
    args[key] = value;
    return;
  }

  if (!Array.isArray(args[key])) {
    args[key] = [args[key]];
  }
  args[key].push(value);
}

function parseStageArgs(tool: string, tokens: string[]): Record<string, any> {
  const args: Record<string, any> = {};
  const positional: any[] = [];

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        addArg(args, key, coerceValue(next));
        i += 2;
      } else {
        addArg(args, key, true);
        i += 1;
      }
      continue;
    }

    positional.push(coerceValue(token));
    i += 1;
  }

  const mappedKeys = POSITIONAL_ARG_MAP[tool] || [];
  for (let idx = 0; idx < mappedKeys.length && idx < positional.length; idx += 1) {
    const key = mappedKeys[idx];
    if (!(key in args)) {
      args[key] = positional[idx];
    }
  }

  if (positional.length > mappedKeys.length) {
    args._ = positional.slice(mappedKeys.length);
  }

  return args;
}

function parsePipelineTokens(initialTool: string, tokens: string[]): { stages: ParsedStage[]; options: CliOptions } {
  const options: CliOptions = {};
  const stages: ParsedStage[] = [];

  let currentMode: StageMode = 'chain';
  let currentTool = initialTool;
  let currentTokens: string[] = [];

  const commitCurrentStage = () => {
    stages.push({
      mode: currentMode,
      tool: currentTool,
      args: parseStageArgs(currentTool, currentTokens)
    });
    currentTokens = [];
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '--chain' || token === '--spawn') {
      commitCurrentStage();
      const nextTool = tokens[i + 1];
      if (!nextTool || nextTool.startsWith('--')) {
        throw new Error(`Expected a tool name after ${token}`);
      }
      if (!isRegisteredTool(nextTool)) {
        throw new Error(`Unknown tool: ${nextTool}`);
      }
      currentMode = token === '--spawn' ? 'spawn' : 'chain';
      currentTool = nextTool;
      i += 2;
      continue;
    }

    if (token === '--db') {
      const db = tokens[i + 1];
      if (!db || db.startsWith('--')) {
        throw new Error('Expected a database name after --db');
      }
      options.db = db;
      i += 2;
      continue;
    }

    if (token === '--user') {
      const user = tokens[i + 1];
      if (!user || user.startsWith('--')) {
        throw new Error('Expected a user email or ID after --user');
      }
      options.user = user;
      i += 2;
      continue;
    }

    if (token === '--project') {
      const project = tokens[i + 1];
      if (!project || project.startsWith('--')) {
        throw new Error('Expected a project ID after --project');
      }
      options.project = project;
      i += 2;
      continue;
    }

    if (token === '--reset') {
      options.reset = true;
      i += 1;
      continue;
    }

    if (token === '--print-ast') {
      options.printAst = true;
      i += 1;
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      i += 1;
      continue;
    }

    currentTokens.push(token);
    i += 1;
  }

  commitCurrentStage();
  return { stages, options };
}

function buildAstFromStages(stages: ParsedStage[]): any {
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

  const toolTaskFor = (stage: ParsedStage) => ({
    id: nextId(`tool_${stage.tool.replace(/[^a-zA-Z0-9_]/g, '_')}`),
    type: 'ToolTask',
    tool: stage.tool,
    args: stage.args
  });

  const steps = stages.map((stage) => {
    if (stage.mode === 'spawn') {
      return {
        id: nextId('spawn'),
        type: 'Spawn',
        body: {
          id: nextId('seq'),
          type: 'Sequence',
          steps: [toolTaskFor(stage)]
        }
      };
    }
    return toolTaskFor(stage);
  });

  return {
    id: nextId('seq_root'),
    type: 'Sequence',
    steps
  };
}

async function connectPrisma(opts: CliOptions): Promise<{ prisma: PrismaClient; pool: InstanceType<typeof Pool> | null }> {
  let pool: InstanceType<typeof Pool> | null = null;
  let prisma: PrismaClient;

  if (opts.db) {
    const { provisionSqliteDb } = await import('./sqliteProvisioner.js');
    prisma = await provisionSqliteDb(opts.db, opts.reset);
  } else {
    console.log('[Curator] Connecting to PostgreSQL...');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool as any);
    prisma = new PrismaClient({ adapter });
  }

  return { prisma, pool };
}

async function resolveUserAndProject(prisma: PrismaClient, opts: CliOptions) {
  let user = null;
  if (opts.user) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: opts.user },
          { email: opts.user }
        ]
      }
    });
    if (!user) {
      if (opts.user.includes('@')) {
        console.log(`[Curator] User "${opts.user}" not found. Auto-creating user...`);
        user = await prisma.user.create({
          data: {
            email: opts.user,
            name: opts.user.split('@')[0]
          }
        });
      } else {
        throw new Error(`User "${opts.user}" not found.`);
      }
    }
  } else {
    user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found in database.');
  }

  let projectId = opts.project || null;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: user.id
      }
    });
    if (!project && projectId !== 'system') {
      console.warn(`[Warning] Project context "${projectId}" not found or not owned by user "${user.id}".`);
    }
  } else {
    const defaultProject = await ensureDefaultProject(prisma as any, user.id);
    projectId = defaultProject.id;
  }

  return { userId: user.id, projectId };
}

async function executeAstRequest(
  prisma: PrismaClient, 
  ast: any, 
  title: string = 'PIPELINE',
  userId: string,
  projectId: string | null = null
): Promise<void> {
  const processor = new RequestProcessor(prisma);
  processor.isAdHoc = true;

  let conversation = await prisma.conversation.findFirst({ where: { userId } });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { userId } });
  }

  const request = await prisma.request.create({
    data: {
      userId,
      projectId,
      conversationId: conversation.id,
      toolName: 'AST_Root',
      ast,
      status: 'NEW'
    }
  });

  await processor.processRequest(request);

  const response = await prisma.response.findFirst({
    where: { requestId: request.id },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`--- ${title} RETURN ---`);
  console.log(JSON.stringify(response?.content, null, 2));
  console.log('---------------------');
}

// Base program configuration
program
  .name('curator')
  .description('Curator Script and Tool Executor')
  .version('1.0.0');

// -------------------------------------------------------------------
// Sub-command: `curator help`
// -------------------------------------------------------------------
program
  .command('help')
  .description('Display usage information')
  .action(() => {
    program.help();
  });

// -------------------------------------------------------------------
// Sub-command: `curator run <script> [args...]`
// -------------------------------------------------------------------
program
  .command('run')
  .description('Execute a Curator script (.ts, .js, .coffee, .yaml)')
  .argument('<script>', 'Path to the Curator script file')
  .argument('[args...]', 'Optional arguments passed to the script')
  .option('--db <name>', 'Use a named local SQLite database (auto-provisioned if new)')
  .option('--reset', 'Force reset (delete) the SQLite database before running the script')
  .option('--print-ast', 'Print the resolved AST and continue execution')
  .option('--dry-run', 'Resolve and print AST only, without creating a Request')
  .option('--user <email_or_id>', 'Run the script as a specific user (email or ID)')
  .option('--project <id>', 'Run the script under a specific project context')
  .action(async (scriptArg: string, argsArg: string[], opts: CliOptions) => {
    const scriptPath = path.resolve(scriptArg);
    const scriptArgsStr = argsArg.join(' ');
    let scriptArgs: any = argsArg;

    // Try to parse JSON args if provided and it looks like an object/array
    if (scriptArgsStr.trim().startsWith('{') || scriptArgsStr.trim().startsWith('[')) {
      try {
        scriptArgs = JSON.parse(scriptArgsStr);
      } catch {
        console.warn('[Curator] Failed to parse JSON args, using as raw strings.');
      }
    }

    const { prisma, pool } = await connectPrisma(opts);

    try {
      const { userId, projectId } = await resolveUserAndProject(prisma, opts);
      console.log(`[Curator] User resolved: ${userId}, Project resolved: ${projectId || 'None'}`);

      console.log(`[Curator] Importing script: ${scriptPath}`);
      (Curator as any).setArgs(scriptArgs, scriptArgsStr);

      // Resolve or create a conversation
      let conversation = await prisma.conversation.findFirst({ where: { userId } });
      if (!conversation) {
        conversation = await prisma.conversation.create({ data: { userId } });
      }

      // Resolve the AST to execute
      let ast: any = null;

      const isCffe = scriptPath.endsWith('.coffee') || scriptPath.endsWith('.yaml') || scriptPath.endsWith('.yml');
      if (isCffe) {
        const fs = await import('node:fs');
        const { ScriptRunner } = await import('../services/ScriptRunner.js');
        const fileContent = fs.readFileSync(scriptPath, 'utf-8');
        ast = await ScriptRunner.evaluate(fileContent, scriptArgs, prisma, userId);
      } else {
        const { pathToFileURL } = await import('node:url');
        const imported = await import(pathToFileURL(scriptPath).href);
        console.log(`[Curator] Script imported. Root chains:`, (Curator as any).rootChains.length);

        // Option A: script explicitly exported a Pipeline instance
        for (const val of Object.values(imported)) {
          if (val && typeof val === 'object' && 'toAST' in val && typeof (val as any).toAST === 'function') {
            ast = (val as any).toAST();
            break;
          }
        }

        // Option B: fallback to implicit legacy CuratorBuilder chains
        if (!ast) {
          const chains = (Curator as any).rootChains as CuratorBuilder[];
          if (chains.length > 0) {
            const primaryBuilder = chains.find(c => c.toJSON() !== null) || chains[chains.length - 1];
            ast = primaryBuilder?.toJSON();
          }
        }
      }

      if (!ast) {
        console.log('[Curator] No valid workflow or chain was found in the script.');
        return;
      }

      if (opts.printAst || opts.dryRun) {
        console.log('--- SCRIPT AST ---');
        console.log(JSON.stringify(ast, null, 2));
        console.log('------------------');
      }

      if (opts.dryRun) {
        console.log('[Curator] Dry run complete.');
        return;
      }

      await executeAstRequest(prisma, ast, 'SCRIPT', userId, projectId);
      console.log(`[Curator] Script execution finished.`);
    } catch (error: any) {
      console.error(`[Curator] Error: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
      if (pool) await pool.end();
      console.log('[Curator] Cleanup complete.');
    }
  });

for (const tool of getRegisteredTools()) {
  if (tool.name.startsWith('internal:')) continue;
  if (tool.name === 'help' || tool.name === 'run') continue;

  program
    .command(tool.name)
    .description(tool.description)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[tokens...]', 'Tool args plus optional --chain/--spawn segments')
    .addHelpText(
      'after',
      '\nExamples:\n  curator process_feed https://example.com/rss.xml --db local\n  curator process_feed https://example.com/rss.xml --chain debug --message done\n  curator process_feed https://example.com/rss.xml --spawn classify_udc --resourceUri {{toolData.scrape_resource.uri}}\n'
    )
    .action(async () => {
      const cmdIndex = process.argv.findIndex((arg) => arg === tool.name);
      const rawTokens = cmdIndex >= 0 ? process.argv.slice(cmdIndex + 1) : [];

      try {
        const { stages, options } = parsePipelineTokens(tool.name, rawTokens);
        const ast = buildAstFromStages(stages);

        if (options.printAst || options.dryRun) {
          console.log('--- PIPELINE AST ---');
          console.log(JSON.stringify(ast, null, 2));
          console.log('--------------------');
        }

        if (options.dryRun) {
          console.log('[Curator] Dry run complete.');
          return;
        }

        const { prisma, pool } = await connectPrisma(options);
        try {
          const { userId, projectId } = await resolveUserAndProject(prisma, options);
          console.log(`[Curator] User resolved: ${userId}, Project resolved: ${projectId || 'None'}`);
          await executeAstRequest(prisma, ast, 'PIPELINE', userId, projectId);
          console.log('[Curator] Pipeline execution finished.');
        } finally {
          await prisma.$disconnect();
          if (pool) await pool.end();
          console.log('[Curator] Cleanup complete.');
        }
      } catch (error: any) {
        const known = TOOL_NAMES.filter((name) => !name.startsWith('internal:')).join(', ');
        console.error(`[Curator] Error: ${error.message}`);
        console.error(`[Curator] Known tools: ${known}`);
        process.exitCode = 1;
      }
    });
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
