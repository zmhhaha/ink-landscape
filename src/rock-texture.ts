import { createRandom, pointInPolygon } from './core.js';
import { createNoise1D } from './perturbation.js';
import { createCunDocument } from './cun-document.js';
import type { CunStrokeSource } from './cun-document.js';
import type { StrokeGroupSource, GroupStrokeSource } from './stroke-group-document.js';
import type { InkPoint, Vec2, StrokeMark } from './types.js';
import type { RockStructureSource, RockFaceSource, RockLineSource, RockTextureOptions } from './rock-form-types.js';

interface FaceFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly center: Vec2;
}
interface Direction extends Vec2 { readonly tx: number; readonly ty: number }
type MarkTone = 'wash' | 'body' | 'accent';
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
function frame(face: RockFaceSource): FaceFrame {
  const xs = face.region.map(p => p.x), ys = face.region.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  const width = Math.max(...xs) - left, height = Math.max(...ys) - top;
  return { left, top, width, height, scale: Math.max(width, height),
    center: { x: face.region.reduce((sum, p) => sum + p.x, 0) / face.region.length,
      y: face.region.reduce((sum, p) => sum + p.y, 0) / face.region.length } };
}
function nearest(point: Vec2, path: readonly InkPoint[]): Direction {
  let best: Direction | undefined, distance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length <= 1e-10) continue;
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length ** 2);
    const x = a.x + dx * t, y = a.y + dy * t, d = Math.hypot(point.x - x, point.y - y);
    if (d < distance) { distance = d; best = { x, y, tx: dx / length, ty: dy / length }; }
  }
  if (!best) throw new RangeError('Rock texture flow needs a nonzero path');
  return best;
}
function at(path: readonly InkPoint[], fraction: number): Direction {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = total * fraction;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (length <= 1e-10) continue;
    if (distance <= length || i === lengths.length - 1) {
      const a = path[i]!, b = path[i + 1]!, t = clamp(distance / length);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        tx: (b.x - a.x) / length, ty: (b.y - a.y) / length };
    }
    distance -= length;
  }
  return nearest(path.at(-1)!, path);
}
function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y, size = dx * dx + dy * dy;
  const t = size > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / size) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
