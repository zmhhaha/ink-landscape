import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaterProcessDocument, compileWaterProcessRecipe, reviseWaterProcessDocument } from '../dist/water-process.js';
import { rasterizeInkProcess } from '../dist/ink-process.js';

const settings = { width: 160, height: 100, seed: 261123 };
const stroke = (id = 'line', extra = {}) => ({
  points: [{ x: 15, y: 51, pressure: 0 }, { x: 38, y: 46, pressure: .9 },
    { x: 110, y: 54, pressure: .9 }, { x: 145, y: 49, pressure: 0 }],
  options: { id, width: 36, dryness: .15, smoothing: 'catmull-rom', ...extra },
});
const ink = (extra = {}) => ({ kind: 'ink', id: 'ink', strokes: [stroke()], concentration: .75,
  water: .95, at: 0, dryAfter: 2, ...extra });
const water = (extra = {}) => ({ kind: 'water', id: 'clear',
  droplets: [{ id: 'left', x: 64, y: 42, radius: 20 }, { id: 'right', x: 99, y: 53, radius: 16 }],
  at: .4, ...extra });
const frame = (document, options) => rasterizeInkProcess(document.result, options);
const sum = values => values.reduce((total, value) => total + value, 0);
const byId = marks => new Map(marks.map(mark => [mark.id, mark]));

test('water document owns sparse authored contacts and droplets without browser globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const path = stroke('water-path');
  path.options.clip = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 95 }, { x: 0, y: 95 }];
  path.options.controls = [{ at: .5, pressure: .7 }];
  const source = [{ kind: 'ink', id: 'i', strokes: [stroke()] },
    { kind: 'water', id: 'w', strokes: [path], droplets: [{ id: 'd', x: 65, y: 50, radius: 20 }] }];
  const expected = structuredClone(source), document = createWaterProcessDocument(source, settings);
  assert.deepEqual(document.recipe.events, expected);
  assert.equal(document.recipe.events[1].water, undefined);
  assert.equal(document.result.layers[0].mode, 'wet-mix');
  assert.equal(document.result.layers[0].water, .5);
  assert.equal(document.result.layers[1].concentration, 0);
  assert.equal(document.result.layers[1].water, 1);
  assert.equal(document.result.layers[1].dryAfter, 2);
  source[1].droplets[0].x = -500;
  source[1].strokes[0].points[0].x = -500;
  source[1].strokes[0].options.controls[0].pressure = 0;
  source[1].strokes[0].options.clip[0].x = -500;
  assert.deepEqual(document.recipe.events, expected);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
  assert.throws(() => { document.recipe.events[1].droplets[0].radius = 0; }, TypeError);
});

test('water-only events have zero pigment and never paint or erase paper', () => {
  const document = createWaterProcessDocument([water({ at: 0 }), water({ id: 'next', at: .4 })], settings);
  for (const time of [-1, 0, .2, .4, 8]) assert.ok(frame(document, { time }).density.every(value => value === 0));
  assert.ok(document.result.layers.every(layer => layer.concentration === 0));
  const empty = createWaterProcessDocument([], settings);
  assert.equal(frame(empty).activeLayers, 0);
  assert.deepEqual(compileWaterProcessRecipe(JSON.parse(JSON.stringify(empty.recipe))), empty.result);
});

test('prewet contacts remain invisible until ink arrives and change only the incoming wet ink', () => {
  const prewet = water({ at: 0 }), incoming = ink({ at: .4 });
  const document = createWaterProcessDocument([prewet, incoming], settings);
  assert.ok(frame(document, { time: .2 }).density.every(value => value === 0));
  const after = frame(document), unexchanged = frame(createWaterProcessDocument([prewet, { ...incoming, mode: 'glaze' }], settings));
  const dryPaper = frame(createWaterProcessDocument([incoming], settings));
  assert.equal(after.interactions, 1);
  assert.notDeepEqual(after.density, unexchanged.density);
  assert.deepEqual(unexchanged.density, dryPaper.density);
  assert.ok(Math.abs(sum(after.density) - sum(dryPaper.density)) < sum(dryPaper.density) * 2e-6);
});

test('water after wet ink redistributes finite nonnegative pigment instead of erasing it', () => {
  const document = createWaterProcessDocument([ink(), water()], settings);
  const initial = frame(document, { time: 0 }), after = frame(document);
  assert.equal(after.activeLayers, 2);
  assert.equal(after.interactions, 1);
  assert.notDeepEqual(after.density, initial.density);
  assert.ok(after.density.every(value => Number.isFinite(value) && value >= 0));
  assert.ok(Math.abs(sum(after.density) - sum(initial.density)) < sum(initial.density) * 2e-6);
  let remoteInk = 0, changed = 0;
  for (let y = 0; y < after.rows; y++) for (let x = 0; x < after.columns; x++) {
    const i = y * after.columns + x;
    if (initial.density[i] !== after.density[i]) changed++;
    if ((x + .5) * after.cellSize < 32 || (x + .5) * after.cellSize > 128) {
      assert.equal(after.density[i], initial.density[i]);
      if (initial.density[i] > 0) remoteInk++;
    }
  }
  assert.ok(changed > 10);
  assert.ok(remoteInk > 10, 'locality comparison includes existing remote pigment');
});

