import { createCunDocument, reviseCunDocument } from '../dist/index.js';
import { authoredPathTexture } from './authored-study-path.mjs';

export const branchCunInputs = Object.freeze({ seed: 261126, layout: 'slope', widthScale: 1, dryness: .58, time: 8 });
export const branchCunSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const cache = new Map();
function compiled(strokes, options) {
  const key = JSON.stringify([strokes, options]);
  let document = cache.get(key);
  if (document) cache.delete(key); else document = createCunDocument(strokes, options);
  cache.set(key, document); if (cache.size > 64) cache.delete(cache.keys().next().value);
  return document;
}
const transfer = (point, layout) => layout === 'arc'
  ? { ...point, x: 280 + (point.x - 280) * .9, y: 118 + (point.y - 118) * .82 + 20 * Math.sin((point.x - 50) * Math.PI / 460) }
  : layout === 'fold' ? { ...point, x: point.x + .16 * (point.y - 130),
    y: point.y * .84 + 28 - 16 * Math.max(0, Math.min(1, (point.x - 260) / 60)) } : { ...point };
const plainControls = [{ at: 0, pressure: 1, side: 0, angle: Math.PI / 2, inkLoad: 1 }, { at: 1, pressure: 1, side: 0, angle: Math.PI / 2, inkLoad: 1 }];
const neutral = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear', controls: plainControls };

