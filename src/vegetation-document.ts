import { createInkScene } from './core.js';
import { createBrushDocument } from './brush-document.js';
import type { BrushProgramOptions } from './brush-document.js';
import type { InkPoint, InkScene } from './types.js';

/** Contact approximations; object structure and leaf groups remain authored. */
export type VegetationTechnique = 'moss' | 'dot-leaf' | 'outline-leaf';
export type VegetationStrokeOptions = Omit<BrushProgramOptions, 'id' | 'ink' | 'seed' | 'gestureModel'>;

export interface VegetationStrokeSource {
  readonly id: string;
  readonly points: readonly InkPoint[];
  readonly options?: VegetationStrokeOptions;
}

/** A caller-defined moss dab, leaf, or structural group; no inferred attachment. */
export interface VegetationUnitSource {
  readonly id: string;
  readonly role?: 'structure' | 'mark';
  /** Two outline sides can share one editable leaf identity. */
  readonly strokes: readonly VegetationStrokeSource[];
}

export interface VegetationProgramOptions {
  readonly technique: VegetationTechnique;
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly background?: string;
  readonly ink?: string;
  readonly strokeWidth?: number;
  readonly dryness?: number;
  readonly opacity?: number;
  readonly strength?: number;
}

export interface VegetationRecipe {
  readonly version: 1;
  readonly generator: 'ink-vegetation-guides-v1';
  readonly units: readonly VegetationUnitSource[];
  readonly options: VegetationProgramOptions;
}

export interface VegetationDocument {
  readonly version: 1;
  readonly recipe: VegetationRecipe;
  readonly result: InkScene;
}

export interface VegetationDocumentPatch {
  /** Replaces all authored units, retaining their order as paint order. */
  readonly units?: readonly VegetationUnitSource[];
  /** Shallow merge; per-stroke controls still replace the preset array. */
  readonly options?: Partial<VegetationProgramOptions>;
}

/** A source edit for one explicit group; it does not infer a branch attachment. */
export interface VegetationUnitTransform {
  /** Applied after rotation, in scene coordinates. */
  readonly translation?: { readonly x: number; readonly y: number };
  /** Radians about the caller's explicit pivot; positive follows scene coordinates. */
  readonly rotation?: number;
  readonly pivot?: { readonly x: number; readonly y: number };
  /** Multiplies each stroke's effective width, without scaling its path. */
  readonly widthScale?: number;
}

/** One explicitly positioned contact strand, not a physical bristle simulation. */
export interface VegetationContactBundle {
  readonly id: string;
  /** Signed distance along the source polyline's local left normal, in scene units. */
  readonly offset: number;
  /** Absolute stroke width; independent of the offset geometry. */
  readonly width: number;
  /** Multiplies authored point pressure, in 0..1. Local controls remain unchanged. */
  readonly pressureScale?: number;
}

const GENERATOR = 'ink-vegetation-guides-v1';
const programFields = new Set(['technique', 'width', 'height', 'seed', 'background', 'ink', 'strokeWidth', 'dryness', 'opacity', 'strength']);
const unitFields = new Set(['id', 'role', 'strokes']);
const strokeFields = new Set(['id', 'points', 'options']);
const strokeOptionFields = new Set(['width', 'opacity', 'dryness', 'smoothing', 'clip', 'start', 'duration',
  'axis', 'entry', 'finish', 'pressureProfile', 'turn', 'rhythm', 'drag', 'strength', 'controls']);
const pointFields = new Set(['x', 'y', 'pressure']);
const clipFields = new Set(['x', 'y']);
const controlFields = new Set(['at', 'pressure', 'side', 'angle', 'dryness', 'inkLoad']);
const defaults = {
  moss: { width: 9, dryness: .50, opacity: .78 },
  'dot-leaf': { width: 15, dryness: .35, opacity: .78 },
  'outline-leaf': { width: 2.2, dryness: .32, opacity: .74 },
} as const;