test('wet straight contacts reach nearby paper with uneven capillary fronts while conserving pigment', () => {
  const contact = { points: [{ x: 15, y: 50, pressure: 1 }, { x: 145, y: 50, pressure: 1 }],
    options: { id: 'straight', seed: 2, width: 24, dryness: 0, axis: 'center', smoothing: 'linear' } };
  const events = [{ kind: 'ink', id: 'ink', strokes: [contact], concentration: .7, water: 1, dryAfter: 2 },
    { kind: 'water', id: 'clear', strokes: [{ ...contact, options: { ...contact.options, width: 48 } }], water: 1, at: .1 }];
  const document = createWaterProcessDocument(events, { width: 160, height: 100, seed: 55 });
  const saved = JSON.stringify(document);
  for (const cellSize of [1, 2]) {
    const before = frame(document, { time: 0, cellSize }), after = frame(document, { time: 8, cellSize });
    const front = [];
    let newlyReached = 0;
    for (let x = Math.ceil(35 / cellSize); x < Math.floor(125 / cellSize); x++) {
      let top = after.height;
      for (let y = 0; y < after.rows; y++) {
        const i = y * after.columns + x;
        if (before.density[i] === 0 && after.density[i] > .0001) newlyReached++;
        if (after.density[i] > .003) top = Math.min(top, (y + .5) * cellSize);
        assert.ok(Number.isFinite(after.density[i]) && after.density[i] >= 0);
        if ((y + .5) * cellSize < 28 || (y + .5) * cellSize > 72) assert.equal(after.density[i], 0,
          'local exchange never paints remote paper');
      }
      front.push(top);
    }
    assert.ok(newlyReached > 20, 'pigment reaches previously untouched nearby paper');
    assert.ok(new Set(front).size > 1, 'a straight authored contact does not produce one uniform blur frontier');
    assert.ok(Math.abs(sum(after.density) - sum(before.density)) < sum(before.density) * 2e-6);
    assert.deepEqual(frame(JSON.parse(saved), { time: 8, cellSize }), after);
  }
  assert.equal(JSON.stringify(document), saved);
});

test('finite water events collect existing pigment in broken margin segments without a uniform dark ring', () => {
  const events = [{ kind: 'ink', id: 'ink', strokes: [{
    points: [{ x: 5, y: 60, pressure: 1 }, { x: 155, y: 60, pressure: 1 }],
    options: { id: 'wide', seed: 77, width: 82, dryness: 0, axis: 'center', smoothing: 'linear' },
  }], concentration: .45, water: 1, dryAfter: 2 },
  { kind: 'water', id: 'clear', droplets: [{ id: 'a', x: 80, y: 60, radius: 23 }], water: 1, at: .1 }];
  const document = createWaterProcessDocument(events, { width: 160, height: 120, seed: 261123 });
  for (const cellSize of [1, 2]) {
    const before = frame(document, { time: 0, cellSize }), after = frame(document, { time: 8, cellSize });
    const peaks = Array(24).fill(0);
    let marginGain = 0, interiorLoss = 0;
    for (let y = 0; y < after.rows; y++) for (let x = 0; x < after.columns; x++) {
      const i = y * after.columns + x, dx = (x + .5) * cellSize - 80, dy = (y + .5) * cellSize - 60;
      const radius = Math.hypot(dx, dy), delta = after.density[i] - before.density[i];
      if (radius > 16 && radius < 30) {
        const sector = Math.floor((Math.atan2(dy, dx) + Math.PI) * 24 / (Math.PI * 2)) % 24;
        peaks[sector] = Math.max(peaks[sector], delta);
        marginGain += Math.max(0, delta);
      }
      if (radius < 15) interiorLoss += Math.max(0, -delta);
      assert.ok(Number.isFinite(after.density[i]) && after.density[i] >= 0);
    }
    assert.ok(marginGain > 5 && interiorLoss > 1, 'a darkened margin is supplied by redistribution of existing interior pigment');
    assert.ok(Math.max(...peaks) > .20, 'selected margin sections collect a visible amount of optical density');
    assert.ok(Math.min(...peaks) < Math.max(...peaks) * .45, 'the same contact retains weaker breaks between heavy deposits');
    assert.ok(peaks.filter(value => value > .20).length < peaks.length / 2, 'heavy accumulation does not outline the entire contact');
    assert.ok(Math.abs(sum(after.density) - sum(before.density)) < sum(before.density) * 2e-6);
    assert.deepEqual(frame(document, { time: 1000, cellSize }), after, 'waiting does not invent evaporation or a second deposition event');
    assert.deepEqual(frame(JSON.parse(JSON.stringify(document)), { time: 8, cellSize }), after);
  }
});

