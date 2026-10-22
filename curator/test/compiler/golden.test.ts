import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFixture, assertGolden } from '../helpers/harness.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.js';

for (const name of ['seq_set_state', 'if_else', 'for_each', 'while_loop', 'wait_emit', 'tool_error']) {
  test(`${name} compiles to the golden AST`, async () => {
    assertGolden(`${name}.ast.json`, await compileFixture(`${name}.coffee`));
  });
}

test('compilation is deterministic', async () => {
  const a = await compileFixture('seq_set_state.coffee');
  const b = await compileFixture('seq_set_state.coffee');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('validator rejects an unknown node type', () => {
  const res = validateCuratorAst({ type: 'Nope' } as any);
  assert.equal(res.valid, false);
});
