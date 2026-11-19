import { createBrushDocument } from './brush-document.js';
import type { BrushDocument, BrushProgramOptions } from './brush-document.js';
import { copyStrokeBrush } from './brush-state.js';
import type { BrushControl, InkPoint, StrokeMark } from './types.js';

/** Directional contact studies, rather than complete traditional dot techniques. */
export type DotPointShape = 'round' | 'horizontal' | 'vertical' | 'oblique';

/** One caller-positioned contact; its coordinates anchor the start of the tip path. */
export interface DotPlacement extends InkPoint {
  /** Stable IDs keep a dot's material seed when placements move or reorder. */
  readonly id?: string;
  readonly shape?: DotPointShape;
  readonly size?: number;
  /** Rotation in radians, added to the shape heading and program angle. */
  readonly angle?: number;
  /** Replaces program controls for this dot, including when the array is empty. */
  readonly controls?: readonly BrushControl[];
  /** Overrides the index-based absolute start time. */
  readonly start?: number;
}

export interface DotProgramOptions extends Omit<BrushProgramOptions, 'id' | 'width' | 'gestureModel' | 'smoothing'> {
  readonly shape?: DotPointShape;
  readonly size?: number;
  readonly angle?: number;
  readonly idPrefix?: string;
  /** Seconds between dot starts; default 0. */
  readonly interval?: number;
}

export interface DotRecipe {
  readonly version: 1;
  readonly generator: 'ink-dot-contact-v1';
  /** Sparse authored placements; no hidden scattering or group templates. */
  readonly positions: readonly DotPlacement[];
  readonly options: DotProgramOptions;
}

export interface DotDocument {
  readonly version: 1;
  readonly recipe: DotRecipe;
  readonly result: readonly StrokeMark[];
  /** Per-dot brush source remains available for further editing and inspection. */
  readonly documents: readonly BrushDocument[];
}

export interface DotDocumentPatch {
  /** Replaces all placements; omitted preserves their original sparse intent. */
  readonly positions?: readonly DotPlacement[];
  /** Shallow merge; supplied control arrays replace previous arrays. */
  readonly options?: Partial<DotProgramOptions>;
}

type CanonicalOptions = DotProgramOptions & Required<Pick<DotProgramOptions,
  'shape' | 'size' | 'angle' | 'idPrefix' | 'interval' | 'seed' | 'start'>>;

const GENERATOR = 'ink-dot-contact-v1';
const MAX_DOTS = 2048;
const supportedOptions = new Set([
  'shape', 'size', 'angle', 'idPrefix', 'interval', 'ink', 'opacity', 'dryness', 'seed', 'clip', 'start', 'duration',
  'axis', 'entry', 'finish', 'pressureProfile', 'turn', 'rhythm', 'drag', 'strength', 'controls',
]);
const supportedPlacement = new Set(['x', 'y', 'pressure', 'id', 'shape', 'size', 'angle', 'controls', 'start']);
const supportedControl = new Set(['at', 'pressure', 'side', 'angle', 'dryness', 'inkLoad']);

function objectFields(value: object, fields: ReadonlySet<string>, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new RangeError(`Unsupported ${name} field: ${key}`);
  }
}