test('a disconnected water stroke cannot redirect deposits at an existing distant droplet', () => {
  const source = [ink(), water()], original = createWaterProcessDocument(source, settings);
  const distant = { points: [{ x: 145, y: 2, pressure: 1 }, { x: 151, y: 2, pressure: 1 }],
    options: { id: 'remote-direction', width: 1, dryness: 0, axis: 'center', smoothing: 'linear' } };
  const revised = createWaterProcessDocument([source[0], { ...source[1], strokes: [distant] }], settings);
  const a = frame(original, { cellSize: 1 }), b = frame(revised, { cellSize: 1 });
  let existingPigment = 0;
  for (let y = 20; y < 80; y++) for (let x = 35; x < 125; x++) {
    const i = y * a.columns + x;
    assert.equal(a.density[i], b.density[i]);
    if (a.density[i] > 0) existingPigment++;
  }
  assert.ok(existingPigment > 100);
});

test('later water does not revive or erase already dry pigment', () => {
  const events = [ink({ dryAfter: .2 }), water({ at: .4 }),
    water({ id: 'another-water', at: .7 })];
  const document = createWaterProcessDocument(events, settings);
  const initial = frame(document, { time: 0 }), after = frame(document);
  assert.deepEqual(after.density, initial.density);
  assert.ok(sum(initial.density) > 0);
});

test('zero water, expired prewet and nonmeeting contacts disable pigment exchange', () => {
  const baseline = frame(createWaterProcessDocument([ink()], settings));
  const cases = [
    [ink(), water({ water: 0 })],
    [ink({ water: 0 }), water()],
    [ink(), water({ droplets: [{ id: 'far', x: 145, y: 5, radius: 3 }] })],
    [water({ at: 0, dryAfter: .2 }), ink({ at: .4 })],
    [water({ at: 0, water: 0 }), ink({ at: .4 })],
  ];
  for (const events of cases) {
    const actual = frame(createWaterProcessDocument(events, settings));
    assert.equal(actual.interactions, 0);
    assert.deepEqual(actual.density, baseline.density);
  }
});

test('water source JSON recompiles and compiled JSON replays with absolute out-of-order event seeks', () => {
  const document = createWaterProcessDocument([ink(), water()], settings);
  const parsed = JSON.parse(JSON.stringify(document)), before = JSON.stringify(parsed);
  assert.deepEqual(compileWaterProcessRecipe(parsed.recipe), document.result);
  assert.deepEqual(rasterizeInkProcess(parsed.result), frame(document));
  for (const time of [8, -.1, 0, .2, 1, .4, 0, 8]) {
    assert.deepEqual(frame(document, { time }), rasterizeInkProcess(compileWaterProcessRecipe(parsed.recipe), { time }));
  }
  assert.deepEqual(frame(document, { time: 1000 }), frame(document));
  assert.equal(JSON.stringify(parsed), before);
});

test('editing one explicit droplet preserves other sources, contact identities and material seeds', () => {
  const document = createWaterProcessDocument([ink(), water()], settings), original = JSON.stringify(document);
  const revised = reviseWaterProcessDocument(document, { events: document.recipe.events.map(event => event.kind === 'ink' ? event : {
    ...event, droplets: event.droplets.map(drop => drop.id === 'left' ? { ...drop, x: drop.x + 8, radius: drop.radius + 2 } : drop),
  }) });
  assert.deepEqual(revised.recipe.events[0], document.recipe.events[0]);
  assert.deepEqual(revised.result.layers[0], document.result.layers[0]);
  assert.deepEqual(revised.recipe.events[1].droplets[1], document.recipe.events[1].droplets[1]);
  assert.deepEqual(revised.result.layers[1].marks[1], document.result.layers[1].marks[1]);
  assert.notDeepEqual(revised.result.layers[1].marks[0].points, document.result.layers[1].marks[0].points);
  assert.equal(revised.result.layers[1].marks[0].seed, document.result.layers[1].marks[0].seed);
  assert.equal(revised.result.layers[1].marks[0].id, 'clear/drop:left');
  assert.equal(JSON.stringify(document), original);
  assert.deepEqual(reviseWaterProcessDocument({ ...document, result: null }, {}).result, document.result);
  assert.deepEqual(reviseWaterProcessDocument(document, { options: { ink: '#111111' } }).recipe.events, document.recipe.events);
});

