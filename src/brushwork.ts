import { createInkScene } from './core.js';
import { compileLocalBrushGeometry } from './brush-gestures.js';
import type { InkPoint, StrokeMark, StrokeOptions, Vec2 } from './types.js';

export type BrushAxis = 'center' | 'side';
export type BrushEntry = 'preserve' | 'exposed' | 'concealed';
export type BrushFinish = 'preserve' | 'open' | 'return';
export type BrushPressureProfile = 'preserve' | 'lift-press';
export type BrushTurn = 'preserve' | 'round' | 'angular';
export type BrushRhythm = 'continuous' | 'hesitant';
export type BrushDrag = 'forward' | 'reverse';
export type BrushGestureModel = 'legacy' | 'local-v1';

/**
 * Composable drawing gestures, not a physical reconstruction of traditional
 * brush handling. Caller paths remain the basis of every generated stroke.
 */
export interface BrushworkOptions extends StrokeOptions {
  /** Explicit local geometry; omitted keeps the original saved gesture semantics. */
  readonly gestureModel?: BrushGestureModel;
  /** Center/side supply nib defaults only; they do not model the brush tip. */
  readonly axis?: BrushAxis;
  readonly entry?: BrushEntry;
  readonly finish?: BrushFinish;
  /** Modulates, rather than replaces, the caller's pressure values. */
  readonly pressureProfile?: BrushPressureProfile;
  /** Round selects Catmull-Rom; angular keeps vertices and accents the corner. */
  readonly turn?: BrushTurn;
  /** Hesitant supplies spatial contact variation, not a velocity simulation. */
  readonly rhythm?: BrushRhythm;
  /** Reverse adds rearward contact offsets; it does not reverse the caller's path. */
  readonly drag?: BrushDrag;
  /** Geometric gesture strength in 0..1. Nib/material defaults are independent. */
  readonly strength?: number;
}

interface Point extends Vec2 { readonly pressure: number }
interface Station extends Point { readonly distance: number; readonly dx: number; readonly dy: number }
const MAX_SOURCE_POINTS = 4096;
const MAX_STATIONS = 2048;
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function choice<T extends string>(value: T, name: string, choices: readonly T[]): T {
  if (!choices.includes(value)) throw new RangeError(`${name} must be ${choices.join(', ')}`);
  return value;
}

function noise(seed: number, position: number): number {
  const hash = (index: number): number => {
    let value = (seed ^ Math.imul(index, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return ((value ^ value >>> 16) >>> 0) / 4294967296;
  };
  const index = Math.floor(position), t = position - index;
  return mix(hash(index), hash(index + 1), t * t * (3 - 2 * t));
}

function unique(points: readonly InkPoint[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1), copy = { x: point.x, y: point.y, pressure: point.pressure ?? 1 };
    if (previous && point.x === previous.x && point.y === previous.y) result[result.length - 1] = copy;
    else result.push(copy);
  }
  return result;
}

function measure(points: readonly Point[]): number[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const distance = distances[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y);
    if (distance <= distances[i - 1]!) throw new RangeError('Brushwork segment distances exceed coordinate precision');
    distances.push(distance);
  }
  return distances;
}

function stationAt(points: readonly Point[], distances: readonly number[], distance: number): Station {
  let low = 1, high = distances.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (distances[middle]! < distance) low = middle + 1;
    else high = middle;
  }
  const segment = low;
  const a = points[segment - 1]!, b = points[segment]!;
  const length = distances[segment]! - distances[segment - 1]!;
  const t = Math.max(0, Math.min(1, (distance - distances[segment - 1]!) / length));
  return { x: t === 0 ? a.x : t === 1 ? b.x : mix(a.x, b.x, t),
    y: t === 0 ? a.y : t === 1 ? b.y : mix(a.y, b.y, t),
    pressure: t === 0 ? a.pressure : t === 1 ? b.pressure : mix(a.pressure, b.pressure, t), distance,
    dx: (b.x - a.x) / length, dy: (b.y - a.y) / length };
}

/**
 * Prepare one ordinary, serializable StrokeMark from a caller-authored path.
 * The result can be added with builder.stroke(mark.points, mark), or included
 * in an InkScene's marks. All generated points and options own their data.
 *
 * Concealed entry makes a small reverse-and-return movement near the initial
 * point. Return finish moves back inside the last segment. These gestures can
 * extend outside the caller's control polygon; supply clip when required.
 */
