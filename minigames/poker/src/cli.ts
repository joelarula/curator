import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {
  curatorEngine,
  provisionSqliteDb,
} from '@curator/agent-server';
import { pokerPlugin } from './plugins/pokerPlugin.js';
import { renderTable, renderNarratives, renderStandings } from './ui/tableRenderer.js';
import type { PlayerAction, PokerGameState } from './types.js';

// Register the poker plugin into the engine
curatorEngine.registerPlugin(pokerPlugin);

function askUser(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.clear();
  console.log('\x1b[1m\x1b[36mInitializing Curator Texas Hold\'em MiniApp (SQLite)...\x1b[0m');

  const dbPath = process.env.CURATOR_DATABASE_PATH || path.join(process.env.TEMP || os.tmpdir(), 'curator-poker.db');

  const prisma: any = await provisionSqliteDb('poker-minigame', false, {
    databasePath: dbPath,
  });

  // Ensure system user & project exist
  const user = await prisma.user.upsert({
    where: { email: 'hero@tabletop.local' },
    update: {},
    create: { id: 'hero-user-1', name: 'You (Hero)', email: 'hero@tabletop.local' },
  });

  const project = await prisma.project.upsert({
    where: { id: 'poker-project-1' },
    update: {},
    create: { id: 'poker-project-1', name: 'Texas Holdem Lounge', userId: user.id },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        projectId: project.id,
        metadata: { ruleset: 'texas_holdem_nl', maxSeats: 4 },
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

  // 1. Initialize Lobby via tool
  const initTool: any = curatorEngine.tools.get('poker_init_lobby')!;
  const startHandTool: any = curatorEngine.tools.get('poker_start_hand')!;
  const aiDecisionTool: any = curatorEngine.tools.get('poker_ai_decision')!;
  const applyActionTool: any = curatorEngine.tools.get('poker_apply_action')!;
  const dealStreetTool: any = curatorEngine.tools.get('poker_deal_street')!;
  const distributePotsTool: any = curatorEngine.tools.get('poker_distribute_pots')!;
  const humanSpeechTool: any = curatorEngine.tools.get('poker_human_speech')!;
  const checkGameOverTool: any = curatorEngine.tools.get('poker_check_game_over')!;
  const getStandingsTool: any = curatorEngine.tools.get('poker_get_standings')!;


  let initRes: any = await initTool.runAsync({
    args: { tableId: String(conversation.id), startingChips: 1000 },
    toolContext: { prisma, conversationId: conversation.id },
  });
  let gameState: PokerGameState = initRes.gameState;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\x1b[32m✔ Connected to SQLite table database at:\x1b[0m', dbPath);
  console.log('\x1b[33mPress ENTER to start the session...\x1b[0m');
  await askUser(rl, '');

  let keepPlaying = true;

  while (keepPlaying) {
    // Check if hero has busted
    const heroPlayer = gameState.players.find((p: any) => p.isHuman);
    if (!heroPlayer || heroPlayer.chips <= 0) {
      console.log('\n\x1b[31m[GAME OVER] You have busted out of the table!\x1b[0m');
      break;
    }

    // 2. Start Hand
    const handRes: any = await startHandTool.runAsync({
      args: { state: gameState },
      toolContext: { prisma, conversationId: conversation.id },
    });
    gameState = handRes.gameState;

    // Record turn in standard Curator Response table
    await prisma.response.create({
      data: {
        requestId: rootRequest.id,
        projectId: project.id,
        conversationId: conversation.id,
        content: `Hand #${gameState.handNumber} started. Button is Seat ${gameState.buttonIdx} (${gameState.players[gameState.buttonIdx].name}).`,
      },
    });

    // 3. Street Loop (PREFLOP -> FLOP -> TURN -> RIVER)
    while (!gameState.handOver && gameState.currentStreet !== 'SHOWDOWN') {
      let streetWageringDone = false;

      while (!streetWageringDone && !gameState.handOver) {
        const activeIdx = gameState.activePlayerIdx;
        const activePlayer = gameState.players[activeIdx];

        if (activePlayer.isHuman) {
          // Human turn loop: event-driven speech acts (T, B, W, N) can happen at any time!
          let actionChosen = false;
          let chosenAction: PlayerAction = { type: 'CHECK' };

          while (!actionChosen) {
            console.clear();
            console.log(renderTable(gameState, false));

            const toCall = gameState.currentBet - activePlayer.streetBet;
            console.log('\n\x1b[1m\x1b[32m=== YOUR TURN TO ACT ===\x1b[0m');

            let choicesStr = '';
            if (toCall === 0) {
              choicesStr = '  [1] Check   [2] Bet $40   [3] Bet $100   [4] All-In ($' + activePlayer.chips + ')   [5] Fold';
            } else {
              choicesStr = '  [1] Call $' + toCall + '   [2] Raise to $' + (gameState.currentBet + 40) + '   [3] All-In ($' + activePlayer.chips + ')   [4] Fold';
            }

            console.log(choicesStr);
            console.log('\x1b[90m  [T] 💬 Table Talk   [B] 🗣️ Banter / Trash Talk   [W] 🤫 Whisper to Player   [N] 📖 View Narratives\x1b[0m');
            const answer = (await askUser(rl, '\n\x1b[33mChoose action or conversational option > \x1b[0m')).trim();
            const lowerAns = answer.toLowerCase();

            if (lowerAns === 't') {
              const msg = (await askUser(rl, '\x1b[36mEnter Table Talk message > \x1b[0m')).trim();
              if (msg) {
                const spRes: any = await humanSpeechTool.runAsync({
                  args: { state: gameState, speechAct: 'TABLE_TALK', text: msg },
                  toolContext: { prisma, conversationId: conversation.id },
                });
                gameState = spRes.gameState;
                await prisma.response.create({
                  data: {
                    requestId: rootRequest.id,
                    projectId: project.id,
                    conversationId: conversation.id,
                    content: `[TABLE TALK] You said: "${msg}"`,
                  },
                });
              }
              continue;
            }

            if (lowerAns === 'b') {
              const msg = (await askUser(rl, '\x1b[33mEnter Banter / Trash Talk > \x1b[0m')).trim();
              if (msg) {
                const spRes: any = await humanSpeechTool.runAsync({
                  args: { state: gameState, speechAct: 'BANTER', text: msg },
                  toolContext: { prisma, conversationId: conversation.id },
                });
                gameState = spRes.gameState;
                await prisma.response.create({
                  data: {
                    requestId: rootRequest.id,
                    projectId: project.id,
                    conversationId: conversation.id,
                    content: `[BANTER] You said: "${msg}"`,
                  },
                });
              }
              continue;
            }

            if (lowerAns === 'w') {
              const targetPlayers = gameState.players.filter((p) => !p.isHuman && !p.folded);
              if (targetPlayers.length === 0) {
                console.log('\x1b[31mNo active AI players available to whisper to.\x1b[0m');
                continue;
              }
              console.log('\n\x1b[35mSelect player to whisper to:\x1b[0m');
              targetPlayers.forEach((p, idx) => {
                console.log(`  [${idx + 1}] ${p.name} ($${p.chips})`);
              });
              const targetChoice = (await askUser(rl, `Choose player [1-${targetPlayers.length}] > `)).trim();
              const selectedIdx = parseInt(targetChoice, 10) - 1;
              const targetPlayer = (selectedIdx >= 0 && selectedIdx < targetPlayers.length) ? targetPlayers[selectedIdx] : targetPlayers[0];
              const targetId = targetPlayer.id;
              const targetName = targetPlayer.name;

              const secretMsg = (await askUser(rl, `\x1b[35mEnter secret whisper to ${targetName} > \x1b[0m`)).trim();
              if (secretMsg) {
                const spRes: any = await humanSpeechTool.runAsync({
                  args: { state: gameState, speechAct: 'WHISPER', targetId, text: secretMsg },
                  toolContext: { prisma, conversationId: conversation.id },
                });
                gameState = spRes.gameState;
                await prisma.response.create({
                  data: {
                    requestId: rootRequest.id,
                    projectId: project.id,
                    conversationId: conversation.id,
                    content: `[WHISPER to ${targetName}] You: "${secretMsg}"`,
                  },
                });
              }
              continue;
            }

            if (lowerAns === 'n') {
              console.clear();
              console.log(renderNarratives(gameState));
              await askUser(rl, '\x1b[33mPress ENTER to return to table action...\x1b[0m');
              continue;
            }

            // Formal game move
            if (toCall === 0) {
              if (answer === '2') chosenAction = { type: 'RAISE', amount: 40 };
              else if (answer === '3') chosenAction = { type: 'RAISE', amount: 100 };
              else if (answer === '4') chosenAction = { type: 'ALL_IN', amount: activePlayer.chips };
              else if (answer === '5') chosenAction = { type: 'FOLD' };
              else chosenAction = { type: 'CHECK' };
            } else {
              if (answer === '2') chosenAction = { type: 'RAISE', amount: toCall + 40 };
              else if (answer === '3') chosenAction = { type: 'ALL_IN', amount: activePlayer.chips };
              else if (answer === '4') chosenAction = { type: 'FOLD' };
              else chosenAction = { type: 'CALL', amount: toCall };
            }
            actionChosen = true;
          }

          const actRes: any = await applyActionTool.runAsync({
            args: { state: gameState, action: chosenAction },
            toolContext: { prisma, conversationId: conversation.id },
          });
          gameState = actRes.gameState;

          await prisma.response.create({
            data: {
              requestId: rootRequest.id,
              projectId: project.id,
              conversationId: conversation.id,
              content: `You chose: ${chosenAction.type} ${chosenAction.amount ? '$' + chosenAction.amount : ''}`,
            },
          });
        } else {
          // AI turn
          const aiDecisionRes: any = await aiDecisionTool.runAsync({
            args: { state: gameState, playerIdx: activeIdx },
            toolContext: { prisma, conversationId: conversation.id },
          });
          const aiAction = aiDecisionRes.action;

          const actRes: any = await applyActionTool.runAsync({
            args: { state: gameState, action: aiAction },
            toolContext: { prisma, conversationId: conversation.id },
          });
          gameState = actRes.gameState;

          // Brief delay for realism
          await new Promise((r) => setTimeout(r, 600));

          console.clear();
          console.log(renderTable(gameState, false));
          console.log(`\x1b[33m▶ ${activePlayer.name} performed: ${aiAction.type} ${aiAction.amount ? '$' + aiAction.amount : ''}\x1b[0m`);
        }

        if (gameState.streetComplete || gameState.handOver) {
          streetWageringDone = true;
        }
      }

      // If hand didn't end early by fold, deal next street!
      if (!gameState.handOver) {
        const dealRes: any = await dealStreetTool.runAsync({
          args: { state: gameState },
          toolContext: { prisma, conversationId: conversation.id },
        });
        gameState = dealRes.gameState;

        console.clear();
        console.log(renderTable(gameState, false));
        console.log(`\n\x1b[1m\x1b[36m[DEALER] Dealing ${gameState.currentStreet}...\x1b[0m`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // 4. Showdown & Pot Distribution
    const showRes: any = await distributePotsTool.runAsync({
      args: { state: gameState },
      toolContext: { prisma, conversationId: conversation.id },
    });
    gameState = showRes.gameState;

    console.clear();
    console.log(renderTable(gameState, true)); // Reveal all hole cards
    console.log(`\n\x1b[1m\x1b[32m✔ ${showRes.winnerSummary}\x1b[0m\n`);

    await prisma.response.create({
      data: {
        requestId: rootRequest.id,
        projectId: project.id,
        conversationId: conversation.id,
        content: `Hand #${gameState.handNumber} Result: ${showRes.winnerSummary}`,
      },
    });

    const overRes: any = await checkGameOverTool.runAsync({
      args: { state: gameState },
      toolContext: { prisma, conversationId: conversation.id },
    });
    gameState = overRes.gameState;

    if (overRes.gameOver) {
      console.log(renderStandings(overRes.standings));
      console.log(`\n\x1b[1m\x1b[32m✔ [GAME OVER] ${overRes.winner} has conquered the table!\x1b[0m\n`);
      await prisma.response.create({
        data: {
          requestId: rootRequest.id,
          projectId: project.id,
          conversationId: conversation.id,
          content: overRes.report,
        },
      });
      break;
    }

    let showDone = false;
    while (!showDone) {
      const nextPrompt = await askUser(
        rl,
        '\x1b[33mPress ENTER for next hand, [s] for standings, [n] for subjective narratives, or [q] to exit > \x1b[0m'
      );
      const cleanPrompt = nextPrompt.toLowerCase().trim();
      if (cleanPrompt === 'q') {
        keepPlaying = false;
        showDone = true;
      } else if (cleanPrompt === 's') {
        const stdRes: any = await getStandingsTool.runAsync({
          args: { state: gameState },
          toolContext: { prisma, conversationId: conversation.id },
        });
        console.log(renderStandings(stdRes.standings));
        await askUser(rl, '\x1b[33mPress ENTER to return to showdown summary...\x1b[0m');
      } else if (cleanPrompt === 'n') {
        console.clear();
        console.log(renderNarratives(gameState));
        await askUser(rl, '\x1b[33mPress ENTER to return to showdown summary...\x1b[0m');
      } else {
        showDone = true;
      }
    }
  }

  // Print final session standings
  const finalStandingsRes: any = await getStandingsTool.runAsync({
    args: { state: gameState },
    toolContext: { prisma, conversationId: conversation.id },
  });
  console.log(renderStandings(finalStandingsRes.standings));

  rl.close();
  console.log('\n\x1b[36mThank you for playing at Curator High Roller Lounge! Table session saved to SQLite.\x1b[0m\n');
}

main().catch((err) => {
  console.error('[Poker CLI Fatal Error]:', err);
  process.exit(1);
});
