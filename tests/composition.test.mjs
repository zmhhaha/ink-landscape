import test from 'node:test';
import assert from 'node:assert/strict';
import { composeInkScene } from '../dist/composition.js';
import { createInkScene } from '../dist/core.js';
import { createBrushDocument } from '../dist/brush-document.js';
import { createDotDocument } from '../dist/dot-document.js';
import { createCunDocument } from '../dist/cun-document.js';

const frame = { width: 260, height: 180, seed: 73, background: '#f5f2e9' };
const points = [{ x: 20, y: 40, pressure: .25 }, { x: 90, y: 70, pressure: 1 }, { x: 150, y: 35, pressure: 0 }];
const clone = value => JSON.parse(JSON.stringify(value));
const local = mark => ({ ...mark, id: mark.id.slice(mark.id.indexOf('/') + 1).replace(/^\d+:/, '') });

test('default brush and dot documents compose as distinct instances with their material seeds intact', () => {
  const a = createBrushDocument(points, { start: 2, duration: 3 });
  const b = createBrushDocument(points.map(p => ({ ...p, y: p.y + 40 })));
  const dots = [createDotDocument([{ x: 190, y: 50 }]), createDotDocument([{ x: 190, y: 90 }])];
  assert.equal(a.result.id, b.result.id); assert.equal(dots[0].result[0].id, dots[1].result[0].id);
  const sources = [{ namespace: 'brush-a', source: a }, { namespace: 'brush-b', source: b },
    { namespace: 'dots-a', source: dots[0] }, { namespace: 'dots-b', source: dots[1] }];
  const result = composeInkScene(sources, frame);
  assert.equal(result.marks.length, 4);
  assert.equal(new Set(result.marks.map(m => m.id)).size, 4);
  assert.deepEqual(result.marks.map(local), [a.result, b.result, dots[0].result[0], dots[1].result[0]]);
  assert.deepEqual(composeInkScene(clone(sources), frame), result);
  assert.deepEqual(result.marks[0].points, points);
});

test('identical contents may be painted twice while explicit duplicate namespaces and local IDs still fail', () => {
  const document = createBrushDocument(points);
  const twice = composeInkScene([{ namespace: 'first', source: document }, { namespace: 'second', source: document }], frame);
  assert.deepEqual(twice.marks.map(local), [document.result, document.result]);
  assert.throws(() => composeInkScene([{ namespace: 'same', source: document }, { namespace: 'same', source: document }], frame), /namespace/);
  assert.throws(() => composeInkScene([{ namespace: 'one', source: [document.result, document.result] }], frame), /Duplicate mark id/);
  const core = createInkScene(frame);
  core.stroke(document.result.points, document.result);
  assert.throws(() => core.stroke(document.result.points, document.result), /Duplicate mark id/);
});

test('namespace insertion and order preserve unrelated mark identities, material and authored timing', () => {
  const stroke = createBrushDocument(points, { seed: 88, start: 2, duration: 1 });
  const a = { namespace: 'a/b', source: stroke };
  const b = { namespace: 'a', source: { ...stroke.result, id: 'b/stroke-1' } };
  const initial = composeInkScene([a, b], frame);
  assert.notEqual(initial.marks[0].id, initial.marks[1].id);
  const extra = { namespace: 'unrelated', source: createBrushDocument(points, { seed: 90 }) };
  const changed = composeInkScene([extra, b, a], { ...frame, seed: 999 });
  const byId = new Map(changed.marks.map(m => [m.id, m]));
  for (const mark of initial.marks) assert.deepEqual(byId.get(mark.id), mark);
});

test('ordinary scenes, marks, arrays and authored cun documents retain wash and stroke properties', () => {
  const source = createInkScene(frame);
  source.stroke(points, { seed: 42, nib: 'flat', clip: [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 160 }] });
  source.wash([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 40 }], { seed: 43, start: 1, passes: 5 });
  const scene = source.snapshot();
  const cun = createCunDocument([{ id: 'curve', points }], { ...frame, technique: 'pima' });
  const result = composeInkScene([{ namespace: 'scene', source: scene }, { namespace: 'single', source: scene.marks[1] },
    { namespace: 'array', source: scene.marks }, { namespace: 'cun', source: cun }], frame);
  assert.deepEqual(result.marks.map(local), [...scene.marks, scene.marks[1], ...scene.marks, ...cun.result.marks]);
  assert.deepEqual(composeInkScene([], frame).marks, []);
  const signed = { ...scene.marks[0], seed: -1 };
  assert.equal(composeInkScene([{ namespace: 'signed', source: signed }], frame).marks[0].seed, 4294967295);
});

test('composition owns frozen output and failed batches leave inputs and later calls unchanged', () => {
  const document = clone(createBrushDocument(points));
  const input = [{ namespace: 'owned', source: document }], before = clone(input);
  const result = composeInkScene(input, frame);
  const checkFrozen = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(checkFrozen); } };
  checkFrozen(result); assert.deepEqual(input, before); assert.notEqual(result.marks[0].points, document.result.points);
  const broken = clone(document.result); broken.points[1].x = NaN;
  assert.throws(() => composeInkScene([...input, { namespace: 'broken', source: broken }], frame));
  assert.deepEqual(input, before);
  assert.deepEqual(composeInkScene(input, frame), result);
  document.result.points[0].x = 500; document.result.brush.controls[0].pressure = 0;
  assert.equal(result.marks[0].points[0].x, 20);
  assert.notEqual(result.marks[0].brush.controls[0].pressure, 0);
});

test('malformed composition data fails instead of replacing missing fields with defaults', () => {
  const document = createBrushDocument(points);
  for (const bad of [null, 3, {}, { result: { version: 1, layers: [] } }, { ...frame, version: 2, marks: [] }])
    assert.throws(() => composeInkScene([{ namespace: 'bad', source: bad }], frame));
  for (const entry of [{ source: document }, { namespace: '', source: document }, { namespace: 'x', source: document, prefix: 'y' }])
    assert.throws(() => composeInkScene([entry], frame));
  for (const key of ['id', 'seed', 'width', 'nib', 'opacity', 'start']) {
    const mark = clone(document.result); delete mark[key];
    assert.throws(() => composeInkScene([{ namespace: 'missing', source: mark }], frame), key);
  }
  assert.throws(() => composeInkScene([{ namespace: 'bad', source: document }], { ...frame, width: 0 }));
});
