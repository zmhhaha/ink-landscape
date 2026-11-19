import { createLandscapeRenderer } from './scene.js';

const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const pixels = canvas => canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
const surface = (width = 1280, height = 800) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.getContext('2d', { willReadFrequently: true }); return canvas; };
const cacheSurface = (width, height) => typeof OffscreenCanvas === 'undefined' ? surface(width, height) : new OffscreenCanvas(width, height);
function pixelDifference(a, b, width) {
  let changedPixels = 0, changedChannels = 0, maxDelta = 0, totalDelta = 0;
  let minX = width, minY = Infinity, maxX = -1, maxY = -1;
  const samples = [];
  for (let index = 0; index < a.length; index += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(a[index + channel] - b[index + channel]);
      if (delta) { changed = true; changedChannels++; totalDelta += delta; maxDelta = Math.max(maxDelta, delta); }
    }
    if (!changed) continue;
    changedPixels++;
    const x = index / 4 % width, y = Math.floor(index / 4 / width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    if (samples.length < 8) samples.push({ x, y, before: Array.from(a.slice(index, index + 4)), after: Array.from(b.slice(index, index + 4)) });
  }
  return { changedPixels, changedChannels, maxDelta, totalDelta, bounds: changedPixels ? { minX, minY, maxX, maxY } : null, samples };
}
const countAlpha = (canvas, fromY = 0, toY = canvas.height) => {
  const data = pixels(canvas);
  let count = 0;
  for (let y = fromY; y < toY; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] > 0) count++;
  return count;
};

// Observe both context kinds: inspecting only the output context would miss
// expensive brush rebuilding on offscreen scratch surfaces.
function observeCanvasCalls(callback) {
  const methodNames = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'clip', 'fill', 'stroke', 'fillRect', 'strokeRect', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'createImageData', 'putImageData', 'getImageData', 'clearRect', 'drawImage'];
  const calls = Object.fromEntries(methodNames.map(name => [name, 0]));
  const prototypes = new Set([
    typeof CanvasRenderingContext2D === 'undefined' ? null : CanvasRenderingContext2D.prototype,
    typeof OffscreenCanvasRenderingContext2D === 'undefined' ? null : OffscreenCanvasRenderingContext2D.prototype,
  ].filter(Boolean));
  const originals = [];
  try {
    for (const prototype of prototypes) for (const name of methodNames) {
      const original = prototype[name];
      if (typeof original !== 'function') continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      originals.push({ prototype, name, descriptor });
      Object.defineProperty(prototype, name, { ...(descriptor ?? { configurable: true, writable: true }), value: function (...args) { calls[name]++; return Reflect.apply(original, this, args); } });
    }
    return { value: callback(), calls, observedContextKinds: prototypes.size };
  } finally {
    for (const { prototype, name, descriptor } of originals.reverse()) {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else delete prototype[name];
    }
  }
}

function inspectMask(diagnostic, cloud, output) {
  const { cloudMask, unmaskedMountains, maskedMountains } = diagnostic;
  const rootStart = Math.min(output.height, Math.ceil(cloud.opaqueY) + 4);
  const upperEnd = Math.max(0, Math.floor(cloud.startY - output.height * .06));
  const originalRootPixels = countAlpha(unmaskedMountains, rootStart);
  const maskedRootPixels = countAlpha(maskedMountains, rootStart);
  const before = pixels(unmaskedMountains), after = pixels(maskedMountains), mask = pixels(cloudMask), final = pixels(output);
  let upperAlphaChanges = 0, semiTransparentMaskPixels = 0, foregroundInkPixelsBelowMask = 0;
  let rowMin = 255, rowMax = 0;
  const edgeRow = Math.round((cloud.startY + cloud.opaqueY) / 2);
  for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
    const index = (y * output.width + x) * 4;
    const alpha = mask[index + 3];
    if (alpha > 0 && alpha < 255) semiTransparentMaskPixels++;
    if (y < upperEnd && before[index + 3] !== after[index + 3]) upperAlphaChanges++;
    if (y === edgeRow) { rowMin = Math.min(rowMin, alpha); rowMax = Math.max(rowMax, alpha); }
    if (y >= rootStart && x < output.width * .30 && final[index] < 64 && final[index + 1] < 64 && final[index + 2] < 64 && final[index + 3] === 255) foregroundInkPixelsBelowMask++;
  }
  const upperInkPixels = countAlpha(unmaskedMountains, 0, upperEnd);
  return {
    rootStart, originalRootPixels, maskedRootPixels,
    upperInkPixels, upperAlphaChanges,
    semiTransparentMaskPixels, edgeRow, edgeRowAlphaRange: rowMax - rowMin,
    foregroundInkPixelsBelowMask,
    passed: rootStart < output.height && originalRootPixels > 0 && maskedRootPixels === 0
      && upperInkPixels > 0 && upperAlphaChanges === 0 && semiTransparentMaskPixels > 0
      && rowMax > rowMin && foregroundInkPixelsBelowMask > 0,
  };
}

