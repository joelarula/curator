import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCuratorAst, assertValidCuratorAst, AST_LIMITS } from '../../src/engine/CuratorAstValidation.js';

const tool = { type: 'Curator_Tool', toolName: 'x', args: {} };

test('validate: accepts a well-formed tree', () => {
  const r = validateCuratorAst({ type: 'Curator_Sequential', name: 's', subAgents: [tool, tool] });
  assert.equal(r.valid, true, r.errors.join('; '));
});

test('validate: normalizes pipeline aliases to Curator_* nodes', () => {
  const r = validateCuratorAst({ type: 'Sequence', id: 'p', steps: [{ type: 'ToolTask', tool: 'echo', args: { a: 1 } }] });
  assert.equal(r.valid, true, r.errors.join('; '));
  const node: any = r.node;
  assert.equal(node.type, 'Curator_Sequential');
  assert.equal(node.name, 'p');
  assert.deepEqual(node.subAgents[0], { type: 'Curator_Tool', toolName: 'echo', args: { a: 1 } });
});

test('validate: rejects unknown node types and missing required fields', () => {
  assert.equal(validateCuratorAst({ type: 'Curator_Bogus' }).valid, false);
  assert.equal(validateCuratorAst({ type: 'Curator_Tool' }).valid, false);
  assert.equal(validateCuratorAst({ nope: 1 }).valid, false);
  assert.equal(validateCuratorAst(null).valid, false);
});

test('validate: rejects trees deeper than maxDepth', () => {
  let node: any = tool;
  for (let i = 0; i <= AST_LIMITS.maxDepth + 1; i++) node = { type: 'Curator_Sequential', name: `d${i}`, subAgents: [node] };
  const r = validateCuratorAst(node);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /depth/);
});

test('validate: rejects trees with more than maxNodes nodes', () => {
  const r = validateCuratorAst({ type: 'Curator_Parallel', name: 'p', subAgents: Array.from({ length: AST_LIMITS.maxNodes + 1 }, () => tool) });
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /nodes/);
});

test('validate: rejects oversize input', () => {
  const big = validateCuratorAst({ type: 'Curator_Tool', toolName: 'x', args: { blob: 'a'.repeat(AST_LIMITS.maxSerializedBytes) } });
  assert.equal(big.valid, false);
  assert.match(big.errors[0], /serialized bytes/);
});

test('validate: Curator_Loop maxIterations is bounded by the schema', () => {
  const loop = (maxIterations: number) => ({ type: 'Curator_Loop', name: 'l', maxIterations, agent: tool });
  assert.equal(validateCuratorAst(loop(AST_LIMITS.maxLoopIterations)).valid, true);
  assert.equal(validateCuratorAst(loop(AST_LIMITS.maxLoopIterations + 1)).valid, false);
  assert.equal(validateCuratorAst(loop(0)).valid, false);
});

test('assertValidCuratorAst: throws with the joined error list', () => {
  assert.throws(() => assertValidCuratorAst({ type: 'Curator_Bogus' }), /Invalid Curator AST/);
});