function cross(a: Vec2, b: Vec2, p: Vec2): number { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0 &&
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
function outsideReserves(point: Vec2, face: RockFaceSource): boolean {
  return !(face.reserves ?? []).some(region => pointInPolygon(point, region));
}
export function clearsRockReserves(points: readonly InkPoint[], width: number,
  reserves: readonly (readonly Vec2[])[] = []): boolean {
  // Reject the whole contact near a paper opening. The generous clearance
  // includes the side nib, local turn accent and spline excursion, rather than
  // relying on zero-pressure samples to cut a hole out of a connected stroke.
  const clearance = width * 2.2;
  for (const region of reserves) {
    if (points.some(p => pointInPolygon(p, region))) return false;
    for (let i = 1; i < points.length; i++) for (let j = 0; j < region.length; j++)
      if (segmentDistance(points[i - 1]!, points[i]!, region[j]!, region[(j + 1) % region.length]!) < clearance) return false;
  }
  return true;
}
function available(points: readonly InkPoint[], width: number, face: RockFaceSource): boolean {
  return points.length >= 3 && clearsRockReserves(points,width,face.reserves)
    && Math.hypot(points.at(-1)!.x - points[0]!.x, points.at(-1)!.y - points[0]!.y) > width * .55;
}

function inset(point: Vec2, face: RockFaceSource, box: FaceFrame): Vec2 | undefined {
  let p = { ...point };
  for (let attempt = 0; attempt < 7; attempt++) {
    if (pointInPolygon(p, face.region) && outsideReserves(p, face)) return p;
    p = { x: p.x * .78 + box.center.x * .22, y: p.y * .78 + box.center.y * .22 };
  }
  return undefined;
}
function flowStart(face: RockFaceSource, box: FaceFrame, fraction: number, across: number): Vec2 | undefined {
  const p = at(face.flow, fraction), span = Math.abs(p.ty) * box.width + Math.abs(p.tx) * box.height;
  return inset({ x: p.x - p.ty * span * across, y: p.y + p.tx * span * across }, face, box);
}
function localRidges(structure: RockStructureSource, face: RockFaceSource, box: FaceFrame): readonly RockLineSource[] {
  return structure.ridges.filter(line => line.points.some(p => pointInPolygon(p, face.region)
    || face.region.some((a, i) => pointSegmentDistance(p, a, face.region[(i + 1) % face.region.length]!) < box.scale * .025)));
}
function startNearFracture(fractures: readonly RockLineSource[], face: RockFaceSource,
  box: FaceFrame, random: () => number): Vec2 | undefined {
  if (!fractures.length) return undefined;
  const line = fractures[Math.floor(random() * fractures.length)]!;
  const p = at(line.points, .08 + random() * .82), dx = box.center.x - p.x, dy = box.center.y - p.y;
  const size = Math.hypot(dx, dy) || 1, inset = box.scale * (.025 + random() * .07);
  const point = { x: p.x + dx / size * inset, y: p.y + dy / size * inset };
  return pointInPolygon(point, face.region) && outsideReserves(point, face) ? point : undefined;
}
function trace(face: RockFaceSource, origin: Vec2, length: number, width: number, seed: number,
  technique: RockTextureOptions['technique'], lean: number, curveSeed = seed): InkPoint[] {
  const noise = createNoise1D(seed), curve = createNoise1D(curveSeed), count = technique === 'axe' ? 9 : 28;
  const step = length / count, points: InkPoint[] = [], phase = 12.71;
  let base = { ...origin };
  for (let i = 0; i <= count; i++) {
    const t = i / count, field = nearest(base, face.flow), c = Math.cos(lean), s = Math.sin(lean);
    const tx = field.tx * c - field.ty * s, ty = field.tx * s + field.ty * c;
    const wiggle = technique === 'axe' ? noise(t * 2.7 + phase) * width * .08
      : (curve(t * 2.1 + phase) - curve(phase)) * length * .15
        + (noise(t * 6.3 + 43.27) - noise(43.27)) * length * .025;
    const p = { x: base.x - ty * wiggle, y: base.y + tx * wiggle };
    if (!pointInPolygon(p, face.region)) break;
    const pressure = technique === 'axe' ? (.98 - .72 * t ** 1.8) * (.93 + .07 * noise(t * 6.7 + 22.4))
      : (.46 + .43 * (1 - t) ** .55) * (.87 + .13 * noise(t * 7.6 + 41.7));
    points.push({ ...p, pressure: clamp(pressure) });
    base = { x: base.x + tx * step, y: base.y + ty * step };
  }
  if (points.length > 1) {
    const last = points.at(-1)!; points[points.length - 1] = { ...last, pressure: 0 };
  }
  return points;
}
function tone(face: RockFaceSource, index: number): MarkTone {
  if (face.tone === 'light') return index % 4 === 0 ? 'body' : 'wash';
  if (face.tone === 'dark') return index % 5 === 0 ? 'wash' : index % 3 === 0 ? 'accent' : 'body';
  return index % 4 === 0 ? 'wash' : index % 7 === 0 ? 'accent' : 'body';
}
function source(id: string, points: readonly InkPoint[], width: number, inkTone: MarkTone,
  face: RockFaceSource, technique: RockTextureOptions['technique']): CunStrokeSource {
  return { id, points, options: { width, opacity: { wash: .19, body: .51, accent: .83 }[inkTone],
    dryness: inkTone === 'wash' ? .68 : technique === 'axe' ? .4 : .48,
    smoothing: technique === 'axe' ? 'linear' : 'catmull-rom', duration: 0, clip: face.region } };
}
function ordinary(strokes: readonly CunStrokeSource[], options: RockTextureOptions, seed: number): GroupStrokeSource[] {
  if (!strokes.length) return [];
  const compiled = createCunDocument(strokes, { technique: options.technique, width: 1, height: 1, seed, ink: options.ink });
  return compiled.result.marks.filter((mark): mark is StrokeMark => mark.kind === 'stroke').map(mark => ({
    id: mark.id, points: mark.points, options: { width: mark.width, opacity: mark.opacity, dryness: mark.dryness,
      ink: mark.ink, axis: 'center', gestureModel: 'local-v1', smoothing: mark.smoothing ?? 'linear', duration: 0,
      ...(mark.brush ? { controls: mark.brush.controls } : {}), ...(mark.clip ? { clip: mark.clip } : {}) },
  }));
}

/**
 * Optional organization studies using existing axe/jiesuo contacts. Every face
 * has an independent random stream and a fixed work budget. This does not
 * change the existing cun defaults or infer a historically unique brush order.
 */
export function generateRockTexture(structure: RockStructureSource, options: RockTextureOptions): StrokeGroupSource[] {
  if (structure.faces.length > 8) throw new RangeError('Rock texture supports at most 8 faces');
  if (!Number.isInteger(options.detail) || options.detail < 1 || options.detail > 3) throw new RangeError('Rock detail must be 1..3');
  const groups: StrokeGroupSource[] = [];
  for (const face of structure.faces) {
    const id = `${options.idPrefix.length}:${options.idPrefix}/face/${face.id.length}:${face.id}`;
    const seed = (options.seed ^ hash(id)) >>> 0, box = frame(face);
    const ridges = localRidges(structure, face, box), fractures = [...ridges, ...(face.fractures ?? [])];
    const target = face.tone === 'light' ? options.detail + 1
      : face.tone === 'dark' ? 6 + options.detail * 4 : 4 + options.detail * 3;
    const strokes: CunStrokeSource[] = [], principal: InkPoint[][] = [];
    const primaryCount = face.tone === 'light' ? 1 : options.technique === 'axe' ? options.detail + 1 : 4;
    for (let i = 0; i < target; i++) {
      const key = `contact-${i}`, random = createRandom(seed ^ hash(key));
      const primary = i < primaryCount;
      const width = box.scale * (options.technique === 'axe'
        ? primary ? .09 + random() * .08 : .028 + random() * .055
        : primary ? .014 + random() * .009 : .009 + random() * .01);
      const length = box.scale * (options.technique === 'axe'
        ? primary ? .43 + random() * .23 : .1 + random() * .25
        : primary ? .57 + random() * .3 : .13 + random() * .32);
      const inkTone = face.tone === 'light' ? 'wash' : primary ? i === 0 && face.tone === 'dark' ? 'accent' : 'body' : tone(face, i);
      let points: InkPoint[] = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        let p: Vec2 | undefined;
        if (!primary && principal.length) {
          const parent = principal[(i - primaryCount) % principal.length]!;
          const q = parent[Math.floor((.16 + random() * .52) * (parent.length - 1))]!;
          const direction = nearest(q, face.flow), side = (i % 2 ? -1 : 1) * width * (.35 + random() * 1.8);
          p = inset({ x: q.x - direction.ty * side, y: q.y + direction.tx * side }, face, box);
        } else if (options.technique === 'axe') {
          p = startNearFracture(fractures, face, box, random)
            ?? flowStart(face, box, .05 + (i % 3) * .19 + attempt * .025, (random() - .5) * .38);
        } else {
          // Two overlapping curve families cross a broad convex plane. Their
          // members share a slow turn, then separate through length and fine
          // curvature; subordinate arcs start on these actual parent curves.
          const family = Math.floor(i / 2) % 2, member = i % 2;
          p = flowStart(face, box, .025 + family * .17 + attempt * .016,
            (family ? -.16 : .16) + (member ? -.045 : .045) + (random() - .5) * .07);
        }
        if (!p) continue;
        if (!pointInPolygon(p, face.region) || !outsideReserves(p, face)) continue;
        const lean = options.technique === 'axe' ? (random() - .5) * .34
          : primary ? (Math.floor(i / 2) % 2 ? -.13 : .13) + (random() - .5) * .13 : (random() - .5) * .72;
        points = trace(face, p, length, width, seed ^ hash(key + '/' + attempt), options.technique,
          lean, options.technique === 'jiesuo' && primary ? seed ^ hash('curve-family/' + Math.floor(i / 2)) : seed ^ hash(key));
        if (available(points, width, face)) break;
        points = [];
      }
      if (!points.length) continue;
      strokes.push(source(key, points, width, inkTone, face, options.technique));
      if (primary) principal.push(points);
      // A few diverging threads share actual parent path points. They add
      // crossing and branching to curved groups without parallel comb teeth.
      if (options.technique === 'jiesuo' && face.tone !== 'light' && i % 5 === 2 && strokes.length < 22) {
        const branchSeed = seed ^ hash(key + '/fork'), origin = points[Math.floor(points.length * .36)]!;
        const fork = trace(face, origin, length * (.35 + random() * .3), width * .73, branchSeed,
          'jiesuo', (i % 2 ? -1 : 1) * (.4 + random() * .37));
        if (available(fork, width * .73, face)) strokes.push(source(key + '/fork', fork, width * .73,
          inkTone === 'accent' ? 'body' : 'wash', face, 'jiesuo'));
      }
    }
    // Short accents belong to explicit fractures, rather than every face
    // receiving an equally dark outline. Light planes remain largely open.
    if (face.tone !== 'light') for (const [index, fracture] of (face.fractures ?? []).entries()) {
      if (index >= options.detail || strokes.length >= 24) break;
      const random = createRandom(seed ^ hash('crevice/' + fracture.id));
      const a = at(fracture.points, .18 + random() * .3), b = at(fracture.points, .58 + random() * .28);
      const dx = box.center.x - a.x, dy = box.center.y - a.y, magnitude = Math.hypot(dx, dy) || 1;
      const inset = box.scale * .016, width = box.scale * (.011 + random() * .008);
      const points = [{ x: a.x + dx / magnitude * inset, y: a.y + dy / magnitude * inset, pressure: .28 },
        { x: (a.x + b.x) * .5 + dx / magnitude * inset, y: (a.y + b.y) * .5 + dy / magnitude * inset, pressure: .88 },
        { x: b.x + dx / magnitude * inset, y: b.y + dy / magnitude * inset, pressure: 0 }];
      if (available(points, width, face)) strokes.push(source('crevice/' + fracture.id, points, width, 'accent', face, options.technique));
    }
    if (strokes.length > 24) throw new RangeError('A rock face exceeded its texture budget');
    if (strokes.length) groups.push({ id, role: 'mark', strokes: ordinary(strokes, options, seed) });
  }
  return groups;
}
