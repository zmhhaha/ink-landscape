import test from 'node:test';
import assert from 'node:assert/strict';
import { createVegetationDocument, compileVegetationRecipe, transformVegetationUnit } from '../dist/index.js';
import { sampleBrushContact } from '../dist/brush-contact.js';

const settings = { technique: 'dot-leaf', width: 320, height: 240, seed: 261128 };
const path = (id, options) => ({ id, points: [
  { x: 30, y: 20, pressure: .2 }, { x: 40, y: 25, pressure: 1 }, { x: 45, y: 35, pressure: 0 },
], ...(options === undefined ? {} : { options }) });
const cluster = (id = 'cluster-a') => ({ id, strokes: [
  path('first', { width: .7200000000000001, start: 1.2, duration: .7, dryness: .42,
    clip: [{ x: 20, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 50 }, { x: 20, y: 50 }],
    controls: [{ at: 0, pressure: .6, side: .2, angle: 1.4 }, { at: 1, pressure: .1, side: .1, angle: 1.6 }] }),
  path('second'),
] });
const markId = (unit, stroke) => `${unit.length}:${unit}/${stroke.length}:${stroke}`;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} differs from ${expected}`);

test('a rigid unit edit rotates both source paths and clips before translating, preserving contact and identity', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const original = createVegetationDocument([cluster(), cluster('cluster-b')], settings);
  const saved = structuredClone(original);
  const edited = transformVegetationUnit(original, 'cluster-a', {
    rotation: Math.PI / 2, pivot: { x: 20, y: 20 }, translation: { x: 5, y: 7 },
  });
  for (const [s, stroke] of original.recipe.units[0].strokes.entries()) {
    const moved = edited.recipe.units[0].strokes[s];
    for (const [p, point] of stroke.points.entries()) {
      near(moved.points[p].x, 45 - point.y);
      near(moved.points[p].y, point.x + 7);
      assert.equal(moved.points[p].pressure, point.pressure);
    }
    if (stroke.options?.clip) for (const [p, point] of stroke.options.clip.entries()) {
      near(moved.options.clip[p].x, 45 - point.y);
      near(moved.options.clip[p].y, point.x + 7);
    }
    assert.equal(moved.id, stroke.id);
    const withoutClip = options => options && Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'clip'));
    assert.deepEqual(withoutClip(moved.options), withoutClip(stroke.options));
  }
  assert.deepEqual(edited.recipe.units[1], original.recipe.units[1]);
  for (const [i, mark] of original.result.marks.entries()) {
    assert.equal(edited.result.marks[i].id, mark.id);
    assert.equal(edited.result.marks[i].seed, mark.seed);
    if (mark.id.startsWith('9:cluster-b/')) assert.deepEqual(edited.result.marks[i], mark);
  }
  assert.deepEqual(original, saved);
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(edited.recipe))), edited.result);
});

test('zero transforms preserve sparse source, exact widths and arbitrary floating point coordinates', () => {
  const original = createVegetationDocument([cluster(), { id: 'sparse', strokes: [path('leaf')] }], settings);
  for (const transform of [{}, { rotation: 0 }, { widthScale: 1 },
    { rotation: 0, pivot: { x: Number.MAX_VALUE, y: -Number.MAX_VALUE }, translation: { x: 0, y: -0 }, widthScale: 1 }]) {
    const edited = transformVegetationUnit(original, 'cluster-a', transform);
    assert.deepEqual(edited, original);
    assert.equal(edited.recipe.units[0].strokes[0].options.width, .7200000000000001);
    assert.equal(edited.recipe.units[0].strokes[1].options, undefined);
  }
  const moved = transformVegetationUnit(original, 'sparse', { translation: { x: 7, y: 2 } });
  assert.equal(moved.recipe.units[1].strokes[0].options, undefined);
});

test('width scaling uses per-stroke, program and role defaults without changing geometry or other units', () => {
  for (const technique of ['moss', 'dot-leaf', 'outline-leaf']) {
    const defaults = { moss: 9, 'dot-leaf': 15, 'outline-leaf': 2.2 };
    for (const programWidth of [undefined, 8]) {
      const options = { ...settings, technique, ...(programWidth === undefined ? {} : { strokeWidth: programWidth }) };
      const units = [{ id: 'marks', strokes: [path('plain'), path('override', { width: 3 })] },
        { id: 'branch', role: 'structure', strokes: [path('line')] }];
      const original = createVegetationDocument(units, options);
      const scaled = transformVegetationUnit(original, 'marks', { widthScale: 2.5 });
      assert.equal(scaled.recipe.units[0].strokes[0].options.width, (programWidth ?? defaults[technique]) * 2.5);
      assert.equal(scaled.recipe.units[0].strokes[1].options.width, 7.5);
      assert.deepEqual(scaled.recipe.units[0].strokes.map(stroke => stroke.points), original.recipe.units[0].strokes.map(stroke => stroke.points));
      assert.deepEqual(scaled.recipe.units[1], original.recipe.units[1]);
      assert.deepEqual(scaled.result.marks[2], original.result.marks[2]);
      const branch = transformVegetationUnit(original, 'branch', { widthScale: 2 });
      assert.equal(branch.recipe.units[1].strokes[0].options.width, (programWidth ?? 2.4) * 2);
      assert.deepEqual(branch.result.marks.slice(0, 2), original.result.marks.slice(0, 2));
    }
  }
});

test('group translation keeps authored pressure lifts, local channels and timing', () => {
  const original = createVegetationDocument([{
    id: 'zero', strokes: [{ ...path('lift', { start: 2, duration: .3 }),
      points: [{ x: 20, y: 20, pressure: 0 }, { x: 80, y: 30, pressure: 0 }] }],
  }, cluster()], settings);
  const moved = transformVegetationUnit(original, 'zero', { translation: { x: 12, y: -3 }, widthScale: .75 });
  assert.ok(sampleBrushContact(moved.result.marks[0]).every(sample => sample.halfWidth === 0 && sample.pressure === 0));
  assert.equal(moved.result.marks[0].start, 2);
  assert.equal(moved.result.marks[0].duration, .3);
  assert.equal(moved.result.marks[0].id, markId('zero', 'lift'));
  assert.deepEqual(moved.result.marks.slice(1), original.result.marks.slice(1));
  assert.ok(Object.isFrozen(moved) && Object.isFrozen(moved.recipe.units[0].strokes[0].points));
});

test('transforms rebuild from recipe when saved playback is stale', () => {
  const original = createVegetationDocument([cluster()], settings);
  const stale = JSON.parse(JSON.stringify(original));
  stale.result.marks = [];
  assert.deepEqual(transformVegetationUnit(stale, 'cluster-a', {}), original);
  assert.deepEqual(transformVegetationUnit(stale, 'cluster-a', { translation: { x: 5, y: 1 } }),
    transformVegetationUnit(original, 'cluster-a', { translation: { x: 5, y: 1 } }));
});

test('malformed transforms, ambiguous pivots and unknown identities fail without changing input', () => {
  const original = createVegetationDocument([cluster()], settings), saved = structuredClone(original);
  for (const transform of [undefined, null, [], 1, { extra: 1 }, { translation: null }, { translation: [] },
    { translation: { x: 1 } }, { translation: { x: 1, y: 2, z: 3 } }, { translation: { x: '1', y: 2 } },
    { translation: { x: NaN, y: 2 } }, { pivot: { x: 0 } }, { pivot: { x: 0, y: Infinity } },
    { pivot: null }, { rotation: .4 }, { rotation: Infinity, pivot: { x: 0, y: 0 } },
    { rotation: '0' }, { widthScale: 0 }, { widthScale: -2 }, { widthScale: NaN }, { widthScale: '2' },
    { widthScale: null }]) assert.throws(() => transformVegetationUnit(original, 'cluster-a', transform));
  for (const id of [undefined, null, '', '  ', 4, 'missing']) assert.throws(() => transformVegetationUnit(original, id, {}));
  assert.throws(() => transformVegetationUnit(original, 'cluster-a', { widthScale: Number.MAX_VALUE }));
  assert.throws(() => transformVegetationUnit(original, 'cluster-a', { rotation: Math.PI, pivot: { x: Number.MAX_VALUE, y: 0 } }));
  assert.deepEqual(original, saved);
});

test('invalid document sources cannot be repaired accidentally by transform arithmetic', () => {
  const original = createVegetationDocument([cluster()], settings);
  const invalidDocuments = [null, { ...original, version: 2 }, { ...original, unexpected: true },
    { ...original, recipe: { ...original.recipe, version: 2 } },
    { ...original, recipe: { ...original.recipe, generator: 'future' } }];
  for (const document of invalidDocuments) assert.throws(() => transformVegetationUnit(document, 'cluster-a', {}));
  const badPoint = structuredClone(original); badPoint.recipe.units[0].strokes[0].points[0].x = '30';
  assert.throws(() => transformVegetationUnit(badPoint, 'cluster-a', { translation: { x: 1, y: 2 } }));
  const badClip = structuredClone(original); badClip.recipe.units[0].strokes[0].options.clip[0].x = '20';
  assert.throws(() => transformVegetationUnit(badClip, 'cluster-a', { translation: { x: 1, y: 2 } }));
  const badWidth = structuredClone(original); badWidth.recipe.units[0].strokes[0].options.width = '3';
  assert.throws(() => transformVegetationUnit(badWidth, 'cluster-a', { widthScale: 2 }));
});
