import { createInkScene, createRandom, pointInPolygon } from '../dist/index.js';

export const rockStudyInputs = Object.freeze({
  seed: 261119, width: 600, height: 420, time: 6,
  textureCount: 42, boneCount: 6, strokeCount: 48,
});

const points = coordinates => coordinates.map(([x, y, pressure]) =>
  pressure === undefined ? { x, y } : { x, y, pressure });
const INK = '#252525';

// These two shapes are authored inputs, not a mountain template in the library.
// A caller may supply different outline, faces, clusters, bone paths and washes
// to drawRock. Face regions guide placement; only the whole rock clips pigment.
export const rockShapes = {
  upright: {
    outline: points([[130,350],[153,278],[147,235],[169,180],[188,143],
      [208,95],[271,63],[323,86],[345,148],[369,174],[397,266],[428,342],
      [396,377],[311,368],[256,390],[202,374]]),
    faces: [
      { id: 'light', role: '亮面', count: 4, direction: { x: 1, y: .35 },
        outline: points([[188,143],[208,95],[271,63],[323,86],[345,148],[309,167],[250,155]]),
        clusters: [{ x: 248, y: 112, rx: 36, ry: 24 }, { x: 305, y: 124, rx: 25, ry: 20 }] },
      { id: 'side', role: '侧面', count: 14, direction: { x: -.48, y: 1 },
        flow: point => ({ x: -.32 - (point.x - 160) * .0018, y: 1 }),
        outline: points([[188,143],[250,155],[309,167],[299,228],[314,294],[311,368],
          [256,390],[202,374],[130,350],[153,278],[147,235],[169,180]]),
        clusters: [{ x: 219, y: 204, rx: 28, ry: 29 }, { x: 208, y: 304, rx: 40, ry: 34 },
          { x: 275, y: 334, rx: 24, ry: 25 }] },
      { id: 'dark', role: '暗面', count: 24, direction: { x: .44, y: 1 },
        flow: point => ({ x: .12 + (point.y - 170) * .0024 + Math.sin(point.y * .045) * .22, y: 1 }),
        outline: points([[309,167],[345,148],[369,174],[397,266],[428,342],[396,377],
          [311,368],[314,294],[299,228]]),
        clusters: [{ x: 329, y: 202, rx: 25, ry: 32 }, { x: 354, y: 241, rx: 32, ry: 30 },
          { x: 338, y: 280, rx: 32, ry: 33 }, { x: 381, y: 316, rx: 33, ry: 29 },
          { x: 355, y: 345, rx: 31, ry: 18 }] },
    ],
    washes: [
      { outline: points([[182,279],[179,235],[207,196],[244,170],[270,189],[259,246],
        [275,282],[254,349],[218,365],[165,337]]), opacity: .032 },
      { outline: points([[324,183],[351,179],[372,236],[366,270],[398,314],[403,351],
        [372,365],[333,347],[331,294],[313,255]]), opacity: .047 },
    ],
    bones: [
      { path: points([[148,235,.08],[169,180,.5],[188,143,.3],[208,95,.76],[270,64,.1]]), width: 8, dryness: .43, smoothing: 'linear' },
      { path: points([[272,64,.2],[323,86,.8],[344,147,.1]]), width: 10, dryness: .48, smoothing: 'linear' },
      { path: points([[309,166,.1],[302,212,.55],[310,232,.75],[296,258,.24],
        [313,292,.65],[306,326,.15],[312,366,.08]]), width: 9, dryness: .4, smoothing: 'linear' },
      { path: points([[345,151,.13],[368,175,.6],[387,231,.15]]), width: 8, dryness: .57, smoothing: 'catmull-rom' },
      { path: points([[133,349,.15],[169,351,.7],[202,374,.4],[255,388,.05]]), width: 7, dryness: .61, smoothing: 'linear' },
      { path: points([[248,176,.12],[223,230,.65],[230,260,.5],[206,296,.02]]), width: 5, dryness: .64, smoothing: 'catmull-rom' },
    ],
  },
  reclining: {
    outline: points([[93,320],[126,280],[168,272],[204,214],[256,190],[312,173],
      [369,196],[392,229],[452,248],[497,292],[513,340],[465,366],[382,358],
      [322,377],[250,361],[193,375],[141,351]]),
    faces: [
      { id: 'light', role: '亮面', count: 4, direction: { x: 1, y: -.16 },
        outline: points([[126,280],[168,272],[204,214],[256,190],[312,173],[369,196],
          [392,229],[334,262],[270,250],[210,278]]),
        clusters: [{ x: 244, y: 225, rx: 33, ry: 18 }, { x: 327, y: 221, rx: 30, ry: 18 }] },
      { id: 'side', role: '侧面', count: 14, direction: { x: -.9, y: .68 },
        flow: point => ({ x: -.8, y: .18 + (point.x - 170) * .003 }),
        outline: points([[126,280],[210,278],[270,250],[334,262],[330,319],[322,377],
          [250,361],[193,375],[141,351],[93,320]]),
        clusters: [{ x: 173, y: 322, rx: 35, ry: 17 }, { x: 253, y: 313, rx: 35, ry: 28 },
          { x: 293, y: 347, rx: 18, ry: 16 }] },
      { id: 'dark', role: '暗面', count: 24, direction: { x: .65, y: .85 },
        flow: point => ({ x: .25 + (point.x - 335) * .005, y: .85 }),
        outline: points([[334,262],[392,229],[452,248],[497,292],[513,340],[465,366],
          [382,358],[322,377],[330,319]]),
        clusters: [{ x: 367, y: 278, rx: 27, ry: 20 }, { x: 411, y: 292, rx: 35, ry: 24 },
          { x: 384, y: 325, rx: 35, ry: 25 }, { x: 462, y: 324, rx: 28, ry: 21 },
          { x: 417, y: 343, rx: 37, ry: 13 }] },
    ],
    washes: [
      { outline: points([[123,314],[166,293],[200,296],[247,272],[282,278],[310,298],
        [297,342],[261,349],[230,340],[185,356],[143,335]]), opacity: .032 },
      { outline: points([[350,279],[391,252],[435,271],[454,300],[485,319],[480,341],
        [448,351],[410,338],[375,350],[345,339]]), opacity: .047 },
    ],
    bones: [
      { path: points([[95,319,.1],[126,280,.65],[168,272,.3],[204,214,.7],[255,190,.1]]), width: 8, dryness: .43, smoothing: 'linear' },
      { path: points([[258,190,.15],[312,173,.8],[369,196,.45],[391,228,.1]]), width: 10, dryness: .48, smoothing: 'linear' },
      { path: points([[334,262,.2],[326,290,.65],[333,305,.25],[320,331,.55],
        [322,346,.12],[314,363,.04]]), width: 9, dryness: .4, smoothing: 'linear' },
      { path: points([[393,230,.15],[451,248,.6],[490,286,.1]]), width: 8, dryness: .57, smoothing: 'catmull-rom' },
      { path: points([[96,320,.12],[143,350,.7],[193,374,.4],[250,362,.05]]), width: 7, dryness: .61, smoothing: 'linear' },
      { path: points([[270,253,.12],[240,290,.65],[252,316,.5],[228,341,.02]]), width: 5, dryness: .64, smoothing: 'catmull-rom' },
    ],
  },
};

