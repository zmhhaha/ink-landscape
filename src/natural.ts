import type { Vec2 } from './types.js';
import { createRandom } from './core.js';
import { createNoise1D } from './perturbation.js';

export interface PoissonDiskOptions {
  readonly seed?: number;
  /** Candidates tried per active sample, 1..64. Default 30. */
  readonly attempts?: number;
  /** Explicit output budget, 1..100000. Default 4096. */
  readonly maxPoints?: number;
}

function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function unit(value: number, name: string): number {
  if (finite(value, name) < 0 || value > 1) throw new RangeError(`${name} must be in 0..1`);
  return value;
}
function seedValue(seed: number): number {
  if (!Number.isSafeInteger(finite(seed, 'seed'))) throw new RangeError('seed must be a safe integer');
  return seed >>> 0;
}
function coordinate(value: number): number {
  if (Math.abs(finite(value, 'noise coordinate')) > Number.MAX_SAFE_INTEGER - 1) throw new RangeError('Noise coordinate exceeds the safe lattice');
  return value;
}
const ease = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
function hash(seed: number, x: number, y: number): number {
  let n = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77)) >>> 0;
  n = Math.imul(n ^ n >>> 16, 0x7feb352d);
  n = Math.imul(n ^ n >>> 15, 0x846ca68b);
  return (n ^ n >>> 16) >>> 0;
}
function gradient(h: number, x: number, y: number): number {
  switch (h & 7) {
    case 0: return x; case 1: return -x; case 2: return y; case 3: return -y;
    case 4: return (x + y) * Math.SQRT1_2; case 5: return (x - y) * Math.SQRT1_2;
    case 6: return (-x + y) * Math.SQRT1_2; default: return (-x - y) * Math.SQRT1_2;
  }
}
function noise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, u = ease(tx), v = ease(ty);
  const a = gradient(hash(seed, ix, iy), tx, ty), b = gradient(hash(seed, ix + 1, iy), tx - 1, ty);
  const c = gradient(hash(seed, ix, iy + 1), tx, ty - 1), d = gradient(hash(seed, ix + 1, iy + 1), tx - 1, ty - 1);
  return Math.max(-1, Math.min(1, ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * Math.SQRT2));
}

/** Stateless, seeded 1D gradient noise in -1..1. */
export function getNoise1D(x: number, seed = 0): number { return createNoise1D(seed)(x); }
/** Stateless 2D gradient noise in -1..1; quintic interpolation across lattice boundaries. */
export function getNoise2D(x: number, y: number, seed = 0): number {
  return noise2D(coordinate(x), coordinate(y), seedValue(seed));
}
/** Normalized fBm of 1..8 gradient-noise octaves; no mutable random state. */
export function getFractalNoise2D(x: number, y: number, seed = 0, octaves = 4): number {
  coordinate(x); coordinate(y); const key = seedValue(seed);
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > 8) throw new RangeError('octaves must be in 1..8');
  let value = 0, weight = 0, amplitude = 1, frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    value += amplitude * noise2D(coordinate(x * frequency), coordinate(y * frequency), key ^ Math.imul(octave, 0x51ed270b));
    weight += amplitude; amplitude *= .5; frequency *= 2;
  }
  return value / weight;
}

/**
 * A unit edge-band weight. alpha is normalized inward contact depth (0 at the
 * boundary, 1 at the center), not pigment opacity. thickness is a fraction of
 * the contact radius. The caller owns ink amount and any mass normalization.
 */
export function accumulateEdge(alpha: number, thickness: number): number {
  unit(alpha, 'alpha'); unit(thickness, 'thickness');
  if (thickness === 0 || alpha <= 0 || alpha >= thickness) return 0;
  const t = alpha / thickness;
  return Math.min(1, 16 * t * t * (1 - t) * (1 - t));
}

/** Seeded Bridson sampling in [0,width) x [0,height), with a sparse spatial grid. */
export function poissonDiskSampling(width: number, height: number, r: number, options: PoissonDiskOptions = {}): readonly Vec2[] {
  for (const [name, value] of [['width', width], ['height', height], ['r', r]] as const) {
    if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
  for (const key of Object.keys(options)) if (!['seed', 'attempts', 'maxPoints'].includes(key)) throw new RangeError(`Unsupported sampling option: ${key}`);
  const seed = seedValue(options.seed ?? 0), attempts = options.attempts ?? 30, maximum = options.maxPoints ?? 4096;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 64) throw new RangeError('attempts must be in 1..64');
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100000) throw new RangeError('maxPoints must be in 1..100000');
  const cell = r * Math.SQRT1_2;
  const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  if (cell === 0 || !Number.isSafeInteger(columns) || !Number.isSafeInteger(rows)
    || columns > Number.MAX_SAFE_INTEGER - 4 || rows > Number.MAX_SAFE_INTEGER - 4) throw new RangeError('Sampling grid exceeds safe coordinates');
  const rng = createRandom(seed), points: Vec2[] = [], active: number[] = [], grid = new Map<string, number[]>();
  const keyAt = (x: number, y: number): string => `${x},${y}`;
  const insert = (point: Vec2): void => {
    const index = points.length, key = keyAt(Math.floor(point.x / cell), Math.floor(point.y / cell));
    points.push(Object.freeze(point)); active.push(index);
    const indices = grid.get(key) ?? []; indices.push(index); grid.set(key, indices);
  };
  insert({ x: rng() * width, y: rng() * height });
  while (active.length && points.length < maximum) {
    const activeIndex = Math.floor(rng() * active.length), center = points[active[activeIndex]!]!;
    let accepted = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const angle = rng() * Math.PI * 2, radius = r * Math.sqrt(1 + 3 * rng());
      const point = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
      if (!(point.x >= 0 && point.x < width && point.y >= 0 && point.y < height)) continue;
      const cx = Math.floor(point.x / cell), cy = Math.floor(point.y / cell);
      let separated = true;
      for (let dy = -2; dy <= 2 && separated; dy++) for (let dx = -2; dx <= 2 && separated; dx++) {
        for (const index of grid.get(keyAt(cx + dx, cy + dy)) ?? []) {
          const other = points[index]!;
          if (Math.hypot(point.x - other.x, point.y - other.y) < r) { separated = false; break; }
        }
      }
      if (separated) { insert(point); accepted = true; break; }
    }
    if (!accepted) { active[activeIndex] = active[active.length - 1]!; active.pop(); }
  }
  return Object.freeze(points);
}
