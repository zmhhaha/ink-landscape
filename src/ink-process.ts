import { createBrushDocument } from './brush-document.js';
import type { BrushProgramOptions } from './brush-document.js';
import { sampleBrushContact } from './brush-contact.js';
import type { BrushContactSample } from './brush-contact.js';
import { createInkScene } from './core.js';
import type { InkPoint, StrokeMark, Vec2 } from './types.js';
import { accumulateEdge, getFractalNoise2D } from './natural.js';

/** Stroke time belongs to its layer; pigment colour belongs to the process. */
export interface InkStrokeSource {
  readonly points: readonly InkPoint[];
  readonly options?: Omit<BrushProgramOptions, 'start' | 'duration' | 'ink'>;
}

export interface InkLayerSource {
  readonly id: string;
  readonly strokes: readonly InkStrokeSource[];
  /** Optical pigment amount, independent of contact coverage and water. */
  readonly concentration?: number;
  /** Authored wet-contact amount; not a measured physical reservoir. */
  readonly water?: number;
  /** Absolute, instantaneous whole-layer deposition time in seconds. */
  readonly at?: number;
  /** Authored wet window in seconds after deposition, not measured drying. */
  readonly dryAfter?: number;
  readonly mode?: 'glaze' | 'wet-mix';
  /** Opt-in inward contact feather, 0..1; omitted/0 preserves legacy coverage. */
  readonly edgeSoftness?: number;
  /** Opt-in redistribution toward a broken inner margin, preserving layer mass. */
  readonly edgeDeposit?: number;
  /** Edge band as a fraction of local contact radius, 0..1; default .22. */
  readonly edgeWidth?: number;
}

export interface InkProcessOptions {
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  /** A six-digit hex colour. */
  readonly background?: string;
  /** One six-digit hex pigment colour for the complete process. */
  readonly ink?: string;
}

export interface InkProcessLayer {
  readonly id: string;
  readonly marks: readonly StrokeMark[];
  readonly concentration: number;
  readonly water: number;
  readonly at: number;
  readonly dryAfter: number;
  readonly mode: 'glaze' | 'wet-mix';
  readonly edgeSoftness?: number;
  readonly edgeDeposit?: number;
  readonly edgeWidth?: number;
}

/** Serializable compiled program; raster density is derived, never its source. */
export interface InkProcess {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly background: string;
  readonly ink: string;
  readonly layers: readonly InkProcessLayer[];
}

export interface InkProcessRecipe {
  readonly version: 1;
  readonly generator: 'ink-layer-process-v1';
  readonly layers: readonly InkLayerSource[];
  readonly options: InkProcessOptions;
}

export interface InkProcessDocument {
  readonly version: 1;
  readonly recipe: InkProcessRecipe;
  readonly result: InkProcess;
}

export interface InkProcessDocumentPatch {
  /** Replaces the complete authored layer collection. */
  readonly layers?: readonly InkLayerSource[];
  /** Shallow merge with the existing options. */
  readonly options?: Partial<InkProcessOptions>;
}

export interface InkProcessRasterOptions {
  /** Omitted includes all layers; negative finite time is a blank prelude. */
  readonly time?: number;
  /** Scene units per raster cell; default 2, at most 262144 cells. */
  readonly cellSize?: number;
}

export interface InkPigmentFrame {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
  /** Optical depth; transmittance is exp(-density). Owned by this frame. */
  readonly density: Float32Array;
  readonly activeLayers: number;
  /** Number of layer events with a nonempty, still-wet interaction region. */
  readonly interactions: number;
}

const GENERATOR = 'ink-layer-process-v1';
const MAX_LAYERS = 32;
const MAX_STROKES = 512;
const MAX_SOURCE_POINTS = 4096;
const MAX_CELLS = 262144;
const layerFields = new Set(['id', 'strokes', 'concentration', 'water', 'at', 'dryAfter', 'mode', 'edgeSoftness', 'edgeDeposit', 'edgeWidth']);
const strokeFields = new Set(['points', 'options']);
const strokeOptionFields = new Set(['id', 'width', 'opacity', 'dryness', 'smoothing', 'seed', 'clip',
  'axis', 'entry', 'finish', 'pressureProfile', 'turn', 'rhythm', 'drag', 'strength', 'controls', 'gestureModel']);
const processOptionFields = new Set(['width', 'height', 'seed', 'background', 'ink']);
const pointFields = new Set(['x', 'y', 'pressure']);
const vectorFields = new Set(['x', 'y']);
const controlFields = new Set(['at', 'pressure', 'side', 'angle', 'dryness', 'inkLoad']);
const resultLayerFields = new Set(['id', 'marks', 'concentration', 'water', 'at', 'dryAfter', 'mode', 'edgeSoftness', 'edgeDeposit', 'edgeWidth']);
const markFields = new Set(['kind', 'id', 'points', 'width', 'ink', 'opacity', 'dryness', 'nib', 'smoothing',
  'tipAngle', 'seed', 'clip', 'start', 'duration', 'brush']);
