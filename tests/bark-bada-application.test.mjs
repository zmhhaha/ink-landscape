import test from 'node:test';
import assert from 'node:assert/strict';
import { createBadaDocument } from '../examples/bada-composition.mjs';
import { createBadaBarkApplication } from '../examples/bada-bark-application.mjs';
import { BARK_APPLICATION_CASES } from '../examples/bark-study-fixtures.mjs';
import { compileStrokeGroupRecipe } from '../dist/stroke-group-document.js';

test('Bada bark application replaces selected strokes and preserves every other authored stroke', () => {
  const original = createBadaDocument(), updated = createBadaBarkApplication();
  const replacement = new Map();
  for (const item of BARK_APPLICATION_CASES) for (const selection of item.baselineSelection) {
    const ids = replacement.get(selection.groupId) ?? new Set();
    selection.strokeIds.forEach(id => ids.add(id));
    replacement.set(selection.groupId, ids);
  }
  const groups = new Map(updated.recipe.groups.map(group => [group.id, group]));
  for (const group of original.recipe.groups) {
    const retained = group.strokes.filter(stroke => !replacement.get(group.id)?.has(stroke.id));
    assert.deepEqual(groups.get(group.id)?.strokes ?? [], retained);
  }
  const generated = updated.recipe.groups.filter(group => group.id.startsWith('bone-bark/'));
  assert.equal(generated.filter(group => group.role === 'structure').length, 2);
  assert.equal(generated.filter(group => group.role === 'mark').length, 4);
  assert.ok(updated.result.marks.length <= 512);
  assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(updated.recipe))), updated.result);
});
