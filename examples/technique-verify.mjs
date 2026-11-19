import { renderCanvas } from '../dist/index.js';
import { makeTechniqueStudies, techniqueStudyInputs } from './technique-fixtures.mjs';

const pixels = context => context.getImageData(0, 0, 560, 220).data;
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Check the real study pixels; no acceptance score is inferred from a name. */
export function verifyTechniqueStudies({ seed = techniqueStudyInputs.seed } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 220;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const results = [];
  try {
    for (const pathVariant of ['original', 'transfer']) for (const study of makeTechniqueStudies({ seed, pathVariant })) {
      const variantPixels = [];
      for (const variant of study.variants) {
        const saved = JSON.stringify(variant.scene);
        renderCanvas(context, variant.scene, { time: 3, paperTexture: .025 });
        const complete = pixels(context);
        renderCanvas(context, variant.scene, { time: 1, paperTexture: .025 });
        const partial = pixels(context);
        renderCanvas(context, JSON.parse(saved), { time: 3, paperTexture: .025 });
        const replay = pixels(context);
        variantPixels.push(complete);
        results.push({ study: study.id, pathVariant, variant: variant.label,
          repeatAndJsonEqual: equal(complete, replay), partialTimeChangesPixels: !equal(complete, partial),
          inputUnchanged: saved === JSON.stringify(variant.scene) });
      }
      results.push({ study: study.id, pathVariant, pairChangesPixels: !equal(variantPixels[0], variantPixels[1]) });
    }
    const original = makeTechniqueStudies({ seed, pathVariant: 'original' });
    const transferred = makeTechniqueStudies({ seed, pathVariant: 'transfer' });
    const seedChanged = makeTechniqueStudies({ seed: (seed + 1) >>> 0 });
    renderCanvas(context, original[0].variants[0].scene, { time: 3, paperTexture: .025 });
    const first = pixels(context);
    renderCanvas(context, seedChanged[0].variants[0].scene, { time: 3, paperTexture: .025 });
    const differentSeedChangesPixels = !equal(first, pixels(context));
    const transferChangesGeometry = original.every((study, index) => JSON.stringify(study.inputPath) !== JSON.stringify(transferred[index].inputPath));
    return { passed: results.every(result => Object.entries(result).filter(([key]) => !['study', 'pathVariant', 'variant'].includes(key)).every(([, value]) => value === true))
        && differentSeedChangesPixels && transferChangesGeometry,
      environment: { userAgent: navigator.userAgent, width: 560, height: 220, canvas: 'HTMLCanvasElement / willReadFrequently' },
      seed, studyCount: original.length, paths: 2, results, differentSeedChangesPixels, transferChangesGeometry,
      scope: '技术复现与成对像素差异；未检查传统笔法相似度、书法结体或物理毛笔。' };
  } finally { canvas.width = 0; canvas.height = 0; }
}
