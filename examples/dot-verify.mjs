import { renderCanvas, createDotDocument, compileDotRecipe, reviseDotDocument, createInkScene } from '../dist/index.js';
import { makeDotStudies, editDotPlacement, dotScene, dotInputs, dotSize } from './dot-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const equalPixels = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);

/** Browser engineering observations. Visible differences are not artistic acceptance. */
export async function verifyDotStudies({ seed = dotInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = dotSize.width; canvas.height = dotSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), renderTimes = [];
  const capture = (scene, time = 4) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); renderTimes.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [], isolation = [], editing = [];
  try {
    for (const layout of ['straight', 'arc', 'slope']) {
      for (const study of makeDotStudies({ seed, layout })) {
        const pixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), sceneSaved = JSON.stringify(variant.scene);
          const parsed = JSON.parse(saved), recompiled = compileDotRecipe(parsed.recipe);
          const complete = capture(variant.scene), partial = capture(variant.scene, .32);
          capture(variant.scene, 1.2); capture(variant.scene, .12);
          const afterSeek = capture(variant.scene), replay = capture(JSON.parse(sceneSaved));
          const sourceReplay = capture(dotScene({ ...parsed, result: recompiled }, seed)); pixels.push(complete);
          results.push({ layout, study: study.id, variant: variant.id, strokes: recompiled.length,
            compiledSourceEqual: same(recompiled, parsed.result), savedResultPixelEqual: equalPixels(complete, replay),
            semanticRecompilePixelEqual: equalPixels(complete, sourceReplay), outOfOrderTimeEqual: equalPixels(complete, afterSeek),
            partialChangesPixels: !equalPixels(complete, partial), inputUnchanged: saved === JSON.stringify(variant.document) && sceneSaved === JSON.stringify(variant.scene) });
        }
        pairs.push({ layout, study: study.id, secondVariantChangesPixels: !equalPixels(pixels[0], pixels[1]), thirdVariantChangesPixels: !equalPixels(pixels[1], pixels[2]) });
        const [baseline, variable, combined] = study.variants.map(variant => variant.document);
        if (study.id === 'press') isolation.push({ layout, study: study.id,
          positionsUnchanged: same(baseline.recipe.positions, variable.recipe.positions) && same(variable.recipe.positions, combined.recipe.positions),
          onlyPressureControlsChanged: same(omit(baseline.recipe.options, 'controls'), omit(variable.recipe.options, 'controls')),
          thirdRetainsPressureControls: same(variable.recipe.options.controls, combined.recipe.options.controls),
          onlySideAxisAdded: same(omit(variable.recipe.options, 'axis'), omit(combined.recipe.options, 'axis')) });
        else if (study.id === 'direction') isolation.push({ layout, study: study.id,
          positionsUnchanged: same(baseline.recipe.positions, variable.recipe.positions) && same(variable.recipe.positions, combined.recipe.positions),
          onlyAngleChanged: same(omit(baseline.recipe.options, 'angle'), omit(variable.recipe.options, 'angle')) && same(omit(variable.recipe.options, 'angle'), omit(combined.recipe.options, 'angle')) });
        else {
          isolation.push({ layout, study: study.id,
            sameStyleCollection: same(baseline.recipe.options, variable.recipe.options) && same(variable.recipe.options, combined.recipe.options),
            onlyPositionsChanged: baseline.recipe.positions.every((point, i) => same(omit(point, 'x', 'y'), omit(variable.recipe.positions[i], 'x', 'y'))),
            respondingKeepsPositions: variable.recipe.positions.every((point, i) => same(omit(point, 'angle'), omit(combined.recipe.positions[i], 'angle'))),
            stablePerIdMaterialSeeds: baseline.result.every((mark, i) => mark.seed === variable.result[i].seed && mark.seed === combined.result[i].seed) });
          const originalSaved = JSON.stringify(combined), selectedId = combined.recipe.positions[3].id;
          const moved = editDotPlacement(combined, selectedId, { dx: 17, dy: -11, angle: .4 });
          const reordered = reviseDotDocument(combined, { positions: [...combined.recipe.positions].reverse() });
          const movedIndex = combined.recipe.positions.findIndex(point => point.id === selectedId);
          const reorderedById = new Map(reordered.result.map(mark => [mark.id, mark]));
          editing.push({ layout, movingChangesSelected: !same(combined.result[movedIndex], moved.result[movedIndex]),
            movingKeepsSelectedSeed: combined.result[movedIndex].seed === moved.result[movedIndex].seed,
            allOtherMarksUnchanged: combined.result.every((mark, i) => i === movedIndex || same(mark, moved.result[i])),
            reorderingKeepsIdResults: combined.result.every(mark => same(mark, reorderedById.get(mark.id))),
            originalUnchanged: originalSaved === JSON.stringify(combined) });
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    const defaults = makeDotStudies({ seed }), changedPress = makeDotStudies({ seed, press: .2 }),
      changedSpacing = makeDotStudies({ seed, spacing: .2 }), changedResponse = makeDotStudies({ seed, response: .2 });
    const groupSame = (a, b) => same(a.variants.map(variant => variant.document), b.variants.map(variant => variant.document));
    const controls = {
      pressChangesLocalContact: !same(defaults[0].variants[1].document.result, changedPress[0].variants[1].document.result),
      pressKeepsBaselineAndOtherGroups: same(defaults[0].variants[0].document, changedPress[0].variants[0].document) && groupSame(defaults[1], changedPress[1]) && groupSame(defaults[2], changedPress[2]),
      spacingChangesGroupPositions: !same(defaults[2].variants[1].document.recipe.positions, changedSpacing[2].variants[1].document.recipe.positions),
      spacingKeepsBaselineAndOtherGroups: same(defaults[2].variants[0].document, changedSpacing[2].variants[0].document) && groupSame(defaults[0], changedSpacing[0]) && groupSame(defaults[1], changedSpacing[1]),
      responseChangesOnlyThirdGroupVariant: !same(defaults[2].variants[2].document.result, changedResponse[2].variants[2].document.result)
        && same(defaults[2].variants[0].document, changedResponse[2].variants[0].document) && same(defaults[2].variants[1].document, changedResponse[2].variants[1].document)
        && groupSame(defaults[0], changedResponse[0]) && groupSame(defaults[1], changedResponse[1]),
    };
    const zero = createDotDocument([{ id: 'zero', x: 240, y: 120, pressure: 0 }], { seed, size: 55, axis: 'side', controls: [{ at: 0, pressure: 1 }, { at: 1, pressure: 1 }] });
    const empty = createInkScene({ ...dotSize, seed }).snapshot();
    const zeroPressureStaysBlank = equalPixels(capture(dotScene(zero, seed)), capture(empty));
    let unknownVersionRejected = false, unknownGeneratorRejected = false;
    try { compileDotRecipe({ ...zero.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileDotRecipe({ ...zero.recipe, generator: 'unsupported-dot-generator' }); } catch { unknownGeneratorRejected = true; }
    renderTimes.sort((a, b) => a - b);
    return { passed: results.every(flags) && pairs.every(flags) && isolation.every(flags) && editing.every(flags) && flags(controls)
        && zeroPressureStaysBlank && unknownVersionRejected && unknownGeneratorRejected,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, isolation, editing, controls,
      zeroPressureStaysBlank, unknownVersionRejected, unknownGeneratorRejected,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: renderTimes.length, medianMs: renderTimes[Math.floor(renderTimes.length / 2)], p95Ms: renderTimes[Math.ceil(renderTimes.length * .95) - 1], scope: 'renderCanvas only; readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '源数据、方向与疏密隔离、逐点编辑和时间重放；不自动判断传统点法成立或艺术验收。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
