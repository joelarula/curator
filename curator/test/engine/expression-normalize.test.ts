import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExpression } from '../../src/engine/expressionNormalize.ts';

test('expressions: boolean words and null-safe chains, outside string literals only', () => {
  assert.equal(normalizeExpression('not $state.done and $context.x.y or $params.z'), '!$state?.done && $context?.x?.y || $params?.z');
  // Words inside strings stay as written
  assert.equal(normalizeExpression("$context.reason || 'is not open and closed or so'"), "$context?.reason || 'is not open and closed or so'");
  assert.equal(normalizeExpression('"a not b" + `c and d`'), '"a not b" + `c and d`');
  // An escaped quote does not end the string
  assert.equal(normalizeExpression("'it\'s not' or $state.a"), "'it\'s not' || $state?.a");
  // A chain already written with ?. is kept (no ??.)
  assert.equal(normalizeExpression('$state?.channel?.open == true'), '$state?.channel?.open == true');
  assert.equal(normalizeExpression('$state.items[0].name'), '$state?.items[0]?.name');
});
