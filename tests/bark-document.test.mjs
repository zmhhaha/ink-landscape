import test from 'node:test';
import assert from 'node:assert/strict';
import { createBarkDocument, compileBarkRecipe, reviseBarkDocument,
  createStrokeGroupDocument, compileStrokeGroupRecipe, sampleBrushContact } from '../dist/index.js';

const options = { width: 360, height: 300, seed: 71, idPrefix: 'study' };
const branch = () => ({
  id: 'trunk', points: [{ x: 150, y: 270, pressure: .5 }, { x: 130, y: 140, pressure: .9 }, { x: 180, y: 25, pressure: .25 }],
  width: [{ at: 0, width: 52 }, { at: .65, width: 38 }, { at: 1, width: 17 }],
  knots: [{ id: 'wound', at: .57, side: 1, count: 9 }, { id: 'hollow', at: .24, side: -1, kind: 'cavity', count: 7 }],
  junctions: [{ id: 'child', at: .58, side: 1, span: .1 }],
});
const freezeCheck = value => {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) freezeCheck(child);
  }
};

test('bark owns editable authoring source and ordinary groups, with exact Node JSON reconstruction', () => {
  assert.equal(typeof document, 'undefined');
  const input = [branch()], style = { ...options };
  const doc = createBarkDocument(input, style);
  freezeCheck(doc);
  assert.deepEqual(compileBarkRecipe(JSON.parse(JSON.stringify(doc.recipe))), doc.result);
  const { idPrefix, ...sceneOptions } = options;
  const groups = createStrokeGroupDocument(JSON.parse(JSON.stringify(doc.groups)), sceneOptions);
  assert.deepEqual(compileStrokeGroupRecipe(groups.recipe), doc.result);
  assert.deepEqual(createBarkDocument([branch()], options), doc);
  input[0].points[0].x = -200; input[0].knots[0].at = .8; style.seed = 5;
  assert.equal(doc.recipe.branches[0].points[0].x, 150);
  assert.equal(doc.recipe.branches[0].knots[0].at, .57);
  assert.equal(doc.recipe.options.seed, 71);
});

test('explicit branch-side junctions preserve real zero-pressure openings in contour source', () => {
  const input = { id: 'line', points: [{ x: 90, y: 250 }, { x: 90, y: 50 }], width: 40,
    junctions: [{ id: 'join', at: .5, side: 1, span: .18 }] };
  const doc = createBarkDocument([input], options), contours = doc.groups[0].strokes;
  const plus = contours.find(s => s.id === 'plus-edge'), minus = contours.find(s => s.id === 'minus-edge');
  const opening = points => points.filter(p => p.y >= 132 && p.y <= 168);
  assert.ok(opening(plus.points).length > 6);
  assert.ok(opening(plus.points).every(p => p.pressure === 0));
  assert.ok(opening(minus.points).some(p => p.pressure > .4));
  assert.ok(plus.points.some(p => p.y < 125 && p.pressure > 0));
  assert.ok(plus.points.some(p => p.y > 175 && p.pressure > 0));
  const compiled = doc.result.marks.find(mark => mark.id.endsWith('/9:plus-edge'));
  const actualOpening = sampleBrushContact(compiled, { spacing: 1 }).filter(p => p.y >= 140 && p.y <= 160);
  assert.ok(actualOpening.length > 10);
  assert.ok(actualOpening.every(p => p.halfWidth === 0));
  const disabled = createBarkDocument([{ ...input, junctions: [{ ...input.junctions[0], span: 0 }] }], options);
  const absent = createBarkDocument([{ ...input, junctions: [] }], options);
  assert.deepEqual(disabled.groups, absent.groups);
});

