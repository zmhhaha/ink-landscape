import { createInkScene } from './core.js';
import type { InkMark, InkScene, SceneOptions, StrokeMark, WashMark } from './types.js';

/** Ordinary scene data and the result shapes of brush, dot and group documents. */
export type InkCompositionValue = InkScene | InkMark | readonly InkMark[]
  | { readonly result: InkScene | InkMark | readonly InkMark[] };
export interface InkCompositionSource {
  /** Stable instance identity. Different instances may have identical content. */
  readonly namespace: string;
  readonly source: InkCompositionValue;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a nonempty string`);
  return value;
}
function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function marksOf(source: InkCompositionValue): readonly InkMark[] {
  let value: unknown = source;
  if (value && typeof value === 'object' && !Array.isArray(value) && 'result' in value) value = value.result;
  if (Array.isArray(value)) return value;
  const input = record(value, 'composition source');
  if (input.kind === 'stroke' || input.kind === 'wash') return [value as InkMark];
  if ('marks' in input) {
    if (input.version !== 1) throw new RangeError('Unsupported composition scene version');
    number(input.width, 'source.width'); number(input.height, 'source.height');
    number(input.seed, 'source.seed'); text(input.background, 'source.background');
    // Validate the source frame, though its coordinates and timing are kept
    // unchanged and the composed scene has its own explicit output frame.
    createInkScene(input as unknown as SceneOptions);
    if (!Array.isArray(input.marks)) throw new TypeError('source.marks must be an array');
    return input.marks as InkMark[];
  }
  throw new TypeError('Composition accepts ordinary marks or scenes; ink/water processes use their own renderer');
}
function normalizedMark(value: InkMark): InkMark {
  const mark = record(value, 'composition mark');
  text(mark.id, 'mark.id'); text(mark.ink, 'mark.ink');
  for (const field of ['opacity', 'seed', 'start', 'duration']) number(mark[field], 'mark.' + field);
  // Required fields prevent an incomplete imported mark from silently getting
  // defaults, especially a new seed derived from its namespaced identity.
  if (mark.kind === 'stroke') {
    for (const field of ['width', 'dryness', 'tipAngle']) number(mark[field], 'stroke.' + field);
    if (mark.nib !== 'round' && mark.nib !== 'flat') throw new RangeError('stroke.nib must be round or flat');
    return value as StrokeMark;
  }
  if (mark.kind === 'wash') {
    number(mark.roughness, 'wash.roughness'); number(mark.passes, 'wash.passes');
    return value as WashMark;
  }
  throw new RangeError('Unknown composition mark kind');
}

/**
 * Compose document instances without changing their local IDs or material.
 * Namespace and local ID are length-prefixed; coordinates, timing and paint
 * order are retained. Seeds use core's uint32 normalization, never the new ID.
 * Generator-produced seeds are already canonical and remain unchanged.
 * Inputs are owned by the new scene.
 * All work is private until success: invalid input cannot expose a partial scene.
 */
export function composeInkScene(sources: readonly InkCompositionSource[], options: SceneOptions): InkScene {
  if (!Array.isArray(sources)) throw new TypeError('Composition sources must be an array');
  const builder = createInkScene(options), namespaces = new Set<string>();
  for (const entry of sources) {
    const checked = record(entry, 'composition entry');
    for (const key of Object.keys(checked)) if (!['namespace', 'source'].includes(key)) throw new RangeError(`Unsupported composition entry field: ${key}`);
    const namespace = text(checked.namespace, 'namespace');
    if (namespaces.has(namespace)) throw new RangeError(`Duplicate composition namespace: ${namespace}`);
    namespaces.add(namespace);
    for (const input of marksOf(entry.source)) {
      const mark = normalizedMark(input);
      const id = `${namespace.length}:${namespace}/${mark.id.length}:${mark.id}`;
      if (mark.kind === 'stroke') builder.stroke(mark.points, { ...mark, id });
      else builder.wash(mark.outline, { ...mark, id });
    }
  }
  return builder.snapshot();
}
