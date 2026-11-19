import { renderCanvas, createCunDocument, compileCunRecipe, reviseCunDocument, sampleBrushContact } from '../dist/index.js';
import { makeCunStudies, editCunStroke, cunInputs, cunSize } from './cun-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

/** Reproducibility and source checks; artistic evaluation remains deferred. */
export async function verifyCunStudies({ seed = cunInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = cunSize.width; canvas.height = cunSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), times = [];
  const capture = (scene, time = 8) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); times.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], organization = [], editing = [];
  try {
    for (const layout of ['slope', 'arc', 'fold']) {
      const studies = makeCunStudies({ seed, layout });
      for (const study of studies) {
        const pixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), parsed = JSON.parse(saved), recompiled = compileCunRecipe(parsed.recipe);
          const complete = capture(variant.document.result), initial = capture(variant.document.result, .1);
          capture(variant.document.result, 5); capture(variant.document.result, .7);
          const afterSeek = capture(variant.document.result), replay = capture(parsed.result), sourceReplay = capture(recompiled); pixels.push(complete);
          results.push({ layout, study: study.id, variant: variant.id, sourceRecompileEqual: same(recompiled, parsed.result),
            savedPixelReplayEqual: pixelsEqual(complete, replay), sourcePixelReplayEqual: pixelsEqual(complete, sourceReplay),
            outOfOrderTimeEqual: pixelsEqual(complete, afterSeek), partialChangesPixels: !pixelsEqual(complete, initial),
            oneResultPerSource: recompiled.marks.length === parsed.recipe.strokes.length,
            inputUnchanged: saved === JSON.stringify(variant.document) });
        }
        pairs.push({ layout, study: study.id, firstSecondDiffer: !pixelsEqual(pixels[0], pixels[1]), secondThirdDiffer: !pixelsEqual(pixels[1], pixels[2]) });
        const [a, b, c] = study.variants.map(variant => variant.document);
        const strokes = c.recipe.strokes;
        const wash = strokes.filter(stroke => stroke.options.opacity < .3);
        const body = strokes.filter(stroke => stroke.options.opacity >= .4 && stroke.options.opacity < .7);
        const accents = strokes.filter(stroke => stroke.options.opacity >= .8);
        organization.push({ layout, study: study.id, threeExplicitInkLevels: wash.length > 0 && body.length > 0 && accents.length > 0,
          dryLightUnderlayer: wash.every(stroke => stroke.options.dryness >= .79),
          washBeforeBodyBeforeAccents: Math.max(...wash.map(stroke => stroke.options.start + stroke.options.duration)) < Math.min(...body.map(stroke => stroke.options.start))
            && Math.max(...body.map(stroke => stroke.options.start + stroke.options.duration)) < Math.min(...accents.map(stroke => stroke.options.start)),
          sparseAccents: accents.length <= Math.ceil(strokes.length / 4),
          savedPerStrokeInkExecuted: strokes.every((stroke, index) => c.result.marks[index].opacity === stroke.options.opacity) });
        const paths = document => document.recipe.strokes.map(stroke => stroke.points);
        if (study.id === 'pima') organization.push({ layout, study: study.id, authoredOrganizationChanges: !same(paths(a), paths(b)) && !same(paths(b), paths(c)),
          explicitCounts: a.recipe.strokes.length === 9 && b.recipe.strokes.length === 12 && c.recipe.strokes.length === 16 });
        if (study.id === 'axe') organization.push({ layout, study: study.id, firstTwoKeepSourcePaths: same(paths(a), paths(b)),
          contactAndWidthExplicitlyChanged: a.recipe.strokes[0].options.width !== b.recipe.strokes[0].options.width && a.recipe.strokes[0].options.axis === 'center',
          finalColumnChangesOrganization: c.recipe.strokes.length > b.recipe.strokes.length });
        if (study.id === 'zhedai') organization.push({ layout, study: study.id, firstTwoKeepSourcePaths: same(paths(a), paths(b)),
          firstTwoChangeTurnSetting: a.recipe.strokes[0].options.turn === 'round' && b.recipe.strokes[0].options.turn === undefined,
          thirdAddsAuthoredPaths: c.recipe.strokes.length > b.recipe.strokes.length });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      const original = studies[2].variants[2].document, id = original.recipe.strokes[1].id, saved = JSON.stringify(original);
      const moved = editCunStroke(original, id, { dx: 17, width: 19 });
      editing.push({ layout, selectedSourceChanged: !same(original.recipe.strokes[1], moved.recipe.strokes[1]),
        otherSourcesUnchanged: original.recipe.strokes.every((stroke, index) => stroke.id === id || same(stroke, moved.recipe.strokes[index])),
        otherResultsUnchanged: original.result.marks.every((mark, index) => index === 1 || same(mark, moved.result.marks[index])),
        seedsStable: original.result.marks.every((mark, index) => mark.seed === moved.result.marks[index].seed),
        inputUnchanged: saved === JSON.stringify(original), editedRecompiles: same(compileCunRecipe(JSON.parse(JSON.stringify(moved.recipe))), moved.result) });
    }
    const defaults = makeCunStudies({ seed }), width = makeCunStudies({ seed, widthScale: .7 }), dryness = makeCunStudies({ seed, dryness: .2 });
    const controls = {
      widthOnlyChangesSourceWidth: defaults.every((study, s) => study.variants.every((variant, v) => variant.document.recipe.strokes.every((stroke, i) =>
        same(omit(stroke.options, 'width'), omit(width[s].variants[v].document.recipe.strokes[i].options, 'width'))
          && same(stroke.points, width[s].variants[v].document.recipe.strokes[i].points)))),
      drynessKeepsSourcePathsAndStyles: defaults.every((study, s) => study.variants.every((variant, v) =>
        same(variant.document.recipe.strokes, dryness[s].variants[v].document.recipe.strokes)
        && same(omit(variant.document.recipe.options, 'dryness'), omit(dryness[s].variants[v].document.recipe.options, 'dryness')))),
      widthChangesPixels: !pixelsEqual(capture(defaults[1].variants[1].document.result), capture(width[1].variants[1].document.result)),
      drynessChangesPixels: !pixelsEqual(capture(defaults[0].variants[1].document.result), capture(dryness[0].variants[1].document.result)),
    };
    const zero = createCunDocument([{ id: 'zero-pressure', points: [{ x: 40, y: 140, pressure: 0 }, { x: 260, y: 70, pressure: 0 }, { x: 480, y: 190, pressure: 0 }] }], { ...cunSize, seed, technique: 'axe' });
    const empty = createCunDocument([], { ...cunSize, seed, technique: 'axe' });
    const clip = [{ x: 40, y: 30 }, { x: 260, y: 30 }, { x: 260, y: 230 }, { x: 40, y: 230 }];
    const clipped = createCunDocument([{ id: 'clipped', points: [{ x: 50, y: 130 }, { x: 490, y: 130 }], options: { width: 40, clip } }], { ...cunSize, seed, technique: 'axe' });
    const clippedPixels = capture(clipped.result), emptyPixels = capture(empty.result); let outsideClipUnchanged = true, inkInside = false;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      if (x >= 262 && !clippedPixels.slice(index, index + 4).every((value, channel) => value === emptyPixels[index + channel])) outsideClipUnchanged = false;
      if (x > 50 && x < 250 && clippedPixels[index] !== emptyPixels[index]) inkInside = true;
    }
    const boundary = { zeroPressureBlank: pixelsEqual(capture(zero.result), emptyPixels), zeroPressureContact: sampleBrushContact(zero.result.marks[0]).every(sample => sample.halfWidth === 0),
      outsideClipUnchanged, clipHasVisibleInterior: inkInside };
    let unknownVersionRejected = false, unknownGeneratorRejected = false;
    try { compileCunRecipe({ ...defaults[0].variants[1].document.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileCunRecipe({ ...defaults[0].variants[1].document.recipe, generator: 'unknown-cun' }); } catch { unknownGeneratorRejected = true; }
    const revised = reviseCunDocument(defaults[0].variants[1].document, { options: { seed: seed + 1 } });
    const sourceSeedIsolation = same(defaults[0].variants[1].document.recipe.strokes, revised.recipe.strokes)
      && defaults[0].variants[1].document.result.marks.some((mark, i) => mark.seed !== revised.result.marks[i].seed);
    times.sort((a, b) => a - b);
    return { passed: results.every(flags) && pairs.every(flags) && organization.every(flags) && editing.every(flags) && flags(controls) && flags(boundary)
      && unknownVersionRejected && unknownGeneratorRejected && sourceSeedIsolation,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, organization, editing, controls, boundary,
      unknownVersionRejected, unknownGeneratorRejected, sourceSeedIsolation,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: times.length, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * .95) - 1], scope: 'renderCanvas only; pixel readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '作者组织、可编辑源与接触执行的工程检查；三项一批出总览，艺术效果最后统一评价。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
