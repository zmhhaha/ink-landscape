import test from 'node:test';
import assert from 'node:assert/strict';
import { createCunDocument, compileCunRecipe, reviseCunDocument } from '../dist/cun-document.js';
import { sampleBrushContact } from '../dist/brush-contact.js';

const settings = { technique: 'pima', width: 320, height: 240, seed: 261124 };
const techniques = ['pima', 'axe', 'zhedai', 'jiesuo', 'luanchai', 'niumao', 'cloud-study', 'point-study', 'heye'];
const source = (id = 'rib', options) => ({ id, points: [
  { x: 42, y: 45, pressure: .65 }, { x: 83, y: 79, pressure: .9 },
  { x: 88, y: 140, pressure: .75 }, { x: 142, y: 194, pressure: .6 },
], ...(options ? { options } : {}) });
const byId = scene => new Map(scene.marks.map(mark => [mark.id, mark]));
const visitFrozen = value => {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) visitFrozen(child);
};

test('cun group owns sparse paths, clips and controls independently of DOM and caller mutation', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const path = source('first', { width: 8,
    clip: [{ x: 10, y: 10 }, { x: 300, y: 10 }, { x: 300, y: 220 }, { x: 10, y: 220 }],
    controls: [{ at: .4, side: .5, pressure: .75 }] });
  const second = source('second'); second.points = second.points.map(point => ({ ...point, x: point.x + 60 }));
  const strokes = [path, second], expected = structuredClone(strokes), options = { ...settings };
  const document = createCunDocument(strokes, options);
  assert.deepEqual(document.recipe.strokes, expected);
  assert.deepEqual(document.recipe.options, settings);
  assert.equal(document.recipe.strokes[1].options, undefined);
  path.points[0].x = -900; path.options.clip[0].x = -900; path.options.controls[0].side = 0;
  strokes.reverse(); options.width = 1;
  assert.deepEqual(document.recipe.strokes, expected);
  assert.equal(document.result.width, 320);
  visitFrozen(document);
});

test('technique defaults execute different contact and corner behavior on the same authored guide', () => {
  const path = source(), documents = Object.fromEntries(['pima', 'axe', 'zhedai'].map(technique =>
    [technique, createCunDocument([path], { ...settings, technique })]));
  assert.deepEqual(documents.pima.recipe.strokes, documents.axe.recipe.strokes);
  const [pima, axe, folded] = ['pima', 'axe', 'zhedai'].map(key => documents[key].result.marks[0]);
  assert.equal(pima.width, 6); assert.equal(axe.width, 26); assert.equal(folded.width, 13);
  assert.equal(pima.smoothing, 'linear', 'local curve is flattened into editable ordinary stroke geometry');
  assert.ok(pima.points.length > path.points.length);
  assert.ok(folded.points.some(point => point.x === path.points[1].x && point.y === path.points[1].y), 'fold vertex survives');
  assert.ok(folded.points.some(point => point.x === path.points[2].x && point.y === path.points[2].y));
  const sideMax = mark => Math.max(...sampleBrushContact(mark).map(sample => sample.side));
  assert.ok(sideMax(axe) > .95);
  assert.ok(sideMax(pima) < .3);
  assert.ok(sideMax(folded) > .8);
  const early = sampleBrushContact(axe).filter(sample => sample.distance < 25);
  const late = sampleBrushContact(axe).filter(sample => sample.distance > 160);
  assert.ok(Math.max(...early.map(sample => sample.halfWidth)) > Math.max(...late.map(sample => sample.halfWidth)));
});

