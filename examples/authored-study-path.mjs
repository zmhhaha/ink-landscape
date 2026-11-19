// Authoring helpers for these original study fixtures. The returned samples are
// ordinary editable source points; they are not hidden renderer displacement,
// a traditional preset, or a simulation of physical hand/paper interaction.
const hash = (seed, index) => {
  let value = (seed ^ Math.imul(index, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
};
const noise = (seed, at) => {
  const index = Math.floor(at), t = at - index, ease = t * t * (3 - 2 * t);
  return hash(seed, index) * (1 - ease) + hash(seed, index + 1) * ease - .5;
};

/** Fixed author key, independent of the scene's material seed and controls. */
export function authoredPathTexture(values, key, { step = 8, amplitude = .65, smooth = false } = {}) {
  let seed = 2166136261;
  for (const character of key) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const result = [values[0].slice()];
  let distance = 0;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const previous = values[Math.max(0, i - 2)], next = values[Math.min(values.length - 1, i + 1)];
    const beforeLength = Math.hypot(a[0] - previous[0], a[1] - previous[1]);
    const afterLength = Math.hypot(next[0] - b[0], next[1] - b[1]);
    // Chord-length Hermite tangents preserve every original anchor and meet in
    // the same direction across it. Smooth long-line gestures are sampled as
    // curves before adding texture; otherwise dense straight segments would
    // lock the original large corners into subsequent spline interpolation.
    const tangentA = [(b[0] - previous[0]) * length / (beforeLength + length || 1),
      (b[1] - previous[1]) * length / (beforeLength + length || 1)];
    const tangentB = [(next[0] - a[0]) * length / (length + afterLength || 1),
      (next[1] - a[1]) * length / (length + afterLength || 1)];
    const count = Math.max(1, Math.ceil(length / step));
    for (let j = 1; j <= count; j++) {
      if (j === count) { result.push(b.slice()); continue; }
      const t = j / count, at = distance + length * t;
      const amount = amplitude * Math.sin(t * Math.PI) ** (smooth ? 2 : 1)
        * (noise(seed, at / 5.7) * 1.25 + noise(seed ^ 0x51ed270b, at / 19.3) * .75);
      const h0 = 2 * t ** 3 - 3 * t ** 2 + 1, h1 = t ** 3 - 2 * t ** 2 + t;
      const h2 = -2 * t ** 3 + 3 * t ** 2, h3 = t ** 3 - t ** 2;
      const x = smooth ? h0 * a[0] + h1 * tangentA[0] + h2 * b[0] + h3 * tangentB[0] : a[0] + dx * t;
      const y = smooth ? h0 * a[1] + h1 * tangentA[1] + h2 * b[1] + h3 * tangentB[1] : a[1] + dy * t;
      const tx = smooth ? (6 * t ** 2 - 6 * t) * a[0] + (3 * t ** 2 - 4 * t + 1) * tangentA[0]
        + (-6 * t ** 2 + 6 * t) * b[0] + (3 * t ** 2 - 2 * t) * tangentB[0] : dx;
      const ty = smooth ? (6 * t ** 2 - 6 * t) * a[1] + (3 * t ** 2 - 4 * t + 1) * tangentA[1]
        + (-6 * t ** 2 + 6 * t) * b[1] + (3 * t ** 2 - 2 * t) * tangentB[1] : dy;
      const tangentLength = Math.hypot(tx, ty) || 1;
      result.push([x - ty / tangentLength * amount, y + tx / tangentLength * amount,
        (a[2] ?? 1) * (1 - t) + (b[2] ?? 1) * t]);
    }
    distance += length;
  }
  return result;
}

/** Scene-space authoring aid; a positive inset points down into these rock faces. */
export function insetFromAuthoredRidge([x, y], ridges, inset) {
  let selected;
  for (const values of ridges) for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length ** 2));
    const px = a[0] + dx * t, py = a[1] + dy * t, distance = Math.hypot(x - px, y - py);
    if (!selected || distance < selected.distance) selected = { px, py, distance, nx: -dy / length, ny: dx / length };
  }
  if (!selected) return [x, y];
  const direction = selected.ny < 0 ? -1 : 1;
  return [selected.px + selected.nx * inset * direction, selected.py + selected.ny * inset * direction];
}

/** An explicitly selected authored branch and node, in root-to-tip order. */
export function authoredBranchAttachment(branch, [x, y]) {
  const index = branch.findIndex(point => Math.hypot(point[0] - x, point[1] - y) < 1e-8);
  if (index < 0) throw new RangeError('The selected leaf root must be an authored branch node');
  const before = branch[Math.max(0, index - 1)], after = branch[Math.min(branch.length - 1, index + 1)];
  const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.hypot(dx, dy);
  if (length === 0) throw new RangeError('An authored attachment needs a growth direction');
  return { x, y, tx: dx / length, ty: dy / length, nx: -dy / length, ny: dx / length };
}

/**
 * A small 2D projection authored into ordinary leaf source points. Front/edge/
 * back mean selected width, shortening and curl conventions for these studies;
 * they are not an inferred 3D surface, light solver or botanical preset. Back
 * leaves carry a local backlit-fold accent selected for these examples; this
 * does not imply that every rear-facing leaf must be darker.
 */
export function authoredGrowthLeaf(frame, { length, spread, face = 'front', curl = 0, stem = 2.3 } = {}) {
  const projection = {
    front: { across: 1, along: 1, width: 1, load: 1, tone: 1, curl: 1 },
    edge: { across: .4, along: .88, width: .4, load: .84, tone: .8, curl: .55 },
    back: { across: -.78, along: .91, width: .68, load: .96, tone: 1.08, curl: -1 },
  }[face];
  if (!projection) throw new RangeError('Unknown authored leaf projection');
  const along = Math.cos(spread) * length * projection.along;
  const across = Math.sin(spread) * length * projection.across;
  const dx = frame.tx * along + frame.nx * across, dy = frame.ty * along + frame.ny * across;
  const bend = curl * projection.curl;
  return {
    values: [[frame.x, frame.y, .42], [frame.x + frame.tx * stem, frame.y + frame.ty * stem, .65],
      [frame.x + dx * .34 + frame.nx * bend * .5, frame.y + dy * .34 + frame.ny * bend * .5, 1],
      [frame.x + dx * .73 + frame.nx * bend, frame.y + dy * .73 + frame.ny * bend, .67],
      [frame.x + dx, frame.y + dy, .05]],
    widthScale: projection.width, inkLoad: projection.load, opacityScale: projection.tone,
  };
}
