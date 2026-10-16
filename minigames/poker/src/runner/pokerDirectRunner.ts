import readline from 'node:readline';
import { createPokerGameSession, type PokerGameSession, type PokerSessionOptions, type HumanTurnPromptInfo } from '../session/pokerSession.js';
import {
  renderTable,
  renderCompactStatus,
  renderNarratives,
  renderStandings,
  formatCard,
} from '../ui/tableRenderer.js';
import { getPokerStandings } from '../engine/pokerEngine.js';
import { promptGroupChatAction, type ChatChoice, type GroupChatContext } from '../ui/groupChatPrompt.js';
import type { PlayerAction, PokerGameState } from '../types.js';

export interface DirectStepResult {
  done: boolean;
  waitingForHuman: boolean;
  humanTurn?: HumanTurnPromptInfo;
  gameState: PokerGameState | null;
  stepCount: number;
}

export class PokerDirectRunner {
  constructor(public readonly session: PokerGameSession) {}

  /**
   * Advances execution synchronously until a human action is required
   * (WAITING_FOR_EVENT on 'poker:human_action') or until the hand/game ends.
   */
  async stepUntilHumanTurnOrEnd(maxSteps: number = 200): Promise<DirectStepResult> {
    let steps = 0;

    while (steps < maxSteps) {
      steps++;

      // 1. Check if the workflow has yielded on a human turn
      const waiting = await this.session.getWaitingHumanTurn();
      if (waiting) {
        const gameState = await this.session.getGameState();
        return {
          done: false,
          waitingForHuman: true,
          humanTurn: waiting,
          gameState,
          stepCount: steps,
        };
      }

      // 2. Step the request processor synchronously
      const processed = await this.session.processor.step();
      if (processed === 0) {
        // No new runnable requests in queue; check if we just entered waiting
        const waitingAfter = await this.session.getWaitingHumanTurn();
        if (waitingAfter) {
          const gameState = await this.session.getGameState();
          return {
            done: false,
            waitingForHuman: true,
            humanTurn: waitingAfter,
            gameState,
            stepCount: steps,
          };
        }

        // Neither runnable nor waiting for human: session is idle or complete
        const gameState = await this.session.getGameState();
        return {
          done: Boolean(gameState?.gameOver || gameState?.handOver),
          waitingForHuman: false,
          gameState,
          stepCount: steps,
        };
      }
    }

    const gameState = await this.session.getGameState();
    return {
      done: false,
      waitingForHuman: false,
      gameState,
      stepCount: steps,
    };
  }

  /**
   * Submits the chosen human action and synchronously steps to the next human gate
   */
  async submitActionAndStep(action: PlayerAction): Promise<DirectStepResult> {
    await this.session.submitHumanAction(action);
    return this.stepUntilHumanTurnOrEnd();
  }

  /**
   * Runs the full interactive CLI gameplay loop directly in-process without network overhead.
   */
  async runInteractiveCli(options: { playerName?: string } = {}): Promise<void> {
    const playerName = options.playerName || 'You';
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.clear();
    console.log('\x1b[1m\x1b[36m=== Curator Texas Hold\'em (Direct Synchronous CLI) ===\x1b[0m');
    console.log('\x1b[90mRunning directly on CuratorRequestProcessor AST Engine...\x1b[0m\n');

    const cleanup = async () => {
      rl.close();
      await this.session.close();
    };

    process.on('SIGINT', async () => {
      console.log('\n\x1b[33mExiting table...\x1b[0m');
      await cleanup();
      process.exit(0);
    });

    try {
      while (true) {
        const stepRes = await this.stepUntilHumanTurnOrEnd();
        const gameState = stepRes.gameState;

        if (stepRes.waitingForHuman && stepRes.humanTurn) {
          if (gameState) {
            console.log('\n' + renderTable(gameState, false));
          }

          const legalChoices = stepRes.humanTurn.choices || [];
          const choices: ChatChoice<PlayerAction>[] = legalChoices.map((c: any) => ({
            id: c.id,
            label: c.label,
            value: c.action,
            aliases: [c.action?.type, c.id],
          }));

          const chatCtx: GroupChatContext = {
            actorName: playerName,
            participants: gameState?.players || [],
            defaultSpeechAct: 'TABLE_TALK',
            helpHeader: '=== Table Chat & Actions ===',
            availableVerbs: [
              {
                name: 'whisper',
                aliases: ['w'],
                description: 'Whisper privately to a player',
                usage: '<player> <msg>',
                speechAct: 'WHISPER',
                directed: true,
              },
              {
                name: 'banter',
                aliases: ['b'],
                description: 'Banter or trash talk to the table',
                usage: '<msg>',
                speechAct: 'BANTER',
              },
              {
                name: 'standings',
                aliases: ['score', 's'],
                description: 'View current chip standings and leaderboard',
                handler: async () => {
                  if (gameState) {
                    const stdRes = getPokerStandings(gameState);
                    console.log(renderStandings(stdRes.standings));
                  }
                  return true;
                },
              },
              {
                name: 'narratives',
                aliases: ['info', 'n'],
                description: 'View subjective inner narratives & memories',
                handler: async () => {
                  if (gameState) console.log(renderNarratives(gameState));
                  return true;
                },
              },
              {
                name: 'table',
                aliases: ['view'],
                description: 'Redraw the poker table view',
                handler: async () => {
                  if (gameState) console.log(renderTable(gameState, false));
                  return true;
                },
              },
            ],
            redrawView: () => {
              if (gameState) console.log('\n' + renderCompactStatus(gameState));
            },
            onSpeech: async (text: string, speechAct: string, targetParticipantId?: string) => {
              const reply = await this.session.submitHumanSpeech({
                text,
                speechAct,
                targetId: targetParticipantId,
              });
              if (reply?.aiResponse?.text) {
                console.log(`\x1b[36m[REPLY] "${reply.aiResponse.text}"\x1b[0m`);
              }
            },
          };

          const chosenAction = await promptGroupChatAction(rl, choices, chatCtx);
          console.log(`\x1b[33m▶ ${playerName}: ${chosenAction.type}${chosenAction.amount ? ` $${chosenAction.amount}` : ''}\x1b[0m`);

          // Submit action and resume directly
          await this.session.submitHumanAction(chosenAction);
          continue;
        }

        if (stepRes.done) {
          if (gameState) {
            console.log('\n' + renderTable(gameState, true));
            if (gameState.gameOver) {
              console.log('\x1b[1m\x1b[32m✔ [GAME OVER] Tournament complete!\x1b[0m\n');
              const standingsRes = getPokerStandings(gameState);
              console.log(renderStandings(standingsRes.standings));
            }
          }
          break;
        }

        // If step returned without waiting and without done, avoid tight loop
        await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      await cleanup();
    }
  }
}

/**
 * Convenience factory to create a direct runner session.
 */
export async function createPokerDirectRunner(options: PokerSessionOptions = {}): Promise<PokerDirectRunner> {
  const session = await createPokerGameSession(options);
  return new PokerDirectRunner(session);
}
