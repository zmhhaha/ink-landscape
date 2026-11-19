import { createInkScene } from './core.js';
import { createBrushDocument } from './brush-document.js';
import type { BrushProgramOptions } from './brush-document.js';
import type { BrushControl, InkPoint, InkScene } from './types.js';

export type CunTechnique = 'pima' | 'axe' | 'zhedai' | 'jiesuo' | 'luanchai' | 'niumao'
  | 'cloud-study' | 'point-study' | 'heye';
export type CunStrokeOptions = Omit<BrushProgramOptions, 'id' | 'ink' | 'seed' | 'gestureModel'>;

/** One author-organized stroke, not an automatically scattered texture sample. */
export interface CunStrokeSource {
  readonly id: string;
  readonly points: readonly InkPoint[];
  readonly options?: CunStrokeOptions;
}

export interface CunProgramOptions {
  readonly technique: CunTechnique;
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly background?: string;
  readonly ink?: string;
  readonly strokeWidth?: number;
  readonly dryness?: number;
  readonly opacity?: number;
  /** Local gesture geometry strength; contact controls remain independently set. */
  readonly strength?: number;
}

export interface CunRecipe {
  readonly version: 1;
  readonly generator: 'ink-cun-guides-v1';
  readonly strokes: readonly CunStrokeSource[];
  readonly options: CunProgramOptions;
}

export interface CunDocument {
  readonly version: 1;
  readonly recipe: CunRecipe;
  readonly result: InkScene;
}

export interface CunDocumentPatch {
  /** Replaces the whole authored stroke group. */
  readonly strokes?: readonly CunStrokeSource[];
  /** Shallow merge with the existing program settings. */
  readonly options?: Partial<CunProgramOptions>;
}

const GENERATOR = 'ink-cun-guides-v1';
const programFields = new Set(['technique', 'width', 'height', 'seed', 'background', 'ink', 'strokeWidth', 'dryness', 'opacity', 'strength']);
const strokeFields = new Set(['id', 'points', 'options']);
const strokeOptionFields = new Set(['width', 'opacity', 'dryness', 'smoothing', 'clip', 'start', 'duration',
  'axis', 'entry', 'finish', 'pressureProfile', 'turn', 'rhythm', 'drag', 'strength', 'controls']);
