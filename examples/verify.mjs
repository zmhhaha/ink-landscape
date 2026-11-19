import { renderCanvas } from '/dist/index.js';
import { makeStudy, studies } from './fixtures.mjs';
import { makeBrushComparisons } from './brush-fixtures.mjs';
import { makeRockComparisons, makeRockLandscape, rockStudyInputs } from './rock-fixtures.mjs';

const output = document.querySelector('#verification');
const canvas = document.querySelector('#verification-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const results = [];
const capture = (scene, time) => {
  const stats = renderCanvas(context, scene, { time });
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, stats };
};
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const elapsed = callback => {
  const started = performance.now();
  callback();
  return performance.now() - started;
};
const distribution = measurements => {
  const sorted = [...measurements].sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
};
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
try {
  for (const kind of Object.keys(studies)) {
    const inputs = { seed: 261119, dryness: .55, smoothing: 'catmull-rom' };
    const scene = makeStudy(kind, inputs);
    const initial = capture(scene, 6);
    const early = capture(scene, 0);
    capture(scene, 2);
    const repeated = capture(scene, 6);
    const regenerated = capture(makeStudy(kind, { seed: 261119, dryness: .55 }), 6);
    const differentSeed = capture(makeStudy(kind, { seed: 261120, dryness: .55 }), 6);
    const roundTrip = capture(JSON.parse(JSON.stringify(scene)), 6);
    const linear = capture(makeStudy(kind, { ...inputs, smoothing: 'linear' }), 6);
    const generated = [];
    const rendered = [];
    // Warm both paths independently; pixel readback is outside the timing scope.
    for (let i = 0; i < 2; i++) {
      makeStudy(kind, inputs);
      renderCanvas(context, scene, { time: 6 });
    }
    for (let i = 0; i < 7; i++) {
      generated.push(elapsed(() => makeStudy(kind, inputs)));
      rendered.push(elapsed(() => renderCanvas(context, scene, { time: 6 })));
      await nextFrame();
    }
    const result = {
      study: kind,
      marks: scene.marks.length,
      visibleMarks: initial.stats.visibleMarks,
      repeatSeekEqual: equal(initial.pixels, repeated.pixels),
      regenerationEqual: equal(initial.pixels, regenerated.pixels),
      timeChangesPixels: !equal(initial.pixels, early.pixels),
      seedChangesPixels: !equal(initial.pixels, differentSeed.pixels),
      jsonRoundTripEqual: equal(initial.pixels, roundTrip.pixels),
      smoothingChangesPixels: !equal(initial.pixels, linear.pixels),
      performance: { warmup: 2, samples: 7, generation: distribution(generated), render: distribution(rendered) },
    };
    result.passed = result.visibleMarks > 0 && result.repeatSeekEqual && result.regenerationEqual && result.timeChangesPixels && result.seedChangesPixels && result.jsonRoundTripEqual && result.smoothingChangesPixels;
    results.push(result);
    output.textContent = JSON.stringify({ running: true, results }, null, 2);
  }
  const comparisons = [];
  for (const sample of makeBrushComparisons()) {
    canvas.width = sample.scene.width;
    canvas.height = sample.scene.height;
    const initial = capture(sample.scene, 3);
    capture(sample.scene, .7);
    const repeated = capture(sample.scene, 3);
    const roundTrip = capture(JSON.parse(JSON.stringify(sample.scene)), 3);
    comparisons.push({ id: sample.id, dimensions: [canvas.width, canvas.height], marks: sample.scene.marks.length,
      repeatSeekEqual: equal(initial.pixels, repeated.pixels), jsonRoundTripEqual: equal(initial.pixels, roundTrip.pixels) });
    await nextFrame();
  }
  const rockComparisons = [];
  const rockSamples = makeRockComparisons();
  const alternateRockSamples = makeRockComparisons({ seed: rockStudyInputs.seed + 1 });
  const rockPixels = new Map();
  for (const sample of rockSamples) {
    canvas.width = sample.scene.width;
    canvas.height = sample.scene.height;
    const initial = capture(sample.scene, rockStudyInputs.time);
    const early = capture(sample.scene, .4);
    capture(sample.scene, 4.2);
    capture(sample.scene, 1.3);
    const repeated = capture(sample.scene, rockStudyInputs.time);
    const roundTrip = capture(JSON.parse(JSON.stringify(sample.scene)), rockStudyInputs.time);
    const regeneratedScene = makeRockComparisons().find(value => value.shape === sample.shape && value.treatment === sample.treatment).scene;
    const regenerated = capture(regeneratedScene, rockStudyInputs.time);
    const alternateScene = alternateRockSamples.find(value => value.shape === sample.shape && value.treatment === sample.treatment).scene;
    const alternate = capture(alternateScene, rockStudyInputs.time);
    rockPixels.set(sample.id, initial.pixels);
    const record = {
      id: sample.id, shape: sample.shape, treatment: sample.treatment,
      dimensions: [canvas.width, canvas.height], marks: sample.scene.marks.length,
      strokeCount: initial.stats.strokeCount, washCount: initial.stats.washCount,
      repeatSeekEqual: equal(initial.pixels, repeated.pixels),
      regenerationEqual: equal(initial.pixels, regenerated.pixels),
      jsonRoundTripEqual: equal(initial.pixels, roundTrip.pixels),
      timeChangesPixels: !equal(initial.pixels, early.pixels),
      seedChangesPixels: !equal(initial.pixels, alternate.pixels),
    };
    record.passed = record.strokeCount === rockStudyInputs.strokeCount && record.repeatSeekEqual
      && record.regenerationEqual && record.jsonRoundTripEqual && record.timeChangesPixels && record.seedChangesPixels;
    rockComparisons.push(record);
    await nextFrame();
  }
  const nominalInk = marks => marks.reduce((sum, mark) => {
    if (mark.kind !== 'stroke') return sum;
    let integral = 0;
    for (let i = 1; i < mark.points.length; i++) {
      const a = mark.points[i - 1], b = mark.points[i];
      integral += Math.hypot(b.x - a.x, b.y - a.y) * ((a.pressure ?? 1) + (b.pressure ?? 1)) * .5;
    }
    return sum + integral * mark.width * mark.opacity;
  }, 0);
  const rockPairs = [...new Set(rockSamples.map(sample => sample.shape))].map(shape => {
    const uniform = rockSamples.find(sample => sample.shape === shape && sample.treatment === 'uniform');
    const structured = rockSamples.find(sample => sample.shape === shape && sample.treatment === 'structured');
    const bones = sample => sample.analysis.boneIds.map(id => sample.scene.marks.find(mark => mark.id === id));
    const texture = sample => sample.analysis.textureIds.map(id => sample.scene.marks.find(mark => mark.id === id));
    const washes = sample => sample.scene.marks.filter(mark => mark.kind === 'wash');
    const record = { shape,
      sameMarkCount: uniform.scene.marks.length === structured.scene.marks.length,
      sameWashes: JSON.stringify(washes(uniform)) === JSON.stringify(washes(structured)),
      sameBones: JSON.stringify(bones(uniform)) === JSON.stringify(bones(structured)),
      textureInkProxyRatio: nominalInk(texture(structured)) / nominalInk(texture(uniform)),
      treatmentChangesPixels: !equal(rockPixels.get(uniform.id), rockPixels.get(structured.id)),
    };
    // The proxy tracks nominal pressure/length/width/opacity budget, not visible pigment or quality.
    record.passed = record.sameMarkCount && record.sameWashes && record.sameBones
      && Math.abs(record.textureInkProxyRatio - 1) < 1e-8 && record.treatmentChangesPixels;
    return record;
  });
  const rockLandscapes = [];
  for (const treatment of ['uniform', 'structured']) {
    const scene = makeRockLandscape(treatment);
    canvas.width = scene.width;
    canvas.height = scene.height;
    const initial = capture(scene, rockStudyInputs.time);
    const early = capture(scene, .4);
    capture(scene, 4.2);
    capture(scene, 1.3);
    const repeated = capture(scene, rockStudyInputs.time);
    const roundTrip = capture(JSON.parse(JSON.stringify(scene)), rockStudyInputs.time);
    const regenerated = capture(makeRockLandscape(treatment), rockStudyInputs.time);
    const alternate = capture(makeRockLandscape(treatment, { seed: rockStudyInputs.seed + 1 }), rockStudyInputs.time);
    const record = { treatment, dimensions: [canvas.width, canvas.height], marks: scene.marks.length,
      strokeCount: initial.stats.strokeCount, washCount: initial.stats.washCount,
      repeatSeekEqual: equal(initial.pixels, repeated.pixels),
      regenerationEqual: equal(initial.pixels, regenerated.pixels),
      jsonRoundTripEqual: equal(initial.pixels, roundTrip.pixels),
      timeChangesPixels: !equal(initial.pixels, early.pixels),
      seedChangesPixels: !equal(initial.pixels, alternate.pixels) };
    record.passed = record.strokeCount > 0 && record.repeatSeekEqual && record.regenerationEqual
      && record.jsonRoundTripEqual && record.timeChangesPixels && record.seedChangesPixels;
    rockLandscapes.push(record);
    await nextFrame();
  }
  const passed = results.every(result => result.passed) && comparisons.every(result => result.repeatSeekEqual && result.jsonRoundTripEqual)
    && rockComparisons.every(result => result.passed) && rockPairs.every(result => result.passed) && rockLandscapes.every(result => result.passed);
  output.dataset.status = passed ? 'passed' : 'failed';
  output.textContent = JSON.stringify({ passed, dimensions: [1280, 800],
    environment: { userAgent: navigator.userAgent, devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency,
      contextAttributes: context.getContextAttributes?.() },
    timingScope: '固定1280×800画布，生成与同步renderCanvas调用分开计时；不包含像素读取、显示提交或截图，不表示帧率或通用性能上限。',
    results, comparisons, rockComparisons, rockPairs, rockLandscapes }, null, 2);
} catch (error) {
  output.dataset.status = 'failed';
  output.textContent = JSON.stringify({ passed: false, error: error.message, results }, null, 2);
}