test('moving or inserting one knot keeps all unrelated generated groups and material identities', () => {
  const original = createBarkDocument([branch()], options);
  const moved = structuredClone(original.recipe.branches);
  moved[0].knots[0].at = .75;
  const edited = reviseBarkDocument(original, { branches: moved });
  const changed = original.groups.filter((g, i) => JSON.stringify(g) !== JSON.stringify(edited.groups[i]));
  assert.deepEqual(changed.map(g => g.id), ['5:study/5:trunk/knot/5:wound']);
  moved[0].knots.unshift({ id: 'new', at: .12, count: 4 });
  const inserted = createBarkDocument(moved, options);
  const byId = new Map(inserted.groups.map(g => [g.id, g]));
  for (const group of edited.groups) assert.deepEqual(byId.get(group.id), group);
  const marks = new Map(inserted.result.marks.map(mark => [mark.id, mark]));
  for (const mark of edited.result.marks) assert.deepEqual(marks.get(mark.id), mark);
});

test('local width and branch direction control knot scale and transform every source mark', () => {
  const input = branch(), doc = createBarkDocument([input], options);
  const transformed = structuredClone(input);
  transformed.points = transformed.points.map(p => ({ ...p, x: 60 - p.y * 2, y: 30 + p.x * 2 }));
  transformed.width = transformed.width.map(control => ({ ...control, width: control.width * 2 }));
  const rotated = createBarkDocument([transformed], options);
  for (let i = 0; i < doc.groups.length; i++) for (let j = 0; j < doc.groups[i].strokes.length; j++) {
    const a = doc.groups[i].strokes[j], b = rotated.groups[i].strokes[j];
    assert.ok(Math.abs(b.options.width - a.options.width * 2) < 1e-10);
    assert.equal(a.points.length, b.points.length);
    for (let k = 0; k < a.points.length; k++) {
      assert.ok(Math.abs(b.points[k].x - (60 - a.points[k].y * 2)) < 1e-10);
      assert.ok(Math.abs(b.points[k].y - (30 + a.points[k].x * 2)) < 1e-10);
      assert.ok(Math.abs(b.points[k].pressure - a.points[k].pressure) < 1e-10);
    }
  }
});

test('authored edges remain on their supplied paths and the open cavity has no white paint', () => {
  const input = { id: 'authored', points: [{ x: 100, y: 250 }, { x: 100, y: 20 }], width: 65,
    leftEdge: [{ x: 73, y: 250, pressure: 0 }, { x: 73, y: 20, pressure: 0 }], rightEdge: [{ x: 138, y: 250 }, { x: 138, y: 20 }],
    knots: [{ id: 'opening', at: .5, offset: 0, kind: 'cavity', size: .8, count: 9 }] };
  const doc = createBarkDocument([input], options);
  assert.ok(doc.groups[0].strokes[0].points.every(p => Math.abs(p.x - 73) < 1e-10));
  assert.ok(doc.groups[0].strokes[0].points.every(p => p.pressure === 0));
  assert.ok(doc.groups[0].strokes[1].points.every(p => Math.abs(p.x - 138) < 1e-10));
  const lightCenter = { ...input, points: input.points.map(p => ({ ...p, pressure: .25 })) };
  const light = createBarkDocument([lightCenter], options);
  for (let i = 0; i < doc.groups[0].strokes[1].points.length; i++) {
    assert.ok(Math.abs(light.groups[0].strokes[1].points[i].pressure - doc.groups[0].strokes[1].points[i].pressure * .25) < 1e-10);
  }
  const pressedEdges = { ...input, rightEdge: input.rightEdge.map(p => ({ ...p, pressure: .7 })) };
  const explicit = createBarkDocument([pressedEdges], options);
  const explicitWithLightCenter = createBarkDocument([{ ...pressedEdges, points: lightCenter.points }], options);
  assert.deepEqual(explicit.groups[0], explicitWithLightCenter.groups[0]);
  const cavity = doc.groups[1];
  assert.ok(cavity.strokes.every(s => s.options.clip.length > 100));
  assert.ok(cavity.strokes.every(s => s.options.ink !== '#ffffff' && s.options.ink !== '#f5f2e9'));
  assert.ok(cavity.strokes.every(s => s.points.every(p => Math.hypot(p.x - 100, p.y - 135) > 4)));
  for (const mark of doc.result.marks.filter(mark => mark.id.includes('/knot/'))) {
    assert.ok(sampleBrushContact(mark).every(p => Math.hypot(p.centerX - 100, p.centerY - 135) > p.halfWidth));
  }
  for (const size of [.1, .3, .8, 2]) for (const seed of [1, 71, 992]) {
    const variant = createBarkDocument([{ ...input, knots: [{ ...input.knots[0], size, count: 20 }] }], { ...options, seed });
    for (const mark of variant.result.marks.filter(mark => mark.id.includes('/knot/'))) {
      assert.ok(sampleBrushContact(mark, { spacing: .3 }).every(p =>
        Math.hypot(p.centerX - 100, p.centerY - 135) > p.halfWidth), `clear cavity center at size ${size}, seed ${seed}`);
    }
  }
});

