import { createRandom } from './core.js';
import { sampleStrokePath } from './path.js';
import { createNoise1D } from './perturbation.js';
import { createStrokeGroupDocument } from './stroke-group-document.js';
import type { GroupStrokeOptions, GroupStrokeSource, StrokeGroupOptions, StrokeGroupSource } from './stroke-group-document.js';
import type { InkPoint, InkScene, StrokePathSample, Vec2 } from './types.js';

export interface BarkWidthControl { readonly at: number; readonly width: number }
export interface BarkJunctionSource {
  readonly id: string;
  readonly at: number;
  readonly side: -1 | 1;
  /** Full opening length as a fraction of the branch's arc length. */
  readonly span: number;
}
export interface BarkKnotSource {
  readonly id: string;
  readonly at: number;
  readonly side?: -1 | 1;
  /** Signed fraction of the local half-width. Defaults toward the selected side. */
  readonly offset?: number;
  /** Size relative to local branch width. Defaults to .65. */
  readonly size?: number;
  readonly count?: number;
  readonly kind?: 'knot' | 'cavity';
}
export interface BarkBranchSource {
  readonly id: string;
  readonly points: readonly InkPoint[];
  readonly width: number | readonly BarkWidthControl[];
  /** Absolute authored edges, sampled by relative length; supplied pressure replaces center pressure. */
  readonly leftEdge?: readonly InkPoint[];
  readonly rightEdge?: readonly InkPoint[];
  readonly shadowSide?: -1 | 1;
  readonly knots?: readonly BarkKnotSource[];
  readonly junctions?: readonly BarkJunctionSource[];
}
export interface BarkDocumentOptions extends StrokeGroupOptions {
  readonly idPrefix?: string;
  /** Contour contact width relative to the branch's maximum width. Default .06. */
  readonly contourWidth?: number;
  readonly textureStrength?: number;
}
export interface BarkRecipe {
  readonly version: 1;
  readonly generator: 'ink-bark-groups-v1';
  readonly branches: readonly BarkBranchSource[];
  readonly options: BarkDocumentOptions;
}
export interface BarkDocument {
  readonly version: 1;
  readonly recipe: BarkRecipe;
  readonly groups: readonly StrokeGroupSource[];
  readonly result: InkScene;
}
export interface BarkDocumentPatch {
  readonly branches?: readonly BarkBranchSource[];
  readonly options?: Partial<BarkDocumentOptions>;
}

