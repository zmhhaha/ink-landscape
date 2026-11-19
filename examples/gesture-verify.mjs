import { renderCanvas, createBrushDocument, compileBrushRecipe, sampleBrushContact, createInkScene } from '../dist/index.js';
import { makeGestureStudies, makeGestureComposition, gestureScene, gestureInputs, gestureSize, gesturePath } from './gesture-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const equalPixels = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);

/** Browser engineering observations; no image score is used for artistic acceptance. */
export async function verifyGestureStudies({ seed = gestureInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = gestureSize.width; canvas.height = gestureSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const renderTimes = [];
  const capture = (scene, time = 3) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); renderTimes.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], isolation = [];
  try {
    for (const pathVariant of ['straight', 'curve', 'corner']) {
      for (const study of makeGestureStudies({ seed, pathVariant })) {
        const pixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), sceneSaved = JSON.stringify(variant.scene);
          const parsed = JSON.parse(saved), recompiled = compileBrushRecipe(parsed.recipe);
          const complete = capture(variant.scene), partial = capture(variant.scene, .74);
          capture(variant.scene, 1.6); capture(variant.scene, .18);
          const replay = capture(JSON.parse(sceneSaved));
          const sourceReplay = capture(gestureScene([{ ...parsed, result: recompiled }], seed));
          pixels.push(complete);
          results.push({ pathVariant, study: study.id, variant: variant.id,
            compiledSourceEqual: same(recompiled, parsed.result),
            savedResultPixelEqual: equalPixels(complete, replay), semanticRecompilePixelEqual: equalPixels(complete, sourceReplay),
            partialChangesPixels: !equalPixels(complete, partial),
            inputUnchanged: saved === JSON.stringify(variant.document) && sceneSaved === JSON.stringify(variant.scene) });
        }
        pairs.push({ pathVariant, study: study.id, actionChangesPixels: !equalPixels(pixels[0], pixels[1]),
          thirdVariantChangesPixels: !equalPixels(pixels[1], pixels[2]) });
        const [baseline, variable, combined] = study.variants.map(variant => variant.document);
        const key = study.id === 'entry' ? 'entry' : study.id === 'finish' ? 'finish' : 'turn';
        isolation.push({ pathVariant, study: study.id,
          authorPathUnchanged: same(baseline.recipe.points, variable.recipe.points) && same(variable.recipe.points, combined.recipe.points),
          isolatedActionSetting: same(omit(baseline.recipe.options, key), omit(variable.recipe.options, key)),
          thirdVariantIsolation: study.id === 'finish'
            ? same(omit(variable.recipe.options, 'finish'), omit(combined.recipe.options, 'finish'))
            : same(variable.result.points, combined.result.points)
              && same(omit(variable.recipe.options, 'controls'), omit(combined.recipe.options, 'controls')),
        });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    const common = { seed, width: 34, gestureModel: 'local-v1', smoothing: 'linear', dryness: .2, strength: 1 };
    const path = gesturePath('straight');
    const fullEntry = createBrushDocument(path, { ...common, entry: 'exposed' });
    const fullFinish = createBrushDocument(path, { ...common, finish: 'open' });
    const fullReturn = createBrushDocument(path, { ...common, finish: 'return' });
    const neutral = createBrushDocument(path, { ...common, strength: 0, entry: 'concealed', finish: 'return', turn: 'round',
      controls: [{ at: 0, side: .7, dryness: .8 }, { at: 1, side: .7, dryness: .8 }] });
    const none = createBrushDocument(path, { ...common, strength: 0 });
    const neutralContact = sampleBrushContact(neutral.result);
    const zeroGeometry = { strengthZeroKeepsPath: same(neutral.result.points, none.result.points),
      strengthZeroKeepsContactIndependent: neutralContact.every(sample => Math.abs(sample.side - .7) < 1e-12 && Math.abs(sample.dryness - .8) < 1e-12) };
    const endpoints = { exposedStartsLifted: sampleBrushContact(fullEntry.result)[0].halfWidth === 0,
      openFinishesLifted: sampleBrushContact(fullFinish.result).at(-1).halfWidth === 0,
      returnMovesInside: fullReturn.result.points.at(-1).x < path.at(-1).x,
      returnFinishesLifted: sampleBrushContact(fullReturn.result).at(-1).halfWidth === 0 };
    const strength = {};
    for (const [name, option, value] of [['entry', 'entry', 'concealed'], ['finish', 'finish', 'open'], ['turn', 'turn', 'round']]) {
      const source = gesturePath('corner', name === 'turn');
      const strong = createBrushDocument(source, { ...common, [option]: value, strength: 1 });
      const weak = createBrushDocument(source, { ...common, [option]: value, strength: .25 });
      strength[`${name}ChangesGeometry`] = !same(strong.result.points, weak.result.points);
    }
    const blank = createBrushDocument(path.map(point => ({ ...point, pressure: 0 })), {
      ...common, entry: 'concealed', finish: 'return', turn: 'angular',
    });
    const empty = createInkScene({ ...gestureSize, seed }).snapshot();
    const zeroPressureStaysBlank = equalPixels(capture(gestureScene([blank], seed)), capture(empty));
    const composition = makeGestureComposition({ seed });
    const compositionSaved = JSON.stringify(composition.scene);
    const complete = capture(composition.scene);
    capture(composition.scene, .3); capture(composition.scene, 1.7);
    const compositionChecks = { compositionTimeChangesPixels: !equalPixels(complete, capture(composition.scene, .7)),
      compositionReplayEqual: equalPixels(complete, capture(JSON.parse(compositionSaved))),
      independentIds: composition.documents[0].result.id !== composition.documents[1].result.id,
      twoEditableSources: composition.documents.every(document => document.recipe.points.length > 1 && document.recipe.generator === 'ink-brush-local-gestures-v1') };
    let unknownVersionRejected = false;
    try { compileBrushRecipe({ ...fullEntry.recipe, generator: 'unsupported-gesture-generator' }); } catch { unknownVersionRejected = true; }
    renderTimes.sort((a, b) => a - b);
    return { passed: results.every(flags) && pairs.every(flags) && isolation.every(flags) && flags(zeroGeometry) && flags(endpoints)
        && flags(strength) && zeroPressureStaysBlank && flags(compositionChecks) && unknownVersionRejected,
      seed, paths: 3, studyGroups: 3, studyVariants: results.length, results, pairs, isolation, zeroGeometry, endpoints, strength,
      zeroPressureStaysBlank, compositionChecks, unknownVersionRejected,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0,
        canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: renderTimes.length, medianMs: renderTimes[Math.floor(renderTimes.length / 2)],
        p95Ms: renderTimes[Math.ceil(renderTimes.length * .95) - 1], scope: 'renderCanvas only; pixel readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '数据重建、动作隔离、端点和时间重放观察；不自动判断传统技法成立或艺术验收。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
