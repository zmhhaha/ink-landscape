import { renderCanvas, createVegetationDocument, reviseVegetationDocument, compileVegetationRecipe, sampleBrushContact } from '../dist/index.js';
import { makeVegetationStudies, editVegetationUnit, vegetationInputs, vegetationSize } from './vegetation-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const marks = document => document.recipe.units.filter(unit => unit.role !== 'structure');
const structures = document => document.recipe.units.filter(unit => unit.role === 'structure');
const markId = (unit, stroke) => `${unit.id.length}:${unit.id}/${stroke.id.length}:${stroke.id}`;
const attachedGrowth = (document, unit) => {
  const root = unit.strokes[0].points[0];
  const parent = structures(document).flatMap(branch => branch.strokes).find(stroke => stroke.points.some(point =>
    Math.hypot(point.x - root.x, point.y - root.y) < 1e-8));
  if (!parent) return false;
  const index = parent.points.findIndex(point => Math.hypot(point.x - root.x, point.y - root.y) < 1e-8);
  const before = parent.points[Math.max(0, index - 1)], after = parent.points[Math.min(parent.points.length - 1, index + 1)];
  const sx = unit.strokes.reduce((sum, stroke) => sum + stroke.points[1].x - root.x, 0) / unit.strokes.length;
  const sy = unit.strokes.reduce((sum, stroke) => sum + stroke.points[1].y - root.y, 0) / unit.strokes.length;
  const dx = after.x - before.x, dy = after.y - before.y;
  return (sx * dx + sy * dy) / (Math.hypot(sx, sy) * Math.hypot(dx, dy)) > .88
    && unit.strokes.every(stroke => {
      const tip = stroke.points.at(-1);
      return (tip.x - root.x) * sx + (tip.y - root.y) * sy > 0;
    });
};
const frontBackOrder = document => {
  const first = document.recipe.units.findIndex(unit => unit.role === 'structure');
  const last = document.recipe.units.findLastIndex(unit => unit.role === 'structure');
  return first > 0 && last < document.recipe.units.length - 1;
};
// Projection tone belongs to the loaded leaf body. Root accents can insert
// earlier controls, so an array index cannot identify this contact phase.
const bodyInkLoad = stroke => {
  const body = (stroke.options?.controls ?? []).filter(control => control.at >= .2 && control.at <= .8
    && Number.isFinite(control.pressure));
  if (!body.length) return undefined;
  const peak = body.reduce((selected, control) => control.pressure > selected.pressure ? control : selected);
  return peak.inkLoad;
};