const pointFields = new Set(['x', 'y', 'pressure']);
const clipFields = new Set(['x', 'y']);
const controlFields = new Set(['at', 'pressure', 'side', 'angle', 'dryness', 'inkLoad']);
const defaults = {
  pima: { width: 6, dryness: .48, opacity: .74 },
  axe: { width: 26, dryness: .55, opacity: .84 },
  zhedai: { width: 13, dryness: .60, opacity: .75 },
  jiesuo: { width: 5, dryness: .52, opacity: .76 },
  luanchai: { width: 7, dryness: .66, opacity: .76 },
  niumao: { width: 3, dryness: .45, opacity: .66 },
  'cloud-study': { width: 6, dryness: .55, opacity: .74 },
  'point-study': { width: 10, dryness: .48, opacity: .80 },
  heye: { width: 7, dryness: .50, opacity: .76 },
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
function text(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
  return value;
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
function validateProgram(options: CunProgramOptions): void {
  fields(options, programFields, 'cun option');
  if (!['pima', 'axe', 'zhedai', 'jiesuo', 'luanchai', 'niumao', 'cloud-study', 'point-study', 'heye'].includes(options.technique)) {
    throw new RangeError('Unsupported cun technique');
  }
  positive(options.width, 'width'); positive(options.height, 'height');
  if (options.seed !== undefined && !Number.isSafeInteger(finite(options.seed, 'seed'))) throw new RangeError('seed must be a safe integer');
  for (const key of ['background', 'ink'] as const) if (options[key] !== undefined) colour(options[key], key);
  if (options.strokeWidth !== undefined) positive(options.strokeWidth, 'strokeWidth');
  for (const key of ['dryness', 'opacity', 'strength'] as const) if (options[key] !== undefined) unit(options[key], key);
}
function validateSource(source: CunStrokeSource): void {
  fields(source, strokeFields, 'cun stroke'); text(source.id, 'cun stroke.id');
  if (!Array.isArray(source.points) || source.points.length < 2 || source.points.length > 4096) {
    throw new RangeError('A cun source path supports 2..4096 points');
  }
  for (const point of source.points) {
    fields(point, pointFields, 'cun point'); finite(point.x, 'point.x'); finite(point.y, 'point.y');
    if (point.pressure !== undefined) unit(point.pressure, 'point.pressure');
  }
  if (source.options === undefined) return;
  fields(source.options, strokeOptionFields, 'cun stroke option');
  if (source.options.clip !== undefined) {
    if (!Array.isArray(source.options.clip) || source.options.clip.length > 4096) throw new RangeError('cun stroke clip supports at most 4096 points');
    for (const point of source.options.clip) fields(point, clipFields, 'cun clip point');
  }
  if (source.options.controls !== undefined) {
    if (!Array.isArray(source.options.controls)) throw new TypeError('cun controls must be an array');
    for (const control of source.options.controls) fields(control, controlFields, 'cun control');
  }
}

function foldedControls(points: readonly InkPoint[]): readonly BrushControl[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const total = distances.at(-1)!;
  const controls = new Map<number, BrushControl>([
    [0, { at: 0, pressure: .72, side: .70, angle: Math.PI / 2 }],
    [1, { at: 1, pressure: .26, side: .55, angle: Math.PI / 2 }],
  ]);
  let counted = 0;
  for (let i = 1; i < points.length - 1 && counted < 42; i++) {
    const a = points[i - 1]!, b = points[i]!, c = points[i + 1]!;
    const before = distances[i]! - distances[i - 1]!, after = distances[i + 1]! - distances[i]!;
    if (!(before > 0 && after > 0 && total > 0 && Number.isFinite(total))) continue;
    const dot = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / before / after;
    if (dot > .94 || dot < -.96) continue;
    const at = distances[i]! / total, reach = Math.min(before / total * .22, after / total * .22, .035);
    controls.set(at - reach, { at: at - reach, pressure: .54, side: .42, angle: Math.PI * .38 });
    controls.set(at, { at, pressure: .94, side: .88, angle: Math.PI * .60 });
    controls.set(at + reach, { at: at + reach, pressure: .72, side: .70, angle: Math.PI / 2 });
    counted++;
  }
  return [...controls.values()].sort((a, b) => a.at - b.at);
}

function contactPreset(technique: CunTechnique, points: readonly InkPoint[]): CunStrokeOptions {
  if (technique === 'pima') return {
    axis: 'center', smoothing: 'catmull-rom', turn: 'preserve', finish: 'open',
    controls: [{ at: 0, pressure: .45, side: .10, angle: 1.2 },
      { at: .15, pressure: .96, side: .18, angle: 1.35 },
      { at: .56, pressure: .73, side: .26, angle: 1.55 },
      { at: 1, pressure: .20, side: .10, angle: 1.4 }],
  };
  if (technique === 'axe') return {
    axis: 'side', smoothing: 'linear', turn: 'angular', finish: 'open',
    controls: [{ at: 0, pressure: 1, side: .95, angle: 1.3 },
      { at: .18, pressure: 1, side: 1, angle: 1.4 },
      { at: .62, pressure: .65, side: .84, angle: 1.8 },
      { at: 1, pressure: .03, side: .50, angle: 1.55 }],
  };
  if (technique === 'jiesuo') return {
    // Curvature, crossings and density are in the caller's authored guides.
    axis: 'center', smoothing: 'catmull-rom', turn: 'preserve', finish: 'open',
    controls: [{ at: 0, pressure: .62, side: .06, angle: 1.4 },
      { at: .20, pressure: .92, side: .14, angle: 1.55 },
      { at: .48, pressure: .55, side: .10, angle: 1.4 },
      { at: .76, pressure: .84, side: .18, angle: 1.6 },
      { at: 1, pressure: .24, side: .06, angle: 1.45 }],
  };
  if (technique === 'luanchai') return {
    // Angular geometry keeps the author's straight/folded directions readable.
    axis: 'center', smoothing: 'linear', turn: 'angular', finish: 'open',
    controls: [{ at: 0, pressure: .78, side: .12, angle: 1.45 },
      { at: .18, pressure: 1, side: .30, angle: 1.25 },
      { at: .46, pressure: .62, side: .08, angle: 1.5 },
      { at: .72, pressure: .94, side: .32, angle: 1.75 },
      { at: 1, pressure: .17, side: .04, angle: 1.5 }],
  };
  if (technique === 'niumao') return {
    // A fine-line contact study, without an inferred historical wrist sequence.
    axis: 'center', smoothing: 'catmull-rom', turn: 'preserve', finish: 'open',
    controls: [{ at: 0, pressure: .32, side: .03, angle: 1.5 },
      { at: .26, pressure: .74, side: .08, angle: 1.4 },
      { at: .64, pressure: .56, side: .12, angle: 1.6 },
      { at: 1, pressure: .18, side: .03, angle: 1.45 }],
  };
  if (technique === 'cloud-study') return {
    // Shared morphology study: the caller supplies open curves, faces and overlap order.
    axis: 'center', smoothing: 'catmull-rom', turn: 'preserve', finish: 'open',
    controls: [{ at: 0, pressure: .48, side: .12, angle: 1.45 },
      { at: .24, pressure: .86, side: .26, angle: 1.3 },
      { at: .52, pressure: .68, side: .44, angle: 1.75 },
      { at: .78, pressure: .83, side: .20, angle: 1.5 },
      { at: 1, pressure: .16, side: .08, angle: 1.4 }],
  };
  if (technique === 'point-study') return {
    // Contact phases on an authored short path, not a scatterer or a fixed bean stamp.
    axis: 'center', smoothing: 'catmull-rom', turn: 'preserve', finish: 'open',
    controls: [{ at: 0, pressure: .18, side: .04, angle: 1.5 },
      { at: .28, pressure: .72, side: .18, angle: 1.4 },
      { at: .54, pressure: 1, side: .34, angle: 1.6 },
      { at: .78, pressure: .70, side: .18, angle: 1.55 },
      { at: 1, pressure: .10, side: .04, angle: 1.5 }],
  };
  if (technique === 'heye') return {
    // Branches are independent authored paths; this preset creates no parent/child topology.
    axis: 'center', smoothing: 'catmull-rom', turn: 'preserve', finish: 'open',
    controls: [{ at: 0, pressure: 1, side: .18, angle: 1.35 },
      { at: .22, pressure: .90, side: .22, angle: 1.45 },
      { at: .55, pressure: .65, side: .16, angle: 1.5 },
      { at: .82, pressure: .36, side: .08, angle: 1.6 },
      { at: 1, pressure: .08, side: .03, angle: 1.45 }],
  };
  return { axis: 'side', smoothing: 'linear', turn: 'angular', finish: 'preserve', controls: foldedControls(points) };
}

/**
 * Executes one explicit group of caller-organized texture strokes. The technique
 * names scope contact/gesture approximations; placement, crossings and object
 * structure remain authored data, never uniform random region filling.
 */
export function createCunDocument(strokes: readonly CunStrokeSource[], options: CunProgramOptions): CunDocument {
  validateProgram(options);
  if (!Array.isArray(strokes) || strokes.length > 512) throw new RangeError('Cun documents support at most 512 source strokes');
  const builder = createInkScene({ width: options.width, height: options.height, seed: options.seed ?? 1,
    background: colour(options.background ?? '#f5f2e9', 'background') });
  const scene = builder.snapshot(), ids = new Set<string>();
  const authored: CunStrokeSource[] = [];
  for (const source of strokes) {
    validateSource(source);
    if (ids.has(source.id)) throw new RangeError(`Duplicate cun stroke id: ${source.id}`);
    ids.add(source.id);
    const preset = defaults[options.technique];
    const overrides = Object.fromEntries(Object.entries(source.options ?? {}).filter(([, value]) => value !== undefined)) as CunStrokeOptions;
    const brush = createBrushDocument(source.points, {
      ...contactPreset(options.technique, source.points),
      width: options.strokeWidth ?? preset.width, dryness: options.dryness ?? preset.dryness,
      opacity: options.opacity ?? preset.opacity, strength: options.strength ?? 1,
      ...overrides, id: source.id, seed: (scene.seed ^ hashText(source.id)) >>> 0,
      ink: colour(options.ink ?? '#20251f', 'ink'), gestureModel: 'local-v1',
    });
    const sparse: Record<string, unknown> = {};
    for (const key of Object.keys(source.options ?? {})) {
      if ((source.options as Record<string, unknown>)[key] !== undefined) sparse[key] = (brush.recipe.options as unknown as Record<string, unknown>)[key];
    }
    authored.push(Object.freeze({ id: source.id, points: brush.recipe.points,
      ...(source.options === undefined ? {} : { options: Object.freeze(sparse) as CunStrokeOptions }) }));
    builder.stroke(brush.result.points, brush.result);
  }
  const sparseOptions = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, key === 'ink' || key === 'background' ? colour(value as string, key) : value])) as unknown as CunProgramOptions;
  const recipe: CunRecipe = Object.freeze({ version: 1, generator: GENERATOR,
    strokes: Object.freeze(authored), options: Object.freeze(sparseOptions) });
  return Object.freeze({ version: 1, recipe, result: builder.snapshot() });
}

function assertRecipe(recipe: CunRecipe): void {
  if (!recipe || recipe.version !== 1) throw new RangeError('Unsupported cun recipe version');
  fields(recipe, new Set(['version', 'generator', 'strokes', 'options']), 'cun recipe');
  if (recipe.generator !== GENERATOR) throw new RangeError('Unsupported cun generator');
}

export function compileCunRecipe(recipe: CunRecipe): InkScene {
  assertRecipe(recipe);
  return createCunDocument(recipe.strokes, recipe.options).result;
}

export function reviseCunDocument(document: CunDocument, patch: CunDocumentPatch): CunDocument {
  if (!document || document.version !== 1) throw new RangeError('Unsupported cun document version');
  fields(document, new Set(['version', 'recipe', 'result']), 'cun document');
  assertRecipe(document.recipe);
  fields(patch, new Set(['strokes', 'options']), 'cun patch');
  if (patch.options !== undefined) fields(patch.options, programFields, 'cun option');
  return createCunDocument(patch.strokes === undefined ? document.recipe.strokes : patch.strokes,
    { ...document.recipe.options, ...patch.options });
}