function fields(value: object, allowed: ReadonlySet<string>, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new RangeError(`Unsupported ${name} field: ${key}`);
    if ((value as Record<string, unknown>)[key] === null) throw new TypeError(`${name}.${key} cannot be null`);
  }
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function unit(value: number, name: string): number {
  if (finite(value, name) < 0 || value > 1) throw new RangeError(`${name} must be in 0..1`);
  return value;
}
function text(value: string, name: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
}
function colour(value: string, name: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError(`${name} must be a #RRGGBB colour`);
  return value.toLowerCase();
}
function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function validateProgram(options: VegetationProgramOptions): void {
  fields(options, programFields, 'vegetation option');
  if (!['moss', 'dot-leaf', 'outline-leaf'].includes(options.technique)) throw new RangeError('Unsupported vegetation technique');
  positive(options.width, 'width'); positive(options.height, 'height');
  if (options.seed !== undefined && !Number.isSafeInteger(finite(options.seed, 'seed'))) throw new RangeError('seed must be a safe integer');
  for (const key of ['background', 'ink'] as const) if (options[key] !== undefined) colour(options[key], key);
  if (options.strokeWidth !== undefined) positive(options.strokeWidth, 'strokeWidth');
  for (const key of ['dryness', 'opacity', 'strength'] as const) if (options[key] !== undefined) unit(options[key], key);
}
function validateStroke(source: VegetationStrokeSource): void {
  fields(source, strokeFields, 'vegetation stroke'); text(source.id, 'stroke.id');
  if (!Array.isArray(source.points) || source.points.length < 2 || source.points.length > 4096) throw new RangeError('A vegetation path supports 2..4096 points');
  for (const point of source.points) {
    fields(point, pointFields, 'vegetation point'); finite(point.x, 'point.x'); finite(point.y, 'point.y');
    if (point.pressure !== undefined) unit(point.pressure, 'point.pressure');
  }
  if (source.options === undefined) return;
  fields(source.options, strokeOptionFields, 'vegetation stroke option');
  if (source.options.clip !== undefined) {
    if (!Array.isArray(source.options.clip) || source.options.clip.length > 4096) throw new RangeError('vegetation stroke clip supports at most 4096 points');
    for (const point of source.options.clip) fields(point, clipFields, 'vegetation clip point');
  }
  if (source.options.controls !== undefined) {
    if (!Array.isArray(source.options.controls)) throw new TypeError('vegetation controls must be an array');
    for (const control of source.options.controls) fields(control, controlFields, 'vegetation control');
  }
}

/**
 * Expands a shared authored path into 2..32 correlated, independently editable
 * source strokes. This is a multiple-path contact approximation, not one
 * physical brush touch. Width never moves the paths. Clips remain in scene
 * coordinates, and timing and local controls are copied to every member.
 *
 * Repeated vertices use the nearest nonzero incoming/outgoing segments. At a
 * corner their unit tangents are averaged; a 180-degree reversal uses the
 * outgoing tangent. Like other strokes, a wholly stationary path is rejected.
 * Tight turns may fold the offset paths; no silhouette union or repair occurs.
 */