function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function positive(value: number, name: string): number {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function nonnegative(value: number, name: string): number {
  finite(value, name);
  if (value < 0) throw new RangeError(`${name} must be nonnegative`);
  return value;
}

function text(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}

function shape(value: DotPointShape): DotPointShape {
  if (!['round', 'horizontal', 'vertical', 'oblique'].includes(value)) {
    throw new RangeError('Dot shape must be round, horizontal, vertical or oblique');
  }
  return value;
}

function copyControls(controls: readonly BrushControl[]): readonly BrushControl[] {
  if (!Array.isArray(controls)) throw new TypeError('Dot controls must be an array');
  for (const control of controls) objectFields(control, supportedControl, 'dot control');
  return copyStrokeBrush({ version: 1, controls }).controls;
}

function assertOptions(options: DotProgramOptions): void {
  objectFields(options, supportedOptions, 'dot program option');
  if (options.shape !== undefined) shape(options.shape);
  if (options.size !== undefined) positive(options.size, 'size');
  if (options.angle !== undefined) finite(options.angle, 'angle');
  if (options.interval !== undefined) nonnegative(options.interval, 'interval');
  if (options.idPrefix !== undefined) text(options.idPrefix, 'idPrefix');
  if (options.controls !== undefined) copyControls(options.controls);
}

function canonicalOptions(options: DotProgramOptions): CanonicalOptions {
  assertOptions(options);
  const { shape: pointShape = 'round', size = 24, angle = 0, idPrefix = 'dot', interval = 0, ...brush } = options;
  // A probe delegates every shared style, gesture, clip and timing check to the
  // brush API. This validates even empty groups and owns all nested source data.
  const probe = createBrushDocument([{ x: 0, y: 0, pressure: 0 }, { x: 10, y: 0, pressure: 1 }, { x: 20, y: 0, pressure: 0 }], {
    ...brush, id: 'dot-validation', width: size, seed: options.seed ?? 1,
    gestureModel: 'local-v1', smoothing: 'catmull-rom',
  });
  const { id: _id, width: _width, gestureModel: _model, smoothing: _smoothing, ...shared } = probe.recipe.options;
  return Object.freeze({
    ...shared, shape: pointShape, size, angle, idPrefix, interval,
    seed: probe.result.seed, start: probe.result.start,
  });
}

function copyPlacements(positions: readonly DotPlacement[]): readonly DotPlacement[] {
  if (!Array.isArray(positions) || positions.length > MAX_DOTS) throw new RangeError('A dot document supports an array of at most 2048 positions');
  return Object.freeze(positions.map((position, index) => {
    objectFields(position, supportedPlacement, 'dot placement');
    const name = `positions[${index}]`;
    const copy: DotPlacement = {
      x: finite(position.x, `${name}.x`), y: finite(position.y, `${name}.y`),
      ...(position.pressure === undefined ? {} : { pressure: finite(position.pressure, `${name}.pressure`) }),
      ...(position.id === undefined ? {} : { id: text(position.id, `${name}.id`) }),
      ...(position.shape === undefined ? {} : { shape: shape(position.shape) }),
      ...(position.size === undefined ? {} : { size: positive(position.size, `${name}.size`) }),
      ...(position.angle === undefined ? {} : { angle: finite(position.angle, `${name}.angle`) }),
      ...(position.start === undefined ? {} : { start: nonnegative(position.start, `${name}.start`) }),
      ...(position.controls === undefined ? {} : { controls: copyControls(position.controls) }),
    };
    if (copy.pressure !== undefined && (copy.pressure < 0 || copy.pressure > 1)) throw new RangeError(`${name}.pressure must be in 0..1`);
    return Object.freeze(copy);
  }));
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

const proportions = {
  // A broad, short contact needs a shallow tip bend: tighter turns make its
  // offset edge fold back and leave artificial concentric fiber bands.
  round: { length: .44, width: 1, heading: 0, bend: .004 },
  horizontal: { length: 1.38, width: .60, heading: 0, bend: .055 },
  vertical: { length: 1.38, width: .60, heading: Math.PI / 2, bend: .055 },
  oblique: { length: 1.18, width: .68, heading: -Math.PI / 3, bend: .075 },
} as const;

function createContact(position: DotPlacement, options: CanonicalOptions, index: number): BrushDocument {
  const pointShape = position.shape ?? options.shape, size = position.size ?? options.size;
  const geometry = proportions[pointShape], angle = geometry.heading + options.angle + (position.angle ?? 0);
  finite(angle, 'Combined dot angle');
  const cos = Math.cos(angle), sin = Math.sin(angle), pressure = position.pressure ?? 1;
  const path = [
    { along: 0, across: 0, pressure: 0 },
    { along: .28, across: geometry.bend, pressure: 1 },
    { along: .70, across: geometry.bend * .45, pressure: .78 },
    { along: 1, across: 0, pressure: 0 },
  ].map(point => {
    const x = point.along * geometry.length * size, y = point.across * size;
    return { x: position.x + x * cos - y * sin, y: position.y + x * sin + y * cos, pressure: point.pressure * pressure };
  });
  const { shape: _shape, size: _size, angle: _angle, idPrefix, interval, ...shared } = options;
  const id = position.id ?? `${idPrefix}-${index + 1}`;
  const start = position.start ?? options.start + index * interval;
  return createBrushDocument(path, {
    ...shared, id, width: size * geometry.width, seed: (options.seed ^ hashId(id)) >>> 0,
    gestureModel: 'local-v1', smoothing: 'catmull-rom', start,
    ...(position.controls === undefined ? {} : { controls: position.controls }),
  });
}

/**
 * Builds one press-and-lift contact per supplied position. Geometry is independent
 * of the material seed unless seeded rhythm/drag gestures are explicitly selected.
 * Shape headings are 0, 0, PI/2 and -PI/3 for round/horizontal/vertical/oblique.
 */
export function createDotDocument(positions: readonly DotPlacement[], options: DotProgramOptions = {}): DotDocument {
  const canonical = canonicalOptions(options), owned = copyPlacements(positions);
  const ids = new Set<string>();
  for (const [index, position] of owned.entries()) {
    const id = position.id ?? `${canonical.idPrefix}-${index + 1}`;
    if (ids.has(id)) throw new RangeError(`Duplicate dot id: ${id}`);
    ids.add(id);
  }
  const documents = Object.freeze(owned.map((position, index) => createContact(position, canonical, index)));
  const recipe: DotRecipe = Object.freeze({ version: 1, generator: GENERATOR, positions: owned, options: canonical });
  return Object.freeze({ version: 1, recipe, documents, result: Object.freeze(documents.map(document => document.result)) });
}

function assertRecipe(recipe: DotRecipe): void {
  if (!recipe || typeof recipe !== 'object' || recipe.version !== 1) throw new RangeError('Unsupported dot recipe version');
  objectFields(recipe, new Set(['version', 'generator', 'positions', 'options']), 'dot recipe');
  if (recipe.generator !== GENERATOR) throw new RangeError('Unsupported dot generator version');
  // Saved recipes always have an options object, even for an empty group.
  assertOptions(recipe.options);
}

/** Replays source after a JSON round trip; saved playback data is unnecessary. */
export function compileDotRecipe(recipe: DotRecipe): readonly StrokeMark[] {
  assertRecipe(recipe);
  return createDotDocument(recipe.positions, recipe.options).result;
}

/** Rebuilds from editable placements; never reverse-engineers the stored marks. */
export function reviseDotDocument(document: DotDocument, patch: DotDocumentPatch): DotDocument {
  if (!document || typeof document !== 'object' || document.version !== 1) throw new RangeError('Unsupported dot document version');
  objectFields(document, new Set(['version', 'recipe', 'result', 'documents']), 'dot document');
  assertRecipe(document.recipe);
  objectFields(patch, new Set(['positions', 'options']), 'dot document patch');
  if (patch.options !== undefined) assertOptions(patch.options);
  return createDotDocument(patch.positions === undefined ? document.recipe.positions : patch.positions,
    { ...document.recipe.options, ...patch.options });
}
