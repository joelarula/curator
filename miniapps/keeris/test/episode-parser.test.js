import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMusicList } from '../src/episode-parser.js';

test('parses ordered ERR music list rows', () => {
  const html = `<section><div class="music-list-item"><span class="music-artist">ANSAMBEL Keeris</span> - <span class="music-title">Laul &amp; lugu*</span></div><div class="music-list-item"><span class="music-artist">KATE</span> - <span class="music-title">Verevend</span></div></section>`;
  assert.deepEqual(parseMusicList(html), [
    { position: 1, artist: 'ANSAMBEL Keeris', title: 'Laul & lugu*', rawText: 'ANSAMBEL Keeris - Laul & lugu*' },
    { position: 2, artist: 'KATE', title: 'Verevend', rawText: 'KATE - Verevend' }
  ]);
});

test('returns an empty list when no playlist is published', () => {
  assert.deepEqual(parseMusicList('<main><p>No music list</p></main>'), []);
});