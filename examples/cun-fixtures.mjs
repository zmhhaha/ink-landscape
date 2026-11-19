import { createCunDocument, reviseCunDocument } from '../dist/index.js';
import { authoredPathTexture } from './authored-study-path.mjs';
import { authoredInkLayers } from './authored-ink-layers.mjs';

export const cunInputs = Object.freeze({ seed: 261124, layout: 'slope', widthScale: 1, dryness: .58, time: 8 });
export const cunSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const cache = new Map();
function compiled(strokes, options) {
  const key = JSON.stringify([strokes, options]);
  let document = cache.get(key);
  if (document) cache.delete(key); else document = createCunDocument(strokes, options);
  cache.set(key, document); if (cache.size > 64) cache.delete(cache.keys().next().value);
  return document;
}
const transfer = (point, layout) => layout === 'arc'
  ? { ...point, x: 280 + (point.x - 280) * .88, y: 128 + (point.y - 128) * .78 + 19 * Math.sin((point.x - 50) * Math.PI / 460) }
  : layout === 'fold' ? { ...point, x: point.x + (point.y > 135 ? 20 : -12), y: point.y * .84 + (point.x > 300 ? 14 : 28) } : { ...point };
const plainControls = [{ at: 0, pressure: 1, side: 0, angle: Math.PI / 2, inkLoad: 1 }, { at: 1, pressure: 1, side: 0, angle: Math.PI / 2, inkLoad: 1 }];
const neutral = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear', controls: plainControls };

