import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrushDocument, compileBrushRecipe, reviseBrushDocument } from '../dist/brush-document.js';
import { createInkScene } from '../dist/core.js';
import { brushStateAt } from '../dist/brush-state.js';

const path = [
  { x: 15, y: 40, pressure: .3 }, { x: 100, y: 25, pressure: .9 }, { x: 170, y: 100, pressure: .5 },
];
const defaults = { pressure: 1, side: 0, angle: Math.PI / 2, dryness: .25, inkLoad: 1 };

test('brush documents own original intent and generated data without a browser', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const source = structuredClone(path);
  const controls = [{ at: .4, pressure: .2 }, { at: .7, side: .8 }];
  const clip = [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 160 }, { x: 0, y: 160 }];
  const document = createBrushDocument(source, { entry: 'concealed', finish: 'return', controls, clip, seed: 0 });
  assert.deepEqual(document.recipe.points, path, 'preserves the authored path before gestures');
  assert.notDeepEqual(document.result.points, document.recipe.points, 'entry and finish affect only compiled geometry');
  source[0].x = -999; controls[0].pressure = 1; clip[0].x = -999;
  assert.deepEqual(document.recipe.points, path);
  assert.equal(document.recipe.options.controls[0].pressure, .2);
  assert.equal(document.recipe.options.clip[0].x, 0);
  assert.equal(document.result.seed, 0);
  for (const value of [document, document.recipe, document.recipe.points, document.recipe.points[0], document.recipe.options,
    document.recipe.options.controls, document.recipe.options.controls[0], document.recipe.options.clip,
    document.recipe.options.clip[0], document.result, document.result.points, document.result.points[0],
    document.result.brush, document.result.brush.controls, document.result.brush.controls[0]]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { document.recipe.options.controls[0].pressure = .9; }, TypeError);
});

test('saved source reproduces composed gestures, local controls and builder playback exactly', () => {
  const options = {
    id: 'composed', seed: 719, width: 28, axis: 'side', entry: 'concealed', finish: 'return',
    pressureProfile: 'lift-press', turn: 'angular', rhythm: 'hesitant', start: 3, duration: 4,
    controls: [{ at: 0, dryness: .1 }, { at: .5, pressure: .6, side: 0 }, { at: 1, dryness: .9 }],
  };
  const document = createBrushDocument(path, options);
  const saved = JSON.parse(JSON.stringify(document));
  assert.deepEqual(saved, document);
  assert.deepEqual(compileBrushRecipe(saved.recipe), document.result);
  assert.deepEqual(createBrushDocument(path, options), document);
  assert.equal(document.result.nib, 'round', 'contact semantics no longer use a flat nib default');
  assert.equal(document.result.tipAngle, 0);
  assert.equal(document.result.brush.controls[0].side, 1);
  assert.equal(document.result.start, 3);
  assert.equal(document.result.duration, 4);
  const builder = createInkScene({ width: 240, height: 180 });
  const playback = builder.stroke(saved.result.points, saved.result);
  assert.deepEqual(playback, document.result);
  assert.ok(Object.isFrozen(playback.brush.controls[0]));
});

test('editing semantic source regenerates a new document and replaces control arrays', () => {
  const original = createBrushDocument(path, { controls: [{ at: .5, pressure: .2 }], seed: 91 });
  const changed = reviseBrushDocument(JSON.parse(JSON.stringify(original)), { options: { axis: 'side' } });
  assert.equal(changed.recipe.options.axis, 'side');
  assert.equal(changed.result.brush.controls[0].side, 1, 'implicit endpoint defaults follow the revised axis');
  assert.equal(original.result.brush.controls[0].side, 0);
  assert.deepEqual(changed.recipe.options.controls, original.recipe.options.controls);
  const nextPath = path.map(point => ({ ...point, y: point.y + 20 }));
  const replacement = reviseBrushDocument(changed, { points: nextPath, options: { controls: [{ at: 0, side: 0 }, { at: 1, side: 1 }] } });
  assert.deepEqual(replacement.recipe.options.controls, [{ at: 0, side: 0 }, { at: 1, side: 1 }]);
  assert.equal(replacement.result.brush.controls[0].side, 0);
  assert.deepEqual(replacement.recipe.points, nextPath);
  assert.equal(replacement.result.seed, original.result.seed);
  assert.deepEqual(reviseBrushDocument(original, {}).result, original.result);
  const tamperedPlayback = { ...original, result: { ...original.result, width: 999 } };
  assert.equal(reviseBrushDocument(tamperedPlayback, {}).result.width, 24, 'revision derives from the recipe, not a stale playback result');
});

test('sparse controls keep independent channel anchors and preserve authored zero pressure', () => {
  const document = createBrushDocument(path, { axis: 'side', dryness: .4, controls: [
    { at: 0, dryness: .1 }, { at: .3, pressure: .2 }, { at: .7, angle: -.2 }, { at: 1, dryness: .9 },
  ] });
  const state = brushStateAt(document.result.brush, .3, defaults);
  assert.equal(state.pressure, .2);
  assert.equal(state.side, 1);
  assert.ok(state.dryness > .1 && state.dryness < .9, 'a pressure-only control does not reset dryness');
  assert.equal(document.recipe.options.controls[1].side, undefined, 'source retains sparse intent instead of generated defaults');
  const blank = createBrushDocument(path.map(point => ({ ...point, pressure: 0 })), {
    axis: 'side', entry: 'concealed', finish: 'return', pressureProfile: 'lift-press',
    controls: [{ at: .5, pressure: 1 }],
  });
  assert.ok(blank.result.points.every(point => point.pressure === 0));
});

test('document and generator versions fail explicitly and invalid controls cannot enter saved data', () => {
  const document = createBrushDocument(path);
  for (const recipe of [null, { ...document.recipe, version: 2 }, { ...document.recipe, generator: 'ink-brush-contact-v2' }]) {
    assert.throws(() => compileBrushRecipe(recipe), /version/);
  }
  assert.throws(() => reviseBrushDocument({ ...document, version: 2 }, {}), /document version/);
  assert.throws(() => reviseBrushDocument(document, null), /patch/);
  assert.throws(() => reviseBrushDocument(document, { points: null }), /points/);
  assert.throws(() => reviseBrushDocument(document, { control: [] }), /patch/);
  for (const options of [
    { nib: 'flat' }, { tipAngle: 1 }, { brush: { version: 1, controls: [] } }, { mystery: 1 },
    { axis: 'flat' }, { entry: 'unknown' }, { strength: 2 }, { width: 0 }, { seed: .1 }, { duration: -1 },
    { controls: [{ at: .4 }, { at: .4, pressure: .2 }] }, { controls: [{ at: 1 }, { at: 0 }] },
    { controls: [{ at: -1 }] }, { controls: [{ at: .5, pressure: 1.1 }] },
    { controls: [{ at: .5, angle: NaN }] }, { controls: [{ at: .5, dryness: Infinity }] },
  ]) assert.throws(() => createBrushDocument(path, options));
  assert.throws(() => createBrushDocument([{ x: 0, y: 0 }, { x: Infinity, y: 2 }]));
  assert.throws(() => createBrushDocument(path, { controls: Array.from({ length: 129 }, (_, i) => ({ at: i / 128 })) }), /128/);
});
