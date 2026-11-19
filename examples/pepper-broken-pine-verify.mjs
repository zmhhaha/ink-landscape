import {
  renderCanvas, createVegetationDocument, createSplitVegetationUnit, reviseVegetationDocument, compileVegetationRecipe, sampleBrushContact,
} from '../dist/index.js';
import { makePepperBrokenPineStudies, editPepperBrokenPineCluster, pepperBrokenPineInputs, pepperBrokenPineSize } from './pepper-broken-pine-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const groups = document => document.recipe.units.filter(unit => unit.role !== 'structure');
const structures = document => document.recipe.units.filter(unit => unit.role === 'structure');
const markId = (unit, stroke) => `${unit.id.length}:${unit.id}/${stroke.id.length}:${stroke.id}`;
const close = (a, b) => Math.abs(a - b) < 1e-9;
const pathLength = stroke => stroke.points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - stroke.points[i].x, point.y - stroke.points[i].y), 0);
const splitIdentity = stroke => {
  const first = /^(\d+):/.exec(stroke.id);
  if (!first) return undefined;
  const sourceEnd = first[0].length + Number(first[1]), source = stroke.id.slice(first[0].length, sourceEnd);
  if (stroke.id[sourceEnd] !== '/') return undefined;
  const remainder = stroke.id.slice(sourceEnd + 1), second = /^(\d+):/.exec(remainder);
  if (!second) return undefined;
  const bundle = remainder.slice(second[0].length);
  return source.length === Number(first[1]) && bundle.length === Number(second[1]) ? { source, bundle } : undefined;
};
const largestAngularGap = unit => {
  const angles = unit.strokes.map(stroke => {
    const first = stroke.points[0], last = stroke.points.at(-1), value = Math.atan2(last.y - first.y, last.x - first.x);
    return value < 0 ? value + Math.PI * 2 : value;
  }).sort((a, b) => a - b);
  return Math.max(...angles.map((angle, i) => (i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2) - angle));
};

