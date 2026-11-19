import { sampleBrushContact } from './brush-contact.js';
import type { BrushContactSample } from './brush-contact.js';
import type { StrokeMark } from './types.js';

interface BandPoint { x: number; y: number; nx: number; ny: number; left: number; right: number; distance: number }
interface Band { alpha: number; points: readonly BandPoint[] }
interface Plan { length: number; bands: readonly Band[] }
const cache = new WeakMap<StrokeMark, Plan>();
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value));
function hash(seed: number, index: number, channel: number): number {
  let value = ((seed | 0) ^ Math.imul(index | 0, 0x9e3779b1) ^ Math.imul(channel, 0x85ebca77)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}
function noise(seed: number, at: number, channel: number): number {
  const index = Math.floor(at), t = at - index, eased = t * t * (3 - 2 * t);
  return hash(seed, index, channel) * (1 - eased) + hash(seed, index + 1, channel) * eased;
}
function split(points: readonly BandPoint[], alpha: number): Band[] {
  const result: Band[] = [];
  let run: BandPoint[] = [], previous: BandPoint | undefined;
  for (const point of points) {
    if (point.left + point.right > 1e-8) {
      if (run.length === 0 && previous) run.push(previous);
      run.push(point);
    } else if (run.length) { run.push(point); result.push({ alpha, points: run }); run = []; }
    previous = point;
  }
  if (run.length) result.push({ alpha, points: run });
  return result;
}

/** Sparse release traces, derived from the actual tail rather than a finish label. */
function releaseFilaments(mark: StrokeMark, samples: readonly BrushContactSample[]): Band[] {
  const last = samples.at(-1)!, length = last.distance;
  // Thin contour lines and short dabs should not acquire unrelated whiskers.
  if (mark.width < 8 || length < Math.max(24, mark.width * 6) || last.pressure > .08
    || last.inkLoad <= .15 || mark.opacity === 0) return [];
  const station = (distance: number): BrushContactSample => {
    let low = 0, high = samples.length - 1;
    while (low < high) { const middle = (low + high) >>> 1; if (samples[middle]!.distance < distance) low = middle + 1; else high = middle; }
    return samples[low]!;
  };
  const lookback = Math.min(length * .40, Math.max(mark.width * 3, length * .18));
  const release = samples.filter(sample => sample.distance >= length - lookback);
  const peak = Math.max(...release.map(sample => sample.pressure));
  if (peak < .15 || last.pressure > peak * .28 || peak - last.pressure < .12) return [];
  const tail = release.filter(sample => sample.distance >= length - Math.min(lookback * .3, mark.width * .45));
  if (tail.some((sample, index) => index > 0 && sample.pressure > tail[index - 1]!.pressure + .012)) return [];
  const before = samples[Math.max(0, samples.length - 3)]!;
  const dx = last.x - before.x, dy = last.y - before.y, magnitude = Math.hypot(dx, dy);
  const approachStart = station(length - lookback), approachEnd = station(length - lookback * .45);
  const ax = approachEnd.x - approachStart.x, ay = approachEnd.y - approachStart.y, approachLength = Math.hypot(ax, ay);
  if (magnitude < 1e-8 || approachLength < 1e-8 || (dx * ax + dy * ay) / (magnitude * approachLength) < .65) return [];
  const tx = dx / magnitude, ty = dy / magnitude, nx = -ty, ny = tx;
  const revealReach = Math.min(3, mark.width * .08, length * .012);
  const anchor = station(length - revealReach);
  if (anchor.inkLoad <= .15) return [];
  const count = 1 + (hash(mark.seed, 0, 1100) > .76 ? 1 : 0), result: Band[] = [];
  for (let fiber = 0; fiber < count; fiber++) {
    // At most 7 scene units forward and 1 sideways beyond the final source tip.
    // The radius is subpixel and the deposit is deliberately much paler than ink.
    const extension = Math.min(7, mark.width * .20, length * .015) * (.35 + hash(mark.seed, fiber, 1101) * .65);
    const side = hash(mark.seed, fiber, 1102) * 2 - 1;
    const sway = Math.min(1, mark.width * .03) * side;
    const rootOffset = Math.min(.65, anchor.halfWidth * .35) * side;
    const startX = anchor.centerX + nx * rootOffset, startY = anchor.centerY + ny * rootOffset;
    const endX = last.x + tx * extension + nx * sway, endY = last.y + ty * extension + ny * sway;
    const controlX = last.x + tx * extension * .2 - nx * sway * .30;
    const controlY = last.y + ty * extension * .2 - ny * sway * .30;
    const points = Array.from({ length: 9 }, (_, index) => {
      const t = index / 8, u = 1 - t;
      const vx = 2 * (controlX - startX) * u + 2 * (endX - controlX) * t;
      const vy = 2 * (controlY - startY) * u + 2 * (endY - controlY) * t;
      const speed = Math.hypot(vx, vy), radius = Math.min(.22, Math.max(.10, mark.width * .0045)) * Math.pow(u, 1.5);
      return { x: startX * u * u + 2 * controlX * u * t + endX * t * t,
        y: startY * u * u + 2 * controlY * u * t + endY * t * t,
        nx: speed > 1e-8 ? -vy / speed : nx, ny: speed > 1e-8 ? vx / speed : ny,
        left: radius, right: radius, distance: length - revealReach + t * revealReach };
    });
    result.push({ points, alpha: mark.opacity * Math.min(last.inkLoad, anchor.inkLoad)
      * (.065 + hash(mark.seed, fiber, 1103) * .045) });
  }
  return result;
}

function prepare(mark: StrokeMark): Plan {
  // Mutable JSON must be re-evaluated when callers edit it in place.
  const immutable = Object.isFrozen(mark) && Object.isFrozen(mark.points) && mark.points.every(Object.isFrozen)
    && !!mark.brush && Object.isFrozen(mark.brush) && Object.isFrozen(mark.brush.controls) && mark.brush.controls.every(Object.isFrozen);
  const stored = immutable ? cache.get(mark) : undefined;
  if (stored) return stored;
  const samples = sampleBrushContact(mark), bands: Band[] = [];
  const length = samples.at(-1)!.distance;
  // Material coordinates follow arc length, independently of playback time.
  // Both sides stay inside the authored contact envelope, but they do not
  // inherit the same edge. The tip trajectory and pressure data remain intact.
  const wetBody = samples.map(sample => {
      const fineScale = Math.max(1.4, mark.width * .075);
      const broadScale = Math.max(5, mark.width * .38);
      const leftGrain = noise(mark.seed, sample.distance / fineScale, 600);
      const rightGrain = noise(mark.seed, sample.distance / fineScale + 7.3, 601);
      const leftBody = noise(mark.seed, sample.distance / broadScale, 620);
      const rightBody = noise(mark.seed, sample.distance / broadScale + 3.7, 621);
      const side = sample.side * Math.sin(sample.angle);
      const roughness = (.035 + sample.pressure * .075 + sample.dryness * .10)
        * Math.min(1, mark.width / 5);
      const leftRough = roughness * (1 + Math.max(0, -side) * 2.1);
      const rightRough = roughness * (1 + Math.max(0, side) * 2.1);
      // Dry contact has no unbroken undercoat. Broad deposits interlock with
      // the tufts below instead of surrounding them with a smooth grey ribbon.
      const contact = clamp(1 - Math.pow(sample.dryness / .76, 1.18)) * sample.inkLoad;
      const left = clamp(contact * (1 - leftRough * (.25 + leftGrain * .75)
        - (1 - leftBody) * .10));
      const right = clamp(contact * (1 - rightRough * (.25 + rightGrain * .75)
        - (1 - rightBody) * .10));
      return { x: sample.centerX, y: sample.centerY, nx: sample.nx, ny: sample.ny,
        left: sample.halfWidth * left, right: sample.halfWidth * right, distance: sample.distance };
  });
  // Unequal tufts contain a broad deposit and narrower offshoots. Their spacing
  // and breadth vary together; this avoids equally spaced parallel comb teeth.
  const count = 7 + Math.floor(hash(mark.seed, 0, 700) * 3);
  const weights = Array.from({ length: count }, (_, group) => .35 + hash(mark.seed, group, 701) * 1.3);
  const sum = weights.reduce((a, b) => a + b, 0);
  let before = 0;
  for (let fiber = 0; fiber < count * 3; fiber++) {
    const group = Math.floor(fiber / 3), branch = fiber % 3;
    if (branch === 0 && group > 0) before += weights[group - 1]!;
    const centerOfTuft = -1 + (before + weights[group]! * .5) / sum * 2;
    const offset = clamp(centerOfTuft + (branch === 0 ? 0 : (hash(mark.seed, fiber, 702) - .5) * .19), -.96, .96);
    const breadth = branch === 0 ? weights[group]! / sum * (.76 + hash(mark.seed, group, 703) * .74)
      : (.055 + hash(mark.seed, fiber, 704) * .24) / count;
    const phase = hash(mark.seed, group, 705) * 17;
    const points = samples.map((sample, index) => {
      const along = sample.distance / Math.max(3, mark.width * (.14 + hash(mark.seed, group, 706) * .45));
      const shared = noise(mark.seed, along * .65 + phase, 710 + group);
      const local = noise(mark.seed, along * 1.7 + phase, 800 + fiber);
      const slow = noise(mark.seed, along * .27 + phase, 900 + group);
      const contact = local * .33 + shared * .5 + slow * .17;
      const rupture = noise(mark.seed, sample.distance / Math.max(3, mark.width * .30), 720);
      const roughSide = Math.max(0, -offset * sample.side * Math.sin(sample.angle));
      const threshold = .025 + Math.pow(sample.dryness, 1.25) * .52 + (1 - sample.inkLoad) * .48
        + sample.dryness * clamp(.48 - rupture) * .50 + roughSide * .14;
      const amount = clamp((contact - threshold) / .19);
      const taper = amount * amount * (3 - 2 * amount);
      const wander = ((slow - .5) * .24 + (shared - .5) * .12) * Math.min(1, mark.width / 5);
      const center = clamp(offset + wander, -.99, .99) * sample.halfWidth;
      // Tufts release at different distances near nonzero-pressure endpoints;
      // zero-pressure endpoints still collapse exactly to the authored tip.
      const endReach = Math.min(length * .08, mark.width * .20);
      const entryDistance = hash(mark.seed, group, 730) * endReach;
      const finishDistance = hash(mark.seed, group, 731) * endReach;
      const ends = endReach > 0 ? clamp((sample.distance + endReach - entryDistance) / endReach)
        * clamp((length - sample.distance + endReach - finishDistance) / endReach) : 1;
      const radius = Math.max(0, Math.min(sample.halfWidth - Math.abs(center),
        sample.halfWidth * breadth * (.48 + slow * 1.2) * taper * ends)) * sample.inkLoad;
      const edge = noise(mark.seed, sample.distance / Math.max(1.2, mark.width * .055), 950 + fiber);
      // Wet tufts merge into the same silhouette as the body. Otherwise their
      // separate parallel strands would trace a second outline outside it.
      // As contact dries, the envelope opens up into actual spaces between tufts.
      const wet = clamp((.48 - sample.dryness) / .32);
      const upper = sample.halfWidth * (1 - wet) + wetBody[index]!.left * wet;
      const lower = -sample.halfWidth * (1 - wet) - wetBody[index]!.right * wet;
      const clippedCenter = clamp(center, lower, upper);
      const left = Math.max(0, Math.min(upper, center + radius * (.72 + edge * .28)) - clippedCenter);
      const right = Math.max(0, clippedCenter - Math.max(lower, center - radius * (1 - edge * .28)));
      return { x: sample.centerX + sample.nx * clippedCenter, y: sample.centerY + sample.ny * clippedCenter,
        nx: sample.nx, ny: sample.ny, left, right, distance: sample.distance };
    });
    bands.push(...split(points, mark.opacity * (branch === 0 ? .65 + hash(mark.seed, group, 740) * .30
      : .40 + hash(mark.seed, fiber, 741) * .46)));
  }
  // One wet body avoids concentric opacity shoulders. Drawing it last joins
  // the wetter tufts into a single deposit while leaving the dry gaps transparent.
  bands.push(...split(wetBody, mark.opacity * .94));
  bands.push(...releaseFilaments(mark, samples));
  const plan = { length, bands };
  if (immutable) cache.set(mark, plan);
  return plan;
}
function prefix(points: readonly BandPoint[], distance: number): readonly BandPoint[] {
  if (!points.length || points[0]!.distance >= distance) return [];
  if (points.at(-1)!.distance <= distance) return points;
  const end = points.findIndex(point => point.distance >= distance);
  const a = points[end - 1]!, b = points[end]!, t = (distance - a.distance) / (b.distance - a.distance);
  const nx = a.nx * (1 - t) + b.nx * t, ny = a.ny * (1 - t) + b.ny * t, magnitude = Math.hypot(nx, ny);
  return [...points.slice(0, end), { x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t,
    nx: magnitude > 1e-8 ? nx / magnitude : b.nx, ny: magnitude > 1e-8 ? ny / magnitude : b.ny,
    left: a.left * (1 - t) + b.left * t, right: a.right * (1 - t) + b.right * t, distance }];
}
function ribbon(ctx: CanvasRenderingContext2D, points: readonly BandPoint[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x + point.nx * point.left, y = point.y + point.ny * point.left;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const last = points.at(-1)!;
  const lastCap = (last.left + last.right) * .28;
  ctx.quadraticCurveTo(last.x + last.ny * lastCap, last.y - last.nx * lastCap,
    last.x - last.nx * last.right, last.y - last.ny * last.right);
  for (let i = points.length - 2; i >= 0; i--) {
    const point = points[i]!;
    ctx.lineTo(point.x - point.nx * point.right, point.y - point.ny * point.right);
  }
  const first = points[0]!;
  const firstCap = (first.left + first.right) * .28;
  ctx.quadraticCurveTo(first.x - first.ny * firstCap, first.y + first.nx * firstCap,
    first.x + first.nx * first.left, first.y + first.ny * first.left);
  ctx.closePath(); ctx.fill();
}

/** Renderer-only deposit plan; no browser globals are needed by the data core. */
export function drawContactStroke(ctx: CanvasRenderingContext2D, mark: StrokeMark, progress: number): void {
  const plan = prepare(mark);
  ctx.save();
  try {
    if (mark.clip) {
      ctx.beginPath(); mark.clip.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath(); ctx.clip();
    }
    ctx.fillStyle = '#171b18';
    ctx.fillStyle = mark.ink;
    for (const band of plan.bands) {
      ctx.globalAlpha = band.alpha;
      ribbon(ctx, prefix(band.points, plan.length * progress));
    }
  } finally { ctx.restore(); }
}
