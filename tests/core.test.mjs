import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkScene, createRandom, pointInPolygon, resamplePath } from '../dist/core.js';

const region = [{ x: 10, y: 10 }, { x: 150, y: 20 }, { x: 130, y: 180 }, { x: 0, y: 160 }];
const line = [{ x: 0, y: 0, pressure: 0.2 }, { x: 30, y: 40, pressure: 0.9 }];

test('seeded random sources are independent and bounded, including seed zero', () => {
  const a = createRandom(0);
  const b = createRandom(0);
  const c = createRandom(8);
  const first = Array.from({ length: 32 }, a);
  assert.deepEqual(first, Array.from({ length: 32 }, b));
  assert.notDeepEqual(first, Array.from({ length: 32 }, c));
  assert.ok(first.every(value => value >= 0 && value < 1));
  assert.throws(() => createRandom(NaN), /finite/);
  assert.throws(() => createRandom(0.1), /integer/);
});

test('the geometry core loads and produces serializable data without browser globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const scene = createInkScene({ width: 640, height: 480, seed: 12 });
  scene.stroke(line);
  scene.wash(region);
  assert.deepEqual(JSON.parse(JSON.stringify(scene.snapshot())), scene.snapshot());
});

test('scene snapshots own their input data, remain frozen, and do not gain later marks', () => {
  const path = line.map(point => ({ ...point }));
  const clip = region.map(point => ({ ...point }));
  const scene = createInkScene({ width: 300, height: 220 });
  const mark = scene.stroke(path, { clip });
  const first = scene.snapshot();
  path[0].x = 900;
  clip[0].x = -700;
  scene.wash(region);
  assert.equal(first.marks.length, 1);
  assert.equal(scene.snapshot().marks.length, 2);
  assert.equal(mark.points[0].x, 0);
  assert.equal(mark.clip[0].x, 10);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.marks));
  assert.ok(Object.isFrozen(mark.points[0]) && Object.isFrozen(mark.clip));
  assert.throws(() => { mark.points[0].x = 12; }, TypeError);
});

test('mark IDs are unique across kinds and invalid writes are atomic', () => {
  const scene = createInkScene({ width: 300, height: 220 });
  scene.stroke(line, { id: 'shared' });
  assert.throws(() => scene.wash(region, { id: 'shared' }), /Duplicate/);
  assert.throws(() => scene.stroke(line, { opacity: 2 }), /opacity/);
  assert.equal(scene.snapshot().marks.length, 1);
  scene.stroke(line, { id: 'pima-1' });
  assert.throws(() => scene.cun(region, { idPrefix: 'pima', count: 4 }), /Duplicate/);
  assert.equal(scene.snapshot().marks.length, 2);
});

test('cun is repeatable, distinct across seeds and techniques, and carries clipping geometry', () => {
  const produce = (seed, technique = 'pima') => {
    const scene = createInkScene({ width: 200, height: 200, seed });
    const marks = scene.cun(region, { count: 24, technique });
    assert.equal(marks.length, 24);
    assert.ok(marks.every(mark => mark.clip.length === region.length));
    assert.ok(marks.every(mark => mark.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
    return scene.snapshot();
  };
  assert.deepEqual(produce(13), produce(13));
  assert.notDeepEqual(produce(13), produce(14));
  const axe = produce(13, 'axe');
  assert.ok(axe.marks.every(mark => mark.nib === 'flat'));
  assert.notDeepEqual(produce(13).marks[0].points, axe.marks[0].points);
});

test('custom direction fields are consumed during generation, not stored, and failure is atomic', () => {
  const scene = createInkScene({ width: 200, height: 200 });
  let calls = 0;
  scene.cun(region, { count: 3, flow: point => { calls++; return { x: point.y * 0.001, y: 1 }; } });
  assert.ok(calls > 3);
  assert.equal(JSON.stringify(scene.snapshot()).includes('flow'), false);
  const previous = scene.snapshot();
  assert.throws(() => scene.cun(region, { count: 4, flow: () => ({ x: 0, y: 0 }) }), /nonzero/);
  assert.throws(() => scene.cun(region, { count: 4, flow: () => undefined }), /point/);
  assert.deepEqual(scene.snapshot(), previous);
});

test('very thin regions terminate with an actionable error instead of hanging or partial writes', () => {
  const scene = createInkScene({ width: 100, height: 100, seed: 123 });
  const thin = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1.0000001 }, { x: 0, y: 0.0000001 }];
  assert.throws(() => scene.cun(thin, { count: 2 }), /bounded attempt budget/);
  assert.equal(scene.snapshot().marks.length, 0);
});

