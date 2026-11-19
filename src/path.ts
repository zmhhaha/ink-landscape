import type { InkPoint, PathSamplingOptions, StrokePathSample, Vec2 } from './types.js';

const EPSILON = 1e-9;
const MAX_STEPS = 8192;
const TABLE_BUDGET = 32768;

interface Point extends Vec2 { readonly pressure: number }
interface Segment {
  readonly a: Point;
  readonly b: Point;
  readonly m0: Vec2;
  readonly m1: Vec2;
}
interface ArcEntry {
  readonly distance: number;
  readonly segment: number;
  readonly t: number;
}

function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function sourcePoints(points: readonly InkPoint[]): Point[] {
  if (!Array.isArray(points) || points.length < 2) throw new RangeError('A stroke requires at least two points');
  const result: Point[] = [];
  let length = 0;
  for (const point of points) {
    if (!point || typeof point !== 'object') throw new TypeError('points must contain points');
    const copy = { x: finite(point.x, 'point.x'), y: finite(point.y, 'point.y'),
      pressure: finite(point.pressure ?? 1, 'point.pressure') };
    if (copy.pressure < 0 || copy.pressure > 1) throw new RangeError('point.pressure must be in 0..1');
    const previous = result[result.length - 1];
    const step = previous ? Math.hypot(copy.x - previous.x, copy.y - previous.y) : 0;
    length += step;
    if (!Number.isFinite(length)) throw new RangeError('Path length must be finite');
    // A zero-distance pressure change has no extent. The last value wins.
    if (previous && step < EPSILON) result[result.length - 1] = copy;
    else result.push(copy);
  }
  return result;
}

function tangent(previous: Point, point: Point, next: Point): Vec2 {
  const ax = point.x - previous.x, ay = point.y - previous.y;
  const bx = next.x - point.x, by = next.y - point.y;
  const before = Math.sqrt(Math.hypot(ax, ay));
  const after = Math.sqrt(Math.hypot(bx, by));
  return {
    x: ax / before - (ax + bx) / (before + after) + bx / after,
    y: ay / before - (ay + by) / (before + after) + by / after,
  };
}

function segments(points: readonly Point[], smooth: boolean): Segment[] {
  return points.slice(1).map((b, index) => {
    const a = points[index]!;
    const delta = { x: b.x - a.x, y: b.y - a.y };
    const knot = Math.sqrt(Math.hypot(delta.x, delta.y));
    const before = smooth && index > 0 ? tangent(points[index - 1]!, a, b) : undefined;
    const after = smooth && index + 2 < points.length ? tangent(a, b, points[index + 2]!) : undefined;
    return { a, b,
      m0: before ? { x: before.x * knot, y: before.y * knot } : delta,
      m1: after ? { x: after.x * knot, y: after.y * knot } : delta };
  });
}

function evaluate(segment: Segment, t: number, smooth: boolean): { x: number; y: number; pressure: number; dx: number; dy: number } {
  const { a, b, m0, m1 } = segment;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!smooth) return { x: a.x + dx * t, y: a.y + dy * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t, dx, dy };
  const t2 = t * t, t3 = t2 * t;
  const position = 3 * t2 - 2 * t3;
  const left = t3 - 2 * t2 + t;
  const right = t3 - t2;
  const slope = 6 * t - 6 * t2;
  const leftSlope = 3 * t2 - 4 * t + 1;
  const rightSlope = 3 * t2 - 2 * t;
  // Only the tangent direction is needed. Scale before combining terms so
  // their intermediate products cannot overflow on finite near-limit paths.
  const scale = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(m0.x), Math.abs(m0.y), Math.abs(m1.x), Math.abs(m1.y));
  return {
    x: a.x + dx * position + m0.x * left + m1.x * right,
    y: a.y + dy * position + m0.y * left + m1.y * right,
    pressure: a.pressure + (b.pressure - a.pressure) * position,
    dx: (dx / scale) * slope + (m0.x / scale) * leftSlope + (m1.x / scale) * rightSlope,
    dy: (dy / scale) * slope + (m0.y / scale) * leftSlope + (m1.y / scale) * rightSlope,
  };
}

/**
 * Browser-independent geometry with approximate arc-length sampling. Linear is
 * the default; Catmull–Rom uses centripetal knots, analytic tangents and eased
 * pressure between control points. Curves may leave the control polygon.
 * Coincident consecutive points use their last pressure. Exact reversals have
 * a cusp; their normal falls back to that segment's direction.
 *
 * A bounded lookup table approximates curve length (up to 24 subdivisions per
 * segment); the 8193-output cap increases effective spacing on very long paths.
 */
export function sampleStrokePath(points: readonly InkPoint[], options: PathSamplingOptions = {}): StrokePathSample[] {
  const spacing = finite(options.spacing ?? 2, 'spacing');
  if (spacing <= 0) throw new RangeError('spacing must be positive');
  const smoothing = options.smoothing ?? 'linear';
  if (smoothing !== 'linear' && smoothing !== 'catmull-rom') throw new RangeError('smoothing must be linear or catmull-rom');
  const source = sourcePoints(points);
  if (source.length === 1) return [{ ...source[0]!, distance: 0, nx: 0, ny: 1 }];
  const smooth = smoothing === 'catmull-rom' && source.length > 2;
  const curve = segments(source, smooth);
  const divisions = smooth ? Math.max(1, Math.min(24, Math.floor(TABLE_BUDGET / curve.length))) : 1;
  const table: ArcEntry[] = [{ distance: 0, segment: 0, t: 0 }];
  let total = 0;
  let previous: Vec2 = source[0]!;
  for (let index = 0; index < curve.length; index++) {
    for (let step = 1; step <= divisions; step++) {
      const t = step / divisions;
      const point = evaluate(curve[index]!, t, smooth);
      total += Math.hypot(point.x - previous.x, point.y - previous.y);
      if (!Number.isFinite(total)) throw new RangeError('Interpolated path length must be finite');
      table.push({ distance: total, segment: index, t });
      previous = point;
    }
  }
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(total / spacing)));
  const result: StrokePathSample[] = [];
  let cursor = 1;
  for (let i = 0; i <= steps; i++) {
    // Form the bounded fraction first: finite total * i can overflow.
    const distance = total * (i / steps);
    while (cursor < table.length - 1 && table[cursor]!.distance < distance) cursor++;
    const left = table[cursor - 1]!, right = table[cursor]!;
    const fraction = right.distance > left.distance ? (distance - left.distance) / (right.distance - left.distance) : 0;
    const low = left.segment === right.segment ? left.t : 0;
    const t = low + (right.t - low) * fraction;
    const segment = curve[right.segment]!;
    const point = evaluate(segment, t, smooth);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Interpolated path coordinates must be finite');
    let dx = point.dx, dy = point.dy;
    let magnitude = Math.hypot(dx, dy);
    if (magnitude < EPSILON) {
      dx = segment.b.x - segment.a.x; dy = segment.b.y - segment.a.y;
      magnitude = Math.hypot(dx, dy);
    }
    const endpoint = i === 0 ? source[0] : i === steps ? source[source.length - 1] : undefined;
    result.push({ x: endpoint?.x ?? point.x, y: endpoint?.y ?? point.y,
      pressure: endpoint?.pressure ?? Math.max(0, Math.min(1, point.pressure)),
      distance, nx: -dy / magnitude, ny: dx / magnitude });
  }
  return result;
}
