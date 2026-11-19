import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInkProcessDocument, compileInkProcessRecipe, reviseInkProcessDocument, rasterizeInkProcess,
} from '../dist/ink-process.js';

const settings = { width: 160, height: 100, seed: 261122 };
const source = (id, points, extra = {}) => ({ points: points.map(([x, y, pressure = .9]) => ({ x, y, pressure })),
  options: { id, width: 30, dryness: .18, smoothing: 'catmull-rom', gestureModel: 'local-v1', ...extra } });
const horizontal = () => source('long', [[17, 50, 0], [35, 47], [96, 52], [143, 50, 0]]);
const vertical = () => source('cross', [[83, 15, 0], [79, 37], [87, 68], [84, 86, 0]], { width: 24 });
const layers = () => [
  { id: 'first', strokes: [horizontal()], concentration: .25, water: .9, at: 0, dryAfter: 3 },
  { id: 'second', strokes: [vertical()], concentration: .85, water: .9, at: .4, dryAfter: 2, mode: 'wet-mix' },
];
const sum = array => array.reduce((a, b) => a + b, 0);
const frame = (document, options) => rasterizeInkProcess(document.result, options);

test('ink process owns sparse editable layer sources, paths, clips and controls without browser globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const input = [{ id: 'a', strokes: [horizontal()] }];
  input[0].strokes[0].options.controls = [{ at: .5, side: .6 }];
  input[0].strokes[0].options.clip = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 90 }, { x: 0, y: 90 }];
  const expected = structuredClone(input);
  const document = createInkProcessDocument(input, { ...settings, ink: '#20251F' });
  assert.deepEqual(document.recipe.layers, expected);
  assert.equal(document.recipe.layers[0].water, undefined);
  assert.equal(document.result.layers[0].water, .5);
  assert.equal(document.recipe.options.ink, '#20251f');
  input[0].strokes[0].points[0].x = -500;
  input[0].strokes[0].options.controls[0].side = 0;
  input[0].strokes[0].options.clip[0].x = -500;
  assert.deepEqual(document.recipe.layers, expected);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
  assert.throws(() => { document.recipe.layers[0].strokes[0].points[0].x = 1; }, TypeError);
});

test('ink process recipe and compiled JSON replay reproduce identical density without mutating source', () => {
  const document = createInkProcessDocument(layers(), settings);
  const saved = JSON.parse(JSON.stringify(document));
  assert.deepEqual(compileInkProcessRecipe(saved.recipe), document.result);
  const before = JSON.stringify(saved.result);
  const original = frame(document), replayed = rasterizeInkProcess(saved.result);
  assert.deepEqual(replayed, original);
  assert.equal(JSON.stringify(saved.result), before);
  assert.equal(document.result.layers[0].marks[0].start, 0);
  assert.equal(document.result.layers[0].marks[0].duration, 0);
  assert.ok(document.result.layers.every(layer => layer.marks.every(mark => mark.ink === document.result.ink)));
});

test('layer edits recompile from source and keep every unedited layer and material seed', () => {
  const document = createInkProcessDocument(layers(), settings);
  const changed = document.recipe.layers.map(layer => layer.id === 'first'
    ? { ...layer, strokes: layer.strokes.map(stroke => ({ ...stroke,
      points: stroke.points.map(point => ({ ...point, x: point.x + 3 })) })) }
    : layer);
  const revised = reviseInkProcessDocument(document, { layers: changed });
  assert.deepEqual(revised.result.layers[1], document.result.layers[1]);
  assert.notDeepEqual(revised.result.layers[0].marks[0].points, document.result.layers[0].marks[0].points);
  assert.equal(revised.result.layers[0].marks[0].seed, document.result.layers[0].marks[0].seed);
  assert.deepEqual(reviseInkProcessDocument({ ...document, result: null }, {}).result, document.result);
  assert.equal(document.recipe.layers[0].strokes[0].points[0].x, 17);
  assert.deepEqual(reviseInkProcessDocument(document, { options: { ink: '#101010' } }).recipe.layers, document.recipe.layers);
});

