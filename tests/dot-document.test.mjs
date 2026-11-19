import test from 'node:test';
import assert from 'node:assert/strict';
import { createDotDocument, compileDotRecipe, reviseDotDocument } from '../dist/dot-document.js';
import { createInkScene } from '../dist/core.js';
import { brushStateAt } from '../dist/brush-state.js';
import { sampleBrushContact } from '../dist/brush-contact.js';

const placements = [
  { x: 30, y: 50, id: 'near', pressure: .7, start: 2 },
  { x: 100, y: 80, id: 'far', shape: 'oblique', size: 30, angle: .2, start: 4 },
];
const defaults = { pressure: 1, side: 0, angle: Math.PI / 2, dryness: .25, inkLoad: 1 };
const byId = result => Object.fromEntries(result.map(mark => [mark.id, mark]));

test('dot documents own sparse caller positions and nested brush settings without a browser', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const positions = structuredClone(placements);
  positions[0].controls = [{ at: .4, side: .8 }];
  const controls = [{ at: .5, dryness: .7 }];
  const clip = [{ x: 0, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 200 }, { x: 0, y: 200 }];
  const expected = structuredClone(positions);
  const document = createDotDocument(positions, { controls, clip, seed: 0 });
  positions[0].x = -999;
  positions[0].controls[0].side = 0;
  controls[0].dryness = 0;
  clip[0].x = -999;
  assert.deepEqual(document.recipe.positions, expected);
  assert.equal(document.recipe.positions[0].shape, undefined, 'default shape does not overwrite sparse source intent');
  assert.equal(document.recipe.options.controls[0].dryness, .7);
  assert.equal(document.recipe.options.clip[0].x, 0);
  assert.equal(document.recipe.options.seed, 0);
  for (const value of [document, document.recipe, document.recipe.positions, document.recipe.positions[0],
    document.recipe.positions[0].controls, document.recipe.positions[0].controls[0], document.recipe.options,
    document.recipe.options.controls, document.recipe.options.controls[0], document.recipe.options.clip,
    document.recipe.options.clip[0], document.documents, document.documents[0], document.result,
    document.result[0], document.result[0].points, document.result[0].points[0],
    document.result[0].brush, document.result[0].brush.controls[0]]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { document.recipe.positions[0].x = 5; }, TypeError);
});

test('dot recipe JSON replay preserves editable contacts and scene playback exactly', () => {
  const document = createDotDocument(placements, {
    axis: 'side', entry: 'concealed', finish: 'return', pressureProfile: 'lift-press',
    turn: 'angular', rhythm: 'hesitant', drag: 'reverse', size: 22, angle: -.3, seed: 719,
    controls: [{ at: .2, pressure: .6 }, { at: .7, side: 0 }], duration: 1,
  });
  const saved = JSON.parse(JSON.stringify(document));
  assert.deepEqual(saved, document);
  assert.deepEqual(compileDotRecipe(saved.recipe), document.result);
  assert.deepEqual(createDotDocument(placements, document.recipe.options), document);
  assert.equal(document.documents.length, placements.length);
  assert.equal(document.documents[0].recipe.generator, 'ink-brush-local-gestures-v1');
  assert.equal(document.result[0], document.documents[0].result);
  const builder = createInkScene({ width: 240, height: 220 });
  for (const mark of saved.result) builder.stroke(mark.points, mark);
  assert.deepEqual(builder.snapshot().marks, document.result);
});

test('source edits only change the selected dot and preserve independent placements', () => {
  const original = createDotDocument(placements, { seed: 21, interval: 2 });
  const positions = original.recipe.positions.map(position => position.id === 'near'
    ? { ...position, x: 55, angle: Math.PI / 2, pressure: .25 } : position);
  const edited = reviseDotDocument(original, { positions });
  assert.deepEqual(edited.result[1], original.result[1]);
  assert.notDeepEqual(edited.result[0].points, original.result[0].points);
  assert.equal(edited.result[0].seed, original.result[0].seed);
  assert.deepEqual(original.recipe.positions, placements);
  const stalePlayback = { ...original, result: [], documents: [] };
  assert.deepEqual(reviseDotDocument(stalePlayback, {}), original, 'revision trusts source rather than saved playback');
  const changedOptions = reviseDotDocument(original, { options: { controls: [{ at: .5, side: 1 }] } });
  assert.deepEqual(changedOptions.recipe.positions, original.recipe.positions);
  assert.deepEqual(changedOptions.recipe.options.controls, [{ at: .5, side: 1 }]);
});

test('explicit IDs preserve material association through movement, reordering and insertion', () => {
  const original = createDotDocument(placements, { seed: 219 });
  const reordered = createDotDocument([...placements].reverse(), original.recipe.options);
  assert.deepEqual(byId(reordered.result), byId(original.result), 'explicit absolute starts preserve timing too');
  const inserted = createDotDocument([{ id: 'new', x: 10, y: 10, start: 0 }, ...placements], original.recipe.options);
  for (const mark of original.result) assert.deepEqual(byId(inserted.result)[mark.id], mark);
  const moved = createDotDocument(placements.map(point => ({ ...point, x: point.x + 20 })), { seed: 219 });
  assert.deepEqual(moved.result.map(mark => mark.seed), original.result.map(mark => mark.seed));
  assert.notEqual(original.result[0].seed, original.result[1].seed);
  const otherSeed = createDotDocument(placements, { seed: 220 });
  assert.notDeepEqual(otherSeed.result.map(mark => mark.seed), original.result.map(mark => mark.seed));
  assert.deepEqual(otherSeed.result.map(mark => mark.points), original.result.map(mark => mark.points), 'default geometry is independent of material seed');
});

