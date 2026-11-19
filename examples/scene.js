import { createRandom } from '../dist/core.js';

const VERSION = 'sword-peak-canvas-v1';
const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const noise = (x, phase = 0) => Math.sin(x * .037 + phase) * .48 + Math.sin(x * .091 + phase * 1.7) * .27 + Math.sin(x * .219 + phase * .8) * .15 + Math.sin(x * .551 + phase * 2.1) * .10;

function validateSize(width, height, seed) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64 || width * height > 16_777_216) throw new RangeError('Landscape dimensions must be at least 64 and fit a 16 megapixel surface');
  if (!Number.isSafeInteger(seed)) throw new RangeError('Landscape seed must be a safe integer');
}

/** Restore an editable JSON recipe (or a renderer description) without Canvas. */
export function restoreLandscapeData(input) {
  const data = input?.geometry ?? input;
  if (!data || typeof data !== 'object' || data.version !== VERSION) throw new TypeError(`Landscape data version must be ${VERSION}`);
  validateSize(data.width, data.height, data.seed);
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height)) throw new RangeError('Saved landscape dimensions must be integers');
  const number = (value, name, low = -Infinity, high = Infinity) => {
    if (!Number.isFinite(value) || value < low || value > high) throw new RangeError(`${name} must be finite and between ${low} and ${high}`);
  };
  const list = (value, name, minimum = 0) => {
    if (!Array.isArray(value) || value.length < minimum) throw new TypeError(`${name} must be an array with at least ${minimum} entries`);
  };
  const path = (points, name, minimum) => {
    list(points, name, minimum);
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      number(point?.x, `${name}.x`); number(point?.y, `${name}.y`);
      if (point.p !== undefined) number(point.p, `${name}.p`, 0, 1);
      if (index > 0) number(Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y), `${name} segment length`);
    }
  };
  const seed = (value, name) => { if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`); };
  const color = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a Canvas color string`); };
  list(data.peaks, 'peaks');
  for (const peak of data.peaks) {
    if (typeof peak?.group !== 'string' || !peak.group) throw new TypeError('peak.group must be a nonempty string');
    number(peak.tone, 'peak.tone', 0, 1);
    path(peak.outline, 'peak.outline', 3);
    for (const name of ['leftRidge', 'rightRidge', 'spine']) path(peak[name], `peak.${name}`, 2);
    list(peak.strokes, 'peak.strokes');
    for (const mark of peak.strokes) {
      path(mark?.points, 'stroke.points', 2);
      number(mark.width, 'stroke.width', 0); number(mark.opacity, 'stroke.opacity', 0, 1); number(mark.dryness, 'stroke.dryness', 0, 1); seed(mark.seed, 'stroke.seed');
    }
  }
  list(data.distantRidges, 'distantRidges');
  for (const ridge of data.distantRidges) {
    path(ridge?.points, 'distantRidge.points', 2); number(ridge.bottom, 'distantRidge.bottom'); number(ridge.opacity, 'distantRidge.opacity', 0, 1); color(ridge.ink, 'distantRidge.ink');
  }
  path(data.foreground?.outline, 'foreground.outline', 0);
  if (data.foreground.outline.length > 0 && data.foreground.outline.length < 3) throw new TypeError('foreground.outline must be empty or have at least three points');
  list(data.foreground.pines, 'foreground.pines');
  for (const tree of data.foreground.pines) {
    for (const name of ['x', 'y', 'lean']) number(tree?.[name], `pine.${name}`);
    for (const name of ['height', 'spread']) number(tree[name], `pine.${name}`, 0);
    seed(tree.seed, 'pine.seed');
  }
  for (const name of ['x', 'y']) number(data.sun?.[name], `sun.${name}`);
  number(data.sun.radius, 'sun.radius', 0); color(data.sun.ink, 'sun.ink');
  list(data.birds, 'birds');
  for (const bird of data.birds) {
    for (const name of ['x', 'y', 'tilt']) number(bird?.[name], `bird.${name}`);
    number(bird.size, 'bird.size', 0);
  }
  number(data.cloud?.startY, 'cloud.startY'); number(data.cloud.opaqueY, 'cloud.opaqueY');
  if (data.cloud.opaqueY <= data.cloud.startY) throw new RangeError('cloud.opaqueY must be below cloud.startY');
  seed(data.cloud.seed, 'cloud.seed');
  return JSON.parse(JSON.stringify(data));
}

