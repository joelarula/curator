import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSurface, surfaceTable, describeSurface, surfaceToText, textPanelBlocks } from '../dist/contracts/surfaces.js';

test('extractSurface: explicit uiSurface / surface fields, or a surface-shaped result', () => {
  assert.deepEqual(extractSurface({ rows: 1, uiSurface: { component: 'table', data: { rows: [] } } }), { component: 'table', data: { rows: [] } });
  assert.equal(extractSurface({ surface: { component: 'markdown', data: '# Hi' } })?.component, 'markdown');
  assert.equal(extractSurface({ component: 'resource-collection', items: [] })?.component, 'resource-collection');
  assert.equal(extractSurface({ items: [1, 2, 3] }), null, 'no guessing from items');
  assert.equal(extractSurface({ component: 'button' }), null, 'a component field alone is not a surface');
  assert.equal(extractSurface('text'), null);
});

test('tables: object rows, array rows with columns, derived columns; text rendering', () => {
  const objects = surfaceTable({ component: 'table', data: { rows: [{ a: 1, b: 'x' }, { a: 2, c: true }] } });
  assert.deepEqual(objects.columns.map((c) => c.key), ['a', 'b', 'c']);
  const arrays = surfaceTable({ component: 'table', data: { columns: ['name', { key: 'qty', title: 'Qty' }], rows: [['Apple', 3]] } });
  assert.deepEqual(arrays.rows, [{ name: 'Apple', qty: 3 }]);
  assert.equal(arrays.columns[1].title, 'Qty');

  const s = { component: 'table', title: 'Stock', data: { columns: ['name', 'qty'], rows: [['Apple', 3], ['Banana', 12]] } };
  assert.equal(describeSurface(s), 'Table: Stock · 2 rows');
  assert.equal(surfaceToText(s), 'Table: Stock · 2 rows\nname    qty\n------  ---\nApple   3\nBanana  12');
  assert.match(surfaceToText({ component: 'mermaid', title: 'Flow', data: 'graph TD; A-->B' }), /Diagram: Flow \(open in the web console\)/);
  assert.match(surfaceToText({ component: 'table', data: { rows: Array.from({ length: 25 }, (_, i) => ({ i })) } }, { maxRows: 3 }), /… 22 more rows$/);
});

test('textPanelBlocks: fenced diagrams/pages/JSON and Markdown tables, in order', () => {
  const text = [
    'Here is the flow:',
    '```mermaid',
    'graph TD; A-->B',
    '```',
    '| name | qty |',
    '| --- | --- |',
    '| Apple | 3 |',
    '',
    '```json',
    '{"ok": true}',
    '```',
    '```json',
    'not json',
    '```',
    '```html',
    '<b>hi</b>',
    '```',
  ].join('\n');
  const blocks = textPanelBlocks(text);
  assert.deepEqual(blocks.map((b) => b.surface.component), ['mermaid', 'table', 'json', 'html']);
  assert.equal(blocks[0].surface.data, 'graph TD; A-->B');
  assert.deepEqual((blocks[1].surface.data as any).rows, [{ c0: 'Apple', c1: '3' }]);
  assert.deepEqual(blocks[2].surface.data, { ok: true });
  assert.deepEqual(textPanelBlocks('no blocks here'), []);
});

test('CLI: printSurface prints a table result as text and ignores plain results', async () => {
  const { createClientShell } = await import('../dist/index.js');
  const shell = createClientShell({});
  const lines: string[] = [];
  const log = console.log;
  console.log = (...a: any[]) => lines.push(a.join(' '));
  try {
    assert.equal(shell.printSurface({ uiSurface: { component: 'table', title: 'T', data: { rows: [{ a: 1 }] } } }), true);
    assert.equal(shell.printSurface({ ok: true }), false);
  } finally {
    console.log = log;
  }
  assert.match(lines.join('\n'), /Table: T · 1 rows\na\n-\n1/);
});
