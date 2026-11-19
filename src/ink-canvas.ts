import { rasterizeInkProcess } from './ink-process.js';
import type { InkProcess, InkProcessLayer, InkProcessRasterOptions, InkPigmentFrame } from './ink-process.js';

export interface InkProcessRenderStats {
  readonly activeLayers: number;
  readonly interactions: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
}

interface CachedImage {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly stats: InkProcessRenderStats;
}

// Weak ownership releases every prepared frame when its editable result is
// discarded. The limit also bounds repeated time/resolution previews per result.
const images = new WeakMap<InkProcess, Map<string, CachedImage>>();
const MAX_IMAGES = 8;

function isImmutable(process: InkProcess): boolean {
  return Object.isFrozen(process) && Array.isArray(process.layers) && Object.isFrozen(process.layers)
    && process.layers.every((layer: InkProcessLayer) => Object.isFrozen(layer) && Object.isFrozen(layer.marks)
      && layer.marks.every(mark => Object.isFrozen(mark) && Object.isFrozen(mark.points)
        && mark.points.every(Object.isFrozen)
        && (mark.clip === undefined || Object.isFrozen(mark.clip) && mark.clip.every(Object.isFrozen))
        && (mark.brush === undefined || Object.isFrozen(mark.brush) && Object.isFrozen(mark.brush.controls)
          && mark.brush.controls.every(Object.isFrozen))));
}

function rgb(color: string): number[] {
  return [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
}

function prepare(process: InkProcess, frame: InkPigmentFrame, ctx: CanvasRenderingContext2D): CachedImage {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(frame.columns, frame.rows);
  else if (ctx.canvas.ownerDocument) {
    canvas = ctx.canvas.ownerDocument.createElement('canvas');
    canvas.width = frame.columns; canvas.height = frame.rows;
  } else throw new Error('Ink process rendering requires a browser Canvas implementation');
  const target = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!target) throw new Error('Unable to create ink process Canvas 2D context');
  const image = target.createImageData(frame.columns, frame.rows);
  const paper = rgb(process.background), ink = rgb(process.ink);
  for (let index = 0; index < frame.density.length; index++) {
    const transmission = Math.exp(-frame.density[index]!);
    for (let channel = 0; channel < 3; channel++) {
      image.data[index * 4 + channel] = Math.round(ink[channel]! + (paper[channel]! - ink[channel]!) * transmission);
    }
    image.data[index * 4 + 3] = 255;
  }
  target.putImageData(image, 0, 0);
  return { canvas, stats: Object.freeze({ activeLayers: frame.activeLayers, interactions: frame.interactions,
    columns: frame.columns, rows: frame.rows, cellSize: frame.cellSize }) };
}

/**
 * Renders a bounded optical-density grid on Canvas 2D. Layer arrival and finite
 * wet exchange are evaluated from absolute events, without wall-clock state.
 * This is separate from renderCanvas and does not alter legacy stroke rendering.
 */
export function renderInkProcess(
  ctx: CanvasRenderingContext2D,
  process: InkProcess,
  options: InkProcessRasterOptions = {},
): InkProcessRenderStats {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Ink render options must be an object');
  for (const key of Object.keys(options)) if (key !== 'time' && key !== 'cellSize') throw new RangeError(`Unsupported ink render option: ${key}`);
  if (options.time !== undefined && !Number.isFinite(options.time)) throw new RangeError('time must be finite');
  if (options.cellSize !== undefined && (!Number.isFinite(options.cellSize) || options.cellSize <= 0)) throw new RangeError('cellSize must be positive and finite');
  const immutable = !!process && isImmutable(process);
  const phase = immutable ? process.layers.filter(layer => layer.at <= (options.time ?? Infinity)).length : 0;
  const key = `${options.cellSize ?? 2}:${phase}`;
  const cache = immutable ? images.get(process) : undefined;
  let prepared = cache?.get(key);
  if (!prepared) {
    // The pure rasterizer validates JSON playback before any target painting.
    prepared = prepare(process, rasterizeInkProcess(process, options), ctx);
    if (immutable) {
      const frames = cache ?? new Map<string, CachedImage>();
      frames.set(key, prepared);
      if (frames.size > MAX_IMAGES) frames.delete(frames.keys().next().value!);
      images.set(process, frames);
    }
  }
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.filter = 'none'; ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(prepared.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  } finally { ctx.restore(); }
  return prepared.stats;
}
