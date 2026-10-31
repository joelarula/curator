import {
  renderTable,
  renderStandings,
} from './tableRenderer.ts';
import { formatCard } from '../deck/index.ts';
import type { PokerGameState } from '../types.ts';
import { PokerEvent, PokerSessionReason, PokerStreet, PokerSpeechAct } from '../models/index.ts';

export function renderPokerEvent(
  event: { type: string; payload: any },
  currentGameState?: PokerGameState | null
): void {
  const { type, payload } = event;
  // Events carry the game state as of their moment; the latest state may already be further along
  const eventState: PokerGameState | null | undefined =
    payload?.gameState && typeof payload.gameState === 'object' ? payload.gameState : currentGameState;
  switch (type) {
    case PokerEvent.TABLE_SELECTED: {
      const tid = (payload?.tableId && typeof payload.tableId === 'string' && !payload.tableId.startsWith('$'))
        ? payload.tableId
        : (currentGameState?.tableId || '1');
      const rawBuyIn = payload?.buyIn;
      const cleanBuyIn = typeof rawBuyIn === 'number'
        ? rawBuyIn
        : (typeof rawBuyIn === 'string' && /^\d+$/.test(rawBuyIn.trim()) ? rawBuyIn.trim() : undefined);
      const buyInStr = cleanBuyIn ? ` with $${cleanBuyIn} buy-in` : '';
      console.log(`\x1b[32m✔ Transitioning to Table #${tid}${buyInStr}...\x1b[0m`);
      break;
    }

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
      const street = payload?.street || PokerStreet.FLOP;
      const boardStr = eventState?.board?.length
        ? ` ${eventState.board.map((c) => formatCard(c)).join(' ')}`
        : '';
      const potStr = eventState ? ` (Pot: $${eventState.pot})` : '';
      console.log(`\n\x1b[1m\x1b[36m[DEALER] Dealing ${street}:${boardStr}${potStr}\x1b[0m`);
      if (eventState && (street === PokerStreet.PREFLOP || street === 'PREFLOP')) {
        console.log(renderTable(eventState, false));
      }
      break;
    }

    case PokerEvent.ACTION_TAKEN: {
      if (payload?.summary) {
        console.log(`\x1b[33m▶ ${payload.summary}\x1b[0m`);
        break;
      }
      const pName = payload?.player || 'Player';
      let actObj = payload?.action;
      if (typeof actObj === 'string' && actObj.startsWith('{')) {
        try { actObj = JSON.parse(actObj); } catch (_) {}
      }
      const act = actObj?.type || actObj || 'ACT';
      const amt = actObj?.amount ? ` $${actObj.amount}` : '';
      console.log(`\x1b[33m▶ ${pName}: ${act}${amt}\x1b[0m`);
      break;
    }

    case PokerEvent.SPEECH:
    case PokerEvent.SPEECH_RESPONSE: {
      const spk = payload?.speakerName || payload?.speaker || 'Player';
      const to = payload?.targetId ? ` -> @${payload.targetId}` : '';
      const tag = payload?.targetId ? `[${PokerSpeechAct.WHISPER}]` : (payload?.speechAct ? `[${payload.speechAct}]` : `[${PokerSpeechAct.TABLE_TALK}]`);
      // Bright tag + bold speaker + bright white text stays readable on dark terminals
      console.log(`\x1b[95m${tag}\x1b[0m \x1b[1m\x1b[95m${spk}${to}:\x1b[0m \x1b[97m"${payload?.text}"\x1b[0m`);
      if (payload?.aiReply) {
        const aiSpk = payload?.aiSpeaker ? `\x1b[1m\x1b[96m${payload.aiSpeaker}:\x1b[0m ` : '';
        console.log(`\x1b[96m[REPLY]\x1b[0m ${aiSpk}\x1b[97m"${payload.aiReply}"\x1b[0m`);
      }
      break;
    }

    case PokerEvent.PHASE_SETTLE:
    case PokerEvent.SHOWDOWN:
      console.log(`\n\x1b[1m\x1b[32m✔ [SHOWDOWN] ${payload?.winnerSummary || 'Hand completed.'}\x1b[0m`);
      if (eventState) {
        console.log(renderTable(eventState, true));
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
