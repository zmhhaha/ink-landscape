import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkProcessDocument, compileInkProcessRecipe, reviseInkProcessDocument,
  createWaterProcessDocument, compileWaterProcessRecipe, rasterizeInkProcess } from '../dist/index.js';

const options = { width: 160, height: 100, seed: 48 };
const contact = { points: [{ x: 70, y: 50, pressure: 1 }, { x: 90, y: 50, pressure: 1 }],
  options: { width: 40, dryness: 0, opacity: 1, gestureModel: 'local-v1', entry: 'preserve', finish: 'preserve',
    pressureProfile: 'preserve', rhythm: 'continuous', turn: 'preserve' } };
const make = extra => createInkProcessDocument([{ id: 'wash', strokes: [contact], water: 0, ...extra }], options);
const frame = document => rasterizeInkProcess(document.result, { cellSize: 1 }).density;
const sum = values => values.reduce((a, b) => a + b, 0);

test('optional contact feather preserves old coverage and produces a finite inward density falloff', () => {
  const old = make({}), zero = make({ edgeSoftness: 0 }), soft = make({ edgeSoftness: .95 });
  assert.equal(Object.hasOwn(old.recipe.layers[0], 'edgeSoftness'), false);
  assert.equal(Object.hasOwn(old.result.layers[0], 'edgeSoftness'), false);
  const hardDensity = frame(old), softDensity = frame(soft);
  assert.deepEqual(frame(zero), hardDensity, 'explicit zero retains legacy raster arithmetic');
  assert.ok(sum(softDensity) > sum(hardDensity) * .25 && sum(softDensity) < sum(hardDensity) * .9);
  assert.ok(softDensity.every((value, i) => Number.isFinite(value) && value >= 0 && value <= hardDensity[i] + 1e-6));
  assert.ok(softDensity[50 * 160 + 80] > hardDensity[50 * 160 + 80] * .8, 'the center remains readable');
  assert.ok(softDensity[65 * 160 + 80] < hardDensity[65 * 160 + 80] * .4, 'coverage fades before the original edge');
  assert.ok(sum(frame(make({ edgeSoftness: .3 }))) > sum(softDensity));
  assert.deepEqual(compileInkProcessRecipe(JSON.parse(JSON.stringify(soft.recipe))), soft.result);
  assert.deepEqual(rasterizeInkProcess(JSON.parse(JSON.stringify(soft.result)), { cellSize: 1 }).density, softDensity);
});

test('feather is owned by its layer and survives water event source rebuilding and local revision', () => {
  const original = createInkProcessDocument([{ id: 'a', strokes: [contact] },
    { id: 'b', strokes: [contact], edgeSoftness: .9, at: 2 }], options);
  const changed = reviseInkProcessDocument(original, { layers: original.recipe.layers.map(layer => layer.id === 'b' ? { ...layer, edgeSoftness: .5 } : layer) });
  assert.deepEqual(changed.result.layers[0], original.result.layers[0]);
  assert.equal(changed.result.layers[1].edgeSoftness, .5);
  const water = createWaterProcessDocument([{ kind: 'ink', id: 'ink', strokes: [contact], edgeSoftness: .9 },
    { kind: 'water', id: 'clear', droplets: [{ id: 'drop', x: 80, y: 50, radius: 12 }], edgeSoftness: .6, at: .5 }], options);
  assert.equal(water.recipe.events[0].edgeSoftness, .9);
  assert.equal(water.recipe.events[1].edgeSoftness, .6);
  assert.deepEqual(compileWaterProcessRecipe(JSON.parse(JSON.stringify(water.recipe))), water.result);
  const complete = frame(water);
  rasterizeInkProcess(water.result, { cellSize: 1, time: .1 });
  assert.deepEqual(frame(water), complete);
});

test('invalid source or saved playback feather values are rejected', () => {
  for (const value of [-1, 2, Infinity, NaN, null]) {
    assert.throws(() => make({ edgeSoftness: value }), /edgeSoftness/);
    assert.throws(() => createWaterProcessDocument([{ kind: 'ink', id: 'i', strokes: [contact], edgeSoftness: value }], options), /edgeSoftness/);
    const saved = JSON.parse(JSON.stringify(make({}).result)); saved.layers[0].edgeSoftness = value;
    assert.throws(() => rasterizeInkProcess(saved), /edgeSoftness/);
  }
});
