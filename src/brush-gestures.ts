import type { BrushDrag, BrushEntry, BrushFinish, BrushPressureProfile, BrushRhythm, BrushTurn } from './brushwork.js';
import type { InkPoint, StrokeSmoothing, Vec2 } from './types.js';

interface Point extends Vec2 { readonly pressure: number }
interface Station extends Point { readonly distance: number; readonly dx: number; readonly dy: number }
interface LocalOptions {
  readonly entry: BrushEntry;
  readonly finish: BrushFinish;
  readonly turn: BrushTurn;
  readonly pressureProfile: BrushPressureProfile;
  readonly rhythm: BrushRhythm;
  readonly drag: BrushDrag;
  readonly strength: number;
  readonly width: number;
  readonly seed: number;
  readonly smoothing: StrokeSmoothing;
}

const MAX_CURVE_POINTS = 16_384;
const MAX_STATIONS = 2048;
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const ease = (t: number): number => t * t * (3 - 2 * t);
const lerpPoint = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), pressure: mix(a.pressure, b.pressure, t) });

function measure(points: readonly Point[]): number[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const distance = distances[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y);
    if (!Number.isFinite(distance) || distance <= distances[i - 1]!) throw new RangeError('Local brush distances exceed finite coordinate precision');
    distances.push(distance);
  }
  return distances;
}

function compact(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (![point.x, point.y, point.pressure].every(Number.isFinite)) throw new RangeError('Local brush coordinates must be finite');
    const previous = result.at(-1);
    if (previous && previous.x === point.x && previous.y === point.y) result[result.length - 1] = point;
    else result.push(point);
  }
  return result;
}

function at(points: readonly Point[], distances: readonly number[], distance: number): Station {
  let low = 1, high = points.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (distances[middle]! < distance) low = middle + 1; else high = middle;
  }
  const a = points[low - 1]!, b = points[low]!;
  const length = distances[low]! - distances[low - 1]!;
  const t = clamp((distance - distances[low - 1]!) / length);
  return { ...(t === 0 ? a : t === 1 ? b : lerpPoint(a, b, t)), distance,
    dx: (b.x - a.x) / length, dy: (b.y - a.y) / length };
}

// The same centripetal tangent convention as the public path sampler. Here
// every original vertex is retained, including an authored zero-pressure one.
function tangent(previous: Point, point: Point, next: Point): Vec2 {
  const ax = point.x - previous.x, ay = point.y - previous.y, bx = next.x - point.x, by = next.y - point.y;
  const before = Math.sqrt(Math.hypot(ax, ay)), after = Math.sqrt(Math.hypot(bx, by));
  return { x: ax / before - (ax + bx) / (before + after) + bx / after,
    y: ay / before - (ay + by) / (before + after) + by / after };
}

function flattenCurve(source: readonly Point[]): Point[] {
  if (source.length < 3) return [...source];
  const divisions = Math.max(1, Math.min(24, Math.floor((MAX_CURVE_POINTS - 1) / (source.length - 1))));
  const result: Point[] = [source[0]!];
  for (let i = 0; i < source.length - 1; i++) {
    const a = source[i]!, b = source[i + 1]!, dx = b.x - a.x, dy = b.y - a.y;
    const knot = Math.sqrt(Math.hypot(dx, dy));
    const left = i > 0 ? tangent(source[i - 1]!, a, b) : undefined;
    const right = i + 2 < source.length ? tangent(a, b, source[i + 2]!) : undefined;
    const m0 = left ? { x: left.x * knot, y: left.y * knot } : { x: dx, y: dy };
    const m1 = right ? { x: right.x * knot, y: right.y * knot } : { x: dx, y: dy };
    for (let step = 1; step <= divisions; step++) {
      if (step === divisions) { result.push(b); continue; }
      const t = step / divisions, position = ease(t), l = t * t * t - 2 * t * t + t, r = t * t * t - t * t;
      result.push({ x: a.x + dx * position + m0.x * l + m1.x * r,
        y: a.y + dy * position + m0.y * l + m1.y * r, pressure: mix(a.pressure, b.pressure, position) });
    }
  }
  return compact(result);
}