test('dot directions, per-placement shapes and additive rotations remain caller controlled', () => {
  const origin = { x: 100, y: 120 };
  const document = createDotDocument(['round', 'horizontal', 'vertical', 'oblique'].map(shape => ({ ...origin, shape })), { size: 24 });
  const deltas = document.documents.map(({ recipe }) => {
    const a = recipe.points[0], b = recipe.points.at(-1);
    assert.deepEqual(a, { ...origin, pressure: 0 });
    return { x: b.x - a.x, y: b.y - a.y };
  });
  assert.ok(deltas[1].x > deltas[0].x * 3);
  assert.ok(Math.abs(deltas[1].y) < 1e-12);
  assert.ok(Math.abs(deltas[2].x) < 1e-12 && deltas[2].y > 30);
  assert.ok(deltas[3].x > 0 && deltas[3].y < 0);
  assert.equal(document.result[0].width, 24);
  assert.equal(document.result[1].width, 24 * .6);
  const a = createDotDocument([{ ...origin, shape: 'vertical', size: 30, angle: -.2 }], { shape: 'round', size: 12, angle: .5 });
  const b = createDotDocument([{ ...origin, shape: 'horizontal', size: 30, angle: Math.PI / 2 + .3 }]);
  for (let i = 0; i < a.result[0].points.length; i++) {
    assert.ok(Math.abs(a.result[0].points[i].x - b.result[0].points[i].x) < 1e-10);
    assert.ok(Math.abs(a.result[0].points[i].y - b.result[0].points[i].y) < 1e-10);
  }
});

test('press-and-lift envelopes preserve supplied pressure including an entirely lifted contact', () => {
  const document = createDotDocument([.2, .7, 1].map((pressure, index) => ({ x: index * 50, y: 20, pressure })));
  for (const [index, mark] of document.result.entries()) {
    assert.equal(mark.points[0].pressure, 0);
    assert.equal(mark.points.at(-1).pressure, 0);
    assert.equal(Math.max(...mark.points.map(point => point.pressure)), [.2, .7, 1][index]);
  }
  const blank = createDotDocument([{ x: 10, y: 10, pressure: 0 }], {
    axis: 'side', entry: 'concealed', finish: 'return', pressureProfile: 'lift-press', turn: 'angular',
    rhythm: 'hesitant', drag: 'reverse', controls: [{ at: .5, pressure: 1, side: 1 }],
  });
  assert.ok(blank.result[0].points.every(point => point.pressure === 0));
});

test('default wide round contacts advance both edges through the same center and side pressure study', () => {
  const controls = [{ at: 0, pressure: .22 }, { at: .45, pressure: .94 }, { at: 1, pressure: .22 }];
  for (const size of [24, 52]) for (const axis of ['center', 'side']) {
    const mark = createDotDocument([{ x: 100, y: 120, pressure: .86 }], { size, axis, controls }).result[0];
    // Use the renderer's actual contact sampling. Short, wide curves must not
    // turn their offset edges back over the preceding ink during this study.
    const samples = sampleBrushContact(mark);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const tx = a.ny + b.ny, ty = -(a.nx + b.nx);
      for (const edge of ['left', 'right']) {
        const advance = (b[`${edge}X`] - a[`${edge}X`]) * tx + (b[`${edge}Y`] - a[`${edge}Y`]) * ty;
        assert.ok(advance >= -mark.width * 1e-9, `${axis} round contact at size ${size} folds its ${edge} edge`);
      }
    }
  }
});

test('per-dot sparse controls replace the program controls and keep every channel independent', () => {
  const positions = [
    { x: 20, y: 20 },
    { x: 80, y: 20, controls: [] },
    { x: 140, y: 20, controls: [{ at: .5, side: 0, pressure: .8 }] },
  ];
  const document = createDotDocument(positions, { axis: 'side', controls: [{ at: .5, pressure: .2, dryness: .9 }] });
  const states = document.result.map(mark => brushStateAt(mark.brush, .5, defaults));
  assert.equal(states[0].pressure, .2);
  assert.equal(states[0].dryness, .9);
  assert.equal(states[0].side, 1);
  assert.equal(states[1].pressure, 1, 'an empty local array clears the program controls');
  assert.equal(states[1].dryness, .25);
  assert.equal(states[2].pressure, .8);
  assert.equal(states[2].side, 0);
  assert.deepEqual(document.documents[1].recipe.options.controls, []);
  assert.deepEqual(document.recipe.positions, positions);
});

