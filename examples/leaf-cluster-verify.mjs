import {
  renderCanvas, createVegetationDocument, reviseVegetationDocument, compileVegetationRecipe, sampleBrushContact,
} from '../dist/index.js';
import { makeLeafClusterStudies, editLeafCluster, leafClusterInputs, leafClusterSize } from './leaf-cluster-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const groups = document => document.recipe.units.filter(unit => unit.role !== 'structure');
const structures = document => document.recipe.units.filter(unit => unit.role === 'structure');
const markId = (unit, stroke) => `${unit.id.length}:${unit.id}/${stroke.id.length}:${stroke.id}`;
const close = (a, b) => Math.abs(a - b) < 1e-9;
const sourceLength = stroke => stroke.points.slice(1).reduce((sum, point, i) => sum
  + Math.hypot(point.x - stroke.points[i].x, point.y - stroke.points[i].y), 0);
const growthAligned = (document, unit) => {
  const root = unit.strokes[0].points[0];
  const parent = structures(document).flatMap(branch => branch.strokes).find(stroke => stroke.points.some(point =>
    Math.hypot(point.x - root.x, point.y - root.y) < 1e-8));
  if (!parent) return false;
  const index = parent.points.findIndex(point => Math.hypot(point.x - root.x, point.y - root.y) < 1e-8);
  const before = parent.points[Math.max(0, index - 1)], after = parent.points[Math.min(parent.points.length - 1, index + 1)];
  const dx = after.x - before.x, dy = after.y - before.y;
  return unit.strokes.every(stroke => {
    const stem = stroke.points[1], tip = stroke.points.at(-1), sx = stem.x - root.x, sy = stem.y - root.y;
    return (sx * dx + sy * dy) / (Math.hypot(sx, sy) * Math.hypot(dx, dy)) > .88
      && (tip.x - root.x) * sx + (tip.y - root.y) * sy > 0;
  });
};
const frontBackOrder = document => {
  const first = document.recipe.units.findIndex(unit => unit.role === 'structure');
  const last = document.recipe.units.findLastIndex(unit => unit.role === 'structure');
  return first > 0 && last < document.recipe.units.length - 1;
};