test('explicit stroke IDs retain association through source reorder and explicit seed overrides the process', () => {
  const a = horizontal(), b = vertical();
  const one = createInkProcessDocument([{ id: 'ink', strokes: [a, b] }], settings);
  const two = createInkProcessDocument([{ id: 'ink', strokes: [b, a] }], settings);
  const byId = document => Object.fromEntries(document.result.layers[0].marks.map(mark => [mark.id, mark]));
  assert.deepEqual(byId(one), byId(two));
  const seeded = createInkProcessDocument([{ id: 'ink', strokes: [{ ...a, options: { ...a.options, seed: 123 } }] }], settings);
  assert.equal(seeded.result.layers[0].marks[0].seed, 123);
  const other = createInkProcessDocument([{ id: 'ink', strokes: [a, b] }], { ...settings, seed: 5 });
  assert.notEqual(other.result.layers[0].marks[0].seed, one.result.layers[0].marks[0].seed);
  assert.deepEqual(other.result.layers[0].marks[0].points, one.result.layers[0].marks[0].points);
});

test('concentration scales optical depth while water alone leaves a single dry-glazed footprint unchanged', () => {
  const make = (concentration, water) => createInkProcessDocument([{ id: 'one', strokes: [horizontal()], concentration, water }], settings);
  const low = frame(make(.2, .1)), high = frame(make(.8, .1)), wetter = frame(make(.2, 1));
  assert.deepEqual(wetter.density, low.density);
  assert.ok(sum(low.density) > 0);
  for (let i = 0; i < low.density.length; i++) assert.ok(Math.abs(high.density[i] - low.density[i] * 4) < 1e-6);
  assert.ok(frame(make(0, 1)).density.every(value => value === 0));
  assert.ok(sum(high.density) > sum(low.density));
});

test('dryness changes coverage independently of concentration and wetness', () => {
  const make = dryness => createInkProcessDocument([{ id: 'one', strokes: [horizontal()].map(stroke => ({ ...stroke,
    options: { ...stroke.options, dryness } })), concentration: .5, water: .6 }], settings);
  const moist = frame(make(.1)), dry = frame(make(.95));
  assert.ok(sum(dry.density) < sum(moist.density));
  assert.notDeepEqual(dry.density, moist.density);
});

test('dry deposits multiply pigment transmittance through accumulated optical depth', () => {
  const shared = { ...horizontal(), options: { ...horizontal().options, seed: 77 } };
  const a = { id: 'a', strokes: [shared], concentration: .23, water: .7, mode: 'glaze' };
  const b = { id: 'b', strokes: [shared], concentration: .61, water: .2, mode: 'glaze' };
  const first = frame(createInkProcessDocument([a], settings));
  const second = frame(createInkProcessDocument([b], settings));
  const layered = frame(createInkProcessDocument([a, b], settings));
  let overlap = 0;
  for (let i = 0; i < layered.density.length; i++) {
    assert.ok(Math.abs(Math.exp(-layered.density[i]) - Math.exp(-first.density[i]) * Math.exp(-second.density[i])) < 1e-7);
    if (first.density[i] > .05 && second.density[i] > .05) {
      overlap++;
      assert.ok(layered.density[i] > first.density[i] && layered.density[i] > second.density[i]);
    }
  }
  assert.ok(overlap > 50);
});

test('broad dry contact retains interior paper strands instead of filling them with neighbouring segment caps', () => {
  const make = points => createInkProcessDocument([{ id: 'dry', concentration: .8, strokes: [{ points,
    options: { id: 'dry-contact', seed: 42, width: 48, dryness: .8, smoothing: 'linear' },
  }] }], { width: 160, height: 100, seed: 2 });
  const sparse = frame(make([{ x: 15, y: 50, pressure: .9 }, { x: 145, y: 50, pressure: .9 }]));
  const dense = frame(make(Array.from({ length: 11 }, (_, i) => ({ x: 15 + i * 13, y: 50, pressure: .9 }))));
  const interior = [];
  for (let y = 19; y < 31; y++) for (let x = 20; x < 60; x++) interior.push(sparse.density[y * sparse.columns + x]);
  assert.ok(interior.filter(value => value < .001).length > interior.length * .35,
    'a broad dry footprint retains substantial paper within its full-width interior');
  assert.ok(interior.filter(value => value > .1).length > interior.length * .2,
    'the same interior retains ink strands as well as paper');
  for (let i = 0; i < sparse.density.length; i++) assert.ok(Math.abs(sparse.density[i] - dense.density[i]) < 1e-5,
    'adding collinear authored samples does not replace coherent material with additional deposits');
});

