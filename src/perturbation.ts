import type { InkPoint } from './types.js';
import { createRandom } from './core.js';
import { sampleStrokePath } from './path.js';

export interface PathJitterOptions {
  readonly seed?: number;
  /** Correlation distance in path units. Samples are not inserted. Default 12. */
  readonly wavelength?: number;
  /** Tangential displacement relative to normal displacement, 0..1. Default .15. */
  readonly tangentRatio?: number;
  /** Ease displacement to zero at both endpoints. Default true. */
  readonly preserveEndpoints?: boolean;
}
export interface PressureVariationOptions {
  readonly seed?: number;
  /** Absolute position, independent of call order. Default 0. */
  readonly at?: number;
  /** Correlation length in the units of at. Default 1. */
  readonly wavelength?: number;
}
export interface SplitBristleOptions {
  readonly seed?: number;
  /** Full transverse extent of the bundle. Default 12. */
  readonly spread?: number;
  /** Width of the central contact. Default 2. */
  readonly width?: number;
  readonly opacity?: number;
  /** Relative variation, 0..1. Default .3. */
  readonly variance?: number;
  /** Desired sampling distance; capped at 100000 total source points. Default 2. */
  readonly spacing?: number;
}
export interface SplitBristle {
  readonly id: string;
  readonly points: readonly InkPoint[];
  readonly width: number;
  readonly opacity: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function bounded(value: number, name: string): number {
  if (finite(value, name) < 0 || value > 1) throw new RangeError(`${name} must be in 0..1`);
  return value;
}
function seedValue(seed: number): number {
  if (!Number.isSafeInteger(finite(seed, 'seed'))) throw new RangeError('seed must be a safe integer');
  return seed >>> 0;
}
function optionsObject(options: object, fields: readonly string[]): void {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
  for (const key of Object.keys(options)) if (!fields.includes(key)) throw new RangeError(`Unsupported perturbation option: ${key}`);
}
function hash(seed: number, lattice: number): number {
  let value = (seed ^ Math.imul(lattice, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}

/** Seeded 1D gradient noise, bounded to -1..1; no mutable generator state. */
export function createNoise1D(seed: number): (position: number) => number {
  const key = seedValue(seed);
  return position => {
    finite(position, 'noise position');
    // Adjacent integer knots must remain distinguishable in double precision.
    if (Math.abs(position) > Number.MAX_SAFE_INTEGER - 1) throw new RangeError('noise position exceeds safe lattice range');
    const left = Math.floor(position), t = position - left;
    const a = (hash(key, left) * 2 - 1) * t;
    const b = (hash(key, left + 1) * 2 - 1) * (t - 1);
    return Math.max(-1, Math.min(1, 2 * (a + (b - a) * ease(t))));
  };
}

/** Relative coherent pressure variation. A lifted (zero-pressure) pen stays lifted. */
export function varyPressure(base: number, variance: number, options: PressureVariationOptions = {}): number {
  bounded(base, 'base pressure'); bounded(variance, 'variance');
  optionsObject(options, ['seed', 'at', 'wavelength']);
  const noise = createNoise1D(options.seed ?? 0), at = finite(options.at ?? 0, 'at');
  const wavelength = positive(options.wavelength ?? 1, 'wavelength');
  const position = at / wavelength;
  const value = .74 * noise(position + 17.173) + .26 * noise(position * 3.17 + 61.71);
  return clamp(base * (1 + variance * value));
}

function pathData(points: readonly InkPoint[]): { points: InkPoint[]; distances: number[]; length: number } {
  if (!Array.isArray(points) || points.length < 2 || points.length > 100000) throw new RangeError('A perturbation path needs 2..100000 points');
  const copies = points.map(point => {
    if (!point || typeof point !== 'object') throw new TypeError('path must contain points');
    return { x: finite(point.x, 'point.x'), y: finite(point.y, 'point.y'),
      ...(point.pressure === undefined ? {} : { pressure: bounded(point.pressure, 'point.pressure') }) };
  });
  const distances = [0];
  for (let i = 1; i < copies.length; i++) {
    const a = copies[i - 1]!, b = copies[i]!;
    distances.push(finite(distances[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y), 'path length'));
  }
  return { points: copies, distances, length: distances.at(-1)! };
}
function freezePoints(points: readonly InkPoint[]): readonly InkPoint[] {
  return Object.freeze(points.map(point => Object.freeze(point)));
}

/**
 * Opt-in authoring transform: bounded normal/tangential displacement along arc
 * length. Returns owned editable-source data; it never changes renderer defaults.
 * Densify a sparse path first when sub-segment texture is wanted.
 */
export function jitterPath(points: readonly InkPoint[], intensity: number, options: PathJitterOptions = {}): readonly InkPoint[] {
  if (finite(intensity, 'intensity') < 0) throw new RangeError('intensity must be nonnegative');
  optionsObject(options, ['seed', 'wavelength', 'tangentRatio', 'preserveEndpoints']);
  const key = seedValue(options.seed ?? 0), wavelength = positive(options.wavelength ?? 12, 'wavelength');
  const tangentRatio = bounded(options.tangentRatio ?? .15, 'tangentRatio');
  const preserve = options.preserveEndpoints ?? true;
  if (typeof preserve !== 'boolean') throw new TypeError('preserveEndpoints must be boolean');
  const source = pathData(points), noise = createNoise1D(key), tangentNoise = createNoise1D(key ^ 0x51ed270b);
  // Carry nearest nonzero segment directions through duplicate source points.
  const forward: ({ x: number; y: number } | undefined)[] = [], backward: ({ x: number; y: number } | undefined)[] = [];
  let direction: { x: number; y: number } | undefined;
  for (let i = 0; i < source.points.length; i++) {
    if (i) {
      const a = source.points[i - 1]!, b = source.points[i]!, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length > 0) direction = { x: dx / length, y: dy / length };
    }
    backward.push(direction);
  }
  direction = undefined;
  for (let i = source.points.length - 1; i >= 0; i--) {
    if (i + 1 < source.points.length) {
      const a = source.points[i]!, b = source.points[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length > 0) direction = { x: dx / length, y: dy / length };
    }
    forward[i] = direction;
  }
  return freezePoints(source.points.map((point, i) => {
    if (intensity === 0 || source.length === 0 || preserve && (i === 0 || i === source.points.length - 1)) return point;
    const before = backward[i] ?? forward[i] ?? { x: 1, y: 0 }, after = forward[i] ?? backward[i] ?? before;
    const x = before.x + after.x, y = before.y + after.y, magnitude = Math.hypot(x, y);
    const tx = magnitude > 1e-9 ? x / magnitude : after.x, ty = magnitude > 1e-9 ? y / magnitude : after.y;
    const distance = source.distances[i]!, at = distance / wavelength;
    const normal = .74 * noise(at + 17.173) + .26 * noise(at * 3.17 + 61.71);
    const tangent = tangentNoise(at * .83 + 29.37) * tangentRatio;
    const envelope = preserve ? ease(Math.min(1, distance / wavelength, (source.length - distance) / wavelength)) : 1;
    const scale = intensity * envelope / Math.max(1, Math.hypot(normal, tangent));
    return { ...point, x: finite(point.x + (-ty * normal + tx * tangent) * scale, 'perturbed x'),
      y: finite(point.y + (tx * normal + ty * tangent) * scale, 'perturbed y') };
  }));
}

/**
 * A central contact plus shorter, uneven outer strands and optional gaps. The
 * output is ordinary source data, not a physical bristle solver. Count denotes
 * strands; gaps may split one strand into multiple stable-id entries.
 */
export function splitBristles(path: readonly InkPoint[], count: number, options: SplitBristleOptions = {}): readonly SplitBristle[] {
  if (!Number.isInteger(finite(count, 'count')) || count < 1 || count > 64) throw new RangeError('count must be an integer in 1..64');
  optionsObject(options, ['seed', 'spread', 'width', 'opacity', 'variance', 'spacing']);
  const seed = seedValue(options.seed ?? 0), width = positive(options.width ?? 2, 'width');
  const spread = finite(options.spread ?? 12, 'spread');
  if (spread < 0) throw new RangeError('spread must be nonnegative');
  const opacity = bounded(options.opacity ?? .8, 'opacity'), variance = bounded(options.variance ?? .3, 'variance');
  const spacing = positive(options.spacing ?? 2, 'spacing'), source = pathData(path);
  const zeroPositions = new Set(source.points.flatMap((point, i) => point.pressure === 0 && source.length > 0 ? [source.distances[i]! / source.length] : []));
  // Ordinary group sources accept at most 4096 points per stroke, including
  // explicit lifts and segment endpoints. Honor that as well as the full bundle.
  const budget = Math.min(4092, Math.floor(100000 / count) - 4) - zeroPositions.size;
  if (budget < 2) throw new RangeError('Too many pressure-lift anchors for the split source budget');
  const effectiveSpacing = Math.max(spacing, source.length / budget);
  const samples = sampleStrokePath(source.points, { spacing: effectiveSpacing });
  const total = samples.at(-1)!.distance, result: SplitBristle[] = [];
  if (total === 0) throw new RangeError('A split bundle needs a path with nonzero length');
  const pointAt = (at: number) => {
    const position = at * (samples.length - 1), index = Math.min(samples.length - 2, Math.floor(position)), t = position - index;
    const a = samples[index]!, b = samples[index + 1]!;
    // Geometry uses the bounded sampling table; pressure reads the original
    // linear source so a brief explicit lift is not smoothed out by that table.
    const distance = at * total;
    let low = 0, high = source.distances.length - 1;
    while (low < high) { const middle = (low + high) >>> 1; if (source.distances[middle]! < distance) low = middle + 1; else high = middle; }
    const previous = Math.max(0, low - 1), span = source.distances[low]! - source.distances[previous]!;
    const fraction = span > 0 ? (distance - source.distances[previous]!) / span : 1;
    const pressure = zeroPositions.has(at) ? 0 : (source.points[previous]!.pressure ?? 1) * (1 - fraction) + (source.points[low]!.pressure ?? 1) * fraction;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      pressure, nx: a.nx + (b.nx - a.nx) * t, ny: a.ny + (b.ny - a.ny) * t };
  };
  for (let strand = 0; strand < count; strand++) {
    const rng = createRandom(seed ^ Math.imul(strand + 1, 0x9e3779b1));
    const noise = createNoise1D(seed ^ Math.imul(strand + 1, 0x51ed270b));
    const center = strand === 0, side = strand % 2 ? -1 : 1;
    const rank = Math.ceil(strand / 2) / Math.max(1, Math.ceil((count - 1) / 2));
    const lateral = center ? 0 : side * spread * .5 * rank * (1 + (rng() * 2 - 1) * variance);
    const start = center ? 0 : rng() * .27, end = center ? 1 : 1 - rng() * .25;
    const gap = !center && rng() < .68, gapAt = .35 + rng() * .30, gapSize = .035 + rng() * .08;
    const ranges = gap ? [[start, gapAt - gapSize], [gapAt + gapSize, end]] : [[start, end]];
    const strandWidth = width * (center ? 1 : Math.max(.08, Math.min(.88, (.38 + rng() * .28) * (1 + (rng() * 2 - 1) * variance))));
    const strandOpacity = opacity * (center ? 1 : Math.max(.08, Math.min(.94, (.56 + rng() * .25) * (1 + (rng() * 2 - 1) * variance))));
    const tilt = (rng() * 2 - 1) * spread * .33;
    ranges.forEach(([from, to], part) => {
      const steps = Math.max(1, Math.ceil((to! - from!) * (samples.length - 1)));
      const positions = [...new Set([...Array.from({ length: steps + 1 }, (_, i) => from! + (to! - from!) * (i / steps)),
        ...[...zeroPositions].filter(t => t >= from! && t <= to!)])].sort((a, b) => a - b);
      const points = positions.map(t => {
        const u = (t - from!) / (to! - from!), point = pointAt(t);
        const gather = .12 + .88 * Math.pow(Math.max(0, 4 * t * (1 - t)), .72);
        const offset = lateral * gather + (center ? .025 : .13) * spread * noise(t * 6.7 + 19.173) + tilt * (t - .5);
        const taper = center ? 1 : .12 + .88 * Math.pow(Math.max(0, 4 * u * (1 - u)), .6);
        const pressure = varyPressure(point.pressure, variance, { seed: seed ^ strand, at: t, wavelength: .16 }) * taper;
        return { x: finite(point.x + point.nx * offset, 'bristle x'), y: finite(point.y + point.ny * offset, 'bristle y'), pressure };
      });
      result.push(Object.freeze({ id: `bristle-${strand}${gap ? `-part-${part}` : ''}`, points: freezePoints(points),
        width: finite(strandWidth, 'bristle width'), opacity: clamp(strandOpacity) }));
    });
  }
  if (result.reduce((sum, item) => sum + item.points.length, 0) > 100000) throw new RangeError('Split source exceeds the point budget');
  return Object.freeze(result);
}