/** Authored rock-surface paths; no outline filling or randomly scattered stamps. */
export function makeCunStudies(options = {}) {
  const inputs = { ...cunInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown cun study layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const source = (id, values, width, index, extra = {}) => ({ id,
    points: values.map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .78, start: index * .18, duration: .65, ...extra },
  });
  const make = (technique, strokes) => compiled(strokes, { ...cunSize, technique, seed: inputs.seed, dryness: inputs.dryness });
  const variant = (id, label, technique, strokes) => ({ id, label, document: make(technique, strokes) });
  const parallel = Array.from({ length: 9 }, (_, index) => source(`parallel-${index}`, [[94 + index * 43, 63], [73 + index * 43, 210]], 4.6, index, neutral));
  const longValues = [
    [[198, 38, .5], [176, 76, .85], [159, 121, .56], [118, 175, .72], [70, 211, .25]],
    [[218, 49, .4], [205, 91, .78], [187, 142, .56], [161, 187, .69], [119, 221, .25]],
    [[245, 56, .55], [233, 94, .81], [218, 126, .55], [201, 171, .7], [174, 202, .25]],
    [[273, 71, .45], [255, 116, .75], [252, 152, .5], [224, 197, .62], [204, 225, .25]],
    [[292, 64, .5], [301, 103, .83], [279, 144, .58], [270, 183, .7], [249, 214, .25]],
    [[316, 76, .4], [328, 117, .75], [318, 155, .52], [307, 199, .65], [293, 228, .25]],
    [[339, 85, .48], [361, 120, .8], [357, 155, .53], [339, 195, .62], [326, 216, .2]],
    [[367, 94, .45], [393, 129, .78], [398, 161, .58], [377, 207, .65], [363, 226, .2]],
    [[398, 116, .45], [427, 145, .75], [432, 180, .5], [416, 214, .25]],
    [[174, 110, .4], [151, 151, .75], [137, 177, .5], [105, 195, .25]],
    [[238, 122, .35], [221, 155, .71], [195, 186, .3]],
    [[326, 128, .35], [307, 165, .7], [298, 187, .3]],
  ];
  const long = longValues.map((values, i) => source(`long-${i}`, authoredPathTexture(values, `pima-${i}`, { smooth: true, step: 5 }), [5.2, 4.8, 5.5, 4.4][i % 4], i));
  const mixed = longValues.slice(0, 8).map((values, i) => source(`long-${i}`, authoredPathTexture(values, `pima-${i}`, { smooth: true, step: 5 }), [5.2, 4.8, 5.5, 4.4][i % 4], i));
  const shortValues = [
    [[144, 140, .4], [120, 162, .74], [99, 178, .25]], [[173, 157, .3], [161, 184, .68], [142, 198, .25]],
    [[206, 91, .4], [185, 113, .7], [174, 138, .3]], [[232, 175, .4], [211, 199, .73], [196, 214, .25]],
    [[282, 119, .35], [267, 151, .7], [250, 168, .3]], [[292, 170, .4], [284, 196, .68], [265, 219, .25]],
    [[354, 149, .4], [340, 176, .7], [323, 191, .25]], [[396, 165, .4], [410, 187, .72], [397, 209, .25]],
  ];
  mixed.push(...shortValues.map((values, i) => source(`short-${i}`, authoredPathTexture(values, `pima-short-${i}`, { amplitude: .48, smooth: true, step: 5 }), 4.4 + (i % 3) * .6, i + 8)));

  const sweepValues = [
    [[109, 86], [168, 62], [223, 83], [242, 111]], [[231, 73], [285, 89], [326, 128], [332, 161]],
    [[319, 95], [375, 110], [415, 150], [423, 183]], [[135, 147], [193, 123], [235, 144], [249, 182]],
    [[260, 166], [308, 144], [358, 171], [373, 211]], [[389, 191], [428, 170], [466, 195], [482, 221]],
  ].map((values, i) => authoredPathTexture(values, `axe-${i}`, { amplitude: .85 }));
  const equal = sweepValues.map((values, i) => source(`sweep-${i}`, values, 9, i, neutral));
  const cuts = sweepValues.map((values, i) => source(`sweep-${i}`, values, [33, 30, 35, 28, 31, 25][i], i));
  const facets = cuts.slice(0, 5).map(stroke => ({ ...stroke }));
  const smallValues = [
    [[90, 115], [130, 106], [152, 130]], [[200, 100], [229, 102], [241, 123]],
    [[284, 128], [312, 122], [333, 145]], [[358, 164], [382, 153], [399, 178]],
    [[160, 193], [192, 178], [218, 199]], [[253, 205], [280, 194], [301, 220]],
    [[393, 207], [429, 196], [453, 224]],
  ];
  facets.push(...smallValues.map((values, i) => source(`small-${i}`, authoredPathTexture(values, `axe-small-${i}`, { amplitude: .65 }), [13, 11, 15][i % 3], i + 5, { opacity: .62 })));

  const foldValues = [
    [[87, 100], [145, 71], [215, 77], [219, 109], [269, 114]],
    [[218, 78], [285, 81], [339, 107], [332, 144], [398, 153]],
    [[118, 140], [178, 119], [235, 127], [229, 167], [292, 179]],
    [[284, 159], [350, 160], [404, 183], [395, 214], [468, 222]],
  ];
  const rounded = foldValues.map((values, i) => source(`fold-${i}`, values, 13, i, { turn: 'round', smoothing: 'catmull-rom' }));
  const angular = foldValues.map((values, i) => source(`fold-${i}`, values, 13, i));
  const layers = angular.map(stroke => ({ ...stroke }));
  layers.push(...[
    [[153, 182], [202, 175], [240, 188], [235, 213], [279, 225]],
    [[348, 117], [398, 123], [439, 143], [435, 167], [482, 178]],
    [[71, 181], [112, 167], [146, 171], [142, 196], [181, 202]],
  ].map((values, i) => source(`ledge-${i}`, values, 8.5 + i, i + 4, { opacity: .60 })));
  const layeredMixed = authoredInkLayers(mixed, {
    'long-0': 'accent', 'long-1': 'body', 'long-2': 'wash', 'long-3': 'body',
    'long-4': 'body', 'long-5': 'wash', 'long-6': 'wash', 'long-7': 'wash',
    'short-0': 'accent', 'short-1': 'wash', 'short-2': 'body', 'short-3': 'accent',
    'short-4': 'body', 'short-5': 'wash', 'short-6': 'wash', 'short-7': 'wash',
  });
  const layeredFacets = authoredInkLayers(facets, {
    'sweep-0': 'body', 'sweep-1': 'wash', 'sweep-2': 'wash', 'sweep-3': 'accent', 'sweep-4': 'body',
    'small-0': 'wash', 'small-1': 'accent', 'small-2': 'wash', 'small-3': 'body',
    'small-4': 'accent', 'small-5': 'wash', 'small-6': 'body',
  });
  const layeredLedges = authoredInkLayers(layers, {
    'fold-0': 'accent', 'fold-1': 'wash', 'fold-2': 'body', 'fold-3': 'wash',
    'ledge-0': 'body', 'ledge-1': 'wash', 'ledge-2': 'wash',
  });
  return [
    { id: 'pima', title: '16 · 披麻皴', techniqueIds: ['cun-pima'], detail: [244, 147],
      variable: '平行排线对照 → 长线错落交搭 → 淡底、中墨与少量浓笔，长短留隙。',
      criteria: '比较线组的方向、交搭与露纸，先看坡势再看纹理密度。',
      limits: '三列同时改变笔路组织、笔数和局部宽度；第三列另有淡底、中墨、浓提与笔序，不是单变量强弱档。仅研究作者骨线上长短披麻的程序接触。',
      variants: [variant('parallel', '对照 · 平行排线 / 9 笔', 'pima', parallel), variant('long', '长线 · 错落交搭 / 12 笔', 'pima', long), variant('mixed', '层级 · 淡皴浓提 / 16 笔', 'pima', layeredMixed)] },
    { id: 'axe', title: '17 · 斧劈皴', techniqueIds: ['cun-axe'], detail: [287, 136],
      variable: '等宽中锋对照 → 侧锋横扫斜拖 → 淡切面打底，浓笔提面，交叠留明。',
      criteria: '前两列保留相同源笔路，比较侧接触与提按；第三列重排大笔并增补局部小切笔。',
      limits: '第一到第二列同时改变接触、提按和笔宽；第三列的笔数与墨量也不同。大小笔不是所有历史大小斧劈的复原。',
      variants: [variant('equal', '对照 · 等宽中锋 / 6 笔', 'axe', equal), variant('side', '侧锋 · 横扫斜拖 / 6 笔', 'axe', cuts), variant('facets', '层级 · 淡面浓提 / 12 笔', 'axe', layeredFacets)] },
    { id: 'zhedai', title: '18 · 折带皴', techniqueIds: ['cun-zhedai'], detail: [233, 129],
      variable: '圆转对照 → 横向行笔、保留折角 → 淡层先行，局部浓提，疏密相让。',
      criteria: '前两列使用同一源折线，查看圆转与方折；第三列由作者增补较轻的层理连接。',
      limits: '前两列改变转折执行与平滑方式；第三列改变路径、笔数和墨量。方折形态不等于已经验证真实腕法。',
      variants: [variant('rounded', '对照 · 圆转 / 4 笔', 'zhedai', rounded), variant('angular', '横折 · 保留棱角 / 4 笔', 'zhedai', angular), variant('layered', '层级 · 虚实留气 / 7 笔', 'zhedai', layeredLedges)] },
  ];
}

export function editCunStroke(document, id, { dx = 0, width } = {}) {
  if (!Number.isFinite(dx)) throw new RangeError('Stroke displacement must be finite');
  if (!document.recipe.strokes.some(stroke => stroke.id === id)) throw new RangeError('Unknown cun stroke id');
  return reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id !== id ? stroke : {
    ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx })),
    options: { ...stroke.options, ...(width === undefined ? {} : { width }) },
  }) });
}
