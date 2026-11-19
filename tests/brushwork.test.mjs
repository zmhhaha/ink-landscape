import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkScene } from '../dist/core.js';
import { createBrushStroke } from '../dist/brushwork.js';

const source = [{ x: 20, y: 50, pressure: .45 }, { x: 120, y: 50, pressure: .90 }, { x: 180, y: 110, pressure: .55 }];
const xy = point => ({ x: point.x, y: point.y });

test('brushwork preserves caller paths and pressure by default without a browser', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const mark = createBrushStroke(source, { id: 'owned', width: 12, seed: 0, start: 2, duration: 4 });
  assert.deepEqual(mark.points, source);
  assert.equal(mark.start, 2); assert.equal(mark.duration, 4); assert.equal(mark.seed, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(mark)), mark);
  assert.ok(Object.isFrozen(mark) && Object.isFrozen(mark.points) && Object.isFrozen(mark.points[0]));
  const mutable = source.map(point => ({ ...point }));
  const owned = createBrushStroke(mutable);
  mutable[0].x = 900;
  assert.equal(owned.points[0].x, 20);
  const builder = createInkScene({ width: 200, height: 150 });
  assert.deepEqual(builder.stroke(mark.points, mark), mark);
});

test('center and side configure nib defaults while explicit caller styles win', () => {
  const center = createBrushStroke(source, { axis: 'center' });
  const side = createBrushStroke(source, { axis: 'side' });
  assert.equal(center.nib, 'round'); assert.equal(side.nib, 'flat');
  assert.deepEqual(center.points, side.points);
  assert.notEqual(center.tipAngle, side.tipAngle);
  const override = createBrushStroke(source, { axis: 'side', nib: 'round', width: 7, tipAngle: -.3, dryness: .1 });
  assert.equal(override.nib, 'round'); assert.equal(override.width, 7);
  assert.equal(override.tipAngle, -.3); assert.equal(override.dryness, .1);
});

test('concealed entry makes a local reverse movement and exposed entry tapers at the supplied origin', () => {
  const hidden = createBrushStroke(source, { entry: 'concealed', width: 18 });
  const exposed = createBrushStroke(source, { entry: 'exposed', width: 18 });
  assert.deepEqual(xy(hidden.points[0]), xy(source[0]));
  assert.ok(hidden.points.some(point => point.x < source[0].x));
  assert.ok(hidden.points.every(point => point.x > source[0].x - 18));
  assert.ok(exposed.points.every(point => point.x >= source[0].x));
  assert.ok(exposed.points[0].pressure < source[0].pressure * .1);
  assert.deepEqual(hidden.points.at(-1), source.at(-1));
  assert.deepEqual(exposed.points.at(-1), source.at(-1));
});

test('open finish tapers at the endpoint and return finish travels back inside the final segment', () => {
  const open = createBrushStroke(source, { finish: 'open', width: 18 });
  const returned = createBrushStroke(source, { finish: 'return', width: 18 });
  assert.deepEqual(xy(open.points.at(-1)), xy(source.at(-1)));
  assert.ok(open.points.at(-1).pressure < source.at(-1).pressure * .1);
  assert.deepEqual(xy(returned.points.at(-3)), xy(source.at(-1)));
  assert.ok(returned.points.at(-1).x < source.at(-1).x);
  assert.ok(returned.points.at(-1).y < source.at(-1).y);
  assert.ok(Math.hypot(returned.points.at(-1).x - source.at(-1).x, returned.points.at(-1).y - source.at(-1).y) < 18);
});