type CanonicalOptions = Required<InkProcessOptions>;

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
function fields(value: object, allowed: ReadonlySet<string>, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new RangeError(`Unsupported ${name} field: ${key}`);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function nonnegative(value: number, name: string): number {
  if (finite(value, name) < 0) throw new RangeError(`${name} must be nonnegative`);
  return value;
}
function unit(value: number, name: string): number {
  finite(value, name);
  if (value < 0 || value > 1) throw new RangeError(`${name} must be in 0..1`);
  return value;
}
function identifier(value: string, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}
function seedValue(value: number): number {
  finite(value, 'seed');
  if (!Number.isSafeInteger(value)) throw new RangeError('seed must be a safe integer');
  return value >>> 0;
}
function colour(value: string, name: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError(`${name} must be a #RRGGBB colour`);
  return value.toLowerCase();
}
function mode(value: InkProcessLayer['mode']): InkProcessLayer['mode'] {
  if (value !== 'glaze' && value !== 'wet-mix') throw new RangeError('Unknown ink layer mode');
  return value;
}
function hashText(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
function hash(seed: number, a: number, b: number): number {
  let value = ((seed | 0) ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}
function noise(seed: number, along: number, across: number): number {
  const x = Math.floor(along), y = Math.floor(across), a = along - x, b = across - y;
  const u = a * a * (3 - 2 * a), v = b * b * (3 - 2 * b);
  return (hash(seed, x, y) * (1 - u) + hash(seed, x + 1, y) * u) * (1 - v)
    + (hash(seed, x, y + 1) * (1 - u) + hash(seed, x + 1, y + 1) * u) * v;
}

function canonicalOptions(options: InkProcessOptions): CanonicalOptions {
  fields(options, processOptionFields, 'ink process option');
  return Object.freeze({
    width: positive(options.width, 'width'), height: positive(options.height, 'height'),
    seed: seedValue(options.seed ?? 1), background: colour(options.background ?? '#f5f2e9', 'background'),
    ink: colour(options.ink ?? '#20251f', 'ink'),
  });
}
function validateStrokeSource(source: InkStrokeSource): void {
  fields(source, strokeFields, 'ink stroke source');
  if (!Array.isArray(source.points) || source.points.length > MAX_SOURCE_POINTS) throw new RangeError('Ink stroke sources support at most 4096 points');
  for (const point of source.points) fields(point, pointFields, 'ink stroke point');
  if (source.options !== undefined) {
    fields(source.options, strokeOptionFields, 'ink stroke option');
    if (source.options.controls !== undefined) {
      if (!Array.isArray(source.options.controls)) throw new TypeError('controls must be an array');
      for (const control of source.options.controls) fields(control, controlFields, 'ink stroke control');
    }
    if (source.options.clip !== undefined) {
      if (!Array.isArray(source.options.clip)) throw new TypeError('clip must be an array');
      for (const point of source.options.clip) fields(point, vectorFields, 'ink stroke clip point');
    }
  }
}
function layerState(source: Omit<InkLayerSource, 'strokes'>): Omit<InkProcessLayer, 'marks'> {
  return {
    id: identifier(source.id, 'layer.id'), concentration: unit(source.concentration ?? .5, 'layer.concentration'),
    water: unit(source.water ?? .5, 'layer.water'), at: nonnegative(source.at ?? 0, 'layer.at'),
    dryAfter: nonnegative(source.dryAfter ?? 2, 'layer.dryAfter'), mode: mode(source.mode ?? 'glaze'),
    ...(source.edgeSoftness === undefined ? {} : { edgeSoftness: unit(source.edgeSoftness, 'layer.edgeSoftness') }),
    ...(source.edgeDeposit === undefined ? {} : { edgeDeposit: unit(source.edgeDeposit, 'layer.edgeDeposit') }),
    ...(source.edgeWidth === undefined ? {} : { edgeWidth: unit(source.edgeWidth, 'layer.edgeWidth') }),
  };
}
function copySourceOptions(source: InkStrokeSource, canonical: BrushProgramOptions): InkStrokeSource['options'] {
  if (source.options === undefined) return undefined;
  const owned: Record<string, unknown> = {};
  for (const key of Object.keys(source.options) as (keyof NonNullable<InkStrokeSource['options']>)[]) {
    const value = source.options[key];
    // Undefined fields have no authored meaning and must not get materialized.
    if (value !== undefined) owned[key] = key === 'id' ? value : canonical[key];
  }
  return Object.freeze(owned) as NonNullable<InkStrokeSource['options']>;
}

/** Compiles editable paths and finite layer events without a browser. */
export function createInkProcessDocument(layers: readonly InkLayerSource[], options: InkProcessOptions): InkProcessDocument {
  const canonical = canonicalOptions(options);
  if (!Array.isArray(layers) || layers.length > MAX_LAYERS) throw new RangeError('Ink processes support at most 32 layers');
  const ids = new Set<string>(), markIds = new Set<string>();
  let count = 0, previousTime = -1;
  const authored: InkLayerSource[] = [], compiled: InkProcessLayer[] = [];
  for (const source of layers) {
    fields(source, layerFields, 'ink layer source');
    const state = layerState(source);
    if (ids.has(state.id)) throw new RangeError(`Duplicate ink layer id: ${state.id}`);
    ids.add(state.id);
    if (state.at < previousTime) throw new RangeError('Ink layer times must be nondecreasing');
    previousTime = state.at;
    if (!Array.isArray(source.strokes) || (count += source.strokes.length) > MAX_STROKES) throw new RangeError('Ink processes support at most 512 strokes');
    const strokes: InkStrokeSource[] = [], marks: StrokeMark[] = [];
    for (const [index, stroke] of source.strokes.entries()) {
      validateStrokeSource(stroke);
      const localId = stroke.options?.id ?? `stroke-${index + 1}`, id = `${state.id}/${identifier(localId, 'stroke.id')}`;
      if (markIds.has(id)) throw new RangeError(`Duplicate ink stroke id: ${id}`);
      markIds.add(id);
      const document = createBrushDocument(stroke.points, {
        ...stroke.options, id, seed: stroke.options?.seed ?? (canonical.seed ^ hashText(id)) >>> 0,
        ink: canonical.ink, start: 0, duration: 0,
      });
      const ownedOptions = copySourceOptions(stroke, document.recipe.options);
      strokes.push(Object.freeze({ points: document.recipe.points, ...(ownedOptions === undefined ? {} : { options: ownedOptions }) }));
      marks.push(document.result);
    }
    const sparse: Record<string, unknown> = { id: state.id, strokes: Object.freeze(strokes) };
    for (const key of ['concentration', 'water', 'at', 'dryAfter', 'mode', 'edgeSoftness', 'edgeDeposit', 'edgeWidth'] as const) if (source[key] !== undefined) sparse[key] = state[key];
    authored.push(Object.freeze(sparse) as unknown as InkLayerSource);
    compiled.push(Object.freeze({ ...state, marks: Object.freeze(marks) }));
  }
  const result: InkProcess = Object.freeze({ version: 1, ...canonical, layers: Object.freeze(compiled) });
  const recipe: InkProcessRecipe = Object.freeze({ version: 1, generator: GENERATOR, layers: Object.freeze(authored), options: canonical });
  return Object.freeze({ version: 1, recipe, result });
}

function assertRecipe(recipe: InkProcessRecipe): void {
  if (!recipe || recipe.version !== 1) throw new RangeError('Unsupported ink process recipe version');
  fields(recipe, new Set(['version', 'generator', 'layers', 'options']), 'ink process recipe');
  if (recipe.generator !== GENERATOR) throw new RangeError('Unsupported ink process generator');
}
export function compileInkProcessRecipe(recipe: InkProcessRecipe): InkProcess {
  assertRecipe(recipe);
  return createInkProcessDocument(recipe.layers, recipe.options).result;
}
export function reviseInkProcessDocument(document: InkProcessDocument, patch: InkProcessDocumentPatch): InkProcessDocument {
  if (!document || document.version !== 1) throw new RangeError('Unsupported ink process document version');
  fields(document, new Set(['version', 'recipe', 'result']), 'ink process document');
  assertRecipe(document.recipe);
  fields(patch, new Set(['layers', 'options']), 'ink process patch');
  if (patch.options !== undefined) fields(patch.options, processOptionFields, 'ink process option');
  return createInkProcessDocument(patch.layers === undefined ? document.recipe.layers : patch.layers,
    { ...document.recipe.options, ...patch.options });
}

interface PaperField {
  readonly uptake: Float32Array;
  readonly horizontal: Float32Array;
  readonly vertical: Float32Array;
}
interface Masks {
  readonly columns: number;
  readonly rows: number;
  readonly layers: readonly Float32Array[];
  readonly wetLayers: readonly Float32Array[];
  readonly paper: PaperField;
}
const maskCache = new WeakMap<InkProcess, Map<number, Masks>>();
const validated = new WeakSet<InkProcess>();
function deeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(child => deeplyFrozen(child, seen));
}
function validateProcess(process: InkProcess): boolean {
  const immutable = deeplyFrozen(process);
  if (immutable && validated.has(process)) return true;
  if (!process || process.version !== 1) throw new RangeError('Unsupported ink process version');
  fields(process, new Set(['version', 'width', 'height', 'seed', 'background', 'ink', 'layers']), 'ink process');
  canonicalOptions({ width: process.width, height: process.height, seed: process.seed, background: process.background, ink: process.ink });
  seedValue(process.seed); colour(process.background, 'background'); colour(process.ink, 'ink');
  if (!Array.isArray(process.layers) || process.layers.length > MAX_LAYERS) throw new RangeError('Ink processes support at most 32 layers');
  const ids = new Set<string>(), markIds = new Set<string>();
  const scene = createInkScene({ width: 1, height: 1 });
  let previous = -1, count = 0;
  for (const layer of process.layers) {
    fields(layer, resultLayerFields, 'compiled ink layer');
    const state = {
      id: identifier(layer.id, 'layer.id'), concentration: unit(layer.concentration, 'layer.concentration'),
      water: unit(layer.water, 'layer.water'), at: nonnegative(layer.at, 'layer.at'),
      dryAfter: nonnegative(layer.dryAfter, 'layer.dryAfter'), mode: mode(layer.mode),
    };
    if (layer.edgeSoftness !== undefined) unit(layer.edgeSoftness, 'layer.edgeSoftness');
    if (layer.edgeDeposit !== undefined) unit(layer.edgeDeposit, 'layer.edgeDeposit');
    if (layer.edgeWidth !== undefined) unit(layer.edgeWidth, 'layer.edgeWidth');
    if (ids.has(state.id)) throw new RangeError(`Duplicate ink layer id: ${state.id}`);
    ids.add(state.id);
    if (state.at < previous) throw new RangeError('Ink layer times must be nondecreasing');
    previous = state.at;
    if (!Array.isArray(layer.marks) || (count += layer.marks.length) > MAX_STROKES) throw new RangeError('Ink processes support at most 512 strokes');
    for (const mark of layer.marks) {
      fields(mark, markFields, 'compiled ink stroke');
      if (mark.kind !== 'stroke' || mark.start !== 0 || mark.duration !== 0 || mark.ink !== process.ink) throw new RangeError('Compiled ink strokes must use process pigment and layer timing');
      identifier(mark.id, 'stroke.id'); positive(mark.width, 'stroke.width');
      unit(mark.opacity, 'stroke.opacity'); unit(mark.dryness, 'stroke.dryness');
      seedValue(mark.seed); finite(mark.tipAngle, 'stroke.tipAngle');
      if (mark.nib !== 'round' && mark.nib !== 'flat') throw new RangeError('Unknown compiled ink nib');
      if (markIds.has(mark.id)) throw new RangeError(`Duplicate ink stroke id: ${mark.id}`);
      markIds.add(mark.id);
      if (mark.brush !== undefined) {
        fields(mark.brush, new Set(['version', 'controls']), 'compiled ink brush');
        if (Array.isArray(mark.brush.controls)) for (const control of mark.brush.controls) fields(control, controlFields, 'compiled ink control');
      }
      scene.stroke(mark.points, mark);
    }
  }
  if (immutable) validated.add(process);
  return immutable;
}

function inside(x: number, y: number, polygon: readonly Vec2[]): boolean {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) contained = !contained;
  }
  return contained;
}
function rasterStroke(mark: StrokeMark, columns: number, rows: number, cellSize: number, paperSeed: number, edgeSoftness = 0, interior?: Float32Array): Float32Array {
  const result = new Float32Array(columns * rows);
  const nearest = new Float64Array(result.length); nearest.fill(Infinity);
  const marginAt = new Float64Array(result.length); marginAt.fill(-Infinity);
  const alongAt = new Float64Array(result.length), acrossAt = new Float64Array(result.length);
  const drynessAt = new Float32Array(result.length), loadAt = new Float32Array(result.length);
  const widthAt = new Float64Array(result.length), sideAt = new Float32Array(result.length);
  const samples = sampleBrushContact(mark);
  const segment = (a: BrushContactSample, b: BrushContactSample): void => {
    const dx = b.centerX - a.centerX, dy = b.centerY - a.centerY, lengthSquared = dx * dx + dy * dy;
    const reach = Math.max(a.halfWidth, b.halfWidth) + cellSize;
    if (!Number.isFinite(lengthSquared) || !Number.isFinite(reach)) throw new RangeError('Ink contact exceeds finite raster coordinates');
    if (a.halfWidth === 0 && b.halfWidth === 0) return;
    const x0 = Math.max(0, Math.floor((Math.min(a.centerX, b.centerX) - reach) / cellSize));
    const x1 = Math.min(columns - 1, Math.floor((Math.max(a.centerX, b.centerX) + reach) / cellSize));
    const y0 = Math.max(0, Math.floor((Math.min(a.centerY, b.centerY) - reach) / cellSize));
    const y1 = Math.min(rows - 1, Math.floor((Math.max(a.centerY, b.centerY) + reach) / cellSize));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + .5) * cellSize, py = (y + .5) * cellSize;
      if (mark.clip && !inside(px, py, mark.clip)) continue;
      const t = lengthSquared > 1e-16 ? clamp(((px - a.centerX) * dx + (py - a.centerY) * dy) / lengthSquared) : 0;
      const halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
      if (halfWidth <= 0) continue;
      const cx = a.centerX + dx * t, cy = a.centerY + dy * t, distance = Math.hypot(px - cx, py - cy);
      const edge = clamp((halfWidth - distance) / cellSize + .5);
      if (edge === 0) continue;
      const index = y * columns + x;
      // Union geometry only. Taking a maximum of material from every nearby
      // segment lets their round caps fill each other's dry strands.
      if (edge > result[index]!) result[index] = edge;
      marginAt[index] = Math.max(marginAt[index]!, halfWidth - distance);
      if (distance < nearest[index]!) {
        // Exact ties retain the earlier path segment deterministically.
        nearest[index] = distance;
        alongAt[index] = a.distance + (b.distance - a.distance) * t;
        const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t;
        acrossAt[index] = ((px - cx) * nx + (py - cy) * ny) / Math.max(1, mark.width);
        drynessAt[index] = a.dryness + (b.dryness - a.dryness) * t;
        loadAt[index] = a.inkLoad + (b.inkLoad - a.inkLoad) * t;
        widthAt[index] = halfWidth;
        sideAt[index] = a.side + (b.side - a.side) * t;
      }
    }
  };
  for (let i = 1; i < samples.length; i++) segment(samples[i - 1]!, samples[i]!);
  for (let i = 0; i < result.length; i++) {
    if (result[i] === 0) continue;
    const along = alongAt[i]!, across = acrossAt[i]!, dryness = drynessAt[i]!, load = loadAt[i]!;
    // Sample one coherent material coordinate per pixel, after geometry union.
    // Unequal longitudinal strands still follow the closest contact trajectory.
    const warp = noise(mark.seed ^ 0x7e95761e, along / Math.max(5, mark.width * .36), across * 4 + 13) - .5;
    const fibers = noise(mark.seed, along / Math.max(3, mark.width * .39), across * 27 + warp * 2.8 + 19);
    const shared = noise(mark.seed ^ 0x51ed270b, along / Math.max(6, mark.width), across * 5 + warp + 7);
    const threshold = .08 + dryness * .60 + (1 - load) * .38;
    const broken = clamp((fibers * .73 + shared * .27 - threshold) / .21);
    const solid = clamp(1 - dryness / .64);
    const px = (i % columns + .5) * cellSize, py = (Math.floor(i / columns) + .5) * cellSize;
    const paper = noise(paperSeed ^ 0x37582371, px * .29 + py * .09, py * .34);
    // Erode only the contact margin. The authored path and its clipping remain
    // untouched, while side contact puts the broken margin on its outer side.
    const roughSide = clamp(.5 + across * sideAt[i]! * 2.5);
    const erosion = Math.min(widthAt[i]! * .23, .35 + mark.width * .028)
      * (.10 + paper * .42 + shared * .48) * (.7 + roughSide * Math.abs(sideAt[i]!) * 1.8);
    const edge = Math.min(result[i]!, clamp((marginAt[i]! - erosion) / cellSize + .5));
    const body = .72 + .28 * noise(paperSeed ^ 0x13957823, px * .17, py * .23);
    result[i] = edge * load * mark.opacity * body * (solid + (1 - solid) * broken);
    if (interior && result[i]! > 0) interior[i] = Math.max(interior[i]!, clamp((marginAt[i]! - erosion) / Math.max(cellSize, widthAt[i]!)));
    if (edgeSoftness > 0) {
      // Feather inside the owned contact instead of blurring a final bitmap.
      // The same finite mask drives pigment and wet exchange; old layers retain
      // their original arithmetic. This reduces deposited mass near the edge.
      const reach = Math.max(cellSize, widthAt[i]!) * edgeSoftness * (.84 + paper * .32);
      const fade = clamp((marginAt[i]! - erosion) / reach);
      result[i] = result[i]! * fade * fade * (3 - 2 * fade);
    }
  }
  return result;
}
function prepareMasks(process: InkProcess, columns: number, rows: number, cellSize: number, immutable: boolean): Masks {
  const cached = immutable ? maskCache.get(process)?.get(cellSize) : undefined;
  if (cached) return cached;
  const layers = process.layers.map(layer => {
    const coverage = new Float32Array(columns * rows);
    const deposit = layer.edgeDeposit ?? 0, bandWidth = layer.edgeWidth ?? .22;
    const interior = deposit > 0 && bandWidth > 0 ? new Float32Array(coverage.length) : undefined;
    for (const mark of layer.marks) {
      const contact = rasterStroke(mark, columns, rows, cellSize, process.seed, layer.edgeSoftness ?? 0, interior);
      for (let i = 0; i < contact.length; i++) coverage[i] = coverage[i]! + contact[i]!;
    }
    if (interior) {
      const seed = process.seed ^ hashText(layer.id);
      const weights = new Float32Array(coverage.length);
      let mass = 0, weightedMass = 0;
      for (let i = 0; i < coverage.length; i++) {
        const contact = coverage[i]!;
        if (contact <= 0) continue;
        const x = (i % columns + .5) * cellSize, y = (Math.floor(i / columns) + .5) * cellSize;
        const field = getFractalNoise2D(x / 19 + 7.173, y / 23 + 11.317, seed, 3);
        const depth = clamp(interior[i]! / (.88 + field * .27));
        const gate = clamp(.48 + field * 1.1);
        weights[i] = 1 + deposit * 4 * accumulateEdge(depth, bandWidth) * gate;
        mass += contact; weightedMass += contact * weights[i]!;
      }
      // Redistribute authored layer coverage; neither a water event nor this
      // edge preference creates pigment. Fully overlapped interiors stay quiet.
      const normalization = weightedMass > 0 ? mass / weightedMass : 1;
      for (let i = 0; i < coverage.length; i++) if (coverage[i]! > 0) coverage[i] = coverage[i]! * weights[i]! * normalization;
    }
    return coverage;
  });
  const needsWetMaps = process.layers.some((layer, index) => layer.mode === 'wet-mix' && layer.water > 0
    && process.layers.slice(0, index).some(earlier => earlier.water > 0 && earlier.dryAfter > layer.at - earlier.at));
  const paper = needsWetMaps ? paperField(process.seed, columns, rows, cellSize)
    : { uptake: new Float32Array(0), horizontal: new Float32Array(0), vertical: new Float32Array(0) };
  const radius = Math.max(1, Math.min(8, Math.ceil(7 / cellSize)));
  const wetLayers = needsWetMaps ? layers.map(layer => spread(layer, columns, rows, radius, paper)) : [];
  const masks = { columns, rows, layers, wetLayers, paper };
  if (immutable) {
    let scales = maskCache.get(process);
    if (!scales) { scales = new Map(); maskCache.set(process, scales); }
    // Bound alternate resolutions retained for each immutable program.
    if (scales.size >= 2) scales.delete(scales.keys().next().value!);
    scales.set(cellSize, masks);
  }
  return masks;
}
function paperField(seed: number, columns: number, rows: number, cellSize: number): PaperField {
  const uptake = new Float32Array(columns * rows), horizontal = new Float32Array(uptake.length), vertical = new Float32Array(uptake.length);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const px = (x + .5) * cellSize, py = (y + .5) * cellSize, i = y * columns + x;
    const coarse = noise(seed ^ 0x6d2b79f5, px / 11, py / 11);
    const grain = noise(seed ^ 0x45d9f3b, px / 3.2 + py / 17, py / 4.7);
    uptake[i] = clamp((coarse * .65 + grain * .35 - .18) / .65);
    const angle = (noise(seed ^ 0x119de1f3, px / 43, py / 43) - .5) * Math.PI;
    horizontal[i] = .22 + .78 * Math.cos(angle) ** 2;
    vertical[i] = .22 + .78 * Math.sin(angle) ** 2;
  }
  return { uptake, horizontal, vertical };
}

