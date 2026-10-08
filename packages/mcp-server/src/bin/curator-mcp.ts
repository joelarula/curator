#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { createCuratorHost } from '@curator/host';
import { createMcpServer } from '../createMcpServer.js';

const program = new Command();

program
  .name('curator-mcp')
  .description('Start the Curator Model Context Protocol (MCP) server on stdio')
  .option('-n, --name <name>', 'Project or host name', 'curator')
  .option('-d, --data-dir <path>', 'Data directory path', process.env.DATA_DIR ?? './data')
  .option('-p, --db-path <path>', 'Direct SQLite database path', process.env.CURATOR_DATABASE_PATH)
  .option('-c, --config <path>', 'Custom host bootstrap file path (ESM)')
  .action(async (options) => {
    try {
      let host: any;

      if (options.config) {
        const configPath = path.resolve(options.config);
        const mod = await import(pathToFileURL(configPath).href);
        if (typeof mod.createMcpHost === 'function') {
          host = await mod.createMcpHost();
        } else if (typeof mod.createCuratorHost === 'function') {
          host = await mod.createCuratorHost();
        } else if (mod.host) {
          host = mod.host;
        } else if (typeof mod.default === 'function') {
          host = await mod.default();
        } else {
          throw new Error(`Config module at ${options.config} must export createMcpHost(), createCuratorHost(), host, or default function`);
        }
      } else {
        host = await createCuratorHost({
          name: options.name,
          dataDir: options.dataDir,
          curatorDb: {
            path: options.dbPath,
          },
        });
        await host.start();
      }

      const mcpInstance = await createMcpServer({
        name: `${options.name}-mcp`,
        engine: host.engine,
        prisma: host.prisma,
        host,
        transport: 'stdio',
        registerBuiltinPlugins: true,
      });

      await mcpInstance.listen();
    } catch (err: any) {
      console.error('[curator-mcp] Startup error:', err?.message || err);
      process.exit(1);
    }
  });

program.parse(process.argv);