test('even-odd containment handles concavity, boundaries, and reversed winding', () => {
  const polygon = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 6 }, { x: 0, y: 6 }];
  for (const shape of [polygon, [...polygon].reverse()]) {
    assert.equal(pointInPolygon({ x: 1, y: 5 }, shape), true);
    assert.equal(pointInPolygon({ x: 4, y: 4 }, shape), false);
    assert.equal(pointInPolygon({ x: 2, y: 4 }, shape), true);
    assert.equal(pointInPolygon({ x: 0, y: 0 }, shape), true);
  }
});

test('arc-length resampling handles bends, repeated vertices, pressure, and endpoint identity', () => {
  const source = [{ x: 0, y: 0, pressure: 0 }, { x: 3, y: 0, pressure: 0.6 }, { x: 3, y: 0, pressure: 0.6 }, { x: 3, y: 4, pressure: 1 }];
  const sampled = resamplePath(source, 2);
  assert.deepEqual(sampled[0], source[0]);
  assert.deepEqual(sampled.at(-1), source.at(-1));
  assert.deepEqual(sampled.map(({ x, y }) => [x, y]), [[0, 0], [2, 0], [3, 1], [3, 3], [3, 4]]);
  assert.ok(Math.abs(sampled[1].pressure - 0.4) < 1e-12);
  assert.ok(Math.abs(sampled[2].pressure - 0.7) < 1e-12);
  assert.throws(() => resamplePath(source, 0), /greater/);
  assert.throws(() => resamplePath(source, 1e-9), /100000/);
});

test('bad dimensions, geometry, timing, and technique options fail before storage', () => {
  assert.throws(() => createInkScene({ width: 0, height: 100 }), /width/);
  assert.throws(() => createInkScene({ width: 100, height: Infinity }), /height/);
  const scene = createInkScene({ width: 100, height: 100 });
  assert.throws(() => scene.stroke([{ x: 1, y: 1 }, { x: 1, y: 1 }]), /nonzero/);
  assert.throws(() => scene.stroke([{ x: 0, y: 0 }, { x: Infinity, y: 1 }]), /finite/);
  assert.throws(() => scene.stroke(line, { width: -1 }), /width/);
  assert.throws(() => scene.stroke(line, { duration: -1 }), /nonnegative/);
  assert.throws(() => scene.stroke(line, { dryness: 1.1 }), /dryness/);
  assert.throws(() => scene.stroke([{ x: 0, y: 0, pressure: 2 }, { x: 2, y: 3 }]), /pressure/);
  assert.throws(() => scene.wash([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]), /area/);
  assert.throws(() => scene.wash(region, { passes: 0 }), /passes/);
  assert.throws(() => scene.cun(region, { count: -1 }), /count/);
  assert.throws(() => scene.cun(region, { count: 1.5 }), /integer/);
  assert.throws(() => scene.cun(region, { count: 10001 }), /count/);
  assert.throws(() => scene.cun(region, { technique: 'unknown' }), /technique/);
  assert.throws(() => scene.cun(region, { direction: { x: 0, y: 0 } }), /nonzero/);
  assert.throws(() => scene.cun(region, { count: 0, opacity: -1 }), /opacity/);
  assert.equal(scene.snapshot().marks.length, 0);
});
