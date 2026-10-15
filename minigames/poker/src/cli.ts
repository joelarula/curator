#!/usr/bin/env node

import readline from 'node:readline';
import { createHostCli } from '@curator/host';
import { createPokerHost } from './host.js';
import { seedPokerDatabase } from './db/seed.js';
import { renderTable, renderNarratives, renderStandings } from './ui/tableRenderer.js';
import {
  promptGroupChatAction,
  promptGroupChatIntermission,
  askUser,
  type ChatChoice,
} from './ui/groupChatPrompt.js';
import {
  initPokerLobby,
  playPokerHand,
  checkPokerGameOver,
  getPokerStandings,
  type PlayerChoice,
} from './engine/pokerEngine.js';
import type { PlayerAction, PokerGameState } from './types.js';

/**
 * Generalized group chat turn prompt adapter for table actor choices.
 */
async function promptHumanAction(
  gameState: PokerGameState,
  legalChoices: PlayerChoice[],
  rl: readline.Interface,
  host: any,
  conversation: any,
  rootRequest: any,
  logTurn: (msg: string) => Promise<void>
): Promise<PlayerAction> {
  const humanSpeechTool = host.engine.tools.get('poker_human_speech');
  const heroPlayer = gameState.players.find((p) => p.isHuman) || gameState.players[0];

  const choices: ChatChoice<PlayerAction>[] = legalChoices.map((c) => ({
    id: c.id,
    label: c.label,
    value: c.action,
    aliases: [c.action.type, c.id],
  }));

  return promptGroupChatAction(rl, choices, {
    actorName: heroPlayer.name || 'You',
    participants: gameState.players,
    redrawView: () => {
      console.clear();
      console.log(renderTable(gameState, false));
    },
    logTurn,
    onSpeech: async (text, speechAct, targetParticipantId) => {
      if (!humanSpeechTool) return;
      const res: any = await humanSpeechTool.runAsync({
        args: {
          state: gameState,
          speechAct,
          text,
          targetId: targetParticipantId,
          speakerId: heroPlayer.id,
          speakerName: heroPlayer.name,
        },
        toolContext: { prisma: host.prisma, conversationId: conversation.id },
      });
      if (res?.gameState) {
        Object.assign(gameState, res.gameState);
      }
      return { aiReply: res?.aiResponse?.text };
    },
    onCommand: async (cmd, args) => {
      if (cmd === 'standings' || cmd === 's' || cmd === 'score') {
        const stdRes = getPokerStandings(gameState);
        console.log(renderStandings(stdRes.standings));
        return true;
      }
      if (cmd === 'narratives' || cmd === 'info' || cmd === 'n') {
        console.log(renderNarratives(gameState));
        return true;
      }
      if (cmd === 'table' || cmd === 'view') {
        console.clear();
        console.log(renderTable(gameState, false));
        return true;
      }
      return false;
    },
  });
}

// 1. Initialize standardized Curator Host CLI
const program = createHostCli(createPokerHost, {
  name: 'poker',
  description: 'Curator Texas Hold\'em MiniApp & Game Engine powered by CuratorHost and RequestProcessor',
  version: '1.0.0',
});

