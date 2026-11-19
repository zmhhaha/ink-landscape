import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, restoreLandscapeData, createLandscapeRenderer, material } from '../examples/scene.js';

const clone = value => JSON.parse(JSON.stringify(value));

test('landscape geometry stays deterministic and JSON editable without a browser', () => {
  assert.equal(typeof document, 'undefined');
  for (const seed of [0, 261119, 4294967295]) {
    const scene = geometry({ seed });
    assert.deepEqual(scene, geometry({ seed }));
    assert.deepEqual(restoreLandscapeData(clone(scene)), scene);
    assert.deepEqual(restoreLandscapeData({ geometry: scene }), scene);
  }
  assert.notDeepEqual(geometry({ seed: 261119 }), geometry({ seed: 261120 }));
  const data = geometry();
  const restored = restoreLandscapeData(data);
  restored.peaks[0].strokes[0].points[0].x += 19;
  assert.notEqual(restored.peaks[0].strokes[0].points[0].x, data.peaks[0].strokes[0].points[0].x);
});

test('sword landscape stores open angular ridges and predominantly long downward dry strokes', () => {
  const data = geometry();
  let tallestRatio = 0, maximumTurn = 0;
  for (const peak of data.peaks) {
    const xs = peak.outline.map(point => point.x), ys = peak.outline.map(point => point.y);
    tallestRatio = Math.max(tallestRatio, (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs)));
    for (const ridge of [peak.leftRidge, peak.rightRidge, peak.spine]) {
      assert.notDeepEqual(ridge[0], ridge.at(-1), 'a drawable ridge does not return along a closed mountain base');
      for (let index = 2; index < ridge.length; index++) {
        const a = ridge[index - 2], b = ridge[index - 1], c = ridge[index];
        const angle = Math.acos(Math.max(-1, Math.min(1, ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y)))));
        if (Number.isFinite(angle)) maximumTurn = Math.max(maximumTurn, angle);
      }
    }
  }
  assert.ok(tallestRatio > 2.7, 'at least one peak is high and narrow');
  assert.ok(maximumTurn > .2, 'ridge corners survive in the stored geometry');
  const dry = data.peaks.flatMap(peak => peak.strokes.filter(mark => mark.role === 'axe'));
  assert.ok(dry.length > 40, 'shadow masses use overlapping long strokes');
  const lengths = [];
  for (const mark of dry) {
    const dy = mark.points.at(-1).y - mark.points[0].y;
    assert.ok(dy > 0 && dy > Math.abs(mark.points.at(-1).x - mark.points[0].x), 'axe stroke pulls down the face');
    assert.ok(mark.dryness >= .45);
    lengths.push(dy);
  }
  lengths.sort((a, b) => a - b);
  assert.ok(lengths[Math.floor(lengths.length / 2)] > 100, 'these are long drags rather than short stamp marks');
});

test('invalid saved data fails before allocating any Canvas cache', () => {
  let allocations = 0;
  const createCanvas = () => { allocations++; throw new Error('should not allocate'); };
  for (const change of [
    data => { data.version = 'unknown'; },
    data => { data.peaks[0].strokes[0].points[0].x = Infinity; },
    data => { data.peaks[0].strokes[0].dryness = -1; },
    data => { data.peaks[0].strokes[0].points[0].p = 2; },
    data => { data.cloud.opaqueY = data.cloud.startY; },
    data => { data.width = 63; },
  ]) {
    const data = geometry(); change(data);
    assert.throws(() => material(data, { createCanvas }));
  }
  assert.equal(allocations, 0);
  for (const options of [{ width: 0 }, { height: Infinity }, { seed: .5 }, { width: 10000, height: 10000 }]) assert.throws(() => geometry(options));
});

// A command spy checks data/caching/lifecycle contracts; actual pixels are checked
// separately by landscape-verify.mjs in a real browser.
function canvasSpy(width, height, allSurfaces = []) {
  const canvas = { width, height, calls: [] };
  const context = new Proxy({}, {
    get(target, name) {
      if (name === 'canvas') return canvas;
      if (name in target) return target[name];
      if (name === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => {
        for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${String(name)} received a finite coordinate`);
        canvas.calls.push([name, ...args]);
      };
    },
    set(target, name, value) { target[name] = value; return true; },
  });
  canvas.getContext = () => context;
  allSurfaces.push(canvas);
  return canvas;
}

test('renderer replays edited saved geometry, follows edited layer bounds and releases caches', () => {
  const data = geometry({ width: 128, height: 80 });
  data.peaks = [data.peaks.find(peak => peak.id === 'sword')];
  data.peaks[0].group = 'caller-owned-layer';
  data.peaks[0].strokes = data.peaks[0].strokes.slice(0, 1);
  data.peaks[0].strokes[0].points[0].x += 3;
  data.foreground = { outline: [], pines: [] };
  data.distantRidges = [];
  data.birds = [];
  data.sun.y = 68;
  const surfaces = [];
  const output = canvasSpy(256, 160);
  const renderer = createLandscapeRenderer(output, { data: { geometry: clone(data) }, createCanvas: (w, h) => canvasSpy(w, h, surfaces), diagnostics: true });
  assert.deepEqual(renderer.describe().geometry, data);
  data.sun.y = 4;
  assert.equal(renderer.describe().geometry.sun.y, 68, 'renderer snapshots caller data');
  const description = renderer.describe();
  assert.ok(description.cache.layers.some(layer => layer.name === 'peaks-caller-owned-layer'));
  const accents = description.cache.layers.find(layer => layer.name === 'sun-and-birds');
  assert.ok(accents.y > 60 && accents.y + accents.height > 68, 'moving the sun beyond the authored crop remains visible');
  const before = renderer.render(6);
  output.calls.length = 0;
  renderer.render(2);
  const after = renderer.render(6);
  assert.equal(before.cacheBuilds, after.cacheBuilds);
  assert.ok(output.calls.some(call => call[0] === 'drawImage'));
  assert.equal(output.calls.some(call => ['beginPath', 'fill', 'stroke', 'createRadialGradient'].includes(call[0])), false);
  assert.throws(() => renderer.render(NaN), /finite/);
  renderer.dispose(); renderer.dispose();
  assert.ok(surfaces.every(surface => surface.width === 0 && surface.height === 0));
  assert.throws(() => renderer.render(6), /disposed/);
  assert.throws(() => renderer.describe(), /disposed/);
  assert.equal(output.width, 256, 'disposing caches preserves caller canvas');
  assert.throws(() => createLandscapeRenderer(output, { data, seed: data.seed + 1 }), /conflicts/);
});

test('cache preparation releases surfaces if Canvas initialization fails', () => {
  const surfaces = [];
  let allocations = 0;
  assert.throws(() => material(geometry({ width: 128, height: 80 }), { createCanvas(w, h) {
    if (++allocations === 3) throw new Error('simulated allocation failure');
    return canvasSpy(w, h, surfaces);
  } }), /simulated allocation failure/);
  assert.ok(surfaces.length > 0 && surfaces.every(surface => surface.width === 0 && surface.height === 0));
});
