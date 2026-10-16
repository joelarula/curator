import {
  renderTable,
  renderStandings,
  formatCard,
} from './tableRenderer.ts';
import type { PokerGameState } from '../types.ts';

export function renderPokerEvent(
  event: { type: string; payload: any },
  currentGameState?: PokerGameState | null
): void {
  const { type, payload } = event;
  switch (type) {
    case 'poker:lobby_ready':
      console.log(`\x1b[32m✔ Lobby ready: Table #${payload?.tableId}\x1b[0m`);
      break;

    case 'poker:new_round':
      console.log(`\n\x1b[1m\x1b[36m--- Hand #${payload?.handNumber} Starting ---\x1b[0m`);
      break;

    case 'poker:phase_deal':
    case 'poker:phase_street': {
      const street = payload?.street || 'FLOP';
      const boardStr = currentGameState?.board?.map((c) => formatCard(c)).join(' ') || '';
      const potStr = currentGameState ? ` (Pot: $${currentGameState.pot})` : '';
      console.log(`\n\x1b[1m\x1b[36m[DEALER] Dealing ${street}: ${boardStr}${potStr}\x1b[0m`);
      break;
    }

    case 'poker:action_taken': {
      const pName = payload?.player || 'Player';
      const act = payload?.action?.type || payload?.action || 'ACT';
      const amt = payload?.action?.amount ? ` $${payload.action.amount}` : '';
      console.log(`\x1b[33m▶ ${pName}: ${act}${amt}\x1b[0m`);
      break;
    }

    case 'poker:speech_response': {
      const spk = payload?.speaker || 'Player';
      const act = payload?.speechAct || 'TABLE_TALK';
      console.log(`\x1b[35m[${act}] ${spk}: "${payload?.text}"\x1b[0m`);
      if (payload?.aiReply) {
        console.log(`\x1b[36m[REPLY] "${payload.aiReply}"\x1b[0m`);
      }
      break;
    }

    case 'poker:phase_settle':
    case 'poker:showdown':
      console.log(`\n\x1b[1m\x1b[32m✔ [SHOWDOWN] ${payload?.winnerSummary || 'Hand completed.'}\x1b[0m`);
      if (currentGameState) {
        console.log(renderTable(currentGameState, true));
      }
      break;

    case 'poker:game_over':
      console.log(`\n\x1b[1m\x1b[32m✔ [GAME OVER] Conquered the table!\x1b[0m\n`);
      if (payload?.standings) {
        console.log(renderStandings(payload.standings));
      }
      break;
  }
}
