import test from 'node:test';
import assert from 'node:assert/strict';
import { createSplitVegetationUnit, createVegetationDocument, compileVegetationRecipe,
  transformVegetationUnit, sampleBrushContact } from '../dist/index.js';

const settings = { technique: 'dot-leaf', width: 200, height: 160, seed: 261131 };
const bands = () => [{ id: 'left', offset: 3, width: 2 }, { id: 'right', offset: -2, width: 3, pressureScale: .6 }];
const path = () => ({ id: 'touch', points: [{ x: 20, y: 30, pressure: .2 }, { x: 30, y: 30, pressure: 1 },
  { x: 40, y: 30, pressure: 0 }], options: { width: 12, start: 1.3, duration: .7,
  axis: 'center', entry: 'preserve', finish: 'preserve', turn: 'preserve', smoothing: 'linear',
  controls: [{ at: 0, pressure: .8, side: .1, angle: 1.5 }, { at: .6, dryness: .9 },
    { at: 1, pressure: .1, side: .2, angle: 1.7 }],
  clip: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }] } });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);

test('explicit contact bundles share an authored route, timing and local controls while owning their editable source', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const source = path(), bundles = bands(), savedSource = structuredClone(source), savedBundles = structuredClone(bundles);
  const unit = createSplitVegetationUnit('broken-a', source, bundles);
  assert.equal(unit.id, 'broken-a');
  assert.deepEqual(unit.strokes.map(stroke => stroke.id), ['5:touch/4:left', '5:touch/5:right']);
  for (const [i, stroke] of unit.strokes.entries()) {
    assert.equal(stroke.options.width, bundles[i].width);
    for (const key of ['start', 'duration', 'controls', 'clip', 'axis', 'entry', 'finish', 'turn', 'smoothing']) {
      assert.deepEqual(stroke.options[key], source.options[key]);
    }
    stroke.points.forEach((point, j) => {
      assert.equal(point.x, source.points[j].x);
      assert.equal(point.y, source.points[j].y + bundles[i].offset);
      assert.equal(point.pressure, source.points[j].pressure * (bundles[i].pressureScale ?? 1));
    });
  }
  assert.deepEqual(source, savedSource);
  assert.deepEqual(bundles, savedBundles);
  assert.ok(Object.isFrozen(unit) && Object.isFrozen(unit.strokes) && Object.isFrozen(unit.strokes[0])
    && Object.isFrozen(unit.strokes[0].points[0]) && Object.isFrozen(unit.strokes[0].options.controls[0]));
  source.points[0].x = 100;
  source.options.controls[0].pressure = 0;
  source.options.clip[0].x = 100;
  bundles[0].width = 90;
  assert.equal(unit.strokes[0].points[0].x, 20);
  assert.equal(unit.strokes[0].options.controls[0].pressure, .8);
  assert.equal(unit.strokes[0].options.clip[0].x, 10);
  assert.equal(unit.strokes[0].options.width, 2);
});

test('contact normals follow arbitrary directions and commute with rigid source rotation and translation', () => {
  const source = { id: 'curve', points: [{ x: 10, y: 10, pressure: 0 }, { x: 20, y: 12, pressure: .8 },
    { x: 20, y: 12, pressure: .3 }, { x: 27, y: 24, pressure: .2 }, { x: 34, y: 27 }] };
  const original = createSplitVegetationUnit('a', source, bands());
  for (const angle of [Math.PI / 2, Math.PI, -.71]) {
    const move = point => ({ ...point, x: point.x * Math.cos(angle) - point.y * Math.sin(angle) + 40,
      y: point.x * Math.sin(angle) + point.y * Math.cos(angle) - 8 });
    const moved = createSplitVegetationUnit('a', { ...source, points: source.points.map(move) }, bands());
    moved.strokes.forEach((stroke, i) => stroke.points.forEach((point, j) => {
      const expected = move(original.strokes[i].points[j]);
      near(point.x, expected.x); near(point.y, expected.y);
      assert.equal(point.pressure, expected.pressure);
    }));
  }
});