function bounds(outline) {
  return outline.reduce((box, point) => ({ minX: Math.min(box.minX, point.x), minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x), maxY: Math.max(box.maxY, point.y) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function pathLength(path) {
  return path.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0);
}

function pigmentProxy(mark) {
  let weightedLength = 0;
  for (let i = 1; i < mark.points.length; i++) {
    const a = mark.points[i - 1], b = mark.points[i];
    weightedLength += Math.hypot(b.x - a.x, b.y - a.y) * ((a.pressure ?? 1) + (b.pressure ?? 1)) * .5;
  }
  return weightedLength * mark.width * mark.opacity;
}

function profiles(seed) {
  const random = createRandom(seed ^ 0x26b489a1);
  return Array.from({ length: 42 }, (_, index) => {
    const strength = random();
    const kind = ['cut', 'rub', 'crack'][index % 3];
    const length = kind === 'cut' ? 36 + random() * 28 : kind === 'rub' ? 26 + random() * 36 : 17 + random() * 26;
    const bend = (random() - .5) * length * (kind === 'crack' ? .34 : .18);
    const path = kind === 'cut'
      ? points([[-length*.5,0,.75+random()*.18],[-length*.34,bend*.2,1],
        [length*.04,bend*.9,.35+random()*.17],[length*.31,-bend*.35,.52],[length*.5,-bend*.6,.12]])
      : kind === 'rub'
        ? points([[-length*.5,0,.25],[-length*.34,bend*.8,.72],[-length*.07,-bend*.2,.23],
          [length*.14,bend*.5,.6],[length*.36,bend*.2,.18],[length*.5,-bend*.2,.09]])
        : points([[-length*.5,0,.16],[-length*.13,-bend*.8,.65],
          [length*.07,bend*1.8,.32],[length*.5,bend*.2,.04]]);
    const width = kind === 'cut' ? 12 + strength*18 : kind === 'rub' ? 9 + strength*17 : 2.4 + strength*4.2;
    const opacity = kind === 'cut' ? .42+strength*.3 : kind === 'rub' ? .3+strength*.32 : .42+strength*.25;
    const dryness = kind === 'cut' ? .24+random()*.2 : kind === 'rub' ? .55+random()*.18 : .3+random()*.3;
    const proxy = pigmentProxy({ points: path, width, opacity });
    return { index, kind, strength: proxy, width, opacity, dryness,
      nib: kind === 'crack' ? 'round' : 'flat', smoothing: kind === 'rub' ? 'catmull-rom' : 'linear',
      tipOffset: .55 + random()*.45, seed: (seed ^ Math.imul(index + 1, 0x6d2b79f5)) >>> 0, path };
  });
}

function localPath(profile, direction) {
  const magnitude = Math.hypot(direction.x, direction.y);
  const dx = direction.x / magnitude, dy = direction.y / magnitude;
  return profile.path.map(point => ({ x: point.x * dx - point.y * dy,
    y: point.x * dy + point.y * dx, pressure: point.pressure }));
}

function placePath(random, profile, region, whole, cluster, directionAt) {
  const box = bounds(region);
  for (let attempt = 0; attempt < 5000; attempt++) {
    let anchor;
    if (cluster && attempt < 300) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random());
      anchor = { x: cluster.x + Math.cos(angle) * radius * cluster.rx,
        y: cluster.y + Math.sin(angle) * radius * cluster.ry };
    } else {
      anchor = { x: box.minX + random() * (box.maxX - box.minX),
        y: box.minY + random() * (box.maxY - box.minY) };
    }
    if (!pointInPolygon(anchor, region)) continue;
    const direction = directionAt(anchor);
    const path = localPath(profile, direction).map(point => ({ ...point, x: point.x + anchor.x, y: point.y + anchor.y }));
    if (path.every(point => pointInPolygon(point, whole))) return { path, anchor, direction };
  }
  throw new RangeError('Rock stroke could not fit its caller-defined region');
}

