import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRockForm, createRockDocument, compileRockRecipe, reviseRockDocument,
  createRockMacro, createStrokeGroupDocument, sampleBrushContact, pointInPolygon } from '../dist/index.js';

const scene = { width: 360, height: 330, seed: 71, idPrefix: 'stone' };
const rect = (x, y, width, height) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const clone = value => JSON.parse(JSON.stringify(value));
const frozen = value => {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(frozen);
  }
};
const structure = () => ({
  outline: rect(20, 20, 280, 280),
  ridges: [{ id: 'upper-fold', points: [{ x: 30, y: 55, pressure: .3 }, { x: 160, y: 32, pressure: .8 }, { x: 285, y: 68, pressure: 0 }] }],
  faces: [
    { id: 'left', region: rect(30, 65, 120, 220), tone: 'middle',
      flow: [{ x: 82, y: 72 }, { x: 90, y: 175 }, { x: 80, y: 280 }],
      fractures: [{ id: 'scar', points: [{ x: 55, y: 95, pressure: .2 }, { x: 113, y: 160, pressure: .8 }, { x: 78, y: 230, pressure: 0 }] }] },
    { id: 'right', region: rect(165, 65, 125, 220), tone: 'dark',
      flow: [{ x: 180, y: 85 }, { x: 221, y: 170 }, { x: 270, y: 278 }], fractures: [] },
  ],
});
const facePrefix = id => `${scene.idPrefix.length}:${scene.idPrefix}/face/${id.length}:${id}`;
const belongsToFace = (group, id) => group.id === facePrefix(id) || group.id.startsWith(facePrefix(id) + '/');
const faceGroups = (doc, id) => doc.groups.filter(group => belongsToFace(group, id));
const textureGroup = (doc, id) => doc.groups.find(group => group.id === facePrefix(id));
function pointsOf(form) {
  return [...form.outline, ...form.ridges.flatMap(line => line.points), ...form.faces.flatMap(face => [
    ...face.region, ...face.flow, ...(face.fractures ?? []).flatMap(line => line.points), ...(face.reserves ?? []).flat(),
  ])];
}
function extent(points) {
  return { width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) };
}

test('structured rocks own frozen intent and ordinary source, with exact browser-free JSON reconstruction', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const technique of ['axe', 'jiesuo']) {
    const authored = structure(), options = { ...scene, technique, structure: authored };
    const doc = createRockDocument(options);
    frozen(doc);
    assert.deepEqual(compileRockRecipe(clone(doc.recipe)), doc.result);
    const { idPrefix, ...renderOptions } = scene;
    assert.deepEqual(createStrokeGroupDocument(clone(doc.groups), renderOptions).result, doc.result);
    assert.deepEqual(createRockDocument(options), doc);
    authored.faces[0].flow[0].x = -700; authored.faces[0].fractures[0].points[0].y = -800; options.seed = 2;
    assert.equal(doc.recipe.structure.faces[0].flow[0].x, 82);
    assert.equal(doc.recipe.structure.faces[0].fractures[0].points[0].y, 95);
    assert.equal(doc.recipe.options.seed, 71);
    assert.ok(!Object.hasOwn(doc.recipe.options, 'pose'));
    assert.ok(!Object.hasOwn(doc.recipe.options, 'size'));
  }
});

