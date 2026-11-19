import type { BrushControl, StrokeBrush } from './types.js';

const channels = ['pressure', 'side', 'angle', 'dryness', 'inkLoad'] as const;
export type BrushState = Readonly<Required<Omit<BrushControl, 'at'>>>;

/** Shared core/renderer validation, owning every nested control. */
export function copyStrokeBrush(brush: StrokeBrush): StrokeBrush {
  if (!brush || brush.version !== 1) throw new RangeError('Unsupported brush version');
  if (!Array.isArray(brush.controls) || brush.controls.length > 128) throw new RangeError('brush.controls supports at most 128 controls');
  let previous = -1;
  const controls = brush.controls.map(control => {
    if (!control || !Number.isFinite(control.at) || control.at < 0 || control.at > 1 || control.at <= previous) {
      throw new RangeError('brush control positions must be strictly increasing in 0..1');
    }
    previous = control.at;
    const result: { at: number; pressure?: number; side?: number; angle?: number; dryness?: number; inkLoad?: number } = { at: control.at };
    for (const key of channels) {
      const value = control[key];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || (key !== 'angle' && (value < 0 || value > 1))) {
        throw new RangeError(`brush.${key} must be finite${key === 'angle' ? '' : ' and in 0..1'}`);
      }
      result[key] = value;
    }
    return Object.freeze(result);
  });
  return Object.freeze({ version: 1 as const, controls: Object.freeze(controls) });
}

/** Missing channels interpolate independently, with implicit default endpoints. */
export function brushStateAt(brush: StrokeBrush, at: number, defaults: BrushState): BrushState {
  const result = { ...defaults };
  for (const key of channels) {
    let leftAt = 0, leftValue = defaults[key], rightAt = 1, rightValue = defaults[key];
    for (const control of brush.controls) {
      const value = control[key];
      if (value === undefined) continue;
      if (control.at <= at) { leftAt = control.at; leftValue = value; }
      if (control.at >= at) { rightAt = control.at; rightValue = value; break; }
    }
    const fraction = rightAt === leftAt ? 0 : Math.max(0, Math.min(1, (at - leftAt) / (rightAt - leftAt)));
    const eased = fraction * fraction * (3 - 2 * fraction);
    result[key] = leftValue * (1 - eased) + rightValue * eased;
  }
  return result;
}
