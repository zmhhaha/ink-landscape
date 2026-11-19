import type {
  CunOptions, InkMark, InkPoint, InkScene, SceneBuilder, SceneOptions,
  StrokeMark, StrokeOptions, Vec2, WashMark, WashOptions,
} from './types.js';

const TAU = Math.PI * 2;
const EPSILON = 1e-9;
const MAX_GENERATED_MARKS = 10_000;
const MAX_RESAMPLED_POINTS = 100_000;

function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function positive(value: number, name: string): number {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function bounded(value: number, name: string, min = 0, max = 1): number {
  finite(value, name);
  if (value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}`);
  return value;
}

function integer(value: number, name: string): number {
  finite(value, name);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
  return value;
}

function seedValue(value: number): number {
  return integer(value, 'seed') >>> 0;
}

function text(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/** Seeded Mulberry32 random source. The returned generator has no global state. */
export function createRandom(seed: number): () => number {
  let state = seedValue(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let word = state;
    word = Math.imul(word ^ (word >>> 15), word | 1);
    word ^= word + Math.imul(word ^ (word >>> 7), word | 61);
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}

function copyPoint(point: Vec2, name: string): Vec2 {
  if (!point || typeof point !== 'object') throw new TypeError(`${name} must be a point`);
  return Object.freeze({ x: finite(point.x, `${name}.x`), y: finite(point.y, `${name}.y`) });
}

function copyInkPoint(point: InkPoint, name: string): InkPoint {
  const coordinates = copyPoint(point, name);
  return point.pressure === undefined ? coordinates : Object.freeze({
    ...coordinates, pressure: bounded(point.pressure, `${name}.pressure`),
  });
}

function pathLength(points: readonly Vec2[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

function copyPath(points: readonly InkPoint[]): readonly InkPoint[] {
  if (!Array.isArray(points) || points.length < 2) throw new RangeError('A stroke requires at least two points');
  const copy = points.map((point, i) => copyInkPoint(point, `points[${i}]`));
  const length = pathLength(copy);
  if (!Number.isFinite(length) || length <= EPSILON) throw new RangeError('A stroke must have finite, nonzero length');
  return Object.freeze(copy);
}

function signedArea(points: readonly Vec2[]): number {
  let twiceArea = 0;
  // Translation reduces cancellation for shapes with large coordinate offsets.
  const origin = points[0]!;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    twiceArea += (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  }
  return twiceArea / 2;
}

function copyPolygon(points: readonly Vec2[], name = 'outline'): readonly Vec2[] {
  if (!Array.isArray(points) || points.length < 3) throw new RangeError(`${name} requires at least three points`);
  const copy = points.map((point, i) => copyPoint(point, `${name}[${i}]`));
  const area = signedArea(copy);
  if (!Number.isFinite(area) || Math.abs(area) <= EPSILON) throw new RangeError(`${name} must have finite, nonzero area`);
  return Object.freeze(copy);
}

/** Even-odd polygon containment; points on an edge are considered inside. */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  copyPoint(point, 'point');
  if (!Array.isArray(polygon) || polygon.length < 3) throw new RangeError('polygon requires at least three points');
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    finite(a.x, 'polygon.x'); finite(a.y, 'polygon.y');
    finite(b.x, 'polygon.x'); finite(b.y, 'polygon.y');
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const cross = (point.x - a.x) * dy - (point.y - a.y) * dx;
    const edgeLength = Math.hypot(dx, dy);
    if (edgeLength > 0 && Math.abs(cross) <= EPSILON * Math.max(1, edgeLength)
      && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
      && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Resample by arc length, preserving both endpoints and interpolating pressure. */
export function resamplePath(points: readonly InkPoint[], spacing: number): InkPoint[] {
  positive(spacing, 'spacing');
  const source = copyPath(points);
  const total = pathLength(source);
  const steps = Math.ceil(total / spacing);
  if (steps + 1 > MAX_RESAMPLED_POINTS) throw new RangeError('Resampling would exceed 100000 points; increase spacing');
  const result: InkPoint[] = [{ ...source[0]! }];
  let segment = 1;
  let walked = 0;
  for (let sample = 1; sample < steps; sample++) {
    const distance = sample * spacing;
    while (segment < source.length - 1) {
      const a = source[segment - 1]!;
      const b = source[segment]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (walked + length >= distance && length > 0) break;
      walked += length;
      segment++;
    }
    const a = source[segment - 1]!;
    const b = source[segment]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const u = length === 0 ? 1 : Math.min(1, Math.max(0, (distance - walked) / length));
    const point: InkPoint = {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * u,
    };
    result.push(point);
  }
  result.push({ ...source[source.length - 1]! });
  return result;
}

function timing(options: { readonly start?: number; readonly duration?: number }): { start: number; duration: number } {
  const start = finite(options.start ?? 0, 'start');
  const duration = finite(options.duration ?? 0, 'duration');
  if (start < 0 || duration < 0) throw new RangeError('start and duration must be nonnegative');
  if (!Number.isFinite(start + duration)) throw new RangeError('start + duration must be finite');
  return { start, duration };
}

function strokeMark(id: string, points: readonly InkPoint[], options: StrokeOptions, fallbackSeed: number): StrokeMark {
  const nib = options.nib ?? 'round';
  if (nib !== 'round' && nib !== 'flat') throw new RangeError('nib must be round or flat');
  const mark: StrokeMark = {
    kind: 'stroke', id: text(id, 'id'), points: copyPath(points),
    width: positive(options.width ?? 8, 'width'), ink: text(options.ink ?? '#20251f', 'ink'),
    opacity: bounded(options.opacity ?? 0.85, 'opacity'), dryness: bounded(options.dryness ?? 0.25, 'dryness'),
    nib, tipAngle: finite(options.tipAngle ?? 0, 'tipAngle'),
    seed: seedValue(options.seed ?? fallbackSeed), ...timing(options),
    ...(options.clip === undefined ? {} : { clip: copyPolygon(options.clip, 'clip') }),
  };
  return Object.freeze(mark);
}

/** Build editable, serializable drawing data; no browser or renderer is required. */
export function createInkScene(options: SceneOptions): SceneBuilder {
  const width = positive(options.width, 'width');
  const height = positive(options.height, 'height');
  const seed = seedValue(options.seed ?? 1);
  const background = text(options.background ?? '#f2efe5', 'background');
  const marks: InkMark[] = [];
  const ids = new Set<string>();

  function availableId(kind: string): string {
    let serial = marks.length + 1;
    while (ids.has(`${kind}-${serial}`)) serial++;
    return `${kind}-${serial}`;
  }

  function assertUnused(id: string): void {
    text(id, 'id');
    if (ids.has(id)) throw new RangeError(`Duplicate mark id: ${id}`);
  }

  const builder: SceneBuilder = {
    stroke(points, strokeOptions = {}) {
      const id = strokeOptions.id ?? availableId('stroke');
      assertUnused(id);
      const mark = strokeMark(id, points, strokeOptions, seed ^ hashText(id));
      marks.push(mark); ids.add(id);
      return mark;
    },

    wash(outline, washOptions: WashOptions = {}) {
      const id = washOptions.id ?? availableId('wash');
      assertUnused(id);
      const passes = integer(washOptions.passes ?? 4, 'passes');
      bounded(passes, 'passes', 1, 32);
      const mark: WashMark = Object.freeze({
        kind: 'wash', id, outline: copyPolygon(outline), ink: text(washOptions.ink ?? '#30372e', 'ink'),
        opacity: bounded(washOptions.opacity ?? 0.22, 'opacity'),
        roughness: bounded(washOptions.roughness ?? 0.45, 'roughness'), passes,
        seed: seedValue(washOptions.seed ?? (seed ^ hashText(id))), ...timing(washOptions),
      });
      marks.push(mark); ids.add(id);
      return mark;
    },

    cun(outline, cunOptions: CunOptions = {}) {
      const region = copyPolygon(outline);
      const technique = cunOptions.technique ?? 'pima';
      if (technique !== 'pima' && technique !== 'axe') throw new RangeError('technique must be pima or axe');
      const count = integer(cunOptions.count ?? 56, 'count');
      bounded(count, 'count', 0, MAX_GENERATED_MARKS);
      const length = positive(cunOptions.length ?? Math.min(width, height) * 0.16, 'length');
      const prefix = text(cunOptions.idPrefix ?? availableId(technique), 'idPrefix');
      const baseSeed = seedValue(cunOptions.seed ?? (seed ^ hashText(prefix)));
      const random = createRandom(baseSeed);
      const baseDirection = copyPoint(cunOptions.direction ?? { x: 0.25, y: 1 }, 'direction');
      if (Math.hypot(baseDirection.x, baseDirection.y) <= EPSILON) throw new RangeError('direction must be nonzero');
      if (cunOptions.flow !== undefined && typeof cunOptions.flow !== 'function') throw new TypeError('flow must be a function');

      // Validate all options even when count is zero. Generation is transactional:
      // a bad direction field or duplicate ID never leaves half a technique behind.
      strokeMark(`${prefix}-validation`, [{ x: 0, y: 0 }, { x: 0, y: 1 }], cunOptions, baseSeed);
      for (let i = 0; i < count; i++) assertUnused(`${prefix}-${i + 1}`);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const point of region) {
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      const generated: StrokeMark[] = [];
      let attempts = 0;
      const attemptLimit = Math.max(2000, count * 200);
      while (generated.length < count) {
        if (++attempts > attemptLimit) throw new RangeError('Could not sample this region within the bounded attempt budget; simplify or split the polygon');
        const origin = { x: minX + random() * (maxX - minX), y: minY + random() * (maxY - minY) };
        if (!pointInPolygon(origin, region)) continue;
        const index = generated.length;
        const markLength = length * (0.45 + random() * 0.75);
        const bend = (random() - 0.5) * markLength * (technique === 'pima' ? 0.28 : 0.08);
        const steps = technique === 'pima' ? 8 : 4;
        const phase = random() * TAU;
        const path: InkPoint[] = [];
        let x = origin.x;
        let y = origin.y;
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          const direction = copyPoint(cunOptions.flow === undefined
            ? baseDirection : cunOptions.flow(Object.freeze({ x, y })), 'flow direction');
          const magnitude = Math.hypot(direction.x, direction.y);
          if (!Number.isFinite(magnitude) || magnitude <= EPSILON) throw new RangeError('flow direction must have finite, nonzero length');
          const dx = direction.x / magnitude;
          const dy = direction.y / magnitude;
          const offset = Math.sin(t * Math.PI) * bend + Math.sin(t * TAU + phase) * markLength * 0.018;
          const pressure = technique === 'pima'
            ? 0.12 + 0.76 * Math.sin(Math.PI * (0.08 + t * 0.86))
            : 0.08 + 0.9 * Math.pow(1 - t, 0.7);
          path.push({ x: x - dy * offset, y: y + dx * offset, pressure });
          x += dx * markLength / steps;
          y += dy * markLength / steps;
        }
        const id = `${prefix}-${index + 1}`;
        const markOptions: StrokeOptions = {
          ...cunOptions,
          width: cunOptions.width ?? (technique === 'pima' ? 2.2 : 10),
          dryness: cunOptions.dryness ?? (technique === 'pima' ? 0.62 : 0.38),
          nib: cunOptions.nib ?? (technique === 'pima' ? 'round' : 'flat'),
          tipAngle: cunOptions.tipAngle ?? Math.atan2(baseDirection.y, baseDirection.x) - 0.55,
          seed: (baseSeed ^ hashText(id)) >>> 0,
          clip: region,
        };
        generated.push(strokeMark(id, path, markOptions, baseSeed));
      }
      for (const mark of generated) { marks.push(mark); ids.add(mark.id); }
      return Object.freeze(generated);
    },

    snapshot(): InkScene {
      return Object.freeze({ version: 1, width, height, seed, background, marks: Object.freeze([...marks]) });
    },
  };
  return Object.freeze(builder);
}