export function createSplitVegetationUnit(id: string, source: VegetationStrokeSource,
  bundles: readonly VegetationContactBundle[]): VegetationUnitSource {
  text(id, 'vegetation unit id');
  validateStroke(source);
  if (!Array.isArray(bundles) || bundles.length < 2 || bundles.length > 32) throw new RangeError('Split contact supports 2..32 bundles');
  const ids = new Set<string>();
  for (const bundle of bundles) {
    fields(bundle, new Set(['id', 'offset', 'width', 'pressureScale']), 'vegetation contact bundle');
    text(bundle.id, 'bundle.id');
    if (ids.has(bundle.id)) throw new RangeError(`Duplicate contact bundle id: ${bundle.id}`);
    ids.add(bundle.id);
    finite(bundle.offset, 'bundle.offset'); positive(bundle.width, 'bundle.width');
    if (bundle.pressureScale !== undefined) unit(bundle.pressureScale, 'bundle.pressureScale');
  }
  // Reuse core validation and ownership without exposing its canonical defaults
  // as new authored source settings. The stored result is not used here.
  const original = createBrushDocument(source.points, source.options ?? {});
  const points = original.recipe.points;
  const sparse = Object.fromEntries(Object.keys(source.options ?? {}).filter(key =>
    (source.options as Record<string, unknown>)[key] !== undefined).map(key =>
    [key, (original.recipe.options as unknown as Record<string, unknown>)[key]])) as VegetationStrokeOptions;
  const before: number[] = [], after: number[] = [];
  let previous = -1, next = -1;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && (points[i]!.x !== points[i - 1]!.x || points[i]!.y !== points[i - 1]!.y)) previous = i - 1;
    before[i] = previous;
  }
  for (let i = points.length - 1; i >= 0; i--) {
    if (i < points.length - 1 && (points[i]!.x !== points[i + 1]!.x || points[i]!.y !== points[i + 1]!.y)) next = i + 1;
    after[i] = next;
  }
  const direction = (a: InkPoint, b: InkPoint) => {
    const x = finite(b.x - a.x, 'contact tangent.x'), y = finite(b.y - a.y, 'contact tangent.y');
    const length = Math.hypot(x, y);
    if (!Number.isFinite(length) || length === 0) throw new RangeError('Contact tangent must have finite, nonzero length');
    return { x: x / length, y: y / length };
  };
  const normals = points.map((point, i) => {
    const incoming = before[i]! < 0 ? undefined : direction(points[before[i]!]!, point);
    const outgoing = after[i]! < 0 ? undefined : direction(point, points[after[i]!]!);
    const fallback = outgoing ?? incoming!;
    const x = (incoming?.x ?? 0) + (outgoing?.x ?? 0), y = (incoming?.y ?? 0) + (outgoing?.y ?? 0);
    const length = Math.hypot(x, y);
    const tangent = length > 1e-12 ? { x: x / length, y: y / length } : fallback;
    return { x: -tangent.y, y: tangent.x };
  });
  const strokes = bundles.map(bundle => {
    const pressureScale = bundle.pressureScale ?? 1;
    const shifted = points.map((point, i) => ({ ...point,
      ...(bundle.offset === 0 ? {} : {
        x: finite(point.x + normals[i]!.x * bundle.offset, 'contact point.x'),
        y: finite(point.y + normals[i]!.y * bundle.offset, 'contact point.y'),
      }),
      ...(pressureScale === 1 ? {} : { pressure: (point.pressure ?? 1) * pressureScale }),
    }));
    const member = createBrushDocument(shifted, { ...sparse, width: bundle.width });
    return Object.freeze({ id: `${source.id.length}:${source.id}/${bundle.id.length}:${bundle.id}`, points: member.recipe.points,
      options: Object.freeze({ ...sparse, width: bundle.width }) });
  });
  return Object.freeze({ id, strokes: Object.freeze(strokes) });
}

function contactPreset(technique: VegetationTechnique, structure: boolean): VegetationStrokeOptions {
  if (structure) return {
    axis: 'center', smoothing: 'catmull-rom', entry: 'preserve', finish: 'preserve', turn: 'preserve',
    controls: [{ at: 0, pressure: 1, side: 0, angle: 1.5 }, { at: 1, pressure: 1, side: 0, angle: 1.5 }],
  };
  if (technique === 'moss') return {
    axis: 'center', smoothing: 'catmull-rom', entry: 'preserve', finish: 'open', turn: 'preserve',
    controls: [{ at: 0, pressure: .28, side: .08, angle: 1.5 },
      { at: .30, pressure: .9, side: .26, angle: 1.3 },
      { at: .62, pressure: .76, side: .34, angle: 1.65 },
      { at: 1, pressure: .12, side: .08, angle: 1.5 }],
  };
  if (technique === 'dot-leaf') return {
    axis: 'side', smoothing: 'catmull-rom', entry: 'preserve', finish: 'open', turn: 'preserve',
    controls: [{ at: 0, pressure: .16, side: .18, angle: 1.4 },
      { at: .30, pressure: 1, side: .76, angle: 1.35 },
      { at: .62, pressure: .68, side: .55, angle: 1.6 },
      { at: 1, pressure: .03, side: .08, angle: 1.5 }],
  };
  return {
    // Both boundaries are supplied explicitly; neither filling nor white erasure occurs.
    axis: 'center', smoothing: 'catmull-rom', entry: 'preserve', finish: 'preserve', turn: 'preserve',
    controls: [{ at: 0, pressure: .65, side: .02, angle: 1.5 },
      { at: .38, pressure: .95, side: .06, angle: 1.4 },
      { at: 1, pressure: .35, side: .02, angle: 1.5 }],
  };
}

