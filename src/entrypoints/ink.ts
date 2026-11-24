/** Pigment and water data, independent of the Canvas renderer. */
export { createInkProcessDocument, compileInkProcessRecipe, reviseInkProcessDocument, rasterizeInkProcess } from '../ink-process.js';
export type * from '../ink-process.js';
export { createWaterProcessDocument, compileWaterProcessRecipe, reviseWaterProcessDocument } from '../water-process.js';
export type * from '../water-process.js';
export type { InkPoint, Vec2 } from '../types.js';