function corners(source: readonly Point[], options: LocalOptions): Point[] {
  if (options.turn === 'preserve') return options.smoothing === 'catmull-rom' ? flattenCurve(source) : [...source];
  const result: Point[] = [source[0]!];
  const divisionsLimit = Math.max(2, Math.min(16, Math.floor((MAX_CURVE_POINTS - 2) / Math.max(1, source.length - 2)) - 1));
  for (let i = 1; i < source.length - 1; i++) {
    const a = source[i - 1]!, b = source[i]!, c = source[i + 1]!;
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const dot = ((b.x - a.x) / before) * ((c.x - b.x) / after) + ((b.y - a.y) / before) * ((c.y - b.y) / after);
    const reach = Math.min(before * .28, after * .28, options.width * 1.1) * options.strength;
    if (dot > .995 || dot < -.96 || reach === 0) { result.push(b); continue; }
    const entry = lerpPoint(b, a, reach / before), exit = lerpPoint(b, c, reach / after);
    result.push(entry);
    if (options.turn === 'angular') {
      const shoulder = 1 - .22 * options.strength;
      result[result.length - 1] = { ...entry, pressure: entry.pressure * shoulder };
      result.push({ ...b, pressure: b.pressure + b.pressure * (1 - b.pressure) * .22 * options.strength },
        { ...exit, pressure: exit.pressure * shoulder });
    } else {
      const requested = Math.max(2, Math.min(divisionsLimit, Math.ceil(reach / Math.max(.5, options.width * .05))));
      const divisions = requested - requested % 2;
      // Include the midpoint so an authored lift at the vertex cannot disappear.
      const locations = new Set([.5, ...Array.from({ length: divisions }, (_, step) => (step + 1) / divisions)]);
      for (const t of [...locations].sort((a, b) => a - b)) {
        const u = 1 - t;
        result.push({ x: entry.x * u * u + 2 * b.x * u * t + exit.x * t * t,
          y: entry.y * u * u + 2 * b.y * u * t + exit.y * t * t,
          pressure: t <= .5 ? mix(entry.pressure, b.pressure, ease(t * 2)) : mix(b.pressure, exit.pressure, ease(t * 2 - 1)) });
      }
    }
  }
  result.push(source.at(-1)!);
  return compact(result);
}