/** Checks authored objects, reproducibility and editing; no artistic verdict. */
export async function verifyVegetationStudies({ seed = vegetationInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = vegetationSize.width; canvas.height = vegetationSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), times = [];
  const capture = (scene, time = 8) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); times.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], organization = [], editing = [];
  try {
    for (const layout of ['slope', 'arc', 'fold']) {
      const studies = makeVegetationStudies({ seed, layout });
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
            visibleStructureSources: structures(parsed).length === 5 && structures(parsed).every(unit => unit.strokes.length > 0),
            inputUnchanged: saved === JSON.stringify(variant.document) });
        }
        pairs.push({ layout, study: study.id,
          firstSecondDiffer: !pixelsEqual(pixels[0], pixels[1]), secondThirdDiffer: !pixelsEqual(pixels[1], pixels[2]) });
        const [a, b, c] = study.variants.map(variant => variant.document);
        const ids = document => marks(document).map(unit => unit.id);
        const paths = document => marks(document).map(unit => unit.strokes.map(stroke => stroke.points));
        const rootsOnBranches = document => marks(document).every(unit => unit.strokes.every(stroke =>
          structures(document).some(branch => branch.strokes.some(line => line.points.some(point =>
            Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) < 1e-8)))));
        const common = { layout, study: study.id,
          structureSourcesUnchanged: same(structures(a), structures(b)) && same(structures(b), structures(c)),
          unitIdsPreserved: same(ids(a), ids(b)) && same(ids(b), ids(c)) };
        if (study.id === 'moss') organization.push({ ...common,
          explicitMossCounts: marks(a).length === 35 && marks(b).length === 35 && marks(c).length === 35,
          authoredPlacementChanges: !same(paths(a), paths(b)),
          variedSourceWidths: new Set(marks(c).map(unit => unit.strokes[0].options.width)).size > 3,
          variedSourceOpacity: new Set(marks(c).map(unit => unit.strokes[0].options.opacity)).size > 2,
          neutralContactExplicitOnlyInCounterexample: marks(a).every(unit => Array.isArray(unit.strokes[0].options.controls))
            && marks(b).every(unit => unit.strokes[0].options.controls === undefined) });
        if (study.id === 'leaves') {
          const bodyLoads = marks(c).map(unit => bodyInkLoad(unit.strokes[0]));
          organization.push({ ...common,
          explicitLeafCounts: marks(a).length === 20 && marks(b).length === 20 && marks(c).length === 20,
          attachedSourcePathsReplaceGrid: !same(paths(a), paths(b)),
          sameBasesAfterPressChange: marks(b).every((unit, i) => same(unit.strokes[0].points[0], { ...marks(c)[i].strokes[0].points[0], pressure: 1 })),
          allAuthoredLeafRootsOnBranches: rootsOnBranches(b) && rootsOnBranches(c),
          stemsFollowParentTangentsAndGrowOutward: [b, c].every(document => marks(document).every(unit => attachedGrowth(document, unit))),
          neutralContactReplaced: marks(b).every(unit => Array.isArray(unit.strokes[0].options.controls))
            && marks(c).every(unit => unit.strokes[0].options.controls.some(control => control.side >= .6)),
          projectedWidthsAndPigmentVary: new Set(marks(c).map(unit => unit.strokes[0].options.width)).size >= 8
            && bodyLoads.every(load => Number.isFinite(load) && load >= 0 && load <= 1)
            && new Set(bodyLoads).size === 3 && Math.max(...bodyLoads) - Math.min(...bodyLoads) >= .12,
          rearLeavesBeforeBranchesFrontLeavesAfter: frontBackOrder(c),
          authoredLightEnds: marks(c).every(unit => unit.strokes[0].points.at(-1).pressure < unit.strokes[0].points[0].pressure) });
        }
        if (study.id === 'outline') organization.push({ ...common,
          allLeavesKeepTwoSides: [a, b, c].every(document => marks(document).length === 20 && marks(document).every(unit => unit.strokes.length === 2)),
          pairedBasesAndTips: marks(b).every(unit => same(unit.strokes[0].points[0], unit.strokes[1].points[0])
            && same(unit.strokes[0].points.at(-1), unit.strokes[1].points.at(-1))),
          allPairedRootsOnBranches: rootsOnBranches(b) && rootsOnBranches(c),
          pairedStemsFollowParentTangents: [b, c].every(document => marks(document).every(unit => attachedGrowth(document, unit))),
          rearContoursBeforeBranchesFrontContoursAfter: frontBackOrder(c),
          finiteProjectionScopeExplicit: study.limits.includes('二维投影') && study.limits.includes('不自动修复遮挡'),
          explicitOpeningExists: marks(c).some(unit => !same(unit.strokes[0].points.at(-1), unit.strokes[1].points.at(-1))),
          onlyStrokeResults: [a, b, c].every(document => document.result.marks.every(mark => mark.kind === 'stroke')),
          partialReadingRetained: study.limits.includes('部分支持') });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      const original = studies[2].variants[2].document, selected = original.recipe.units.find(unit => unit.id === 'leaf-1');
      const selectedIds = new Set(selected.strokes.map(stroke => markId(selected, stroke))), saved = JSON.stringify(original);
      const moved = editVegetationUnit(original, selected.id, { dx: 17, width: 3.1 });
      const revisedUnit = moved.recipe.units.find(unit => unit.id === selected.id);
      editing.push({ layout, twoSidesSelected: selected.strokes.length === 2,
        bothSourceSidesChanged: selected.strokes.every((stroke, i) => !same(stroke, revisedUnit.strokes[i])),
        allSelectedPointsMoved: selected.strokes.every((stroke, i) => stroke.points.every((point, p) => revisedUnit.strokes[i].points[p].x === point.x + 17)),
        otherUnitsUnchanged: original.recipe.units.every((unit, i) => unit.id === selected.id || same(unit, moved.recipe.units[i])),
        otherResultsUnchanged: original.result.marks.every((mark, i) => selectedIds.has(mark.id) || same(mark, moved.result.marks[i])),
        selectedResultsChanged: original.result.marks.filter(mark => selectedIds.has(mark.id)).every(mark => !same(mark, moved.result.marks.find(revised => revised.id === mark.id))),
        seedsStable: original.result.marks.every((mark, i) => mark.seed === moved.result.marks[i].seed),
        inputUnchanged: saved === JSON.stringify(original), editedRecompiles: same(compileVegetationRecipe(JSON.parse(JSON.stringify(moved.recipe))), moved.result),
        editChangesPixels: !pixelsEqual(capture(original.result), capture(moved.result)) });
    }
    const defaults = makeVegetationStudies({ seed }), width = makeVegetationStudies({ seed, widthScale: .7 }), dryness = makeVegetationStudies({ seed, dryness: .2 });
    const controls = {
      widthKeepsSourcePathsAndOtherOptions: defaults.every((study, s) => study.variants.every((variant, v) => variant.document.recipe.units.every((unit, u) =>
        unit.strokes.every((stroke, i) => {
          const narrow = width[s].variants[v].document.recipe.units[u].strokes[i];
          return same(stroke.points, narrow.points) && same(omit(stroke.options, 'width'), omit(narrow.options, 'width'));
        })))),
      drynessKeepsAuthoredUnits: defaults.every((study, s) => study.variants.every((variant, v) =>
        same(variant.document.recipe.units, dryness[s].variants[v].document.recipe.units)
        && same(omit(variant.document.recipe.options, 'dryness'), omit(dryness[s].variants[v].document.recipe.options, 'dryness')))),
      widthChangesPixels: !pixelsEqual(capture(defaults[1].variants[2].document.result), capture(width[1].variants[2].document.result)),
      drynessChangesPixels: !pixelsEqual(capture(defaults[0].variants[2].document.result), capture(dryness[0].variants[2].document.result)),
    };
    const zero = createVegetationDocument([{ id: 'zero', strokes: [{ id: 'contact', points: [
      { x: 70, y: 140, pressure: 0 }, { x: 260, y: 70, pressure: 0 }, { x: 480, y: 190, pressure: 0 },
    ] }] }], { ...vegetationSize, seed, technique: 'dot-leaf' });
    const empty = createVegetationDocument([], { ...vegetationSize, seed, technique: 'dot-leaf' });
    const boundary = { zeroPressureBlank: pixelsEqual(capture(zero.result), capture(empty.result)),
      zeroPressureContact: sampleBrushContact(zero.result.marks[0]).every(sample => sample.halfWidth === 0) };
    let unknownVersionRejected = false, unknownGeneratorRejected = false;
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, generator: 'unknown-vegetation' }); } catch { unknownGeneratorRejected = true; }
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
      artisticValidation: 'unreviewed', scope: '作者对象组织、逐叶双边编辑与接触执行检查；三项一批总览，艺术最后统一评价。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