test('lift-press modulates user pressure and angular turns retain the authored corner', () => {
  const path = [{ x: 0, y: 0, pressure: .6 }, { x: 100, y: 0, pressure: .6 }, { x: 100, y: 100, pressure: .6 }];
  const lifted = createBrushStroke(path, { pressureProfile: 'lift-press', width: 14 });
  assert.ok(lifted.points[0].pressure < .2 && lifted.points.at(-1).pressure < .2);
  assert.ok(lifted.points.some(point => point.pressure > .59));
  assert.ok(lifted.points.every(point => point.pressure <= .6));
  const angular = createBrushStroke(path, { turn: 'angular', width: 14 });
  assert.equal(angular.smoothing, 'linear');
  assert.ok(angular.points.some(point => point.x === 100 && point.y === 0));
  assert.ok(angular.points.every(point => point.y === 0 || point.x === 100));
  assert.equal(createBrushStroke(path, { turn: 'round' }).smoothing, 'catmull-rom');
  const untouched = source.map(point => ({ ...point }));
  createBrushStroke(untouched, { entry: 'concealed', finish: 'return', pressureProfile: 'lift-press', turn: 'angular' });
  assert.deepEqual(untouched, source);
});

test('hesitant and reverse contact studies keep direction, reproduce seeds and retain zero-pressure gaps', () => {
  const path = [{ x: 0, y: 0, pressure: .8 }, { x: 180, y: 0, pressure: .8 }];
  for (const options of [{ rhythm: 'hesitant' }, { drag: 'reverse' }]) {
    const a = createBrushStroke(path, { ...options, seed: 12, width: 14 });
    const b = createBrushStroke(path, { ...options, seed: 12, width: 14 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.points, createBrushStroke(path, { ...options, seed: 13, width: 14 }).points);
    assert.deepEqual(xy(a.points[0]), xy(path[0]));
    assert.deepEqual(xy(a.points.at(-1)), xy(path.at(-1)));
    assert.ok(a.points.some(point => point.y !== 0));
    assert.ok(a.points.every(point => point.pressure >= 0 && point.pressure <= 1));
  }
  const blank = createBrushStroke(source.map(point => ({ ...point, pressure: 0 })), {
    pressureProfile: 'lift-press', rhythm: 'hesitant', drag: 'reverse', turn: 'angular', entry: 'concealed', finish: 'return',
  });
  assert.ok(blank.points.every(point => point.pressure === 0));
  const offsetPath = [{ x: 1e16, y: 0, pressure: .6 }, { x: 1, y: 1, pressure: .6 }];
  const offset = createBrushStroke(offsetPath, { pressureProfile: 'lift-press', rhythm: 'hesitant', drag: 'reverse' });
  assert.deepEqual(xy(offset.points[0]), xy(offsetPath[0]));
  assert.deepEqual(xy(offset.points.at(-1)), xy(offsetPath.at(-1)));
});

test('gesture composition is bounded and validates source, options, clipping and absolute timing', () => {
  const options = { entry: 'concealed', finish: 'return', pressureProfile: 'lift-press', rhythm: 'hesitant', drag: 'reverse', turn: 'angular', seed: 7, width: 18 };
  const mark = createBrushStroke(source, options);
  assert.ok(mark.points.length < 1000);
  assert.ok(mark.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.pressure)));
  for (const invalid of [{ axis: 'flat' }, { entry: 'unknown' }, { finish: 'sharp' }, { pressureProfile: 'custom' },
    { rhythm: 'random' }, { turn: 'smooth' }, { drag: 'backwards' }, { strength: 2 }, { strength: NaN }, { width: -1 }, { duration: -1 }, { seed: .5 }]) {
    assert.throws(() => createBrushStroke(source, invalid));
  }
  assert.throws(() => createBrushStroke([{ x: 0, y: 0 }, { x: Infinity, y: 5 }]));
  assert.throws(() => createBrushStroke([{ x: 1, y: 1 }, { x: 1, y: 1 }]));
  assert.throws(() => createBrushStroke(source, { clip: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }));
  const repeated = createBrushStroke([{ x: 0, y: 0, pressure: .1 }, { x: 0, y: 0, pressure: .5 }, { x: 20, y: 5, pressure: .8 }], options);
  assert.ok(repeated.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