function spread(mask: Float32Array, columns: number, rows: number, radius: number, paper: PaperField): Float32Array {
  const result = new Float32Array(mask.length);
  const stencil: { dx: number; dy: number; weight: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const distance = Math.hypot(dx, dy);
    if (distance < radius + .25) stencil.push({ dx, dy, weight: clamp((radius + .25 - distance) / Math.max(1, radius * .65)) });
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * columns + x;
    let maximum = clamp(mask[i]!);
    for (const { dx, dy, weight } of stencil) {
      const sx = x + dx, sy = y + dy;
      if (sx >= 0 && sx < columns && sy >= 0 && sy < rows) maximum = Math.max(maximum, mask[sy * columns + sx]! * weight);
    }
    // Local capillary reach varies with the same paper for every layer. The
    // tapered circular support avoids square dilation and uniform blur halos.
    result[i] = Math.max(clamp(mask[i]!), clamp(maximum) * (.22 + paper.uptake[i]! * .78));
  }
  return result;
}
function exchange(density: Float32Array, mobility: Float32Array, columns: number, rows: number, steps: number, paper: PaperField): void {
  const change = new Float64Array(density.length);
  const capacity = new Float32Array(density.length);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * columns + x, wet = mobility[i]!;
    let neighbour = wet;
    if (x > 0) neighbour = Math.max(neighbour, mobility[i - 1]!);
    if (x + 1 < columns) neighbour = Math.max(neighbour, mobility[i + 1]!);
    if (y > 0) neighbour = Math.max(neighbour, mobility[i - columns]!);
    if (y + 1 < rows) neighbour = Math.max(neighbour, mobility[i + columns]!);
    const front = neighbour > 0 ? clamp((neighbour - wet) / neighbour) : 0;
    // Uneven holding capacity retains some pigment at porous wet margins;
    // this is a bounded material approximation, not a measured drying solver.
    capacity[i] = .75 + paper.uptake[i]! * .75 + front * (.35 + paper.uptake[i]! * .55);
  }
  for (let step = 0; step < steps; step++) {
    change.fill(0);
    const pair = (a: number, b: number, alignment: Float32Array): void => {
      const conductance = Math.min(mobility[a]!, mobility[b]!) * .13 * (alignment[a]! + alignment[b]!) * .5;
      if (conductance <= 0) return;
      const flux = (density[a]! / capacity[a]! - density[b]! / capacity[b]!) * conductance;
      change[a] = change[a]! - flux;
      change[b] = change[b]! + flux;
    };
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const index = y * columns + x;
      if (x + 1 < columns) pair(index, index + 1, paper.horizontal);
      if (y + 1 < rows) pair(index, index + columns, paper.vertical);
    }
    // Each cell gives at most 4 * .13 / .75 of its pigment per step,
    // retaining positivity. Pair flux stays equal and opposite at every edge.
    for (let i = 0; i < density.length; i++) density[i] = density[i]! + change[i]!;
  }
}

