import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrushStroke } from '../dist/brushwork.js';

const options = { gestureModel: 'local-v1', width: 28, seed: 719 };
const line = [{ x: 40, y: 80, pressure: .8 }, { x: 440, y: 80, pressure: .8 }];
const corner = [{ x: 40, y: 80, pressure: .8 }, { x: 240, y: 80, pressure: .8 }, { x: 240, y: 280, pressure: .8 }];
const xy = point => ({ x: point.x, y: point.y });

test('new local gesture model is explicit and legacy saved output remains the default', () => {
  const legacyOptions = { entry: 'concealed', finish: 'return', turn: 'angular', pressureProfile: 'lift-press', rhythm: 'hesitant', drag: 'reverse', seed: 719, width: 28 };
  assert.deepEqual(createBrushStroke(corner, legacyOptions), createBrushStroke(corner, { ...legacyOptions, gestureModel: 'legacy' }));
  assert.notDeepEqual(createBrushStroke(corner, legacyOptions), createBrushStroke(corner, { ...legacyOptions, gestureModel: 'local-v1' }));
  assert.throws(() => createBrushStroke(corner, { gestureModel: 'future' }), /gestureModel/);
});

test('local exposed entry and open finish taper at their own bounded path intervals', () => {
  const baseline = createBrushStroke(line, options);
  const exposed = createBrushStroke(line, { ...options, entry: 'exposed' });
  const open = createBrushStroke(line, { ...options, finish: 'open' });
  assert.equal(exposed.points[0].pressure, 0);
  assert.equal(open.points.at(-1).pressure, 0);
  assert.ok(exposed.points.some(point => point.pressure > 0 && point.pressure < .8));
  assert.ok(open.points.some(point => point.pressure > 0 && point.pressure < .8));
  for (const mark of [exposed, open]) {
    assert.deepEqual(xy(mark.points[0]), xy(line[0]));
    assert.deepEqual(xy(mark.points.at(-1)), xy(line.at(-1)));
    assert.ok(mark.points.every(point => point.y === 80 && point.x >= 40 && point.x <= 440));
    assert.ok(mark.points.filter(point => point.x >= 100 && point.x <= 380).every(point => point.pressure === .8));
  }
  assert.deepEqual(createBrushStroke(line, { ...options, entry: 'exposed', finish: 'open', strength: 0 }).points, baseline.points);
});

test('local concealed entry returns to the origin and return finish stays inside the final footprint', () => {
  const concealed = createBrushStroke(line, { ...options, entry: 'concealed' });
  const returned = createBrushStroke(line, { ...options, finish: 'return' });
  assert.ok(concealed.points.some(point => point.x < 40));
  assert.ok(concealed.points.filter(point => point.x === 40 && point.y === 80).length >= 2);
  assert.deepEqual(concealed.points.at(-1), line.at(-1));
  assert.ok(concealed.points.every(point => point.x >= 40 - options.width && Math.abs(point.y - 80) < options.width * .2));
  const authoredEnd = returned.points.find(point => point.x === 440 && point.y === 80);
  assert.ok(authoredEnd, 'reaches the authored endpoint before moving back');
  assert.ok(authoredEnd.pressure > 0 && authoredEnd.pressure < .8 * .05, 'lifts before the reverse turn');
  assert.ok(returned.points.at(-1).x < 440);
  assert.equal(returned.points.at(-1).pressure, 0);
  assert.ok(returned.points.every(point => point.x >= 40 && point.x <= 440 && Math.abs(point.y - 80) < options.width * .2));
  assert.equal(returned.smoothing, 'linear');
});

test('round turns remain local and angular turns preserve the authored corner with an independent pressure accent', () => {
  const rounded = createBrushStroke(corner, { ...options, turn: 'round' });
  const angular = createBrushStroke(corner, { ...options, turn: 'angular' });
  assert.equal(rounded.smoothing, 'linear');
  assert.equal(angular.smoothing, 'linear');
  assert.deepEqual(rounded.points[0], corner[0]);
  assert.deepEqual(rounded.points.at(-1), corner.at(-1));
  assert.ok(rounded.points.some(point => point.x < 240 && point.y > 80));
  assert.ok(!rounded.points.some(point => point.x === 240 && point.y === 80));
  assert.ok(rounded.points.every(point => point.x >= 40 && point.x <= 240 && point.y >= 80 && point.y <= 280));
  assert.ok(rounded.points.some(point => point.x <= 210 && point.y === 80), 'the long incoming line remains straight');
  assert.ok(rounded.points.some(point => point.x === 240 && point.y >= 110), 'the long outgoing line remains straight');
  assert.ok(angular.points.every(point => point.y === 80 || point.x === 240));
  const vertex = angular.points.find(point => point.x === 240 && point.y === 80);
  assert.ok(vertex.pressure > .8);
  assert.ok(angular.points.some(point => point.pressure < .8));
  assert.deepEqual(createBrushStroke(corner, { ...options, turn: 'round', strength: 0 }).points, corner);
});

test('local geometry preserves authored pressure lifts and composes deterministically without a browser', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const source = [{ x: 0, y: 0, pressure: .7 }, { x: 90, y: 0, pressure: 0 }, { x: 90, y: 110, pressure: .7 }];
  const saved = JSON.stringify(source);
  for (const turn of ['preserve', 'round', 'angular']) {
    const mark = createBrushStroke(source, { ...options, turn, smoothing: 'catmull-rom' });
    assert.ok(mark.points.some(point => point.pressure === 0), `${turn} retains the authored lift`);
  }
  const composed = { ...options, entry: 'concealed', finish: 'return', turn: 'round', pressureProfile: 'lift-press', rhythm: 'hesitant', drag: 'reverse' };
  const a = createBrushStroke(source, composed);
  assert.deepEqual(a, createBrushStroke(source, composed));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(JSON.stringify(source), saved);
  assert.ok(Object.isFrozen(a.points) && Object.isFrozen(a.points[0]));
  const zero = createBrushStroke(source.map(point => ({ ...point, pressure: 0 })), composed);
  assert.ok(zero.points.every(point => point.pressure === 0));
  assert.ok(a.points.every(point => [point.x, point.y, point.pressure].every(Number.isFinite)));
});

test('local gestures bound generated geometry on dense, repeated, short and reversing input paths', () => {
  const dense = Array.from({ length: 4096 }, (_, index) => ({ x: index, y: index % 2, pressure: .65 }));
  const denseMark = createBrushStroke(dense, { ...options, turn: 'round', entry: 'concealed', finish: 'return', rhythm: 'hesitant' });
  assert.ok(denseMark.points.length < 20_000);
  for (const points of [
    [{ x: 0, y: 0, pressure: .2 }, { x: 0, y: 0, pressure: .6 }, { x: .001, y: 0, pressure: .6 }],
    [{ x: 0, y: 0, pressure: .6 }, { x: 100, y: 0, pressure: 0 }, { x: 0, y: 0, pressure: .6 }],
  ]) {
    for (const turn of ['preserve', 'round', 'angular']) {
      const mark = createBrushStroke(points, { ...options, turn, entry: 'concealed', finish: 'return', smoothing: 'catmull-rom' });
      assert.ok(mark.points.every(point => [point.x, point.y, point.pressure].every(Number.isFinite)));
      assert.equal(mark.points.at(-1).pressure, 0);
    }
  }
});