function pointsAlong(points, spacing = 3) {
  const result = [];
  const length = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
  spacing = Math.max(spacing, length / 8192);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
    for (let j = 0; j < steps; j++) { const t = j / steps; result.push({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), p: mix(a.p ?? 1, b.p ?? 1, t) }); }
  }
  result.push({ ...points.at(-1) });
  return result;
}

function peakGeometry(spec, seed, sx, sy) {
  const random = createRandom(seed);
  const [cx, top, width, height, lean] = spec.shape;
  const center = t => cx + lean * Math.pow(t, 1.25) + Math.sin(t * 7.7 + seed % 7) * width * .08 * t;
  const levels = [0, .018, .047, .09, .16, .22, .235, .32, .40, .425, .53, .64, .67, .79, .91, 1];
  const shoulder = .23 + random() * .17;
  const bodyAt = t => width * (.004 + .46 * Math.pow(t, .73));
  const left = [], right = [];
  for (let i = 0; i < levels.length; i++) {
    const t = levels[i];
    // Directional, discontinuous width changes preserve torn ridges and necks.
    const body = bodyAt(t);
    const tear = i === 0 ? 0 : ((i % 3 === 0 ? -.32 : .12) + (random() - .5) * .35) * body;
    // Each flank has its own broken shoulder; no mirrored cone or spline shell.
    const shelf = t > shoulder && t < shoulder + .17 ? width * .10 : 0;
    left.push({ x: (center(t) - body * (.73 + random() * .30) + tear - shelf) * sx, y: (top + height * t) * sy });
    right.push({ x: (center(t) + body * (.63 + random() * .40) - tear * .35 + (t > .53 && t < .67 ? width * .07 : 0)) * sx, y: (top + height * t) * sy });
  }
  left[0] = { x: cx * sx, y: top * sy };
  right[0] = { ...left[0] };
  const spine = levels.map(t => ({ x: (center(t) - width * .055 + noise(t * 63, seed % 11) * width * .045 * t) * sx, y: (top + height * t) * sy }));
  const strokes = [];
  const add = (path, brushWidth, opacity, dryness, role, index) => strokes.push({ id: `${spec.id}-${role}-${index}`, points: path.map(p => ({ x: p.x * sx, y: p.y * sy, p: p.p })), width: brushWidth * sx, opacity, dryness, seed: (seed ^ Math.imul(index + 7, 0x45d9f3b)) >>> 0, role });
  // Two broken structural drags on the ink side. The bright face stays paper.
  for (let i = 0; i < 2; i++) {
    const y = top + height * (.035 + i * .16);
    const x = center(.1) - width * (.018 + i * .045);
    add([{ x, y, p: .12 }, { x: x - width * .10, y: y + height * .22, p: .96 }, { x: center(.72) - width * .16, y: top + height * .72, p: .68 }, { x: center(1) - width * .23, y: top + height * 1.04, p: .025 }], width * (.28 + random() * .18), spec.tone * (.25 + random() * .13), .48, 'wash', i);
  }
  // Start each family on a projected structural ridge, then pull down its face.
  const families = spec.count ?? 27;
  for (let i = 0; i < families; i++) {
    const group = i % 4;
    const t = .025 + Math.pow(random(), 1.35) * .64;
    const side = group === 0 ? -.71 : group === 1 ? -.28 : group === 2 ? -.08 : .64;
    const startX = center(t) + bodyAt(t) * side;
    const startY = top + height * t;
    const length = Math.min(height * (1.07 - t), group === 3 ? 56 + random() * 83 : 77 + random() * 182 + (group === 0 ? 25 : 0));
    const pull = width * (side * .68 + (random() - .5) * .34) * (length / height) + (group === 3 ? width * .075 : 0);
    const shoulder = (random() - .5) * width * .12;
    const brushWidth = (group === 0 ? 24 : group === 1 ? 31 : group === 2 ? 15 : 17) * (width / 150) * (.48 + random() * .92);
    add([{ x: startX, y: startY, p: .32 + random() * .38 }, { x: startX + pull * .14 + shoulder, y: startY + length * .10, p: .80 + random() * .20 }, { x: startX + pull * .46 - shoulder * .18, y: startY + length * .47, p: .55 + random() * .36 }, { x: startX + pull * .77 + shoulder * .21, y: startY + length * .75, p: .30 + random() * .24 }, { x: startX + pull, y: startY + length, p: .015 }], brushWidth, spec.tone * (group < 3 ? .80 + random() * .20 : .21 + random() * .22), .73 + random() * .23, 'axe', i);
  }
  return { id: spec.id, group: spec.group, tone: spec.tone, outline: [...left, ...right.slice(1).reverse()], leftRidge: left, rightRidge: right, spine, strokes };
}

