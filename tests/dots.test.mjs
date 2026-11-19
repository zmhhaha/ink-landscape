import test from 'node:test';
import assert from 'node:assert/strict';
import { createDotMarks } from '../dist/dots.js';

const positions = [{ x: 20, y: 30, pressure: .8 }, { x: 180, y: 110, pressure: .4 }];
const shapes = ['round', 'horizontal', 'vertical', 'oblique', 'paired', 'triple', 'cluster'];
const xy = point => ({ x: point.x, y: point.y });
const extent = mark => {
  const first = mark.points[0], last = mark.points.at(-1);
  return { x: Math.abs(last.x - first.x), y: Math.abs(last.y - first.y) };
};

test('dot shapes are separate nondegenerate editable strokes with distinct geometry', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const shape of shapes) {
    const marks = createDotMarks(positions, { shape, seed: 12, size: 14 });
    assert.equal(marks.length, positions.length * (shape === 'paired' ? 2 : shape === 'triple' ? 3 : shape === 'cluster' ? 5 : 1));
    assert.ok(marks.every(mark => mark.kind === 'stroke' && mark.points.length >= 3));
    assert.ok(marks.every(mark => Math.hypot(mark.points.at(-1).x - mark.points[0].x, mark.points.at(-1).y - mark.points[0].y) > 0));
    assert.ok(marks.every(mark => mark.points[1].pressure > mark.points[0].pressure && mark.points.at(-1).pressure < mark.points[1].pressure));
    assert.ok(marks.every(mark => Math.abs(mark.points.at(-1).x - mark.points[0].x) < 30 && Math.abs(mark.points.at(-1).y - mark.points[0].y) < 30));
    assert.deepEqual(JSON.parse(JSON.stringify(marks)), marks);
    assert.ok(Object.isFrozen(marks) && Object.isFrozen(marks[0]) && Object.isFrozen(marks[0].points[0]));
  }
  const horizontal = extent(createDotMarks([positions[0]], { shape: 'horizontal' })[0]);
  const vertical = extent(createDotMarks([positions[0]], { shape: 'vertical' })[0]);
  const oblique = extent(createDotMarks([positions[0]], { shape: 'oblique' })[0]);
  assert.ok(horizontal.x > horizontal.y * 5);
  assert.ok(vertical.y > vertical.x * 5);
  assert.ok(oblique.x > 2 && oblique.y > 2);
});

test('seed changes posture and material without drifting caller anchors or fixed group layout', () => {
  for (const shape of shapes) {
    const a = createDotMarks(positions, { shape, seed: 0 });
    const b = createDotMarks(positions, { shape, seed: 1 });
    assert.deepEqual(a, createDotMarks(positions, { shape, seed: 0 }));
    assert.notDeepEqual(a, b);
    assert.deepEqual(a.map(mark => xy(mark.points[0])), b.map(mark => xy(mark.points[0])));
    if (!['paired', 'triple', 'cluster'].includes(shape)) assert.deepEqual(a.map(mark => xy(mark.points[0])), positions.map(xy));
  }
  const path = positions.map(point => ({ ...point }));
  const owned = createDotMarks(path);
  path[0].x = 700;
  assert.equal(owned[0].points[0].x, 20);
  assert.ok(createDotMarks([{ x: 0, y: 0, pressure: 0 }], { shape: 'triple' }).every(mark => mark.points.every(point => point.pressure === 0)));
});

test('rotating groups rotates fixed anchors and each path while timing and clipping remain explicit', () => {
  const clip = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const a = createDotMarks(positions, { shape: 'triple', angle: 0, seed: 3 });
  const b = createDotMarks(positions, { shape: 'triple', angle: Math.PI / 2, seed: 3, clip, start: 2, duration: .5, groupInterval: .8 });
  for (let index = 0; index < a.length; index++) {
    const group = Math.floor(index / 3), anchor = positions[group];
    const ax = a[index].points[0].x - anchor.x, ay = a[index].points[0].y - anchor.y;
    assert.ok(Math.abs(b[index].points[0].x - anchor.x + ay) < 1e-12);
    assert.ok(Math.abs(b[index].points[0].y - anchor.y - ax) < 1e-12);
    assert.equal(b[index].start, 2 + group * .8); assert.equal(b[index].duration, .5);
    assert.deepEqual(b[index].clip, clip);
  }
  clip[0].x = 900;
  assert.equal(b[0].clip[0].x, 0);
  assert.deepEqual(createDotMarks([], { shape: 'cluster', count: 32 }), []);
});

test('dot counts and numeric inputs are bounded, including empty-group option validation', () => {
  assert.equal(createDotMarks([positions[0]], { shape: 'cluster', count: 32 }).length, 32);
  for (const options of [{ shape: 'unknown' }, { size: 0 }, { size: NaN }, { angle: Infinity }, { spread: -1 },
    { shape: 'cluster', count: 33 }, { shape: 'cluster', count: 0 }, { shape: 'cluster', count: 2.5 },
    { count: 2 }, { groupInterval: -.1 }, { idPrefix: '' }, { opacity: 2 }, { duration: -1 }, { seed: .1 },
    { start: 1e308, duration: 1e308 }]) {
    assert.throws(() => createDotMarks([], options));
  }
  assert.throws(() => createDotMarks([{ x: NaN, y: 3 }]));
  assert.throws(() => createDotMarks([{ x: 3, y: 4, pressure: 1.1 }]));
  assert.throws(() => createDotMarks(Array.from({ length: 313 }, () => ({ x: 0, y: 0 })), { shape: 'cluster', count: 32 }), /10000/);
  assert.throws(() => createDotMarks(positions, { start: 1e308, groupInterval: 1e308 }), /finite/);
});