test('caller overrides control geometry and contact while defaults remain separately editable', () => {
  const controls = [{ at: 0, pressure: 1, side: 0 }, { at: 1, pressure: 1, side: 0 }];
  const original = source('sweep', { width: 7, opacity: .3, dryness: .2, axis: 'center', controls,
    turn: 'preserve', smoothing: 'linear', finish: 'preserve' });
  const document = createCunDocument([original], { ...settings, technique: 'axe', strokeWidth: 50, opacity: .9, dryness: .9 });
  const mark = document.result.marks[0];
  assert.equal(mark.width, 7); assert.equal(mark.opacity, .3); assert.equal(mark.dryness, .2);
  assert.deepEqual(mark.points, original.points);
  assert.ok(sampleBrushContact(mark).every(sample => sample.side === 0 && sample.centerX === sample.x && sample.centerY === sample.y));
  assert.deepEqual(document.recipe.strokes[0].options.controls, controls);
  const globalOnly = createCunDocument([source('plain')], { ...settings, strokeWidth: 11, dryness: .3, opacity: .4 });
  assert.equal(globalOnly.result.marks[0].width, 11);
  assert.equal(globalOnly.result.marks[0].opacity, .4);
  const omitted = createCunDocument([source('plain', { width: undefined, controls: undefined })], settings);
  assert.equal(omitted.result.marks[0].width, 6);
  assert.ok(omitted.result.marks[0].brush.controls.some(control => control.side > 0));
});

test('line-cun defaults distinguish curved center contacts, folded contacts and fine-line study', () => {
  const path = source('line');
  const [rope, branches, fine] = ['jiesuo', 'luanchai', 'niumao'].map(technique =>
    createCunDocument([path], { ...settings, technique }));
  for (const document of [rope, branches, fine]) {
    assert.deepEqual(document.recipe.strokes, [path], 'organization and source pressure are authored');
    assert.equal(document.result.marks.length, 1, 'one path must not expand into an opaque texture tile');
  }
  const [r, b, f] = [rope, branches, fine].map(document => document.result.marks[0]);
  assert.equal(r.width, 5); assert.equal(b.width, 7); assert.equal(f.width, 3);
  assert.ok(r.points.length > path.points.length && f.points.length > path.points.length);
  for (const point of path.points.slice(1, -1)) {
    assert.ok(b.points.some(other => other.x === point.x && other.y === point.y), 'folded source vertices survive');
  }
  const max = (mark, channel) => Math.max(...sampleBrushContact(mark).map(sample => sample[channel]));
  assert.ok(max(r, 'side') <= .18 && max(f, 'side') <= .12);
  assert.ok(max(b, 'side') > .30, 'straight/folded family includes independent local contact changes');
  assert.ok(max(f, 'halfWidth') < max(r, 'halfWidth'));
  assert.ok(max(r, 'halfWidth') < max(b, 'halfWidth'));
  assert.notDeepEqual(r.points, b.points, 'linear folds and authored curves execute differently');
});

test('line-cun authors can fully replace contact presets without a hidden secondary style', () => {
  const controls = [{ at: 0, pressure: 1, side: 0, angle: 1.5 }, { at: 1, pressure: 1, side: 0, angle: 1.5 }];
  const path = source('neutral', { width: 9, dryness: .3, opacity: .5, smoothing: 'linear',
    turn: 'preserve', finish: 'preserve', controls });
  const marks = ['jiesuo', 'luanchai', 'niumao'].map(technique => {
    const document = createCunDocument([path], { ...settings, technique, strokeWidth: 40, dryness: .9, opacity: 1 });
    const mark = document.result.marks[0];
    assert.deepEqual(document.recipe.strokes[0], path);
    assert.deepEqual(mark.points, path.points);
    assert.equal(mark.width, 9); assert.equal(mark.dryness, .3); assert.equal(mark.opacity, .5);
    assert.deepEqual(mark.brush.controls.map(control => control.at), [0, 1]);
    assert.ok(sampleBrushContact(mark).every(sample => sample.side === 0));
    return mark;
  });
  assert.deepEqual(marks[0], marks[1]); assert.deepEqual(marks[1], marks[2]);
});

test('each line-cun family edits one explicit source while preserving clips, order and other identities', () => {
  const clip = [{ x: 20, y: 20 }, { x: 280, y: 20 }, { x: 280, y: 210 }, { x: 20, y: 210 }];
  for (const technique of ['jiesuo', 'luanchai', 'niumao']) {
    const document = createCunDocument([source('one', { clip }), source('two')], { ...settings, technique });
    const before = structuredClone(document);
    const revised = reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id === 'one'
      ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + 11 })), options: { ...stroke.options, width: 12 } }
      : stroke) });
    assert.deepEqual(document, before);
    assert.deepEqual(revised.result.marks.map(mark => mark.id), ['one', 'two']);
    assert.deepEqual(revised.result.marks[1], document.result.marks[1]);
    assert.notDeepEqual(revised.result.marks[0].points, document.result.marks[0].points);
    assert.deepEqual(revised.result.marks[0].clip, clip);
    assert.equal(revised.result.marks[0].seed, document.result.marks[0].seed);
    assert.deepEqual(compileCunRecipe(JSON.parse(JSON.stringify(revised.recipe))), revised.result);
  }
});