/** Original example recipe. Geometry stays JSON data and imports no DOM. */
export function geometry({ width = 1280, height = 800, seed = 261119 } = {}) {
  validateSize(width, height, seed);
  width = Math.round(width); height = Math.round(height); seed >>>= 0;
  const sx = width / 1280, sy = height / 800;
  const random = createRandom(seed ^ 0x31e28079);
  const specs = [
    { id: 'distant-needle', group: 'back', shape: [1068, 367, 135, 325, -20], tone: .50, count: 22 },
    { id: 'distant-right', group: 'back', shape: [1142, 454, 87, 221, 10], tone: .27, count: 12 },
    { id: 'left-sentinel', group: 'shoulders', shape: [446, 423, 91, 279, -14], tone: .75, count: 16 },
    { id: 'rear-twin', group: 'shoulders', shape: [676, 288, 130, 414, 25], tone: .82, count: 25 },
    { id: 'left-shoulder', group: 'main', shape: [518, 326, 174, 377, 8], tone: .97, count: 29 },
    { id: 'sword', group: 'main', shape: [596, 164, 207, 549, 7], tone: 1, count: 43 },
    { id: 'right-shoulder', group: 'main', shape: [723, 386, 149, 320, -39], tone: .85, count: 22 },
    { id: 'low-left', group: 'front', shape: [485, 515, 140, 225, -16], tone: .92, count: 18 },
    { id: 'front-ridge', group: 'front', shape: [613, 457, 172, 274, -38], tone: .93, count: 25 },
    { id: 'low-right', group: 'front', shape: [790, 538, 113, 192, 12], tone: .69, count: 14 },
  ];
  const peaks = specs.map((spec, i) => peakGeometry(spec, (seed ^ Math.imul(i + 3, 0x9e3779b1)) >>> 0, sx, sy));
  const distantRidges = [0, 1, 2].map(layer => {
    const points = [];
    for (let x = -20; x <= 1300; x += 8) {
      const y = 470 + layer * 31 - Math.abs(noise(x * .21, 2 + layer * 2)) * (31 + layer * 11) + noise(x, layer) * 3;
      points.push({ x: x * sx, y: y * sy });
    }
    return { points, opacity: [.10, .12, .14][layer], ink: ['#77918f', '#7c8e8c', '#78817d'][layer], bottom: (620 + layer * 15) * sy };
  });
  const foregroundOutline = [[-30, 644], [35, 630], [63, 638], [83, 632], [108, 652], [124, 643], [159, 660], [178, 654], [210, 675], [231, 671], [260, 691], [282, 686], [320, 715], [348, 718], [365, 738], [405, 751], [426, 782], [462, 806], [-30, 825]].map(([x, y]) => ({ x: x * sx, y: y * sy }));
  const pines = [
    { x: 102, y: 644, height: 152, lean: 14, spread: 47 },
    { x: 207, y: 663, height: 105, lean: 9, spread: 34 },
    { x: 293, y: 694, height: 67, lean: -7, spread: 24 },
  ].map((tree, index) => ({ ...tree, x: tree.x * sx, y: tree.y * sy, height: tree.height * sy, lean: tree.lean * sx, spread: tree.spread * sx, seed: (seed ^ Math.imul(index + 19, 173)) >>> 0 }));
  const birds = Array.from({ length: 7 }, (_, i) => ({ x: (791 + i * 21 + random() * 6) * sx, y: (140 - Math.sin(i * .60) * 18 + random() * 9) * sy, size: (5.5 - i * .30 + random() * 1.6) * sx, tilt: (random() - .5) * .25 }));
  return { version: VERSION, width, height, seed, peaks, distantRidges, foreground: { outline: foregroundOutline, pines }, sun: { x: 1026 * sx, y: 181 * sy, radius: 24 * sx, ink: '#ba3425' }, birds, cloud: { startY: 492 * sy, opaqueY: 623 * sy, seed: seed ^ 0x67eb90, technique: 'independent destination-out alpha mask' }, scope: 'Original procedural example; static visual study. Traditional brush terms describe an approximation, not accepted traditional technique.' };
}

