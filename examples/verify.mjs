import { renderCanvas } from '/dist/index.js';
import { makeStudy, studies } from './fixtures.mjs';

const output = document.querySelector('#verification');
const canvas = document.querySelector('#verification-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const results = [];
const capture = (scene, time) => {
  const stats = renderCanvas(context, scene, { time });
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, stats };
};
const equal = (a, b) => a.every((value, index) => value === b[index]);
try {
  for (const kind of Object.keys(studies)) {
    const scene = makeStudy(kind, { seed: 261119, dryness: .55 });
    const initial = capture(scene, 6);
    const early = capture(scene, 0);
    capture(scene, 2);
    const repeated = capture(scene, 6);
    const regenerated = capture(makeStudy(kind, { seed: 261119, dryness: .55 }), 6);
    const differentSeed = capture(makeStudy(kind, { seed: 261120, dryness: .55 }), 6);
    const result = {
      study: kind,
      marks: scene.marks.length,
      visibleMarks: initial.stats.visibleMarks,
      repeatSeekEqual: equal(initial.pixels, repeated.pixels),
      regenerationEqual: equal(initial.pixels, regenerated.pixels),
      timeChangesPixels: !equal(initial.pixels, early.pixels),
      seedChangesPixels: !equal(initial.pixels, differentSeed.pixels),
    };
    result.passed = result.visibleMarks > 0 && result.repeatSeekEqual && result.regenerationEqual && result.timeChangesPixels && result.seedChangesPixels;
    results.push(result);
  }
  const passed = results.every(result => result.passed);
  output.dataset.status = passed ? 'passed' : 'failed';
  output.textContent = JSON.stringify({ passed, dimensions: [canvas.width, canvas.height], results }, null, 2);
} catch (error) {
  output.dataset.status = 'failed';
  output.textContent = JSON.stringify({ passed: false, error: error.message, results }, null, 2);
}
