import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkScene, sampleStrokePath } from '../dist/index.js';

const path = [
  { x: 0, y: 80, pressure: .1 }, { x: 40, y: 15, pressure: .9 },
  { x: 130, y: 70, pressure: .3 }, { x: 210, y: 5, pressure: 0 },
];

test('pure path sampling preserves endpoints, pressure bounds and deterministic geometry', () => {
  const samples = sampleStrokePath(path, { smoothing: 'catmull-rom', spacing: 1 });
  assert.deepEqual(samples, sampleStrokePath(path, { smoothing: 'catmull-rom', spacing: 1 }));
  assert.deepEqual({ x: samples[0].x, y: samples[0].y, pressure: samples[0].pressure }, path[0]);
  const last = samples.at(-1);
  assert.deepEqual({ x: last.x, y: last.y, pressure: last.pressure }, path.at(-1));
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i];
    assert.ok(point.pressure >= 0 && point.pressure <= 1);
    assert.ok(Math.abs(Math.hypot(point.nx, point.ny) - 1) < 1e-12);
    if (i) assert.ok(point.distance > samples[i - 1].distance);
  }
  const distances = samples.slice(1).map((point, i) => Math.hypot(point.x - samples[i].x, point.y - samples[i].y));
  assert.ok(Math.min(...distances) > .9 && Math.max(...distances) < 1.1);
});

test('smooth mode removes the sudden tangent jump while linear preserves the corner', () => {
  const corner = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 80 }];
  const maximumTurn = samples => Math.max(...samples.slice(1).map((point, i) =>
    Math.acos(Math.max(-1, Math.min(1, point.nx * samples[i].nx + point.ny * samples[i].ny)))));
  const linear = sampleStrokePath(corner, { spacing: .5 });
  const smooth = sampleStrokePath(corner, { spacing: .5, smoothing: 'catmull-rom' });
  assert.ok(maximumTurn(linear) > 1.5);
  assert.ok(maximumTurn(smooth) < .1);
  assert.ok(smooth.some(point => point.y < -.1), 'the curve differs from the original straight segments');
});

test('centripetal tangents remain finite and continuous with nonuniform control spacing', () => {
  const uneven = [{ x: 0, y: 0 }, { x: 2, y: .5 }, { x: 180, y: 20 }, { x: 184, y: 21 }];
  const samples = sampleStrokePath(uneven, { smoothing: 'catmull-rom', spacing: .2 });
  for (let i = 0; i < samples.length; i++) {
    assert.ok(Object.values(samples[i]).every(Number.isFinite));
    if (i) assert.ok(samples[i].nx * samples[i - 1].nx + samples[i].ny * samples[i - 1].ny > .9);
  }
});

test('two points remain straight, duplicate points and exact reversals stay finite', () => {
  const line = [{ x: 4, y: 2, pressure: 0 }, { x: 64, y: 82, pressure: 1 }];
  assert.deepEqual(sampleStrokePath(line), sampleStrokePath(line, { smoothing: 'catmull-rom' }));
  const duplicate = [path[0], path[0], path[1], path[1], path[2], path[3]];
  assert.deepEqual(sampleStrokePath(duplicate, { smoothing: 'catmull-rom' }), sampleStrokePath(path, { smoothing: 'catmull-rom' }));
  const reversal = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }];
  assert.ok(sampleStrokePath(reversal, { smoothing: 'catmull-rom' }).every(point => Object.values(point).every(Number.isFinite)));
  assert.deepEqual(sampleStrokePath([{ x: 4, y: 5 }, { x: 4, y: 5, pressure: .2 }]),
    [{ x: 4, y: 5, pressure: .2, distance: 0, nx: 0, ny: 1 }]);
});

test('sampling limits output and rejects invalid geometry or options', () => {
  assert.equal(sampleStrokePath([{ x: 0, y: 0 }, { x: 1e9, y: 0 }], { spacing: .01 }).length, 8193);
  for (const spacing of [0, -1, Infinity, NaN]) assert.throws(() => sampleStrokePath(path, { spacing }));
  assert.throws(() => sampleStrokePath(path, { smoothing: 'bezier' }), /smoothing/);
  assert.throws(() => sampleStrokePath([]));
  assert.throws(() => sampleStrokePath([{ x: 0, y: 0 }, { x: Infinity, y: 2 }]));
  assert.throws(() => sampleStrokePath([{ x: 0, y: 0 }, { x: 1, y: 2, pressure: 2 }]));
  assert.throws(() => sampleStrokePath([{ x: -1e308, y: 0 }, { x: 1e308, y: 0 }]));
});

test('finite near-limit path lengths keep distances and samples finite in both modes', () => {
  const paths = [
    [{ x: -8e307, y: 0 }, { x: 0, y: 0 }, { x: 8e307, y: 0 }],
    [{ x: -8.5e307, y: 0 }, { x: 8e307, y: 0 }, { x: 8.1e307, y: 1e306 }],
  ];
  for (const large of paths) {
    for (const smoothing of ['linear', 'catmull-rom']) {
      const samples = sampleStrokePath(large, { smoothing });
      assert.equal(samples.length, 8193);
      assert.ok(samples.every(point => Object.values(point).every(Number.isFinite)), smoothing);
      assert.equal(samples[0].x, large[0].x);
      assert.equal(samples.at(-1).x, large.at(-1).x);
      assert.ok(samples.at(-1).distance >= 1.59e308 && samples.at(-1).distance <= 1.7e308);
      assert.ok(samples.every(point => Math.abs(Math.hypot(point.nx, point.ny) - 1) < 1e-12));
    }
  }
});

test('builder keeps smoothing editable, serializable and optional for old scenes', () => {
  const scene = createInkScene({ width: 300, height: 200 });
  const old = scene.stroke(path);
  assert.equal(Object.hasOwn(old, 'smoothing'), false);
  const smooth = scene.stroke(path, { smoothing: 'catmull-rom' });
  assert.equal(smooth.smoothing, 'catmull-rom');
  assert.equal(JSON.parse(JSON.stringify(scene.snapshot())).marks[1].smoothing, 'catmull-rom');
  assert.throws(() => scene.stroke(path, { smoothing: 'bezier' }), /smoothing/);
  assert.equal(scene.snapshot().marks.length, 2, 'invalid stroke does not alter the scene');
});
