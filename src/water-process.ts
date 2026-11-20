import { createInkProcessDocument } from './ink-process.js';
import type { InkLayerSource, InkProcess, InkProcessOptions, InkStrokeSource } from './ink-process.js';

/** A caller-authored round contact, not a particle or an inferred water stain. */
export interface WaterDropletSource {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

interface WaterEventState {
  readonly id: string;
  readonly water?: number;
  readonly at?: number;
  readonly dryAfter?: number;
  readonly mode?: 'glaze' | 'wet-mix';
  /** Same optional inward contact feather as an ink layer. */
  readonly edgeSoftness?: number;
  readonly edgeDeposit?: number;
  readonly edgeWidth?: number;
}

export interface WaterInkEventSource extends WaterEventState {
  readonly kind: 'ink';
  readonly strokes: readonly InkStrokeSource[];
  readonly concentration?: number;
}

export interface WaterClearEventSource extends WaterEventState {
  readonly kind: 'water';
  /** Source clipping applies to deposition, not a hard final exchange boundary. */
  readonly strokes?: readonly InkStrokeSource[];
  readonly droplets?: readonly WaterDropletSource[];
}

export type WaterEventSource = WaterInkEventSource | WaterClearEventSource;

export interface WaterProcessRecipe {
  readonly version: 1;
  readonly generator: 'water-event-process-v1';
  readonly events: readonly WaterEventSource[];
  readonly options: InkProcessOptions;
}

export interface WaterProcessDocument {
  readonly version: 1;
  readonly recipe: WaterProcessRecipe;
  /** Compiled zero-pigment water layers and ordinary ink layers share one backend. */
  readonly result: InkProcess;
}

export interface WaterProcessDocumentPatch {
  /** Replaces the complete authored event collection. */
  readonly events?: readonly WaterEventSource[];
  /** Shallow merge with the existing options. */
  readonly options?: Partial<InkProcessOptions>;
}

const GENERATOR = 'water-event-process-v1';
const commonFields = ['kind', 'id', 'water', 'at', 'dryAfter', 'mode', 'strokes', 'edgeSoftness', 'edgeDeposit', 'edgeWidth'];
const inkFields = new Set([...commonFields, 'concentration']);
const waterFields = new Set([...commonFields, 'droplets']);
const optionFields = new Set(['width', 'height', 'seed', 'background', 'ink']);
const dropletFields = new Set(['id', 'x', 'y', 'radius']);

function fields(value: object, allowed: ReadonlySet<string>, name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new RangeError(`Unsupported ${name} field: ${key}`);
}

function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function droplet(source: WaterDropletSource, ids: Set<string>): WaterDropletSource {
  fields(source, dropletFields, 'water droplet');
  if (typeof source.id !== 'string' || !source.id.trim()) throw new TypeError('water droplet.id must be a nonempty string');
  if (ids.has(source.id)) throw new RangeError(`Duplicate water droplet id: ${source.id}`);
  ids.add(source.id);
  const x = finite(source.x, 'water droplet.x'), y = finite(source.y, 'water droplet.y');
  const radius = finite(source.radius, 'water droplet.radius');
  if (radius <= 0 || !Number.isFinite(radius * 2)) throw new RangeError('water droplet.radius must have a positive finite diameter');
  return Object.freeze({ id: source.id, x, y, radius });
}

function dropContact(source: WaterDropletSource): InkStrokeSource {
  // A very short, fully pressed round path approximates a circular contact.
  // The nonzero path keeps the shared contact rasterizer's segment semantics.
  const extent = Math.max(1e-6, source.radius * .0001);
  const left = finite(source.x - extent, 'water droplet left extent');
  const right = finite(source.x + extent, 'water droplet right extent');
  return {
    points: [{ x: left, y: source.y, pressure: 1 }, { x: right, y: source.y, pressure: 1 }],
    options: { id: `drop:${source.id}`, width: source.radius * 2, opacity: 1,
      dryness: 0, axis: 'center', smoothing: 'linear' },
  };
}

/**
 * Owns editable clear-water contacts and ink events without browser globals.
 * All events default to wet-mix; this is finite local pigment exchange, not
 * continuous drying, measured water volume or a paper-fluid simulation.
 */
export function createWaterProcessDocument(events: readonly WaterEventSource[], options: InkProcessOptions): WaterProcessDocument {
  if (!Array.isArray(events) || events.length > 32) throw new RangeError('Water processes support at most 32 events');
  const layers: InkLayerSource[] = [], dropsByEvent: (readonly WaterDropletSource[] | undefined)[] = [];
  let contacts = 0;
  for (const source of events) {
    if (!source || (source.kind !== 'ink' && source.kind !== 'water')) throw new RangeError('Water event kind must be ink or water');
    fields(source, source.kind === 'ink' ? inkFields : waterFields, 'water event');
    for (const key of ['concentration', 'water', 'at', 'dryAfter', 'mode', 'edgeSoftness', 'edgeDeposit', 'edgeWidth'] as const) {
      if (key in source && (source as unknown as Record<string, unknown>)[key] === null) throw new TypeError(`water event.${key} cannot be null`);
    }
    if (source.kind === 'ink' && !Array.isArray(source.strokes)) throw new TypeError('Ink events require a strokes array');
    if (source.strokes !== undefined && !Array.isArray(source.strokes)) throw new TypeError('Water event strokes must be an array');
    const rawDrops = source.kind === 'water' ? source.droplets : undefined;
    if (rawDrops !== undefined && !Array.isArray(rawDrops)) throw new TypeError('Water event droplets must be an array');
    contacts += (source.strokes?.length ?? 0) + (rawDrops?.length ?? 0);
    if (contacts > 512) throw new RangeError('Water processes support at most 512 stroke and droplet contacts');
    if (source.kind === 'water' && (source.strokes?.length ?? 0) + (rawDrops?.length ?? 0) === 0) {
      throw new RangeError('Clear water events require at least one stroke or droplet contact');
    }
    const ids = new Set<string>();
    const drops = rawDrops === undefined ? undefined : Object.freeze(rawDrops.map((value: WaterDropletSource) => droplet(value, ids)));
    dropsByEvent.push(drops);
    layers.push({ id: source.id, strokes: [...(source.strokes ?? []), ...(drops?.map(dropContact) ?? [])],
      concentration: source.kind === 'water' ? 0 : source.concentration ?? .5,
      water: source.water ?? (source.kind === 'water' ? 1 : .5), at: source.at ?? 0,
      dryAfter: source.dryAfter ?? 2, mode: source.mode ?? 'wet-mix',
      ...(source.edgeSoftness === undefined ? {} : { edgeSoftness: source.edgeSoftness }),
      ...(source.edgeDeposit === undefined ? {} : { edgeDeposit: source.edgeDeposit }),
      ...(source.edgeWidth === undefined ? {} : { edgeWidth: source.edgeWidth }) });
  }
  // Delegate path, style, event order, identity and scene validation to the
  // established compiler; it also owns all nested contact data independently.
  const compiled = createInkProcessDocument(layers, options);
  const authored = events.map((source, index): WaterEventSource => {
    const owned = compiled.recipe.layers[index]!;
    const sparse: Record<string, unknown> = { kind: source.kind, id: owned.id };
    if (source.strokes !== undefined) sparse.strokes = Object.freeze(owned.strokes.slice(0, source.strokes.length));
    if (source.kind === 'water' && source.droplets !== undefined) sparse.droplets = dropsByEvent[index];
    for (const key of ['concentration', 'water', 'at', 'dryAfter', 'mode', 'edgeSoftness', 'edgeDeposit', 'edgeWidth'] as const) {
      if (key in source && (source as unknown as Record<string, unknown>)[key] !== undefined) sparse[key] = owned[key];
    }
    return Object.freeze(sparse) as unknown as WaterEventSource;
  });
  const recipe: WaterProcessRecipe = Object.freeze({ version: 1, generator: GENERATOR,
    events: Object.freeze(authored), options: compiled.recipe.options });
  return Object.freeze({ version: 1, recipe, result: compiled.result });
}

function assertRecipe(recipe: WaterProcessRecipe): void {
  if (!recipe || recipe.version !== 1) throw new RangeError('Unsupported water process recipe version');
  fields(recipe, new Set(['version', 'generator', 'events', 'options']), 'water process recipe');
  if (recipe.generator !== GENERATOR) throw new RangeError('Unsupported water process generator');
}

export function compileWaterProcessRecipe(recipe: WaterProcessRecipe): InkProcess {
  assertRecipe(recipe);
  return createWaterProcessDocument(recipe.events, recipe.options).result;
}

/** Recompiles the editable source; a saved result is never reverse-engineered. */
export function reviseWaterProcessDocument(document: WaterProcessDocument, patch: WaterProcessDocumentPatch): WaterProcessDocument {
  if (!document || document.version !== 1) throw new RangeError('Unsupported water process document version');
  fields(document, new Set(['version', 'recipe', 'result']), 'water process document');
  assertRecipe(document.recipe);
  fields(patch, new Set(['events', 'options']), 'water process patch');
  if (patch.options !== undefined) fields(patch.options, optionFields, 'water process option');
  return createWaterProcessDocument(patch.events === undefined ? document.recipe.events : patch.events,
    { ...document.recipe.options, ...patch.options });
}