test('shared cloud and point studies and heye execute different contact phases on authored guides', () => {
  const path = { id: 'guide', points: [{ x: 40, y: 70 }, { x: 240, y: 70 }] };
  const documents = ['cloud-study', 'point-study', 'heye'].map(technique =>
    createCunDocument([path], { ...settings, technique }));
  for (const document of documents) {
    assert.deepEqual(document.recipe.strokes, [path], 'the preset must not generate curves, dots or branches');
    assert.equal(document.result.marks.length, 1);
  }
  const samples = documents.map(document => sampleBrushContact(document.result.marks[0]));
  const widths = (contacts, low, high) => contacts.filter(sample => {
    const position = sample.distance / contacts.at(-1).distance;
    return position >= low && position <= high;
  }).map(sample => sample.halfWidth);
  const max = values => Math.max(...values);
  const [cloud, point, vein] = samples;
  assert.ok(Math.max(...cloud.map(sample => sample.side)) > .4, 'cloud study varies light side contact along the supplied guide');
  assert.ok(max(widths(point, .35, .7)) > max(widths(point, 0, .1)), 'point belly expands after initial tip contact');
  assert.ok(max(widths(point, .35, .7)) > max(widths(point, .9, 1)), 'point lifts away after the belly');
  assert.ok(max(widths(vein, 0, .2)) > max(widths(vein, .7, 1)), 'downward vein starts heavier and opens toward the foot');
  assert.notDeepEqual(cloud, point); assert.notDeepEqual(point, vein);
});

test('batch-eight sources retain authored branches and per-stroke overrides replace every shared default', () => {
  const controls = [{ at: 0, pressure: 1, side: 0 }, { at: 1, pressure: 1, side: 0 }];
  const paths = [source('trunk', { width: 6, opacity: .4, dryness: .2, smoothing: 'linear',
    turn: 'preserve', finish: 'preserve', controls }), source('branch', { start: .7, duration: 2 })];
  const marks = [];
  for (const technique of ['cloud-study', 'point-study', 'heye']) {
    const document = createCunDocument(paths, { ...settings, technique, strokeWidth: 40, dryness: .9, opacity: 1 });
    assert.deepEqual(document.recipe.strokes, paths, 'caller branch junctions, pressure and order remain explicit');
    const mark = document.result.marks[0];
    assert.deepEqual(mark.points, paths[0].points);
    assert.equal(mark.width, 6); assert.equal(mark.opacity, .4); assert.equal(mark.dryness, .2);
    assert.deepEqual(mark.brush.controls.map(control => control.at), [0, 1]);
    assert.ok(sampleBrushContact(mark).every(sample => sample.side === 0));
    assert.equal(document.result.marks[1].start, .7); assert.equal(document.result.marks[1].duration, 2);
    marks.push(mark);
  }
  assert.deepEqual(marks[0], marks[1]); assert.deepEqual(marks[1], marks[2]);
});

test('batch-eight editing and reordering preserve other marks, seeds, clips and JSON replay', () => {
  const clip = [{ x: 20, y: 20 }, { x: 280, y: 20 }, { x: 280, y: 210 }, { x: 20, y: 210 }];
  for (const technique of ['cloud-study', 'point-study', 'heye']) {
    const document = createCunDocument([source('parent', { clip }), source('branch-a'), source('branch-b')], { ...settings, technique });
    const before = structuredClone(document);
    const revised = reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id === 'branch-a'
      ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + 13 })), options: { width: 4 } }
      : stroke) });
    assert.deepEqual(document, before);
    assert.deepEqual(revised.result.marks[0], document.result.marks[0]);
    assert.deepEqual(revised.result.marks[2], document.result.marks[2]);
    assert.notDeepEqual(revised.result.marks[1], document.result.marks[1]);
    assert.equal(revised.result.marks[1].seed, document.result.marks[1].seed);
    const reordered = reviseCunDocument(revised, { strokes: [...revised.recipe.strokes].reverse() });
    assert.deepEqual(reordered.result.marks, [...revised.result.marks].reverse());
    assert.deepEqual(compileCunRecipe(JSON.parse(JSON.stringify(revised.recipe))), revised.result);
    assert.deepEqual(revised.result.marks[0].clip, clip);
  }
});