test('repeated vertices share the corner bisector and exact reversals use the outgoing segment', () => {
  const bundles = [{ id: 'a', offset: 2, width: 1 }, { id: 'b', offset: 0, width: 1 }];
  const source = { id: 'turn', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] };
  const unit = createSplitVegetationUnit('corner', source, bundles);
  near(unit.strokes[0].points[1].x, 5 - Math.SQRT2);
  near(unit.strokes[0].points[1].y, Math.SQRT2);
  assert.deepEqual(unit.strokes[0].points[1], unit.strokes[0].points[2]);
  assert.deepEqual(unit.strokes[0].points[0], { x: 0, y: 2 });
  assert.deepEqual(unit.strokes[0].points[3], { x: 3, y: 5 });
  assert.deepEqual(unit.strokes[1].points, source.points, 'zero offset retains exact sparse coordinates and pressure');
  const reversal = createSplitVegetationUnit('fold', { id: 'back', points: [
    { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 } ] }, bundles);
  assert.deepEqual(reversal.strokes[0].points, [{ x: 0, y: 2 }, { x: 5, y: -2 }, { x: 0, y: -2 }]);
});

test('zero point pressure and zero bundle pressure remain blank with local contact channels and absolute timing', () => {
  const source = path();
  source.points = source.points.map(point => ({ ...point, pressure: 0 }));
  const zero = createVegetationDocument([createSplitVegetationUnit('zero', source, bands())], settings);
  for (const mark of zero.result.marks) {
    assert.ok(sampleBrushContact(mark).every(sample => sample.pressure === 0 && sample.halfWidth === 0));
    assert.equal(mark.start, source.options.start);
    assert.equal(mark.duration, source.options.duration);
  }
  const scaled = createSplitVegetationUnit('scale', { id: 'plain', points: [{ x: 10, y: 10 }, { x: 30, y: 14 }] },
    [{ id: 'off', offset: 2, width: 3, pressureScale: 0 }, { id: 'half', offset: -2, width: 2, pressureScale: .5 }]);
  assert.ok(scaled.strokes[0].points.every(point => point.pressure === 0));
  assert.ok(scaled.strokes[1].points.every(point => point.pressure === .5));
  const document = createVegetationDocument([scaled], settings);
  assert.ok(sampleBrushContact(document.result.marks[0]).every(sample => sample.halfWidth === 0));
});

test('ordinary split members rebuild from JSON and keep identities and material seeds when bundle order changes', () => {
  const source = path();
  const original = createVegetationDocument([createSplitVegetationUnit('a', source, bands()),
    { id: 'other', strokes: [{ id: 'line', points: [{ x: 80, y: 20 }, { x: 90, y: 40 }] }] }], settings);
  const reordered = createVegetationDocument([createSplitVegetationUnit('a', source, bands().reverse())], settings);
  for (const mark of reordered.result.marks) assert.deepEqual(mark, original.result.marks.find(other => other.id === mark.id));
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(original.recipe))), original.result);
  const edited = transformVegetationUnit(original, 'a', { translation: { x: 4, y: 7 },
    rotation: .3, pivot: { x: 20, y: 30 }, widthScale: 1.4 });
  assert.deepEqual(edited.recipe.units[1], original.recipe.units[1]);
  assert.deepEqual(edited.result.marks[2], original.result.marks[2]);
  edited.result.marks.forEach((mark, i) => assert.equal(mark.seed, original.result.marks[i].seed));
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(edited.recipe))), edited.result);
  assert.deepEqual(createSplitVegetationUnit('a', source, bands()), createSplitVegetationUnit('a', source, bands()));
});

