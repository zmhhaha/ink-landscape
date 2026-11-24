import { createInkScene, composeInkScene } from '../dist/entrypoints/core.js';
import { createBrushDocument } from '../dist/entrypoints/brush.js';
import { renderCanvas } from '../dist/entrypoints/canvas.js';

const canvas = document.querySelector('#preview'), context = canvas.getContext('2d', { willReadFrequently: true });
const output = document.querySelector('#results'), status = document.querySelector('#status'), button = document.querySelector('#run');
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const clone = value => JSON.parse(JSON.stringify(value));
const result = (name, passed) => ({ name, passed: Boolean(passed) });
function pixelDifference(a, b) {
  let pixels = 0, left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let i = 0; i < a.length; i += 4) if (a.slice(i, i + 4).some((value, channel) => value !== b[i + channel])) {
    const x = i / 4 % canvas.width, y = Math.floor(i / 4 / canvas.width);
    pixels++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return { changedPixels: pixels, bounds: pixels ? [left, top, right + 1, bottom + 1] : null };
}
const points = [{ x: 25, y: 160, pressure: .25 }, { x: 155, y: 55, pressure: 1 }, { x: 350, y: 165, pressure: .05 }];
function scenes() {
  const builder = createInkScene({ width: 400, height: 240, seed: 47, background: '#f5f2e9' });
  builder.wash([{ x: 45, y: 175 }, { x: 165, y: 70 }, { x: 315, y: 180 }], { opacity: .12, seed: 31 });
  builder.stroke(points, { width: 23, dryness: .6, nib: 'flat', smoothing: 'catmull-rom', duration: 2, seed: 79 });
  const controlled = createBrushDocument(points.map(p => ({ ...p, y: p.y + 20 })), {
    width: 24, seed: 81, duration: 2, gestureModel: 'local-v1', axis: 'side', finish: 'open',
    controls: [{ at: 0, pressure: .3, side: .1 }, { at: .35, pressure: 1, side: .85, dryness: .25 },
      { at: 1, pressure: .1, side: .1, dryness: .85 }],
  });
  const scene = Object.freeze({ version: 1, width: 400, height: 240, seed: 47, background: '#f5f2e9', marks: Object.freeze([controlled.result]) });
  return { legacy: builder.snapshot(), controlled: scene };
}
function capture(scene, time = 3) {
  context.fillStyle = '#ff00ff';
  renderCanvas(context, scene, { time, paperTexture: 0 });
  if (context.fillStyle !== '#ff00ff') throw new Error('Renderer did not restore caller fillStyle');
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}
async function run() {
  button.disabled = true; document.documentElement.dataset.verifyStatus = 'running';
  status.textContent = '正在检查…'; output.textContent = '';
  const checks = [];
  try {
    const inputs = scenes();
    for (const [name, scene] of Object.entries(inputs)) {
      const frozen = capture(scene), mutable = clone(scene);
      checks.push(result(name + ': frozen and JSON pixels match', equal(frozen, capture(mutable))));
      const partial = capture(scene, .8);
      capture(scene, 3); capture(scene, -.5);
      checks.push(result(name + ': out-of-order seek repeats', equal(partial, capture(scene, .8))));
      checks.push(result(name + ': time changes pixels', !equal(partial, frozen)));
      const mark = mutable.marks.find(mark => mark.kind === 'stroke');
      mark.width *= 1.7;
      checks.push(result(name + ': mutable width changes pixels', !equal(frozen, capture(mutable))));
      const changed = capture(mutable); mark.points[1].y += 35;
      checks.push(result(name + ': mutable points change pixels', !equal(changed, capture(mutable))));
      const shallow = clone(scene), shallowMark = shallow.marks.find(mark => mark.kind === 'stroke');
      Object.freeze(shallowMark);
      const original = capture(shallow); shallowMark.points[1].x += 35;
      checks.push(result(name + ': shallow frozen mark keeps mutable nested edits', !equal(original, capture(shallow))));
      if (name === 'controlled') {
        const nested = clone(scene), nestedMark = nested.marks[0];
        nestedMark.points.forEach(Object.freeze); Object.freeze(nestedMark.points); Object.freeze(nestedMark);
        const beforeControlEdit = capture(nested); nestedMark.brush.controls[1].side = .05;
        checks.push(result('controlled: mutable controls cannot reuse a cached plan', !equal(beforeControlEdit, capture(nested))));
      }
      const invalid = clone(scene), fallback = clone(scene);
      invalid.marks.forEach(mark => { mark.ink = 'not-a-css-color'; });
      fallback.marks.forEach(mark => { mark.ink = '#171b18'; });
      const invalidPixels = capture(invalid), fallbackPixels = capture(fallback);
      checks.push({ ...result(name + ': invalid CSS ink uses fallback', equal(invalidPixels, fallbackPixels)),
        difference: pixelDifference(invalidPixels, fallbackPixels) });
      if (name === 'legacy') for (const kind of ['stroke', 'wash']) {
        const invalidOne = clone(scene), fallbackOne = clone(scene);
        invalidOne.marks.filter(mark => mark.kind === kind).forEach(mark => { mark.ink = 'not-a-css-color'; });
        fallbackOne.marks.filter(mark => mark.kind === kind).forEach(mark => { mark.ink = '#171b18'; });
        const a = capture(invalidOne), b = capture(fallbackOne);
        checks.push({ ...result(kind + ': isolated CSS fallback', equal(a, b)), difference: pixelDifference(a, b) });
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const wetInk = clone(inputs.legacy), wetFallback = clone(inputs.legacy);
    wetInk.marks.filter(mark => mark.kind === 'stroke').forEach(mark => { mark.dryness = 0; mark.ink = 'not-a-css-color'; });
    wetFallback.marks.filter(mark => mark.kind === 'stroke').forEach(mark => { mark.dryness = 0; mark.ink = '#171b18'; });
    const wet = capture(wetInk), wetExpected = capture(wetFallback);
    checks.push({ ...result('wet legacy stroke: isolated CSS fallback', equal(wet, wetExpected)), difference: pixelDifference(wet, wetExpected) });
    const badPaper = clone(inputs.legacy), paperFallback = clone(inputs.legacy);
    badPaper.background = 'not-a-css-color'; paperFallback.background = '#f2efe6';
    checks.push(result('invalid CSS paper uses fallback', equal(capture(badPaper), capture(paperFallback))));
    const composed = composeInkScene([{ namespace: 'legacy', source: inputs.legacy }, { namespace: 'controlled', source: inputs.controlled }],
      { width: 400, height: 240, seed: 47, background: '#f5f2e9' });
    checks.push(result('composition retains all unique marks', composed.marks.length === 3 && new Set(composed.marks.map(mark => mark.id)).size === 3));
    const complete = capture(composed); capture(composed, -.5);
    checks.push(result('composition JSON seek repeats', equal(complete, capture(clone(composed)))));
    const report = { passed: checks.every(check => check.passed), checks, environment: { userAgent: navigator.userAgent, devicePixelRatio } };
    output.textContent = JSON.stringify(report, null, 2);
    status.textContent = `${checks.filter(check => check.passed).length}/${checks.length} 项通过`;
    document.documentElement.dataset.verifyStatus = report.passed ? 'passed' : 'failed';
  } catch (error) {
    output.textContent = JSON.stringify({ passed: false, checks, error: String(error.stack ?? error) }, null, 2);
    status.textContent = '检查失败'; document.documentElement.dataset.verifyStatus = 'failed';
  } finally { button.disabled = false; }
}
button.addEventListener('click', run);
run();