// 2. Add 'play' command (default process runner)
program
  .command('play', { isDefault: true })
  .description('Play an interactive or autoplay Texas Hold\'em session in a live host process')
  .option('-c, --chips <amount>', 'Starting chips for each player', '1000')
  .option('-s, --seats <count>', 'Number of player seats at the table (2-6)', '4')
  .option('--sb <amount>', 'Small blind amount', '10')
  .option('--bb <amount>', 'Big blind amount', '20')
  .option('-h, --hands <count>', 'Maximum number of hands to play (unlimited by default)')
  .option('--autoplay', 'Run autonomous simulation without interactive input pauses', false)
  .option('--db <path>', 'Custom SQLite database path')
  .option('-r, --reset', 'Reset and wipe the database before playing', false)
  .option('--poll-interval <ms>', 'CuratorRequestProcessor polling interval in milliseconds', '500')
  .option('-v, --verbose', 'Show verbose RequestProcessor worker logs', false)
  .action(async (opts) => {
    console.clear();
    console.log('\x1b[1m\x1b[36mInitializing Curator Texas Hold\'em Table Process...\x1b[0m');

    const startingChips = parseInt(opts.chips, 10) || 1000;
    const maxSeats = Math.min(6, Math.max(2, parseInt(opts.seats, 10) || 4));
    const smallBlind = parseInt(opts.sb, 10) || 10;
    const bigBlind = parseInt(opts.bb, 10) || 20;
    const maxHands = opts.hands ? parseInt(opts.hands, 10) : undefined;
    const isAutoplay = Boolean(opts.autoplay);
    const pollInterval = parseInt(opts.pollInterval, 10) || 500;

    // 1. Provision / connect SQLite database
    const { prisma, project, conversation, rootRequest, dbPath } = await seedPokerDatabase({
      databasePath: opts.db,
      forceReset: opts.reset,
      maxSeats,
    });

    // 2. Bootstrap CuratorHost runtime with registered PokerPlugin & CuratorRequestProcessor
    const host = await createPokerHost({
      databasePath: dbPath,
      quiet: !opts.verbose,
      intervalMs: pollInterval,
    });

    // Start background CuratorRequestProcessor polling loop
    await host.start(pollInterval);
    console.log(`\x1b[32m✔ CuratorHost & RequestProcessor running (polling every ${pollInterval}ms)\x1b[0m`);
    console.log('\x1b[32m✔ Connected to SQLite table database at:\x1b[0m', dbPath);

    // Graceful process termination handling
    let isShuttingDown = false;
    const handleShutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log('\n\x1b[33m[Host Process] Gracefully stopping CuratorRequestProcessor and table session...\x1b[0m');
      try {
        await host.stop();
      } catch (_) {}
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Turn response helper
    async function logTurn(content: string) {
      try {
        await prisma.response.create({
          data: {
            requestId: rootRequest.id,
            projectId: project.id,
            conversationId: conversation.id,
            content,
          },
        });
      } catch (_) {}
    }

    // Initialize table lobby
    const initRes = initPokerLobby({ tableId: String(conversation.id), startingChips });
    let gameState: PokerGameState = initRes.gameState;
    gameState.smallBlind = smallBlind;
    gameState.bigBlind = bigBlind;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (!isAutoplay) {
      console.log('\x1b[33mPress ENTER to start the session...\x1b[0m');
      await askUser(rl, '');
    }

    let keepPlaying = true;
    let handCounter = 0;

    try {
      while (keepPlaying) {
        if (maxHands && handCounter >= maxHands) {
          console.log(`\n\x1b[36m[SESSION COMPLETED] Reached target limit of ${maxHands} hand(s).\x1b[0m`);
          break;
        }

        const heroPlayer = gameState.players.find((p) => p.isHuman);
        if (!heroPlayer || heroPlayer.chips <= 0) {
          console.log('\n\x1b[31m[GAME OVER] You have busted out of the table!\x1b[0m');
          break;
        }

        handCounter++;

        // Orchestrate single hand via engine state machine
        const { gameState: nextState, winnerSummary } = await playPokerHand(
          gameState,
          {
            isAutoplay,
            onHumanTurn: (state, choices) =>
              promptHumanAction(state, choices, rl, host, conversation, rootRequest, logTurn),
            onTableUpdate: (state, actionDesc) => {
              if (!isAutoplay) {
                console.clear();
                console.log(renderTable(state, false));
                if (actionDesc) console.log(`\x1b[33m▶ ${actionDesc}\x1b[0m`);
              }
            },
            onStreetDealt: (state, street) => {
              if (!isAutoplay) {
                console.clear();
                console.log(renderTable(state, false));
                console.log(`\n\x1b[1m\x1b[36m[DEALER] Dealing ${street}...\x1b[0m`);
              }
            },
            onShowdown: (state, summary) => {
              console.clear();
              console.log(renderTable(state, true));
              console.log(`\n\x1b[1m\x1b[32m✔ ${summary}\x1b[0m\n`);
            },
            onTurnLogged: logTurn,
          },
          { prisma, conversationId: conversation.id }
        );

        gameState = nextState;

        const overRes = checkPokerGameOver(gameState);
        if (overRes.gameOver) {
          console.log(renderStandings(overRes.standings));
          console.log(`\n\x1b[1m\x1b[32m✔ [GAME OVER] ${overRes.winner} has conquered the table!\x1b[0m\n`);
          await logTurn(overRes.report);
          break;
        }

        if (isAutoplay) {
          await new Promise((r) => setTimeout(r, 600));
        } else {
          const heroPlayer = gameState.players.find((p) => p.isHuman) || gameState.players[0];
          const humanSpeechTool = host.engine.tools.get('poker_human_speech');

          const intermissionDecision = await promptGroupChatIntermission(
            rl,
            {
              actorName: heroPlayer.name || 'You',
              participants: gameState.players,
              redrawView: () => {
                console.clear();
                console.log(renderTable(gameState, true));
              },
              logTurn,
              onSpeech: async (text, speechAct, targetParticipantId) => {
                if (!humanSpeechTool) return;
                const res: any = await humanSpeechTool.runAsync({
                  args: {
                    state: gameState,
                    speechAct,
                    text,
                    targetId: targetParticipantId,
                    speakerId: heroPlayer.id,
                    speakerName: heroPlayer.name,
                  },
                  toolContext: { prisma: host.prisma, conversationId: conversation.id },
                });
                if (res?.gameState) {
                  Object.assign(gameState, res.gameState);
                }
                return { aiReply: res?.aiResponse?.text };
              },
              onCommand: async (cmd, args) => {
                if (cmd === 'standings' || cmd === 's' || cmd === 'score') {
                  const stdRes = getPokerStandings(gameState);
                  console.log(renderStandings(stdRes.standings));
                  return true;
                }
                if (cmd === 'narratives' || cmd === 'info' || cmd === 'n') {
                  console.log(renderNarratives(gameState));
                  return true;
                }
                if (cmd === 'table' || cmd === 'view') {
                  console.clear();
                  console.log(renderTable(gameState, true));
                  return true;
                }
                return false;
              },
            },
            `Hand #${gameState.handNumber} complete. Press ENTER to deal next hand, type to chat with players, or /help`
          );

          if (intermissionDecision === 'QUIT') {
            keepPlaying = false;
          }
        }
      }
    } finally {
      rl.close();
      const finalStandingsRes = getPokerStandings(gameState);
      console.log(renderStandings(finalStandingsRes.standings));
      console.log('\n\x1b[36mStopping CuratorHost worker...\x1b[0m');
      await host.stop();
      console.log('\x1b[32m✔ Host stopped cleanly. Table session saved to SQLite.\x1b[0m\n');
    }
  });