/**
 * A finite event deposit, not an evaporation simulation. A bounded fraction of
 * existing wet pigment follows the outward wet-front gradient, then lodges at
 * only some porous margin segments. Every outgoing amount has one recipient;
 * no contour is painted and no pigment can be created by a clear-water event.
 */
function depositAtFront(density: Float32Array, mobility: Float32Array, front: Float32Array,
  columns: number, rows: number, cellSize: number, paper: PaperField, seed: number,
  marks: readonly StrokeMark[]): void {
  const reach = Math.max(1, Math.min(4, Math.round(3 / cellSize)));
  const horizontal = new Float32Array(density.length), vertical = new Float32Array(density.length);
  const release = new Float32Array(density.length);
  const directions = marks.flatMap(mark => mark.points.slice(1).flatMap((b, index) => {
    const a = mark.points[index]!, dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= cellSize * cellSize) return [];
    const length = Math.sqrt(lengthSquared);
    return [{ x: a.x, y: a.y, dx, dy, lengthSquared, ux: dx / length, uy: dy / length, reachSquared: (mark.width * .9 + 8) ** 2 }];
  }));
  const at = (x: number, y: number): number => front[Math.max(0, Math.min(rows - 1, y)) * columns + Math.max(0, Math.min(columns - 1, x))]!;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * columns + x, center = front[i]!;
    if (mobility[i]! <= 0 || center <= 0) continue;
    const left = at(x - reach, y), right = at(x + reach, y), up = at(x, y - reach), down = at(x, y + reach);
    const high = Math.max(center, left, right, up, down), low = Math.min(center, left, right, up, down);
    const margin = clamp(((high - low) / Math.max(.01, high) - .22) / .48);
    if (margin === 0) continue;
    const px = (x + .5) * cellSize, py = (y + .5) * cellSize;
    const gate = clamp((noise(seed ^ 0x7a4f27b1, px / 17 + py / 61, py / 13) * .72
      + noise(seed ^ 0x53e62bd3, px / 6, py / 8) * .28 - .47) / .25);
    if (gate === 0) continue;
    const dx = (left - right) * paper.horizontal[i]!, dy = (up - down) * paper.vertical[i]!;
    const magnitude = Math.abs(dx) + Math.abs(dy);
    if (magnitude <= 1e-8) continue;
    horizontal[i] = dx / magnitude;
    vertical[i] = dy / magnitude;
    let directionX = 0, directionY = 0, nearest = Infinity;
    for (const direction of directions) {
      const t = clamp(((px - direction.x) * direction.dx + (py - direction.y) * direction.dy) / direction.lengthSquared);
      const distanceSquared = (px - direction.x - direction.dx * t) ** 2 + (py - direction.y - direction.dy * t) ** 2;
      if (distanceSquared < nearest && distanceSquared < direction.reachSquared) {
        nearest = distanceSquared; directionX = direction.ux; directionY = direction.uy;
      }
    }
    const facing = .28 + .72 * clamp(.5 + (dx * directionX + dy * directionY) / magnitude);
    // Lower-water cells near this local front retain received pigment. Smooth
    // spatial gates leave breaks between deposits rather than a closed rim.
    const lodged = clamp((.58 - center / Math.max(.01, high)) / .30) * gate;
    release[i] = .22 * margin * gate * facing * (1 - lodged) * Math.sqrt(clamp(mobility[i]!));
  }
  const change = new Float64Array(density.length);
  const steps = Math.max(3, Math.min(10, Math.round(9 / cellSize)));
  for (let step = 0; step < steps; step++) {
    change.fill(0);
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const i = y * columns + x, amount = density[i]! * release[i]!;
      if (amount <= 0) continue;
      const dx = horizontal[i]!, dy = vertical[i]!;
      const move = (target: number, weight: number): void => {
        if (target < 0 || target >= density.length || mobility[target]! <= 0 || front[target]! <= 0) return;
        const pigment = amount * weight;
        change[i] = change[i]! - pigment;
        change[target] = change[target]! + pigment;
      };
      if (dx > 0 && x + 1 < columns) move(i + 1, dx);
      else if (dx < 0 && x > 0) move(i - 1, -dx);
      if (dy > 0 && y + 1 < rows) move(i + columns, dy);
      else if (dy < 0 && y > 0) move(i - columns, -dy);
    }
    // Total outgoing weight is at most one and release <= .24, preserving
    // positivity even when both axes receive pigment in the same step.
    for (let i = 0; i < density.length; i++) density[i] = density[i]! + change[i]!;
  }
}

