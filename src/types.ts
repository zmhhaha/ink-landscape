export interface Vec2 { readonly x: number; readonly y: number }
export interface InkPoint extends Vec2 { readonly pressure?: number }

/** Controls are placed by normalized arc length on the generated stroke. */
export interface BrushControl {
  readonly at: number;
  /** Multiplies authored pressure; zero-pressure gaps remain gaps. */
  readonly pressure?: number;
  /** 0 keeps the tip central; 1 places contact to its side. */
  readonly side?: number;
  /** Spread direction relative to the local tangent, in radians. */
  readonly angle?: number;
  readonly dryness?: number;
  /** Available contact coverage, not a physical water/pigment reservoir. */
  readonly inkLoad?: number;
}

export interface StrokeBrush {
  readonly version: 1;
  readonly controls: readonly BrushControl[];
}

export type StrokeSmoothing = 'linear' | 'catmull-rom';

export interface PathSamplingOptions {
  /** Desired arc-length spacing; output is capped at 8193 samples. Default 2. */
  readonly spacing?: number;
  /** Omitted preserves caller-supplied straight segments and corners. */
  readonly smoothing?: StrokeSmoothing;
}

export interface StrokePathSample extends Vec2 {
  readonly pressure: number;
  readonly distance: number;
  /** Unit normal from the path tangent; an exact reversal has a cusp. */
  readonly nx: number;
  readonly ny: number;
}

export interface TimingOptions {
  /** Absolute start time in seconds; default 0. */
  readonly start?: number;
  /** Reveal duration in seconds; default 0 (instant). */
  readonly duration?: number;
}

export interface StrokeOptions extends TimingOptions {
  /** Optional versioned, local contact controls; legacy strokes omit this. */
  readonly brush?: StrokeBrush;
  readonly id?: string;
  readonly width?: number;
  readonly ink?: string;
  readonly opacity?: number;
  /** 0 = wet/solid, 1 = broken dry brush. */
  readonly dryness?: number;
  readonly nib?: 'round' | 'flat';
  /** Optional centripetal Catmull–Rom interpolation; default is linear. */
  readonly smoothing?: StrokeSmoothing;
  /** Nib angle in radians. */
  readonly tipAngle?: number;
  readonly seed?: number;
  readonly clip?: readonly Vec2[];
}

export interface WashOptions extends TimingOptions {
  readonly id?: string;
  readonly ink?: string;
  readonly opacity?: number;
  readonly roughness?: number;
  readonly passes?: number;
  readonly seed?: number;
}

export interface CunOptions extends Omit<StrokeOptions, 'id' | 'clip'> {
  readonly idPrefix?: string;
  readonly technique?: 'pima' | 'axe';
  readonly count?: number;
  readonly length?: number;
  readonly direction?: Vec2;
  /** Used only while generating marks; never serialized into the scene. */
  readonly flow?: (point: Vec2) => Vec2;
}

interface MarkBase {
  readonly id: string;
  readonly ink: string;
  readonly opacity: number;
  readonly seed: number;
  readonly start: number;
  readonly duration: number;
}

export interface StrokeMark extends MarkBase {
  readonly brush?: StrokeBrush;
  readonly kind: 'stroke';
  readonly points: readonly InkPoint[];
  readonly width: number;
  readonly dryness: number;
  readonly nib: 'round' | 'flat';
  readonly smoothing?: StrokeSmoothing;
  readonly tipAngle: number;
  readonly clip?: readonly Vec2[];
}

export interface WashMark extends MarkBase {
  readonly kind: 'wash';
  readonly outline: readonly Vec2[];
  readonly roughness: number;
  readonly passes: number;
}

export type InkMark = StrokeMark | WashMark;

export interface SceneOptions {
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly background?: string;
}

export interface InkScene {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly background: string;
  readonly marks: readonly InkMark[];
}

export interface SceneBuilder {
  stroke(points: readonly InkPoint[], options?: StrokeOptions): StrokeMark;
  wash(outline: readonly Vec2[], options?: WashOptions): WashMark;
  cun(outline: readonly Vec2[], options?: CunOptions): readonly StrokeMark[];
  snapshot(): InkScene;
}

export interface RenderOptions {
  /** Absolute seconds; omitted means every mark is complete. */
  readonly time?: number;
  readonly clear?: boolean;
  /** Subtle seeded paper grain; range 0..1, default 0.06. */
  readonly paperTexture?: number;
}

export interface RenderStats {
  readonly visibleMarks: number;
  readonly strokeCount: number;
  readonly washCount: number;
}
