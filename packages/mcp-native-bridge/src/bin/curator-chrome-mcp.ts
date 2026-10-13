#!/usr/bin/env node

import { Command } from 'commander';
import { BridgeServer } from '../BridgeServer.js';

const program = new Command();

program
  .name('curator-chrome-mcp')
  .description('Model Context Protocol (MCP) desktop bridge for Curator Chrome Extension')
  .option('-p, --port <port>', 'WebSocket port to listen on for Chrome Extension', (val) => parseInt(val, 10), 8765)
  .option('-h, --host <host>', 'Host address to bind WebSocket to', '127.0.0.1')
  .action(async (options) => {
    try {
      const bridge = new BridgeServer({
        port: options.port,
        host: options.host,
        serverName: 'curator-chrome-bridge',
        serverVersion: '1.0.0',
      });

      await bridge.listen();

      // Keep process alive for stdio transport
      process.on('SIGINT', async () => {
        await bridge.close();
        process.exit(0);
      });
      process.on('SIGTERM', async () => {
        await bridge.close();
        process.exit(0);
      });
    } catch (err: any) {
      console.error('[curator-chrome-mcp] Startup error:', err?.message || err);
      process.exit(1);
    }
  });

program.parse(process.argv);
