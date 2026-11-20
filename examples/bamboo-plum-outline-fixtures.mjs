import { createVegetationDocument, transformVegetationUnit, getNoise1D } from '../dist/index.js';

export const bambooPlumOutlineInputs = Object.freeze({ seed: 261134, layout: 'slope', widthScale: 1, dryness: .4, time: 8 });
export const bambooPlumOutlineSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const cache = new Map();
function compiled(units, options) {
  const key = JSON.stringify([units, options]);
  let value = cache.get(key);
  if (value) cache.delete(key); else value = createVegetationDocument(units, options);
  cache.set(key, value); if (cache.size > 64) cache.delete(cache.keys().next().value);
  return value;
}
const transfer = (point, layout) => layout === 'arc'
  ? { ...point, x: 280 + (point.x - 280) * .9, y: 118 + (point.y - 118) * .82 + 20 * Math.sin((point.x - 50) * Math.PI / 460) }
  : layout === 'fold' ? { ...point, x: point.x + .16 * (point.y - 130), y: point.y * .84 + 28 - 16 * Math.max(0, Math.min(1, (point.x - 260) / 60)) }
    : { ...point };
const rotate = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
const plain = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear',
  controls: [{ at: 0, pressure: 1, side: 0, angle: Math.PI / 2 }, { at: 1, pressure: 1, side: 0, angle: Math.PI / 2 }] };
const leafContact = { ...plain, axis: 'side', smoothing: 'catmull-rom', controls: [
  { at: 0, pressure: .18, side: .12, angle: 1.45 }, { at: .24, pressure: 1, side: .65, angle: 1.3 },
  { at: .62, pressure: .72, side: .36, angle: 1.6 }, { at: 1, pressure: .03, side: .03, angle: 1.5 }] };
const plumContact = { ...plain, axis: 'side', smoothing: 'catmull-rom', controls: [
  { at: 0, pressure: .35, side: .12, angle: 1.4 }, { at: .34, pressure: 1, side: .46, angle: 1.5 },
  { at: .74, pressure: .76, side: .24, angle: 1.62 }, { at: 1, pressure: .05, side: .03, angle: 1.5 }] };
const outlineContact = { ...plain, smoothing: 'catmull-rom', controls: [
  { at: 0, pressure: .72, side: .02, angle: 1.5, inkLoad: .92 },
  { at: .055, pressure: .9, side: .03, angle: 1.47, inkLoad: 1 },
  { at: .23, pressure: .4, side: .04, angle: 1.42, inkLoad: .84 },
  { at: .55, pressure: .51, side: .03, angle: 1.54, inkLoad: .9 },
  { at: .82, pressure: .29, side: .02, angle: 1.6, inkLoad: .75 },
  { at: 1, pressure: .035, side: .01, angle: 1.5, inkLoad: .59 }] };

// Original authored guides. Bamboo has a separate two-culm scaffold; the leaf
// clusters and the outlined objects use the branching scaffold below.
const treeAnchors = [[111, 93], [179, 66], [247, 43], [327, 63], [403, 91], [452, 148], [347, 170], [212, 166], [130, 192]];
const treeBranches = [
  [[279, 239, .9], [272, 174, .82], [266, 128, .72], [277, 88, .52], [247, 43, .12]],
  [[277, 88, .64], [220, 95, .51], [179, 66, .38], [111, 93, .08]],
  [[277, 88, .61], [327, 63, .42], [403, 91, .08]],
  [[266, 128, .63], [212, 166, .44], [130, 192, .08]],
  [[272, 174, .62], [347, 170, .43], [452, 148, .08]],
];
const bambooAnchors = [[98, 105], [140, 119], [239, 80], [276, 57], [382, 125], [429, 89], [478, 77], [174, 196], [341, 194]];
const bambooBranches = [
  [[162, 245, .85], [174, 196, .78], [183, 145, .67], [190, 94, .56], [196, 40, .15]],
  [[350, 246, .85], [341, 194, .77], [335, 146, .68], [327, 96, .5], [320, 45, .12]],
  [[183, 145, .6], [140, 119, .42], [98, 105, .1]],
  [[190, 94, .58], [239, 80, .35], [276, 57, .08]],
  [[335, 146, .6], [382, 125, .43], [429, 89, .28], [478, 77, .07]],
];
// Bases lie on the authored twig, rather than beside an implied connection.
const bambooVectors = [[0, 0, -40, 30], [3, -1, 12, 54], [6, -2, 46, 25], [9, -20 / 7, 48, -10], [1.5, -.5, -23, 47], [12, -26 / 7, 11, -41]];
const bambooCounts = [4, 5, 3, 4, 6, 3, 5, 4, 5];
const plumCounts = [4, 6, 3, 5, 7, 4, 6, 3, 5];
const plumAngles = [-2.72, -1.58, -.62, .12, 1.68, -.98, 2.62];
const groupTurns = [-.48, .32, -.23, .18, .53, -.34, .08, -.62, .42];
const scales = [.82, .94, 1.04, .84, .88, .78, .8, .97, .85];
const outlineAngles = [-2.8, -2.14, .28, -1.03, -.4, .12, .64, 2.44, 2.85];