function noise(seed: number, position: number): number {
  const hash = (index: number): number => {
    let value = (seed ^ Math.imul(index, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return ((value ^ value >>> 16) >>> 0) / 4294967296;
  };
  const index = Math.floor(position);
  return mix(hash(index), hash(index + 1), ease(position - index));
}

function modulate(points: readonly Point[], options: LocalOptions): Point[] {
  if (options.strength === 0 || (options.pressureProfile === 'preserve' && options.rhythm === 'continuous' && options.drag === 'forward')) return [...points];
  const distances = measure(points), total = distances.at(-1)!;
  const steps = Math.max(2, Math.min(MAX_STATIONS, Math.ceil(total / Math.max(1, options.width * .34))));
  const locations = new Set(distances);
  for (let i = 0; i <= steps; i++) locations.add(total * (i / steps));
  const cycleLength = Math.max(options.width * 1.8, total / 128);
  return [...locations].sort((a, b) => a - b).map(distance => {
    const station = at(points, distances, distance), t = distance / total, edge = t === 0 || t === 1 ? 0 : Math.sin(Math.PI * t);
    const cycle = distance / cycleLength;
    let pressure = station.pressure, tangentOffset = 0, normalOffset = 0;
    if (options.pressureProfile === 'lift-press') pressure *= 1 - options.strength * (1 - (.2 + .8 * Math.pow(Math.sin(Math.PI * t), .72)));
    if (options.rhythm === 'hesitant') {
      pressure *= 1 - options.strength * .46 * noise(options.seed ^ 0x4d61726b, cycle * 2.4);
      normalOffset += (noise(options.seed, cycle * 1.7) - .5) * options.width * .12 * options.strength * edge;
    }
    if (options.drag === 'reverse') {
      tangentOffset -= Math.pow(Math.sin(cycle * Math.PI), 2) * options.width * .2 * options.strength * edge;
      normalOffset += (noise(options.seed ^ 0x526576, cycle * 3.1) - .5) * options.width * .2 * options.strength * edge;
      pressure *= 1 - options.strength * (.1 + .25 * noise(options.seed ^ 11, cycle * 4));
    }
    return { x: station.x + station.dx * tangentOffset - station.dy * normalOffset,
      y: station.y + station.dy * tangentOffset + station.dx * normalOffset, pressure: clamp(pressure) };
  });
}

function endpointGeometry(points: readonly Point[], options: LocalOptions): Point[] {
  let path = [...points];
  if (options.strength === 0) return path;
  if (options.entry === 'exposed' || options.finish === 'open' || options.finish === 'return') {
    const distances = measure(path), total = distances.at(-1)!;
    const entryReach = Math.min(options.width * 1.55, total * .24) * options.strength;
    const finishReach = Math.min(options.width * (options.finish === 'return' ? .82 : 1.7), total * .24) * options.strength;
    const locations = new Set(distances);
    for (let i = 0; i <= 16; i++) {
      if (options.entry === 'exposed') locations.add(entryReach * i / 16);
      if (options.finish === 'open' || options.finish === 'return') locations.add(total - finishReach * i / 16);
    }
    path = [...locations].sort((a, b) => a - b).map(distance => {
      const station = at(path, distances, distance);
      const inFactor = options.entry === 'exposed' ? mix(1, ease(clamp(distance / entryReach)), options.strength) : 1;
      const remaining = ease(clamp((total - distance) / finishReach));
      const outFactor = options.finish === 'open' ? mix(1, remaining, options.strength)
        : options.finish === 'return' ? mix(1, .035 + .965 * remaining, options.strength) : 1;
      return { x: station.x, y: station.y, pressure: station.pressure * inFactor * outFactor };
    });
  }
  if (options.entry === 'concealed') {
    const a = path[0]!, b = path[1]!, length = Math.hypot(b.x - a.x, b.y - a.y), total = measure(path).at(-1)!;
    const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
    const reach = Math.min(options.width * .8, total * .12) * options.strength;
    const p1 = { x: a.x - dx * reach + -dy * reach * .22, y: a.y - dy * reach + dx * reach * .22 };
    const p2 = { x: a.x - dx * reach * .7, y: a.y - dy * reach * .7 };
    const prefix: Point[] = [];
    for (let i = 0; i < 17; i++) {
      const t = i / 16, u = 1 - t;
      prefix.push({ x: a.x * (u * u * u + t * t * t) + 3 * p1.x * u * u * t + 3 * p2.x * u * t * t,
        y: a.y * (u * u * u + t * t * t) + 3 * p1.y * u * u * t + 3 * p2.y * u * t * t,
        pressure: a.pressure * mix(1 - .96 * options.strength, 1, ease(t)) });
    }
    path = [...prefix, ...path.slice(1)];
  }
  if (options.finish === 'return') {
    const b = path.at(-1)!, a = path.at(-2)!, length = Math.hypot(b.x - a.x, b.y - a.y), total = measure(path).at(-1)!;
    const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
    // Lift before turning, then bring the much smaller contact back inside the
    // completed stroke. Reversing a full-width ribbon would make a hollow hook.
    const reach = Math.min(options.width * .45, total * .08) * options.strength;
    const control = { x: b.x - dx * reach * .32 - dy * reach * .15, y: b.y - dy * reach * .32 + dx * reach * .15 };
    const end = { x: b.x - dx * reach, y: b.y - dy * reach };
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      path.push({ x: b.x * u * u + 2 * control.x * u * t + end.x * t * t,
        y: b.y * u * u + 2 * control.y * u * t + end.y * t * t,
        pressure: b.pressure * mix(1, 1 - ease(t), options.strength) });
    }
  }
  return compact(path);
}

/** Bounded, deterministic gesture geometry; internal to the opt-in local-v1 model. */
export function compileLocalBrushGeometry(source: readonly Point[], options: LocalOptions): InkPoint[] {
  return endpointGeometry(compact(modulate(corners(source, options), options)), options);
}
