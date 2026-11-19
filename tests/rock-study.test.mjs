import test from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon } from '../dist/index.js';
import { makeRockComparisons, makeRockLandscape, rockStudyInputs } from '../examples/rock-fixtures.mjs';

const strokes = scene => scene.marks.filter(mark => mark.kind === 'stroke');
const washes = scene => scene.marks.filter(mark => mark.kind === 'wash');
const identified = (sample, ids) => ids.map(id => {
  const mark = sample.scene.marks.find(value => value.id === id);
  assert.ok(mark, `diagnostic ID ${id} refers to an actual mark`);
  return mark;
});
const pressureLength = mark => mark.points.slice(1).reduce((sum, b, index) => {
  const a = mark.points[index];
  return sum + Math.hypot(b.x - a.x, b.y - a.y) * ((a.pressure ?? 1) + (b.pressure ?? 1)) * .5;
}, 0);

test('rock study produces editable deterministic scene data without browser globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const seed of [0, rockStudyInputs.seed]) {
    const samples = makeRockComparisons({ seed });
    assert.equal(samples.length, 4);
    assert.deepEqual(samples, makeRockComparisons({ seed }));
    assert.deepEqual(JSON.parse(JSON.stringify(samples)), samples);
    for (const sample of samples) {
      assert.equal(strokes(sample.scene).length, rockStudyInputs.strokeCount);
      assert.equal(sample.scene.width, rockStudyInputs.width);
      assert.equal(sample.scene.height, rockStudyInputs.height);
      assert.ok(Object.isFrozen(sample.scene) && Object.isFrozen(sample.scene.marks));
      assert.ok(sample.scene.marks.every(mark => Object.isFrozen(mark)));
    }
  }
  assert.notDeepEqual(makeRockComparisons({ seed: 0 }), makeRockComparisons({ seed: 1 }));
});

test('both rock shapes isolate texture organization with identical wash, bones and ink budget', () => {
  const samples = makeRockComparisons();
  const shapes = [...new Set(samples.map(sample => sample.shape))];
  assert.equal(shapes.length, 2);
  for (const shape of shapes) {
    const uniform = samples.find(sample => sample.shape === shape && sample.treatment === 'uniform');
    const structured = samples.find(sample => sample.shape === shape && sample.treatment === 'structured');
    assert.ok(uniform && structured);
    assert.deepEqual(washes(uniform.scene), washes(structured.scene), `${shape}: shared wash`);
    assert.equal(uniform.analysis.boneIds.length, 6);
    assert.equal(uniform.analysis.textureIds.length, 42);
    assert.equal(structured.analysis.boneIds.length, 6);
    assert.equal(structured.analysis.textureIds.length, 42);
    assert.deepEqual(identified(uniform, uniform.analysis.boneIds), identified(structured, structured.analysis.boneIds));
    const a = identified(uniform, uniform.analysis.textureIds);
    const byId = new Map(identified(structured, structured.analysis.textureIds).map(mark => [mark.id, mark]));
    const b = a.map(mark => {
      assert.ok(byId.has(mark.id), `${shape}: texture keeps its editable identity`);
      return byId.get(mark.id);
    });
    assert.notDeepEqual(a.map(mark => mark.points), b.map(mark => mark.points), `${shape}: organization changes actual paths`);
    for (let i = 0; i < a.length; i++) {
      for (const property of ['seed', 'width', 'opacity', 'dryness', 'nib']) assert.equal(a[i][property], b[i][property], property);
      assert.deepEqual(a[i].points.map(point => point.pressure), b[i].points.map(point => point.pressure));
      const budgetA = pressureLength(a[i]) * a[i].width * a[i].opacity;
      const budgetB = pressureLength(b[i]) * b[i].width * b[i].opacity;
      assert.ok(Math.abs(budgetA - budgetB) < Math.max(1, budgetA) * 1e-8, `${shape}: same nominal ink budget for stroke ${i}`);
    }
    for (const mark of [...a, ...b]) {
      assert.ok(mark.clip?.length >= 3, 'texture carries caller-defined region clipping');
      assert.ok(mark.points.some(point => pointInPolygon(point, mark.clip)), 'the stroke actually contacts its clipping region');
      assert.ok(mark.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    }
  }
});

test('whole-scene transfer keeps composition and mark count reproducible across treatments', () => {
  const uniform = makeRockLandscape('uniform');
  const structured = makeRockLandscape('structured');
  assert.equal(strokes(uniform).length, rockStudyInputs.strokeCount * 3);
  assert.equal(strokes(structured).length, strokes(uniform).length);
  assert.deepEqual(washes(uniform), washes(structured));
  assert.equal(structured.width, uniform.width);
  assert.equal(structured.height, uniform.height);
  assert.deepEqual(JSON.parse(JSON.stringify(structured)), structured);
  assert.deepEqual(structured, makeRockLandscape('structured'));
  assert.notDeepEqual(structured, makeRockLandscape('structured', { seed: rockStudyInputs.seed + 1 }));
});
