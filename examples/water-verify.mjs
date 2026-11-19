import { renderInkProcess, rasterizeInkProcess, createWaterProcessDocument, compileWaterProcessRecipe } from '../dist/index.js';
import { makeWaterStudies, editWaterEvent, editWaterDroplet, waterInputs, waterSize } from './water-fixtures.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const omit = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const flags = object => Object.values(object).filter(value => typeof value === 'boolean').every(Boolean);
const mass = values => values.reduce((sum, value) => sum + value, 0);

/** Browser engineering checks; artistic evaluation deliberately remains deferred. */
export async function verifyWaterStudies({ seed = waterInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = waterSize.width; canvas.height = waterSize.height;
  const context = canvas.getContext('2d', { willReadFrequently: true }), renderTimes = [];
  const capture = (process, time = 8) => {
    const start = performance.now(); renderInkProcess(context, process, { time, cellSize: 1 }); renderTimes.push(performance.now() - start);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const frame = document => rasterizeInkProcess(document.result, { time: 8, cellSize: 1 });
  const results = [], pairs = [], isolation = [], editing = [], waterConditions = [];
  try {
    for (const layout of ['ridge', 'arc', 'fold']) {
      const studies = makeWaterStudies({ seed, layout });
      for (const study of studies) {
        const pixels = [];
        for (const variant of study.variants) {
          const saved = JSON.stringify(variant.document), parsed = JSON.parse(saved), recompiled = compileWaterProcessRecipe(parsed.recipe);
          const complete = capture(variant.document.result); capture(variant.document.result, .2); capture(variant.document.result, 5); capture(variant.document.result, -.1);
          const afterSeek = capture(variant.document.result), replay = capture(parsed.result), sourceReplay = capture(recompiled); pixels.push(complete);
          const prelude = rasterizeInkProcess(variant.document.result, { time: -.1, cellSize: 1 });
          const initial = rasterizeInkProcess(variant.document.result, { time: 0, cellSize: 1 });
          const activeAtZero = variant.document.result.layers.filter(layer => layer.at <= 0).length;
          results.push({ layout, study: study.id, variant: variant.id, compiledSourceEqual: same(recompiled, parsed.result),
            savedResultPixelEqual: pixelsEqual(complete, replay), sourceRecompilePixelEqual: pixelsEqual(complete, sourceReplay),
            outOfOrderTimeEqual: pixelsEqual(complete, afterSeek), blankPrelude: prelude.density.every(value => value === 0),
            absoluteEventCount: initial.activeLayers === activeAtZero, inputUnchanged: saved === JSON.stringify(variant.document) });
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        pairs.push({ layout, study: study.id, dryOrNoWaterMatchesBaseline: study.id === 'droplets' ? true : pixelsEqual(pixels[0], pixels[1]),
          wetContactChangesPixels: !pixelsEqual(pixels[0], pixels[2]),
          afterContactChangesPixels: study.id === 'droplets' ? !pixelsEqual(pixels[0], pixels[1]) : true,
          orderComparison: study.id === 'droplets' ? (pixelsEqual(pixels[1], pixels[2]) ? 'same pixels' : 'different pixels; may arise from event identity noise, not proof of physical order effects') : 'not applicable' });
        const [first, second, third] = study.variants.map(variant => variant.document);
        if (study.id !== 'droplets') isolation.push({ layout, study: study.id,
          dryWetOnlyArrivalChanges: same(second.recipe.options, third.recipe.options)
            && same(second.recipe.events.map(event => omit(event, 'at')), third.recipe.events.map(event => omit(event, 'at'))),
          inkContactsUnchanged: [second, third].every(document => same(first.recipe.events.find(event => event.kind === 'ink').strokes,
            document.recipe.events.find(event => event.kind === 'ink').strokes)) });
        else isolation.push({ layout, study: study.id,
          sameInkAndWaterContacts: second.recipe.events.every(event => same(omit(event, 'at'), omit(third.recipe.events.find(other => other.id === event.id), 'at'))),
          sourceOrderExplicitlyReversed: second.recipe.events[0].kind === 'ink' && third.recipe.events[0].kind === 'water' });
        const baseFrame = frame(first), wetFrame = frame(third), afterFrame = frame(second), baselineMass = mass(baseFrame.density);
        const pureEvent = (study.id === 'ink-after' ? third.recipe.events[0] : second.recipe.events[1]);
        const pure = createWaterProcessDocument([{ ...pureEvent, at: 0 }], first.recipe.options);
        const empty = createWaterProcessDocument([], first.recipe.options);
        const noWater = createWaterProcessDocument(third.recipe.events.map(event => event.kind === 'water' ? { ...event, water: 0 } : event), third.recipe.options);
        const relativeMassDifference = Math.abs(mass(wetFrame.density) - baselineMass) / Math.max(1e-9, baselineMass);
        const afterRelativeMassDifference = Math.abs(mass(afterFrame.density) - baselineMass) / Math.max(1e-9, baselineMass);
        let denserCells = 0, thinnedCells = 0, maximumLocalGain = 0, maximumLocalLoss = 0;
        for (let i = 0; i < wetFrame.density.length; i++) {
          const delta = wetFrame.density[i] - baseFrame.density[i];
          if (delta > .005) denserCells++;
          if (delta < -.005) thinnedCells++;
          maximumLocalGain = Math.max(maximumLocalGain, delta);
          maximumLocalLoss = Math.max(maximumLocalLoss, -delta);
        }
        waterConditions.push({ layout, study: study.id, pureWaterStaysInvisible: pixelsEqual(capture(pure.result), capture(empty.result)),
          clearLayersHaveZeroPigment: pure.result.layers.every(layer => layer.concentration === 0),
          nonnegativeDensity: wetFrame.density.every(value => Number.isFinite(value) && value >= 0),
          massRetained: relativeMassDifference < 1e-6 && afterRelativeMassDifference < 1e-6,
          zeroWaterMatchesBaseline: pixelsEqual(capture(noWater.result), pixels[0]),
          localDenseAndThinnedRegionsBothPresent: denserCells > 5 && thinnedCells > 5,
          finiteEventDoesNotKeepDrying: pixelsEqual(capture(third.result, 1000), pixels[2]),
          relativeMassDifference, afterRelativeMassDifference, denserCells, thinnedCells, maximumLocalGain, maximumLocalLoss,
          depositionScope: 'Whole-frame density diagnostics confirm paired redistribution, not the artistic quality or continuity of every waterline.' });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      const original = studies[2].variants[1].document, saved = JSON.stringify(original), event = original.recipe.events[1], drop = event.droplets[2];
      const moved = editWaterDroplet(original, event.id, drop.id, { dx: 19, radius: drop.radius + 3 });
      const eventMoved = editWaterEvent(original, event.id, { dx: 13, water: .6 });
      const otherMarkSeeds = new Map(original.result.layers.flatMap(layer => layer.marks).map(mark => [mark.id, mark.seed]));
      editing.push({ layout, selectedDropletChanges: !same(drop, moved.recipe.events[1].droplets[2]),
        otherDropletsUnchanged: event.droplets.every((other, i) => other.id === drop.id || same(other, moved.recipe.events[1].droplets[i])),
        otherEventsUnchanged: same(original.recipe.events[0], moved.recipe.events[0]) && same(original.recipe.events[0], eventMoved.recipe.events[0]),
        materialSeedsStable: moved.result.layers.flatMap(layer => layer.marks).every(mark => otherMarkSeeds.get(mark.id) === mark.seed),
        eventEditOnlySelectedSource: !same(event, eventMoved.recipe.events[1]), originalUnchanged: saved === JSON.stringify(original),
        movedSourceRecompiles: same(compileWaterProcessRecipe(JSON.parse(JSON.stringify(moved.recipe))), moved.result) });
    }
    const defaults = makeWaterStudies({ seed }), amount = makeWaterStudies({ seed, water: .3 }), interval = makeWaterStudies({ seed, interval: 3 });
    const unchangedExcept = (a, b, key) => a.recipe.events.every((event, i) => same(omit(event, ...(key === 'water' && event.kind !== 'water' ? [] : [key])),
      omit(b.recipe.events[i], ...(key === 'water' && event.kind !== 'water' ? [] : [key]))));
    const controls = {
      waterOnlyChangesClearEventWater: defaults.every((study, s) => study.variants.every((variant, v) => unchangedExcept(variant.document, amount[s].variants[v].document, 'water'))),
      intervalOnlyChangesArrival: defaults.every((study, s) => study.variants.every((variant, v) => unchangedExcept(variant.document, interval[s].variants[v].document, 'at'))),
      baselineControlsUnchanged: defaults.every((study, s) => same(study.variants[0].document, amount[s].variants[0].document) && same(study.variants[0].document, interval[s].variants[0].document)),
    };
    const example = defaults[0].variants[2].document;
    let unknownVersionRejected = false, unknownGeneratorRejected = false, waterConcentrationRejected = false;
    try { compileWaterProcessRecipe({ ...example.recipe, version: 2 }); } catch { unknownVersionRejected = true; }
    try { compileWaterProcessRecipe({ ...example.recipe, generator: 'unsupported-water-process' }); } catch { unknownGeneratorRejected = true; }
    try { createWaterProcessDocument(example.recipe.events.map(event => event.kind === 'water' ? { ...event, concentration: .5 } : event), example.recipe.options); } catch { waterConcentrationRejected = true; }
    renderTimes.sort((a, b) => a - b);
    return { passed: results.every(flags) && pairs.every(flags) && isolation.every(flags) && editing.every(flags) && waterConditions.every(flags)
        && flags(controls) && unknownVersionRejected && unknownGeneratorRejected && waterConcentrationRejected,
      seed, layouts: 3, studyGroups: 3, studyVariants: results.length, results, pairs, isolation, editing, waterConditions, controls,
      unknownVersionRejected, unknownGeneratorRejected, waterConcentrationRejected,
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, cellSize: 1, canvas: 'HTMLCanvasElement / willReadFrequently' },
      render: { captures: renderTimes.length, medianMs: renderTimes[Math.floor(renderTimes.length / 2)], p95Ms: renderTimes[Math.ceil(renderTimes.length * .95) - 1], scope: 'renderInkProcess only; pixel readback excluded; mixed cold and repeated captures' },
      artisticValidation: 'unreviewed', scope: '水墨先后、源编辑、有限局部交换与事件沉积的工程检查；局部浓淡变化不自动证明每条水线艺术成立。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