/** Verifies saved sources and authored organizations; it does not judge art. */
export async function verifyPepperBrokenPineStudies({ seed = pepperBrokenPineInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = pepperBrokenPineSize.width; canvas.height = pepperBrokenPineSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), times = [];
  const capture = (scene, time = 8) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); times.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], organization = [], editing = [];
  try {
    for (const layout of ['slope', 'arc', 'fold']) {
      const studies = makePepperBrokenPineStudies({ seed, layout });
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
            sharedDocumentVersion: parsed.recipe.generator === 'ink-vegetation-guides-v1' && parsed.recipe.options.technique === 'dot-leaf',
            inputUnchanged: saved === JSON.stringify(variant.document) });
          // Dense dot studies are expensive; keep the UI responsive between samples.
          await new Promise(resolve => setTimeout(resolve, 0));
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
          variableGroupMembers: new Set(groups(c).map(unit => unit.strokes.length)).size >= 3,
          widthAndToneVaried: new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.width))).size >= 4
            && new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.opacity))).size >= 3,
        };
        if (study.id === 'pepper') organization.push({ ...common,
          fineShortDabs: groups(c).every(unit => unit.strokes.every(stroke => pathLength(stroke) < 5 && stroke.options.width <= 5.1)),
          denseEditableClusters: groups(c).every(unit => unit.strokes.length >= 20 && unit.strokes.length <= 38),
          noAutomaticMiDotPreset: c.recipe.options.technique === 'dot-leaf' && study.limits.includes('米点'),
          pressureChangesWithinDabs: groups(c).every(unit => unit.strokes.every(stroke => stroke.points[1].pressure > stroke.points[0].pressure
            && stroke.points.at(-1).pressure < stroke.points[1].pressure)) });
        if (study.id === 'broken') {
          const dabs = unit => [...new Set(unit.strokes.map(stroke => splitIdentity(stroke)?.source))]
            .map(id => unit.strokes.filter(stroke => splitIdentity(stroke)?.source === id));
          organization.push({ ...common,
            correlatedBundleIds: [b, c].every(document => groups(document).every(unit => unit.strokes.every(stroke => splitIdentity(stroke))))
              && groups(b).every(unit => dabs(unit).length === 2 && dabs(unit).every(members => members.length === 3)),
            sharedTimingWithinDab: [b, c].every(document => groups(document).every(unit => dabs(unit).every(members => members.every(stroke =>
              stroke.options.start === members[0].options.start && stroke.options.duration === members[0].options.duration)))),
            visibleLaneSeparation: groups(c).every(unit => dabs(unit).every(members => members.slice(1).some(stroke =>
              Math.hypot(stroke.points[0].x - members[0].points[0].x, stroke.points[0].y - members[0].points[0].y) > 5))),
            noCutoutMasks: [b, c].every(document => groups(document).every(unit => unit.strokes.every(stroke => stroke.options.clip === undefined))),
            authoredTailLengthsDiffer: groups(c).every(unit => dabs(unit).some(members => new Set(members.map(stroke => pathLength(stroke).toFixed(5))).size > 1)),
            partialScopeRetained: study.limits.includes('部分支持') && study.limits.includes('物理一次落笔') });
        }
        if (study.id === 'pine') organization.push({ ...common,
          fullSunCounterexample: groups(a).every(unit => largestAngularGap(unit) < 1),
          targetFansHaveOpenSector: [b, c].every(document => groups(document).every(unit => largestAngularGap(unit) > Math.PI)),
          variableNeedleLengths: groups(c).every(unit => new Set(unit.strokes.map(stroke => Math.round(pathLength(stroke) * 10))).size >= 5),
          taperedNeedleSources: groups(c).every(unit => unit.strokes.every(stroke => stroke.points.at(-1).pressure < stroke.points[0].pressure)),
          partialScopeAndNoEmbroideryClaim: study.limits.includes('部分支持') && study.limits.includes('不引用刺绣') });

        const original = c, selected = original.recipe.units.find(unit => unit.id === 'cluster-1');
        const selectedIds = new Set(selected.strokes.map(stroke => markId(selected, stroke))), saved = JSON.stringify(original);
        const dx = 17, rotation = .3, widthScale = 1.2;
        const moved = editPepperBrokenPineCluster(original, selected.id, { dx, rotation, widthScale });
        const revised = moved.recipe.units.find(unit => unit.id === selected.id), pivot = selected.strokes[0].points[0];
        const expected = point => ({ x: pivot.x + (point.x - pivot.x) * Math.cos(rotation) - (point.y - pivot.y) * Math.sin(rotation) + dx,
          y: pivot.y + (point.x - pivot.x) * Math.sin(rotation) + (point.y - pivot.y) * Math.cos(rotation) });
        editing.push({ layout, study: study.id, multipleMembersSelected: selected.strokes.length > 1,
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
          exactNoOpRetained: same(editPepperBrokenPineCluster(original, selected.id), original),
          editChangesPixels: !pixelsEqual(capture(original.result), capture(moved.result)) });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    const defaults = makePepperBrokenPineStudies({ seed }), width = makePepperBrokenPineStudies({ seed, widthScale: .7 }), dryness = makePepperBrokenPineStudies({ seed, dryness: .2 });
    const controls = {
      widthKeepsPathsAndOtherStyles: defaults.every((study, s) => study.variants.every((variant, v) => variant.document.recipe.units.every((unit, u) =>
        unit.strokes.every((stroke, i) => {
          const narrow = width[s].variants[v].document.recipe.units[u].strokes[i];
          return same(stroke.points, narrow.points) && same(omit(stroke.options, 'width'), omit(narrow.options, 'width'));
        })))),
      drynessKeepsAuthorGroups: defaults.every((study, s) => study.variants.every((variant, v) =>
        same(variant.document.recipe.units, dryness[s].variants[v].document.recipe.units)
        && same(omit(variant.document.recipe.options, 'dryness'), omit(dryness[s].variants[v].document.recipe.options, 'dryness')))),
      widthChangesPixels: defaults.every((study, s) => !pixelsEqual(capture(study.variants[2].document.result), capture(width[s].variants[2].document.result))),
      drynessChangesPixels: defaults.every((study, s) => !pixelsEqual(capture(study.variants[2].document.result), capture(dryness[s].variants[2].document.result))),
    };
    const zeroUnit = createSplitVegetationUnit('zero-group', { id: 'zero-dab', points: [
      { x: 70, y: 140, pressure: 0 }, { x: 260, y: 70, pressure: 0 }, { x: 480, y: 190, pressure: 0 },
    ], options: { start: .2, duration: .6, controls: [{ at: 0, pressure: 1 }, { at: 1, pressure: 1 }] } },
    [{ id: 'center', offset: 0, width: 13 }, { id: 'left', offset: -11, width: 8, pressureScale: .6 }, { id: 'right', offset: 10, width: 9 }]);
    const zero = createVegetationDocument([zeroUnit], { ...pepperBrokenPineSize, seed, technique: 'dot-leaf' });
    const empty = createVegetationDocument([], { ...pepperBrokenPineSize, seed, technique: 'dot-leaf' });
    const transformedZero = editPepperBrokenPineCluster(zero, 'zero-group', { dx: 3, rotation: .1, widthScale: 1.3 });
    const boundary = { splitZeroPressureBlank: pixelsEqual(capture(zero.result), capture(empty.result)),
      transformedSplitZeroBlank: pixelsEqual(capture(transformedZero.result), capture(empty.result)),
      zeroPressureContact: transformedZero.result.marks.every(mark => sampleBrushContact(mark).every(sample => sample.halfWidth === 0)) };
    let unknownVersionRejected = false, unknownGeneratorRejected = false;
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, generator: 'unknown-split-contact' }); } catch { unknownGeneratorRejected = true; }
    const seedChangesMaterialOnly = defaults.every(study => study.variants.every(variant => {
      const original = variant.document, revised = reviseVegetationDocument(original, { options: { seed: seed + 1 } });
      return same(original.recipe.units, revised.recipe.units)
        && original.result.marks.some((mark, i) => mark.seed !== revised.result.marks[i].seed);
    }));
    times.sort((a, b) => a - b);
    return { passed: results.length === 27 && pairs.length === 9 && organization.length === 9 && editing.length === 9
      && results.every(flags) && pairs.every(flags) && organization.every(flags) && editing.every(flags)
      && flags(controls) && flags(boundary) && unknownVersionRejected && unknownGeneratorRejected && seedChangesMaterialOnly,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, organization, editing, controls, boundary,
      unknownVersionRejected, unknownGeneratorRejected, seedChangesMaterialOnly,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: times.length, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * .95) - 1],
        scope: 'renderCanvas only; pixel readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '作者细点、相关分束与偏向针束的保存、重建和整组编辑；不确证真实分毫、固定笔序或传统技法已通过艺术评价。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
