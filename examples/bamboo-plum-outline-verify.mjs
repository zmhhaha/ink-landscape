import {
  renderCanvas, createVegetationDocument, reviseVegetationDocument, compileVegetationRecipe, sampleBrushContact,
} from '../dist/index.js';
import { makeBambooPlumOutlineStudies, editBambooPlumOutlineCluster, bambooPlumOutlineInputs, bambooPlumOutlineSize } from './bamboo-plum-outline-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const groups = document => document.recipe.units.filter(unit => unit.role !== 'structure');
const structures = document => document.recipe.units.filter(unit => unit.role === 'structure');
const markId = (unit, stroke) => `${unit.id.length}:${unit.id}/${stroke.id.length}:${stroke.id}`;
const close = (a, b) => Math.abs(a - b) < 1e-9;
const pathLength = stroke => stroke.points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - stroke.points[i].x, point.y - stroke.points[i].y), 0);
const gapMidpoints = unit => {
  const get = id => unit.strokes.find(stroke => stroke.id === id);
  return [['rear-upper-before', 'rear-upper-after'], ['rear-lower-before', 'rear-lower-after']].map(([a, b]) => {
    const from = get(a).points.at(-1), to = get(b).points[0];
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  });
};
const within = (point, polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
};
const frontPolygon = (document, unit) => {
  const samples = id => sampleBrushContact(document.result.marks.find(mark => mark.id === markId(unit, unit.strokes.find(stroke => stroke.id === id))), { spacing: .2 })
    .map(sample => ({ x: sample.centerX, y: sample.centerY }));
  return [...samples('front-upper'), ...samples('front-lower').reverse()];
};
const rearContactSamplesAvoidFront = (document, unit, polygon) => unit.strokes.filter(stroke => stroke.id.startsWith('rear-')).every(stroke =>
  sampleBrushContact(document.result.marks.find(mark => mark.id === markId(unit, stroke)), { spacing: .2 }).every(sample =>
    !within({ x: sample.centerX, y: sample.centerY }, polygon) && !within({ x: sample.leftX, y: sample.leftY }, polygon)
    && !within({ x: sample.rightX, y: sample.rightY }, polygon)));
const endpointsMatch = (upper, lower) => close(upper.points[0].x, lower.points[0].x) && close(upper.points[0].y, lower.points[0].y)
  && close(upper.points.at(-1).x, lower.points.at(-1).x) && close(upper.points.at(-1).y, lower.points.at(-1).y);