test('a narrow authored width change remains an actual contour interpolation anchor', () => {
  const doc = createBarkDocument([{ id: 'line', points: [{ x: 100, y: 250 }, { x: 100, y: 50 }],
    width: [{ at: 0, width: 20 }, { at: .501, width: 80 }, { at: .502, width: 20 }, { at: 1, width: 20 }] }], options);
  const edge = doc.groups[0].strokes.find(s => s.id === 'plus-edge');
  assert.ok(Math.abs(edge.options.width - 4.8) < 1e-10);
  assert.ok(edge.points.some(p => Math.abs(p.y - 149.8) < 1e-10 && p.x > 139));
});

test('common opacity, dryness and contour width controls affect the generated ordinary marks', () => {
  const original = createBarkDocument([branch()], options);
  const silent = createBarkDocument([branch()], { ...options, opacity: 0 });
  assert.ok(silent.result.marks.every(mark => mark.opacity === 0));
  const styled = createBarkDocument([branch()], { ...options, opacity: .5, dryness: .2, strokeWidth: 2.4 });
  for (let i = 0; i < original.result.marks.length; i++) {
    assert.equal(styled.result.marks[i].opacity, original.result.marks[i].opacity * .5);
    assert.equal(styled.result.marks[i].dryness, .2);
  }
  assert.ok(styled.groups[0].strokes.every(stroke => stroke.options.width === 2.4));
  for (let i = 1; i < original.groups.length; i++) for (let j = 0; j < original.groups[i].strokes.length; j++) {
    assert.equal(styled.groups[i].strokes[j].options.width, original.groups[i].strokes[j].options.width);
    assert.deepEqual(styled.groups[i].strokes[j].points, original.groups[i].strokes[j].points);
  }
});

test('bark validates all source graphs, controls and finite work budgets before generation', () => {
  const line = { id: 'line', points: [{ x: 0, y: 100 }, { x: 20, y: 0 }], width: 10 };
  const rejects = [
    [], Array.from({ length: 17 }, (_, i) => ({ ...line, id: String(i) })),
    [line, line], [{ ...line, points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }],
    [{ ...line, width: 0 }], [{ ...line, width: [{ at: .8, width: 5 }, { at: .2, width: 10 }] }],
    [{ ...line, knots: [{ id: 'a', at: NaN }] }], [{ ...line, knots: [{ id: 'a', at: .3, count: 1 }] }],
    [{ ...line, knots: [{ id: 'a', at: .3, count: 2.5 }] }],
    [{ ...line, knots: [{ id: 'a', at: .3, kind: 'rock' }] }],
    [{ ...line, knots: [{ id: 'a', at: .3 }, { id: 'a', at: .5 }] }],
    [{ ...line, junctions: [{ id: 'a', at: .3, side: 0, span: .2 }] }],
    [{ ...line, knots: Array.from({ length: 24 }, (_, i) => ({ id: String(i), at: .5, count: 20 })) }],
  ];
  for (const source of rejects) assert.throws(() => createBarkDocument(source, options));
  for (const extra of [{ textureStrength: 2 }, { contourWidth: 0 }, { seed: .5 }, { width: Infinity }, { unknown: 1 }])
    assert.throws(() => createBarkDocument([line], { ...options, ...extra }));
  const doc = createBarkDocument([line], options);
  assert.throws(() => compileBarkRecipe({ ...doc.recipe, generator: 'unknown' }));
  assert.throws(() => reviseBarkDocument(doc, { hidden: true }));
  assert.throws(() => reviseBarkDocument({ ...doc, recipe: { ...doc.recipe, version: 8 } }, {}));
});