/** Source, group-edit and pixel checks. Traditional interpretation stays scoped. */
export async function verifyLeafClusterStudies({ seed = leafClusterInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = leafClusterSize.width; canvas.height = leafClusterSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), times = [];
  const capture = (scene, time = 8) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); times.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], organization = [], editing = [];
  try {
    for (const layout of ['slope', 'arc', 'fold']) {
      const studies = makeLeafClusterStudies({ seed, layout });
      for (const study of studies) {
        const pixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), parsed = JSON.parse(saved), recompiled = compileVegetationRecipe(parsed.recipe);
          const complete = capture(variant.document.result), initial = capture(variant.document.result, .1);
          capture(variant.document.result, 5); capture(variant.document.result, .7);
          const afterSeek = capture(variant.document.result), replay = capture(parsed.result), sourceReplay = capture(recompiled); pixels.push(complete);
          results.push({ layout, study: study.id, variant: variant.id,
            sourceRecompileEqual: same(recompiled, parsed.result), savedPixelReplayEqual: pixelsEqual(complete, replay),
            sourcePixelReplayEqual: pixelsEqual(complete, sourceReplay), outOfOrderTimeEqual: pixelsEqual(complete, afterSeek),
            partialChangesPixels: !pixelsEqual(complete, initial),
            oneResultPerSource: recompiled.marks.length === parsed.recipe.units.reduce((sum, unit) => sum + unit.strokes.length, 0),
            fiveStructureSourcesRetained: structures(parsed).length === 5,
            savedBeforeAbsoluteEight: parsed.result.marks.every(mark => mark.start + mark.duration <= 8),
            sharedContactEntry: parsed.recipe.options.technique === 'dot-leaf',
            inputUnchanged: saved === JSON.stringify(variant.document) });
        }
        pairs.push({ layout, study: study.id,
          firstSecondDiffer: !pixelsEqual(pixels[0], pixels[1]), secondThirdDiffer: !pixelsEqual(pixels[1], pixels[2]) });
        const [a, b, c] = study.variants.map(variant => variant.document);
        const ids = document => groups(document).map(unit => unit.id);
        const paths = document => groups(document).map(unit => unit.strokes.map(stroke => stroke.points));
        const attached = document => groups(document).every(unit => structures(document).some(branch => branch.strokes.some(stroke =>
          stroke.points.some(point => close(point.x, unit.strokes[0].points[0].x) && close(point.y, unit.strokes[0].points[0].y)))));
        const common = { layout, study: study.id,
          structureSourcesUnchanged: same(structures(a), structures(b)) && same(structures(b), structures(c)),
          clusterIdentitiesPreserved: same(ids(a), ids(b)) && same(ids(b), ids(c)),
          authoredGroupsRemainEditable: [a, b, c].every(document => groups(document).length === 9 && groups(document).every(unit => unit.strokes.length >= 2)),
          repeatedPlacementReplaced: !same(paths(a), paths(b)),
          attachedBasesUseAuthoredBranchVertices: attached(b) && attached(c),
          stemsFollowParentTangentsAndGrowOutward: [b, c].every(document => groups(document).every(unit => growthAligned(document, unit))),
          memberRootsStayNearSharedBranchBase: [b, c].every(document => groups(document).every(unit => {
            const base = unit.strokes[0].points[0];
            return unit.strokes.every(stroke => Math.hypot(stroke.points[0].x - base.x, stroke.points[0].y - base.y) < 3.5);
          })),
          variableGroupMembers: new Set(groups(c).map(unit => unit.strokes.length)).size >= 3,
          widthAndToneVaried: new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.width))).size >= 4
            && new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.opacity))).size >= 3,
          threeProjectionInkLoadsSaved: new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.controls[0].inkLoad))).size === 3,
          rearGroupsBeforeBranchesFrontGroupsAfter: frontBackOrder(c),
        };
        if (study.id === 'jie') organization.push({ ...common,
          centerContactExplicit: groups(b).every(unit => unit.strokes.every(stroke => stroke.options.axis === 'center'
            && stroke.options.controls.every(control => control.side <= .12))),
          selectedCountsAreAuthorChoices: groups(b).every(unit => unit.strokes.length === 4)
            && groups(c).some(unit => unit.strokes.length === 3) && groups(c).some(unit => unit.strokes.length === 5),
          mainStrokeLongerThanSides: [b, c].every(document => groups(document).every(unit => unit.strokes.slice(1)
            .every(stroke => sourceLength(stroke) < sourceLength(unit.strokes[0])))),
          partialScopeRetained: study.limits.includes('部分支持') });
        if (study.id === 'ge') organization.push({ ...common,
          distinctFromJieGuides: !same(paths(b), paths(studies[0].variants[1].document)),
          authoredForwardAxis: groups(b).every(unit => growthAligned(b, unit)),
          selectedCountsAreAuthorChoices: groups(b).every(unit => unit.strokes.length === 3)
            && groups(c).some(unit => unit.strokes.length === 2) && groups(c).some(unit => unit.strokes.length === 4),
          mainStrokeLongerThanSides: [b, c].every(document => groups(document).every(unit => unit.strokes.slice(1)
            .every(stroke => sourceLength(stroke) < sourceLength(unit.strokes[0])))),
          partialScopeRetained: study.limits.includes('部分支持') });
        if (study.id === 'groups') organization.push({ ...common,
          variableTwoThroughSix: new Set(groups(c).map(unit => unit.strokes.length)).size === 5
            && groups(c).some(unit => unit.strokes.length === 2) && groups(c).some(unit => unit.strokes.length === 6),
          sameCountCounterexampleExplicit: groups(a).every(unit => unit.strokes.length === 3),
          noDedicatedHistoricalPreset: c.recipe.options.technique === 'dot-leaf',
          pinNotSubstituted: study.limits.includes('品字点') });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      const original = studies[2].variants[2].document, selected = original.recipe.units.find(unit => unit.id === 'cluster-1');
      const selectedIds = new Set(selected.strokes.map(stroke => markId(selected, stroke))), saved = JSON.stringify(original);
      const dx = 17, rotation = .3, widthScale = 1.2;
      const moved = editLeafCluster(original, selected.id, { dx, rotation, widthScale });
      const revised = moved.recipe.units.find(unit => unit.id === selected.id), pivot = selected.strokes[0].points[0];
      const expected = point => ({ x: pivot.x + (point.x - pivot.x) * Math.cos(rotation) - (point.y - pivot.y) * Math.sin(rotation) + dx,
        y: pivot.y + (point.x - pivot.x) * Math.sin(rotation) + (point.y - pivot.y) * Math.cos(rotation) });
      editing.push({ layout, multipleMembersSelected: selected.strokes.length === 5,
        allMembersChanged: selected.strokes.every((stroke, i) => !same(stroke, revised.strokes[i])),
        groupRigidGeometry: selected.strokes.every((stroke, i) => stroke.points.every((point, p) => {
          const value = expected(point), actual = revised.strokes[i].points[p];
          return close(actual.x, value.x) && close(actual.y, value.y) && actual.pressure === point.pressure;
        })),
        relativeWidthRatiosPreserved: selected.strokes.every((stroke, i) => revised.strokes[i].options.width === stroke.options.width * widthScale),
        controlsAndTimingPreserved: selected.strokes.every((stroke, i) => same(omit(stroke.options, 'width'), omit(revised.strokes[i].options, 'width'))),
        otherUnitsUnchanged: original.recipe.units.every((unit, i) => unit.id === selected.id || same(unit, moved.recipe.units[i])),
        otherResultsUnchanged: original.result.marks.every((mark, i) => selectedIds.has(mark.id) || same(mark, moved.result.marks[i])),
        selectedResultsChanged: original.result.marks.filter(mark => selectedIds.has(mark.id)).every(mark => !same(mark, moved.result.marks.find(result => result.id === mark.id))),
        seedsStable: original.result.marks.every((mark, i) => mark.seed === moved.result.marks[i].seed),
        inputUnchanged: saved === JSON.stringify(original), editedRecompiles: same(compileVegetationRecipe(JSON.parse(JSON.stringify(moved.recipe))), moved.result),
        exactNoOpRetained: same(editLeafCluster(original, selected.id), original),
        editChangesPixels: !pixelsEqual(capture(original.result), capture(moved.result)) });
    }
    const defaults = makeLeafClusterStudies({ seed }), width = makeLeafClusterStudies({ seed, widthScale: .7 }), dryness = makeLeafClusterStudies({ seed, dryness: .2 });
    const controls = {
      widthKeepsPathsAndOtherStyles: defaults.every((study, s) => study.variants.every((variant, v) => variant.document.recipe.units.every((unit, u) =>
        unit.strokes.every((stroke, i) => {
          const narrow = width[s].variants[v].document.recipe.units[u].strokes[i];
          return same(stroke.points, narrow.points) && same(omit(stroke.options, 'width'), omit(narrow.options, 'width'));
        })))),
      drynessKeepsAuthorGroups: defaults.every((study, s) => study.variants.every((variant, v) =>
        same(variant.document.recipe.units, dryness[s].variants[v].document.recipe.units)
        && same(omit(variant.document.recipe.options, 'dryness'), omit(dryness[s].variants[v].document.recipe.options, 'dryness')))),
      widthChangesPixels: !pixelsEqual(capture(defaults[1].variants[2].document.result), capture(width[1].variants[2].document.result)),
      drynessChangesPixels: !pixelsEqual(capture(defaults[0].variants[2].document.result), capture(dryness[0].variants[2].document.result)),
    };
    const zero = createVegetationDocument([{ id: 'zero-group', strokes: [{ id: 'first', points: [
      { x: 70, y: 140, pressure: 0 }, { x: 260, y: 70, pressure: 0 }, { x: 480, y: 190, pressure: 0 },
    ] }, { id: 'second', points: [{ x: 80, y: 100, pressure: 0 }, { x: 250, y: 180, pressure: 0 }] }] }],
    { ...leafClusterSize, seed, technique: 'dot-leaf' });
    const empty = createVegetationDocument([], { ...leafClusterSize, seed, technique: 'dot-leaf' });
    const transformedZero = editLeafCluster(zero, 'zero-group', { dx: 3, rotation: .1, widthScale: 1.3 });
    const boundary = { zeroPressureBlank: pixelsEqual(capture(zero.result), capture(empty.result)),
      transformedZeroBlank: pixelsEqual(capture(transformedZero.result), capture(empty.result)),
      zeroPressureContact: transformedZero.result.marks.every(mark => sampleBrushContact(mark).every(sample => sample.halfWidth === 0)) };
    let unknownVersionRejected = false, unknownGeneratorRejected = false;
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, generator: 'unknown-leaf-groups' }); } catch { unknownGeneratorRejected = true; }
    const original = defaults[0].variants[1].document, revised = reviseVegetationDocument(original, { options: { seed: seed + 1 } });
    const seedChangesMaterialOnly = same(original.recipe.units, revised.recipe.units)
      && original.result.marks.some((mark, i) => mark.seed !== revised.result.marks[i].seed);
    times.sort((a, b) => a - b);
    return { passed: results.length === 27 && pairs.length === 9 && organization.length === 9 && editing.length === 3
      && results.every(flags) && pairs.every(flags) && organization.every(flags) && editing.every(flags)
      && flags(controls) && flags(boundary) && unknownVersionRejected && unknownGeneratorRejected && seedChangesMaterialOnly,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, organization, editing, controls, boundary,
      unknownVersionRejected, unknownGeneratorRejected, seedChangesMaterialOnly,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: times.length, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * .95) - 1],
        scope: 'renderCanvas only; pixel readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '显式分叉叶向、主侧叶向与叶簇聚散；整簇移动、旋转和笔宽比例的工程检查，不确证传统笔数或笔序。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
