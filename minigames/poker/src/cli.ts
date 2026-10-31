#!/usr/bin/env node
import './env.ts';

// 1. Immediate bootstrap log executed on millisecond 0 (before heavy imports)
const isQuietBoot = process.argv.includes('-q') || process.argv.includes('--quiet') || process.env.LOG_LEVEL === 'silent' || process.env.LOG_LEVEL === 'none';
if (!isQuietBoot) {
  console.log('\x1b[36m[Poker CLI] Booting Texas Hold\'em Engine...\x1b[0m', process.argv.slice(2).join(' ') || '(default play)');
}

import { Command } from 'commander';

const program = new Command();

program
  .name('poker')
  .description('Curator Texas Hold\'em MiniApp & Game Engine powered by CuratorHost and RequestProcessor')
  .version('1.0.0')
  .option('--profile <names>', 'Active config profiles, comma separated (loads poker.config.<profile>.yaml and .env.<profile>)')
  .option('--log-level <level>', 'Set log level (error, warn, info, debug, silent)')
  .option('--debug', 'Enable debug log level')
  .option('-q, --quiet', 'Quiet mode (suppress verbose logs)', false)
  .hook('preAction', async (thisCommand) => {
    const opts = thisCommand.opts();
    const effective = opts.debug ? 'debug' : (opts.quiet ? 'error' : (opts.logLevel || process.env.LOG_LEVEL));
    if (effective) {
      const { setLogLevel } = await import('./curator.ts');
      setLogLevel(effective);
    }
  });

