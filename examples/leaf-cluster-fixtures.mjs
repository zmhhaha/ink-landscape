import { createVegetationDocument, transformVegetationUnit, getNoise1D } from '../dist/index.js';
import { authoredBranchAttachment, authoredGrowthLeaf } from './authored-study-path.mjs';

export const leafClusterInputs = Object.freeze({ seed: 261128, layout: 'slope', widthScale: 1, dryness: .48, time: 8 });
export const leafClusterSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
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
const plainControls = [{ at: 0, pressure: 1, side: 0, angle: Math.PI / 2 }, { at: 1, pressure: 1, side: 0, angle: Math.PI / 2 }];
const neutral = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear', controls: plainControls };
const centerContact = { axis: 'center', controls: [
  { at: 0, pressure: .3, side: .04, angle: 1.5 }, { at: .3, pressure: 1, side: .08, angle: 1.45 },
  { at: .68, pressure: .7, side: .12, angle: 1.6 }, { at: 1, pressure: .08, side: .03, angle: 1.5 },
] };
const softContact = { controls: [
  { at: 0, pressure: .2, side: .1, angle: 1.5 }, { at: .34, pressure: 1, side: .36, angle: 1.4 },
  { at: .68, pressure: .65, side: .2, angle: 1.6 }, { at: 1, pressure: .04, side: .05, angle: 1.5 },
] };

// These are original author annotations, not automatic tree topology or a
// historical claim about necessary member counts. Branch vertices share bases.
const anchors = [[120, 91], [185, 78], [248, 45], [321, 62], [389, 90], [438, 143], [335, 166], [206, 167], [133, 184]];
const branchGuides = [
  [[280, 237, .85], [271, 171, .8], [264, 129, .7], [274, 87, .5], [248, 45, .2]],
  [[274, 87, .65], [216, 94, .5], [185, 78, .4], [120, 91, .12]],
  [[274, 87, .6], [321, 62, .4], [389, 90, .12]],
  [[264, 129, .6], [206, 167, .4], [133, 184, .12]],
  [[271, 171, .6], [335, 166, .4], [438, 143, .12]],
];
// A denser split crown and lower forks for jie; a downward axis and two lateral
// directions for ge. They are distinct annotated shape studies, not typefaces.
const jieGuides = [[0, 0, -9, 38], [.8, .3, 14, 25], [-.6, .5, -24, 15], [1.2, -.2, 23, 7], [.4, .8, -6, 29]];
const geGuides = [[0, 0, -6, 37], [-.4, .5, -22, 17], [1.2, -.2, 18, 12], [.6, .7, 9, 27]];
const organizedCounts = [2, 5, 3, 6, 4, 2, 5, 3, 4];
const groupGuides = [[0, 0, -29, -15], [1, .5, -8, -33], [-.8, 1, 19, -22], [.5, 1.8, -27, 7], [1.8, .6, 12, 22], [-.3, 2, -7, 27]];
const angles = [-.36, .2, -.08, .42, -.25, .35, -.42, .48, -.28];
const lengths = [.86, 1.12, .8, .96, .9, .76, 1.05, .82, .93];
const widths = [9.6, 7.5, 8.7, 6.7, 10.2, 8.1];
const parentBranches = [1, 1, 0, 2, 2, 4, 4, 3, 3];
const growthFans = {
  jie: [[-.12, 44], [.57, 29], [-.74, 26], [1.02, 24], [-.43, 31]],
  ge: [[.09, 43], [-.7, 27], [.52, 22], [.29, 28]],
  groups: [[-.85, 30], [-.12, 34], [.64, 28], [-1.08, 25], [.94, 24], [.18, 29]],
};
const rotate = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];

