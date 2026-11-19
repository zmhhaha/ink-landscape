import { createInkScene } from './core.js';
import { createBrushDocument } from './brush-document.js';
import type { BrushProgramOptions } from './brush-document.js';
import type { InkPoint, InkScene } from './types.js';

export type GroupStrokeOptions = Omit<BrushProgramOptions, 'id' | 'seed'>;
export interface GroupStrokeSource {
  readonly id: string;
  readonly points: readonly InkPoint[];
  readonly options?: GroupStrokeOptions;
}
/** Paint order is explicit. A parent records authorship, not inferred attachment or occlusion. */
export interface StrokeGroupSource {
  readonly id: string;
  readonly role?: 'structure' | 'mark';
  readonly parentId?: string;
  readonly strokes: readonly GroupStrokeSource[];
}
export interface StrokeGroupOptions {
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly background?: string;
  readonly ink?: string;
  readonly strokeWidth?: number;
  readonly dryness?: number;
  readonly opacity?: number;
}
export interface StrokeGroupRecipe {
  readonly version: 1;
  readonly generator: 'ink-stroke-groups-v1';
  readonly groups: readonly StrokeGroupSource[];
  readonly options: StrokeGroupOptions;
}
export interface StrokeGroupDocument {
  readonly version: 1;
  readonly recipe: StrokeGroupRecipe;
  readonly result: InkScene;
}
export interface StrokeGroupPatch {
  readonly groups?: readonly StrokeGroupSource[];
  readonly options?: Partial<StrokeGroupOptions>;
}

const programFields = new Set(['width', 'height', 'seed', 'background', 'ink', 'strokeWidth', 'dryness', 'opacity']);
const strokeFields = new Set(['id', 'points', 'options']);
const brushFields = new Set(['width', 'ink', 'opacity', 'dryness', 'smoothing', 'clip', 'start', 'duration',
  'axis', 'entry', 'finish', 'pressureProfile', 'turn', 'rhythm', 'drag', 'strength', 'controls', 'gestureModel']);
function fields(value: object, allowed: ReadonlySet<string>, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) throw new RangeError(`Unsupported ${name} field: ${key}`);
    if (item === null) throw new TypeError(`${name}.${key} cannot be null`);
  }
}
function text(value: string, name: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
}
function colour(value: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError('Group colours must be #RRGGBB');
  return value.toLowerCase();
}
function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
function validateParents(groups: readonly StrokeGroupSource[]): void {
  const lookup = new Map(groups.map(group => [group.id, group.parentId]));
  const finished = new Set<string>();
  for (const group of groups) {
    const visiting = new Set<string>();
    let id: string | undefined = group.id;
    while (id !== undefined && !finished.has(id)) {
      if (!lookup.has(id)) throw new RangeError(`Unknown parent group: ${id}`);
      if (visiting.has(id)) throw new RangeError('Group parents must be acyclic');
      visiting.add(id); id = lookup.get(id);
    }
    for (const item of visiting) finished.add(item);
  }
}