/**
 * Example-level composition with editable caller-supplied geometry. This adds
 * ordinary stroke/wash data to a builder; it does not extend the renderer API.
 * Exactly the same profile list is rotated/translated between treatments.
 */
export function drawRock(builder, geometry, treatment, {
  seed = rockStudyInputs.seed, prefix = 'rock', x = 0, y = 0, scale = 1, inkScale = 1,
} = {}) {
  if (treatment !== 'uniform' && treatment !== 'structured') throw new RangeError('Unknown rock treatment');
  if (!(scale > 0) || !Number.isFinite(scale)) throw new RangeError('Rock scale must be positive');
  if (!(inkScale > 0 && inkScale <= 1)) throw new RangeError('Rock inkScale must be in 0..1');
  if (geometry.faces.reduce((sum, face) => sum + face.count, 0) !== 42) {
    throw new RangeError('Rock face counts must sum to 42');
  }
  const transform = point => ({ ...point, x: x + point.x * scale, y: y + point.y * scale });
  const outline = geometry.outline.map(transform);
  const metadata = geometry.faces.map(face => ({ id: face.id, role: face.role,
    outline: face.outline.map(transform), direction: face.direction, count: 0, opacityTotal: 0, pigmentProxy: 0 }));
  builder.wash(outline, { id: `${prefix}-wash-base`, ink: INK, opacity: .035 * inkScale,
    roughness: .32, passes: 4, seed: seed ^ 0x2513, duration: .7 });
  geometry.washes.forEach((wash, index) => builder.wash(wash.outline.map(transform), {
    id: `${prefix}-wash-patch-${index + 1}`, ink: INK, opacity: wash.opacity * inkScale,
    roughness: .65, passes: 4, seed: (seed ^ Math.imul(index + 1, 173)) >>> 0, duration: .7,
  }));

  const styles = profiles(seed);
  const ordered = treatment === 'structured' ? [...styles].sort((a, b) => a.strength - b.strength) : styles;
  const textureIds = [];
  const assignments = [];
  let profileIndex = 0;
  let budget = 0;
  const directionRandom = createRandom(seed ^ 0x75a9c123);
  for (const profile of ordered) {
    let face;
    let slot = profileIndex;
    if (treatment === 'structured') {
      for (const candidate of geometry.faces) {
        if (slot < candidate.count) { face = candidate; break; }
        slot -= candidate.count;
      }
      if (!face) throw new RangeError('Rock face counts must sum to 42');
    }
    const jitter = (directionRandom() - .5) * (face ? .48 : .08);
    const directionAt = anchor => {
      const baseDirection = face?.flow?.(anchor) ?? face?.direction ?? { x: .23, y: 1 };
      const angle = Math.atan2(baseDirection.y, baseDirection.x) + jitter;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    };
    const cluster = face?.clusters?.[slot % face.clusters.length];
    const random = createRandom(profile.seed ^ 0x1ed9527b);
    const placed = placePath(random, profile, face?.outline ?? geometry.outline,
      geometry.outline, cluster, directionAt);
    const direction = placed.direction;
    const angle = Math.atan2(direction.y, direction.x);
    const assignedFace = face ?? geometry.faces.find(candidate => pointInPolygon(placed.anchor, candidate.outline));
    const id = `${prefix}-texture-${profile.index + 1}`;
    const mark = builder.stroke(placed.path.map(transform), {
      id, width: profile.width * scale, opacity: profile.opacity * inkScale, ink: INK,
      dryness: profile.dryness, nib: profile.nib, tipAngle: angle - profile.tipOffset,
      smoothing: profile.smoothing, seed: profile.seed, clip: outline,
      start: .5 + profile.index * .022, duration: .8,
    });
    const proxy = pigmentProxy(mark);
    const record = metadata.find(item => item.id === assignedFace?.id);
    if (record) { record.count++; record.opacityTotal += mark.opacity; record.pigmentProxy += proxy; }
    textureIds.push(id);
    assignments.push({ id, styleId: profile.index + 1, kind: profile.kind, face: assignedFace?.id ?? 'unassigned',
      anchor: transform(placed.anchor), direction, length: pathLength(mark.points), pigmentProxy: proxy });
    budget += proxy;
    profileIndex++;
  }
  const boneIds = geometry.bones.map((bone, index) => {
    const id = `${prefix}-bone-${index + 1}`;
    builder.stroke(bone.path.map(transform), { id, width: bone.width * scale,
      ink: INK, opacity: .7 * inkScale, dryness: bone.dryness, smoothing: bone.smoothing,
      nib: 'round', seed: (seed ^ Math.imul(index + 1, 977)) >>> 0, clip: outline,
      start: .15 + index * .08, duration: .9 });
    return id;
  });
  return {
    outline, faces: metadata.map(face => ({ ...face, meanOpacity: face.count ? face.opacityTotal / face.count : 0 })),
    faceCounts: Object.fromEntries(metadata.map(face => [face.id, face.count])),
    textureIds, boneIds, assignments, textureCount: textureIds.length, boneCount: boneIds.length,
    styleBudget: { widthTotal: styles.reduce((sum, style) => sum + style.width * scale, 0),
      opacityTotal: styles.reduce((sum, style) => sum + style.opacity * inkScale, 0), pigmentProxy: budget },
  };
}