test('wet interaction changes only the local meeting region and conserves nonnegative pigment density', () => {
  const wet = createInkProcessDocument(layers(), settings);
  const glaze = createInkProcessDocument(layers().map(layer => ({ ...layer, mode: 'glaze' })), settings);
  const a = frame(wet), b = frame(glaze);
  assert.equal(a.interactions, 1);
  assert.equal(b.interactions, 0);
  assert.notDeepEqual(a.density, b.density);
  assert.ok(a.density.every(Number.isFinite));
  assert.ok(a.density.every(value => value >= 0));
  assert.ok(Math.abs(sum(a.density) - sum(b.density)) <= sum(b.density) * 2e-6);
  let changed = 0, remoteInk = 0;
  for (let y = 0; y < a.rows; y++) for (let x = 0; x < a.columns; x++) {
    const i = y * a.columns + x, px = (x + .5) * a.cellSize;
    if (a.density[i] !== b.density[i]) changed++;
    if (px < 45 || px > 120) {
      assert.equal(a.density[i], b.density[i]);
      if (a.density[i] > 0) remoteInk++;
    }
  }
  assert.ok(changed > 10);
  assert.ok(remoteInk > 10, 'test includes remote existing ink, not only blank corners');
});

test('fully dry previous layers and zero water disable wet exchange exactly', () => {
  const variants = [
    layers().map(layer => layer.id === 'second' ? { ...layer, at: 3 } : layer),
    layers().map(layer => layer.id === 'first' ? { ...layer, water: 0 } : layer),
    layers().map(layer => layer.id === 'second' ? { ...layer, water: 0 } : layer),
    layers().map(layer => layer.id === 'first' ? { ...layer, dryAfter: 0 } : layer),
  ];
  for (const input of variants) {
    const wet = frame(createInkProcessDocument(input, settings));
    const glaze = frame(createInkProcessDocument(input.map(layer => ({ ...layer, mode: 'glaze' })), settings));
    assert.equal(wet.interactions, 0);
    assert.deepEqual(wet.density, glaze.density);
  }
});

test('water over water cannot remobilize pigment belonging to a dry lower layer', () => {
  const fixed = { id: 'dry-base', strokes: [horizontal()], at: 0, water: 0, dryAfter: 0, concentration: .9 };
  const waterOne = { id: 'water-1', strokes: [horizontal()], at: 3, water: 1, dryAfter: 2, concentration: 0 };
  const waterTwo = { id: 'water-2', strokes: [horizontal()], at: 3.4, water: 1, dryAfter: 2, concentration: 0, mode: 'wet-mix' };
  const alone = frame(createInkProcessDocument([fixed], settings));
  const watered = frame(createInkProcessDocument([fixed, waterOne, waterTwo], settings));
  assert.equal(watered.interactions, 1, 'there is a wet contact event, but no movable pigment');
  assert.deepEqual(watered.density, alone.density);
});

test('wet exchange over a dry base transports only still-wet pigment contributions', () => {
  const fixed = { id: 'dry-base', strokes: [horizontal()], at: 0, water: 0, dryAfter: 0, concentration: .9 };
  const moist = { id: 'moist', strokes: [horizontal()], at: 3, water: 1, dryAfter: 2, concentration: .35 };
  const crossing = { id: 'crossing', strokes: [vertical()], at: 3.4, water: 1, dryAfter: 2, concentration: .15, mode: 'wet-mix' };
  const fixedOnly = frame(createInkProcessDocument([fixed], settings));
  const upperOnly = frame(createInkProcessDocument([moist, crossing], settings));
  const together = frame(createInkProcessDocument([fixed, moist, crossing], settings));
  const upperGlazed = frame(createInkProcessDocument([moist, { ...crossing, mode: 'glaze' }], settings));
  assert.notDeepEqual(upperOnly.density, upperGlazed.density);
  for (let i = 0; i < together.density.length; i++) {
    assert.ok(Math.abs(together.density[i] - fixedOnly.density[i] - upperOnly.density[i]) < 6e-7);
  }
  assert.ok(Math.abs(sum(together.density) - sum(fixedOnly.density) - sum(upperOnly.density)) < 1e-4);
});