test('authored zero-pressure anchors and full lifts remain genuine empty contacts in every technique', () => {
  const lifted = source('lift');
  lifted.points[1].pressure = 0;
  for (const technique of techniques) {
    const document = createCunDocument([lifted], { ...settings, technique });
    const mark = document.result.marks[0];
    assert.ok(mark.points.some(point => point.x === 83 && point.y === 79 && point.pressure === 0));
    const allLifted = createCunDocument([{ ...lifted, points: lifted.points.map(point => ({ ...point, pressure: 0 })) }], { ...settings, technique });
    assert.ok(sampleBrushContact(allLifted.result.marks[0]).every(sample => sample.pressure === 0 && sample.halfWidth === 0));
  }
});

test('editing a stroke changes only its result and keeps material seeds and original source stable', () => {
  const document = createCunDocument([source('one'), source('two'), source('three')], settings);
  const before = JSON.stringify(document);
  const revised = reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id !== 'two' ? stroke : {
    ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + 19 })), options: { width: 9 },
  }) });
  assert.equal(JSON.stringify(document), before);
  assert.deepEqual(revised.recipe.strokes[0], document.recipe.strokes[0]);
  assert.deepEqual(revised.result.marks[0], document.result.marks[0]);
  assert.deepEqual(revised.result.marks[2], document.result.marks[2]);
  assert.notDeepEqual(revised.result.marks[1].points, document.result.marks[1].points);
  assert.equal(revised.result.marks[1].seed, document.result.marks[1].seed);
});

test('stable identities survive source reordering and insertion without global random state', () => {
  const original = [source('first'), source('second')];
  const document = createCunDocument(original, settings);
  const reordered = createCunDocument([original[1], source('new'), original[0]], settings);
  const initial = byId(document.result), changed = byId(reordered.result);
  for (const [id, mark] of initial) assert.deepEqual(changed.get(id), mark);
  assert.deepEqual(reordered.recipe.strokes.map(stroke => stroke.id), ['second', 'new', 'first']);
  const seeded = reviseCunDocument(document, { options: { seed: settings.seed + 1 } });
  assert.notEqual(seeded.result.marks[0].seed, document.result.marks[0].seed);
  assert.deepEqual(seeded.recipe.strokes, document.recipe.strokes);
});

test('JSON recipes recompile all techniques and revision ignores a stale saved playback result', () => {
  for (const technique of techniques) {
    const document = createCunDocument([source()], { ...settings, technique });
    const saved = JSON.parse(JSON.stringify(document));
    assert.deepEqual(compileCunRecipe(saved.recipe), document.result);
    saved.result.marks = [];
    assert.deepEqual(reviseCunDocument(saved, {}).result, document.result);
    assert.deepEqual(createCunDocument([source()], { ...settings, technique }), document);
  }
});

test('absolute per-stroke start and duration survive author order and JSON replay', () => {
  const document = createCunDocument([source('later', { start: 4, duration: 1.5 }), source('earlier', { start: .2, duration: 0 })], settings);
  assert.deepEqual(document.result.marks.map(mark => [mark.id, mark.start, mark.duration]), [['later', 4, 1.5], ['earlier', .2, 0]]);
  assert.deepEqual(compileCunRecipe(JSON.parse(JSON.stringify(document.recipe))), document.result);
  const revised = reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id === 'later'
    ? { ...stroke, options: { ...stroke.options, start: 0 } } : stroke) });
  assert.equal(revised.result.marks[0].start, 0);
  assert.deepEqual(revised.result.marks[1], document.result.marks[1]);
});

