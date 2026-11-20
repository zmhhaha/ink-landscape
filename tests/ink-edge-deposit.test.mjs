import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkProcessDocument, createWaterProcessDocument, compileInkProcessRecipe, compileWaterProcessRecipe,
  reviseInkProcessDocument, rasterizeInkProcess } from '../dist/index.js';
const options = { width: 180, height: 120, seed: 13015 };
const strokes = [{ points: [{ x: 65, y: 60, pressure: 1 }, { x: 115, y: 60, pressure: 1 }],
  options: { width: 60, opacity: .7, dryness: 0, smoothing: 'linear', gestureModel: 'local-v1',
    entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', rhythm: 'continuous' } }];
const make = extra => createInkProcessDocument([{ id: 'wash', strokes, concentration: .4, water: 0, edgeSoftness: .4, ...extra }], options);
const frame = document => rasterizeInkProcess(document.result, { cellSize: 1 }).density;
const mass = values => values.reduce((sum, value) => sum + value, 0);

test('optional edge redistribution preserves legacy zeros, support and pigment mass while creating local margin contrast', () => {
  const old = make({}), zero = make({ edgeDeposit: 0, edgeWidth: .4 }), edged = make({ edgeDeposit: .9, edgeWidth: .4 });
  assert.equal(Object.hasOwn(old.recipe.layers[0], 'edgeDeposit'), false);
  assert.equal(Object.hasOwn(old.result.layers[0], 'edgeWidth'), false);
  const before = frame(old), after = frame(edged);
  assert.deepEqual(before, frame(zero));
  assert.deepEqual(before, frame(make({ edgeDeposit: 1, edgeWidth: 0 })));
  assert.ok(Math.abs(mass(before) - mass(after)) / mass(before) < 1e-6);
  assert.ok(after.every((value, i) => Number.isFinite(value) && value >= 0 && (before[i] > 0 || value === 0)));
  assert.ok(after.some((value, i) => value > before[i] * 1.1));
  assert.ok(after[60 * 180 + 90] < before[60 * 180 + 90]);
  const ratios = Array.from({ length: 40 }, (_, i) => { const at = 36 * 180 + 70 + i; return after[at] / Math.max(1e-9, before[at]); });
  assert.ok(Math.max(...ratios) - Math.min(...ratios) > .1, 'the margin is not a uniform contour');
});

test('edge fields survive source/result JSON and revision, and zero-pigment water cannot create ink', () => {
  const document = make({ edgeDeposit: .6, edgeWidth: .32 });
  assert.deepEqual(compileInkProcessRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
  assert.deepEqual(rasterizeInkProcess(JSON.parse(JSON.stringify(document.result)), { cellSize: 1 }).density, frame(document));
  const revised = reviseInkProcessDocument(document, { layers: document.recipe.layers.map(layer => ({ ...layer, edgeDeposit: .2 })) });
  assert.equal(revised.recipe.layers[0].edgeWidth, .32);
  assert.notDeepEqual(frame(document), frame(revised));
  const water = createWaterProcessDocument([{ kind: 'water', id: 'clear', droplets: [{ id: 'a', x: 90, y: 60, radius: 25 }], edgeDeposit: .8, edgeWidth: .4 }], options);
  assert.deepEqual(compileWaterProcessRecipe(JSON.parse(JSON.stringify(water.recipe))), water.result);
  assert.equal(mass(frame(water)), 0);
  const final = frame(document); rasterizeInkProcess(document.result, { time: -1 });
  assert.deepEqual(frame(document), final);
});

test('edge fields reject malformed authored and compiled values', () => {
  for (const key of ['edgeDeposit', 'edgeWidth']) for (const value of [-1, 2, Infinity, NaN, null, '0.3']) {
    assert.throws(() => make({ [key]: value }), new RegExp(key));
    assert.throws(() => createWaterProcessDocument([{ kind: 'water', id: 'clear', droplets: [{ id: 'a', x: 1, y: 1, radius: 2 }], [key]: value }], options), new RegExp(key));
    const saved = JSON.parse(JSON.stringify(make({}).result)); saved.layers[0][key] = value;
    assert.throws(() => rasterizeInkProcess(saved), new RegExp(key));
  }
});