/**
 * Event-based optical-density approximation. Wet contact redistributes pigment
 * only near intersections with an earlier authored wet window. It is neither
 * a paper-fibre fluid solver nor continuous drying or natural writing animation.
 */
export function rasterizeInkProcess(process: InkProcess, options: InkProcessRasterOptions = {}): InkPigmentFrame {
  fields(options, new Set(['time', 'cellSize']), 'ink raster option');
  if (options.time !== undefined) finite(options.time, 'time');
  const cellSize = positive(options.cellSize ?? 2, 'cellSize'), immutable = validateProcess(process);
  const columns = Math.max(1, Math.ceil(process.width / cellSize)), rows = Math.max(1, Math.ceil(process.height / cellSize));
  if (!Number.isSafeInteger(columns * rows) || columns * rows > MAX_CELLS) throw new RangeError('Ink raster supports at most 262144 cells; increase cellSize');
  const masks = prepareMasks(process, columns, rows, cellSize, immutable), density = new Float32Array(columns * rows);
  const activeLayers = process.layers.filter(layer => options.time === undefined || layer.at <= options.time).length;
  // Keep pigment attribution after each exchange. A contribution stops moving
  // when its own authored wet window closes, even if later water touches it.
  const contributions: Float32Array[] = [];
  let interactions = 0;
  for (let index = 0; index < activeLayers; index++) {
    const layer = process.layers[index]!, contact = masks.layers[index]!;
    const pigment = new Float32Array(density.length);
    for (let i = 0; i < pigment.length; i++) pigment[i] = contact[i]! * layer.concentration * 2.6;
    contributions.push(pigment);
    if (layer.mode !== 'wet-mix' || layer.water === 0) continue;
    const previousWater = new Float32Array(density.length);
    const movable = [index];
    for (let previous = 0; previous < index; previous++) {
      const earlier = process.layers[previous]!;
      if (earlier.water === 0 || earlier.dryAfter === 0 || layer.at - earlier.at >= earlier.dryAfter) continue;
      const remaining = earlier.water * (1 - (layer.at - earlier.at) / earlier.dryAfter);
      const wet = masks.wetLayers[previous]!;
      for (let i = 0; i < wet.length; i++) previousWater[i] = Math.max(previousWater[i]!, wet[i]! * remaining);
      movable.push(previous);
    }
    if (movable.length === 1) continue;
    const incoming = masks.wetLayers[index]!, mobility = new Float32Array(density.length), front = new Float32Array(density.length);
    let affected = false;
    for (let i = 0; i < mobility.length; i++) {
      const x = i % columns, y = Math.floor(i / columns);
      const irregular = .24 + .76 * noise(process.seed ^ hashText(layer.id), x * cellSize / 7, y * cellSize / 7);
      const amount = previousWater[i]! * incoming[i]! * layer.water * irregular;
      mobility[i] = amount;
      front[i] = Math.min(previousWater[i]!, incoming[i]! * layer.water);
      if (amount > 0) affected = true;
    }
    if (affected) {
      // Fixed scene-scale event length, independent of the caller's seek order.
      const steps = Math.max(8, Math.min(64, Math.round(64 / cellSize)));
      for (const contributor of movable) {
        if (process.layers[contributor]!.concentration > 0) {
          exchange(contributions[contributor]!, mobility, columns, rows, steps, masks.paper);
          depositAtFront(contributions[contributor]!, mobility, front, columns, rows, cellSize, masks.paper, process.seed ^ hashText(layer.id), layer.marks);
        }
      }
      interactions++;
    }
  }
  for (const contribution of contributions) for (let i = 0; i < density.length; i++) density[i] = density[i]! + contribution[i]!;
  return { width: process.width, height: process.height, columns, rows, cellSize, density, activeLayers, interactions };
}