test('absolute timing, duration, default IDs and clips stay explicit and serializable', () => {
  const clip = [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 120 }, { x: 0, y: 120 }];
  const document = createDotDocument([{ x: 20, y: 20 }, { x: 80, y: 20, start: 8 }, { x: 140, y: 20 }], {
    idPrefix: 'moss', interval: .5, start: 2, duration: 1.5, clip, ink: '#102020', opacity: .6, dryness: .8,
  });
  assert.deepEqual(document.result.map(mark => mark.id), ['moss-1', 'moss-2', 'moss-3']);
  assert.deepEqual(document.result.map(mark => mark.start), [2, 8, 3]);
  assert.deepEqual(document.result.map(mark => mark.duration), [1.5, 1.5, 1.5]);
  assert.ok(document.result.every(mark => mark.ink === '#102020' && mark.opacity === .6 && mark.dryness === .8));
  assert.deepEqual(document.result[0].clip, clip);
  const defaults = createDotDocument([{ x: 0, y: 0 }]).recipe.options;
  assert.equal(defaults.shape, 'round');
  assert.equal(defaults.size, 24);
  assert.equal(defaults.angle, 0);
  assert.equal(defaults.idPrefix, 'dot');
  assert.equal(defaults.interval, 0);
  assert.equal(defaults.seed, 1);
});

test('empty groups validate common settings and source versions fail explicitly', () => {
  const document = createDotDocument([], { seed: -1 });
  assert.deepEqual(document.result, []);
  assert.deepEqual(document.documents, []);
  assert.equal(document.recipe.options.seed, 0xffffffff);
  assert.deepEqual(compileDotRecipe(JSON.parse(JSON.stringify(document.recipe))), []);
  for (const options of [{ size: 0 }, { angle: NaN }, { axis: 'flat' }, { seed: .1 }, { interval: -1 },
    { duration: -1 }, { controls: [{ at: .5, pressure: 2 }] }, { controls: [{ at: .5, mystery: 1 }] },
    { controls: Array.from({ length: 128 }, (_, i) => ({ at: (i + 1) / 129 })) },
    { clip: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }]) {
    assert.throws(() => createDotDocument([], options));
  }
  for (const recipe of [null, { ...document.recipe, version: 2 }, { ...document.recipe, generator: 'ink-dot-contact-v2' }]) {
    assert.throws(() => compileDotRecipe(recipe), /version/);
  }
  assert.throws(() => compileDotRecipe({ ...document.recipe, extra: true }), /field/);
  assert.throws(() => compileDotRecipe({ ...document.recipe, options: undefined }), /object/);
  assert.throws(() => reviseDotDocument({ ...document, version: 2 }, {}), /document version/);
  assert.throws(() => reviseDotDocument(document, null), /patch/);
  assert.throws(() => reviseDotDocument(document, { point: [] }), /patch/);
  assert.throws(() => reviseDotDocument(document, { positions: null }), /positions/);
  assert.throws(() => reviseDotDocument(document, { options: { width: 10 } }), /field/);
});

test('invalid positions, duplicate identities, unsupported fields and overflowing timings cannot enter recipes', () => {
  for (const position of [null, [], { x: Infinity, y: 0 }, { x: 0, y: NaN }, { x: 0, y: 0, pressure: -1 },
    { x: 0, y: 0, pressure: 2 }, { x: 0, y: 0, pressure: null }, { x: 0, y: 0, size: 0 },
    { x: 0, y: 0, angle: Infinity }, { x: 0, y: 0, start: -1 }, { x: 0, y: 0, id: ' ' },
    { x: 0, y: 0, shape: 'cluster' }, { x: 0, y: 0, width: 20 }, { x: 0, y: 0, controls: [{ at: .5, random: 1 }] }]) {
    assert.throws(() => createDotDocument([position]));
  }
  for (const options of [null, [], { size: Infinity }, { shape: 'pepper' }, { angle: null }, { idPrefix: '' },
    { interval: Infinity }, { width: 10 }, { id: 'fixed' }, { nib: 'flat' }, { smoothing: 'linear' },
    { gestureModel: 'legacy' }, { brush: { version: 1, controls: [] } }, { controls: 'bad' }, { seed: .2 }]) {
    assert.throws(() => createDotDocument([{ x: 0, y: 0 }], options));
  }
  assert.throws(() => createDotDocument([{ x: 0, y: 0, id: 'same' }, { x: 20, y: 20, id: 'same' }]), /Duplicate/);
  assert.throws(() => createDotDocument([{ x: 0, y: 0, id: 'dot-2' }, { x: 20, y: 20 }]), /Duplicate/);
  assert.throws(() => createDotDocument(Array.from({ length: 2049 }, () => ({ x: 0, y: 0 }))), /2048/);
  assert.throws(() => createDotDocument([{}, {}, {}].map(() => ({ x: 0, y: 0 })), { interval: Number.MAX_VALUE }), /start/);
  assert.throws(() => createDotDocument([{ x: 0, y: 0, start: Number.MAX_VALUE }], { duration: Number.MAX_VALUE }), /finite/);
  assert.throws(() => createDotDocument([{ x: 0, y: 0, angle: Number.MAX_VALUE }], { angle: Number.MAX_VALUE }), /angle/);
});
