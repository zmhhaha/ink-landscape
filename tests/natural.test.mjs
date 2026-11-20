import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoise1D, getNoise1D, getNoise2D, getFractalNoise2D, poissonDiskSampling, accumulateEdge } from '../dist/index.js';

test('stateless gradient fields and fBm are seeded, bounded and continuous across both lattice axes', () => {
  const positions = Array.from({ length: 401 }, (_, i) => [i * .031 - 4, i * .067 + .173]);
  const field = positions.map(([x, y]) => getNoise2D(x, y, 13));
  assert.deepEqual(positions.toReversed().map(([x, y]) => getNoise2D(x, y, 13)).toReversed(), field);
  assert.ok(field.every(x => Math.abs(x) <= 1));
  assert.ok(field.some((value, i) => Math.abs(value - getNoise2D(...positions[i], 14)) > .1));
  for (const [x, y] of positions) {
    assert.equal(getNoise1D(x, 13), createNoise1D(13)(x));
    assert.ok(Math.abs(getFractalNoise2D(x, y, 13, 5)) <= 1);
  }
  for (let knot = -4; knot <= 4; knot++) {
    assert.ok(Math.abs(getNoise2D(knot - 1e-6, .37, 13) - getNoise2D(knot + 1e-6, .37, 13)) < 1e-5);
    assert.ok(Math.abs(getNoise2D(.37, knot - 1e-6, 13) - getNoise2D(.37, knot + 1e-6, 13)) < 1e-5);
  }
});

test('Poisson anchors are deterministic, irregular, bounded, owned and separated by the requested radius', () => {
  for (const seed of [0, 13, 0xffffffff]) {
    const points = poissonDiskSampling(170, 110, 12, { seed });
    assert.ok(points.length > 60 && points.length < 180);
    assert.deepEqual(points, poissonDiskSampling(170, 110, 12, { seed }));
    assert.ok(Object.isFrozen(points) && points.every(Object.isFrozen));
    assert.ok(points.every(p => p.x >= 0 && p.x < 170 && p.y >= 0 && p.y < 110));
    for (let i = 0; i < points.length; i++) for (let j = 0; j < i; j++) {
      assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= 12);
    }
    assert.ok(new Set(points.map(p => p.x.toFixed(3))).size > points.length * .9);
    assert.deepEqual(JSON.parse(JSON.stringify(points)), points);
  }
  assert.notDeepEqual(poissonDiskSampling(100, 100, 10, { seed: 1 }), poissonDiskSampling(100, 100, 10, { seed: 2 }));
  assert.equal(poissonDiskSampling(1e6, 1e6, 1, { maxPoints: 7 }).length, 7);
  assert.equal(poissonDiskSampling(1, 1, 10).length, 1);
});

test('the edge weight forms a finite inner band and has no pigment or canvas side effects', () => {
  assert.equal(accumulateEdge(0, .4), 0);
  assert.equal(accumulateEdge(.2, .4), 1);
  assert.equal(accumulateEdge(.4, .4), 0);
  assert.equal(accumulateEdge(1, .4), 0);
  assert.equal(accumulateEdge(.2, 0), 0);
  for (let i = 0; i <= 100; i++) assert.ok(accumulateEdge(i / 100, .4) >= 0 && accumulateEdge(i / 100, .4) <= 1);
});

test('natural helpers reject invalid input and bound sampling work before allocating a dense grid', () => {
  for (const x of [NaN, Infinity, Number.MAX_VALUE, '1']) assert.throws(() => getNoise2D(x, 0));
  for (const seed of [NaN, .1, Infinity, '1']) assert.throws(() => getNoise2D(0, 0, seed));
  for (const octaves of [0, 9, .5, NaN]) assert.throws(() => getFractalNoise2D(1, 1, 0, octaves));
  for (const values of [[0, 1, 1], [1, -1, 1], [1, 1, 0], [Infinity, 1, 1], [1, 1, Number.MIN_VALUE]]) assert.throws(() => poissonDiskSampling(...values));
  // Reserve exact integer coordinates for the complete neighbor window too.
  for (const [width, height] of [[Number.MAX_SAFE_INTEGER - 1, 1], [1, Number.MAX_SAFE_INTEGER - 1]]) {
    assert.throws(() => poissonDiskSampling(width, height, Math.SQRT2, { maxPoints: 1 }), /safe coordinates/);
  }
  for (const options of [null, { attempts: 65 }, { maxPoints: 100001 }, { maxPoints: 0 }, { seed: .1 }, { typo: 1 }]) assert.throws(() => poissonDiskSampling(10, 10, 1, options));
  for (const args of [[-1, .3], [.3, 2], [NaN, .3], [.3, Infinity]]) assert.throws(() => accumulateEdge(...args));
});
