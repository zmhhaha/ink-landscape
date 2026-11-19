import { createInkScene } from './core.js';
import { createBrushStroke } from './brushwork.js';
import type { BrushworkOptions } from './brushwork.js';
import { copyStrokeBrush } from './brush-state.js';
import type { BrushControl, InkPoint, StrokeBrush, StrokeMark } from './types.js';

/** Composable gestures plus optional controls within the resulting stroke. */
export interface BrushProgramOptions extends Omit<BrushworkOptions, 'nib' | 'tipAngle' | 'brush'> {
  /** Sparse channels interpolate independently. Up to 128 controls including implicit endpoints. */
  readonly controls?: readonly BrushControl[];
}

export interface BrushRecipe {
  readonly version: 1;
  readonly generator: 'ink-brush-contact-v1' | 'ink-brush-local-gestures-v1';
  /** Authored path, before entry, finish and other gestures alter it. */
  readonly points: readonly InkPoint[];
  readonly options: BrushProgramOptions;
}

export interface BrushDocument {
  readonly version: 1;
  readonly recipe: BrushRecipe;
  /** Owned playback result. Editing the recipe requires recompilation. */
  readonly result: StrokeMark;
}

export interface BrushDocumentPatch {
  readonly points?: readonly InkPoint[];
  /** Shallow merge; a supplied controls array replaces the previous one. */
  readonly options?: Partial<BrushProgramOptions>;
}

const GENERATOR = 'ink-brush-contact-v1';
const LOCAL_GENERATOR = 'ink-brush-local-gestures-v1';
const generatorFor = (options: BrushProgramOptions): BrushRecipe['generator'] =>
  options?.gestureModel === 'local-v1' ? LOCAL_GENERATOR : GENERATOR;
const supportedOptions = new Set([
  'id', 'width', 'ink', 'opacity', 'dryness', 'smoothing', 'seed', 'clip', 'start', 'duration',
  'axis', 'entry', 'finish', 'pressureProfile', 'turn', 'rhythm', 'drag', 'strength', 'controls', 'gestureModel',
]);

function assertOptions(options: BrushProgramOptions): void {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Brush program options must be an object');
  for (const key of Object.keys(options)) {
    if (!supportedOptions.has(key)) throw new RangeError(`Unsupported brush program option: ${key}`);
  }
  // Legacy nib defaults would obscure the meaning of the semantic contact controls.
  for (const key of ['nib', 'tipAngle', 'brush']) {
    if (key in options) throw new RangeError(`Brush programs use contact controls instead of ${key}`);
  }
}

function contactControls(controls: readonly BrushControl[], axis: BrushProgramOptions['axis'], dryness: number): StrokeBrush {
  const defaults = { pressure: 1, side: axis === 'side' ? 1 : 0, angle: Math.PI / 2, dryness, inkLoad: 1 };
  const input = copyStrokeBrush({ version: 1, controls }).controls;
  const first = input[0], last = input.at(-1);
  const middle = input.filter(control => control.at > 0 && control.at < 1);
  return copyStrokeBrush({ version: 1, controls: [
    { at: 0, ...defaults, ...(first?.at === 0 ? first : {}) },
    ...middle,
    { at: 1, ...defaults, ...(last?.at === 1 ? last : {}) },
  ] });
}

function prepare(points: readonly InkPoint[], options: BrushProgramOptions): {
  readonly points: readonly InkPoint[];
  readonly options: BrushProgramOptions;
  readonly result: StrokeMark;
} {
  assertOptions(options);
  const { controls = [], ...gestures } = options;
  const ownedControls = copyStrokeBrush({ version: 1, controls }).controls;
  // The core owns path, clip, style and absolute-time validation. Its default id
  // and seed are deterministic and become explicit in the saved recipe.
  const authored = createInkScene({ width: 1, height: 1 }).stroke(points, {
    ...gestures, width: options.width ?? 24, dryness: options.dryness ?? .25, nib: 'round', tipAngle: 0,
  });
  const canonical: BrushProgramOptions = Object.freeze({
    id: authored.id, width: authored.width, ink: authored.ink, opacity: authored.opacity,
    dryness: authored.dryness, smoothing: options.smoothing ?? 'linear', seed: authored.seed,
    start: authored.start, duration: authored.duration,
    ...(authored.clip === undefined ? {} : { clip: authored.clip }),
    axis: options.axis ?? 'center', entry: options.entry ?? 'preserve', finish: options.finish ?? 'preserve',
    pressureProfile: options.pressureProfile ?? 'preserve', turn: options.turn ?? 'preserve',
    rhythm: options.rhythm ?? 'continuous', drag: options.drag ?? 'forward', strength: options.strength ?? 1,
    ...(options.gestureModel === undefined ? {} : { gestureModel: options.gestureModel }),
    controls: ownedControls,
  });
  const { controls: _controls, ...canonicalGestures } = canonical;
  const geometry = createBrushStroke(authored.points, { ...canonicalGestures, nib: 'round', tipAngle: 0 });
  const result = createInkScene({ width: 1, height: 1 }).stroke(geometry.points, {
    ...geometry, brush: contactControls(ownedControls, canonical.axis, authored.dryness),
  });
  return { points: authored.points, options: canonical, result };
}

function assertRecipe(recipe: BrushRecipe): void {
  if (!recipe || typeof recipe !== 'object' || recipe.version !== 1) throw new RangeError('Unsupported brush recipe version');
  if (recipe.generator !== GENERATOR && recipe.generator !== LOCAL_GENERATOR) throw new RangeError('Unsupported brush generator version');
  if (recipe.generator !== generatorFor(recipe.options)) throw new RangeError('Brush generator version does not match gesture model');
}

/**
 * Saves both semantic source and compiled, browser-independent stroke data.
 * Controls use normalized arc length of the generated path, including gestures.
 * The contact model is a procedural approximation, not a brush/ink simulation.
 */
export function createBrushDocument(points: readonly InkPoint[], options: BrushProgramOptions = {}): BrushDocument {
  const prepared = prepare(points, options);
  const recipe: BrushRecipe = Object.freeze({
    version: 1, generator: generatorFor(prepared.options), points: prepared.points, options: prepared.options,
  });
  return Object.freeze({ version: 1, recipe, result: prepared.result });
}

/** Recompile semantic source, for example after a JSON round trip. */
export function compileBrushRecipe(recipe: BrushRecipe): StrokeMark {
  assertRecipe(recipe);
  return prepare(recipe.points, recipe.options).result;
}

/** Rebuilds from source; the stored result is never reverse-engineered. */
export function reviseBrushDocument(document: BrushDocument, patch: BrushDocumentPatch): BrushDocument {
  if (!document || typeof document !== 'object' || document.version !== 1) throw new RangeError('Unsupported brush document version');
  assertRecipe(document.recipe);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Brush document patch must be an object');
  for (const key of Object.keys(patch)) {
    if (key !== 'points' && key !== 'options') throw new RangeError(`Unsupported brush document patch: ${key}`);
  }
  if (patch.options !== undefined) assertOptions(patch.options);
  return createBrushDocument(patch.points === undefined ? document.recipe.points : patch.points, { ...document.recipe.options, ...patch.options });
}