test('empty groups validate global settings and color normalization prevents inherited Canvas colors', () => {
  const empty = createCunDocument([], settings);
  assert.equal(empty.result.marks.length, 0); assert.equal(empty.result.seed, settings.seed);
  assert.deepEqual(compileCunRecipe(JSON.parse(JSON.stringify(empty.recipe))), empty.result);
  const upper = createCunDocument([source()], { ...settings, background: '#ABCDEF', ink: '#AABBCC' });
  assert.equal(upper.result.background, '#abcdef'); assert.equal(upper.result.marks[0].ink, '#aabbcc');
  assert.equal(upper.recipe.options.background, '#abcdef'); assert.equal(upper.recipe.options.ink, '#aabbcc');
  for (const key of ['background', 'ink']) for (const value of ['red', '#000', 'not-a-color', '', null]) {
    assert.throws(() => createCunDocument([], { ...settings, [key]: value }));
  }
  for (const options of [{ technique: 'other' }, { width: 0 }, { height: Infinity }, { strokeWidth: 0 },
    { opacity: 2 }, { dryness: -1 }, { strength: NaN }, { seed: .5 }, { future: 1 }]) {
    assert.throws(() => createCunDocument([], { ...settings, ...options }));
  }
});

test('unknown versions, conflicting identities and malformed source fields are rejected', () => {
  const document = createCunDocument([source()], settings);
  for (const patch of [{ version: 2 }, { generator: 'unknown' }, { future: true }]) assert.throws(() => compileCunRecipe({ ...document.recipe, ...patch }));
  assert.throws(() => reviseCunDocument({ ...document, version: 2 }, {}));
  assert.throws(() => reviseCunDocument(document, { unknown: true }));
  assert.throws(() => createCunDocument([source('same'), source('same')], settings));
  assert.throws(() => createCunDocument([{ ...source(), id: '' }], settings));
  assert.throws(() => createCunDocument([{ ...source(), future: true }], settings));
  for (const key of ['id', 'ink', 'seed', 'gestureModel', 'nib', 'brush']) assert.throws(() => createCunDocument([source('bad', { [key]: 1 })], settings));
  assert.throws(() => createCunDocument([{ ...source(), points: [{ x: 1, y: 1 }, { x: 2, y: 2, strange: 1 }] }], settings));
  assert.throws(() => createCunDocument([source('bad', { controls: [{ at: .5, strange: 1 }] })], settings));
  assert.throws(() => createCunDocument([source('bad', { start: -1 })], settings));
  assert.throws(() => createCunDocument([source('bad', { duration: Infinity })], settings));
  assert.throws(() => createCunDocument([source('bad', { controls: [{ at: .8 }, { at: .2 }] })], settings));
  assert.throws(() => createCunDocument([source('bad', { clip: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })], settings));
  assert.throws(() => createCunDocument([{ ...source(), points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }], settings));
  assert.throws(() => createCunDocument([{ ...source(), points: [{ x: 0, y: 0 }, { x: NaN, y: 1 }] }], settings));
});

test('capacity limits bound source strokes, paths, clips and local controls', () => {
  assert.throws(() => createCunDocument(Array.from({ length: 513 }, (_, i) => source(`s${i}`)), settings));
  assert.throws(() => createCunDocument([{ id: 'long', points: Array.from({ length: 4097 }, (_, i) => ({ x: i, y: i % 2 })) }], settings));
  assert.throws(() => createCunDocument([source('large-clip', { clip: Array.from({ length: 4097 }, (_, i) => ({ x: i, y: i % 2 })) })], settings));
  assert.throws(() => createCunDocument([source('controls', { controls: Array.from({ length: 129 }, (_, i) => ({ at: i / 128 })) })], settings));
  const manyTurns = { id: 'many-turns', points: Array.from({ length: 150 }, (_, i) => ({ x: i * 2, y: (i % 2) * 5, pressure: .8 })) };
  const folded = createCunDocument([manyTurns], { ...settings, technique: 'zhedai' });
  assert.ok(folded.result.marks[0].brush.controls.length <= 128);
  for (const point of manyTurns.points) assert.ok(folded.result.marks[0].points.some(other => point.x === other.x && point.y === other.y));
});
