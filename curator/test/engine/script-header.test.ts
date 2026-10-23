import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CuratorEngine } from '../../src/engine/CuratorEngine.ts';
import { compileCoffeeScriptToAST } from '../../src/engine/CoffeeVerbs.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const BODY = `tool "ping", { n: 1 }\n`;

function register(scripts: any) {
  const engine = new CuratorEngine();
  engine.registerPlugin({ name: 'hdr', scripts } as any);
  return engine;
}

test('header: commented YAML block (# ---) gives id and description', () => {
  const engine = register({ 'file_name.coffee': `# ---\n# id: my_flow\n# name: My Flow\n# description: Does a thing & more\n# ---\n${BODY}` });
  const s = engine.scripts.get('my_flow');
  assert.ok(s, 'registered under the header id, not the file name');
  assert.equal(s.description, 'Does a thing & more');
  assert.equal(engine.scripts.has('file_name'), false);
});

test('header: plain YAML front matter (---) is supported', () => {
  const engine = register({ 'x.coffee': `---\nid: yaml_flow\ndescription: "quoted value"\n---\n${BODY}` });
  assert.equal(engine.scripts.get('yaml_flow')?.description, 'quoted value');
});

test('header: ### block comment is supported', () => {
  const engine = register({ 'x.coffee': `###\nid: block_flow\ndescription: in a block\n###\n${BODY}` });
  assert.equal(engine.scripts.get('block_flow')?.description, 'in a block');
});

test('header: loose leading "# key: value" lines are supported and stop at the first non-comment line', () => {
  const engine = register({ 'x.coffee': `# id: loose_flow\n# description: loose\n${BODY}# id: ignored_later\n` });
  assert.equal(engine.scripts.get('loose_flow')?.description, 'loose');
  assert.equal(engine.scripts.has('ignored_later'), false);
});

test('header: no header falls back to the file name without its extension', () => {
  const engine = register({ 'plain_flow.coffee': BODY });
  const s = engine.scripts.get('plain_flow');
  assert.ok(s);
  assert.equal(s.description, '');
});

test('header: the full source (header included) is kept as the script body', () => {
  const src = `# ---\n# id: kept\n# ---\n${BODY}`;
  assert.equal(register({ 'k.coffee': src }).scripts.get('kept')?.body, src);
});

test('header: a script with a # --- header still compiles to the same AST as without it', async () => {
  const header = `# ---\n# id: h\n# description: d\n# ---\n# ====\n# Comment banner\n# ====\n`;
  const withHeader = await compileCoffeeScriptToAST(header + BODY, {});
  const without = await compileCoffeeScriptToAST(BODY, {});
  assert.deepEqual(withHeader, without);
});

test('header: the real poker_lobby.coffee registers as poker_lobby with its description', () => {
  const file = path.resolve(here, '../../../minigames/poker/src/scripts/poker_lobby.coffee');
  const engine = register({ 'poker_lobby.coffee': readFileSync(file, 'utf8') });
  const s = engine.scripts.get('poker_lobby');
  assert.ok(s);
  assert.equal(s.description, "Texas Hold'em Lounge Concierge & Table Selection Workflow");
});
