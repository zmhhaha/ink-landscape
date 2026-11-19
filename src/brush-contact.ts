import { sampleStrokePath } from './path.js';
import { brushStateAt, copyStrokeBrush } from './brush-state.js';
import type { StrokeMark, StrokePathSample } from './types.js';

export interface BrushContactSample extends StrokePathSample {
  /** x/y follow the supplied tip trajectory; contact can lie beside it. */
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly side: number;
  readonly angle: number;
  readonly dryness: number;
  readonly inkLoad: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
}

/**
 * Pure contact geometry, independent of Canvas. Pressure opens the contact;
 * side use spreads and displaces it relative to the tip. This relationship is
 * a procedural approximation, not a measurement of individual bristles.
 */
export function sampleBrushContact(mark: StrokeMark, options: { readonly spacing?: number } = {}): BrushContactSample[] {
  if (!Number.isFinite(mark.width) || mark.width <= 0) throw new RangeError('stroke.width must be positive');
  if (!Number.isFinite(mark.dryness) || mark.dryness < 0 || mark.dryness > 1) throw new RangeError('stroke.dryness must be in 0..1');
  const brush = copyStrokeBrush(mark.brush ?? { version: 1, controls: [] });
  const sampled = sampleStrokePath(mark.points, { spacing: options.spacing ?? Math.max(.65, Math.min(2, mark.width * .05)), smoothing: mark.smoothing ?? 'linear' });
  const total = sampled.at(-1)!.distance;
  const positionAt = (distance: number): StrokePathSample => {
    let low = 0, high = sampled.length - 1;
    while (low < high) { const middle = (low + high) >>> 1; if (sampled[middle]!.distance < distance) low = middle + 1; else high = middle; }
    if (low === 0) return sampled[0]!;
    const a = sampled[low - 1]!, b = sampled[low]!;
    const fraction = (distance - a.distance) / (b.distance - a.distance);
    const nx = a.nx * (1 - fraction) + b.nx * fraction, ny = a.ny * (1 - fraction) + b.ny * fraction;
    const magnitude = Math.hypot(nx, ny);
    return { x: a.x * (1 - fraction) + b.x * fraction, y: a.y * (1 - fraction) + b.y * fraction,
      pressure: a.pressure * (1 - fraction) + b.pressure * fraction, distance,
      nx: magnitude > 1e-8 ? nx / magnitude : b.nx, ny: magnitude > 1e-8 ? ny / magnitude : b.ny };
  };
  // Uniform spacing alone can miss a short lift or a rapid change completely.
  // Preserve every explicit control anchor as well (at most 128 extra samples).
  const anchored = new Map(sampled.map(sample => [sample.distance, sample]));
  for (const control of brush.controls) {
    const distance = total * control.at;
    if (!anchored.has(distance)) anchored.set(distance, positionAt(distance));
  }
  const path = [...anchored.values()].sort((a, b) => a.distance - b.distance);
  return path.map(sample => {
    const state = brushStateAt(brush, total === 0 ? 0 : sample.distance / total,
      { pressure: 1, side: 0, angle: Math.PI / 2, dryness: mark.dryness, inkLoad: 1 });
    const pressure = sample.pressure * state.pressure;
    // Contact turns over a finite footprint while the tip retains authored
    // corners. This avoids an instantaneous normal flip and a cut-out join.
    const reach = Math.min(total * .04, mark.width * .35);
    const before = positionAt(Math.max(0, sample.distance - reach));
    const after = positionAt(Math.min(total, sample.distance + reach));
    const dx = after.x - before.x, dy = after.y - before.y, magnitude = Math.hypot(dx, dy);
    const nx = magnitude > 1e-8 ? -dy / magnitude : sample.nx, ny = magnitude > 1e-8 ? dx / magnitude : sample.ny;
    const across = Math.sin(state.angle);
    const halfWidth = mark.width * .5 * Math.pow(pressure, .72) * (1 + state.side * .48 * Math.abs(across));
    const offset = halfWidth * state.side * .66 * across;
    const centerX = sample.x + nx * offset, centerY = sample.y + ny * offset;
    if (![centerX, centerY, halfWidth, centerX + nx * halfWidth, centerY + ny * halfWidth,
      centerX - nx * halfWidth, centerY - ny * halfWidth].every(Number.isFinite)) throw new RangeError('Brush contact coordinates exceed finite range');
    return { ...sample, nx, ny, pressure, centerX, centerY, halfWidth, side: state.side, angle: state.angle,
      dryness: state.dryness, inkLoad: state.inkLoad,
      leftX: centerX + nx * halfWidth, leftY: centerY + ny * halfWidth,
      rightX: centerX - nx * halfWidth, rightY: centerY - ny * halfWidth };
  });
}
