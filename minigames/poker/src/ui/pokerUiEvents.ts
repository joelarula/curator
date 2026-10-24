import {
  renderTable,
  renderStandings,
  formatCard,
} from './tableRenderer.ts';
import type { PokerGameState } from '../types.ts';
import { PokerEvent, PokerSessionReason } from '../models/index.ts';
import { PokerSpeechAct } from '../workflows/ambientReaction.ts';

export function renderPokerEvent(
  event: { type: string; payload: any },
  currentGameState?: PokerGameState | null
): void {
  const { type, payload } = event;
  switch (type) {
    case PokerEvent.LOBBY_READY: {
      const rawTid = payload?.tableId;
      const tid = (rawTid && typeof rawTid === 'string' && !rawTid.startsWith('$'))
        ? rawTid
        : currentGameState?.tableId || '1';
      console.log(`\x1b[32m✔ Lobby ready: Table #${tid}\x1b[0m`);
      break;
    }

    case PokerEvent.NEW_ROUND:
      console.log(`\n\x1b[1m\x1b[36m--- Hand #${payload?.handNumber} Starting ---\x1b[0m`);
      break;

    case PokerEvent.AWAITING_HUMAN_ACTION: {
      if (currentGameState) {
        console.log('\n' + renderTable(currentGameState, false));
      }
      break;
    }

    case PokerEvent.PHASE_DEAL:
    case PokerEvent.PHASE_STREET: {
      const street = payload?.street || 'FLOP';
      const boardStr = currentGameState?.board?.map((c) => formatCard(c)).join(' ') || '';
      const potStr = currentGameState ? ` (Pot: $${currentGameState.pot})` : '';
      console.log(`\n\x1b[1m\x1b[36m[DEALER] Dealing ${street}: ${boardStr}${potStr}\x1b[0m`);
      break;
    }

    case PokerEvent.ACTION_TAKEN: {
      const pName = payload?.player || 'Player';
      const act = payload?.action?.type || payload?.action || 'ACT';
      const amt = payload?.action?.amount ? ` $${payload.action.amount}` : '';
      console.log(`\x1b[33m▶ ${pName}: ${act}${amt}\x1b[0m`);
      break;
    }

    case PokerEvent.SPEECH_RESPONSE: {
      const spk = payload?.speaker || 'Player';
      const act = payload?.speechAct || PokerSpeechAct.TABLE_TALK;
      const to = payload?.targetId ? ` -> @${payload.targetId}` : '';
      console.log(`\x1b[35m[${act}] ${spk}${to}: "${payload?.text}"\x1b[0m`);
      if (payload?.aiReply) {
        const aiSpk = payload?.aiSpeaker ? `\x1b[1m${payload.aiSpeaker}\x1b[0m: ` : '';
        console.log(`\x1b[36m[REPLY] ${aiSpk}"${payload.aiReply}"\x1b[0m`);
      }
      break;
    }

    case PokerEvent.PHASE_SETTLE:
    case PokerEvent.SHOWDOWN:
      console.log(`\n\x1b[1m\x1b[32m✔ [SHOWDOWN] ${payload?.winnerSummary || 'Hand completed.'}\x1b[0m`);
      if (currentGameState) {
        console.log(renderTable(currentGameState, true));
      }
      break;

    case PokerEvent.TABLE_PAUSED:
      console.log(`\n\x1b[33m⏸ [PAUSED] Table session paused. Type /resume to continue or /exit to quit.\x1b[0m`);
      break;

    case PokerEvent.TABLE_RESUMED:
      console.log(`\n\x1b[32m▶ [RESUMED] Table session resumed! Stepping to next action...\x1b[0m`);
      break;

    case PokerEvent.SESSION_EXITED:
      console.log(`\n\x1b[33m✔ [SESSION ENDED] ${payload?.reason === PokerSessionReason.USER_EXIT ? 'Exited table session.' : (payload?.reason || 'Session closed.')}\x1b[0m\n`);
      break;

    case PokerEvent.ACTORS_LIST: {
      const actors: any[] = payload?.actors || [];
      console.log('\n\x1b[1m\x1b[36m=== Active Conversation Actors ===\x1b[0m');
      for (const a of actors) {
        const tag = a.kind === 'user' ? '\x1b[32m[User]\x1b[0m  ' : '\x1b[34m[Agent]\x1b[0m ';
        const desc = a.persona || a.name;
        const roles = a.roles?.length ? ` | Roles: ${a.roles.join(', ')}` : '';
        const chips = a.chips !== undefined ? ` | Chips: $${a.chips}` : '';
        console.log(`  ${tag} \x1b[1m${a.id}\x1b[0m (${desc})${roles}${chips}`);
      }
      console.log('');
      break;
    }

    case PokerEvent.GAME_OVER:
      console.log(`\n\x1b[1m\x1b[32m✔ [GAME OVER] Conquered the table!\x1b[0m\n`);
      if (payload?.standings) {
        console.log(renderStandings(payload.standings));
      }
      break;
  }
}
