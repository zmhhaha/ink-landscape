import { createVegetationDocument, reviseVegetationDocument, getNoise1D } from '../dist/index.js';
import { insetFromAuthoredRidge, authoredBranchAttachment, authoredGrowthLeaf } from './authored-study-path.mjs';

export const vegetationInputs = Object.freeze({ seed: 261127, layout: 'slope', widthScale: 1, dryness: .52, time: 8 });
export const vegetationSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
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
const plainControls = [{ at: 0, pressure: 1, side: .1, angle: Math.PI / 2 }, { at: 1, pressure: 1, side: .1, angle: Math.PI / 2 }];
const neutral = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear', controls: plainControls };

// Each tuple is an authored base, tip vector and belly width. These guides are
// example source data, not a library rule inferring leaves from a branch graph.
const leafGuides = [
  [267, 88, -22, -32, 7], [267, 88, 19, -28, 7], [284, 42, -20, -14, 6], [284, 42, 24, -8, 6],
  [226, 123, -18, -29, 7], [193, 111, -30, -18, 9], [161, 96, -25, -9, 8], [161, 96, 4, -31, 7],
  [226, 123, -28, 4, 9], [193, 111, -18, 24, 9], [338, 102, 2, -32, 8], [371, 85, 29, -18, 8],
  [371, 85, 26, 5, 9], [338, 102, 27, 19, 9], [207, 165, -27, -16, 8], [172, 168, -27, 12, 10],
  [172, 168, -19, -21, 8], [326, 159, 28, -14, 9], [365, 171, 27, -4, 9], [365, 171, 21, 24, 10],
];
const branchGuides = [
  [[260, 233, .7], [260, 191, .9], [267, 151, .75], [275, 130, .6], [267, 88, .45], [284, 42, .15]],
  [[275, 130, .75], [226, 123, .6], [193, 111, .5], [161, 96, .18]],
  [[267, 151, .65], [207, 165, .52], [172, 168, .14]],
  [[267, 88, .5], [301, 115, .5], [338, 102, .4], [371, 85, .12]],
  [[267, 151, .6], [326, 159, .5], [365, 171, .12]],
];
// Explicit parent choices, fan directions and face studies. They are authored
// with the paths below, rather than guessed from a finished crown or renderer.
const leafBranches = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 2, 2, 2, 4, 4, 4];
const leafSpreads = [-.72, .58, -.44, .68, -.78, -.15, -.62, .75, .62, .94, -.8, -.18, .75, .76, -.84, -.12, .88, -.7, -.16, .9];
const leafFaces = ['back', 'edge', 'back', 'edge', 'back', 'edge', 'front', 'edge', 'front', 'back',
  'edge', 'front', 'back', 'front', 'front', 'edge', 'back', 'front', 'edge', 'front'];
const rockGuides = [
  [[69, 222, .2], [118, 148, .6], [188, 69, .8], [251, 94, .7], [307, 154, .3]],
  [[188, 69, .65], [194, 117, .5], [224, 164, .3], [243, 211, .1]],
  [[251, 94, .55], [246, 135, .4], [277, 180, .1]],
  [[307, 154, .3], [351, 133, .65], [400, 129, .7], [475, 196, .2]],
  [[351, 133, .4], [361, 171, .3], [397, 208, .1]],
];

