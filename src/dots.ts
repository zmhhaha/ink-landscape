import { createInkScene, createRandom } from './core.js';
import type { InkPoint, StrokeMark, StrokeOptions } from './types.js';

export type DotShape = 'round' | 'horizontal' | 'vertical' | 'oblique' | 'paired' | 'triple' | 'cluster';

export interface DotOptions extends Omit<StrokeOptions, 'id' | 'width'> {
  readonly shape?: DotShape;
  /** Nominal stroke size in scene coordinates. Default 12. */
  readonly size?: number;
  /** Rotate the entire local point composition in radians. Default 0. */
  readonly angle?: number;
  /** Fixed distance scale for grouped dots; default size * 1.3. */
  readonly spread?: number;
  /** Cluster members only, 1..32. Default 5. Other shapes fix their count. */
  readonly count?: number;
  readonly idPrefix?: string;
  /** Absolute start of group i is start + i * groupInterval. Default 0. */
  readonly groupInterval?: number;
}

interface Member { readonly x: number; readonly y: number; readonly heading: number; readonly length: number; readonly width: number }
const SHAPES: readonly DotShape[] = ['round', 'horizontal', 'vertical', 'oblique', 'paired', 'triple', 'cluster'];
const MAX_MARKS = 10_000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function layout(shape: DotShape, spread: number, count: number): Member[] {
  switch (shape) {
    case 'round': return [{ x: 0, y: 0, heading: 0, length: .40, width: 1 }];
    case 'horizontal': return [{ x: 0, y: 0, heading: 0, length: 1.30, width: .58 }];
    case 'vertical': return [{ x: 0, y: 0, heading: Math.PI / 2, length: 1.30, width: .58 }];
    case 'oblique': return [{ x: 0, y: 0, heading: -Math.PI / 3, length: 1.15, width: .68 }];
    case 'paired': return [-1, 1].map(side => ({ x: side * spread * .45, y: 0,
      heading: Math.PI / 2 + side * .24, length: .72, width: .75 }));
    case 'triple': return [-1, 0, 1].map(side => ({ x: side * spread * .52, y: side === 0 ? -spread * .30 : 0,
      heading: Math.PI / 2 + side * .35, length: .72, width: .68 }));
    case 'cluster': return Array.from({ length: count }, (_, index) => {
      const radius = index === 0 ? 0 : spread * (.28 + .30 * Math.sqrt(index / Math.max(1, count - 1)));
      const theta = (index - 1) * GOLDEN_ANGLE;
      return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius,
        heading: Math.PI / 2 + Math.sin(index * 2.4) * .5, length: .46 + Math.cos(index * 1.7) * .08, width: .65 + Math.sin(index * 2.1) * .10 };
    });
  }
}

/**
 * Generate short press-and-lift strokes at caller-supplied positions. Groups
 * are separate strokes, never a line connecting all positions or uniform
 * region filling. Layout anchors are seed-independent; only a small change of
 * stroke posture and the ordinary material seed vary.
 *
 * These are geometric dot primitives. Paired/triple/cluster layouts do not by
 * themselves establish traditional leaf, moss-dot or Mi-dot techniques.
 */
export function createDotMarks(positions: readonly InkPoint[], options: DotOptions = {}): readonly StrokeMark[] {
  const { shape = 'round', size = 12, angle = 0, spread = size * 1.3, count = 5,
    groupInterval = 0, idPrefix = 'dot', seed = 1, ...strokeOptions } = options;
  if (!SHAPES.includes(shape)) throw new RangeError(`shape must be ${SHAPES.join(', ')}`);
  if (finite(size, 'size') <= 0) throw new RangeError('size must be positive');
  finite(angle, 'angle');
  if (finite(spread, 'spread') < 0) throw new RangeError('spread must be nonnegative');
  if (finite(groupInterval, 'groupInterval') < 0) throw new RangeError('groupInterval must be nonnegative');
  if (!Number.isSafeInteger(count) || count < 1 || count > 32) throw new RangeError('count must be an integer in 1..32');
  if (options.count !== undefined && shape !== 'cluster') throw new RangeError('count is only configurable for cluster dots');
  if (typeof idPrefix !== 'string' || !idPrefix.trim()) throw new TypeError('idPrefix must be nonempty');
  if (!Array.isArray(positions)) throw new TypeError('positions must be an array');
  const members = layout(shape, spread, count);
  if (positions.length * members.length > MAX_MARKS) throw new RangeError('Dot generation is limited to 10000 marks');

  const source = positions.map((point, index) => {
    if (!point || typeof point !== 'object') throw new TypeError(`positions[${index}] must be a point`);
    const pressure = finite(point.pressure ?? 1, 'position.pressure');
    if (pressure < 0 || pressure > 1) throw new RangeError('position.pressure must be in 0..1');
    return { x: finite(point.x, 'position.x'), y: finite(point.y, 'position.y'), pressure };
  });
  // Validate ordinary style and timing even for an empty position array.
  const builder = createInkScene({ width: 1, height: 1, seed });
  const validated = createInkScene({ width: 1, height: 1, seed }).stroke([{ x: 0, y: 0 }, { x: 1, y: 0 }], {
    ...strokeOptions, seed, width: size,
  });
  const finalStart = validated.start + Math.max(0, source.length - 1) * groupInterval;
  if (!Number.isFinite(finalStart + validated.duration)) throw new RangeError('Dot group timing must remain finite');
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const result: StrokeMark[] = [];
  for (let group = 0; group < source.length; group++) {
    const point = source[group]!;
    for (let index = 0; index < members.length; index++) {
      const member = members[index]!;
      const markSeed = (validated.seed ^ Math.imul(group + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca77)) >>> 0;
      const random = createRandom(markSeed);
      const heading = member.heading + angle + (random() - .5) * .17;
      const dx = Math.cos(heading), dy = Math.sin(heading);
      const x = point.x + cos * member.x - sin * member.y, y = point.y + sin * member.x + cos * member.y;
      const length = size * member.length, bend = (random() - .5) * size * .045;
      const path: InkPoint[] = [
        { x, y, pressure: point.pressure * .16 },
        { x: x + dx * length * .28 - dy * bend, y: y + dy * length * .28 + dx * bend, pressure: point.pressure },
        { x: x + dx * length * .70 - dy * bend * .35, y: y + dy * length * .70 + dx * bend * .35, pressure: point.pressure * .78 },
        { x: x + dx * length, y: y + dy * length, pressure: point.pressure * .04 },
      ];
      result.push(builder.stroke(path, {
        ...validated, id: `${idPrefix}-${group + 1}-${index + 1}`, width: size * member.width,
        smoothing: strokeOptions.smoothing ?? 'catmull-rom', seed: markSeed,
        start: validated.start + group * groupInterval,
      }));
    }
  }
  return Object.freeze(result);
}