function bounds(points, margin = 0) {
  const box = points.reduce((box, point) => ({ x: Math.min(box.x, point.x), y: Math.min(box.y, point.y), right: Math.max(box.right, point.x), bottom: Math.max(box.bottom, point.y) }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
  return { x: Math.floor(box.x - margin), y: Math.floor(box.y - margin), right: Math.ceil(box.right + margin), bottom: Math.ceil(box.bottom + margin) };
}

function visibleBounds(points, width, height, margin = 0) {
  if (!points.length) return { x: 0, y: 0, right: 1, bottom: 1 };
  const box = bounds(points, margin);
  box.x = clamp(box.x, 0, width - 1); box.y = clamp(box.y, 0, height - 1);
  box.right = clamp(box.right, box.x + 1, width); box.bottom = clamp(box.bottom, box.y + 1, height);
  return box;
}

function defaultCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; }
  throw new Error('Material generation requires Canvas 2D or a createCanvas factory');
}

/** All costly brush paths and erasure fields are prepared here, never per frame. */
export function material(data, { createCanvas = defaultCanvas, diagnostics = false } = {}) {
  data = restoreLandscapeData(data);
  const sx = data.width / 1280, sy = data.height / 800;
  let builds = 0, pathCalls = 0, gradientCreates = 0;
  const surfaces = [];
  const surface = (name, width, height, x = 0, y = 0) => {
    const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
    // Keep cache rasterization stable when diagnostics/readback is toggled.
    // Browser GPU/CPU migration can otherwise change alpha rounding mid-seek.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) { canvas.width = 0; canvas.height = 0; throw new Error('Canvas 2D context is unavailable'); }
    builds++;
    const item = { name, canvas, context, x, y };
    surfaces.push(item);
    return item;
  };
  try {
  const polygon = (ctx, points, close = true) => {
    pathCalls++;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (close) ctx.closePath();
  };
  const line = (ctx, points, width, alpha = 1) => {
    polygon(ctx, points, false); ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.stroke();
  };
  const sky = surface('paper-sky', data.width, data.height);
  sky.context.fillStyle = '#eeeadd'; sky.context.fillRect(0, 0, data.width, data.height);
  const paperRandom = createRandom(data.seed ^ 0x74c32);
  sky.context.fillStyle = '#5d5140'; sky.context.globalAlpha = .022;
  for (let i = 0; i < data.width * data.height / 93; i++) sky.context.fillRect(paperRandom() * data.width, paperRandom() * data.height, (.3 + paperRandom() * .9) * sx, (.2 + paperRandom() * .35) * sy);
  sky.context.globalAlpha = 1;
  const farBox = visibleBounds(data.distantRidges.flatMap(ridge => [...ridge.points, { x: 0, y: ridge.bottom }, { x: data.width, y: ridge.bottom }]), data.width, data.height, 1);
  const far = surface('distant-ridges', farBox.right - farBox.x, farBox.bottom - farBox.y, farBox.x, farBox.y);
  far.context.translate(-far.x, -far.y);
  for (const ridge of data.distantRidges) {
    far.context.fillStyle = ridge.ink; far.context.globalAlpha = ridge.opacity;
    polygon(far.context, [...ridge.points, { x: data.width + 20, y: ridge.bottom }, { x: -20, y: ridge.bottom }]); far.context.fill();
  }
  // Cloud alpha is computed once; at opaqueY every pixel is exactly opaque.
  const cloudMask = surface('cloud-alpha', data.width, data.height);
  const mask = cloudMask.context.createImageData(data.width, data.height);
  const cloudPhase = (data.cloud.seed >>> 0) % 8191 / 173;
  for (let x = 0; x < data.width; x++) {
    const u = x / sx;
    const tongue = Math.exp(-Math.pow((u - 515 - Math.sin(cloudPhase) * 25) / 66, 2)) * 44
      + Math.exp(-Math.pow((u - 741) / 92, 2)) * 30;
    const boundary = Math.min(data.cloud.opaqueY - 16 * sy, data.cloud.startY + (noise(u * .36, cloudPhase) * 24 + Math.sin(u * .014) * 11 - tongue) * sy);
    for (let y = Math.max(0, Math.floor(boundary)); y < data.height; y++) {
      const alpha = y >= data.cloud.opaqueY ? 1 : smooth(boundary, data.cloud.opaqueY - 12 * sy, y);
      const k = (y * data.width + x) * 4;
      mask.data[k] = 255; mask.data[k + 1] = 255; mask.data[k + 2] = 255; mask.data[k + 3] = Math.round(alpha * 255);
    }
  }
  cloudMask.context.putImageData(mask, 0, 0);
  far.context.save(); far.context.globalAlpha = 1; far.context.globalCompositeOperation = 'destination-out'; far.context.drawImage(cloudMask.canvas, 0, 0); far.context.restore();
  const groupNames = [...new Set(['back', 'shoulders', 'main', 'front', ...data.peaks.map(peak => peak.group)])].filter(name => data.peaks.some(peak => peak.group === name));
  const groups = groupNames.map((name, index) => {
    const peaks = data.peaks.filter(peak => peak.group === name);
    const box = visibleBounds(peaks.flatMap(peak => peak.outline), data.width, data.height, 12 * sx);
    const layer = surface(`peaks-${name}`, box.right - box.x, box.bottom - box.y, box.x, box.y);
    layer.start = .5 + index * .35; layer.duration = 1.8;
    return { ...layer, peaks };
  });
  const scratch = surface('brush-scratch', 1, 1);
  let scratchBuilds = 0;
  function paintBrush(target, mark) {
    const box = visibleBounds(mark.points, data.width, data.height, mark.width * .7 + 4);
    scratch.canvas.width = Math.max(2, box.right - box.x); scratch.canvas.height = Math.max(2, box.bottom - box.y);
    scratchBuilds++;
    const ctx = scratch.context;
    ctx.setTransform(1, 0, 0, 1, -box.x, -box.y);
    const random = createRandom(mark.seed);
    const samples = pointsAlong(mark.points, Math.max(1.5 * sy, mark.width * .1));
    const edges = [[], []];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i], a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
      const rag = 1 + noise(i * 1.7, mark.seed % 29) * (.12 + mark.dryness * .39);
      const w = mark.width * (p.p ?? 1) * .5 * rag;
      edges[0].push({ x: p.x + nx * w, y: p.y + ny * w });
      edges[1].push({ x: p.x - nx * w * (.84 + noise(i, 1) * .12), y: p.y - ny * w * .95 });
    }
    ctx.fillStyle = '#101510'; polygon(ctx, [...edges[0], ...edges[1].reverse()]); ctx.fill();
    // Dry white is transparency in THIS brush, not white paint erasing earlier ink.
    ctx.globalCompositeOperation = 'destination-out';
    // A few broad, torn transverse skips coexist with much finer dry fibres.
    // They are irregular polygons on the scratch brush, never a repeated stamp.
    for (let cut = 0; cut < Math.floor(mark.dryness * 7); cut++) {
      const at = Math.floor((.10 + random() * .77) * (samples.length - 1));
      const p = samples[at], a = samples[Math.max(0, at - 1)], b = samples[Math.min(samples.length - 1, at + 1)];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, tx = -ny, ty = nx;
      const span = mark.width * (p.p ?? 1) * (.66 + random() * .48);
      const thickness = (1.4 + random() * 5.3) * sy * mark.dryness;
      const upper = [], lower = [];
      for (let j = 0; j <= 8; j++) {
        const q = j / 8 - .5, shear = q * thickness * 2.3 + noise(j * 5, cut + mark.seed % 31) * thickness;
        upper.push({ x: p.x + nx * span * q + tx * shear, y: p.y + ny * span * q + ty * shear });
        lower.push({ x: p.x + nx * span * q + tx * (shear + thickness * (.25 + random())), y: p.y + ny * span * q + ty * (shear + thickness * (.25 + random())) });
      }
      ctx.globalAlpha = .92; polygon(ctx, [...upper, ...lower.reverse()]); ctx.fill();
    }
    const cuts = Math.ceil(mark.dryness * 36);
    for (let i = 0; i < cuts; i++) {
      const t = .05 + random() * .91;
      const at = Math.min(samples.length - 1, Math.floor(t * samples.length));
      const p = samples[at], a = samples[Math.max(0, at - 1)], b = samples[Math.min(samples.length - 1, at + 1)];
      const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / distance, ny = (b.x - a.x) / distance;
      const tangent = { x: -ny, y: nx };
      const across = mark.width * (p.p ?? 1), center = (random() - .5) * across;
      const length = across * (.13 + random() * .88), thin = (.5 + random() * 3.3) * sy * (.3 + mark.dryness);
      const x = p.x + nx * center, y = p.y + ny * center;
      ctx.globalAlpha = .25 + random() * .75;
      polygon(ctx, [{ x: x - nx * length * .5, y: y - ny * length * .5 }, { x: x + nx * length * .5 + tangent.x * thin, y: y + ny * length * .5 + tangent.y * thin }, { x: x + nx * length * .30 + tangent.x * thin * 2, y: y + ny * length * .30 + tangent.y * thin * 2 }, { x: x - nx * length * .45 + tangent.x * thin, y: y - ny * length * .45 + tangent.y * thin }]); ctx.fill();
    }
    // Sparse, interrupted side-drag channels; deliberately no full-height hair grid.
    for (let i = 0; i < Math.ceil(mark.dryness * 19); i++) {
      const start = Math.floor(random() * samples.length * .8), end = Math.min(samples.length - 1, start + 3 + Math.floor(random() * samples.length * .31));
      const offset = (random() - .5) * mark.width * .72;
      const path = samples.slice(start, end + 1).map(p => ({ x: p.x + offset * (p.p ?? 1), y: p.y }));
      ctx.strokeStyle = '#000'; ctx.lineWidth = (.4 + random() * 2.7) * sx * mark.dryness; ctx.globalAlpha = .5 + random() * .5;
      if (path.length > 1) { polygon(ctx, path, false); ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    target.save(); target.globalAlpha = mark.opacity; target.drawImage(scratch.canvas, box.x, box.y); target.restore();
  }
  const unmasked = diagnostics ? surface('diagnostic-unmasked', data.width, data.height) : null;
  for (const group of groups) {
    const ctx = group.context;
    ctx.translate(-group.x, -group.y);
    for (const peak of group.peaks) {
      ctx.save(); polygon(ctx, peak.outline); ctx.clip();
      for (const stroke of peak.strokes) paintBrush(ctx, stroke);
      // Ridges are open paths. No bottom outline is ever stroked.
      for (const ridge of [peak.leftRidge]) {
        ctx.strokeStyle = '#101610'; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        for (let i = 0; i < ridge.length - 1; i += 3) {
          line(ctx, ridge.slice(i, Math.min(i + 3, ridge.length)), (ridge === peak.spine ? 1.4 : 1.8) * sx, peak.tone * (ridge === peak.spine ? .38 : .73));
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (unmasked) unmasked.context.drawImage(group.canvas, group.x, group.y);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(cloudMask.canvas, 0, 0); ctx.restore();
  }
  scratch.canvas.width = 0; scratch.canvas.height = 0;
  const masked = diagnostics ? surface('diagnostic-masked', data.width, data.height) : null;
  if (masked) for (const group of groups) masked.context.drawImage(group.canvas, group.x, group.y);
  const foregroundPoints = [...data.foreground.outline, ...data.foreground.pines.flatMap(tree => [
    { x: tree.x + Math.min(0, tree.lean) - tree.spread * 1.2 - 16 * sx, y: tree.y - tree.height - 28 * sy },
    { x: tree.x + Math.max(0, tree.lean) + tree.spread * 1.2 + 16 * sx, y: tree.y + 8 * sy },
  ])];
  const foregroundBox = visibleBounds(foregroundPoints, data.width, data.height, 2 * Math.max(sx, sy));
  const foreground = surface('foreground-pines', foregroundBox.right - foregroundBox.x, foregroundBox.bottom - foregroundBox.y, foregroundBox.x, foregroundBox.y);
  foreground.context.translate(-foreground.x, -foreground.y);
  const fg = foreground.context;
  if (data.foreground.outline.length) {
  fg.fillStyle = '#111812'; polygon(fg, data.foreground.outline); fg.fill();
  fg.save(); polygon(fg, data.foreground.outline); fg.clip();
  const frontRandom = createRandom(data.seed ^ 0x4e9063);
  // Light on an opaque ink bank must be removed from this isolated layer.
  // These long broken scrapes expose paper, rather than painting black on black.
  fg.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 41; i++) {
    const x = frontRandom() * 490 * sx, y = (619 + x / sx * .29 + frontRandom() * 34) * sy;
    const drag = .45 + frontRandom() * .95;
    paintBrush(fg, { points: [{ x, y, p: .5 }, { x: x - 14 * sx, y: y + 17 * sy, p: .82 }, { x: x - 29 * sx, y: y + 35 * sy, p: .25 }, { x: x - 43 * sx * drag, y: y + 71 * sy * drag, p: .04 }], width: (1.5 + frontRandom() * 4.3) * sx, opacity: .40 + frontRandom() * .55, dryness: .62, seed: (data.seed + i * 79) >>> 0 });
  }
  fg.restore();
  }
  // Restore the reusable scratch after foreground use; it is not retained.
  scratch.canvas.width = 0; scratch.canvas.height = 0;
  function pine(tree) {
    const rand = createRandom(tree.seed);
    const trunk = [0, .35, .69, 1].map((t, i) => ({ x: tree.x + tree.lean * t + [0, 7, -4, 4][i] * sx, y: tree.y - tree.height * t }));
    const trunkAt = t => {
      const levels = [0, .35, .69, 1];
      const i = t < .35 ? 0 : t < .69 ? 1 : 2, u = (t - levels[i]) / (levels[i + 1] - levels[i]);
      return { x: mix(trunk[i].x, trunk[i + 1].x, u), y: mix(trunk[i].y, trunk[i + 1].y, u) };
    };
    fg.strokeStyle = '#101710'; fg.lineCap = 'round'; fg.lineJoin = 'miter';
    for (let i = 0; i < 3; i++) line(fg, trunk.slice(i, i + 2), (5.8 - i * 1.5) * sx, 1);
    for (let j = 0; j < 8; j++) {
      const t = .26 + j * .095, { x: tx, y: ty } = trunkAt(t);
      const direction = j % 2 ? 1 : -1, spread = tree.spread * (1.34 - t) * (.8 + rand() * .55);
      const end = { x: tx + direction * spread, y: ty - (5 + rand() * 10) * sy };
      line(fg, [{ x: tx, y: ty }, { x: tx + direction * spread * .48, y: ty + 1.5 * sy }, end], (1.1 + (1 - t) * 1.2) * sx);
      const clusters = 4 + Math.floor(rand() * 3);
      for (let c = 0; c < clusters; c++) {
        const u = .28 + c / clusters * .75;
        const nx = mix(tx, end.x, u), ny = mix(ty, end.y, u);
        for (let needle = 0; needle < 23; needle++) {
          const angle = -Math.PI + rand() * Math.PI, length = (4 + rand() * 8) * sx * (.55 + (1 - t));
          line(fg, [{ x: nx + (rand() - .5) * 5 * sx, y: ny }, { x: nx + Math.cos(angle) * length, y: ny + Math.sin(angle) * length * .62 }], (.45 + rand() * .7) * sx, .53 + rand() * .47);
        }
      }
    }
  }
  for (const tree of data.foreground.pines) pine(tree);
  const accentPoints = [
    { x: data.sun.x - data.sun.radius, y: data.sun.y - data.sun.radius },
    { x: data.sun.x + data.sun.radius, y: data.sun.y + data.sun.radius },
    ...data.birds.flatMap(bird => [{ x: bird.x - bird.size, y: bird.y - bird.size * (1 + Math.abs(bird.tilt)) }, { x: bird.x + bird.size, y: bird.y + bird.size }]),
  ];
  const accentBox = visibleBounds(accentPoints, data.width, data.height, 2 * Math.max(sx, sy));
  const accents = surface('sun-and-birds', accentBox.right - accentBox.x, accentBox.bottom - accentBox.y, accentBox.x, accentBox.y);
  const ac = accents.context;
  ac.translate(-accents.x, -accents.y);
  ac.fillStyle = data.sun.ink; ac.globalAlpha = .94; pathCalls++; ac.beginPath(); ac.arc(data.sun.x, data.sun.y, data.sun.radius, 0, TAU); ac.fill();
  ac.strokeStyle = '#252c24'; ac.lineWidth = .9 * sx; ac.lineCap = 'round';
  for (const bird of data.birds) {
    const { x, y, size, tilt } = bird;
    pathCalls++; ac.beginPath(); ac.moveTo(x - size, y - size * .25 + tilt * size); ac.quadraticCurveTo(x - size * .4, y - size * .45, x, y + size * .2); ac.quadraticCurveTo(x + size * .45, y - size * .40, x + size, y - size * .22 - tilt * size); ac.globalAlpha = .68; ac.stroke();
  }
  const layers = [sky, far, ...groups, foreground, accents];
  // The alpha field is already baked into the retained scene layers.
  if (!diagnostics) { cloudMask.canvas.width = 0; cloudMask.canvas.height = 0; }
  const live = surfaces.filter(item => item.canvas.width > 0 && item.canvas.height > 0);
  const cache = { builds, scratchRasterizations: scratchBuilds, bytes: live.reduce((sum, item) => sum + item.canvas.width * item.canvas.height * 4, 0), retainedSurfaces: live.length, initializationVectorPathCalls: pathCalls, initializationGradientCreates: gradientCreates, layers: layers.map(item => ({ name: item.name, x: item.x, y: item.y, width: item.canvas.width, height: item.canvas.height })) };
  return { layers, cache, diagnosticSurfaces: { unmaskedMountains: unmasked?.canvas ?? null, maskedMountains: masked?.canvas ?? null, cloudMask: diagnostics ? cloudMask.canvas : null }, dispose() { for (const item of surfaces) { item.canvas.width = 0; item.canvas.height = 0; } } };
  } catch (error) {
    for (const item of surfaces) { item.canvas.width = 0; item.canvas.height = 0; }
    throw error;
  }
}

/** Cache once, seek by absolute time. Animation here is reveal, not fluid simulation. */
export function createLandscapeRenderer(canvas, options = {}) {
  const { diagnostics = false, createCanvas } = options;
  const data = options.data === undefined
    ? geometry({ width: options.width ?? (canvas.width || 1280), height: options.height ?? (canvas.height || 800), seed: options.seed ?? 261119 })
    : restoreLandscapeData(options.data);
  if (options.data !== undefined) for (const name of ['width', 'height', 'seed']) {
    if (options[name] !== undefined && options[name] !== data[name]) throw new RangeError(`${name} conflicts with saved landscape data`);
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('A Canvas 2D context is required');
  const prepared = material(data, { diagnostics, ...(createCanvas ? { createCanvas } : {}) });
  let disposed = false;
  const strokeCount = data.peaks.reduce((count, peak) => count + peak.strokes.length, 0);
  function render(time = 6) {
    if (disposed) throw new Error('Landscape renderer has been disposed');
    if (!Number.isFinite(time)) throw new RangeError('time must be finite');
    let drawImageCalls = 0, revealingLayers = 0;
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent'; ctx.filter = 'none'; ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(canvas.width / data.width, 0, 0, canvas.height / data.height, 0, 0);
      for (const layer of prepared.layers) {
        let progress = 1;
        if (layer.name.startsWith('peaks-')) progress = smooth(layer.start, layer.start + layer.duration, time);
        else if (layer.name === 'foreground-pines') progress = smooth(1.9, 3.8, time);
        else if (layer.name === 'sun-and-birds') progress = smooth(2.5, 4.4, time);
        else if (layer.name === 'distant-ridges') progress = smooth(0, .8, time);
        if (progress <= 0) continue;
        if (progress < 1) revealingLayers++;
        ctx.globalAlpha = layer.name.startsWith('peaks-') ? 1 : progress;
        const visibleHeight = layer.name.startsWith('peaks-') ? Math.max(1, Math.floor(layer.canvas.height * progress)) : layer.canvas.height;
        ctx.drawImage(layer.canvas, 0, 0, layer.canvas.width, visibleHeight, layer.x, layer.y, layer.canvas.width, visibleHeight);
        drawImageCalls++;
      }
    } finally { ctx.restore(); }
    return { time, paintCalls: drawImageCalls, drawImageCalls, cacheBuilds: prepared.cache.builds, cacheBytes: prepared.cache.bytes, strokeCount, activeStrokes: 0, revealingLayers, vectorPathCalls: 0, gradientCreates: 0, scope: 'Cached layer reveal; no per-frame brush-path rasterization or physical ink simulation' };
  }
  return { render, describe() { if (disposed) throw new Error('Landscape renderer has been disposed'); return { version: VERSION, width: data.width, height: data.height, seed: data.seed, geometry: JSON.parse(JSON.stringify(data)), cache: JSON.parse(JSON.stringify(prepared.cache)), diagnostics: { enabled: diagnostics, source: 'Authored Canvas alpha surfaces; not a trusted production-render receipt' } }; }, diagnostics() { if (disposed) throw new Error('Landscape renderer has been disposed'); return prepared.diagnosticSurfaces; }, dispose() { if (!disposed) prepared.dispose(); disposed = true; } };
}
