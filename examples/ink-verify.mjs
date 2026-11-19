import { renderInkProcess, rasterizeInkProcess, createInkProcessDocument, compileInkProcessRecipe, reviseInkProcessDocument } from '../dist/index.js';
import { makeInkStudies, editInkLayer, inkInputs, inkSize } from './ink-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const equalPixels = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const omit = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const sum = values => values.reduce((total, value) => total + value, 0);
const nonDryMaterialSource = stroke => {
  const options = stroke.options ?? {};
  // Only added dryness-only anchors disappear here. Pressure, side, angle,
  // inkLoad and every other authored option still participate in equality.
  const controls = (options.controls ?? []).map(control => omit(control, 'dryness'))
    .filter(control => Object.keys(control).some(key => key !== 'at'));
  return { points: stroke.points, options: { ...omit(options, 'dryness', 'seed', 'controls'),
    ...(controls.length ? { controls } : {}) } };
};

/** Engineering observations in the current browser; these are not artistic acceptance. */
export async function verifyInkStudies({ seed = inkInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = inkSize.width; canvas.height = inkSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), renderTimes = [];
  const capture = (process, time = 8) => {
    const start = performance.now(); renderInkProcess(context, process, { time, cellSize: 1 }); renderTimes.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], isolation = [], editing = [], wetConditions = [];
  try {
    for (const layout of ['ridge', 'arc', 'fold']) {
      const studies = makeInkStudies({ seed, layout });
      for (const study of studies) {
        const pixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), parsed = JSON.parse(saved), recompiled = compileInkProcessRecipe(parsed.recipe);
          const complete = capture(variant.document.result), initial = capture(variant.document.result, 0);
          capture(variant.document.result, 5); capture(variant.document.result, .2);
          const afterSeek = capture(variant.document.result), replay = capture(parsed.result), sourceReplay = capture(recompiled);
          const hasLaterLayer = variant.document.result.layers.some(layer => layer.at > 0); pixels.push(complete);
          results.push({ layout, study: study.id, variant: variant.id, layers: recompiled.layers.length,
            compiledSourceEqual: same(recompiled, parsed.result), savedResultPixelEqual: equalPixels(complete, replay),
            semanticRecompilePixelEqual: equalPixels(complete, sourceReplay), outOfOrderTimeEqual: equalPixels(complete, afterSeek),
            eventVisibilityMatchesSource: hasLaterLayer ? !equalPixels(complete, initial) : equalPixels(complete, initial),
            inputUnchanged: saved === JSON.stringify(variant.document) });
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        pairs.push({ layout, study: study.id, secondVariantChangesPixels: !equalPixels(pixels[0], pixels[1]), thirdVariantChangesPixels: !equalPixels(pixels[1], pixels[2]) });
        const [first, second, third] = study.variants.map(variant => variant.document);
        if (study.id === 'tone') isolation.push({ layout, study: study.id,
          optionsUnchanged: same(first.recipe.options, second.recipe.options) && same(second.recipe.options, third.recipe.options),
          onlyConcentrationChanged: same(first.recipe.layers.map(layer => omit(layer, 'concentration')), second.recipe.layers.map(layer => omit(layer, 'concentration')))
            && same(second.recipe.layers.map(layer => omit(layer, 'concentration')), third.recipe.layers.map(layer => omit(layer, 'concentration'))),
          geometryAndMaterialsUnchanged: same(first.result.layers[0].marks, second.result.layers[0].marks) && same(second.result.layers[0].marks, third.result.layers[0].marks) });
        if (study.id === 'layered') {
          const originalStrokes = first.recipe.layers[0].strokes;
          const dryness = [.15, .34, .52], phases = [0, 0x593167af, 0x19d756c3];
          const profiles = [null, [[0, .42], [.34, .34], [.72, .46], [1, .54]],
            [[0, .60], [.34, .52], [.72, .64], [1, .72]]];
          const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-12;
          const authoredDryness = document => document.recipe.layers.every((layer, layerIndex) => layer.strokes.every(stroke => {
            const controls = stroke.options.controls ?? [], expected = profiles[layerIndex];
            return close(stroke.options.dryness, dryness[layerIndex]) && (expected === null ? controls.length === 0
              : controls.length === expected.length && controls.every((control, i) => close(control.at, expected[i][0])
                && close(control.dryness, expected[i][1]) && Object.keys(control).every(key => key === 'at' || key === 'dryness')));
          }));
          isolation.push({ layout, study: study.id, firstLayerUnchanged: same(first.recipe.layers[0], second.recipe.layers[0]) && same(second.recipe.layers[0], third.recipe.layers[0]),
            repeatedRetainsPaths: second.recipe.layers.every(layer => same(layer.strokes.map(stroke => stroke.points), originalStrokes.map(stroke => stroke.points))),
            repeatedRetainsNonDrynessControlsAndOtherOptions: second.recipe.layers.every(layer => same(layer.strokes.map(nonDryMaterialSource), originalStrokes.map(nonDryMaterialSource))),
            laterDrynessProfilesExplicitAndIncreasing: authoredDryness(second) && authoredDryness(third)
              && dryness[0] < dryness[1] && dryness[1] < dryness[2],
            laterMaterialSeedsExplicitAndDistinct: [second, third].every(document => document.recipe.layers.every((layer, layerIndex) => layer.strokes.every((stroke, i) => {
              const expected = (originalStrokes[i].options.seed ^ phases[layerIndex]) >>> 0;
              return stroke.options.seed === expected && document.result.layers[layerIndex].marks[i].seed === expected
                && (layerIndex === 0 || expected !== originalStrokes[i].options.seed);
            }))) && second.recipe.layers[1].strokes.every((stroke, i) => stroke.options.seed !== second.recipe.layers[2].strokes[i].options.seed),
            layerMaterialSeedsStableAcrossOrganization: second.recipe.layers.every((layer, i) => layer.strokes.every((stroke, s) => stroke.options.seed === third.recipe.layers[i].strokes[s].options.seed)),
            laterPathsExplicitlyChanged: !same(second.recipe.layers[1].strokes.map(stroke => stroke.points), third.recipe.layers[1].strokes.map(stroke => stroke.points))
              && !same(second.recipe.layers[2].strokes.map(stroke => stroke.points), third.recipe.layers[2].strokes.map(stroke => stroke.points)),
            everyAdditionalLayerAfterDryWindow: second.recipe.layers.slice(1).every((layer, i) => layer.at >= second.recipe.layers[i].at + second.recipe.layers[i].dryAfter) });
          const originalSaved = JSON.stringify(third), id = third.recipe.layers[2].id, changed = editInkLayer(third, id, { dx: 13, concentration: .52 });
          editing.push({ layout, selectedSourceChanges: !same(third.recipe.layers[2], changed.recipe.layers[2]),
            otherSourceLayersUnchanged: third.recipe.layers.slice(0, 2).every((layer, i) => same(layer, changed.recipe.layers[i])),
            otherCompiledLayersUnchanged: third.result.layers.slice(0, 2).every((layer, i) => same(layer, changed.result.layers[i])),
            selectedMaterialSeedsStable: third.result.layers[2].marks.every((mark, i) => mark.seed === changed.result.layers[2].marks[i].seed),
            originalUnchanged: originalSaved === JSON.stringify(third) });
        }
        if (study.id === 'broken') {
          isolation.push({ layout, study: study.id, onlyArrivalTimeChangesDryVsWet: same(first.recipe.options, second.recipe.options)
            && same(first.recipe.layers.map(layer => omit(layer, 'at')), second.recipe.layers.map(layer => omit(layer, 'at'))),
            reverseKeepsPathsAndWater: second.recipe.layers.every((layer, i) => same(omit(layer, 'concentration'), omit(third.recipe.layers[i], 'concentration'))),
            reverseExplicitlyChangesConcentration: second.recipe.layers.every((layer, i) => layer.concentration !== third.recipe.layers[i].concentration) });
          const glazed = reviseInkProcessDocument(second, { layers: second.recipe.layers.map(layer => ({ ...layer, mode: 'glaze' })) });
          const dryGlazed = reviseInkProcessDocument(first, { layers: first.recipe.layers.map(layer => ({ ...layer, mode: 'glaze' })) });
          const zeroWater = reviseInkProcessDocument(second, { layers: second.recipe.layers.map(layer => ({ ...layer, water: 0 })) });
          const zeroWaterGlazed = reviseInkProcessDocument(zeroWater, { layers: zeroWater.recipe.layers.map(layer => ({ ...layer, mode: 'glaze' })) });
          const wetFrame = rasterizeInkProcess(second.result, { time: 8, cellSize: 1 }), glazedFrame = rasterizeInkProcess(glazed.result, { time: 8, cellSize: 1 });
          const sentinel = { id: 'far-sentinel', concentration: .35, water: 0, at: 6, dryAfter: 0, mode: 'glaze', strokes: [{
            points: [{ x: 20, y: 40, pressure: 0 }, { x: 70, y: 30, pressure: 1 }, { x: 140, y: 50, pressure: 0 }],
            options: { id: 'far-sentinel-stroke', width: 18, seed: seed ^ 179, axis: 'center', dryness: .15 },
          }] };
          const wetSentinel = createInkProcessDocument([...second.recipe.layers, sentinel], second.recipe.options);
          const glazeSentinel = createInkProcessDocument([...glazed.recipe.layers, sentinel], glazed.recipe.options);
          const wetFar = rasterizeInkProcess(wetSentinel.result, { time: 8, cellSize: 1 }), glazeFar = rasterizeInkProcess(glazeSentinel.result, { time: 8, cellSize: 1 });
          let farFieldEqual = true, farFieldInkCells = 0;
          for (let y = 0; y < wetFar.rows; y++) for (let x = 0; x < wetFar.columns; x++) {
            if ((x + .5) * wetFar.cellSize >= 150 || (y + .5) * wetFar.cellSize >= 70) continue;
            const index = y * wetFar.columns + x;
            if (glazeFar.density[index] > 0) farFieldInkCells++;
            if (wetFar.density[index] !== glazeFar.density[index]) farFieldEqual = false;
          }
          const wetMass = sum(wetFrame.density), dryMass = sum(glazedFrame.density);
          const dryBaseLayer = { ...second.recipe.layers[0], id: 'dry-base', at: 0, dryAfter: 1, concentration: .6 };
          const dryBase = createInkProcessDocument([dryBaseLayer], second.recipe.options);
          const laterWater = createInkProcessDocument([dryBaseLayer,
            { ...second.recipe.layers[0], id: 'water-first', at: 3, dryAfter: 2, concentration: 0, water: .9, mode: 'wet-mix' },
            { ...second.recipe.layers[1], id: 'water-second', at: 3.5, dryAfter: 2, concentration: 0, water: .9, mode: 'wet-mix' },
          ], second.recipe.options);
          const dryBaseDensity = rasterizeInkProcess(dryBase.result, { time: 8, cellSize: 1 }).density;
          const laterWaterDensity = rasterizeInkProcess(laterWater.result, { time: 8, cellSize: 1 }).density;
          wetConditions.push({ layout, wetChangesPixels: !equalPixels(pixels[1], capture(glazed.result)),
            expiredWindowMatchesGlaze: equalPixels(pixels[0], capture(dryGlazed.result)),
            zeroWaterMatchesGlaze: equalPixels(capture(zeroWater.result), capture(zeroWaterGlazed.result)),
            wetDensityNonnegative: wetFrame.density.every(value => Number.isFinite(value) && value >= 0),
            densityMassRetained: Math.abs(wetMass - dryMass) <= Math.max(1e-5, dryMass * .003),
            farFieldUnchanged: farFieldEqual && farFieldInkCells > 0,
            dryBaseUnaffectedByLaterPureWater: equalPixels(dryBaseDensity, laterWaterDensity),
            farFieldInkCells, relativeMassDifference: Math.abs(wetMass - dryMass) / Math.max(1e-8, dryMass),
            scope: 'far field is an authored covered sentinel region at x<150,y<70; not a proof for all inputs' });
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    const defaults = makeInkStudies({ seed }), concentration = makeInkStudies({ seed, concentration: .3 }),
      accumulation = makeInkStudies({ seed, accumulation: .3 }), interval = makeInkStudies({ seed, interval: 3 });
    const groupSame = (a, b) => same(a.variants.map(variant => variant.document), b.variants.map(variant => variant.document));
    const controls = {
      concentrationOnlyChangesDarkVariant: same(defaults[0].variants.slice(0, 2), concentration[0].variants.slice(0, 2))
        && !same(defaults[0].variants[2].document.result, concentration[0].variants[2].document.result) && groupSame(defaults[1], concentration[1]) && groupSame(defaults[2], concentration[2]),
      accumulationOnlyChangesLayeredLaterConcentrations: groupSame(defaults[0], accumulation[0]) && groupSame(defaults[2], accumulation[2])
        && same(defaults[1].variants[0].document, accumulation[1].variants[0].document)
        && !same(defaults[1].variants[1].document.result, accumulation[1].variants[1].document.result),
      intervalOnlyChangesWetAndReverseArrival: groupSame(defaults[0], interval[0]) && groupSame(defaults[1], interval[1])
        && same(defaults[2].variants[0].document, interval[2].variants[0].document)
        && defaults[2].variants.slice(1).every((variant, i) => !same(variant.document, interval[2].variants[i + 1].document)),
    };
    const zero = reviseInkProcessDocument(defaults[0].variants[2].document, { layers: defaults[0].variants[2].document.recipe.layers.map(layer => ({ ...layer, concentration: 0 })) });
    const blank = createInkProcessDocument([], zero.recipe.options), zeroConcentrationStaysBlank = equalPixels(capture(zero.result), capture(blank.result));
    let unknownVersionRejected = false, unknownGeneratorRejected = false, incompleteCompiledMarkRejected = false;
    try { compileInkProcessRecipe({ ...zero.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileInkProcessRecipe({ ...zero.recipe, generator: 'unsupported-ink-process' }); } catch { unknownGeneratorRejected = true; }
    const incomplete = JSON.parse(JSON.stringify(defaults[0].variants[0].document.result));
    delete incomplete.layers[0].marks[0].opacity;
    try { rasterizeInkProcess(incomplete, { time: 8, cellSize: 1 }); } catch { incompleteCompiledMarkRejected = true; }
    renderTimes.sort((a, b) => a - b);
    return { passed: results.every(flags) && pairs.every(flags) && isolation.every(flags) && editing.every(flags) && wetConditions.every(flags)
        && flags(controls) && zeroConcentrationStaysBlank && unknownVersionRejected && unknownGeneratorRejected && incompleteCompiledMarkRejected,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, isolation, editing, wetConditions, controls,
      zeroConcentrationStaysBlank, unknownVersionRejected, unknownGeneratorRejected, incompleteCompiledMarkRejected,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, cellSize: 1, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: renderTimes.length, medianMs: renderTimes[Math.floor(renderTimes.length / 2)], p95Ms: renderTimes[Math.ceil(renderTimes.length * .95) - 1], scope: 'renderInkProcess only; readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '默认对照的可复现、浓度与时序隔离、层编辑及局部有限交换；不自动确认传统墨法成立。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
