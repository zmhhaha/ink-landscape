import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUE_SOURCES } from '../dist/index.js';
import { makeTechniqueStudies } from '../examples/technique-fixtures.mjs';

test('study pairs keep shared seed, canvas, timing and source evidence across transfer', () => {
  const sources = new Set(TECHNIQUE_SOURCES.map(source => source.id));
  for (const pathVariant of ['original', 'transfer']) {
    const studies = makeTechniqueStudies({ seed: 23, pathVariant });
    assert.deepEqual(studies, makeTechniqueStudies({ seed: 23, pathVariant }));
    assert.deepEqual(studies, JSON.parse(JSON.stringify(studies)));
    for (const study of studies) {
      assert.equal(study.variants.length, 2);
      assert.ok(study.sourceIds.length > 0 && study.sourceIds.every(id => sources.has(id)), `${study.id} must link real source records`);
      const [a, b] = study.variants.map(variant => variant.scene);
      assert.equal(a.seed, b.seed); assert.equal(a.width, b.width); assert.equal(a.height, b.height);
      assert.deepEqual(a.marks.map(mark => [mark.start, mark.duration]).slice(0, 1), b.marks.map(mark => [mark.start, mark.duration]).slice(0, 1));
      assert.notDeepEqual(a.marks, b.marks, 'pair changes actual editable drawing data');
    }
  }
  const original = makeTechniqueStudies({ seed: 23 });
  const transfer = makeTechniqueStudies({ seed: 23, pathVariant: 'transfer' });
  for (let i = 0; i < original.length; i++) assert.notDeepEqual(original[i].inputPath, transfer[i].inputPath);
});

test('dryness and tone studies isolate material controls from authored path and pressure', () => {
  for (const id of ['dry', 'tone']) {
    const pair = makeTechniqueStudies().find(study => study.id === id).variants.map(variant => variant.scene.marks[0]);
    const field = id === 'dry' ? 'dryness' : 'opacity';
    const [a, b] = pair;
    assert.deepEqual(a.points, b.points);
    const omit = mark => Object.fromEntries(Object.entries(mark).filter(([key]) => key !== field));
    assert.deepEqual(omit(a), omit(b));
    assert.notEqual(a[field], b[field]);
  }
});
