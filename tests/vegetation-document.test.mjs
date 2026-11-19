import test from 'node:test';
import assert from 'node:assert/strict';
import { createVegetationDocument, reviseVegetationDocument, compileVegetationRecipe } from '../dist/vegetation-document.js';
import { sampleBrushContact } from '../dist/brush-contact.js';

const settings = { technique: 'dot-leaf', width: 320, height: 240, seed: 261127 };
const techniques = ['moss', 'dot-leaf', 'outline-leaf'];
const stroke = (id = 'tip', options) => ({ id, points: [
  { x: 50, y: 100, pressure: .7 }, { x: 69, y: 90, pressure: .95 }, { x: 85, y: 87, pressure: .4 },
], ...(options === undefined ? {} : { options }) });
const leaf = (id = 'leaf-a', options) => ({ id, strokes: [stroke('left', options), {
  id: 'right', points: [{ x: 50, y: 100 }, { x: 72, y: 106 }, { x: 85, y: 87 }],
}] });
const markId = (unit, part) => `${unit.length}:${unit}/${part.length}:${part}`;
const byId = scene => new Map(scene.marks.map(mark => [mark.id, mark]));
const visitFrozen = value => {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) visitFrozen(child);
};

test('vegetation units own sparse multi-stroke sources independently of browser and caller mutation', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const units = [leaf('leaf-a', { width: 3,
    clip: [{ x: 20, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 180 }, { x: 20, y: 180 }],
    controls: [{ at: .3, pressure: .5, side: .1 }] }), { id: 'branch', role: 'structure', strokes: [stroke()] }];
  const expected = structuredClone(units), options = { ...settings };
  const document = createVegetationDocument(units, options);
  assert.deepEqual(document.recipe.units, expected);
  assert.deepEqual(document.recipe.options, settings);
  assert.equal(document.result.marks.length, 3, 'no silhouette, scatter or white-fill marks are inferred');
  assert.equal(document.recipe.units[0].role, undefined);
  assert.equal(document.recipe.units[0].strokes[1].options, undefined);
  units[0].strokes[0].points[0].x = -999;
  units[0].strokes[0].options.clip[0].x = -999;
  units[0].strokes[0].options.controls[0].pressure = 0;
  units.reverse(); options.width = 2;
  assert.deepEqual(document.recipe.units, expected);
  assert.equal(document.result.width, 320);
  visitFrozen(document);
});

test('all vegetation recipes rebuild exactly and source revision ignores stale playback', () => {
  for (const technique of techniques) {
    const document = createVegetationDocument([leaf()], { ...settings, technique });
    const saved = JSON.parse(JSON.stringify(document));
    assert.deepEqual(compileVegetationRecipe(saved.recipe), document.result);
    assert.deepEqual(createVegetationDocument([leaf()], { ...settings, technique }), document);
    saved.result.marks = [];
    assert.deepEqual(reviseVegetationDocument(saved, {}).result, document.result);
  }
});

test('editing one leaf or one outline side preserves other marks, paint order and material identities', () => {
  const document = createVegetationDocument([leaf('leaf-a'), leaf('leaf-b')], { ...settings, technique: 'outline-leaf' });
  const before = structuredClone(document);
  const moved = reviseVegetationDocument(document, { units: document.recipe.units.map(unit => unit.id !== 'leaf-a' ? unit : {
    ...unit, strokes: unit.strokes.map(part => ({ ...part, points: part.points.map(point => ({ ...point, x: point.x + 22 })) })),
  }) });
  assert.deepEqual(document, before);
  assert.notDeepEqual(moved.result.marks[0].points, document.result.marks[0].points);
  assert.notDeepEqual(moved.result.marks[1].points, document.result.marks[1].points);
  assert.deepEqual(moved.result.marks.slice(2), document.result.marks.slice(2));
  assert.deepEqual(moved.result.marks.map(mark => mark.seed), document.result.marks.map(mark => mark.seed));
  const wider = reviseVegetationDocument(document, { units: document.recipe.units.map(unit => unit.id !== 'leaf-a' ? unit : {
    ...unit, strokes: unit.strokes.map(part => part.id !== 'left' ? part : { ...part, options: { width: 5 } }),
  }) });
  assert.equal(wider.result.marks[0].width, 5);
  assert.deepEqual(wider.result.marks.slice(1), document.result.marks.slice(1));
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(moved.recipe))), moved.result);
});