test('automatic poses create distinct coherent forms and placement transports all structural guides', () => {
  const forms = ['upright', 'reclining', 'leaning'].map(pose => createRockForm({ pose, seed: 83, size: 200, position: { x: 40, y: 30 } }));
  const tall = extent(forms[0].outline), low = extent(forms[1].outline);
  assert.ok(tall.height > tall.width * 1.2);
  assert.ok(low.width > low.height * 1.5);
  assert.notDeepEqual(forms[0], forms[2]);
  for (const form of forms) {
    frozen(form);
    assert.equal(form.faces.length, 3);
    assert.ok(form.faces.every(face => face.region.every(p => pointInPolygon(p, form.outline))));
    // Flow paths describe a direction field and may sit beyond a face edge;
    // the owned face polygons, rather than these guides, bound ink contacts.
    assert.ok(form.faces.every(face => face.flow.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
    assert.deepEqual(createRockDocument({ ...scene, technique: 'axe', structure: clone(form) }).recipe.structure, form);
  }
  const flowTall = extent(forms[0].faces.flatMap(face => face.flow)), flowLow = extent(forms[1].faces.flatMap(face => face.flow));
  assert.ok(flowTall.height > flowLow.height * 1.4, 'reclining pose must transport direction guides as well as the outline');
  for (const pose of ['upright', 'reclining', 'leaning']) {
    const original = createRockForm({ pose, seed: 83, size: 100, position: { x: 10, y: 20 } });
    const moved = createRockForm({ pose, seed: 83, size: 200, position: { x: 45, y: 60 } });
    const a = pointsOf(original), b = pointsOf(moved);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.ok(Math.abs(b[i].x - (45 + 2 * (a[i].x - 10))) < 1e-10);
      assert.ok(Math.abs(b[i].y - (60 + 2 * (a[i].y - 20))) < 1e-10);
      assert.equal(b[i].pressure, a[i].pressure);
    }
  }
  assert.notDeepEqual(createRockForm({ seed: 84 }), createRockForm({ seed: 83 }));
});

test('axe and jiesuo preserve the caller form but execute different texture geometry and contact widths', () => {
  const authored = structure();
  const axe = createRockDocument({ ...scene, technique: 'axe', structure: authored });
  const jiesuo = createRockDocument({ ...scene, technique: 'jiesuo', structure: authored });
  assert.deepEqual(axe.recipe.structure, jiesuo.recipe.structure);
  assert.deepEqual(axe.groups.filter(group => group.id.endsWith('/base') || group.id.endsWith('/bones')),
    jiesuo.groups.filter(group => group.id.endsWith('/base') || group.id.endsWith('/bones')));
  const a = textureGroup(axe, 'right').strokes, b = textureGroup(jiesuo, 'right').strokes;
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(a.map(stroke => stroke.options.width)) > mean(b.map(stroke => stroke.options.width)) * 2);
  assert.notDeepEqual(a.map(stroke => stroke.points), b.map(stroke => stroke.points));
  for (const stroke of [...a, ...b]) assert.equal(stroke.points.at(-1).pressure, 0);
});

test('editing, adding and reordering one face preserves every unrelated group and compiled material identity', () => {
  for (const technique of ['axe', 'jiesuo']) {
    const doc = createRockDocument({ ...scene, technique, structure: structure() });
    const editedSource = clone(doc.recipe.structure);
    editedSource.faces[0].flow = [{ x: 40, y: 125 }, { x: 85, y: 140 }, { x: 145, y: 132 }];
    const edited = reviseRockDocument(doc, { structure: editedSource });
    assert.notDeepEqual(faceGroups(edited, 'left'), faceGroups(doc, 'left'));
    assert.deepEqual(faceGroups(edited, 'right'), faceGroups(doc, 'right'));
    assert.deepEqual(edited.groups[0], doc.groups[0]);
    const rightGroupIds = new Set(faceGroups(doc, 'right').map(group => group.id));
    const rightMark = mark => [...rightGroupIds].some(id => mark.id.startsWith(`${id.length}:${id}/`));
    assert.deepEqual(edited.result.marks.filter(rightMark), doc.result.marks.filter(rightMark));
    const addedSource = clone(edited.recipe.structure);
    addedSource.faces.unshift({ id: 'back/addition', region: rect(175, 35, 110, 22), tone: 'light',
      flow: [{ x: 180, y: 40 }, { x: 280, y: 50 }] });
    const added = reviseRockDocument(edited, { structure: addedSource });
    assert.ok(faceGroups(added, 'back/addition').length > 0);
    const byId = new Map(added.groups.map(group => [group.id, group]));
    for (const group of edited.groups) assert.deepEqual(byId.get(group.id), group);
    const marks = new Map(added.result.marks.map(mark => [mark.id, mark]));
    for (const mark of edited.result.marks) assert.deepEqual(marks.get(mark.id), mark);
    addedSource.faces.reverse();
    const reordered = reviseRockDocument(added, { structure: addedSource });
    const reorderedGroups = new Map(reordered.groups.map(group => [group.id, group]));
    const reorderedMarks = new Map(reordered.result.marks.map(mark => [mark.id, mark]));
    for (const group of added.groups) assert.deepEqual(reorderedGroups.get(group.id), group);
    for (const mark of added.result.marks) assert.deepEqual(reorderedMarks.get(mark.id), mark);
  }
});

test('caller flow guides redirect actual texture paths, rather than only metadata or base washes', () => {
  const region = rect(25, 25, 270, 270), authored = { outline: region, ridges: [], faces: [
    { id: 'field', region, tone: 'dark', flow: [{ x: 160, y: 30 }, { x: 160, y: 290 }], fractures: [] },
  ] };
  for (const technique of ['axe', 'jiesuo']) {
    const vertical = createRockDocument({ ...scene, technique, structure: authored });
    const horizontalSource = clone(authored); horizontalSource.faces[0].flow = [{ x: 30, y: 160 }, { x: 290, y: 160 }];
    const horizontal = createRockDocument({ ...scene, technique, structure: horizontalSource });
    const directions = doc => textureGroup(doc, 'field').strokes.map(stroke => {
      const a = stroke.points[0], b = stroke.points.at(-1), length = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    });
    const a = directions(vertical), b = directions(horizontal);
    assert.ok(a.length >= 6 && b.length >= 6);
    assert.ok(a.reduce((sum, p) => sum + p.y, 0) / a.length > .7);
    assert.ok(b.reduce((sum, p) => sum + p.x, 0) / b.length > .7);
  }
});

