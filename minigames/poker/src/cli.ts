#!/usr/bin/env node

import { createHostCli } from '@curator/host';
import { createPokerHost } from './host.js';
import { createPokerServer } from './server/pokerServer.js';
import { runPokerClient } from './client/pokerClient.js';
import { createPokerDirectRunner } from './runner/pokerDirectRunner.js';

// 1. Initialize standardized Curator Host CLI
const program = createHostCli(createPokerHost, {
  name: 'poker',
  description: 'Curator Texas Hold\'em MiniApp & Game Engine powered by CuratorHost and RequestProcessor',
  version: '1.0.0',
});

// 2. Add 'serve' command for running the standalone AST-driven server (Mode A)
program
  .command('serve')
  .description('Start the standalone AST-driven Poker Server with WebSocket streaming and RequestProcessor')
  .option('-p, --port <number>', 'Server port', '4000')
  .option('--host <address>', 'Server host address', '127.0.0.1')
  .option('-c, --chips <amount>', 'Starting chips for each player', '1000')
  .option('-s, --seats <count>', 'Number of player seats at the table (2-6)', '4')
  .option('--sb <amount>', 'Small blind amount', '10')
  .option('--bb <amount>', 'Big blind amount', '20')
  .option('--db <path>', 'Custom SQLite database path')
  .option('-r, --reset', 'Reset database before running', false)
  .option('--poll-interval <ms>', 'Processor poll interval in ms', '300')
  .option('-v, --verbose', 'Verbose logging', false)
  .action(async (opts) => {
    console.log(`\x1b[1m\x1b[36mStarting Curator Texas Hold'em Server on ${opts.host}:${opts.port}...\x1b[0m`);
    const serverInstance = await createPokerServer({
      port: parseInt(opts.port, 10) || 4000,
      host: opts.host || '127.0.0.1',
      databasePath: opts.db,
      forceReset: Boolean(opts.reset),
      maxSeats: parseInt(opts.seats, 10) || 4,
      startingChips: parseInt(opts.chips, 10) || 1000,
      smallBlind: parseInt(opts.sb, 10) || 10,
      bigBlind: parseInt(opts.bb, 10) || 20,
      pollInterval: parseInt(opts.pollInterval, 10) || 300,
      verbose: Boolean(opts.verbose),
    });

    console.log(`\x1b[32m✔ Server listening at: ${serverInstance.url}\x1b[0m`);
    console.log(`\x1b[32m✔ WebSocket events stream: ${serverInstance.wsUrl}\x1b[0m`);
    console.log('\x1b[36mTable AST workflow active. Connect client with: npm run play\x1b[0m\n');

    const shutdown = async () => {
      console.log('\n\x1b[33mStopping Poker Server...\x1b[0m');
      await serverInstance.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// 3. Add 'run' command for direct synchronous execution (Mode B)
program
  .command('run')
  .description('Run Texas Hold\'em locally in synchronous step mode (no network server required)')
  .option('-c, --chips <amount>', 'Starting chips for each player', '1000')
  .option('-s, --seats <count>', 'Number of player seats at the table (2-6)', '4')
  .option('--sb <amount>', 'Small blind amount', '10')
  .option('--bb <amount>', 'Big blind amount', '20')
  .option('--db <path>', 'Custom SQLite database path')
  .option('-r, --reset', 'Reset database before running', false)
  .option('--name <player>', 'Your player name', 'You')
  .action(async (opts) => {
    const runner = await createPokerDirectRunner({
      databasePath: opts.db,
      forceReset: Boolean(opts.reset),
      maxSeats: parseInt(opts.seats, 10) || 4,
      startingChips: parseInt(opts.chips, 10) || 1000,
      smallBlind: parseInt(opts.sb, 10) || 10,
      bigBlind: parseInt(opts.bb, 10) || 20,
    });
    await runner.runInteractiveCli({ playerName: opts.name });
  });

// 4. Add 'play' command (supports both network client and --direct)
program
  .command('play', { isDefault: true })
  .description('Play Texas Hold\'em (network client or direct execution)')
  .option('--direct', 'Run direct synchronous execution mode locally', false)
  .option('--server <url>', 'Poker server URL', 'http://127.0.0.1:4000')
  .option('--name <player>', 'Your player name', 'You')
  .action(async (opts) => {
    if (opts.direct) {
      const runner = await createPokerDirectRunner();
      await runner.runInteractiveCli({ playerName: opts.name });
    } else {
      await runPokerClient({
        serverUrl: opts.server,
        playerName: opts.name,
      });
    }
  });

program.parse(process.argv);