test('length-prefixed member identities remain distinct when callers combine separately expanded sources', () => {
  const source = path();
  const first = createSplitVegetationUnit('first', { ...source, id: 'a/b' }, [
    { id: 'c', offset: 2, width: 1 }, { id: 'other', offset: -2, width: 1 },
  ]);
  const second = createSplitVegetationUnit('second', { ...source, id: 'a' }, [
    { id: 'b/c', offset: 2, width: 1 }, { id: 'other', offset: -2, width: 1 },
  ]);
  assert.equal(first.strokes[0].id, '3:a/b/1:c');
  assert.equal(second.strokes[0].id, '1:a/3:b/c');
  const combined = { id: 'combined', strokes: [...first.strokes, ...second.strokes] };
  assert.equal(new Set(combined.strokes.map(stroke => stroke.id)).size, 4);
  const document = createVegetationDocument([combined], settings);
  assert.equal(document.result.marks.length, 4);
  assert.equal(new Set(document.result.marks.map(mark => mark.id)).size, 4);
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
});

test('absolute bundle widths and later width edits do not move the authored offset geometry', () => {
  const source = path(), original = createSplitVegetationUnit('a', source, bands());
  const wider = createSplitVegetationUnit('a', { ...source, options: { ...source.options, width: 120 } },
    bands().map(bundle => ({ ...bundle, width: bundle.width * 4 })));
  original.strokes.forEach((stroke, i) => {
    assert.deepEqual(wider.strokes[i].points, stroke.points);
    assert.equal(wider.strokes[i].options.width, stroke.options.width * 4);
  });
  const document = createVegetationDocument([original], settings);
  const edited = transformVegetationUnit(document, 'a', { widthScale: 2 });
  edited.recipe.units[0].strokes.forEach((stroke, i) => assert.deepEqual(stroke.points, original.strokes[i].points));
});

test('ambiguous identities, malformed controls, degenerate paths and nonfinite contact inputs fail without mutation', () => {
  const source = path(), saved = structuredClone(source);
  for (const id of [null, undefined, '', ' ', 3]) assert.throws(() => createSplitVegetationUnit(id, source, bands()));
  for (const bundles of [null, undefined, {}, [], [bands()[0]], Array.from({ length: 33 }, (_, i) => ({ id: `${i}`, offset: i, width: 1 })),
    [bands()[0], bands()[0]], [null, bands()[0]],
    ...[{ id: '' }, { id: 3 }, { offset: NaN }, { offset: Infinity }, { offset: '3' },
      { width: 0 }, { width: -1 }, { width: '1' }, { width: Infinity }, { width: undefined },
      { pressureScale: null }, { pressureScale: -1 }, { pressureScale: 1.01 }, { pressureScale: '1' },
      { range: [0, 1] }].map(patch => [{ ...bands()[0], ...patch }, bands()[1]])]) {
    assert.throws(() => createSplitVegetationUnit('a', source, bundles));
  }
  for (const invalid of [null, {}, { ...source, extra: true }, { ...source, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] },
    { ...source, points: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }] },
    { ...source, points: [{ x: 0, y: 0, pressure: 2 }, { x: 10, y: 0 }] },
    { ...source, options: { width: 0 } }, { ...source, options: { start: -1 } },
    { ...source, options: { controls: [{ at: .8 }, { at: .3 }] } },
    { ...source, options: { controls: [{ at: .3, pressure: 2 }] } },
    { ...source, options: { clip: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } },
    { ...source, options: { controls: [{ at: .5, unknown: 1 }] } }]) {
    assert.throws(() => createSplitVegetationUnit('a', invalid, bands()));
  }
  assert.throws(() => createSplitVegetationUnit('a', { id: 'huge', points: [
    { x: 0, y: Number.MAX_VALUE }, { x: 10, y: Number.MAX_VALUE }] },
    [{ id: 'a', offset: Number.MAX_VALUE, width: 1 }, { id: 'b', offset: 0, width: 1 }]));
  assert.deepEqual(source, saved);
});
