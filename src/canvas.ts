import type {
  InkPoint,
  InkScene,
  RenderOptions,
  RenderStats,
  StrokeMark,
  Vec2,
  WashMark,
} from './types.js';

const TAU = Math.PI * 2;
const EPSILON = 1e-8;

interface PathSample extends Vec2 {
  readonly pressure: number;
  readonly distance: number;
  readonly nx: number;
  readonly ny: number;
}

function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Random access noise keeps partial and complete strokes on the same texture. */
function hash(seed: number, index: number, channel = 0): number {
  let value = ((seed | 0) ^ Math.imul(index | 0, 0x9e3779b1)
    ^ Math.imul(channel | 0, 0x85ebca77)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function noise(seed: number, position: number, channel = 0): number {
  const left = Math.floor(position);
  const t = position - left;
  return mix(hash(seed, left, channel), hash(seed, left + 1, channel), t * t * (3 - 2 * t));
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function range(value: number, name: string, low: number, high: number): void {
  finite(value, name);
  if (value < low || value > high) throw new RangeError(`${name} must be in ${low}..${high}`);
}

function validatePoints(points: readonly InkPoint[], name: string, minimum: number): void {
  if (!Array.isArray(points) || points.length < minimum) {
    throw new RangeError(`${name} must contain at least ${minimum} points`);
  }
  for (const point of points) {
    finite(point.x, `${name}.x`);
    finite(point.y, `${name}.y`);
    if (point.pressure !== undefined) range(point.pressure, `${name}.pressure`, 0, 1);
  }
}

function validate(scene: InkScene, options: RenderOptions): void {
  if (scene.version !== 1) throw new RangeError('Unsupported ink scene version');
  finite(scene.width, 'scene.width');
  finite(scene.height, 'scene.height');
  if (scene.width <= 0 || scene.height <= 0) throw new RangeError('Scene dimensions must be positive');
  if (options.time !== undefined) finite(options.time, 'time');
  if (options.paperTexture !== undefined) range(options.paperTexture, 'paperTexture', 0, 1);
  if (!Array.isArray(scene.marks)) throw new TypeError('scene.marks must be an array');
  for (const mark of scene.marks) {
    range(mark.opacity, 'mark.opacity', 0, 1);
    finite(mark.start, 'mark.start');
    finite(mark.duration, 'mark.duration');
    if (mark.start < 0 || mark.duration < 0) throw new RangeError('Mark timing must be nonnegative');
    if (mark.kind === 'stroke') {
      validatePoints(mark.points, 'stroke.points', 2);
      finite(mark.width, 'stroke.width');
      if (mark.width <= 0) throw new RangeError('stroke.width must be positive');
      range(mark.dryness, 'stroke.dryness', 0, 1);
      finite(mark.tipAngle, 'stroke.tipAngle');
      if (mark.nib !== 'round' && mark.nib !== 'flat') throw new RangeError('Unknown stroke nib');
      if (mark.clip !== undefined) validatePoints(mark.clip, 'stroke.clip', 3);
    } else if (mark.kind === 'wash') {
      validatePoints(mark.outline, 'wash.outline', 3);
      range(mark.roughness, 'wash.roughness', 0, 1);
      if (!Number.isInteger(mark.passes) || mark.passes < 1 || mark.passes > 32) {
        throw new RangeError('wash.passes must be an integer in 1..32');
      }
    } else {
      throw new RangeError('Unknown ink mark kind');
    }
  }
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly Vec2[]): void {
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function progressAt(start: number, duration: number, time: number): number {
  if (time < start) return 0;
  return duration === 0 ? 1 : clamp((time - start) / duration);
}

/** Sample the complete stroke first, so seeking never changes the texture seed. */
function sampleStroke(mark: StrokeMark): PathSample[] {
  const lengths = [0];
  for (let i = 1; i < mark.points.length; i++) {
    const a = mark.points[i - 1]!;
    const b = mark.points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[lengths.length - 1]!;
  if (total < EPSILON) {
    const point = mark.points[0]!;
    return [{ x: point.x, y: point.y, pressure: point.pressure ?? 1, distance: 0, nx: 0, ny: 1 }];
  }
  // A per-stroke sampling guard, not a limit on the number of scene marks.
  const steps = Math.min(8192, Math.max(1, Math.ceil(total / clamp(mark.width * 0.12, 0.65, 4))));
  const samples: PathSample[] = [];
  let segment = 1;
  for (let i = 0; i <= steps; i++) {
    const distance = total * i / steps;
    while (segment < mark.points.length - 1 && lengths[segment]! < distance) segment++;
    while (segment < mark.points.length - 1
      && lengths[segment]! - lengths[segment - 1]! < EPSILON) segment++;
    const a = mark.points[segment - 1]!;
    const b = mark.points[segment]!;
    const segmentLength = lengths[segment]! - lengths[segment - 1]!;
    const t = segmentLength < EPSILON ? 0 : clamp((distance - lengths[segment - 1]!) / segmentLength);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    samples.push({
      x: mix(a.x, b.x, t), y: mix(a.y, b.y, t),
      pressure: mix(a.pressure ?? 1, b.pressure ?? 1, t),
      distance, nx: -dy / length, ny: dx / length,
    });
  }
  return samples;
}

function partialSamples(samples: readonly PathSample[], progress: number): readonly PathSample[] {
  if (progress >= 1 || samples.length < 2) return samples;
  const distance = samples[samples.length - 1]!.distance * progress;
  const end = samples.findIndex(sample => sample.distance >= distance);
  if (end <= 0) return [samples[0]!];
  const active = samples.slice(0, end);
  const a = samples[end - 1]!;
  const b = samples[end]!;
  const t = (distance - a.distance) / (b.distance - a.distance);
  active.push({
    x: mix(a.x, b.x, t), y: mix(a.y, b.y, t),
    pressure: mix(a.pressure, b.pressure, t), distance,
    nx: mix(a.nx, b.nx, t), ny: mix(a.ny, b.ny, t),
  });
  return active;
}

function halfWidth(mark: StrokeMark, sample: PathSample): number {
  let support = 1;
  if (mark.nib === 'flat') {
    const across = sample.nx * Math.cos(mark.tipAngle) + sample.ny * Math.sin(mark.tipAngle);
    const along = -sample.nx * Math.sin(mark.tipAngle) + sample.ny * Math.cos(mark.tipAngle);
    support = Math.hypot(across, along * 0.16);
  }
  const variation = 1 + (noise(mark.seed, sample.distance / Math.max(5, mark.width), 1) - 0.5)
    * (0.1 + mark.dryness * 0.32);
  return mark.width * sample.pressure * support * variation * 0.5;
}

function ribbon(
  ctx: CanvasRenderingContext2D,
  mark: StrokeMark,
  samples: readonly PathSample[],
  scale = 1,
): void {
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    const width = halfWidth(mark, sample) * scale;
    const x = sample.x + sample.nx * width;
    const y = sample.y + sample.ny * width;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]!;
    const width = halfWidth(mark, sample) * scale;
    ctx.lineTo(sample.x - sample.nx * width, sample.y - sample.ny * width);
  }
  ctx.closePath();
}

function fiberRun(
  ctx: CanvasRenderingContext2D,
  mark: StrokeMark,
  samples: readonly PathSample[],
  offset: number,
  fiber: number,
  count: number,
): void {
  if (samples.length < 2) return;
  const points: Vec2[] = [];
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (const sample of samples) {
    const width = halfWidth(mark, sample);
    const wander = (noise(mark.seed, sample.distance / Math.max(8, mark.width * 0.7), fiber + 17) - 0.5) * 0.12;
    const center = (offset + wander) * width;
    const band = Math.max(0, width * (0.38 + hash(mark.seed, fiber, 51) * 0.45) / count);
    left.push({ x: sample.x + sample.nx * (center + band), y: sample.y + sample.ny * (center + band) });
    right.push({ x: sample.x + sample.nx * (center - band), y: sample.y + sample.ny * (center - band) });
  }
  points.push(...left, ...right.reverse());
  polygon(ctx, points);
  ctx.fill();
}

function drawDot(ctx: CanvasRenderingContext2D, mark: StrokeMark, sample: PathSample, progress: number): void {
  const radius = mark.width * sample.pressure * 0.5;
  if (radius <= 0) return;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.ellipse(sample.x, sample.y, radius, radius * (mark.nib === 'flat' ? 0.16 : 1), mark.tipAngle, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = mark.opacity * (1 - mark.dryness) * progress;
    ctx.fill();
    const flecks = Math.min(180, Math.max(8, Math.ceil(radius * radius * 0.5)));
    ctx.globalAlpha = mark.opacity * (0.25 + mark.dryness * 0.5) * progress;
    for (let i = 0; i < flecks; i++) {
      const x = sample.x + (hash(mark.seed, i, 71) * 2 - 1) * radius;
      const y = sample.y + (hash(mark.seed, i, 72) * 2 - 1) * radius;
      const size = Math.max(0.3, radius * 0.12);
      ctx.fillRect(x, y, size, size * 0.45);
    }
  } finally {
    ctx.restore();
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, mark: StrokeMark, progress: number): void {
  const samples = partialSamples(sampleStroke(mark), progress);
  ctx.save();
  try {
    if (mark.clip) {
      polygon(ctx, mark.clip);
      ctx.clip();
    }
    ctx.fillStyle = '#171b18';
    ctx.fillStyle = mark.ink;
    if (samples.length === 1) {
      drawDot(ctx, mark, samples[0]!, progress);
      return;
    }
    const base = mark.opacity * Math.pow(1 - mark.dryness, 1.7);
    if (base > 0) {
      // A small stylized soft edge. This is not a fluid or paper-fibre simulation.
      if (mark.dryness < 0.3 && mark.width > 3) {
        ctx.globalAlpha = base * 0.09;
        ctx.shadowColor = mark.ink;
        ctx.shadowBlur = Math.min(3, mark.width * 0.12) * (1 - mark.dryness);
        ribbon(ctx, mark, samples, 1.035);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = base * 0.9;
      ribbon(ctx, mark, samples);
      ctx.fill();
    }
    const count = Math.round(clamp(mark.width * 0.65 + 5, 6, 28));
    for (let fiber = 0; fiber < count; fiber++) {
      const offset = ((fiber + 0.5) / count * 2 - 1) * 0.9;
      const threshold = 0.08 + mark.dryness * 0.66;
      const run: PathSample[] = [];
      ctx.globalAlpha = mark.opacity * (0.13 + hash(mark.seed, fiber, 14) * 0.4)
        * (0.35 + mark.dryness * 0.65);
      for (const sample of samples) {
        const present = noise(mark.seed, sample.distance / Math.max(3, mark.width * 0.32), fiber + 43) >= threshold;
        if (present) run.push(sample);
        else {
          fiberRun(ctx, mark, run, offset, fiber, count);
          run.length = 0;
        }
      }
      fiberRun(ctx, mark, run, offset, fiber, count);
    }
  } finally {
    ctx.restore();
  }
}

function roughOutline(mark: WashMark, pass: number): Vec2[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of mark.outline) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  const amplitude = Math.min(16, diagonal * 0.035) * mark.roughness;
  const result: Vec2[] = [];
  let distance = 0;
  const perimeter = mark.outline.reduce((sum, point, index) => {
    const next = mark.outline[(index + 1) % mark.outline.length]!;
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
  const spacing = Math.max(3, perimeter / 4096);
  for (let i = 0; i < mark.outline.length; i++) {
    const a = mark.outline[i]!;
    const b = mark.outline[(i + 1) % mark.outline.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / spacing));
    const nx = length < EPSILON ? 0 : -(b.y - a.y) / length;
    const ny = length < EPSILON ? 0 : (b.x - a.x) / length;
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const variation = (noise(mark.seed, (distance + length * t) / 12, pass + 101) * 2 - 1) * amplitude;
      // Anchor every corner, while varying the edge between caller-supplied points.
      const displacement = variation * Math.sin(Math.PI * t);
      result.push({ x: mix(a.x, b.x, t) + nx * displacement, y: mix(a.y, b.y, t) + ny * displacement });
    }
    distance += length;
  }
  return result;
}

function drawWash(ctx: CanvasRenderingContext2D, mark: WashMark, progress: number): void {
  ctx.save();
  try {
    ctx.fillStyle = '#171b18';
    ctx.fillStyle = mark.ink;
    const passOpacity = 1 - Math.pow(1 - mark.opacity * progress, 1 / mark.passes);
    for (let pass = 0; pass < mark.passes; pass++) {
      ctx.globalAlpha = passOpacity;
      ctx.shadowColor = mark.ink;
      ctx.shadowBlur = mark.roughness * 2;
      polygon(ctx, roughOutline(mark, pass));
      ctx.fill();
    }
  } finally {
    ctx.restore();
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, scene: InkScene, strength: number): void {
  if (strength === 0) return;
  const count = Math.min(12000, Math.ceil(scene.width * scene.height / 180));
  ctx.fillStyle = '#504638';
  ctx.globalAlpha = strength * 0.17;
  for (let i = 0; i < count; i++) {
    const x = hash(scene.seed, i, 201) * scene.width;
    const y = hash(scene.seed, i, 202) * scene.height;
    ctx.fillRect(x, y, 0.35 + hash(scene.seed, i, 203) * 1.1, 0.2 + hash(scene.seed, i, 204) * 0.45);
  }
}

/**
 * Paints editable scene data on an existing Canvas 2D context.
 *
 * Default rendering clears the canvas and seeks by absolute seconds. Stroke
 * timing reveals path length; wash timing fades its pigment density. `clear:
 * false` intentionally composites over existing pixels and does not promise
 * call-order independence. Repeatability applies to a fixed browser/backend,
 * backing-canvas size and inputs, not byte-identical output across browsers.
 */
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  scene: InkScene,
  options: RenderOptions = {},
): RenderStats {
  validate(scene, options);
  const time = options.time ?? Infinity;
  let strokeCount = 0;
  let washCount = 0;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.filter = 'none';
    if (options.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(ctx.canvas.width / scene.width, 0, 0, ctx.canvas.height / scene.height, 0, 0);
    if (options.clear !== false) {
      ctx.fillStyle = '#f2efe6';
      ctx.fillStyle = scene.background;
      ctx.fillRect(0, 0, scene.width, scene.height);
      drawPaper(ctx, scene, options.paperTexture ?? 0.06);
    }
    for (const mark of scene.marks) {
      const progress = progressAt(mark.start, mark.duration, time);
      if (progress <= 0 || mark.opacity <= 0) continue;
      ctx.globalAlpha = 1;
      if (mark.kind === 'stroke') {
        drawStroke(ctx, mark, progress);
        strokeCount++;
      } else {
        drawWash(ctx, mark, progress);
        washCount++;
      }
    }
  } finally {
    ctx.restore();
  }
  return { visibleMarks: strokeCount + washCount, strokeCount, washCount };
}