/** Executes explicit units and paths, preserving per-leaf grouping and paint order. */
export function createVegetationDocument(units: readonly VegetationUnitSource[], options: VegetationProgramOptions): VegetationDocument {
  validateProgram(options);
  if (!Array.isArray(units) || units.length > 512) throw new RangeError('Vegetation documents support at most 512 units');
  const unitIds = new Set<string>(); let strokeCount = 0;
  for (const source of units) {
    fields(source, unitFields, 'vegetation unit'); text(source.id, 'unit.id');
    if (unitIds.has(source.id)) throw new RangeError(`Duplicate vegetation unit id: ${source.id}`);
    unitIds.add(source.id);
    if (source.role !== undefined && !['structure', 'mark'].includes(source.role)) throw new RangeError('Unsupported vegetation unit role');
    if (!Array.isArray(source.strokes) || source.strokes.length < 1 || source.strokes.length > 512) throw new RangeError('A vegetation unit supports 1..512 strokes');
    strokeCount += source.strokes.length;
    if (strokeCount > 512) throw new RangeError('Vegetation documents support at most 512 source strokes');
    const ids = new Set<string>();
    for (const stroke of source.strokes) {
      validateStroke(stroke);
      if (ids.has(stroke.id)) throw new RangeError(`Duplicate stroke id in unit ${source.id}: ${stroke.id}`);
      ids.add(stroke.id);
    }
  }
  const builder = createInkScene({ width: options.width, height: options.height, seed: options.seed ?? 1,
    background: colour(options.background ?? '#f5f2e9', 'background') });
  const scene = builder.snapshot(), authored: VegetationUnitSource[] = [];
  for (const source of units) {
    const structure = source.role === 'structure', preset = structure
      ? { width: 2.4, dryness: .5, opacity: .65 } : defaults[options.technique];
    const strokes: VegetationStrokeSource[] = [];
    for (const stroke of source.strokes) {
      const id = `${source.id.length}:${source.id}/${stroke.id.length}:${stroke.id}`;
      const overrides = Object.fromEntries(Object.entries(stroke.options ?? {}).filter(([, value]) => value !== undefined)) as VegetationStrokeOptions;
      const brush = createBrushDocument(stroke.points, {
        ...contactPreset(options.technique, structure), width: options.strokeWidth ?? preset.width,
        dryness: options.dryness ?? preset.dryness, opacity: options.opacity ?? preset.opacity,
        strength: options.strength ?? 1, ...overrides, id, seed: (scene.seed ^ hashText(id)) >>> 0,
        ink: colour(options.ink ?? '#20251f', 'ink'), gestureModel: 'local-v1',
      });
      const sparse: Record<string, unknown> = {};
      for (const key of Object.keys(stroke.options ?? {})) {
        if ((stroke.options as Record<string, unknown>)[key] !== undefined) sparse[key] = (brush.recipe.options as unknown as Record<string, unknown>)[key];
      }
      strokes.push(Object.freeze({ id: stroke.id, points: brush.recipe.points,
        ...(stroke.options === undefined ? {} : { options: Object.freeze(sparse) as VegetationStrokeOptions }) }));
      builder.stroke(brush.result.points, brush.result);
    }
    authored.push(Object.freeze({ id: source.id, ...(source.role === undefined ? {} : { role: source.role }), strokes: Object.freeze(strokes) }));
  }
  const sparseOptions = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, key === 'ink' || key === 'background' ? colour(value as string, key) : value])) as unknown as VegetationProgramOptions;
  const recipe: VegetationRecipe = Object.freeze({ version: 1, generator: GENERATOR,
    units: Object.freeze(authored), options: Object.freeze(sparseOptions) });
  return Object.freeze({ version: 1, recipe, result: builder.snapshot() });
}

function assertRecipe(recipe: VegetationRecipe): void {
  if (!recipe || recipe.version !== 1) throw new RangeError('Unsupported vegetation recipe version');
  fields(recipe, new Set(['version', 'generator', 'units', 'options']), 'vegetation recipe');
  if (recipe.generator !== GENERATOR) throw new RangeError('Unsupported vegetation generator');
}

export function compileVegetationRecipe(recipe: VegetationRecipe): InkScene {
  assertRecipe(recipe);
  return createVegetationDocument(recipe.units, recipe.options).result;
}