const GENERATOR = 'ink-bark-groups-v1';
const branchFields = ['id', 'points', 'width', 'leftEdge', 'rightEdge', 'shadowSide', 'knots', 'junctions'];
const knotFields = ['id', 'at', 'side', 'offset', 'size', 'count', 'kind'];
const documentFields = ['width', 'height', 'seed', 'background', 'ink', 'strokeWidth', 'dryness', 'opacity'];
const optionFields = [...documentFields, 'idPrefix', 'contourWidth', 'textureStrength'];
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function fields(value: object, allowed: readonly string[], name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key) || (value as Record<string, unknown>)[key] === null) throw new RangeError(`Unsupported ${name} field: ${key}`);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function range(value: number, min: number, max: number, name: string): number {
  if (finite(value, name) < min || value > max) throw new RangeError(`${name} must be in ${min}..${max}`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function identifier(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Bark IDs must be nonempty strings');
  return value;
}
function side(value: number): -1 | 1 {
  if (value !== -1 && value !== 1) throw new RangeError('Bark side must be -1 or 1');
  return value;
}
function hash(value: string): number {
  let key = 2166136261;
  for (let i = 0; i < value.length; i++) key = Math.imul(key ^ value.charCodeAt(i), 16777619);
  return key >>> 0;
}
function ownedPath(values: readonly InkPoint[]): readonly InkPoint[] {
  if (!Array.isArray(values) || values.length < 2 || values.length > 4096) throw new RangeError('Bark paths need 2..4096 points');
  const copied = values.map(point => {
    fields(point, ['x', 'y', 'pressure'], 'bark point');
    return Object.freeze({ x: finite(point.x, 'x'), y: finite(point.y, 'y'),
      ...(point.pressure === undefined ? {} : { pressure: range(point.pressure, 0, 1, 'pressure') }) });
  });
  const samples = sampleStrokePath(copied, { spacing: Number.MAX_VALUE });
  if (samples.at(-1)!.distance <= 1e-8) throw new RangeError('Bark paths need nonzero length');
  return Object.freeze(copied);
}
function ownedWidth(value: BarkBranchSource['width']): BarkBranchSource['width'] {
  if (typeof value === 'number') return positive(value, 'branch width');
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) throw new RangeError('Bark width needs a number or 1..64 controls');
  let previous = -1;
  return Object.freeze(value.map(control => {
    fields(control, ['at', 'width'], 'bark width control');
    const at = range(control.at, 0, 1, 'width.at');
    if (at <= previous) throw new RangeError('Bark width controls must have increasing positions');
    previous = at;
    return Object.freeze({ at, width: positive(control.width, 'width.width') });
  }));
}
function ownedBranches(values: readonly BarkBranchSource[]): readonly BarkBranchSource[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 16) throw new RangeError('Bark documents need 1..16 branches');
  const branchIds = new Set<string>();
  let knotCount = 0, strokeBudget = values.length * 2;
  return Object.freeze(values.map(branch => {
    fields(branch, branchFields, 'bark branch');
    const id = identifier(branch.id);
    if (branchIds.has(id)) throw new RangeError('Duplicate bark branch ID');
    branchIds.add(id);
    if (branch.shadowSide !== undefined) side(branch.shadowSide);
    const knots = branch.knots ?? [], junctions = branch.junctions ?? [];
    if (!Array.isArray(knots) || !Array.isArray(junctions) || junctions.length > 16) throw new RangeError('Bark knots and junctions must be bounded arrays');
    knotCount += knots.length;
    if (knotCount > 24) throw new RangeError('Bark documents support at most 24 knots');
    const knotIds = new Set<string>(), junctionIds = new Set<string>();
    const copiedKnots = knots.map(knot => {
      fields(knot, knotFields, 'bark knot');
      const id = identifier(knot.id);
      if (knotIds.has(id)) throw new RangeError('Duplicate bark knot ID');
      knotIds.add(id);
      range(knot.at, 0, 1, 'knot.at');
      if (knot.side !== undefined) side(knot.side);
      if (knot.offset !== undefined) range(knot.offset, -1, 1, 'knot.offset');
      if (knot.size !== undefined) range(knot.size, .1, 2, 'knot.size');
      const count = range(knot.count ?? 8, 2, 20, 'knot.count');
      if (!Number.isInteger(count)) throw new RangeError('Knot count must be an integer');
      if (knot.kind !== undefined && !['knot', 'cavity'].includes(knot.kind)) throw new RangeError('Unknown bark knot kind');
      strokeBudget += count + 3;
      if (strokeBudget > 512) throw new RangeError('Bark document exceeds the 512 stroke budget');
      return Object.freeze({ ...knot });
    });
    const copiedJunctions = junctions.map(junction => {
      fields(junction, ['id', 'at', 'side', 'span'], 'bark junction');
      const id = identifier(junction.id);
      if (junctionIds.has(id)) throw new RangeError('Duplicate bark junction ID');
      junctionIds.add(id);
      return Object.freeze({ id, at: range(junction.at, 0, 1, 'junction.at'), side: side(junction.side), span: range(junction.span, 0, 1, 'junction.span') });
    });
    return Object.freeze({ id, points: ownedPath(branch.points), width: ownedWidth(branch.width),
      ...(branch.leftEdge === undefined ? {} : { leftEdge: ownedPath(branch.leftEdge) }),
      ...(branch.rightEdge === undefined ? {} : { rightEdge: ownedPath(branch.rightEdge) }),
      ...(branch.shadowSide === undefined ? {} : { shadowSide: branch.shadowSide }),
      ...(branch.knots === undefined ? {} : { knots: Object.freeze(copiedKnots) }),
      ...(branch.junctions === undefined ? {} : { junctions: Object.freeze(copiedJunctions) }) });
  }));
}
function widthAt(branch: BarkBranchSource, at: number): number {
  if (typeof branch.width === 'number') return branch.width;
  const controls = branch.width;
  for (let i = 1; i < controls.length; i++) {
    const left = controls[i - 1]!, right = controls[i]!;
    if (at <= right.at) {
      const t = clamp((at - left.at) / (right.at - left.at));
      return left.width * (1 - t) + right.width * t;
    }
  }
  return controls.at(-1)!.width;
}
function stations(points: readonly InkPoint[]): StrokePathSample[] {
  const length = sampleStrokePath(points, { spacing: Number.MAX_VALUE }).at(-1)!.distance;
  return sampleStrokePath(points, { spacing: length / 128 });
}
function pointAt(samples: readonly StrokePathSample[], at: number): StrokePathSample {
  const distance = samples.at(-1)!.distance * at;
  let index = Math.min(samples.length - 2, Math.floor(at * (samples.length - 1)));
  while (index > 0 && samples[index]!.distance > distance) index--;
  while (index < samples.length - 2 && samples[index + 1]!.distance < distance) index++;
  const left = samples[index]!, right = samples[index + 1]!;
  const t = (distance - left.distance) / (right.distance - left.distance);
  const nx = left.nx * (1 - t) + right.nx * t, ny = left.ny * (1 - t) + right.ny * t;
  const magnitude = Math.hypot(nx, ny) || 1;
  return { x: left.x * (1 - t) + right.x * t, y: left.y * (1 - t) + right.y * t,
    pressure: left.pressure * (1 - t) + right.pressure * t, distance, nx: nx / magnitude, ny: ny / magnitude };
}
function edgePressure(points: readonly InkPoint[]): (at: number, fallback: number) => number {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! +
    Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  return (at, fallback) => {
    const target = at * distances.at(-1)!;
    let low = 0, high = points.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (distances[middle]! <= target) low = middle;
      else high = middle;
    }
    const span = distances[high]! - distances[low]!;
    const t = span ? (target - distances[low]!) / span : 1;
    return (points[low]!.pressure ?? fallback) * (1 - t) + (points[high]!.pressure ?? fallback) * t;
  };
}
/** Generates ordinary contours and local knot groups from the author's branch structure. */
export function createBarkDocument(branches: readonly BarkBranchSource[], options: BarkDocumentOptions): BarkDocument {
  fields(options, optionFields, 'bark option');
  const { idPrefix = 'bark', contourWidth = .06, textureStrength = .7, ...sceneOptions } = options;
  identifier(idPrefix); range(contourWidth, .005, .3, 'contourWidth'); range(textureStrength, 0, 1, 'textureStrength');
  const checkedOptions = createStrokeGroupDocument([], sceneOptions).recipe.options;
  const canonical = Object.freeze({ ...checkedOptions, idPrefix, contourWidth, textureStrength });
  const owned = ownedBranches(branches), groups: StrokeGroupSource[] = [];
  const ink = canonical.ink ?? '#30382d', seed = canonical.seed ?? 1;
  function mark(id: string, points: readonly InkPoint[], width: number, style: GroupStrokeOptions): GroupStrokeSource {
    return { id, points, options: { width, duration: 0, gestureModel: 'local-v1', smoothing: 'catmull-rom', ...style,
      opacity: (style.opacity ?? 1) * (canonical.opacity ?? 1),
      dryness: canonical.dryness ?? style.dryness ?? .5 } };
  }
  for (const branch of owned) {
    const key = `${idPrefix.length}:${idPrefix}/${branch.id.length}:${branch.id}`;
    const contourId = key + '/contours', samples = stations(branch.points);
    const left = branch.leftEdge ? stations(branch.leftEdge) : undefined;
    const right = branch.rightEdge ? stations(branch.rightEdge) : undefined;
    const leftPressure = branch.leftEdge ? edgePressure(branch.leftEdge) : undefined;
    const rightPressure = branch.rightEdge ? edgePressure(branch.rightEdge) : undefined;
    const widthPositions = typeof branch.width === 'number' ? [] : branch.width.map(control => control.at);
    const edgePositions = [...new Set([...samples.map((_, i) => i / (samples.length - 1)), ...widthPositions])].sort((a, b) => a - b);
    const maxWidth = typeof branch.width === 'number' ? branch.width : Math.max(...branch.width.map(control => control.width));
    const edgeAt = (at: number, direction: -1 | 1): Vec2 => {
      const authored = direction === -1 ? left : right;
      if (authored) {
        const point = pointAt(authored, at);
        return { x: point.x, y: point.y };
      }
      const p = pointAt(samples, at), radius = widthAt(branch, at) * .5 * direction;
      return { x: p.x + p.nx * radius, y: p.y + p.ny * radius };
    };
    const clip = [...edgePositions.map(at => edgeAt(at, -1)), ...edgePositions.slice().reverse().map(at => edgeAt(at, 1))];
    const contours: GroupStrokeSource[] = [];
    for (const direction of [-1, 1] as const) {
      const random = createRandom(seed ^ hash(key + '/edge/' + direction));
      const noise = createNoise1D(seed ^ hash(key + '/edge-pressure/' + direction));
      const gaps = (branch.junctions ?? []).filter(j => j.side === direction && j.span > 0)
        .map(j => ({ start: Math.max(0, j.at - j.span / 2), end: Math.min(1, j.at + j.span / 2) }));
      for (let i = 0; i < 3; i++) {
        const start = .08 + random() * .8;
        gaps.push({ start, end: Math.min(1, start + .012 + random() * .024) });
      }
      const positions = [...edgePositions,
        ...gaps.flatMap(g => [g.start, (g.start + g.end) / 2, g.end])].sort((a, b) => a - b);
      const points = [...new Set(positions)].map(at => {
        const p = pointAt(samples, at), edge = edgeAt(at, direction);
        const authoredPressure = direction === -1 ? leftPressure : rightPressure;
        const load = authoredPressure?.(at, p.pressure) ?? p.pressure;
        const shift = branch.leftEdge || branch.rightEdge ? 0 : noise(at * 23 + 4) * widthAt(branch, at) * .012;
        const pressure = gaps.some(g => at >= g.start && at <= g.end) ? 0
          : clamp((.7 + noise(at * 15 + 1) * .23) * load * widthAt(branch, at) / maxWidth);
        return { x: edge.x + p.nx * shift, y: edge.y + p.ny * shift, pressure };
      });
      contours.push(mark(direction === -1 ? 'minus-edge' : 'plus-edge', points, canonical.strokeWidth ?? maxWidth * contourWidth,
        { ink, axis: 'center', opacity: direction === (branch.shadowSide ?? 1) ? .83 : .53, dryness: .47 }));
    }
    groups.push({ id: contourId, role: 'structure', strokes: contours });
    for (const knot of branch.knots ?? []) {
      const id = key + `/knot/${knot.id.length}:${knot.id}`, random = createRandom(seed ^ hash(id));
      const p = pointAt(samples, knot.at), width = widthAt(branch, knot.at), size = width * (knot.size ?? .65);
      const direction = knot.side ?? branch.shadowSide ?? 1;
      const offset = (knot.offset ?? direction * .35) * width * .5;
      const origin = { x: p.x + p.nx * offset, y: p.y + p.ny * offset };
      const local = (along: number, across: number, pressure: number): InkPoint => ({
        x: origin.x + p.ny * along + p.nx * across,
        y: origin.y - p.nx * along + p.ny * across, pressure,
      });
      const marks: GroupStrokeSource[] = [];
      const cavity = knot.kind === 'cavity';
      for (let i = 0; i < (knot.count ?? 8); i++) {
        const primary = i % 4 === 0;
        let along = (random() + random() - 1) * size * .65;
        let across = (random() + random() - 1) * size * .24;
        if (cavity) {
          const angle = random() * Math.PI * 1.5 + Math.PI * .25;
          along = Math.cos(angle) * size * (.36 + random() * .1);
          across = Math.sin(angle) * size * (.23 + random() * .09) * direction;
          if (primary) {
            along = size * (.2 + random() * .2);
            across = direction * size * (.18 + random() * .12);
          }
        } else if (i === 0) {
          along = (random() - .5) * size * .08;
          across = (random() - .5) * size * .08;
        }
        const reach = size * (.09 + random() * .15) * (cavity && along < 0 ? -1 : 1);
        const bend = size * (random() - .5) * .1;
        const points = [local(along, across, .18), local(along + reach * .3, across + bend, primary ? .94 : .63),
          local(along + reach * .7, across + bend * .7, .5), local(along + reach, across, 0)];
        const contact = size * (cavity ? primary ? .1 + random() * .08 : .045 + random() * .045
          : primary ? .18 + random() * .11 : .075 + random() * .075);
        marks.push(mark('dab-' + i, points, contact, { ink, axis: 'center', clip,
          opacity: textureStrength * (primary ? .85 : .35 + random() * .3), dryness: .4 + random() * .28 }));
      }
      const rim = cavity
        ? [local(-size * .4, 0, .1), local(-size * .2, direction * size * .23, .8), local(size * .14, direction * size * .26, .6), local(size * .36, direction * size * .08, 0)]
        : [local(-size * .32, -size * .08, .2), local(-size * .1, direction * size * .15, .83), local(size * .25, direction * size * .1, 0)];
      marks.push(mark('crack', rim, cavity ? Math.min(width * .045, size * .08) : width * .045,
        { ink, axis: 'center', opacity: .8 * textureStrength, dryness: .5, clip }));
      for (let i = 0; i < 2; i++) {
        const along = (i ? 1 : -1) * size * (.3 + random() * .15);
        const across = direction * size * ((cavity ? .32 : .14) + random() * .08);
        const contact = width * (.05 + random() * .035);
        marks.push(mark('scuff-' + i, [local(along, across, .12), local(along + size * .16, across * .9, .7),
          local(along + size * .36, across * .65, 0)], cavity ? Math.min(contact, size * .12) : contact,
        { ink, axis: 'side', opacity: textureStrength * .28, dryness: .72, clip }));
      }
      groups.push({ id, role: 'mark', parentId: contourId, strokes: marks });
    }
  }
  const document = createStrokeGroupDocument(groups, checkedOptions);
  const recipe: BarkRecipe = Object.freeze({ version: 1, generator: GENERATOR, branches: owned, options: canonical });
  return Object.freeze({ version: 1, recipe, groups: document.recipe.groups, result: document.result });
}

function assertRecipe(recipe: BarkRecipe): void {
  fields(recipe, ['version', 'generator', 'branches', 'options'], 'bark recipe');
  if (recipe.version !== 1 || recipe.generator !== GENERATOR) throw new RangeError('Unsupported bark recipe version or generator');
}
export function compileBarkRecipe(recipe: BarkRecipe): InkScene {
  assertRecipe(recipe);
  return createBarkDocument(recipe.branches, recipe.options).result;
}
export function reviseBarkDocument(document: BarkDocument, patch: BarkDocumentPatch): BarkDocument {
  fields(document, ['version', 'recipe', 'groups', 'result'], 'bark document');
  if (document.version !== 1) throw new RangeError('Unsupported bark document version');
  assertRecipe(document.recipe);
  const original = createBarkDocument(document.recipe.branches, document.recipe.options);
  fields(patch, ['branches', 'options'], 'bark patch');
  return createBarkDocument(patch.branches ?? original.recipe.branches, { ...original.recipe.options, ...patch.options });
}