export function createBrushStroke(points: readonly InkPoint[], options: BrushworkOptions = {}): StrokeMark {
  const {
    axis = 'center', entry = 'preserve', finish = 'preserve', pressureProfile = 'preserve',
    turn = 'preserve', rhythm = 'continuous', drag = 'forward', strength = 1, gestureModel = 'legacy', ...strokeOptions
  } = options;
  choice(gestureModel, 'gestureModel', ['legacy', 'local-v1']);
  choice(axis, 'axis', ['center', 'side']);
  choice(entry, 'entry', ['preserve', 'exposed', 'concealed']);
  choice(finish, 'finish', ['preserve', 'open', 'return']);
  choice(pressureProfile, 'pressureProfile', ['preserve', 'lift-press']);
  choice(turn, 'turn', ['preserve', 'round', 'angular']);
  choice(rhythm, 'rhythm', ['continuous', 'hesitant']);
  choice(drag, 'drag', ['forward', 'reverse']);
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError('strength must be finite and in 0..1');
  }
  if (!Array.isArray(points) || points.length > MAX_SOURCE_POINTS) throw new RangeError('A brushwork path supports at most 4096 source points');

  // Reuse the core's authoritative path/style/timing validation before deriving
  // any geometry. A new builder keeps the helper independent of browser state.
  const validated = createInkScene({ width: 1, height: 1 }).stroke(points, strokeOptions);
  const source = unique(validated.points), distances = measure(source), total = distances.at(-1)!;
  const first = source[0]!, second = source[1]!;
  const firstAngle = Math.atan2(second.y - first.y, second.x - first.x);
  const style: StrokeOptions = {
    ...validated,
    width: strokeOptions.width ?? (axis === 'side' ? 14 : 8),
    nib: strokeOptions.nib ?? (axis === 'side' ? 'flat' : 'round'),
    tipAngle: strokeOptions.tipAngle ?? (axis === 'side' ? firstAngle + Math.PI * .20 : 0),
    dryness: strokeOptions.dryness ?? (drag === 'reverse' ? .64 : .25),
    ...(turn === 'round' ? { smoothing: 'catmull-rom' as const }
      : turn === 'angular' ? { smoothing: 'linear' as const } : {}),
  };
  const width = style.width!;
  if (gestureModel === 'local-v1') {
    const path = compileLocalBrushGeometry(source, {
      entry, finish, turn, pressureProfile, rhythm, drag, strength, width, seed: validated.seed,
      smoothing: strokeOptions.smoothing ?? 'linear',
    });
    // Local curves are compiled to points once. A second global spline would
    // distort their bounded entry, return and corner geometry.
    return createInkScene({ width: 1, height: 1 }).stroke(path, { ...style, smoothing: 'linear' });
  }
  const requiresStations = pressureProfile !== 'preserve' || rhythm === 'hesitant' || drag === 'reverse' || turn === 'angular';
  let path: Point[];
  if (requiresStations && strength > 0) {
    const steps = Math.max(2, Math.min(MAX_STATIONS, Math.ceil(total / Math.max(1, width * .34))));
    const locations = new Set<number>(distances);
    for (let i = 0; i <= steps; i++) locations.add(total * (i / steps));
    const corners: { distance: number; reach: number }[] = [];
    if (turn === 'angular') for (let i = 1; i < source.length - 1; i++) {
      const a = source[i - 1]!, b = source[i]!, c = source[i + 1]!;
      const before = distances[i]! - distances[i - 1]!, after = distances[i + 1]! - distances[i]!;
      const dot = ((b.x - a.x) / before) * ((c.x - b.x) / after) + ((b.y - a.y) / before) * ((c.y - b.y) / after);
      if (dot > .985) continue;
      const reach = Math.min(before, after, width) * .35;
      corners.push({ distance: distances[i]!, reach });
      locations.add(distances[i]! - reach); locations.add(distances[i]! + reach);
    }
    const cycleLength = Math.max(width * 1.8, total / 128);
    path = [...locations].sort((a, b) => a - b).map(distance => {
      const sample = stationAt(source, distances, distance), t = distance / total;
      let pressure = sample.pressure;
      if (pressureProfile === 'lift-press') pressure *= 1 - strength * (1 - (.20 + .80 * Math.pow(Math.sin(Math.PI * t), .72)));
      const edge = t === 0 || t === 1 ? 0 : Math.sin(Math.PI * t);
      const cycle = distance / cycleLength;
      let tangentOffset = 0, normalOffset = 0;
      if (rhythm === 'hesitant') {
        const contact = noise(validated.seed ^ 0x4d61726b, cycle * 2.4);
        pressure *= 1 - strength * .46 * contact;
        normalOffset += (noise(validated.seed, cycle * 1.7) - .5) * width * .12 * strength * edge;
      }
      if (drag === 'reverse') {
        // Rearward offsets and contact modulation study resistance only. The overall
        // writing direction and endpoints stay those supplied by the caller.
        tangentOffset -= Math.pow(Math.sin(cycle * Math.PI), 2) * width * .20 * strength * edge;
        normalOffset += (noise(validated.seed ^ 0x526576, cycle * 3.1) - .5) * width * .20 * strength * edge;
        pressure *= 1 - strength * (.10 + .25 * noise(validated.seed ^ 11, cycle * 4));
      }
      for (const corner of corners) {
        const relative = Math.abs(distance - corner.distance) / corner.reach;
        if (relative <= 1) {
          pressure *= 1 - .28 * strength * Math.pow(Math.sin(relative * Math.PI / 2), 2);
          pressure += pressure * (1 - pressure) * .24 * strength * (1 - relative);
        }
      }
      return { x: sample.x + sample.dx * tangentOffset - sample.dy * normalOffset,
        y: sample.y + sample.dy * tangentOffset + sample.dx * normalOffset,
        pressure: Math.max(0, Math.min(1, pressure)) };
    });
  } else path = source.map(point => ({ ...point }));

  if (entry !== 'preserve' && strength > 0) {
    const a = path[0]!, sourceLength = distances[1]!;
    const dx = (second.x - first.x) / sourceLength, dy = (second.y - first.y) / sourceLength;
    const reach = Math.min(width * .55, sourceLength * .28, total * .06) * strength;
    let skip = 1;
    while (skip < path.length - 1 && Math.hypot(path[skip]!.x - a.x, path[skip]!.y - a.y) < reach) skip++;
    const b = path[skip]!, length = Math.hypot(b.x - a.x, b.y - a.y);
    const lead = { x: a.x + dx * reach, y: a.y + dy * reach, pressure: mix(a.pressure, b.pressure, Math.min(1, reach / length)) };
    if (entry === 'exposed') path = [{ ...a, pressure: a.pressure * (1 - .98 * strength) }, lead, ...path.slice(skip)];
    else path = [{ ...a, pressure: a.pressure * (1 - .88 * strength) },
      { x: a.x - dx * reach, y: a.y - dy * reach, pressure: a.pressure * .76 },
      { x: a.x - dx * reach * .65 - dy * reach * .30, y: a.y - dy * reach * .65 + dx * reach * .30, pressure: a.pressure },
      lead, ...path.slice(skip)];
  }
  if (finish !== 'preserve' && strength > 0) {
    const b = path.at(-1)!, sourceEnd = source.at(-1)!, sourceBefore = source.at(-2)!;
    const sourceLength = Math.hypot(sourceEnd.x - sourceBefore.x, sourceEnd.y - sourceBefore.y);
    const dx = (sourceEnd.x - sourceBefore.x) / sourceLength, dy = (sourceEnd.y - sourceBefore.y) / sourceLength;
    const reach = Math.min(width * .62, sourceLength * .28, total * .06) * strength;
    let keep = path.length - 2;
    while (keep > 0 && Math.hypot(path[keep]!.x - b.x, path[keep]!.y - b.y) < reach) keep--;
    const a = path[keep]!, length = Math.hypot(b.x - a.x, b.y - a.y);
    if (finish === 'open') path = [...path.slice(0, keep + 1),
      { x: b.x - dx * reach, y: b.y - dy * reach, pressure: mix(b.pressure, a.pressure, Math.min(1, reach / length)) },
      { ...b, pressure: b.pressure * (1 - .98 * strength) }];
    else path = [...path,
      { x: b.x - dx * reach * .3 - dy * reach * .18, y: b.y - dy * reach * .3 + dx * reach * .18, pressure: b.pressure * .9 },
      { x: b.x - dx * reach, y: b.y - dy * reach, pressure: b.pressure * (1 - .92 * strength) }];
  }
  return createInkScene({ width: 1, height: 1 }).stroke(path, style);
}