export function reviseVegetationDocument(document: VegetationDocument, patch: VegetationDocumentPatch): VegetationDocument {
  if (!document || document.version !== 1) throw new RangeError('Unsupported vegetation document version');
  fields(document, new Set(['version', 'recipe', 'result']), 'vegetation document');
  assertRecipe(document.recipe);
  fields(patch, new Set(['units', 'options']), 'vegetation patch');
  if (patch.options !== undefined) fields(patch.options, programFields, 'vegetation option');
  return createVegetationDocument(patch.units === undefined ? document.recipe.units : patch.units,
    { ...document.recipe.options, ...patch.options });
}

/**
 * Moves an authored unit as a group, including its clip polygons. Local contact
 * angles follow the path and remain unchanged. IDs, pressure and paint order are
 * retained; the result is rebuilt from the edited recipe, not saved playback.
 */
export function transformVegetationUnit(document: VegetationDocument, unitId: string, transform: VegetationUnitTransform): VegetationDocument {
  if (!document || document.version !== 1) throw new RangeError('Unsupported vegetation document version');
  fields(document, new Set(['version', 'recipe', 'result']), 'vegetation document');
  assertRecipe(document.recipe);
  validateProgram(document.recipe.options);
  text(unitId, 'vegetation unit id');
  fields(transform, new Set(['translation', 'rotation', 'pivot', 'widthScale']), 'vegetation transform');
  const rotation = transform.rotation === undefined ? 0 : finite(transform.rotation, 'rotation');
  const widthScale = transform.widthScale === undefined ? 1 : positive(transform.widthScale, 'widthScale');
  const vector = (value: { readonly x: number; readonly y: number }, name: string) => {
    fields(value, clipFields, name);
    return { x: finite(value.x, `${name}.x`), y: finite(value.y, `${name}.y`) };
  };
  const translation = transform.translation === undefined ? { x: 0, y: 0 } : vector(transform.translation, 'translation');
  const pivot = transform.pivot === undefined ? { x: 0, y: 0 } : vector(transform.pivot, 'pivot');
  if (rotation !== 0 && transform.pivot === undefined) throw new RangeError('A nonzero rotation requires an explicit pivot');
  const units = document.recipe.units;
  if (!Array.isArray(units) || units.length > 512) throw new RangeError('Vegetation documents support at most 512 units');
  const selected = units.find(source => source?.id === unitId);
  if (!selected) throw new RangeError(`Unknown vegetation unit id: ${unitId}`);
  fields(selected, unitFields, 'vegetation unit');
  if (!Array.isArray(selected.strokes) || selected.strokes.length < 1 || selected.strokes.length > 512) throw new RangeError('A vegetation unit supports 1..512 strokes');
  const geometryChanged = rotation !== 0 || translation.x !== 0 || translation.y !== 0;
  if (!geometryChanged && widthScale === 1) return reviseVegetationDocument(document, {});
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const move = <T extends { readonly x: number; readonly y: number }>(point: T): T => {
    const x = finite(point.x, 'transform point.x'), y = finite(point.y, 'transform point.y');
    const dx = x - pivot.x, dy = y - pivot.y;
    // Avoid subtracting and re-adding an irrelevant pivot for pure translation.
    return { ...point,
      x: finite((rotation === 0 ? x : pivot.x + dx * cosine - dy * sine) + translation.x, 'transformed point.x'),
      y: finite((rotation === 0 ? y : pivot.y + dx * sine + dy * cosine) + translation.y, 'transformed point.y'),
    };
  };
  const strokes = selected.strokes.map((stroke: VegetationStrokeSource) => {
    validateStroke(stroke);
    const scale = widthScale === 1 ? {} : { width: positive(positive(stroke.options?.width
      ?? document.recipe.options.strokeWidth
      ?? (selected.role === 'structure' ? 2.4 : defaults[document.recipe.options.technique].width), 'effective stroke width') * widthScale, 'transformed stroke width') };
    const clip = geometryChanged && stroke.options?.clip !== undefined ? { clip: stroke.options.clip.map(move) } : {};
    const options = stroke.options === undefined && widthScale === 1 ? undefined : { ...stroke.options, ...scale, ...clip };
    return { ...stroke, ...(geometryChanged ? { points: stroke.points.map(move) } : {}),
      ...(options === undefined ? {} : { options }) };
  });
  return reviseVegetationDocument(document, { units: units.map(source => source === selected ? { ...source, strokes } : source) });
}