// A circular bound around each sampled contact is conservative: if even this
// bound misses the paper opening, its cross-section and end footprint miss it.
function reachesOpening(sample, opening) {
  if (sample.halfWidth <= 1e-9) return false;
  const x = Math.max(opening.left, Math.min(opening.right, sample.centerX));
  const y = Math.max(opening.top, Math.min(opening.bottom, sample.centerY));
  return Math.hypot(sample.centerX - x, sample.centerY - y) < sample.halfWidth;
}
test('reserves remain actual paper openings through base ink, fractures and texture without white overpainting', () => {
  const region = rect(25, 25, 270, 270), opening = { left: 122, right: 178, top: 124, bottom: 182 };
  const authored = { outline: region, ridges: [], faces: [{ id: 'field', region, tone: 'dark',
    flow: [{ x: 150, y: 35 }, { x: 150, y: 155 }, { x: 150, y: 285 }],
    fractures: [{ id: 'crossing', points: [{ x: 45, y: 153, pressure: .4 }, { x: 150, y: 153, pressure: .9 }, { x: 280, y: 153, pressure: 0 }] }],
  }] };
  for (const technique of ['axe', 'jiesuo']) {
    const plain = createRockDocument({ ...scene, technique, structure: authored });
    const contacts = mark => sampleBrushContact(mark, { spacing: .6 });
    assert.ok(plain.result.marks.filter(mark => mark.id.includes('/base/')).some(mark => contacts(mark).some(p => reachesOpening(p, opening))), 'the unreserved base actually crosses the opening');
    assert.ok(plain.result.marks.filter(mark => mark.id.includes('/clefts/')).some(mark => contacts(mark).some(p => reachesOpening(p, opening))), 'the unreserved cleft actually crosses the opening');
    const reserved = clone(authored); reserved.faces[0].reserves = [rect(opening.left, opening.top, opening.right - opening.left, opening.bottom - opening.top)];
    const guarded = createRockDocument({ ...scene, technique, structure: reserved });
    assert.ok(guarded.result.marks.length > 2);
    for (const mark of guarded.result.marks) {
      assert.equal(mark.ink, '#252820');
      assert.ok(contacts(mark).every(p => !reachesOpening(p, opening)), `actual contact reaches the opening: ${mark.id}`);
    }
  }
});

test('a fully reserved rock returns an empty replayable scene and the macro adds no moss or dangling references', () => {
  const outline = rect(25, 25, 270, 270);
  const authored = { outline, ridges: [], faces: [{ id: 'field', region: outline, tone: 'dark',
    flow: [{ x: 150, y: 35 }, { x: 150, y: 155 }, { x: 150, y: 285 }],
    fractures: [{ id: 'crossing', points: [{ x: 45, y: 153, pressure: .4 }, { x: 150, y: 153, pressure: .9 }, { x: 280, y: 153, pressure: 0 }] }],
    reserves: [rect(15, 15, 290, 290)],
  }] };
  for (const technique of ['axe', 'jiesuo']) {
    const doc = createRockDocument({ ...scene, technique, structure: authored });
    assert.deepEqual(doc.groups, []);
    assert.deepEqual(doc.result.marks, []);
    assert.deepEqual(compileRockRecipe(clone(doc.recipe)), doc.result);
    const macro = createRockMacro({ id: 'blank', construction: 'structured-v1', technique, structure: authored, seed: 71 });
    assert.deepEqual(macro.groups, []);
    assert.deepEqual(macro.attachments, []);
    assert.ok(macro.groups.every(group => !group.parentId || macro.groups.some(parent => parent.id === group.parentId)));
    assert.ok(macro.attachments.every(attachment => macro.groups.some(group => group.id === attachment.groupId)));
    assert.deepEqual(createStrokeGroupDocument(clone(macro.groups), { width: scene.width, height: scene.height, seed: 71 }).result.marks, []);
  }
});