test('exchanged pigment retains its layer drying deadline at later wet events', () => {
  const old = { id: 'old', strokes: [horizontal()], concentration: .8, water: 1, at: 0, dryAfter: 1 };
  const waterBeforeDry = { id: 'first-water', strokes: [vertical()], concentration: 0, water: 1, at: .4, dryAfter: .2, mode: 'wet-mix' };
  const lateWater = { id: 'late-water', strokes: [horizontal()], concentration: 0, water: 1, at: 3, dryAfter: 2 };
  const lateCross = { id: 'late-cross', strokes: [vertical()], concentration: 0, water: 1, at: 3.4, dryAfter: 2, mode: 'wet-mix' };
  const before = frame(createInkProcessDocument([old, waterBeforeDry], settings));
  const after = frame(createInkProcessDocument([old, waterBeforeDry, lateWater, lateCross], settings));
  assert.equal(before.interactions, 1);
  assert.equal(after.interactions, 2);
  assert.deepEqual(after.density, before.density);
});

test('layer time is an absolute event, repeatable under out-of-order seeks', () => {
  const document = createInkProcessDocument(layers(), settings);
  const full = frame(document), partial = frame(document, { time: .2 }), before = frame(document, { time: -1 });
  assert.equal(full.activeLayers, 2);
  assert.equal(partial.activeLayers, 1);
  assert.equal(before.activeLayers, 0);
  assert.ok(before.density.every(value => value === 0));
  for (const time of [10, .1, -.5, .4, 1, .2, 10]) {
    const snapshot = frame(document, { time });
    if (time === .2) assert.deepEqual(snapshot, partial);
    if (time >= .4) assert.deepEqual(snapshot, full);
  }
  assert.deepEqual(frame(document, { time: 1000 }), full, 'waiting after the final event does not invent fluid evolution');
});

test('zero pressure and clipping remain genuine contact constraints', () => {
  const noContact = createInkProcessDocument([{ id: 'zero', strokes: [{ ...horizontal(),
    points: horizontal().points.map(point => ({ ...point, pressure: 0 })) }] }], settings);
  assert.ok(frame(noContact).density.every(value => value === 0));
  const clipped = createInkProcessDocument([{ id: 'clipped', strokes: [source('clip', [[10, 50], [150, 50]], {
    clip: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 90 }, { x: 10, y: 90 }],
  })] }], settings);
  const raster = frame(clipped);
  assert.ok(sum(raster.density) > 0);
  for (let y = 0; y < raster.rows; y++) for (let x = 40; x < raster.columns; x++) assert.equal(raster.density[y * raster.columns + x], 0);
});

test('empty inputs validate all program options and remain replayable', () => {
  const empty = createInkProcessDocument([], settings);
  assert.deepEqual(compileInkProcessRecipe(JSON.parse(JSON.stringify(empty.recipe))), empty.result);
  assert.equal(frame(empty).activeLayers, 0);
  assert.ok(frame(empty).density.every(value => value === 0));
  for (const options of [{ ...settings, width: 0 }, { ...settings, height: NaN }, { ...settings, ink: '#000' },
    { ...settings, background: 'white' }, { ...settings, seed: .5 }, { ...settings, passes: 3 }]) {
    assert.throws(() => createInkProcessDocument([], options));
  }
});