/** Browser-only regression: inspect real raster pixels and all Canvas contexts. */
export async function verifyLandscape({ seed = 261119 } = {}) {
  const canvas = surface(), alternateCanvas = surface();
  const preparedCanvases = [];
  const createCanvas = (width, height) => { const item = cacheSurface(width, height); preparedCanvases.push(item); return item; };
  let first, regenerated, alternate, fromData, edited, htmlRenderer;
  try {
    const initializationStart = performance.now();
    first = createLandscapeRenderer(canvas, { width: 1280, height: 800, seed, diagnostics: true, createCanvas });
    const initializationMilliseconds = performance.now() - initializationStart;
    const initialStats = first.render(6), initial = pixels(canvas);
    first.render(2); const early = pixels(canvas);
    first.render(6); const repeated = pixels(canvas);
    const description = first.describe();
    const transparentRootMask = inspectMask(first.diagnostics(), description.geometry.cloud, canvas);
    const surfaceSizes = preparedCanvases.map(item => [item.width, item.height]);
    const allocatedBefore = preparedCanvases.length;
    const surfaceBytes = preparedCanvases.reduce((bytes, item) => bytes + item.width * item.height * 4, 0);
    const durations = [], times = [6, 2, 6, 0, 1, 3.1, 6, 2, 6];
    let afterStats, reportedDrawImageCalls = 0;
    const observation = observeCanvasCalls(() => {
      for (const time of times) {
        const start = performance.now();
        afterStats = first.render(time);
        durations.push(performance.now() - start);
        reportedDrawImageCalls += afterStats.drawImageCalls;
      }
    });
    const { calls } = observation;
    const rasterOnly = Object.entries(calls).every(([name, count]) => name === 'drawImage' || name === 'clearRect' || count === 0);
    const cacheSurfacesUnchanged = preparedCanvases.length === allocatedBefore
      && preparedCanvases.every((item, index) => item.width === surfaceSizes[index][0] && item.height === surfaceSizes[index][1]);
    first.dispose(); first = undefined;
    const cacheSurfacesReleased = preparedCanvases.every(item => item.width === 0 && item.height === 0);

    regenerated = createLandscapeRenderer(alternateCanvas, { width: 1280, height: 800, seed, createCanvas: cacheSurface });
    regenerated.render(6); const rebuilt = pixels(alternateCanvas);
    regenerated.dispose(); regenerated = undefined;

    const exportedData = JSON.parse(JSON.stringify(description.geometry));
    fromData = createLandscapeRenderer(alternateCanvas, { data: exportedData, createCanvas: cacheSurface });
    fromData.render(6); const roundtrip = pixels(alternateCanvas);
    const dataPreserved = JSON.stringify(fromData.describe().geometry) === JSON.stringify(exportedData);
    fromData.dispose(); fromData = undefined;

    // Move the actual editable dry-stroke paths, rather than changing a seed or
    // regenerating the recipe. A renderer must consume these exported paths.
    const editedData = JSON.parse(JSON.stringify(exportedData));
    const mainPeak = editedData.peaks.find(peak => peak.id === 'sword') ?? editedData.peaks[0];
    for (const stroke of mainPeak.strokes.filter(stroke => stroke.role === 'axe')) {
      for (const point of stroke.points) point.x += editedData.width * .024;
    }
    edited = createLandscapeRenderer(alternateCanvas, { data: editedData, createCanvas: cacheSurface });
    edited.render(6); const editedPixels = pixels(alternateCanvas);
    const editedDataPreserved = JSON.stringify(edited.describe().geometry) === JSON.stringify(editedData);
    edited.dispose(); edited = undefined;

    alternate = createLandscapeRenderer(alternateCanvas, { width: 1280, height: 800, seed: (seed + 1) >>> 0, createCanvas: cacheSurface });
    alternate.render(6); const changed = pixels(alternateCanvas);
    alternate.dispose(); alternate = undefined;
    // Exact replay is checked within a factory; Canvas implementations can
    // rasterize the same paths differently across HTML and Offscreen surfaces.
    htmlRenderer = createLandscapeRenderer(alternateCanvas, { data: exportedData, createCanvas: surface });
    htmlRenderer.render(6); const htmlPixels = pixels(alternateCanvas);
    htmlRenderer.dispose(); htmlRenderer = undefined;
    htmlRenderer = createLandscapeRenderer(alternateCanvas, { data: exportedData, createCanvas: surface });
    htmlRenderer.render(6); const htmlRepeated = pixels(alternateCanvas);
    const cachedComposition = {
      samples: times.length, observedCanvasCalls: calls, observedContextKinds: observation.observedContextKinds,
      noVectorOrGradientRebuild: rasterOnly,
      drawImageCallsMatchReported: calls.drawImage > 0 && calls.drawImage === reportedDrawImageCalls,
      boundedLayerComposition: calls.drawImage <= times.length * description.cache.layers.length,
      cacheBuildsUnchanged: initialStats.cacheBuilds === afterStats.cacheBuilds,
      cacheSurfacesUnchanged, cacheSurfacesReleased,
      cacheBytes: initialStats.cacheBytes, measuredSurfaceBytes: surfaceBytes,
      cacheBytesMatchSurfaces: initialStats.cacheBytes === surfaceBytes,
      retainedSurfaces: description.cache.retainedSurfaces, rgbaEstimateOnly: true,
    };
    const result = {
      environment: { userAgent: navigator.userAgent, width: canvas.width, height: canvas.height, cacheCanvas: typeof OffscreenCanvas === 'undefined' ? 'HTMLCanvasElement' : 'OffscreenCanvas' },
      repeatSeekEqual: equal(initial, repeated),
      sameSeedRebuildEqual: equal(initial, rebuilt),
      diagnosticsDoNotChangePixels: equal(initial, rebuilt),
      exportedDataRoundtripEqual: dataPreserved && equal(initial, roundtrip),
      htmlFactoryRebuildEqual: equal(htmlPixels, htmlRepeated),
      pixelDifferenceDiagnostics: {
        repeatSeek: pixelDifference(initial, repeated, canvas.width),
        sameSeedRebuild: pixelDifference(initial, rebuilt, canvas.width),
        exportedDataRoundtrip: pixelDifference(initial, roundtrip, canvas.width),
        htmlFactoryRebuild: pixelDifference(htmlPixels, htmlRepeated, canvas.width),
        crossFactoryInformationalOnly: pixelDifference(initial, htmlPixels, canvas.width),
      },
      editedStrokeDataChangesPixels: editedDataPreserved && !equal(initial, editedPixels),
      differentTimeChangesPixels: !equal(initial, early),
      differentSeedChangesPixels: !equal(initial, changed),
      transparentRootMask, cachedComposition,
      initializationMilliseconds, timeMilliseconds: durations,
      timingScope: '本机同步缓存构建与合成调用分别计时；合成不含初始化、像素读取、显示提交，不是帧率。',
      artisticAcceptance: '另行看图；工程检查不判定笔墨质量。',
    };
    result.passed = result.repeatSeekEqual && result.sameSeedRebuildEqual && result.diagnosticsDoNotChangePixels && result.exportedDataRoundtripEqual && result.htmlFactoryRebuildEqual
      && result.editedStrokeDataChangesPixels && result.differentTimeChangesPixels && result.differentSeedChangesPixels
      && transparentRootMask.passed && rasterOnly && cachedComposition.drawImageCallsMatchReported
      && cachedComposition.boundedLayerComposition && cachedComposition.cacheBuildsUnchanged
      && cacheSurfacesUnchanged && cacheSurfacesReleased && cachedComposition.cacheBytesMatchSurfaces;
    return result;
  } finally {
    first?.dispose(); regenerated?.dispose(); alternate?.dispose(); fromData?.dispose(); edited?.dispose(); htmlRenderer?.dispose();
    canvas.width = 0; canvas.height = 0; alternateCanvas.width = 0; alternateCanvas.height = 0;
  }
}