export function makeRockComparisons({ seed = rockStudyInputs.seed } = {}) {
  return ['upright', 'reclining'].flatMap(shape => ['uniform', 'structured'].map(treatment => {
    const builder = createInkScene({ width: rockStudyInputs.width, height: rockStudyInputs.height,
      seed, background: '#f2efe5' });
    const analysis = drawRock(builder, rockShapes[shape], treatment, { seed, prefix: shape });
    return { id: `${shape}-${treatment}`, shape, treatment,
      label: `${shape === 'upright' ? '直立石' : '斜卧石'} · ${treatment === 'uniform' ? '均匀皴擦' : '分面组织'}`,
      description: treatment === 'uniform' ? '42笔均匀落点、近似统一走向；共享底墨与6条骨线。'
        : '同一套42笔：亮面4、侧面14、暗面24；改变落点、方向及样式分配。',
      scene: builder.snapshot(), analysis };
  }));
}

export function makeRockLandscape(treatment, { seed = rockStudyInputs.seed } = {}) {
  const builder = createInkScene({ width: 1200, height: 760, seed, background: '#f2efe5' });
  const placements = [
    { shape: 'reclining', x: 710, y: 192, scale: .68, inkScale: .38 },
    { shape: 'upright', x: 104, y: -6, scale: 1.46, inkScale: .78 },
    { shape: 'reclining', x: -76, y: 326, scale: 1.13, inkScale: 1 },
  ];
  placements.forEach((placement, index) => drawRock(builder, rockShapes[placement.shape], treatment, {
    ...placement, seed: (seed ^ Math.imul(index + 1, 2137)) >>> 0, prefix: `landscape-${index + 1}`,
  }));
  return builder.snapshot();
}
