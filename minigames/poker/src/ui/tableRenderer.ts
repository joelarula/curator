import type { PokerGameState, Card, PlayerState } from '../types.js';
import { evaluateBestHand } from '../engine/pokerEvaluator.js';
export function renderNarratives(gameState: PokerGameState): string {
  let out = '\n\x1b[1m\x1b[36m--- TABLE OBSERVATIONS & WORKING MEMORY ---\x1b[0m\n';
  for (const p of gameState.players) {
    const mono = p.lastMonologue || gameState.narratives?.[p.id]?.innerMonologue || 'Observing table action.';
    out += `  \x1b[1m${p.name}\x1b[0m: "${mono}"\n`;
  }
  return out;
}

function formatCard(c?: Card): string {
  if (!c) return '[ -- ]';
  const suitColor = c.suit === '♥' || c.suit === '♦' ? '\x1b[31m' : '\x1b[34m';
  const reset = '\x1b[0m';
  return `[ ${c.rank}${suitColor}${c.suit}${reset} ]`;
}

export function renderTable(gameState: PokerGameState, showAllCards = false): string {
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';
  const magenta = '\x1b[35m';

  const boardCards = [0, 1, 2, 3, 4].map((i) => formatCard(gameState.board[i])).join(' ');

  const hero = gameState.players.find((p) => p.isHuman) || gameState.players[0];
  const heroBest = gameState.board.length >= 3 ? evaluateBestHand(hero.holeCards, gameState.board).description : '';
  const heroMonologue = hero.lastMonologue || gameState.narratives?.[hero.id]?.innerMonologue;

  let out = '\n';
  out += `${cyan}========================================================================================${reset}\n`;
  out += `  ${bold}CURATOR TEXAS HOLD'EM HIGH ROLLER LOUNGE${reset}  |  Hand #${gameState.handNumber}  |  Street: ${yellow}${gameState.currentStreet}${reset}\n`;
  out += `${cyan}========================================================================================${reset}\n`;

  // Players info
  out += `\n  ${bold}PLAYERS AT TABLE:${reset}\n`;
  for (let i = 0; i < gameState.players.length; i++) {
    const p = gameState.players[i];
    const isDealer = i === gameState.buttonIdx;
    const isSB = i === gameState.sbIdx;
    const isBB = i === gameState.bbIdx;
    const isTurn = i === gameState.activePlayerIdx && !gameState.handOver;

    let badge = '';
    if (isDealer) badge += `${yellow}[D]${reset} `;
    if (isSB) badge += `${cyan}[SB]${reset} `;
    if (isBB) badge += `${magenta}[BB]${reset} `;
    if (p.folded) badge += `\x1b[90m[FOLDED]${reset} `;
    if (p.allIn) badge += `${bold}\x1b[31m[ALL-IN]${reset} `;
    if (isTurn) badge += `${green}▶ YOUR ACTION ◀${reset} `;

    let cardsStr = '[ ?  ? ]';
    if (p.isHuman || showAllCards || gameState.handOver) {
      cardsStr = p.holeCards.map((c) => formatCard(c)).join(' ');
    }

    const betStr = p.streetBet > 0 ? `| Street Bet: $${p.streetBet}` : '';
    out += `  ${isTurn ? bold : ''}${p.name.padEnd(18)}${reset} Chips: ${green}$${p.chips.toString().padEnd(5)}${reset} ${cardsStr}  ${badge}${betStr}\n`;
  }

  // Board and Pot
  out += `\n  ${bold}COMMUNITY BOARD:${reset}  ${boardCards}\n`;
  out += `  ${bold}MAIN POT:${reset} ${green}$${gameState.pot}${reset}    ${bold}CURRENT BET TO MATCH:${reset} $${gameState.currentBet}\n`;

  if (heroBest) {
    out += `  ${bold}YOUR BEST HAND:${reset} ${cyan}${heroBest}${reset}\n`;
  }

  if (heroMonologue) {
    out += `  ${bold}YOUR INNER MONOLOGUE:${reset} \x1b[3m\x1b[33m"${heroMonologue}"\x1b[0m\n`;
  }

  // Ambient dialogue feed
  if (gameState.recentRemarks.length > 0) {
    out += `\n  ${bold}TABLE TALK & AMBIENT CHATTER:${reset}\n`;
    for (const r of gameState.recentRemarks.slice(-5)) {
      let tag = `[${r.speechAct}]`;
      if (r.speechAct === 'WHISPER') {
        if (r.speakerId === 'hero') {
          tag = `${magenta}[WHISPER to ${r.recipientId || 'Player'}]${reset}`;
        } else if (r.recipientId === 'hero') {
          tag = `${magenta}[WHISPER to You]${reset}`;
        } else {
          tag = `\x1b[90m[WHISPER Overheard]${reset}`;
        }
      } else if (r.speechAct === 'BANTER') {
        tag = `${yellow}[BANTER]${reset}`;
      } else if (r.speechAct === 'PROVOKE') {
        tag = `\x1b[31m[PROVOKE]${reset}`;
      } else if (r.speechAct === 'GOSSIP') {
        tag = `${cyan}[GOSSIP]${reset}`;
      } else {
        tag = `\x1b[90m[TABLE TALK]${reset}`;
      }
      out += `    ${tag} ${bold}${r.speakerName}:${reset} "${r.text}"\n`;
    }
  }

  out += `${cyan}----------------------------------------------------------------------------------------${reset}\n`;
  return out;
}

export function renderStandings(standings: import('../types.js').PlayerStanding[]): string {
  let report = '\n\x1b[1m\x1b[36m--- FINAL STANDINGS ---\x1b[0m\n';
  for (const s of standings) {
    const netStr = s.net >= 0 ? `+${s.net}` : `${s.net}`;
    const statusStr = s.status && s.status !== 'Active' ? ` [${s.status}]` : '';
    report += `  Rank ${s.rank}: ${s.name} (Start: ${s.startChips}, Final: ${s.finalChips}, Net: ${netStr})${statusStr}\n`;
  }
  return report;
}