test('explicit droplet identity survives reordering and event scopes remain independent', () => {
  const source = water({ at: 0 }), first = createWaterProcessDocument([source], settings);
  const second = createWaterProcessDocument([{ ...source, droplets: [...source.droplets].reverse() }], settings);
  assert.deepEqual(byId(first.result.layers[0].marks), byId(second.result.layers[0].marks));
  assert.deepEqual(frame(first).density, frame(second).density);
  const more = createWaterProcessDocument([source, { ...source, id: 'other', at: .1 }], settings);
  assert.notEqual(more.result.layers[0].marks[0].seed, more.result.layers[1].marks[0].seed);
  const differentSeed = createWaterProcessDocument([source], { ...settings, seed: 10 });
  assert.notEqual(first.result.layers[0].marks[0].seed, differentSeed.result.layers[0].marks[0].seed);
  assert.deepEqual(first.result.layers[0].marks[0].points, differentSeed.result.layers[0].marks[0].points);
});

test('same-time author order is retained while backwards event arrays are rejected', () => {
  const events = [water({ at: 0 }), ink({ at: 0 })], document = createWaterProcessDocument(events, settings);
  assert.deepEqual(document.result.layers.map(layer => layer.id), ['clear', 'ink']);
  const reversed = createWaterProcessDocument([...events].reverse(), settings);
  assert.deepEqual(reversed.result.layers.map(layer => layer.id), ['ink', 'clear']);
  assert.deepEqual(compileWaterProcessRecipe(document.recipe), document.result);
  assert.throws(() => createWaterProcessDocument([water(), ink()], settings));
});

test('event fields, water concentration, malformed droplets and identity collisions are rejected', () => {
  const invalid = [
    { ...water(), concentration: 0 }, { ...water(), unknown: 1 }, { ...ink(), droplets: [] },
    { id: 'missing-kind', strokes: [] }, { ...water(), kind: 'mist' },
    { kind: 'water', id: 'empty' }, { kind: 'water', id: 'empty', strokes: [], droplets: [] },
    { ...water(), strokes: null }, { ...water(), droplets: null }, { ...ink(), strokes: null },
    ...['water', 'at', 'dryAfter', 'mode'].map(key => ({ ...water(), [key]: null })),
    { ...ink(), concentration: null },
  ];
  for (const event of invalid) assert.throws(() => createWaterProcessDocument([event], settings));
  const drop = water().droplets[0];
  for (const bad of [{ ...drop, x: NaN }, { ...drop, y: Infinity }, { ...drop, radius: 0 },
    { ...drop, radius: -1 }, { ...drop, radius: Number.MAX_VALUE }, { ...drop, id: '' },
    { x: 1, y: 1, radius: 2 }, { ...drop, seed: 4 }]) {
    assert.throws(() => createWaterProcessDocument([water({ droplets: [bad] })], settings));
  }
  assert.throws(() => createWaterProcessDocument([water({ droplets: [drop, drop] })], settings));
  assert.throws(() => createWaterProcessDocument([water({ strokes: [stroke('drop:left')] })], settings));
  assert.throws(() => createWaterProcessDocument([water(), water()], settings));
  assert.throws(() => createWaterProcessDocument([ink({ strokes: [stroke('bad', { ink: '#000000' })] })], settings));
});

test('water versions, malformed patches, options and inherited capacity limits are rejected', () => {
  const document = createWaterProcessDocument([ink(), water()], settings);
  for (const patch of [{ version: 2 }, { generator: 'unknown' }, { future: true }, { events: null }, { options: null }]) {
    assert.throws(() => compileWaterProcessRecipe({ ...document.recipe, ...patch }));
  }
  assert.throws(() => reviseWaterProcessDocument({ ...document, version: 2 }, {}));
  assert.throws(() => reviseWaterProcessDocument(document, { layers: [] }));
  assert.throws(() => reviseWaterProcessDocument(document, { options: { future: true } }));
  assert.throws(() => createWaterProcessDocument([], { ...settings, width: 0 }));
  assert.throws(() => createWaterProcessDocument(Array.from({ length: 33 }, (_, i) => ink({ id: `${i}` })), settings));
  assert.throws(() => createWaterProcessDocument([water({ droplets: Array.from({ length: 513 }, (_, i) => ({ id: `${i}`, x: 50, y: 50, radius: 2 })) })], settings));
  const almostFull = water({ droplets: Array.from({ length: 512 }, (_, i) => ({ id: `${i}`, x: 50, y: 50, radius: 2 })) });
  assert.throws(() => createWaterProcessDocument([ink(), almostFull], settings));
});