/** A neutral authored brush group. No traditional technique, spacing or shape is inferred. */
export function createStrokeGroupDocument(groups: readonly StrokeGroupSource[], options: StrokeGroupOptions): StrokeGroupDocument {
  fields(options, programFields, 'stroke group option');
  // Delegate finite dimensions, seed, stroke styles and channel validation to the existing core.
  const builder = createInkScene({ width: options.width, height: options.height, seed: options.seed ?? 1,
    background: colour(options.background ?? '#f5f2e9') });
  const seed = builder.snapshot().seed;
  createBrushDocument([{ x: 0, y: 0 }, { x: 1, y: 0 }], {
    width: options.strokeWidth ?? 3, ink: colour(options.ink ?? '#252820'),
    dryness: options.dryness ?? .35, opacity: options.opacity ?? .8,
  });
  if (!Array.isArray(groups) || groups.length > 512) throw new RangeError('Stroke group documents support at most 512 groups');
  let count = 0; const ids = new Set<string>();
  for (const group of groups) {
    fields(group, new Set(['id', 'role', 'parentId', 'strokes']), 'stroke group'); text(group.id, 'group.id');
    if (ids.has(group.id)) throw new RangeError(`Duplicate stroke group id: ${group.id}`);
    ids.add(group.id);
    if (group.parentId !== undefined) text(group.parentId, 'group.parentId');
    if (group.role !== undefined && !['structure', 'mark'].includes(group.role)) throw new RangeError('Unsupported group role');
    if (!Array.isArray(group.strokes) || group.strokes.length < 1) throw new RangeError('A stroke group requires strokes');
    count += group.strokes.length;
    if (count > 512) throw new RangeError('Stroke group documents support at most 512 strokes');
  }
  validateParents(groups);
  const authored = groups.map((group: StrokeGroupSource) => {
    const strokeIds = new Set<string>();
    const strokes = group.strokes.map((stroke: GroupStrokeSource) => {
      fields(stroke, strokeFields, 'group stroke'); text(stroke.id, 'stroke.id');
      if (strokeIds.has(stroke.id)) throw new RangeError(`Duplicate stroke id in group ${group.id}: ${stroke.id}`);
      strokeIds.add(stroke.id);
      if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 4096) throw new RangeError('Group paths support 2..4096 points');
      for (const point of stroke.points) fields(point, new Set(['x', 'y', 'pressure']), 'group point');
      if (stroke.options !== undefined) fields(stroke.options, brushFields, 'group stroke option');
      if (stroke.options?.clip !== undefined) {
        if (!Array.isArray(stroke.options.clip) || stroke.options.clip.length > 4096) throw new RangeError('Group clips support at most 4096 points');
        for (const point of stroke.options.clip) fields(point, new Set(['x', 'y']), 'group clip point');
      }
      if (stroke.options?.controls !== undefined) {
        if (!Array.isArray(stroke.options.controls)) throw new TypeError('Group controls must be an array');
        for (const control of stroke.options.controls) fields(control,
          new Set(['at', 'pressure', 'side', 'angle', 'dryness', 'inkLoad']), 'group control');
      }
      const overrides = Object.fromEntries(Object.entries(stroke.options ?? {}).filter(([, value]) => value !== undefined));
      const id = `${group.id.length}:${group.id}/${stroke.id.length}:${stroke.id}`;
      const brush = createBrushDocument(stroke.points, {
        width: options.strokeWidth ?? 3, dryness: options.dryness ?? .35, opacity: options.opacity ?? .8,
        ink: colour(options.ink ?? '#252820'), gestureModel: 'local-v1', ...overrides,
        id, seed: (seed ^ hash(id)) >>> 0,
      });
      // Preserve sparse authored settings while owning all nested arrays.
      const sparse = Object.fromEntries(Object.keys(overrides).map(key => [key,
        (brush.recipe.options as unknown as Record<string, unknown>)[key]]));
      if (sparse.ink !== undefined) sparse.ink = colour(sparse.ink as string);
      builder.stroke(brush.result.points, brush.result);
      return Object.freeze({ id: stroke.id, points: brush.recipe.points,
        ...(stroke.options === undefined ? {} : { options: Object.freeze(sparse) as GroupStrokeOptions }) });
    });
    return Object.freeze({ id: group.id, ...(group.role === undefined ? {} : { role: group.role }),
      ...(group.parentId === undefined ? {} : { parentId: group.parentId }), strokes: Object.freeze(strokes) });
  });
  const savedOptions = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, key === 'ink' || key === 'background' ? colour(value as string) : value]));
  const recipe: StrokeGroupRecipe = Object.freeze({ version: 1, generator: 'ink-stroke-groups-v1',
    groups: Object.freeze(authored), options: Object.freeze(savedOptions) as unknown as StrokeGroupOptions });
  return Object.freeze({ version: 1, recipe, result: builder.snapshot() });
}
function assertRecipe(recipe: StrokeGroupRecipe): void {
  fields(recipe, new Set(['version', 'generator', 'groups', 'options']), 'stroke group recipe');
  if (recipe.version !== 1 || recipe.generator !== 'ink-stroke-groups-v1') throw new RangeError('Unsupported stroke group recipe version or generator');
}
export function compileStrokeGroupRecipe(recipe: StrokeGroupRecipe): InkScene {
  assertRecipe(recipe); return createStrokeGroupDocument(recipe.groups, recipe.options).result;
}
export function reviseStrokeGroupDocument(document: StrokeGroupDocument, patch: StrokeGroupPatch): StrokeGroupDocument {
  fields(document, new Set(['version', 'recipe', 'result']), 'stroke group document');
  if (document.version !== 1) throw new RangeError('Unsupported stroke group document version');
  assertRecipe(document.recipe);
  fields(patch, new Set(['groups', 'options']), 'stroke group patch');
  if (patch.options !== undefined) fields(patch.options, programFields, 'stroke group option');
  return createStrokeGroupDocument(patch.groups ?? document.recipe.groups, { ...document.recipe.options, ...patch.options });
}
