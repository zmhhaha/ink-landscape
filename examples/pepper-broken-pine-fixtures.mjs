import { createVegetationDocument, createSplitVegetationUnit, transformVegetationUnit } from '../dist/index.js';

export const pepperBrokenPineInputs = Object.freeze({ seed: 261131, layout: 'slope', widthScale: 1, dryness: .43, time: 8 });
export const pepperBrokenPineSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const cache = new Map();
function compiled(units, options) {
  const key = JSON.stringify([units, options]);
  let result = cache.get(key);
  if (result) cache.delete(key); else result = createVegetationDocument(units, options);
  cache.set(key, result);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return result;
}
const transfer = (point, layout) => layout === 'arc'
  ? { ...point, x: 280 + (point.x - 280) * .9, y: 118 + (point.y - 118) * .82 + 20 * Math.sin((point.x - 50) * Math.PI / 460) }
  : layout === 'fold' ? { ...point, x: point.x + .16 * (point.y - 130), y: point.y * .84 + 28 - 16 * Math.max(0, Math.min(1, (point.x - 260) / 60)) }
    : { ...point };
const rotate = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
const plain = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear',
  controls: [{ at: 0, pressure: 1, side: 0, angle: Math.PI / 2 }, { at: 1, pressure: 1, side: 0, angle: Math.PI / 2 }] };
const dabContact = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'catmull-rom',
  controls: [{ at: 0, pressure: .56, side: .06, angle: 1.42 }, { at: .35, pressure: 1, side: .2, angle: 1.56 },
    { at: .75, pressure: .84, side: .13, angle: 1.38 }, { at: 1, pressure: .24, side: .05, angle: 1.5 }] };
const splitContact = { ...dabContact, axis: 'side', controls: [
  { at: 0, pressure: .48, side: .22, angle: 1.35 }, { at: .26, pressure: 1, side: .45, angle: 1.6 },
  { at: .7, pressure: .82, side: .28, angle: 1.42 }, { at: 1, pressure: .1, side: .08, angle: 1.5 }] };
const needleContact = { ...plain, smoothing: 'catmull-rom', controls: [
  { at: 0, pressure: .6, side: .02, angle: 1.5 }, { at: .22, pressure: 1, side: .06, angle: 1.45 },
  { at: .7, pressure: .64, side: .04, angle: 1.6 }, { at: 1, pressure: .05, side: .01, angle: 1.5 }] };

// Original authored branches and cluster anchors. The library does not infer a
// tree, fill a crown or choose the historical stroke sequence from these paths.
const anchors = [[111, 93], [179, 66], [247, 43], [327, 63], [403, 91], [452, 148], [347, 170], [212, 166], [130, 192]];
const branchGuides = [
  [[279, 239, .9], [272, 174, .82], [266, 128, .72], [277, 88, .52], [247, 43, .12]],
  [[277, 88, .64], [220, 95, .51], [179, 66, .38], [111, 93, .08]],
  [[277, 88, .61], [327, 63, .42], [403, 91, .08]],
  [[266, 128, .63], [212, 166, .44], [130, 192, .08]],
  [[272, 174, .62], [347, 170, .43], [452, 148, .08]],
];
// A hand-authored irregular dot cloud, with corridors retained between clusters.
// Its first point is the branch anchor; seed never changes this arrangement.
const dotOffsets = [[0, 0], [-7, -3], [5, -7], [-3, -11], [-14, -8], [13, -2], [11, -13], [-10, -18],
  [1, -20], [21, -10], [-22, -14], [-18, 2], [8, 5], [20, 1], [-3, 8], [-17, -24], [10, -26], [26, -20],
  [-29, -4], [30, -2], [-9, 4], [16, -20], [-3, -29], [24, 9], [-24, -24], [5, 14], [-19, 11], [33, -13],
  [-33, -16], [-8, 16], [16, 14], [3, -35], [31, 5], [-28, 8], [23, -29], [-12, -33], [38, -6], [-35, 1]];
