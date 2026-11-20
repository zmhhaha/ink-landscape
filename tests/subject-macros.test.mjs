import test from 'node:test';
import assert from 'node:assert/strict';
import { createTreeMacro, createRockMacro, createBirdMacro,
  createStrokeGroupDocument, compileStrokeGroupRecipe, reviseStrokeGroupDocument } from '../dist/index.js';

const scene = { width: 600, height: 500, seed: 152 };
const frozen = value => {
  if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
};
test('subject macros produce owned ordinary source, deterministic geometry and exact recipe replay in Node', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const create of [createTreeMacro, createRockMacro, createBirdMacro]) {
    const macro = create({ id: 'subject', seed: 382 });
    assert.deepEqual(create({ id: 'subject', seed: 382 }), macro);
    assert.notDeepEqual(create({ id: 'subject', seed: 383 }), macro);
    frozen(macro);
    const doc = createStrokeGroupDocument(JSON.parse(JSON.stringify(macro.groups)), scene);
    assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(doc.recipe))), doc.result);
  }
});

test('recursive tree joints are actual shared interpolation anchors and widths decrease toward zero-pressure tips', () => {
  const tree = createTreeMacro({ id: 'oak', start: { x: 250, y: 460 }, size: 150, width: 15, depth: 4, seed: 43 });
  const byId = new Map(tree.groups.map(g => [g.id, g]));
  for (const group of tree.groups) {
    const body = group.strokes.find(s => s.id === 'body');
    assert.equal(body.points.at(-1).pressure, 0);
    if (group.parentId) {
      const parent = byId.get(group.parentId).strokes.find(s => s.id === 'body');
      assert.ok(body.options.width < parent.options.width);
      const childRoot = body.points[0];
      assert.ok(parent.points.some(p => p.x === childRoot.x && p.y === childRoot.y), 'a smooth parent must pass through its child root');
    }
  }
  assert.equal(tree.attachments.length, tree.groups.length * 2);
  assert.ok(tree.groups.some(g => g.strokes.some(s => s.id === 'joint')));
  assert.ok(tree.groups.some(g => !g.strokes.some(s => s.id === 'joint')), 'knots do not stamp every node');
});

test('caller branch graphs retain their shape, own their data and attach by whole-path translation', () => {
  const branches = [
    { id: 'child', parentId: 'trunk', attachAt: .5, width: 3, points: [{ x: 70, y: 50, pressure: .6 }, { x: 90, y: 20, pressure: .4 }, { x: 105, y: 2, pressure: .2 }] },
    { id: 'trunk', width: 10, points: [{ x: 0, y: 100, pressure: .9 }, { x: 0, y: 0, pressure: .1 }] },
  ];
  const macro = createTreeMacro({ id: 'authored', seed: 41, branches });
  const trunk = macro.groups.find(g => g.id.endsWith('/branch/trunk')).strokes[0];
  const child = macro.groups.find(g => g.id.endsWith('/branch/child')).strokes[0];
  assert.deepEqual(child.points[0], { x: 0, y: 50, pressure: .6 });
  assert.deepEqual(child.points[1], { x: 20, y: 20, pressure: .4 });
  assert.deepEqual(child.points[2], { x: 35, y: 2, pressure: 0 });
  assert.ok(trunk.points.some(p => p.x === 0 && p.y === 50));
  branches[0].points[0].x = -50;
  assert.equal(child.points[0].x, 0);
  assert.deepEqual(createTreeMacro({ id: 'authored', seed: 41, branches: [branches[1], { ...branches[0], points: [{ x: 70, y: 50, pressure: .6 }, { x: 90, y: 20, pressure: .4 }, { x: 105, y: 2, pressure: .2 }] }] }), macro);
});

test('rock macros honor authored bones, region clips and direction fields while keeping sparse moss separate', () => {
  const outline = [{ x: 30, y: 20 }, { x: 180, y: 30 }, { x: 170, y: 170 }, { x: 20, y: 160 }];
  const region = [{ x: 80, y: 40 }, { x: 160, y: 40 }, { x: 160, y: 150 }, { x: 80, y: 150 }];
  const ridge = { id: 'broken', points: [{ x: 70, y: 22, pressure: .5 }, { x: 115, y: 75, pressure: .8 }, { x: 80, y: 145, pressure: 0 }] };
  const original = structuredClone({ outline, region, ridge });
  const rock = createRockMacro({ id: 'stone', seed: 9, outline, region, ridges: [ridge], textureCount: 12, mossCount: 7, flow: () => ({ x: 0, y: 1 }) });
  assert.equal(rock.groups[0].id, '5:stone/bones');
  assert.deepEqual(rock.groups[0].strokes.find(s => s.id === 'ridge/broken').points, original.ridge.points);
  const texture = rock.groups.find(g => g.id.endsWith('/texture'));
  assert.ok(texture.strokes.length > 0 && texture.strokes.length <= 12);
  for (const stroke of texture.strokes) {
    assert.deepEqual(stroke.options.clip, original.region);
    assert.equal(stroke.points.at(-1).x, stroke.points[0].x);
    assert.ok(stroke.points.at(-1).y > stroke.points[0].y);
  }
  assert.equal(rock.groups.find(g => g.id.endsWith('/moss')).strokes.length, 7);
  region[0].x = -999; ridge.points[0].x = -999;
  assert.deepEqual(texture.strokes[0].options.clip, original.region);
  assert.deepEqual(rock.groups[0].strokes[1].points, original.ridge.points);
});