// 3. Add 'sim' command for automated batch benchmark simulation
program
  .command('sim')
  .description('Run a headless batch simulation of N hands for testing and balance benchmarks')
  .option('-h, --hands <count>', 'Number of hands to simulate', '5')
  .option('-c, --chips <amount>', 'Starting chips for each player', '1000')
  .option('-s, --seats <count>', 'Number of seats at table', '4')
  .option('--db <path>', 'Custom SQLite database path')
  .option('-r, --reset', 'Reset database before running', true)
  .option('--poll-interval <ms>', 'Processor poll interval in ms', '500')
  .action(async (opts) => {
    const numHands = parseInt(opts.hands, 10) || 5;
    const startingChips = parseInt(opts.chips, 10) || 1000;
    const maxSeats = Math.min(6, Math.max(2, parseInt(opts.seats, 10) || 4));

    console.log(`\x1b[1m\x1b[36m[Curator Poker Sim] Starting headless simulation of ${numHands} hands...\x1b[0m`);

    const { prisma, conversation, dbPath } = await seedPokerDatabase({
      databasePath: opts.db,
      forceReset: opts.reset,
      maxSeats,
    });

    const host = await createPokerHost({
      databasePath: dbPath,
      quiet: true,
      intervalMs: parseInt(opts.pollInterval, 10) || 500,
    });

    await host.start();

    const initRes = initPokerLobby({ tableId: String(conversation.id), startingChips });
    let gameState: PokerGameState = initRes.gameState;

    try {
      for (let h = 1; h <= numHands; h++) {
        const { gameState: nextState, winnerSummary } = await playPokerHand(
          gameState,
          { isAutoplay: true },
          { prisma, conversationId: conversation.id }
        );
        gameState = nextState;
        console.log(`  Hand #${h}: ${winnerSummary}`);

        const overRes = checkPokerGameOver(gameState);
        if (overRes.gameOver) {
          console.log(`\n\x1b[32m[Game Over] ${overRes.winner} won the table!\x1b[0m`);
          break;
        }
      }

      const finalStandingsRes = getPokerStandings(gameState);
      console.log('\n' + renderStandings(finalStandingsRes.standings));
    } finally {
      await host.stop();
      console.log('\x1b[32m✔ Simulation complete. Host stopped cleanly.\x1b[0m\n');
    }
  });

program.parse(process.argv);