/** Verifies saved sources and authored organizations; it does not judge art. */
export async function verifyBambooPlumOutlineStudies({ seed = bambooPlumOutlineInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = bambooPlumOutlineSize.width; canvas.height = bambooPlumOutlineSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), times = [];
  const capture = (scene, time = 8) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); times.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], organization = [], editing = [], outlineGapDiagnostics = [];
  try {
    for (const layout of ['slope', 'arc', 'fold']) {
      const studies = makeBambooPlumOutlineStudies({ seed, layout });
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
            sharedDocumentVersion: parsed.recipe.generator === 'ink-vegetation-guides-v1'
              && parsed.recipe.options.technique === (study.id === 'outline' ? 'outline-leaf' : 'dot-leaf'),
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
          variableGroupMembersOrContourProportions: study.id === 'outline' || new Set(groups(c).map(unit => unit.strokes.length)).size >= 3,
          widthAndToneVaried: new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.width))).size >= 4
            && new Set(groups(c).flatMap(unit => unit.strokes.map(stroke => stroke.options.opacity))).size >= 3,
        };
        if (study.id === 'bamboo') {
          const leaves = document => groups(document).flatMap(unit => unit.strokes.filter(stroke => stroke.id.startsWith('leaf-')));
          organization.push({ ...common,
            separateCulmScaffold: structures(c).slice(0, 2).every(unit => unit.strokes[0].points.length === 5)
              && !same(structures(c), structures(studies[1].variants[2].document)),
            longTaperedLeafSources: leaves(c).every(stroke => pathLength(stroke) > 25 && stroke.points.at(-1).pressure < .1
              && stroke.points[1].pressure > stroke.points[0].pressure),
            authoredTwigsRetained: groups(c).every(unit => unit.strokes[0].id === 'twig'),
            variedLeafLengths: new Set(leaves(c).map(stroke => Math.round(pathLength(stroke)))).size >= 8,
            noGeOrDraperySubstitution: study.limits.includes('个字点') && study.limits.includes('衣纹竹叶描'),
            partialScopeRetained: study.limits.includes('部分支持') });
        }
        if (study.id === 'plum') organization.push({ ...common,
          nonFixedCount: new Set(groups(c).map(unit => unit.strokes.length)).size >= 4
            && groups(c).some(unit => unit.strokes.length !== 5),
          compactShortLeaves: groups(c).every(unit => unit.strokes.every(stroke => pathLength(stroke) > 8 && pathLength(stroke) < 25)),
          taperedBrokenEdges: groups(c).every(unit => unit.strokes.every(stroke => stroke.points.at(-1).pressure < .1)),
          leafClusterNotFlower: study.limits.includes('不是梅花实物') && study.limits.includes('不规定传统计数'),
          partialScopeRetained: study.limits.includes('部分支持') });
        if (study.id === 'outline') {
          const polygons = groups(c).map(unit => frontPolygon(c, unit));
          const blank = capture(createVegetationDocument([], { ...bambooPlumOutlineSize, seed, technique: 'outline-leaf' }).result);
          const gapChecks = groups(c).map(unit => {
            // Rear-only rendering keeps each source identity and its derived
            // material seed. The foreground can legitimately touch a probe pixel.
            const rearUnit = { ...unit, strokes: unit.strokes.filter(stroke => stroke.id.startsWith('rear-')) };
            const rearDocument = createVegetationDocument([rearUnit], c.recipe.options), rearPixels = capture(rearDocument.result);
            const compositePixels = capture(createVegetationDocument([unit], c.recipe.options).result);
            const points = gapMidpoints(unit).map(point => {
              const pixelX = Math.round(point.x), pixelY = Math.round(point.y), offset = (pixelY * canvas.width + pixelX) * 4;
              const rgba = pixels => Array.from(pixels.slice(offset, offset + 4));
              const backgroundRGBA = rgba(blank), rearRGBA = rgba(rearPixels), compositeRGBA = rgba(compositePixels);
              return { x: point.x, y: point.y, pixelX, pixelY, backgroundRGBA, rearRGBA, compositeRGBA,
                rearBlank: same(rearRGBA, backgroundRGBA) };
            });
            const identitiesAndSeedsPreserved = c.result.marks.filter(mark => rearUnit.strokes.some(stroke => mark.id === markId(rearUnit, stroke)))
              .every(mark => rearDocument.result.marks.some(rearMark => rearMark.id === mark.id && rearMark.seed === mark.seed));
            outlineGapDiagnostics.push({ layout, unit: unit.id, identitiesAndSeedsPreserved, points });
            return points.every(point => point.rearBlank) && identitiesAndSeedsPreserved;
          });
          const rearGapPixelsBlank = gapChecks.every(Boolean);
          organization.push({ ...common,
            railsRemainOpenCounterexample: groups(a).every(unit => !endpointsMatch(unit.strokes[0], unit.strokes[1])),
            pairedEndpointsClose: groups(b).every(unit => endpointsMatch(unit.strokes[0], unit.strokes[1])),
            middleGapWiderThanEnds: groups(b).every(unit => Math.hypot(unit.strokes[0].points[2].x - unit.strokes[1].points[2].x,
              unit.strokes[0].points[2].y - unit.strokes[1].points[2].y) > 10),
            foregroundPairCloses: groups(c).every(unit => endpointsMatch(unit.strokes.find(stroke => stroke.id === 'front-upper'), unit.strokes.find(stroke => stroke.id === 'front-lower'))),
            explicitVisibleRearSegments: groups(c).every(unit => same(unit.strokes.map(stroke => stroke.id),
              ['rear-upper-before', 'rear-upper-after', 'rear-lower-before', 'rear-lower-after', 'front-upper', 'front-lower'])),
            omittedGapMidpointsWithinForeground: groups(c).every((unit, i) => gapMidpoints(unit).every(point => within(point, polygons[i]))),
            sampledRearContactsAvoidForegroundInterior: groups(c).every((unit, i) => rearContactSamplesAvoidFront(c, unit, polygons[i])),
            rearGapPixelsBlank,
            noWhiteEraseOrClipMask: c.recipe.options.ink === '#252820' && groups(c).every(unit => unit.strokes.every(stroke => stroke.options.clip === undefined)),
            pairedContourProportionsVary: new Set(groups(c).map(unit => {
              const front = unit.strokes.find(stroke => stroke.id === 'front-upper');
              return Math.round(pathLength(front) * 10);
            })).size >= 6,
            paintingNotCopyingScope: study.limits.includes('绘画双钩') && study.limits.includes('不是复制法帖'),
          });
        }

        const original = c, selected = original.recipe.units.find(unit => unit.id === 'cluster-1');
        const selectedIds = new Set(selected.strokes.map(stroke => markId(selected, stroke))), saved = JSON.stringify(original);
        const dx = 17, rotation = .3, widthScale = 1.2;
        const moved = editBambooPlumOutlineCluster(original, selected.id, { dx, rotation, widthScale });
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
          exactNoOpRetained: same(editBambooPlumOutlineCluster(original, selected.id), original),
          editChangesPixels: !pixelsEqual(capture(original.result), capture(moved.result)) });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    const defaults = makeBambooPlumOutlineStudies({ seed }), width = makeBambooPlumOutlineStudies({ seed, widthScale: .7 }), dryness = makeBambooPlumOutlineStudies({ seed, dryness: .2 });
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
    const boundary = {};
    for (const technique of ['dot-leaf', 'outline-leaf']) {
      const zeroUnit = { id: 'zero-group', strokes: [
        { id: 'first', points: [{ x: 70, y: 140, pressure: 0 }, { x: 260, y: 70, pressure: 0 }, { x: 480, y: 190, pressure: 0 }],
          options: { start: .2, duration: .6, controls: [{ at: 0, pressure: 1 }, { at: 1, pressure: 1 }] } },
        { id: 'second', points: [{ x: 80, y: 150, pressure: 0 }, { x: 270, y: 80, pressure: 0 }, { x: 490, y: 200, pressure: 0 }] },
      ] };
      const zero = createVegetationDocument([zeroUnit], { ...bambooPlumOutlineSize, seed, technique });
      const empty = createVegetationDocument([], { ...bambooPlumOutlineSize, seed, technique });
      const transformedZero = editBambooPlumOutlineCluster(zero, 'zero-group', { dx: 3, rotation: .1, widthScale: 1.3 });
      boundary[technique + 'ZeroPressureBlank'] = pixelsEqual(capture(zero.result), capture(empty.result));
      boundary[technique + 'TransformedZeroBlank'] = pixelsEqual(capture(transformedZero.result), capture(empty.result));
      boundary[technique + 'ZeroPressureContact'] = transformedZero.result.marks.every(mark => sampleBrushContact(mark).every(sample => sample.halfWidth === 0));
    }
    let unknownVersionRejected = false, unknownGeneratorRejected = false;
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileVegetationRecipe({ ...defaults[0].variants[1].document.recipe, generator: 'unknown-bamboo-outline' }); } catch { unknownGeneratorRejected = true; }
    const seedChangesMaterialOnly = defaults.every(study => study.variants.every(variant => {
      const original = variant.document, revised = reviseVegetationDocument(original, { options: { seed: seed + 1 } });
      return same(original.recipe.units, revised.recipe.units)
        && original.result.marks.some((mark, i) => mark.seed !== revised.result.marks[i].seed);
    }));
    times.sort((a, b) => a - b);
    return { passed: results.length === 27 && pairs.length === 9 && organization.length === 9 && editing.length === 9
      && results.every(flags) && pairs.every(flags) && organization.every(flags) && editing.every(flags)
      && flags(controls) && flags(boundary) && unknownVersionRejected && unknownGeneratorRejected && seedChangesMaterialOnly,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, organization, editing, controls, boundary, outlineGapDiagnostics,
      unknownVersionRejected, unknownGeneratorRejected, seedChangesMaterialOnly,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: times.length, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * .95) - 1],
        scope: 'renderCanvas only; pixel readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '作者竹叶、花簇式树叶与双边轮廓的保存、重建和整组编辑；遮挡省略由作者提供，不确证固定叶数、传统笔序或艺术效果。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