test('invalid source fields, versions, timing, identities and raster limits are rejected', () => {
  const document = createInkProcessDocument(layers(), settings);
  for (const patch of [{ version: 2 }, { generator: 'unknown' }, { future: true }]) {
    assert.throws(() => compileInkProcessRecipe({ ...document.recipe, ...patch }));
  }
  assert.throws(() => reviseInkProcessDocument({ ...document, version: 2 }, {}));
  assert.throws(() => reviseInkProcessDocument(document, { future: 1 }));
  for (const option of ['ink', 'start', 'duration', 'nib', 'brush']) {
    const stroke = horizontal(); stroke.options[option] = option === 'ink' ? '#000000' : 0;
    assert.throws(() => createInkProcessDocument([{ id: 'one', strokes: [stroke] }], settings));
  }
  for (const field of ['concentration', 'water', 'at', 'dryAfter']) assert.throws(() =>
    createInkProcessDocument([{ id: 'one', strokes: [], [field]: -1 }], settings));
  assert.throws(() => createInkProcessDocument([{ id: 'x', strokes: [] }, { id: 'x', strokes: [] }], settings));
  assert.throws(() => createInkProcessDocument([{ id: 'x', strokes: [horizontal(), horizontal()] }], settings));
  assert.throws(() => createInkProcessDocument([...layers()].reverse(), settings));
  assert.throws(() => createInkProcessDocument([{ id: 'one', strokes: [source('bad', [[0, 0], [NaN, 1]])] }], settings));
  assert.throws(() => createInkProcessDocument([{ id: 'one', strokes: [{ ...horizontal(), options: { controls: [{ at: .5, mystery: 1 }] } }] }], settings));
  assert.throws(() => rasterizeInkProcess({ ...document.result, version: 2 }));
  assert.throws(() => frame(document, { time: Infinity }));
  assert.throws(() => frame(document, { cellSize: 0 }));
  assert.throws(() => frame(document, { cellSize: .001 }));
  const missingConcentration = structuredClone(document.result); delete missingConcentration.layers[0].concentration;
  assert.throws(() => rasterizeInkProcess(missingConcentration));
  const wrongTime = structuredClone(document.result); wrongTime.layers[0].marks[0].duration = 1;
  assert.throws(() => rasterizeInkProcess(wrongTime));
  for (const field of ['version', 'width', 'height', 'seed', 'background', 'ink', 'layers']) {
    const missing = structuredClone(document.result); delete missing[field];
    assert.throws(() => rasterizeInkProcess(missing), `compiled process requires ${field}`);
  }
  for (const field of ['id', 'marks', 'concentration', 'water', 'at', 'dryAfter', 'mode']) {
    const missing = structuredClone(document.result); delete missing.layers[0][field];
    assert.throws(() => rasterizeInkProcess(missing), `compiled layer requires ${field}`);
  }
  for (const field of ['kind', 'id', 'points', 'width', 'ink', 'opacity', 'dryness', 'nib', 'tipAngle', 'seed', 'start', 'duration']) {
    const missing = structuredClone(document.result); delete missing.layers[0].marks[0][field];
    assert.throws(() => rasterizeInkProcess(missing), `compiled mark requires ${field}`);
  }
});

test('capacity limits bound layer, stroke, source point and raster allocation', () => {
  assert.throws(() => createInkProcessDocument(Array.from({ length: 33 }, (_, i) => ({ id: `layer-${i}`, strokes: [] })), settings));
  assert.throws(() => createInkProcessDocument([{ id: 'many', strokes: Array.from({ length: 513 }, (_, i) => source(`s${i}`, [[0, 0], [2, 2]])) }], settings));
  assert.throws(() => createInkProcessDocument([{ id: 'long', strokes: [source('too-many', Array.from({ length: 4097 }, (_, i) => [i, 0]))] }], settings));
  const frame = rasterizeInkProcess(createInkProcessDocument([], { width: 1024, height: 1024 }).result);
  assert.equal(frame.density.length, 262144);
  const tiny = rasterizeInkProcess(createInkProcessDocument([], { width: Number.MIN_VALUE, height: 1 }).result,
    { cellSize: Number.MAX_VALUE });
  assert.equal(tiny.columns, 1);
  assert.equal(tiny.rows, 1);
  assert.equal(tiny.density.length, 1);
});
