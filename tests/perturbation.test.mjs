import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoise1D, jitterPath, varyPressure, splitBristles, createStrokeGroupDocument, compileStrokeGroupRecipe } from '../dist/index.js';

const path = Object.freeze(Array.from({ length: 201 }, (_, i) => Object.freeze({ x: i, y: 30, pressure: i === 90 ? 0 : .2 + .6 * Math.sin(i / 200 * Math.PI) })));

test('gradient noise is bounded, continuous at knots and independent of evaluation order', () => {
  const noise = createNoise1D(37), xs = Array.from({ length: 1000 }, (_, i) => i * .031 - 12.5);
  const values = xs.map(noise);
  assert.deepEqual(xs.toReversed().map(noise).toReversed(), values);
  assert.ok(values.every(value => value >= -1 && value <= 1));
  assert.ok(values.some((value, i) => Math.abs(value - createNoise1D(38)(xs[i])) > .1));
  for (let knot = -8; knot < 8; knot++) {
    assert.ok(Math.abs(noise(knot + 1e-6) - noise(knot - 1e-6)) < 1e-5);
    const left = (noise(knot) - noise(knot - 1e-4)) / 1e-4, right = (noise(knot + 1e-4) - noise(knot)) / 1e-4;
    assert.ok(Math.abs(left - right) < .001, 'no sharp noise cusp at a lattice knot');
  }
});

test('jitter owns its source, preserves anchors and pressure, and bounds displacement', () => {
  const original = JSON.stringify(path), output = jitterPath(path, .8, { seed: 38, wavelength: 9 });
  assert.deepEqual(output, jitterPath(JSON.parse(original), .8, { seed: 38, wavelength: 9 }));
  assert.equal(output.length, path.length);
  assert.deepEqual(output[0], path[0]); assert.deepEqual(output.at(-1), path.at(-1));
  assert.ok(Object.isFrozen(output) && output.every(Object.isFrozen));
  assert.ok(output.some((point, i) => Math.abs(point.y - path[i].y) > .1));
  for (let i = 0; i < output.length; i++) {
    assert.equal(output[i].pressure, path[i].pressure);
    assert.ok(Math.hypot(output[i].x - path[i].x, output[i].y - path[i].y) <= .8 + 1e-12);
  }
  assert.equal(JSON.stringify(path), original);
  assert.deepEqual(jitterPath(path, 0), path);
});

test('normal jitter follows a rotated or translated path instead of a screen axis', () => {
  const source = path.map(point => ({ x: point.x, y: point.y }));
  const options = { seed: 39, tangentRatio: 0, preserveEndpoints: false };
  const a = jitterPath(source, 1, options);
  const b = jitterPath(source.map(point => ({ x: 100 - point.y, y: point.x + 20 })), 1, options);
  a.forEach((point, i) => {
    assert.equal(point.x, source[i].x);
    assert.ok(Math.abs(b[i].x - (100 - point.y)) < 1e-10);
    assert.ok(Math.abs(b[i].y - (point.x + 20)) < 1e-10);
    assert.ok(!Object.hasOwn(point, 'pressure'));
  });
});

test('duplicates, reversals and coincident points remain finite without moving attachment anchors', () => {
  for (const source of [[{ x: 0, y: 0 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }]]) {
    const output = jitterPath(source, 2, { seed: 42 });
    assert.ok(output.every(point => Object.values(point).every(Number.isFinite)));
    assert.deepEqual(output[0], source[0]); assert.deepEqual(output.at(-1), source.at(-1));
  }
});

test('duplicate endpoints use the nearest real tangent when endpoint protection is disabled', () => {
  const source = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 10 }];
  const options = { seed: 37, tangentRatio: 0, preserveEndpoints: false };
  const a = jitterPath(source, 1, options);
  assert.equal(a[0].y, 0); assert.equal(a[1].y, 0);
  assert.equal(a[2].y, 10); assert.equal(a[3].y, 10);
  assert.deepEqual(a[0], a[1]); assert.deepEqual(a[2], a[3]);
  const b = jitterPath(source.map(point => ({ x: 100 - point.y, y: point.x + 20 })), 1, options);
  a.forEach((point, i) => {
    assert.ok(Math.abs(b[i].x - (100 - point.y)) < 1e-10);
    assert.ok(Math.abs(b[i].y - (point.x + 20)) < 1e-10);
  });
});

test('coherent pressure modulation preserves lifts and clamps within valid relative bounds', () => {
  const positions = Array.from({ length: 501 }, (_, i) => i / 100);
  const variation = positions.map(at => varyPressure(.7, .35, { seed: 47, at, wavelength: .3 }));
  assert.ok(variation.every(value => value >= .7 * .65 && value <= .7 * 1.35));
  assert.ok(Math.max(...variation) - Math.min(...variation) > .1);
  assert.deepEqual(positions.toReversed().map(at => varyPressure(.7, .35, { seed: 47, at, wavelength: .3 })).toReversed(), variation);
  for (const at of positions) {
    assert.equal(varyPressure(0, 1, { at }), 0);
    assert.equal(varyPressure(.8, 0, { at }), .8);
    assert.ok(varyPressure(1, 1, { at }) <= 1);
  }
});

