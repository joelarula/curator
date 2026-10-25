import type { PokerGameState, Card, PlayerState, PlayerStanding } from '../types.ts';
import { evaluateBestHand } from '../engine/pokerEvaluator.ts';

export function formatCard(c?: Card): string {
  if (!c) return '[ -- ]';
  const suitColor = c.suit === '♥' || c.suit === '♦' ? '\x1b[31m' : '\x1b[34m';
  const reset = '\x1b[0m';
  return `[ ${c.rank}${suitColor}${c.suit}${reset} ]`;
}

/**
 * Compact 2-line status card for the live group chat stream.
 * Displays essential table info without clearing scrollback history.
 */
export function renderCompactStatus(gameState?: PokerGameState, viewerId?: string): string {
  if (!gameState || !Array.isArray(gameState.players) || gameState.players.length === 0) {
    return '';
  }
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';

  const board = Array.isArray(gameState.board) ? gameState.board : [];
  const boardCards = board.length > 0
    ? board.map((c) => formatCard(c)).join(' ')
    : '\x1b[90m[No community cards dealt]\x1b[0m';

  const hero = (viewerId ? gameState.players.find((p) => p.id === viewerId) : undefined)
    || gameState.players.find((p) => p.isHuman)
    || gameState.players[0];
  if (!hero) return '';
  const heroCards = Array.isArray(hero.holeCards) ? hero.holeCards.map((c) => formatCard(c)).join(' ') : '[ -- ]';
  const heroBest = board.length >= 3 && Array.isArray(hero.holeCards) ? evaluateBestHand(hero.holeCards, board).description : '';

  const activeOpponents = gameState.players
    .filter((p) => p.id !== hero.id && !p.folded)
    .map((p) => `${p.name} ($${p.chips})`)
    .join(', ') || 'None';

  const toCall = Math.max(0, (gameState.currentBet || 0) - (hero.streetBet || 0));
  const toCallStr = toCall > 0 ? `To Call: ${green}$${toCall}${reset}` : `${green}Check Available${reset}`;

  let out = `\x1b[90m───\x1b[0m ${cyan}${bold}Table:${reset} ${yellow}${gameState.currentStreet || 'PREFLOP'}${reset} (Hand #${gameState.handNumber || 1})  |  ${cyan}Board:${reset} ${boardCards}  |  ${cyan}Pot:${reset} ${green}$${gameState.pot || 0}${reset}  |  ${toCallStr} \x1b[90m───\x1b[0m\n`;
  out += `  ${bold}Your Hand:${reset} ${heroCards} ${heroBest ? `(${cyan}${heroBest}${reset})` : ''}  |  ${bold}Chips:${reset} ${green}$${hero.chips}${reset}  |  ${bold}In Hand:${reset} ${activeOpponents}`;
  return out;
}

/**
 * Detailed ASCII seat-by-seat diagram.
 * Used for Showdown reveals or on-demand inspection via `/table`.
 */
export function renderTable(gameState?: PokerGameState, showAllCards = false, viewerId?: string): string {
  if (!gameState || !Array.isArray(gameState.players) || gameState.players.length === 0) {
    return '\n\x1b[33m[Table] No active table hand in progress. Still in lobby.\x1b[0m\n';
  }
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';
  const magenta = '\x1b[35m';

  const board = Array.isArray(gameState.board) ? gameState.board : [];
  const boardCards = [0, 1, 2, 3, 4].map((i) => formatCard(board[i])).join(' ');

  const hero = (viewerId ? gameState.players.find((p) => p.id === viewerId) : undefined)
    || gameState.players.find((p) => p.isHuman)
    || gameState.players[0];
  const heroHole = hero && Array.isArray(hero.holeCards) ? hero.holeCards : [];
  const heroBest = board.length >= 3 && heroHole.length > 0 ? evaluateBestHand(heroHole, board).description : '';
  const heroMonologue = hero?.lastMonologue;

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
    if (isTurn) badge += `${green}▶ ACTIVE TURN ◀${reset} `;

    let cardsStr = '[ ?  ? ]';
    if (p.id === hero?.id || p.isHuman || showAllCards || gameState.handOver) {
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

  out += `${cyan}----------------------------------------------------------------------------------------${reset}\n`;
  return out;
}


export function renderStandings(standings: PlayerStanding[]): string {
  let report = '\n\x1b[1m\x1b[36m--- CURRENT / FINAL STANDINGS ---\x1b[0m\n';
  for (const s of standings) {
    const netStr = s.net >= 0 ? `+${s.net}` : `${s.net}`;
    const statusStr = s.status && s.status !== 'Active' ? ` [${s.status}]` : '';
    report += `  Rank ${s.rank}: ${s.name} (Start: ${s.startChips}, Final: ${s.finalChips}, Net: ${netStr})${statusStr}\n`;
  }
  return report;
}