/** Three original studies. Authoring and contact changes are explicitly labeled. */
export function makeVegetationStudies(options = {}) {
  const inputs = { ...vegetationInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown vegetation study layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const stroke = (id, values, width, order, extra = {}) => ({ id,
    points: values.map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .76, start: order * .09, duration: .45, ...extra },
  });
  const structure = (guides, prefix, width = 3.8) => guides.map((values, i) => ({ id: `${prefix}-${i}`, role: 'structure',
    strokes: [stroke('line', values.map(([x, y, pressure]) => [x, y, Math.max(.24, pressure)]),
      width * (1 - i * .095), i, { opacity: .68 })] }));
  const variant = (id, label, technique, units) => ({ id, label,
    document: compiled(units, { ...vegetationSize, technique, seed: inputs.seed, dryness: inputs.dryness }),
  });

  const dab = (x, y, dx = 4, dy = 2, pressed = true) => pressed
    ? [[x, y, .35], [x + dx * .42, y + dy * .45, 1], [x + dx, y + dy, .22]]
    : [[x, y, 1], [x + dx, y + dy, 1]];
  const gridDabs = Array.from({ length: 35 }, (_, i) => ({ id: `moss-${i}`, strokes: [
    stroke('dab', dab(112 + i % 7 * 54, 58 + Math.floor(i / 7) * 38, 3, 2, false), 10, i + 5, neutral),
  ] }));
  const mossPlaces = [
    [121, 148], [124, 139], [127, 145], [144, 124], [150, 126], [147, 121], [177, 91], [183, 87], [187, 90],
    [213, 93], [220, 95], [217, 99], [244, 117], [247, 121], [251, 124], [263, 148],
    [346, 143], [352, 136], [356, 141], [382, 134], [389, 139], [386, 133], [425, 157], [431, 162],
    [129, 151], [153, 134], [180, 102], [190, 94], [225, 102], [252, 128], [360, 149], [391, 148], [395, 153], [436, 172], [449, 183],
  ];
  const mossRidges = [rockGuides[0], rockGuides[3]];
  const groupedMoss = mossPlaces.map((point, i) => {
    const [x, y] = insetFromAuthoredRidge(point, mossRidges, [2.5, 4, 6][i % 3]);
    return { id: `moss-${i}`, strokes: [stroke('dab', dab(x, y), 10, i + 5)] };
  });
  const variedMoss = mossPlaces.map((point, i) => {
    const [x, y] = insetFromAuthoredRidge(point, mossRidges, [3, 5.5, 9, 13][i % 4]);
    const highRidge = y < 133;
    const principal = [1, 4, 6, 10, 13, 17, 20, 22].includes(i);
    return { id: `moss-${i}`, strokes: [stroke('dab',
      dab(x, y, [4, -3, 5, 2][i % 4], [2, 4, -1][i % 3]),
      (principal ? highRidge ? 14.5 : 10.2 : (highRidge ? [8.4, 6.8, 9.1, 6.2] : [6.4, 4.9, 7, 5.4])[i % 4]), i + 5,
      { opacity: principal ? .9 : (highRidge ? [.7, .54, .65, .48] : [.59, .43, .53, .39])[i % 4] })] };
  });

  const looseLeaf = ([x, y, dx, dy]) => [[x, y, 1], [x + dx * .5, y + dy * .5, 1], [x + dx, y + dy, 1]];
  const looseLeaves = leafGuides.map((guide, i) => ({ id: `leaf-${i}`, strokes: [stroke('blade',
    looseLeaf([124 + i % 5 * 72, 54 + Math.floor(i / 5) * 47, 17, -7]), 13, i + 5, neutral)] }));
  const growth = (i, projected) => {
    const guide = leafGuides[i], frame = authoredBranchAttachment(branchGuides[leafBranches[i]], guide);
    return authoredGrowthLeaf(frame, { length: Math.hypot(guide[2], guide[3]) * 1.08, spread: leafSpreads[i],
      face: projected ? leafFaces[i] : 'front', curl: [1.8, -1.2, 2.6, -.7][i % 4], stem: 2.4 });
  };
  // Only these selected intersections carry a short root accent. It belongs
  // to the leaf stroke itself, rather than a shadow dot repeated under leaves.
  const darkRoots = new Set([4, 9, 13, 19]);
  const leafControls = (load, darkRoot = false) => [
    { at: 0, pressure: .4, side: .12, angle: 1.4, inkLoad: load * .8 },
    { at: .065, pressure: darkRoot ? .97 : .58, side: .16, angle: 1.43, inkLoad: load * (darkRoot ? 1 : .79) },
    { at: .17, pressure: .76, side: .38, angle: 1.38, inkLoad: load * .91 },
    { at: .37, pressure: 1, side: .62, angle: 1.35, inkLoad: load },
    { at: .68, pressure: .74, side: .38, angle: 1.6, inkLoad: load * .94 },
    { at: .9, pressure: .24, side: .13, angle: 1.56, inkLoad: load * .74 },
    { at: 1, pressure: .03, side: .03, angle: 1.5, inkLoad: load * .56 },
  ];
  const attachedLeaves = leafGuides.map((_, i) => ({ id: `leaf-${i}`, strokes: [stroke('blade',
    growth(i, false).values.map(([x, y]) => [x, y, 1]), 13, i + 5, neutral)] }));
  const pressedLeaves = leafGuides.map((_, i) => {
    const projected = growth(i, true);
    const values = projected.values.map(([x, y, pressure], p) => [x, y, p === 2 || p === 3
      ? pressure * (.95 + getNoise1D(i * .71 + p * 1.9, 261126) * .045) : pressure]);
    return { id: `leaf-${i}`, strokes: [stroke('blade', values,
      [13.5, 11.8, 14.2, 10.6, 13][i % 5] * projected.widthScale, i + 5,
      { controls: leafControls(projected.inkLoad, darkRoots.has(i)), opacity: [.87, .76, .82, .72][i % 4] * projected.opacityScale })] };
  });

  const loopLeaves = leafGuides.map((_, i) => {
    const x = 110 + i % 5 * 76, y = 48 + Math.floor(i / 5) * 48;
    return { id: `leaf-${i}`, strokes: [-1, 1].map((sign, j) => stroke(j ? 'right' : 'left',
      Array.from({ length: 9 }, (_, k) => {
        const angle = k / 8 * Math.PI;
        return [x + 14 - 14 * Math.cos(angle), y + sign * Math.sin(angle) * 7, 1];
      }), 2, 5 + i * 2 + j, neutral)) };
  });
  const growingSides = (i, projected) => {
    const leaf = growth(i, projected), root = leaf.values[0], tip = leaf.values.at(-1);
    const dx = tip[0] - root[0], dy = tip[1] - root[1], length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
    return [-1, 1].map((sign, side) => leaf.values.map(([x, y], p) => {
      const belly = leafGuides[i][4] * leaf.widthScale * [0, .08, side ? .81 : 1.05, side ? .48 : .67, 0][p] * sign;
      // This small missing tip is explicitly authored in a rear/edge contour;
      // it never erases paper or asks the renderer to infer an occlusion.
      const opening = projected && side === 1 && i % 3 === 0 && p === leaf.values.length - 1 ? .13 : 0;
      const before = leaf.values.at(-2);
      return [x + nx * belly - (x - before[0]) * opening, y + ny * belly - (y - before[1]) * opening,
        [.7, .62, .9, .72, .18][p]];
    }));
  };
  const pairedLeaves = leafGuides.map((_, i) => ({ id: `leaf-${i}`, strokes: growingSides(i, false).map((values, j) =>
    stroke(j ? 'right' : 'left', values, 2, 5 + i * 2 + j)) }));
  const openLeaves = leafGuides.map((_, i) => {
    const projected = growth(i, true);
    return { id: `leaf-${i}`, strokes: growingSides(i, true).map((values, j) =>
      stroke(j ? 'right' : 'left', values, [2.3, 1.8, 2.1, 1.6][i % 4], 5 + i * 2 + j,
        { controls: [
          { at: 0, pressure: .72, inkLoad: projected.inkLoad * .84 },
          { at: .065, pressure: darkRoots.has(i) && j === 0 ? .96 : .82, inkLoad: projected.inkLoad },
          { at: .26, pressure: .43, inkLoad: projected.inkLoad * .84 },
          { at: .6, pressure: .56, inkLoad: projected.inkLoad * .93 },
          { at: .85, pressure: .3, inkLoad: projected.inkLoad * .77 },
          { at: 1, pressure: .04, inkLoad: projected.inkLoad * .58 },
        ], opacity: [.86, .78, .83, .72][i % 4] * projected.opacityScale })) };
  });
  const layeredBranches = units => [...units.slice(0, 6), ...structure(branchGuides, 'branch'), ...units.slice(6)];

  return [
    { id: 'moss', title: '25 · 点苔', techniqueIds: ['vegetation-moss'], detail: { x: 104, y: 68, width: 176, height: 128 },
      variable: '等距散点反例 → 沿岩脊聚散 → 大小间杂、留空呼应。',
      criteria: '同一石骨保持可见，比较点群与岩脊的联系；第三列再改变点宽、方向和浓淡，观察是否过密或遮蔽结构。',
      limits: '单色点苔程序研究；点位和岩脊由作者提供，不自动识别岩面或全域撒点。三列同时改变位置、接触及局部组织，不冒充单变量或传统技法已验收。',
      variants: [variant('grid', '反例 · 等距散点', 'moss', [...structure(rockGuides, 'rock'), ...gridDabs]),
        variant('clustered', '组织 · 沿脊聚散', 'moss', [...structure(rockGuides, 'rock'), ...groupedMoss]),
        variant('varied', '变化 · 大小留空', 'moss', [...structure(rockGuides, 'rock'), ...variedMoss])] },
    { id: 'leaves', title: '26 · 点叶', techniqueIds: ['vegetation-dot-leaves'], detail: { x: 138, y: 70, width: 192, height: 124 },
      variable: '悬浮等距叶反例 → 沿枝切线生长 → 正侧背投影、按提与前后。',
      criteria: '枝架和根节点相同；中列短根段先顺枝条切线再向外扇展，末列把正面、侧面和背面宽短、弯向、墨量与笔序写成普通源。先画的后叶由随后枝架压住根部，前叶再接枝。',
      limits: '作者提供枝干、叶片笔路与叶簇；末列是有限二维投影，宽短、墨量、接触和前后同时改变，不是同路单变量。没有三维植物、自动树冠或通用遮挡求解；移动后调用者仍负责交接。',
      variants: [variant('loose', '反例 · 悬浮等距', 'dot-leaf', [...structure(branchGuides, 'branch'), ...looseLeaves]),
        variant('attached', '生长 · 咬枝扇展', 'dot-leaf', [...structure(branchGuides, 'branch'), ...attachedLeaves]),
        variant('pressed', '空间 · 正侧背叶', 'dot-leaf', layeredBranches(pressedLeaves))] },
    { id: 'outline', title: '27 · 夹叶形态研究', techniqueIds: ['vegetation-outline-leaves'], detail: { x: 138, y: 70, width: 192, height: 124 },
      variable: '重复闭环反例 → 顺枝双边扇展 → 正侧背宽窄、前后与缺段。',
      criteria: '每叶保留两条边线与共同枝上根节点；中列从枝切线短根段向外展开，末列以显式投影、局部开口和枝叶笔序表达前后。叶内白区来自未着墨，不填白覆盖后景。',
      limits: '资料部分支持，仅作静态图式、有限二维投影与作者遮让研究；没有确认完整传统笔序、三维植物或设色流程。缺段和前后由源与数组顺序给出，移动后不自动修复遮挡。',
      variants: [variant('loops', '反例 · 重复闭环', 'outline-leaf', [...structure(branchGuides, 'branch'), ...loopLeaves]),
        variant('paired', '双边 · 顺枝扇展', 'outline-leaf', [...structure(branchGuides, 'branch'), ...pairedLeaves]),
        variant('open', '空间 · 宽窄前后', 'outline-leaf', layeredBranches(openLeaves))] },
  ];
}

/** Moves or re-widths the entire selected unit, including both outline sides. */
export function editVegetationUnit(document, id, { dx = 0, width } = {}) {
  if (!Number.isFinite(dx)) throw new RangeError('Unit displacement must be finite');
  if (!document.recipe.units.some(unit => unit.id === id)) throw new RangeError('Unknown vegetation unit id');
  return reviseVegetationDocument(document, { units: document.recipe.units.map(unit => unit.id !== id ? unit : {
    ...unit, strokes: unit.strokes.map(stroke => ({ ...stroke,
      points: stroke.points.map(point => ({ ...point, x: point.x + dx })),
      options: { ...stroke.options, ...(width === undefined ? {} : { width }) },
    })),
  }) });
}
