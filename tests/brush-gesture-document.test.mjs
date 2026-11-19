import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBrushDocument, reviseBrushDocument, compileBrushRecipe } from '../dist/index.js';

const points = [{ x: 20, y: 60, pressure: .5 }, { x: 120, y: 60, pressure: .8 }, { x: 180, y: 130, pressure: .6 }];
const options = { seed: 261120, width: 26, entry: 'concealed', finish: 'return', turn: 'angular',
  controls: [{ at: 0, side: 0 }, { at: .6, dryness: .7 }, { at: 1, side: .8 }] };

test('legacy semantic documents retain their pinned result when local gesture support is added', () => {
  const document = createBrushDocument(points, options);
  assert.equal(document.recipe.generator, 'ink-brush-contact-v1');
  assert.equal(document.recipe.options.gestureModel, undefined);
  assert.equal(createHash('sha256').update(JSON.stringify(document)).digest('hex'),
    'aad8a9638400226437e843adeda10e094940d641928fa9f76e2e6838f9869753');
  assert.deepEqual(compileBrushRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
});

test('local gestures save their model and version, recompile, and revise without replacing authored intent', () => {
  const original = createBrushDocument(points, options);
  const local = reviseBrushDocument(original, { options: { gestureModel: 'local-v1' } });
  assert.equal(local.recipe.generator, 'ink-brush-local-gestures-v1');
  assert.equal(local.recipe.options.gestureModel, 'local-v1');
  assert.deepEqual(local.recipe.points, points);
  assert.deepEqual(local.recipe.options.controls, original.recipe.options.controls);
  assert.notDeepEqual(local.result.points, original.result.points);
  assert.deepEqual(compileBrushRecipe(JSON.parse(JSON.stringify(local.recipe))), local.result);
  const returned = reviseBrushDocument(local, { options: { gestureModel: 'legacy' } });
  assert.equal(returned.recipe.generator, 'ink-brush-contact-v1');
  assert.deepEqual(returned.result, original.result);
  const narrowed = reviseBrushDocument(local, { options: { width: 15 } });
  assert.equal(narrowed.recipe.generator, local.recipe.generator);
  assert.equal(narrowed.result.width, 15);
  assert.deepEqual(narrowed.recipe.points, points);
});

test('generator/model mismatches and unsupported gesture models are rejected explicitly', () => {
  const legacy = createBrushDocument(points, options);
  const local = createBrushDocument(points, { ...options, gestureModel: 'local-v1' });
  assert.throws(() => compileBrushRecipe({ ...local.recipe, generator: legacy.recipe.generator }), /version/);
  assert.throws(() => compileBrushRecipe({ ...legacy.recipe, generator: local.recipe.generator }), /version/);
  assert.throws(() => createBrushDocument(points, { gestureModel: 'future-v100' }), /gestureModel/);
  assert.throws(() => compileBrushRecipe({ ...local.recipe, generator: 'future-v100' }), /version/);
});
