import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStandardDeck,
  shuffleDeck,
  drawCards,
  popCards,
  getCombinations,
  compareCardsByRank,
  sortCardsByRank,
  formatCard,
  formatCards,
  parseCard,
  SUITS,
  RANKS,
  CARD_RANK_VALUES,
  type Card,
} from '../src/deck/index.ts';

test('Card Deck Module: Standard 52-Card Deck Generation', () => {
  const deck = createStandardDeck({ shuffle: false });
  assert.equal(deck.length, 52, 'Standard deck must contain exactly 52 cards');

  // Verify all 4 suits and 13 ranks are present
  const keys = new Set<string>();
  for (const card of deck) {
    assert.ok(SUITS.includes(card.suit), `Invalid suit: ${card.suit}`);
    assert.ok(RANKS.includes(card.rank), `Invalid rank: ${card.rank}`);
    keys.add(`${card.rank}${card.suit}`);
  }
  assert.equal(keys.size, 52, 'All 52 cards must be unique');
});

test('Card Deck Module: Fisher-Yates Shuffle', () => {
  const unshuffled = createStandardDeck({ shuffle: false });
  const shuffled = createStandardDeck({ shuffle: true });

  assert.equal(shuffled.length, 52);
  // All elements conserved
  const originalKeys = new Set(unshuffled.map((c) => `${c.rank}${c.suit}`));
  const shuffledKeys = new Set(shuffled.map((c) => `${c.rank}${c.suit}`));
  assert.deepEqual(originalKeys, shuffledKeys);

  // Deterministic shuffle using custom PRNG
  let seed = 12345;
  const pseudoRng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const d1 = shuffleDeck(createStandardDeck({ shuffle: false }), pseudoRng);
  seed = 12345;
  const d2 = shuffleDeck(createStandardDeck({ shuffle: false }), pseudoRng);
  assert.deepEqual(d1, d2, 'Identical seed produces identical shuffle order');
});

test('Card Deck Module: Card Drawing and Popping', () => {
  const deck = createStandardDeck({ shuffle: false });
  const { drawn, remaining } = drawCards(deck, 5);

  assert.equal(drawn.length, 5);
  assert.equal(remaining.length, 47);
  assert.deepEqual(drawn, deck.slice(0, 5));
  assert.deepEqual(remaining, deck.slice(5));

  const mutableDeck = [...deck];
  const popped = popCards(mutableDeck, 2);
  assert.equal(popped.length, 2);
  assert.equal(mutableDeck.length, 50);
});

test('Card Deck Module: Combinatorics (n choose k)', () => {
  // 5 choose 3 = 10
  const items = [1, 2, 3, 4, 5];
  const combos53 = getCombinations(items, 3);
  assert.equal(combos53.length, 10);

  // 7 choose 5 = 21 (Texas Hold'em standard 7-card best hand selection)
  const cards7: Card[] = [
    { rank: 'A', suit: '♠' },
    { rank: 'K', suit: '♠' },
    { rank: 'Q', suit: '♠' },
    { rank: 'J', suit: '♠' },
    { rank: '10', suit: '♠' },
    { rank: '2', suit: '♦' },
    { rank: '3', suit: '♣' },
  ];
  const combos75 = getCombinations(cards7, 5);
  assert.equal(combos75.length, 21, 'Texas holdem 7 choose 5 yields exactly 21 five-card combos');
});

test('Card Deck Module: Card Comparison & Sorting', () => {
  const cA: Card = { rank: 'A', suit: '♠' };
  const cK: Card = { rank: 'K', suit: '♥' };
  const c2: Card = { rank: '2', suit: '♣' };

  assert.ok(compareCardsByRank(cA, cK) > 0);
  assert.ok(compareCardsByRank(c2, cK) < 0);
  assert.equal(compareCardsByRank(cA, { rank: 'A', suit: '♦' }), 0);

  const unsorted: Card[] = [cK, cA, c2];
  const sortedDesc = sortCardsByRank(unsorted, 'desc');
  assert.deepEqual(sortedDesc, [cA, cK, c2]);

  const sortedAsc = sortCardsByRank(unsorted, 'asc');
  assert.deepEqual(sortedAsc, [c2, cK, cA]);
});

test('Card Deck Module: Card Formatting & Parsing', () => {
  const card: Card = { rank: 'A', suit: '♠' };
  const plainFormatted = formatCard(card, { color: false });
  assert.equal(plainFormatted, '[A♠]');

  const colorFormatted = formatCard(card, { color: true });
  assert.ok(colorFormatted.includes('A'));
  assert.ok(colorFormatted.includes('♠'));

  const multiple = formatCards([card, { rank: '10', suit: '♦' }], { color: false });
  assert.equal(multiple, '[A♠] [10♦]');

  // Parsing
  assert.deepEqual(parseCard('A♠'), { rank: 'A', suit: '♠' });
  assert.deepEqual(parseCard('[10♦]'), { rank: '10', suit: '♦' });
  assert.deepEqual(parseCard('Kh'), { rank: 'K', suit: '♥' });
  assert.deepEqual(parseCard('2c'), { rank: '2', suit: '♣' });
  assert.equal(parseCard('invalid'), null);
});
