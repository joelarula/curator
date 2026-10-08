#!/usr/bin/env node

import { Command } from 'commander';
import { createCuratorHost } from '../createCuratorHost.js';

const program = new Command();

program
  .name('curator-seed')
  .description('Idempotently seed tools, scripts, and agent workflows into the Curator database')
  .option('-n, --name <name>', 'Project/host name', 'curator')
  .option('-d, --data-dir <path>', 'Data directory path', process.env.DATA_DIR ?? './data')
  .option('-p, --db-path <path>', 'Direct SQLite database file path')
  .option('-u, --db-url <url>', 'Database connection URL (MariaDB/MySQL or SQLite)')
  .action(async (options) => {
    try {
      console.log(`[curator-seed] Initializing Curator host for project "${options.name}"...`);
      const host = await createCuratorHost({
        name: options.name,
        dataDir: options.dataDir,
        curatorDb: {
          path: options.dbPath,
          url: options.dbUrl,
        },
      });

      console.log('[curator-seed] Seeding tools and agents...');
      const result = await host.seed();

      console.log(
        JSON.stringify(
          {
            status: 'success',
            name: options.name,
            databasePath: result.databasePath,
            tools: result.seededTools,
            agents: result.seededAgents,
          },
          null,
          2
        )
      );

      await host.stop();
      process.exit(0);
    } catch (err: any) {
      console.error('[curator-seed] Seeding failed:', err?.message || err);
      process.exit(1);
    }
  });

program.parse(process.argv);