const pepperCounts = [22, 32, 26, 35, 24, 30, 38, 23, 29];
const needleOffsets = [-1.16, -.96, -.78, -.57, -.39, -.3, -.04, .1, .29, .52, .68, .93, 1.06, 1.28];
const needleCounts = [8, 12, 10, 14, 9, 11, 13, 7, 12];
const groupAngles = [-2.48, -1.95, -1.7, -1.18, -.7, -.24, -.82, -2.18, -2.58];
const lengths = [.78, 1.12, .86, 1.02, .91, .82, 1.08, .88, .96];
const bundleSets = [
  [{ id: 'center', offset: 0, width: 6.1 }, { id: 'left', offset: -6.2, width: 5.4, pressureScale: .88 }, { id: 'right', offset: 5.9, width: 5.8, pressureScale: .95 }],
  [{ id: 'center', offset: 0, width: 6.7 }, { id: 'left', offset: -7.3, width: 4.9, pressureScale: .83 }, { id: 'right', offset: 6.4, width: 5.8 }, { id: 'edge', offset: 11.4, width: 3.5, pressureScale: .68 }],
  [{ id: 'center', offset: 0, width: 7.4 }, { id: 'left', offset: -6.7, width: 5.7, pressureScale: .9 }],
];

/** Three source-authored studies; all results retain the existing document version. */
export function makePepperBrokenPineStudies(options = {}) {
  const inputs = { ...pepperBrokenPineInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown pepper/broken/pine layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const stroke = (id, values, width, start, extra = {}) => ({ id,
    points: values.map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .78, start, duration: .43, ...extra },
  });
  const structure = () => branchGuides.map((values, i) => ({ id: `branch-${i}`, role: 'structure',
    strokes: [stroke('line', values.map(([x, y, pressure]) => [x, y, Math.max(.24, pressure)]),
      4.8 - i * .45, i * .1, { opacity: .7 })] }));
  const variant = (id, label, units) => ({ id, label,
    document: compiled([...structure(), ...units], { ...pepperBrokenPineSize, technique: 'dot-leaf', seed: inputs.seed, dryness: inputs.dryness }),
  });
  const anchorFor = (i, stage) => stage === 0 ? [123 + i % 3 * 153, 53 + Math.floor(i / 3) * 73] : anchors[i];
  const local = (values, anchor, angle = 0, scale = 1) => values.map(([x, y, pressure]) => {
    const [rx, ry] = rotate([x * scale, y * scale], angle); return [anchor[0] + rx, anchor[1] + ry, pressure];
  });
  const pepper = (i, stage) => {
    const anchor = anchorFor(i, stage), count = stage === 0 ? 16 : stage === 1 ? 24 : pepperCounts[i];
    return { id: `cluster-${i}`, strokes: Array.from({ length: count }, (_, j) => {
      const offset = stage === 0 ? [(j % 4 - 1.5) * 10, (Math.floor(j / 4) - 1.5) * 10] : dotOffsets[j];
      const size = stage === 2 ? [.8, 1.1, .9, 1.24, .72][(i + j) % 5] : 1;
      const angle = stage === 2 ? [-.55, .35, -.12, .68, .05][(i * 3 + j) % 5] : 0;
      const [dx, dy] = rotate(stage === 2 ? [offset[0] * [.84, 1.07, .93, 1.16, .78, 1.04, .88, 1.13, .97][i],
        offset[1] * [1.08, .84, .97, .78, 1.1, .91, 1.03, .85, .96][i]] : offset,
      stage === 2 ? [-.18, .12, -.07, .27, -.24, .09, -.14, .21, -.03][i] : 0);
      const values = stage === 0 ? [[0, 0, 1], [0, 1.6, 1]]
        : [[0, 0, .56], [.3, .85 * size, 1], [-.25, 2.2 * size, .83], [.2, 3.1 * size, .3]];
      return stroke(`dot-${j}`, local(values, [anchor[0] + dx, anchor[1] + dy], angle),
        stage === 2 ? [3.2, 4.1, 2.8, 4.8, 3.7, 5.1][(i + j) % 6] : 4.2,
        .55 + i * .57 + j * .009, stage === 0 ? plain : { ...dabContact, opacity: stage === 2 ? [.89, .75, .63, .83][(i + j) % 4] : .8 });
    }) };
  };
  const broken = (i, stage) => {
    const anchor = anchorFor(i, stage), count = stage === 2 ? [2, 3, 3, 4, 2, 3, 3, 4, 3][i] : 2;
    const strokes = Array.from({ length: count }, (_, j) => {
      const angle = stage === 0 ? 0 : stage === 1 ? -.35 + j * .7 : (groupAngles[i] + 1.57) + [-.5, .35, .92, -1.05][j];
      const scale = stage === 2 ? lengths[i] * [1, .82, .68, .77][j] : .9;
      const position = j === 0 ? anchor : [anchor[0] + [0, 15, -13, 4][j], anchor[1] + [0, -12, -17, 13][j]];
      const values = stage === 0 ? [[0, 0, 1], [1, 9, 1], [0, 19, 1]]
        : [[0, 0, .5], [1.7, 5.5, 1], [-.8, 13.5, .84], [1, 23, .14]];
      const start = .55 + i * .57 + j * .12;
      if (stage === 0) return [stroke(`dab-${j}`, local(values, position), 16, start, plain)];
      // Split at baseline width first: global width control never moves paths.
      // These are correlated lane paths, not random holes in one painted stamp.
      const source = stroke(`dab-${j}`, local(values, position, angle, scale), 16, start, { ...splitContact,
        opacity: stage === 2 ? [.85, .7, .79, .61][(i + j) % 4] : .8 });
      const bundles = stage === 1 ? bundleSets[0] : bundleSets[(i + j) % bundleSets.length];
      const split = createSplitVegetationUnit(`split-${i}-${j}`, source, bundles);
      return split.strokes.map((member, b) => {
        // Tail length and pressure are explicit author edits after the common
        // normal-offset construction. They are saved as ordinary editable points.
        const points = member.points.map(point => ({ ...point }));
        if (stage === 2 && b > 0) {
          const last = points.at(-1), before = points.at(-2), portion = [.72, .87, .6][(i + j + b) % 3];
          points[points.length - 1] = { ...last, x: before.x + (last.x - before.x) * portion,
            y: before.y + (last.y - before.y) * portion, pressure: last.pressure * .8 };
        }
        return { ...member, points, options: { ...member.options, width: member.options.width * inputs.widthScale } };
      });
    }).flat();
    return { id: `cluster-${i}`, strokes };
  };
  const pine = (i, stage) => {
    const anchor = anchorFor(i, stage), count = stage === 0 ? 12 : stage === 1 ? 10 : needleCounts[i];
    return { id: `cluster-${i}`, strokes: Array.from({ length: count }, (_, j) => {
      const angle = stage === 0 ? j * Math.PI / 6 : stage === 1 ? groupAngles[i] - 1.04 + j * .22
        : groupAngles[i] + needleOffsets[j] * [.72, 1.12, .84, .95, 1.08, .8, .98, .7, 1.02][i]
          + [0, .035, -.065, .025, -.02][j % 5];
      const length = stage === 0 ? 29 : stage === 1 ? 31 : [34, 25, 39, 28, 36, 22, 41][(i + j) % 7] * lengths[i];
      const base = stage === 2 && j > 0 ? [anchor[0] + ((j % 3) - 1) * 1.8, anchor[1] + (j % 2) * 1.5] : anchor;
      const values = stage === 0 ? [[0, 0, 1], [length, 0, 1]]
        : [[0, 0, .64], [length * .28, stage === 2 ? ((i + j) % 3 - 1) * .65 : 0, .96],
          [length * .7, stage === 2 ? [.6, -.3, .9, .2][(i + j) % 4] : 0, .58], [length, 0, .06]];
      return stroke(`needle-${j}`, local(values, base, angle),
        stage === 2 ? [1.5, 2, 1.8, 2.4, 1.65][(i + j) % 5] : 1.9,
        .55 + i * .57 + j * .026, stage === 0 ? plain : { ...needleContact,
          opacity: stage === 2 ? [.86, .68, .77, .57][(i + j) % 4] : .8 });
    }) };
  };
  const units = (make, stage) => anchors.map((_, i) => make(i, stage));
  return [
    { id: 'pepper', title: '31 · 胡椒点', techniqueIds: ['leaf-pepper'], detail: { x: 143, y: 24, width: 102, height: 88 },
      variable: '均布同点反例 → 沿枝细点成簇 → 小点大小、浓淡、密疏与留白。',
      criteria: '比较均匀小圆点铺排和有局部密处的细点叶团；点仍逐个保存，末列同时调整云簇边缘、点宽与浓淡，保留簇间空隙。',
      limits: '图式与馆藏文字支持细点成群和浓墨戳点用例；本页为作者小点路径与树架，不规定唯一树种、点序或含水量，不把米点简单缩小。',
      variants: [variant('grid', '反例 · 同点均布', units(pepper, 0)), variant('clustered', '成簇 · 沿枝细点', units(pepper, 1)), variant('varied', '聚散 · 浓淡留白', units(pepper, 2))] },
    { id: 'broken', title: '32 · 破笔点接触研究', techniqueIds: ['leaf-broken'], detail: { x: 143, y: 29, width: 108, height: 98 },
      variable: '完整同姿点反例 → 共路法向分束 → 分束宽窄、尾端参差、转向与交搭。',
      criteria: '同一作者路生成相关分束，再将尾端长度与压力作为明确源编辑；整簇保存全部成员，检查分束接触与枯润变化，不以挖洞或均匀白丝代替。',
      limits: '阅读部分支持；多条相关源笔是散锋形态的程序近似，不等于物理一次落笔，也不证明开锋、真实笔毫与传统笔序；破笔与湿墨相破的破墨分别研究。',
      variants: [variant('whole', '反例 · 完整同姿', units(broken, 0)), variant('split', '接触 · 共路分束', units(broken, 1)), variant('varied', '变化 · 参差交搭', units(broken, 2))] },
    { id: 'pine', title: '33 · 松针组织研究', techniqueIds: ['vegetation-pine-needles'], detail: { x: 133, y: 14, width: 110, height: 108 },
      variable: '等角全圆反例 → 偏向扇束附枝 → 长短、开合、叠针与空缺。',
      criteria: '针线逐条提供，偏向扇面由枝端锚点与作者角区控制；末列保留不等间隔、针长、笔宽和浓淡，避免每簇成为完整太阳。',
      limits: '阅读部分支持；仅研究静态图中的松叶、刺松针束组织，不统一两种图式，不指定从内向外笔序，不引用刺绣松针作为绘画依据。',
      variants: [variant('sun', '反例 · 等角太阳', units(pine, 0)), variant('fan', '附枝 · 偏向扇束', units(pine, 1)), variant('varied', '变化 · 长短叠针', units(pine, 2))] },
  ];
}

/** Radians; every source member rotates about the first authored member base. */
export function editPepperBrokenPineCluster(document, id, { dx = 0, widthScale = 1, rotation = 0 } = {}) {
  const unit = document.recipe.units.find(unit => unit.id === id);
  if (!unit) throw new RangeError('Unknown pepper/broken/pine cluster id');
  const pivot = unit.strokes[0].points[0];
  return transformVegetationUnit(document, id, { translation: { x: dx, y: 0 }, widthScale, rotation,
    pivot: { x: pivot.x, y: pivot.y } });
}
