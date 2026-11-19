import { renderCanvas, createBrushDocument, reviseBrushDocument, compileBrushRecipe, sampleBrushContact, createInkScene } from '../dist/index.js';
import { makeFoundationStudies, makeFoundationComposition, foundationScene, foundationInputs, foundationSize } from './foundation-fixtures.mjs';

const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

/** Real-browser engineering checks. Pixel difference is not an artistic score. */
export async function verifyFoundationStudies({ seed = foundationInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = foundationSize.width; canvas.height = foundationSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const renderTimes = [];
  const capture = (scene, time = 3) => {
    const start = performance.now(); renderCanvas(context, scene, { time, paperTexture: 0 }); renderTimes.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const results = [], pairs = [];
  try {
    for (const pathVariant of ['straight', 'curve', 'corner']) {
      for (const study of makeFoundationStudies({ seed, pathVariant })) {
        const variantPixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), sceneSaved = JSON.stringify(variant.scene);
          const parsed = JSON.parse(saved), recompiled = compileBrushRecipe(parsed.recipe);
          const complete = capture(variant.scene), partial = capture(variant.scene, .72);
          capture(variant.scene, 1.53); capture(variant.scene, .2);
          const replay = capture(JSON.parse(sceneSaved));
          const sourceReplay = capture(foundationScene([{ ...parsed, result: recompiled }], seed));
          variantPixels.push(complete);
          results.push({ pathVariant, study: study.id, variant: variant.id,
            compiledSourceEqual: JSON.stringify(recompiled) === JSON.stringify(parsed.result),
            savedResultPixelEqual: equal(complete, replay), semanticRecompilePixelEqual: equal(complete, sourceReplay),
            partialChangesPixels: !equal(complete, partial), inputUnchanged: saved === JSON.stringify(variant.document) && sceneSaved === JSON.stringify(variant.scene) });
        }
        pairs.push({ pathVariant, study: study.id, variableChangesPixels: !equal(variantPixels[0], variantPixels[1]), combinationChangesPixels: !equal(variantPixels[1], variantPixels[2]) });
        await nextFrame();
      }
    }
    const editable = createBrushDocument([{ x: 64, y: 125, pressure: .7 }, { x: 495, y: 125, pressure: .7 }], {
      id: 'isolated-edit', width: 36, seed, controls: [
        { at: 0, pressure: .4, side: 0, dryness: .12 },
        { at: .5, pressure: 1, side: .6, dryness: .5 },
        { at: 1, pressure: .4, side: 1, dryness: .85 },
      ],
    });
    const before = JSON.stringify(editable);
    const revised = reviseBrushDocument(editable, { options: { controls: editable.recipe.options.controls.map(control => ({ ...control, pressure: (control.pressure ?? 1) * .55 })) } });
    const contactBefore = sampleBrushContact(editable.result), contactAfter = sampleBrushContact(revised.result);
    const unaffected = samples => samples.map(sample => [sample.x, sample.y, sample.distance, sample.side, sample.angle, sample.dryness, sample.inkLoad]);
    const localEdit = {
      pressureChangesPixels: !equal(capture(foundationScene([editable], seed)), capture(foundationScene([revised], seed))),
      unrelatedChannelsUnchanged: JSON.stringify(unaffected(contactBefore)) === JSON.stringify(unaffected(contactAfter)),
      originalDocumentUnchanged: JSON.stringify(editable) === before,
      editedDocumentRoundTrips: JSON.stringify(compileBrushRecipe(JSON.parse(JSON.stringify(revised)).recipe)) === JSON.stringify(revised.result),
    };
    const blank = createBrushDocument([{ x: 60, y: 120, pressure: 0 }, { x: 500, y: 120, pressure: 0 }], { seed, width: 36, axis: 'side', controls: [{ at: 0, pressure: 1, dryness: .1 }, { at: 1, pressure: 1, dryness: .9 }] });
    const empty = createInkScene({ ...foundationSize, seed }).snapshot();
    const zeroPressureStaysBlank = equal(capture(foundationScene([blank], seed)), capture(empty));

    const uniform = dryness => createBrushDocument([{ x: 60, y: 120, pressure: .85 }, { x: 500, y: 120, pressure: .85 }], { seed, width: 36, dryness, opacity: .94 });
    const wet = uniform(.10), dry = uniform(.90);
    const background = capture(empty), wetPixels = capture(foundationScene([wet], seed)), dryPixels = capture(foundationScene([dry], seed));
    let wetInkPixels = 0, dryInkPixels = 0, inspectedPixels = 0;
    for (let y = 112; y < 128; y++) for (let x = 150; x < 430; x++) {
      const index = (y * canvas.width + x) * 4;
      const inked = pixels => Math.abs(pixels[index] - background[index]) + Math.abs(pixels[index + 1] - background[index + 1]) + Math.abs(pixels[index + 2] - background[index + 2]) > 24;
      if (inked(wetPixels)) wetInkPixels++; if (inked(dryPixels)) dryInkPixels++; inspectedPixels++;
    }
    const dryContact = { wetInkPixels, dryInkPixels, inspectedPixels,
      wetContactHasInk: wetInkPixels > inspectedPixels * .85,
      dryContactHasInk: dryInkPixels > 0,
      dryContactRevealsMorePaper: dryInkPixels < wetInkPixels * .95 };
    const changedSeed = reviseBrushDocument(dry, { options: { seed: (seed + 1) >>> 0 } });
    const seedChangesPixels = !equal(dryPixels, capture(foundationScene([changedSeed], seed)));
    const composition = makeFoundationComposition({ seed });
    const compositionTimeChangesPixels = !equal(capture(composition.scene, .7), capture(composition.scene, 3));
    const original = makeFoundationStudies({ seed, pathVariant: 'straight' }), moved = makeFoundationStudies({ seed, pathVariant: 'curve' });
    const transferChangesGeometry = JSON.stringify(original[0].variants[0].document.recipe.points) !== JSON.stringify(moved[0].variants[0].document.recipe.points);
    let unknownVersionRejected = false;
    try { compileBrushRecipe({ ...dry.recipe, generator: 'future-unsupported-generator' }); } catch { unknownVersionRejected = true; }
    const allFlags = object => Object.entries(object).filter(([, value]) => typeof value === 'boolean').every(([, value]) => value);
    renderTimes.sort((a, b) => a - b);
    return { passed: results.every(allFlags) && pairs.every(allFlags) && allFlags(localEdit) && allFlags(dryContact)
        && zeroPressureStaysBlank && seedChangesPixels && compositionTimeChangesPixels && transferChangesGeometry && unknownVersionRejected,
      seed, paths: 3, studyGroups: 3, studyVariants: results.length, results, pairs, localEdit, dryContact,
      zeroPressureStaysBlank, seedChangesPixels, compositionTimeChangesPixels, transferChangesGeometry, unknownVersionRejected,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, paperTexture: 0, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: renderTimes.length, medianMs: renderTimes[Math.floor(renderTimes.length / 2)], p95Ms: renderTimes[Math.ceil(renderTimes.length * .95) - 1], scope: 'renderCanvas only; pixel readback excluded' },
      artisticValidation: 'unreviewed', scope: '工程复现、控制语义和露纸观察；不自动判定传统技法成立、艺术改善或用户验收。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