test('ordinary rock source permits one-stroke edits while preserving every unrelated compiled mark', () => {
  const doc = createRockDocument({ ...scene, technique: 'jiesuo', structure: structure() });
  const groups = clone(doc.groups), edited = groups.find(group => group.id === facePrefix('right')).strokes[0];
  edited.points = edited.points.map(p => ({ ...p, x: p.x + 5 }));
  const { idPrefix, ...renderOptions } = scene;
  const revised = createStrokeGroupDocument(groups, renderOptions);
  const changes = doc.result.marks.filter((mark, index) => JSON.stringify(mark) !== JSON.stringify(revised.result.marks[index]));
  assert.equal(changes.length, 1);
  assert.ok(changes[0].id.includes(facePrefix('right')));
  assert.deepEqual(compileRockRecipe(doc.recipe), doc.result);
});

test('execution styling and revision use owned semantic source instead of stale playback', () => {
  const doc = createRockDocument({ ...scene, technique: 'axe', structure: structure() });
  const styled = reviseRockDocument({ ...doc, groups: [], result: { width: 1, height: 1, marks: [] } }, { options: { opacity: .5, dryness: .82 } });
  assert.deepEqual(styled.recipe.structure, doc.recipe.structure);
  assert.equal(styled.result.marks.length, doc.result.marks.length);
  for (let i = 0; i < doc.result.marks.length; i++) {
    assert.equal(styled.result.marks[i].opacity, doc.result.marks[i].opacity * .5);
    assert.equal(styled.result.marks[i].dryness, .82);
  }
  const silent = reviseRockDocument(doc, { options: { opacity: 0 } });
  assert.ok(silent.result.marks.every(mark => mark.opacity === 0));
  assert.notDeepEqual(reviseRockDocument(doc, { options: { technique: 'jiesuo' } }).result, doc.result);
});

test('work is bounded for many faces and all generation runs without ambient randomness', () => {
  const authored = structure(), template = authored.faces[1];
  authored.faces = Array.from({ length: 8 }, (_, i) => ({ ...clone(template), id: 'face-' + i }));
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('ambient randomness used'); };
    for (const technique of ['axe', 'jiesuo']) {
      const doc = createRockDocument({ ...scene, technique, detail: 3, structure: authored });
      const texture = doc.groups.filter(group => authored.faces.some(face => group.id === facePrefix(face.id)));
      assert.ok(texture.reduce((sum, group) => sum + group.strokes.length, 0) <= 200);
      assert.ok(doc.groups.reduce((sum, group) => sum + group.strokes.length, 0) <= 512);
      assert.ok(doc.result.marks.every(mark => mark.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
    }
    assert.ok(createRockForm({ pose: 'leaning', seed: 19 }).faces.length > 0);
    assert.ok(createRockMacro({ construction: 'structured-v1', technique: 'axe', moss: false }).groups.length > 0);
  } finally { Math.random = random; }
});

test('invalid layouts, structures, work budgets and incompatible authoring sources fail explicitly', () => {
  for (const options of [{ pose: 'flat' }, { size: 0 }, { size: Infinity }, { size: Number.MIN_VALUE }, { seed: .2 }, { seed: Infinity }, { position: { x: 0, y: NaN } }, { future: true }])
    assert.throws(() => createRockForm(options));
  for (const patch of [{ width: 0 }, { height: Infinity }, { technique: 'pima' }, { detail: 0 }, { detail: 4 }, { detail: 1.5 }, { idPrefix: '' }, { seed: Number.MAX_SAFE_INTEGER + 1 }, { opacity: 2 }, { ink: 'black' }, { unknown: true }])
    assert.throws(() => createRockDocument({ ...scene, technique: 'axe', ...patch }));
  const mutations = [
    source => { source.faces = []; }, source => { source.faces = Array.from({ length: 9 }, (_, i) => ({ ...source.faces[0], id: String(i) })); },
    source => { source.faces[1].id = source.faces[0].id; }, source => { source.faces[0].tone = 'black'; },
    source => { source.faces[0].flow = [{ x: 50, y: 60 }, { x: 50, y: 60 }]; },
    source => { source.faces[0].flow[0].x = Infinity; }, source => { source.faces[0].flow = Array(513).fill({ x: 30, y: 30 }); },
    source => { source.faces[0].region = rect(5, 5, 100, 100); },
    source => { source.faces[0].region = [{ x: 30, y: 40 }, { x: 50, y: 40 }, { x: 70, y: 40 }]; },
    source => { source.faces[0].reserves = Array(9).fill(rect(40, 40, 10, 10)); },
    source => { source.faces[0].fractures = Array.from({ length: 9 }, (_, i) => ({ ...source.faces[0].fractures[0], id: String(i) })); },
    source => { source.ridges = Array.from({ length: 33 }, (_, i) => ({ ...source.ridges[0], id: String(i) })); },
    source => { source.outline = Array(129).fill({ x: 30, y: 30 }); }, source => { source.faces[0].hidden = true; },
  ];
  for (const mutate of mutations) { const source = structure(); mutate(source); assert.throws(() => createRockDocument({ ...scene, technique: 'axe', structure: source })); }
  for (const layout of [{ pose: 'upright' }, { size: 100 }, { position: { x: 0, y: 0 } }])
    assert.throws(() => createRockDocument({ ...scene, technique: 'axe', structure: structure(), ...layout }), /structure|layout/);
  const concave = { outline: [{ x: 20, y: 20 }, { x: 300, y: 20 }, { x: 300, y: 300 }, { x: 210, y: 300 }, { x: 210, y: 110 }, { x: 110, y: 110 }, { x: 110, y: 300 }, { x: 20, y: 300 }], ridges: [],
    faces: [{ id: 'bridge', tone: 'middle', region: [{ x: 50, y: 200 }, { x: 270, y: 200 }, { x: 160, y: 50 }], flow: [{ x: 60, y: 60 }, { x: 70, y: 90 }] }] };
  assert.throws(() => createRockDocument({ ...scene, technique: 'axe', structure: concave }), /outline|inside/);
});

