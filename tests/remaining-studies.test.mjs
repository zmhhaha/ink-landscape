import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUE_CATALOG, TECHNIQUE_STUDY_BATCHES, getTechniqueStudies, createStrokeGroupDocument } from '../dist/index.js';
import { revisionBatches, makeRevisionBatch } from '../examples/revision-review-data.mjs';
import { remainingBatches, makeRemainingBatch } from '../examples/remaining-review-data.mjs';
import { rebuildRemainingDocument, editRemainingDocument } from '../examples/remaining-document.mjs';

const sorted = ids => [...new Set(ids)].sort();
test('the shared local editor scales effective sparse group widths', () => {
  const doc = createStrokeGroupDocument([{ id: 'group', role: 'structure', strokes: [{ id: 'one', points: [{ x: 10, y: 10 }, { x: 50, y: 30 }] }] }], { width: 100, height: 100 });
  const edited = editRemainingDocument(doc, { dx: 0, widthScale: 2 });
  assert.equal(edited.document.result.marks[0].width, doc.result.marks[0].width * 2);
});
test('thirty independent batches cover the catalogue and match the public research index', () => {
  assert.equal(remainingBatches.length, 18);
  assert.deepEqual(remainingBatches.map(batch => batch.number), Array.from({ length: 18 }, (_, i) => i + 13));
  const actual = [...revisionBatches.map(batch => [batch.number, makeRevisionBatch(batch)]),
    ...remainingBatches.map(batch => [batch.number, makeRemainingBatch(batch)])];
  assert.equal(actual.reduce((n, [, studies]) => n + studies.length, 0), 90);
  assert.deepEqual(sorted(actual.flatMap(([, studies]) => studies.flatMap(study => study.techniqueIds))), sorted(TECHNIQUE_CATALOG.map(item => item.id)));
  for (const [number, studies] of actual) {
    const entry = TECHNIQUE_STUDY_BATCHES.find(batch => batch.number === number);
    assert.deepEqual(sorted(entry.techniqueIds), sorted(studies.flatMap(study => study.techniqueIds)));
    for (const id of entry.techniqueIds) assert.ok(getTechniqueStudies(id).includes(entry));
  }
  assert.equal(TECHNIQUE_CATALOG.find(item => item.id === 'water-texture').entryPoint, null,
    'a neutral probe must not become a named traditional algorithm');
  assert.ok(TECHNIQUE_CATALOG.every(item => item.validation === 'unreviewed'));
});

test('remaining studies rebuild saved source in pure Node and preserve local editing boundaries', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const batch of remainingBatches) {
    const layouts = [];
    for (const layout of batch.layouts) {
      const studies = makeRemainingBatch(batch, layout);
      assert.equal(studies.length, 3);
      if (batch.audit) assert.ok(batch.audit(studies).ok, JSON.stringify(batch.audit(studies)));
      for (const study of studies) {
        assert.equal(study.variants.length, 3);
        assert.ok(study.variable && study.criteria && study.limits);
        if (batch.auditStudy) assert.ok(batch.auditStudy(study).ok, `${batch.number}/${study.id}: ${JSON.stringify(batch.auditStudy(study))}`);
        for (const variant of study.variants) {
          const saved = JSON.parse(JSON.stringify(variant.document));
          assert.deepEqual(rebuildRemainingDocument(saved.recipe), saved, `${batch.number}/${study.id}/${variant.id}/${layout}`);
          assert.equal(saved.result.width, 560); assert.equal(saved.result.height, 260);
          if (saved.result.marks) assert.ok(saved.result.marks.every(mark => mark.start + mark.duration <= 8));
          else assert.ok(saved.result.layers.every(layer => layer.at <= 8));
        }
        const original = study.variants[2].document, before = JSON.stringify(original), edit = editRemainingDocument(original);
        assert.equal(JSON.stringify(original), before);
        assert.notDeepEqual(edit.document.recipe[edit.field][edit.index], original.recipe[edit.field][edit.index]);
        original.recipe[edit.field].forEach((item, index) => {
          if (index !== edit.index) assert.deepEqual(edit.document.recipe[edit.field][index], item);
        });
        assert.deepEqual(rebuildRemainingDocument(JSON.parse(JSON.stringify(edit.document.recipe))), edit.document);
      }
      layouts.push(studies.map(study => study.variants[2].document.recipe));
    }
    assert.notDeepEqual(layouts[0], layouts[1]); assert.notDeepEqual(layouts[1], layouts[2]);
  }
});