test('stable composite identities survive insertion and both unit and stroke reordering', () => {
  const units = [leaf('a/b'), leaf('a')];
  const original = createVegetationDocument(units, settings);
  const reordered = createVegetationDocument([leaf('new'), ...units.slice().reverse().map(unit => ({
    ...unit, strokes: unit.strokes.slice().reverse(),
  }))], settings);
  const prior = byId(original.result), changed = byId(reordered.result);
  for (const [id, mark] of prior) assert.deepEqual(changed.get(id), mark);
  assert.equal(original.result.marks[0].id, '3:a/b/4:left');
  assert.equal(original.result.marks[2].id, '1:a/4:left');
  const collisionCandidates = createVegetationDocument([
    { id: 'a', strokes: [stroke('b/1:c')] }, { id: 'a/1:b', strokes: [stroke('c')] },
  ], settings);
  assert.equal(new Set(collisionCandidates.result.marks.map(mark => mark.id)).size, 2);
  const seeded = reviseVegetationDocument(original, { options: { seed: settings.seed + 1 } });
  assert.deepEqual(seeded.recipe.units, original.recipe.units);
  assert.notEqual(seeded.result.marks[0].seed, original.result.marks[0].seed);
  assert.equal(prior.get(markId('a', 'right')).id, '1:a/5:right');
});

test('moss, direct leaves and outlines execute contact defaults without inventing object geometry', () => {
  const source = { id: 'guide', strokes: [{ id: 'path', points: [{ x: 40, y: 90 }, { x: 240, y: 90 }] }] };
  const documents = techniques.map(technique => createVegetationDocument([source], { ...settings, technique }));
  for (const document of documents) {
    assert.deepEqual(document.recipe.units, [source]);
    assert.equal(document.result.marks.length, 1);
    assert.equal(document.result.marks[0].kind, 'stroke');
  }
  const [moss, direct, outline] = documents.map(document => document.result.marks[0]);
  const max = (mark, channel) => Math.max(...sampleBrushContact(mark).map(sample => sample[channel]));
  assert.ok(max(direct, 'side') > max(moss, 'side'));
  assert.ok(max(outline, 'side') < .1);
  assert.ok(max(outline, 'halfWidth') < max(moss, 'halfWidth'));
  const contacts = sampleBrushContact(direct), total = contacts.at(-1).distance;
  const peak = (a, b) => Math.max(...contacts.filter(sample => sample.distance / total >= a && sample.distance / total <= b).map(sample => sample.halfWidth));
  assert.ok(peak(.2, .5) > peak(0, .08), 'direct leaf grows into a pressed belly');
  assert.ok(peak(.2, .5) > peak(.9, 1), 'direct leaf lifts toward the tip');
});

test('structural paths use neutral contact across techniques and caller overrides replace defaults', () => {
  const source = { id: 'branch', role: 'structure', strokes: [stroke()] };
  const structures = techniques.map(technique => createVegetationDocument([source], { ...settings, technique }).result.marks[0]);
  assert.deepEqual(structures[0], structures[1]); assert.deepEqual(structures[1], structures[2]);
  assert.equal(structures[0].width, 2.4);
  assert.ok(sampleBrushContact(structures[0]).every(sample => sample.side === 0));
  const controls = [{ at: 0, pressure: 1, side: 0 }, { at: 1, pressure: 1, side: 0 }];
  const neutral = { id: 'leaf', strokes: [stroke('part', {
    width: 6, opacity: .3, dryness: .2, smoothing: 'linear', finish: 'preserve', turn: 'preserve', controls,
  })] };
  const marks = techniques.map(technique => {
    const document = createVegetationDocument([neutral], { ...settings, technique, strokeWidth: 40, dryness: .9, opacity: 1 });
    const mark = document.result.marks[0];
    assert.deepEqual(document.recipe.units, [neutral]);
    assert.deepEqual(mark.points, neutral.strokes[0].points);
    assert.equal(mark.width, 6); assert.equal(mark.opacity, .3); assert.equal(mark.dryness, .2);
    assert.ok(sampleBrushContact(mark).every(sample => sample.side === 0));
    return mark;
  });
  assert.deepEqual(marks[0], marks[1]); assert.deepEqual(marks[1], marks[2]);
  const global = createVegetationDocument([source], { ...settings, strokeWidth: 5, dryness: .2, opacity: .4 });
  assert.equal(global.result.marks[0].width, 5);
  assert.equal(global.result.marks[0].opacity, .4);
});

test('zero-pressure gaps and complete lifts survive every vegetation contact preset', () => {
  for (const technique of techniques) {
    const part = stroke(); part.points[1].pressure = 0;
    const document = createVegetationDocument([{ id: 'leaf', strokes: [part] }], { ...settings, technique });
    assert.ok(document.result.marks[0].points.some(point => point.x === 69 && point.y === 90 && point.pressure === 0));
    const lifted = createVegetationDocument([{ id: 'leaf', strokes: [{
      ...part, points: part.points.map(point => ({ ...point, pressure: 0 })),
    }] }], { ...settings, technique });
    assert.ok(sampleBrushContact(lifted.result.marks[0]).every(sample => sample.pressure === 0 && sample.halfWidth === 0));
  }
});