/** Authored path groups: the library does not infer clouds, rock faces or branch graphs. */
export function makeBranchCunStudies(options = {}) {
  const inputs = { ...branchCunInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown branch-cun study layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const source = (id, values, width, index, extra = {}) => ({ id,
    points: values.map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .76, start: index * .12, duration: .55, ...extra },
  });
  const variant = (id, label, technique, strokes) => ({ id, label,
    document: compiled(strokes, { ...branchCunSize, technique, seed: inputs.seed, dryness: inputs.dryness }),
  });

  // Deliberate closed, concentric rings are a counterexample, not a cloud preset.
  const closed = Array.from({ length: 6 }, (_, i) => {
    const cx = i < 3 ? 187 : 363, cy = i < 3 ? 108 : 155, rx = 68 - (i % 3) * 17, ry = 53 - (i % 3) * 13;
    return source(`cloud-${i}`, Array.from({ length: 25 }, (_, j) => {
      const angle = j / 24 * Math.PI * 2; return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry, 1];
    }), 5.5, i, neutral);
  });
  const cloudValues = [
    [[97, 144, .35], [107, 101, .8], [138, 65, .85], [178, 58, .72], [205, 79, .6], [199, 106, .3]],
    [[128, 169, .35], [139, 130, .76], [167, 106, .84], [200, 111, .7], [224, 138, .55], [213, 164, .2]],
    [[183, 89, .3], [220, 72, .75], [253, 83, .84], [264, 111, .68], [249, 137, .2]],
    [[224, 192, .35], [238, 150, .8], [275, 128, .84], [310, 143, .7], [320, 174, .55], [303, 196, .2]],
    [[284, 109, .3], [309, 81, .75], [343, 80, .82], [369, 103, .7], [367, 131, .2]],
    [[336, 215, .3], [349, 173, .76], [381, 147, .82], [415, 153, .7], [437, 185, .55], [425, 209, .2]],
  ].map((values, i) => authoredPathTexture(values, `cloud-${i}`, { amplitude: .6, smooth: true, step: 5 }));
  const opened = cloudValues.map((values, i) => source(`cloud-${i}`, values, 5.5, i));
  const cloudLayered = [4, 2, 0, 5, 3, 1].map((i, order) => source(`cloud-${i}`, cloudValues[i], [6.4, 6, 5.2, 6.6, 4.6, 4][order], order,
    { opacity: order < 3 ? .47 : .8 }));
  cloudLayered.push(...[
    [[111, 181, .3], [120, 156, .7], [145, 147, .78], [167, 164, .6], [164, 185, .15]],
    [[202, 207, .3], [207, 182, .7], [233, 173, .78], [253, 190, .6], [249, 213, .15]],
    [[300, 121, .3], [319, 110, .7], [339, 119, .76], [348, 142, .5], [337, 157, .15]],
    [[390, 132, .3], [413, 124, .67], [437, 139, .74], [449, 160, .5], [442, 177, .15]],
  ].map((values, i) => source(`overlap-${i}`, values, [4.6, 4.2, 3.8, 3.6][i], i + 6, { opacity: i < 2 ? .78 : .55 })));

  const short = (x, y, dx, dy) => [[x, y, .35], [x + dx * .3, y + dy * .28, .85], [x + dx * .65, y + dy * .64, .7], [x + dx, y + dy, .12]];
  const grid = Array.from({ length: 24 }, (_, i) => short(111 + i % 6 * 62, 55 + Math.floor(i / 6) * 47, 3, 17));
  // Same paths in these two columns isolate the contact/gesture change.
  const evenPoints = grid.map((values, i) => source(`point-${i}`, values, 10, i, neutral));
  const pressedPoints = grid.map((values, i) => source(`point-${i}`, values, 10, i));
  const pointPlaces = [
    [124, 57, 2, 17], [139, 69, -2, 15], [155, 54, 4, 19], [162, 79, -1, 16], [119, 87, 4, 17], [147, 99, -2, 15],
    [163, 121, 4, 18], [178, 133, -3, 17], [195, 116, 3, 20], [204, 143, -2, 16], [183, 155, 4, 18], [151, 165, -2, 15],
    [118, 180, 4, 20], [137, 192, -3, 18], [157, 180, 4, 16], [165, 207, -2, 19], [129, 211, 4, 14], [206, 66, -2, 17],
    [221, 82, 3, 16], [213, 103, -1, 15], [235, 116, 3, 17], [222, 172, -1, 16], [211, 193, 2, 15], [238, 205, -2, 14],
    [294, 79, 4, 16], [315, 103, -3, 14], [361, 86, 4, 17], [376, 116, -2, 15], [424, 152, 3, 16],
    [283, 154, 4, 16], [303, 181, -2, 14], [351, 162, 3, 15], [385, 206, -2, 16], [437, 214, 3, 14],
  ];
  const clusteredPoints = pointPlaces.map(([x, y, dx, dy], i) => source(`cluster-${i}`, short(x, y, dx, dy), i < 24 ? [10.5, 11.5, 9.5][i % 3] : 7.5, i,
    { opacity: i < 24 ? .82 : .45 }));

  const radiating = Array.from({ length: 8 }, (_, i) => {
    const angle = -.95 + i * .27;
    return source(`vein-${i}`, [[260, 44, 1], [260 + Math.sin(angle) * 185, 44 + Math.cos(angle) * 185, 1]], 5.5, i, neutral);
  });
  const veinValues = [
    [[262, 43, .85], [236, 77, .8], [209, 119, .67], [168, 163, .48], [102, 212, .13]],
    [[262, 43, .85], [254, 84, .8], [242, 125, .68], [224, 169, .46], [188, 233, .12]],
    [[262, 43, .85], [280, 88, .8], [300, 127, .67], [333, 166, .46], [374, 222, .12]],
    [[262, 43, .85], [307, 77, .78], [351, 113, .62], [402, 151, .42], [471, 197, .12]],
    [[209, 119, .6], [175, 133, .53], [138, 153, .4], [84, 180, .08]],
    [[242, 125, .6], [213, 141, .53], [182, 165, .38], [145, 201, .08]],
    [[300, 127, .58], [319, 152, .5], [331, 184, .35], [337, 233, .08]],
    [[351, 113, .56], [379, 123, .47], [417, 131, .33], [463, 155, .08]],
  ].map((values, i) => authoredPathTexture(values, `vein-${i}`, { amplitude: .45, smooth: true, step: 5 }));
  const veins = veinValues.map((values, i) => source(`vein-${i}`, values, 5.5, i));
  const organizedVeins = veinValues.map((values, i) => source(`vein-${i}`, values, [7.4, 6.6, 6.1, 5.5, 4.2, 3.8, 3.6, 3.2][i], i,
    { opacity: i < 4 ? [.8, .78, .7, .62][i] : .58 }));
  organizedVeins.push(...[
    [[236, 77, .48], [204, 89, .42], [174, 112, .28], [145, 136, .05]],
    [[224, 169, .44], [201, 179, .35], [172, 209, .2], [148, 232, .04]],
    [[280, 88, .44], [287, 119, .36], [282, 156, .22], [272, 197, .04]],
    [[402, 151, .4], [411, 174, .32], [430, 197, .18], [449, 216, .04]],
  ].map((values, i) => source(`branch-${i}`, values, [3.4, 3, 2.8, 2.6][i], i + 8, { opacity: .48 })));

  return [
    { id: 'cloud', title: '22 · 卷云／云头形态研究', techniqueIds: ['cun-juanyun', 'cun-yuntou'], detail: [224, 145],
      variable: '闭圆同心反例 → 开口环抱 → 前后搭接、留面。',
      criteria: '比较闭合圆片与开口环抱线，再观察淡后浓前的搭接和空隙；不预认定石面转背已成立。',
      limits: '两名资料均部分支持，名称界线未核清；共用形态研究，不裁定同义。三列同时改变路径、笔序、数量、宽度和透明度，前后关系由作者组织。',
      variants: [variant('closed', '反例 · 闭圆同心 / 6 笔', 'cloud-study', closed), variant('opened', '研究 · 开口环抱 / 6 笔', 'cloud-study', opened), variant('layered', '组织 · 搭接留面 / 10 笔', 'cloud-study', cloudLayered)] },
    { id: 'point', title: '23 · 雨点／豆瓣点皴研究', techniqueIds: ['cun-yudian', 'cun-douban'], detail: [168, 132],
      variable: '等距短点对照 → 尖触按腹 → 阴密阳疏。',
      criteria: '前两列保留相同短路，比较按落接触；第三列以左粗密、右疏淡的显式点群观察阴阳关系。',
      limits: '两名资料均部分支持，不设固定长宽比界线。前两列仅改变接触与局部动作，第三列改变位置、方向、笔数、宽度和透明度；不是雨滴特效或自动撒点。',
      variants: [variant('even', '对照 · 等距短点 / 24 笔', 'point-study', evenPoints), variant('pressed', '按落 · 尖触按腹 / 24 笔', 'point-study', pressedPoints), variant('clustered', '组织 · 阴密阳疏 / 34 笔', 'point-study', clusteredPoints)] },
    { id: 'heye', title: '24 · 荷叶皴', techniqueIds: ['cun-heye'], detail: [238, 123],
      variable: '等角放射反例 → 主筋向下分歧 → 主次交接、下端留气。',
      criteria: '由峰顶集中向下分出主次脉，比较等角放射与不均等分歧，再观察枝脉交接、轻淡收尾与山脚空隙。',
      limits: '作者显式提供全部筋脉路径和交接点；没有自动父子图或固定山体生成器。三列改变路径组织、接触、宽度、数量和透明度；淡收不等于真实水墨流动。',
      variants: [variant('radial', '反例 · 等角放射 / 8 笔', 'heye', radiating), variant('veins', '分歧 · 主筋下行 / 8 笔', 'heye', veins), variant('organized', '组织 · 主次留气 / 12 笔', 'heye', organizedVeins)] },
  ];
}

export function editBranchCunStroke(document, id, { dx = 0, width } = {}) {
  if (!Number.isFinite(dx)) throw new RangeError('Stroke displacement must be finite');
  if (!document.recipe.strokes.some(stroke => stroke.id === id)) throw new RangeError('Unknown branch-cun stroke id');
  return reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id !== id ? stroke : {
    ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx })),
    options: { ...stroke.options, ...(width === undefined ? {} : { width }) },
  }) });
}