test('bird macros retain separate components and an explicit perch, with caller-owned part overrides', () => {
  const custom = [{ id: 'own-wing', points: [{ x: 42, y: 25, pressure: .4 }, { x: 70, y: 30, pressure: .7 }], options: { width: 8, dryness: .85 } }];
  const macro = createBirdMacro({ id: 'crow', seed: 7, attachment: { point: { x: 230, y: 140 }, tangent: { x: 2, y: 1 } }, parts: { wing: custom } });
  const wing = macro.groups.find(g => g.id === '4:crow/wing').strokes[0];
  assert.deepEqual(wing.points, custom[0].points);
  assert.equal(wing.options.width, 8);
  assert.deepEqual(macro.attachments[0].point, { x: 230, y: 140 });
  const feet = macro.groups.find(g => g.id === '4:crow/feet');
  assert.ok(feet.strokes.some(s => s.points.some(p => p.x === 230 && p.y === 140)));
  assert.deepEqual(macro.groups.map(g => g.id.split('/').at(-1)), ['tail', 'back', 'wing', 'head', 'beak', 'feet', 'eye']);
  custom[0].points[0].x = -999; custom[0].options.width = 90;
  assert.equal(wing.points[0].x, 42); assert.equal(wing.options.width, 8);
  const noEye = createBirdMacro({ parts: { eye: [] } });
  assert.ok(!noEye.groups.some(g => g.id.endsWith('/eye')));
});

test('composing other subjects preserves existing identities and a single source edit leaves unrelated marks unchanged', () => {
  const bird = createBirdMacro({ id: 'perched', seed: 2 }), rock = createRockMacro({ id: 'ledge', seed: 2 });
  const original = createStrokeGroupDocument(bird.groups, scene);
  const combined = createStrokeGroupDocument([...rock.groups, ...bird.groups], scene);
  const marks = new Map(combined.result.marks.map(m => [m.id, m]));
  for (const mark of original.result.marks) assert.deepEqual(marks.get(mark.id), mark);
  const groups = structuredClone(combined.recipe.groups);
  groups.find(g => g.id === '7:perched/tail').strokes[0].points.at(-1).x += 10;
  const edited = reviseStrokeGroupDocument(combined, { groups });
  const changed = combined.result.marks.flatMap((mark, index) => JSON.stringify(mark) === JSON.stringify(edited.result.marks[index]) ? [] : [mark.id]);
  assert.equal(changed.length, 1);
  assert.ok(changed[0].includes('7:perched/tail'));
});

test('macro budgets and malformed graph, region and attachment inputs fail before unbounded generation', () => {
  const largest = createTreeMacro({ depth: 6 });
  assert.equal(largest.groups.length, 127);
  assert.ok(largest.groups.reduce((n, g) => n + g.strokes.length, 0) <= 512);
  for (const options of [{ depth: 7 }, { depth: 1.5 }, { size: Infinity }, { seed: .4 }, { branches: Array(128).fill({}) }]) assert.throws(() => createTreeMacro(options));
  const path = [{ x: 0, y: 0 }, { x: 1, y: 2 }];
  assert.throws(() => createTreeMacro({ branches: [{ id: 'a', points: path, parentId: 'b' }, { id: 'b', points: path, parentId: 'a' }] }), /acyclic/);
  assert.throws(() => createTreeMacro({ branches: [{ id: 'a', width: 2, points: path }, { id: 'b', width: 3, points: path, parentId: 'a' }] }), /smaller/);
  assert.throws(() => createRockMacro({ textureCount: 97 }), /textureCount/);
  assert.throws(() => createRockMacro({ outline: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }), /area/);
  assert.throws(() => createRockMacro({ flow: () => ({ x: 0, y: 0 }) }), /nonzero/);
  assert.throws(() => createBirdMacro({ attachment: { point: { x: 0, y: 0 }, tangent: { x: 0, y: 0 } } }), /nonzero/);
  assert.throws(() => createBirdMacro({ parts: { wing: Array(65).fill({}) } }), /64/);
  assert.throws(() => createBirdMacro({ parts: { wing: [{ id: 'a', points: path, hidden: true }] } }), /Unsupported/);
  assert.throws(() => createTreeMacro({ future: true }), /Unsupported/);
});