test('absolute stroke times and role remain sparse authored data through save and revision', () => {
  const units = [{ id: 'pair', role: 'mark', strokes: [stroke('later', { start: 4, duration: 1.5 }), stroke('first', { start: .2, duration: 0 })] }];
  const document = createVegetationDocument(units, settings);
  assert.deepEqual(document.recipe.units, units);
  assert.deepEqual(document.result.marks.map(mark => [mark.start, mark.duration]), [[4, 1.5], [.2, 0]]);
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
  const omitted = createVegetationDocument([{ id: 'leaf', strokes: [stroke('part', { width: undefined, controls: undefined })] }], settings);
  assert.deepEqual(omitted.recipe.units[0].strokes[0].options, {});
  assert.equal(omitted.result.marks[0].width, 15);
});

test('empty documents still validate settings and normalize owned colors', () => {
  const document = createVegetationDocument([], { ...settings, background: '#ABCDEF', ink: '#AABBCC' });
  assert.equal(document.result.background, '#abcdef');
  assert.equal(document.recipe.options.ink, '#aabbcc');
  assert.equal(document.result.marks.length, 0);
  assert.deepEqual(compileVegetationRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
  for (const patch of [{ technique: 'tree' }, { width: 0 }, { height: Infinity }, { strokeWidth: 0 }, { seed: .5 },
    { opacity: 2 }, { dryness: -1 }, { strength: NaN }, { future: 1 }, { background: '#fff' }, { ink: 'red' }]) {
    assert.throws(() => createVegetationDocument([], { ...settings, ...patch }));
  }
});

test('unknown versions, unsupported fields and ambiguous or malformed author identities are rejected', () => {
  const document = createVegetationDocument([leaf()], settings);
  for (const patch of [{ version: 2 }, { generator: 'unknown' }, { future: true }]) assert.throws(() => compileVegetationRecipe({ ...document.recipe, ...patch }));
  assert.throws(() => reviseVegetationDocument({ ...document, version: 2 }, {}));
  assert.throws(() => reviseVegetationDocument(document, { unknown: true }));
  for (const source of [null, { id: '', strokes: [stroke()] }, { ...leaf(), future: 1 },
    { ...leaf(), role: 'trunk' }, { id: 'empty', strokes: [] }, { id: 'same', strokes: [stroke(), stroke()] }]) {
    assert.throws(() => createVegetationDocument([source], settings));
  }
  assert.throws(() => createVegetationDocument([leaf('same'), leaf('same')], settings));
  for (const key of ['id', 'ink', 'seed', 'gestureModel', 'nib', 'brush']) {
    assert.throws(() => createVegetationDocument([{ id: 'bad', strokes: [stroke('part', { [key]: 1 })] }], settings));
  }
  for (const options of [{ controls: [{ at: .8 }, { at: .2 }] }, { controls: [{ at: .5, strange: 1 }] },
    { start: -1 }, { duration: Infinity }, { clip: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }, { width: null }]) {
    assert.throws(() => createVegetationDocument([{ id: 'bad', strokes: [stroke('part', options)] }], settings));
  }
  assert.throws(() => createVegetationDocument([{ id: 'bad', strokes: [{ ...stroke(), points: [{ x: 1, y: 1 }, { x: 2, y: NaN }] }] }], settings));
  assert.throws(() => createVegetationDocument([{ id: 'bad', strokes: [{ ...stroke(), points: [{ x: 1, y: 1 }, { x: 2, y: 2, extra: 1 }] }] }], settings));
});

test('capacity bounds limit units, total strokes, source vertices, clips and local controls', () => {
  assert.throws(() => createVegetationDocument(Array.from({ length: 513 }, (_, i) => leaf(`u${i}`)), settings));
  assert.throws(() => createVegetationDocument(Array.from({ length: 257 }, (_, i) => leaf(`u${i}`)), settings));
  const bad = part => createVegetationDocument([{ id: 'large', strokes: [part] }], settings);
  assert.throws(() => bad({ ...stroke(), points: Array.from({ length: 4097 }, (_, i) => ({ x: i, y: i % 2 })) }));
  assert.throws(() => bad(stroke('part', { clip: Array.from({ length: 4097 }, (_, i) => ({ x: i, y: i % 2 })) })));
  assert.throws(() => bad(stroke('part', { controls: Array.from({ length: 129 }, (_, i) => ({ at: i / 128 })) })));
});