test('recipes and revisions reject unsupported versions or execution fields rather than silently migrating', () => {
  const doc = createRockDocument({ ...scene, technique: 'axe', structure: structure() });
  for (const patch of [{ version: 2 }, { generator: 'rock-v2' }, { hidden: true }]) assert.throws(() => compileRockRecipe({ ...doc.recipe, ...patch }));
  assert.throws(() => reviseRockDocument({ ...doc, version: 2 }, {}));
  assert.throws(() => reviseRockDocument(doc, { pose: 'leaning' }));
  assert.throws(() => reviseRockDocument(doc, { options: { pose: 'leaning' } }));
  assert.throws(() => reviseRockDocument(doc, { options: { detail: 8 } }));
});

test('the opt-in macro supports automatic and authored forms while legacy default output stays pinned', () => {
  // Digests obtained by independently compiling b6c96a5e94124bfad8113aaa136ede2298151b5f
  // into an external temporary directory before adding the structured-rock path.
  const snapshots = [
    [{}, 'cd5c0e078a27b6792b22cc6488de33ffb107e43b0da384d87aff8f7c0b98f20a'],
    [{ id: 'legacy', seed: 441, size: 172, position: { x: 19, y: 31 }, textureCount: 17, mossCount: 9 }, 'e96ba216d7b65b42cf65f74627d78d2de9e3acb9fe584f01985d522f5fc8dd8f'],
  ];
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const [options, expected] of snapshots) assert.equal(digest(createRockMacro(options)), expected);
  for (const technique of ['axe', 'jiesuo']) {
    const options = { id: 'stone', seed: 71, ink: '#252820', construction: 'structured-v1', technique, size: 180, position: { x: 40, y: 35 }, pose: 'reclining', moss: false };
    const macro = createRockMacro(options);
    frozen(macro);
    assert.deepEqual(createRockMacro(options), macro);
    assert.ok(!macro.groups.some(group => group.id.endsWith('/moss')));
    const raw = structure(), authored = createRockMacro({ id: 'stone', seed: 71, ink: '#252820', construction: 'structured-v1', technique, structure: raw, moss: false });
    assert.deepEqual(authored.groups, createRockDocument({ ...scene, technique, structure: raw }).groups);
    raw.faces[0].flow[0].x = -500;
    assert.ok(authored.groups.every(group => group.strokes.every(stroke => stroke.points.every(p => p.x > 0))));
    assert.ok(macro.attachments.every(attachment => macro.groups.some(group => group.id === attachment.groupId)));
  }
  for (const option of [{ technique: 'axe' }, { pose: 'upright' }, { detail: 1 }, { structure: structure() }]) assert.throws(() => createRockMacro(option), /construction/);
  for (const legacy of [{ outline: rect(0, 0, 10, 10) }, { region: rect(0, 0, 10, 10) }, { ridges: [] }, { textureCount: 0 }, { flow: () => ({ x: 0, y: 1 }) }])
    assert.throws(() => createRockMacro({ construction: 'structured-v1', ...legacy }), /structure/);
  assert.throws(() => createRockMacro({ construction: 'structured-v2' }));
  for (const source of [false, 0, '']) assert.throws(() => createRockMacro({ construction: 'structured-v1', structure: source }));
  assert.throws(() => createRockMacro({ construction: 'structured-v1', structure: structure(), pose: 'upright' }), /structure|layout/);
});