/** Explicit leaf and boundary paths; no historical fixed leaf or stroke count. */
export function makeBambooPlumOutlineStudies(options = {}) {
  const inputs = { ...bambooPlumOutlineInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown bamboo/plum/outline layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const stroke = (id, values, width, start, extra = {}) => ({ id,
    points: values.map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .78, start, duration: .48, ...extra },
  });
  const local = (values, anchor, angle = 0, scale = 1) => values.map(([x, y, pressure]) => {
    const [rx, ry] = rotate([x * scale, y * scale], angle); return [anchor[0] + rx, anchor[1] + ry, pressure];
  });
  const structure = family => (family === 'bamboo' ? bambooBranches : treeBranches).map((values, i) => ({ id: `branch-${i}`, role: 'structure',
    strokes: [stroke('line', values.map(([x, y, pressure]) => [x, y, Math.max(.24, pressure)]),
      (family === 'bamboo' ? 4.5 : 4.8) - i * .44, i * .1, { ...plain, smoothing: 'catmull-rom', opacity: .7 })] }));
  const variant = (family, id, label, units) => ({ id, label,
    document: compiled([...structure(family), ...units], { ...bambooPlumOutlineSize,
      technique: family === 'outline' ? 'outline-leaf' : 'dot-leaf', seed: inputs.seed, dryness: inputs.dryness }),
  });
  const anchorFor = (family, i, stage) => stage === 0 ? [113 + i % 3 * 157, 52 + Math.floor(i / 3) * 74]
    : (family === 'bamboo' ? bambooAnchors : treeAnchors)[i];
  const bamboo = (i, stage) => {
    const anchor = anchorFor('bamboo', i, stage), count = stage === 2 ? bambooCounts[i] : 4;
    const angle = stage === 2 ? groupTurns[i] : 0, scale = stage === 2 ? scales[i] : .85;
    const start = .55 + i * .57;
    const twig = stroke('twig', local([[0, 0, .65], [6, -2, .55], [13, -4, .12]], anchor, angle, scale), 1.8, start, { ...plain, smoothing: 'catmull-rom', opacity: .7 });
    return { id: `cluster-${i}`, strokes: [twig, ...bambooVectors.slice(0, count).map(([ox, oy, originalDx, originalDy], j) => {
      const [vx, vy] = rotate([originalDx, originalDy], stage === 2 ? [0, .09, -.07, .04, -.11][(i + j) % 5] : 0);
      const face = stage === 2 ? [1, .46, .73, 1, .56, .84][(i + j) % 6] : 1;
      const stretch = stage === 2 ? [.94, 1.06, .92, 1.02][(i + j) % 4] * (face < .6 ? .96 : 1) : 1;
      const dx = vx * stretch, dy = vy * stretch;
      const curl = stage === 2 ? getNoise1D(i * .77 + j * 1.31, 261134) * .028 : 0;
      const values = stage === 0 ? [[ox, oy, 1], [ox + dx * .5, oy + dy * .5, 1], [ox + dx, oy + dy, 1]]
        : [[ox, oy, .3], [ox + dx * .22 - 1 - dy * curl, oy + dy * .25 + dx * curl, .95],
          [ox + dx * .6 + 1.4 - dy * curl * 1.3, oy + dy * .62 + dx * curl * 1.3, .68], [ox + dx, oy + dy, .03]];
      const darkRoot = stage === 2 && ((i === 1 && j === 0) || (i === 4 && j === 2) || (i === 7 && j === 1));
      const controls = leafContact.controls.map(control => ({ ...control, inkLoad: face < .6 ? .8 : face < .9 ? .94 : 1 }));
      controls.splice(1, 0, { at: .075, pressure: darkRoot ? .97 : .52, side: .2, angle: 1.43,
        inkLoad: darkRoot ? 1 : face < .6 ? .76 : .87 });
      return stroke(`leaf-${j}`, local(values, anchor, angle, stage === 0 ? .8 : scale),
        stage === 2 ? [13.5, 11.8, 15, 10.7, 12.4, 14.4][(i + j) % 6] * face : 13,
        start + .05 + j * .07, stage === 0 ? plain : { ...leafContact, controls,
          opacity: stage === 2 ? [.87, .68, .79, .58][(i + j) % 4] * (face < .6 ? .84 : 1) : .8 });
    })] };
  };
  const plum = (i, stage) => {
    const anchor = anchorFor('plum', i, stage), count = stage === 2 ? plumCounts[i] : 5;
    return { id: `cluster-${i}`, strokes: Array.from({ length: count }, (_, j) => {
      const angle = stage === 0 ? -Math.PI / 2 + j * Math.PI * 2 / 5
        : plumAngles[j] + (stage === 2 ? groupTurns[i] + [0, .16, -.08, .11, -.14][(i + j) % 5] : 0);
      const principal = j === 0;
      const length = stage === 0 ? 16 : stage === 1 ? [20, 17, 13, 16, 14][j]
        : (principal ? 22 : [13, 18, 12.5, 15, 12, 14.5][(i + j) % 6]) * scales[i];
      const base = j === 0 ? anchor : [anchor[0] + (stage === 0 ? 0 : [1.4, -1.8, 2.2, -.8][j % 4]), anchor[1] + (stage === 0 ? 0 : [1.2, -.7, 1.5][j % 3])];
      const values = stage === 0 ? [[0, 0, 1], [length * .55, 0, 1], [length, 0, 1]]
        : [[0, 0, .32], [length * .31, [1.1, -.9, .5][(i + j) % 3], .94],
          [length * .7, [.35, -.6, 1.2, -.2][(i * 2 + j) % 4], .65], [length, 0, .05]];
      return stroke(`leaf-${j}`, local(values, base, angle),
        stage === 2 ? (principal ? 12.4 : [8.1, 6.8, 9.4, 7.2, 8.8][(i + j) % 5]) : 10.5,
        .55 + i * .57 + j * .055, stage === 0 ? plain : { ...plumContact,
          controls: plumContact.controls.map(control => ({ ...control,
            inkLoad: principal ? .98 : [.83, .72, .9][(i + j) % 3] })),
          opacity: stage === 2 ? principal ? .92 : [.76, .6, .68, .51][(i + j) % 4] : .8 });
    }) };
  };
  const outline = (i, stage) => {
    const anchor = anchorFor('outline', i, stage), angle = stage === 0 ? 0 : outlineAngles[i], scale = stage === 2 ? scales[i] : .9;
    const widthFactor = stage === 2 ? [1, .62, 1.18, .73, .92, .58, 1.06, .83, 1.12][i] : 1;
    const shape = values => local(values.map(([x, y, p]) => [x, y * widthFactor, p]), anchor, angle, scale);
    const fullUpper = [[0, 0, .5], [12, -9, .9], [30, -11, .83], [46, -6, .62], [57, 0, .2]];
    const fullLower = [[0, 0, .5], [13, 6, .82], [31, 8, .9], [48, 4, .64], [57, 0, .2]];
    const source = stage === 0 ? [
      ['upper', [[0, 0, 1], [26, 0, 1], [54, 0, 1]]], ['lower', [[0, 17, 1], [26, 17, 1], [54, 17, 1]]],
    ] : stage === 1 ? [['upper', fullUpper], ['lower', fullLower]] : [
      // The rear boundaries are explicitly authored visible sections. No full
      // hidden edge, white stamp or inferred runtime occlusion is retained.
      ['rear-upper-before', [[0, 0, .5], [12, -9, .9], [16, -10, .35]]],
      ['rear-upper-after', [[43, -7, .35], [50, -4, .7], [57, 0, .2]]],
      ['rear-lower-before', [[0, 0, .5], [11, 5, .82], [14, 6, .1]]],
      ['rear-lower-after', [[32, 7.8, .1], [49, 3.8, .72], [57, 0, .2]]],
      ['front-upper', [[18, 12, .5], [15, 0, .83], [22, -17, .95], [31, -27, .65], [38, -29, .2]]],
      ['front-lower', [[18, 12, .5], [29, 7, .9], [39, -6, .85], [42, -20, .63], [38, -29, .2]]],
    ];
    return { id: `cluster-${i}`, strokes: source.map(([id, values], j) => stroke(id, shape(values),
      stage === 2 ? [2.2, 1.8, 2.4, 1.7, 2.5, 1.9][(i + j) % 6] : 2,
      .55 + i * .57 + j * .055, stage === 0 ? plain : { ...outlineContact,
        controls: outlineContact.controls.map(control => ({ ...control,
          pressure: control.pressure * (.95 + getNoise1D(i * .73 + j * 1.17 + control.at * 2.7, 261136) * .045) })),
        opacity: stage === 2 ? [.85, .67, .78, .6][(i + j) % 4] : .78 })) };
  };
  const units = make => stage => Array.from({ length: 9 }, (_, i) => make(i, stage));
  const bambooUnits = units(bamboo), plumUnits = units(plum), outlineUnits = units(outline);
  return [
    { id: 'bamboo', title: '34 · 竹叶组织研究', techniqueIds: ['vegetation-bamboo-leaves'], detail: { x: 92, y: 75, width: 100, height: 100 },
      variable: '同形同姿贴片反例 → 附枝撇叶提按 → 疏密、俯仰、长短与交错。',
      criteria: '独立竹竿枝架与长叶笔共同组织；尖入、按腹和渐提由源路径与接触控制给出，末列同时调整长短、叶向、组内数量与浓淡，保留穿行空隙。',
      limits: '阅读部分支持，只研究已看疏竹、密竹与新篁结果中的尖长叶和枝架关系。无统一撇叶笔序、树种或风雨动态结论，不把个字点或衣纹竹叶描换名。',
      variants: [variant('bamboo', 'repeated', '反例 · 同形同姿', bambooUnits(0)), variant('bamboo', 'attached', '附枝 · 撇叶按提', bambooUnits(1)), variant('bamboo', 'varied', '变化 · 俯仰交错', bambooUnits(2))] },
    { id: 'plum', title: '35 · 梅花点叶簇研究', techniqueIds: ['leaf-plum'], detail: { x: 141, y: 25, width: 96, height: 96 },
      variable: '等数同姿花章反例 → 沿枝短叶围攒 → 变数、错落、叠接与留气。',
      criteria: '多方向短叶围攒成花簇式树叶，保留尖碎边缘与中心叠接；末列采用三至七笔的作者小簇，笔数、方向、长短和浓淡分别可编辑。',
      limits: '阅读部分支持；梅花点在本页指花簇式点叶，不是梅花实物或圆形五瓣花。五笔仅为对照选择，不规定传统计数，不与品字点或鼠足点自动合并。',
      variants: [variant('plum', 'stamp', '反例 · 等数花章', plumUnits(0)), variant('plum', 'clustered', '围攒 · 沿枝短叶', plumUnits(1)), variant('plum', 'varied', '聚散 · 变数留气', plumUnits(2))] },
    { id: 'outline', title: '36 · 双勾边界研究', techniqueIds: ['line-double-outline'], detail: { x: 118, y: 18, width: 118, height: 108 },
      variable: '平行等宽轨道反例 → 两侧合拢造形 → 正侧宽窄与前后断续。',
      criteria: '两侧轮廓分别给出，空白宽窄由对象边界决定；末列后叶只保存可见边段，前叶两边随后钩合，整体或逐边均可修改，不用白色擦除。',
      limits: '本页仅为绘画双钩的叶形边界与作者遮挡分段研究，不是复制法帖的双钩廓填。没有自动轮廓、偏移描边或通用遮挡推理，工笔花鸟的完整造形与设色流程另待研究。',
      variants: [variant('outline', 'rails', '反例 · 平行轨道', outlineUnits(0)), variant('outline', 'paired', '造形 · 两侧合拢', outlineUnits(1)), variant('outline', 'overlap', '前后 · 宽窄断续', outlineUnits(2))] },
  ];
}

/** Radians; the first authored source point is the explicit group pivot. */
export function editBambooPlumOutlineCluster(document, id, { dx = 0, widthScale = 1, rotation = 0 } = {}) {
  const unit = document.recipe.units.find(unit => unit.id === id);
  if (!unit) throw new RangeError('Unknown bamboo/plum/outline cluster id');
  const pivot = unit.strokes[0].points[0];
  return transformVegetationUnit(document, id, { translation: { x: dx, y: 0 }, widthScale, rotation, pivot: { x: pivot.x, y: pivot.y } });
}
