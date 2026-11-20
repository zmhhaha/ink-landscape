import type { InkPoint, Vec2 } from './types.js';
import type { StrokeGroupOptions, StrokeGroupSource } from './stroke-group-document.js';
import type { InkScene } from './types.js';

export type RockPose = 'upright' | 'reclining' | 'leaning';
export type RockTechnique = 'axe' | 'jiesuo';
export interface RockLineSource { readonly id: string; readonly points: readonly InkPoint[] }
export interface RockFaceSource {
  readonly id: string;
  readonly region: readonly Vec2[];
  /** Down-slope direction guide; it need not be at the center of the face. */
  readonly flow: readonly InkPoint[];
  readonly tone: 'light' | 'middle' | 'dark';
  readonly fractures?: readonly RockLineSource[];
  readonly reserves?: readonly (readonly Vec2[])[];
}
/** Authored faces and flow replace automatic structure; no arbitrary silhouette inference. */
export interface RockStructureSource {
  readonly outline: readonly Vec2[];
  readonly ridges: readonly RockLineSource[];
  readonly faces: readonly RockFaceSource[];
}
export interface RockFormOptions {
  readonly position?: Vec2;
  readonly size?: number;
  readonly pose?: RockPose;
  readonly seed?: number;
}
export interface RockDocumentOptions extends StrokeGroupOptions {
  readonly technique: RockTechnique;
  readonly detail?: number;
  readonly idPrefix?: string;
}
export interface RockDocumentInput extends RockDocumentOptions, RockFormOptions {
  readonly structure?: RockStructureSource;
}
export interface RockTextureOptions {
  readonly technique: RockTechnique;
  readonly seed: number;
  readonly idPrefix: string;
  readonly ink: string;
  readonly detail: number;
}
export interface RockRecipe {
  readonly version: 1;
  readonly generator: 'ink-structured-rock-v1';
  readonly structure: RockStructureSource;
  readonly options: RockDocumentOptions;
}
export interface RockDocument {
  readonly version: 1;
  readonly recipe: RockRecipe;
  readonly groups: readonly StrokeGroupSource[];
  readonly result: InkScene;
}