/** Three explicit group studies, all compiled by the existing dot-leaf contact. */
export function makeLeafClusterStudies(options = {}) {
  const inputs = { ...leafClusterInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown leaf-cluster study layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const stroke = (id, values, width, order, extra = {}) => ({ id,
    points: values.map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .76, start: order * .1, duration: .48, ...extra },
  });
  const structure = () => branchGuides.map((values, i) => ({ id: `branch-${i}`, role: 'structure',
    strokes: [stroke('line', values.map(([x, y, pressure]) => [x, y, Math.max(.24, pressure)]),
      4.8 - i * .45, i, { opacity: .7 })] }));
  const variant = (id, label, units, layered = false) => ({ id, label,
    document: compiled(layered ? [...units.slice(0, 3), ...structure(), ...units.slice(3)] : [...structure(), ...units],
      { ...leafClusterSize, technique: 'dot-leaf', seed: inputs.seed, dryness: inputs.dryness }),
  });
  const leaf = (guide, anchor, angle, scale, pressed, curve = 0) => {
    const [ox, oy, dx, dy] = guide;
    const values = pressed
      ? [[ox, oy, .4], [ox + dx * .25 + curve - dy * .035, oy + dy * .25 + dx * .035, .96],
        [ox + dx * .63 + curve - dy * .055, oy + dy * .63 + dx * .055, .69], [ox + dx, oy + dy, .06]]
      : [[ox, oy, 1], [ox + dx * .5, oy + dy * .5, 1], [ox + dx, oy + dy, 1]];
    return values.map(([x, y, pressure]) => {
      const [rx, ry] = rotate([x * scale, y * scale], angle); return [anchor[0] + rx, anchor[1] + ry, pressure];
    });
  };
  const cluster = (family, i, stage) => {
    const anchor = stage === 0 ? [126 + i % 3 * 151, 57 + Math.floor(i / 3) * 67] : anchors[i];
    const angle = stage === 2 ? angles[i] : 0, scale = stage === 2 ? lengths[i] : .88;
    const guides = family === 'jie' ? jieGuides : family === 'ge' ? geGuides : groupGuides;
    const count = family === 'jie' ? (stage === 2 ? [4, 3, 5, 4, 4, 3, 5, 4, 3][i] : 4)
      : family === 'ge' ? (stage === 2 ? [3, 4, 2, 3, 3, 4, 3, 2, 3][i] : 3)
        : stage === 2 ? organizedCounts[i] : 3;
    if (stage === 0) return { id: `cluster-${i}`, strokes: guides.slice(0, count).map((guide, j) => stroke(`leaf-${j}`,
      leaf(guide, anchor, angle, scale, false), 8.5, 5 + i * 6 + j, neutral)) };
    const frame = authoredBranchAttachment(branchGuides[parentBranches[i]], anchor);
    return { id: `cluster-${i}`, strokes: growthFans[family].slice(0, count).map(([spread, length], j) => {
      const projected = authoredGrowthLeaf(frame, { length: length * scale,
        spread: spread + (stage === 2 ? angles[i] * .25 : 0), face: stage === 2 ? ['front', 'edge', 'back'][(i + j * 2) % 3] : 'front',
        curl: stage === 2 ? [1.9, -.8, 2.6, -1.5][(i + j) % 4] : 1.1, stem: 2.3 });
      const contact = family === 'jie' ? centerContact : softContact;
      const principal = family === 'groups' ? j === 1 : j === 0;
      const darkRoot = stage === 2 && principal && [3, 4, 7].includes(i);
      const values = projected.values.map(([x, y, pressure], p) => [x, y, p === 2 || p === 3
        ? pressure * (.95 + getNoise1D(i * .81 + j * 1.17 + p * .63, 261128) * .04) : pressure]);
      const controls = contact.controls.map(control => ({ ...control, inkLoad: projected.inkLoad }));
      controls.splice(1, 0, { at: .085, pressure: darkRoot ? .94 : .56,
        side: family === 'jie' ? .06 : .16, angle: 1.46, inkLoad: projected.inkLoad * (darkRoot ? 1 : .83) });
      // Preserve all shared roots and the first tangent segment. Main and side
      // members are weighted within the existing leaf strokes, never by a
      // mechanical dark stamp underneath each cluster.
      return stroke(`leaf-${j}`, values,
        (stage === 2 ? widths[(i + j) % widths.length] : 8.5) * projected.widthScale
          * (principal ? 1.34 : .78),
        5 + i * 6 + j, { ...contact, controls,
          opacity: (principal ? .9 : stage === 2 ? [.74, .61, .69, .51][(i + j) % 4] : .7) * projected.opacityScale });
    }) };
  };
  const units = (family, stage) => anchors.map((_, i) => cluster(family, i, stage));

  return [
    { id: 'jie', title: '28 · 介字点形态研究', techniqueIds: ['leaf-jie'], detail: { x: 154, y: 52, width: 118, height: 104 },
      variable: '等距同姿分叉反例 → 咬枝顺生长扇展 → 正侧背、前后与叶数变化。',
      criteria: '每笔短根段都咬住明确枝节点并先顺切线，再向外作不等角分向；末列用显式宽短、弯向、墨量与数组笔序研究正侧背和前后留空，整簇仍可移动或旋转。',
      limits: '阅读部分支持，馆藏说明提供中锋线索；四向分叉和三至五笔均为作者选择，不规定传统笔数、笔序或树种。有限二维投影与遮让不是三维植物或自动遮挡解算，移动后须重设计交接。',
      variants: [variant('repeated', '反例 · 同姿等距', units('jie', 0)), variant('attached', '生长 · 咬枝分向', units('jie', 1)), variant('varied', '空间 · 正侧背叶簇', units('jie', 2), true)] },
    { id: 'ge', title: '29 · 个字点形态研究', techniqueIds: ['leaf-ge'], detail: { x: 154, y: 52, width: 118, height: 104 },
      variable: '等距同姿反例 → 顺枝主长侧短 → 正侧背、疏密与前后。',
      criteria: '主笔先沿枝的生长切线，侧笔从同一根节点向外扇展，保留与介字研究不同的分向关系；末列改变成员数、投影、墨量和前后，避免浮贴的重复字模。',
      limits: '阅读部分支持，只研究已有图式中的分向关系。中列三笔和末列二至四笔为作者选择；投影和笔序是二维作者源，不代表固定撇叶顺序、三维植物或与竹叶完全同义。',
      variants: [variant('repeated', '反例 · 等距同姿', units('ge', 0)), variant('attached', '生长 · 主侧顾盼', units('ge', 1)), variant('varied', '空间 · 投影疏密', units('ge', 2), true)] },
    { id: 'groups', title: '30 · 攒三聚五', techniqueIds: ['leaf-three-five'], detail: { x: 154, y: 52, width: 118, height: 104 },
      variable: '等数同姿反例 → 顺枝不等角群组 → 多寡、投影、前后与空隙。',
      criteria: '比较同数同宽和顺枝群组；末列保存二至六笔的叶簇及正侧背宽短、墨量和前后笔序，簇间保留通道，不把三加五当固定规则或等角风车。',
      limits: '攒三聚五用于组群节奏，单叶手势沿用普通点叶。投影、枝架、组内笔数、相接和遮让均为作者源；没有三维植物或自动补冠，也不等同尚缺图式依据的品字点。',
      variants: [variant('equal', '反例 · 等数同姿', units('groups', 0)), variant('attached', '生长 · 沿枝群组', units('groups', 1)), variant('varied', '空间 · 多寡留空', units('groups', 2), true)] },
  ];
}

/** Rotation is radians. Pivot is the first authored point of the first member. */
export function editLeafCluster(document, id, { dx = 0, widthScale = 1, rotation = 0 } = {}) {
  const unit = document.recipe.units.find(unit => unit.id === id);
  if (!unit) throw new RangeError('Unknown leaf cluster id');
  const pivot = unit.strokes[0].points[0];
  return transformVegetationUnit(document, id, { translation: { x: dx, y: 0 }, widthScale, rotation,
    pivot: { x: pivot.x, y: pivot.y } });
}