// 2. Standalone AST-driven Poker Server command (Mode A)
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
  .option('--log-level <level>', 'Set log level (error, warn, info, debug, silent)')
  .option('--debug', 'Enable debug log level')
  .option('-q, --quiet', 'Quiet mode', false)
  .option('-v, --verbose', 'Verbose logging', false)
  .action(async (opts) => {
    const effectiveLogLevel = opts.debug ? 'debug' : (opts.quiet ? 'error' : (opts.logLevel || program.opts().logLevel || process.env.LOG_LEVEL));
    if (effectiveLogLevel) {
      const { setLogLevel } = await import('./curator.ts');
      setLogLevel(effectiveLogLevel);
    }

    if (!opts.quiet) {
      console.log(`\x1b[36m[Poker CLI] Loading server runtime and AST engine...\x1b[0m`);
    }
    const { createPokerServer } = await import('./server/pokerServer.ts');

    if (!opts.quiet) {
      console.log(`\x1b[1m\x1b[36mStarting Curator Texas Hold'em Server on ${opts.host}:${opts.port}...\x1b[0m`);
    }
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
      logLevel: effectiveLogLevel,
      debug: Boolean(opts.debug),
      quiet: Boolean(opts.quiet),
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

// 3. Play command (Single tabletop chat experience: direct in-process or remote network client)
program
  .command('play', { isDefault: true })
  .description('Play Texas Hold\'em (network client or lightweight direct execution)')
  .option('--direct', 'Run direct lightweight execution mode locally (zero network APIs)', false)
  .option('--step', 'Direct mode: step the processor synchronously, one request at a time (deterministic)', false)
  .option('--poll-interval <ms>', 'Direct mode: processor poll interval in ms', '300')
  .option('--server <url>', 'Poker server URL', 'http://127.0.0.1:4000')
  .option('-t, --table <id>', 'Target table/conversation ID to join')
  .option('-c, --chips <amount>', 'Starting chips for each player (direct mode)', '1000')
  .option('-s, --seats <count>', 'Number of player seats at the table (2-6, direct mode)', '4')
  .option('--sb <amount>', 'Small blind amount (direct mode)', '10')
  .option('--bb <amount>', 'Big blind amount (direct mode)', '20')
  .option('--db <path>', 'Custom SQLite database path (direct mode)')
  .option('-r, --reset', 'Reset database before running (direct mode)', false)
  .option('-R, --reset-light', 'Light reset: clear conversations, requests, and responses before running', false)
  .option('--name <player>', 'Your player name')
  .option('--log-level <level>', 'Set log level (error, warn, info, debug, silent)')
  .option('--debug', 'Enable debug log level')
  .option('-q, --quiet', 'Quiet mode (suppress verbose logs)', false)
  .action(async (opts) => {
    const effectiveLogLevel = opts.debug ? 'debug' : (opts.quiet ? 'error' : (opts.logLevel || program.opts().logLevel || process.env.LOG_LEVEL));
    if (effectiveLogLevel) {
      const { setLogLevel } = await import('./curator.ts');
      setLogLevel(effectiveLogLevel);
    }

    if (!opts.quiet) {
      console.log('\x1b[36m[Poker CLI] Loading tabletop client runtime...\x1b[0m');
    }
    const { runPokerClient } = await import('./client/pokerClient.ts');

    if (opts.direct) {
      if (!opts.quiet) {
        console.log('\x1b[36m[Poker CLI] Launching direct lightweight in-process execution...\x1b[0m');
      }
      await runPokerClient({
        direct: true,
        drive: opts.step ? 'step' : 'processor',
        pollInterval: parseInt(opts.pollInterval, 10) || 300,
        databasePath: opts.db,
        forceReset: Boolean(opts.reset),
        resetLight: Boolean(opts.resetLight),
        maxSeats: parseInt(opts.seats, 10) || 4,
        startingChips: parseInt(opts.chips, 10) || 1000,
        smallBlind: parseInt(opts.sb, 10) || 10,
        bigBlind: parseInt(opts.bb, 10) || 20,
        playerName: opts.name,
        logLevel: effectiveLogLevel,
        debug: Boolean(opts.debug),
        quiet: Boolean(opts.quiet),
      });
    } else {
      if (!opts.quiet) {
        console.log(`\x1b[36m[Poker CLI] Connecting to Poker Server at ${opts.server}...\x1b[0m`);
      }
      await runPokerClient({
        serverUrl: opts.server,
        tableId: opts.table,
        playerName: opts.name,
        logLevel: effectiveLogLevel,
        debug: Boolean(opts.debug),
        quiet: Boolean(opts.quiet),
      });
    }
  });

// 4. Standalone Light Reset command: cleans conversations, requests, and responses in 20ms
program
  .command('reset')
  .description('Light reset: clean all conversations, requests, and responses to test from scratch')
  .option('--db <path>', 'Custom SQLite database path')
  .action(async (opts) => {
    console.log('\x1b[36m[Poker CLI] Running light database reset...\x1b[0m');
    const { resetPokerDatabaseLight } = await import('./db/lightReset.ts');
    await resetPokerDatabaseLight(undefined, { databasePath: opts.db });
  });

// 5. Standard Curator Host commands (seed, status, exec, run, trigger, chat, agent)
// Attached dynamically with lazy factory so heavy host modules only load if invoked
const hostCommands = ['seed', 'status', 'exec', 'run', 'trigger', 'chat', 'agent'];
for (const cmd of hostCommands) {
  program
    .command(cmd === 'exec' ? 'exec <toolName>' : cmd === 'run' ? 'run <agentName>' : cmd === 'trigger' ? 'trigger <agentName>' : cmd === 'chat' ? 'chat [agentName]' : cmd === 'agent' ? 'agent <agentName>' : cmd)
    .allowUnknownOption(true)
    .description(`Curator Host command: ${cmd}`)
    .action(async (...args) => {
      console.log(`\x1b[36m[Poker CLI] Loading CuratorHost for "${cmd}"...\x1b[0m`);
      const { createHostCli } = await import('./curatorHost.ts');
      const { createPokerHost } = await import('./host.ts');
      const subProgram = createHostCli(createPokerHost, { name: 'poker' });
      await subProgram.parseAsync(process.argv);
    });
}

program.parse(process.argv);