test('split contacts have a heavier continuous center, unequal ranges, gaps and independently editable segments', () => {
  const options = { seed: 60, spread: 24, width: 5, opacity: .8, variance: .4 };
  const bundle = splitBristles(path, 8, options);
  assert.deepEqual(bundle, splitBristles(JSON.parse(JSON.stringify(path)), 8, options));
  assert.notDeepEqual(bundle, splitBristles(path, 8, { ...options, seed: 61 }));
  assert.equal(bundle[0].id, 'bristle-0');
  assert.equal(new Set(bundle.map(item => item.id)).size, bundle.length);
  assert.ok(bundle.some(item => item.id.includes('part-')));
  assert.ok(bundle.slice(1).every(item => item.width < bundle[0].width && item.opacity < bundle[0].opacity));
  assert.ok(new Set(bundle.slice(1).map(item => item.points[0].x.toFixed(2))).size > 3);
  assert.ok(bundle.every(item => Object.isFrozen(item) && Object.isFrozen(item.points) && item.points.every(Object.isFrozen)));
  assert.ok(bundle.flatMap(item => item.points).every(point => Object.values(point).every(Number.isFinite) && point.pressure >= 0 && point.pressure <= 1));
  const lengths = bundle.slice(1).map(item => Math.hypot(item.points.at(-1).x - item.points[0].x, item.points.at(-1).y - item.points[0].y));
  assert.ok(Math.max(...lengths) - Math.min(...lengths) > 20);
  const slopes = bundle.slice(1).map(item => (item.points.at(-1).y - item.points[0].y) / (item.points.at(-1).x - item.points[0].x));
  assert.ok(Math.max(...slopes) - Math.min(...slopes) > .003);
  const group = { id: 'bundle', strokes: bundle.map(item => ({ id: item.id, points: item.points, options: { width: item.width, opacity: item.opacity } })) };
  const doc = createStrokeGroupDocument([group], { width: 220, height: 70, seed: 60 });
  assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(doc.recipe))), doc.result);
  const changed = JSON.parse(JSON.stringify(doc.recipe));
  changed.groups[0].strokes[1].points[1].y += 2;
  const edited = compileStrokeGroupRecipe(changed);
  assert.notDeepEqual(edited.marks[1], doc.result.marks[1]);
  assert.deepEqual(edited.marks[0], doc.result.marks[0]);
});

test('dense long split paths stay within a finite source budget', () => {
  const bundle = splitBristles([{ x: 0, y: 0 }, { x: 1e8, y: 0 }], 64, { spacing: .01, seed: 66 });
  assert.ok(bundle.reduce((sum, item) => sum + item.points.length, 0) <= 100000);
  assert.ok(bundle.every(item => item.points.length <= 4096));
  const fine = splitBristles([{ x: 0, y: 0 }, { x: 10000, y: 0 }], 5, { spacing: .2, seed: 39 });
  assert.ok(fine.every(item => item.points.length <= 4096));
  const document = createStrokeGroupDocument([{ id: 'long', strokes: fine.map(item => ({ id: item.id, points: item.points })) }], { width: 300, height: 100 });
  assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
});

test('splitting preserves a narrow explicit pressure lift between regular sampling stations', () => {
  const lifted = [{ x: 0, y: 0, pressure: .8 }, { x: 73.1, y: 0, pressure: .8 },
    { x: 73.3, y: 0, pressure: 0 }, { x: 73.5, y: 0, pressure: .8 }, { x: 201, y: 0, pressure: .8 }];
  const bundle = splitBristles(lifted, 4, { seed: 39, spacing: 4 });
  assert.ok(bundle[0].points.some(point => Math.abs(point.x - 73.3) < 1e-8 && point.pressure === 0));
});

test('perturbation tools reject invalid inputs and unsupported options before authoring data', () => {
  for (const seed of [NaN, Infinity, .3]) assert.throws(() => createNoise1D(seed));
  assert.throws(() => createNoise1D(1)(Infinity));
  assert.throws(() => createNoise1D(1)(Number.MAX_VALUE));
  for (const intensity of [-1, Infinity, NaN]) assert.throws(() => jitterPath(path, intensity));
  for (const options of [{ wavelength: 0 }, { tangentRatio: 2 }, { preserveEndpoints: 1 }, { typo: true }, null]) assert.throws(() => jitterPath(path, 1, options));
  assert.throws(() => jitterPath([{ x: 0, y: 0 }, { x: Infinity, y: 0 }], 1));
  assert.throws(() => jitterPath([{ x: 0, y: 0, pressure: 2 }, { x: 1, y: 0 }], 1));
  for (const args of [[2, .2], [.2, -1], [NaN, .2]]) assert.throws(() => varyPressure(...args));
  assert.throws(() => varyPressure(.5, .2, { wavelength: -1 }));
  for (const count of [0, 1.5, 65, Infinity]) assert.throws(() => splitBristles(path, count));
  for (const options of [{ width: 0 }, { opacity: 2 }, { spread: -1 }, { variance: 2 }, { spacing: 0 }]) assert.throws(() => splitBristles(path, 5, options));
  assert.throws(() => splitBristles([{ x: 0, y: 0 }, { x: 0, y: 0 }], 5));
});
