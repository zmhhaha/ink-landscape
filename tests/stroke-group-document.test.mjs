import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrokeGroupDocument, compileStrokeGroupRecipe, reviseStrokeGroupDocument } from '../dist/index.js';

const options = { width: 300, height: 240, seed: 310 };
const group = (id = 'fold') => ({ id, strokes: [{ id: 'edge', points: [
  { x: 30, y: 25, pressure: .7 }, { x: 130, y: 170, pressure: 0 }, { x: 240, y: 80, pressure: .5 },
], options: { width: 4, controls: [{ at: .4, side: .2 }], finish: 'open' } }] });

test('neutral stroke groups own editable sparse sources and rebuild without browser state', () => {
  const source = [group(), { ...group('branch'), parentId: 'fold', role: 'mark' }];
  const original = structuredClone(source), doc = createStrokeGroupDocument(source, options);
  assert.equal(typeof globalThis.document, 'undefined');
  assert.deepEqual(doc.recipe.groups, original);
  source[0].strokes[0].points[0].x = -100;
  source[0].strokes[0].options.controls[0].side = 1;
  assert.deepEqual(doc.recipe.groups, original);
  const frozen = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); } };
  frozen(doc);
  assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(doc.recipe))), doc.result);
  assert.equal(doc.recipe.groups[0].strokes[0].points[1].pressure, 0);
  assert.equal(doc.result.marks.length, 2);
});

test('group and stroke reorder keeps material identity; local edits leave unrelated playback unchanged', () => {
  const a = group('a/b'), b = group('a');
  const doc = createStrokeGroupDocument([a, b], options);
  const reordered = createStrokeGroupDocument([b, group('new'), a], options);
  const byId = new Map(reordered.result.marks.map(mark => [mark.id, mark]));
  for (const mark of doc.result.marks) assert.deepEqual(byId.get(mark.id), mark);
  const edited = reviseStrokeGroupDocument(doc, { groups: doc.recipe.groups.map(item => item.id === 'a' ? item : {
    ...item, strokes: item.strokes.map(stroke => ({ ...stroke, options: { ...stroke.options, width: 9 } })),
  }) });
  assert.equal(edited.result.marks[0].width, 9);
  assert.deepEqual(edited.result.marks[1], doc.result.marks[1]);
  assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(edited.recipe))), edited.result);
  assert.deepEqual(reviseStrokeGroupDocument({ ...doc, result: {} }, {}).result, doc.result);
});

test('parent references are metadata and checked for dangling references and cycles', () => {
  assert.throws(() => createStrokeGroupDocument([{ ...group(), parentId: 'missing' }], options), /Unknown parent/);
  assert.throws(() => createStrokeGroupDocument([{ ...group('a'), parentId: 'b' }, { ...group('b'), parentId: 'a' }], options), /acyclic/);
  const source = [group('child'), group('parent')];
  const plain = createStrokeGroupDocument(source, options);
  const related = createStrokeGroupDocument([{ ...source[0], parentId: 'parent' }, source[1]], options);
  assert.deepEqual(plain.result, related.result, 'no inferred geometry, ordering or attachment');
});

test('group compiler rejects unknown versions, identity overrides and invalid styles even in empty documents', () => {
  const doc = createStrokeGroupDocument([group()], options);
  for (const patch of [{ version: 2 }, { generator: 'future' }, { hidden: true }]) {
    assert.throws(() => compileStrokeGroupRecipe({ ...doc.recipe, ...patch }));
  }
  for (const patch of [{ strokeWidth: 0 }, { opacity: 2 }, { seed: .1 }, { ink: 'red' }, { dryness: NaN }]) {
    assert.throws(() => createStrokeGroupDocument([], { ...options, ...patch }));
  }
  for (const patch of [{ id: 'shadow' }, { seed: 7 }, { future: true }]) {
    const item = group(); item.strokes[0].options = patch;
    assert.throws(() => createStrokeGroupDocument([item], options), /Unsupported/);
  }
  assert.throws(() => createStrokeGroupDocument([group(), group()], options), /Duplicate/);
  const nested = group(); nested.strokes[0].options.controls = [{ at: .2, future: 1 }];
  assert.throws(() => createStrokeGroupDocument([nested], options), /Unsupported/);
  assert.throws(() => reviseStrokeGroupDocument(doc, { groups: null }), /cannot be null/);
});
