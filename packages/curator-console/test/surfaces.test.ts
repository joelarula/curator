import test from 'node:test';
import assert from 'node:assert/strict';
import { useSurfaces } from '../src/composables/useSurfaces.ts';
import { isAllowedImageSource, sandboxDocument } from '../src/composables/richText.ts';

test('useSurfaces: newest first, same request or same client surface replaces, open/close', () => {
  const s = useSurfaces();
  const a = s.show({ component: 'table', title: 'A', data: { rows: [] } }, { requestId: 1 });
  const b = s.show({ component: 'markdown', title: 'B', data: '# b' }, { requestId: 2 });
  assert.deepEqual(s.entries.value.map((e) => e.id), [b, a]);
  assert.equal(s.active.value?.title, 'B');
  const a2 = s.show({ component: 'table', title: 'A2', data: { rows: [] } }, { requestId: 1 });
  assert.equal(a2, a, 'same request replaces its entry');
  assert.equal(s.entries.value.length, 2);
  const r1 = s.show({ component: 'resource-collection', title: 'Res', items: [] });
  const r2 = s.show({ component: 'resource-collection', title: 'Res', items: [1] });
  assert.equal(r1, r2, 'client-opened surface with the same component and title replaces');
  assert.equal(s.entryFor(2)?.id, b);
  s.open(a);
  assert.equal(s.active.value?.title, 'A2');
  s.close();
  assert.equal(s.active.value, null);
  s.active.value = { component: 'json', data: { x: 1 } };
  assert.equal(s.active.value?.component, 'json', 'assigning active shows it');
});

test('useSurfaces: rebuild from stored responses (newest becomes active when nothing is open)', () => {
  const s = useSurfaces();
  const added = s.rebuildFrom([
    { id: 9, responses: [{ content: JSON.stringify({ uiSurface: { component: 'table', title: 'New', data: { rows: [] } } }) }] },
    { id: 8, responses: [{ content: 'plain text' }, { content: '{"not":"a surface"}' }] },
    { id: 7, responses: [{ content: JSON.stringify({ uiSurface: { component: 'markdown', title: 'Old', data: 'x' } }) }] },
  ]);
  assert.equal(added, 2);
  assert.deepEqual(s.entries.value.map((e) => [e.requestId, e.surface.title]), [['9', 'New'], ['7', 'Old']]);
  assert.equal(s.active.value?.title, 'New');
  assert.equal(s.rebuildFrom([{ id: 9, responses: [{ content: JSON.stringify({ uiSurface: { component: 'table', data: {} } }) }] }]), 0, 'known requests are skipped');
});

test('image sources and the sandbox document', () => {
  assert.equal(isAllowedImageSource('data:image/png;base64,AAAA'), true);
  assert.equal(isAllowedImageSource('/api/resources/1/image'), true);
  assert.equal(isAllowedImageSource('//evil.example/x.png'), false);
  assert.equal(isAllowedImageSource('https://evil.example/x.png'), false);
  assert.equal(isAllowedImageSource('javascript:alert(1)'), false);
  const doc = sandboxDocument('<b>hi</b>');
  assert.match(doc, /Content-Security-Policy" content="default-src 'none'/);
  assert.match(doc, /<body><b>hi<\/b><\/body>/);
});
