import { createCunDocument, reviseCunDocument } from '../dist/index.js';
import { authoredPathTexture } from './authored-study-path.mjs';
import { authoredInkLayers } from './authored-ink-layers.mjs';

export const lineCunInputs = Object.freeze({ seed: 261125, layout: 'slope', widthScale: 1, dryness: .58, time: 8 });
export const lineCunSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
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
  : layout === 'fold' ? { ...point, x: point.x + (point.y > 130 ? 18 : -11), y: point.y * .84 + (point.x > 290 ? 12 : 28) } : { ...point };
const plainControls = [{ at: 0, pressure: 1, side: 0, angle: Math.PI / 2, inkLoad: 1 }, { at: 1, pressure: 1, side: 0, angle: Math.PI / 2, inkLoad: 1 }];
const neutral = { axis: 'center', entry: 'preserve', finish: 'preserve', pressureProfile: 'preserve', turn: 'preserve', smoothing: 'linear', controls: plainControls };

/** Explicit author paths and layering: no random fills, texture stamps or fixed mountain generator. */
export function makeLineCunStudies(options = {}) {
  const inputs = { ...lineCunInputs, ...options };
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['slope', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown line-cun study layout');
  for (const [key, min, max] of [['widthScale', .4, 1.6], ['dryness', 0, 1], ['time', 0, 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < min || inputs[key] > max) throw new RangeError(`${key} must be in ${min}..${max}`);
  }
  const source = (id, values, width, index, extra = {}) => ({ id,
    points: (extra.controls === plainControls ? values : authoredPathTexture(values, `line-cun-${id}`, {
      amplitude: width < 4 ? .34 : .62, step: /^(twig|shadow)-/.test(id) ? 8 : 4.5,
      smooth: !/^(twig|shadow)-/.test(id),
    })).map(([x, y, pressure = 1]) => transfer({ x, y, pressure }, inputs.layout)),
    options: { width: width * inputs.widthScale, opacity: .76, start: index * .12, duration: .55, ...extra },
  });
  const variant = (id, label, technique, strokes) => ({ id, label,
    document: compiled(strokes, { ...lineCunSize, technique, seed: inputs.seed, dryness: inputs.dryness }),
  });

  const knotValues = [
    [[151, 40, .5], [164, 62, .8], [145, 88, .62], [151, 101, .84], [142, 121, .65], [150, 158, .8], [135, 198, .3]],
    [[186, 44, .45], [177, 69, .8], [183, 83, .65], [170, 118, .76], [184, 141, .62], [165, 184, .82], [181, 211, .25]],
    [[215, 54, .4], [230, 73, .8], [213, 111, .6], [218, 145, .78], [202, 164, .64], [211, 207, .72], [201, 225, .25]],
    [[253, 58, .5], [239, 92, .8], [246, 108, .62], [229, 151, .78], [239, 175, .65], [228, 201, .3]],
    [[285, 65, .4], [302, 85, .76], [291, 104, .62], [295, 137, .8], [270, 179, .64], [280, 202, .3]],
    [[321, 78, .45], [307, 101, .77], [315, 140, .6], [299, 159, .8], [303, 182, .6], [295, 218, .25]],
    [[350, 94, .4], [370, 125, .78], [353, 142, .62], [358, 178, .74], [343, 198, .25]],
    [[390, 111, .45], [381, 143, .76], [391, 155, .64], [374, 195, .78], [387, 219, .25]],
    [[422, 129, .4], [437, 154, .75], [420, 186, .6], [436, 206, .25]],
  ];
  const straight = knotValues.map((values, i) => source(`knot-${i}`, [values[0], values.at(-1)], 5, i, neutral));
  const curved = knotValues.map((values, i) => source(`knot-${i}`, values, 5, i));
  // A darker crossing group on the left, with open intervals through the right-facing plane.
  const knotOrganized = knotValues.filter((_, i) => i !== 5 && i !== 7).map((values, i) => source(`organized-knot-${i}`, values, [5.8, 5.2, 5.5, 4.8, 4.4, 3.8, 3.6][i], i));
  knotOrganized.push(...[
    [[117, 78, .4], [145, 100, .82], [136, 127, .64], [164, 150, .78], [152, 182, .3]],
    [[142, 110, .4], [177, 132, .82], [163, 158, .6], [191, 183, .76], [179, 215, .3]],
    [[188, 76, .35], [213, 97, .8], [201, 125, .65], [230, 149, .75], [213, 180, .25]],
    [[239, 100, .4], [263, 122, .76], [251, 150, .62], [277, 176, .7], [262, 208, .25]],
    [[113, 151, .4], [136, 170, .76], [121, 193, .6], [140, 214, .25]],
    [[318, 142, .3], [341, 163, .62], [330, 185, .5], [347, 210, .2]],
  ].map((values, i) => source(`cross-${i}`, values, [4.8, 4.9, 4.5, 4.2, 4.4, 3.2][i], i + 7, { opacity: i === 5 ? .52 : .76 })));

  const twigValues = [
    [[105, 54, .5], [149, 99, .9], [141, 130, .6], [184, 183, .25]],
    [[170, 48, .5], [186, 83, .86], [179, 117, .64], [224, 167, .3]],
    [[218, 77, .4], [242, 111, .8], [231, 145, .58], [264, 186, .25]],
    [[278, 73, .4], [288, 112, .76], [279, 134, .6], [322, 190, .25]],
    [[333, 101, .4], [355, 141, .74], [347, 162, .54], [378, 209, .25]],
    [[399, 125, .35], [418, 159, .7], [412, 183, .54], [446, 221, .2]],
    [[102, 166, .4], [158, 141, .82], [180, 150, .55], [232, 123, .25]],
    [[164, 227, .4], [192, 190, .8], [219, 196, .6], [286, 160, .25]],
    [[243, 221, .4], [286, 190, .78], [313, 199, .55], [357, 172, .25]],
    [[316, 111, .35], [358, 91, .72], [387, 102, .55], [425, 82, .2]],
  ];
  const sameDirection = twigValues.map((_, i) => source(`twig-${i}`, [[87 + i * 36, 65], [125 + i * 36, 214]], 6.5, i, neutral));
  const crossing = twigValues.map((values, i) => source(`twig-${i}`, values, 6.5, i));
  const twigOrganized = twigValues.map((values, i) => source(`twig-${i}`, values, [8.6, 8, 7.8, 5.4, 3.4, 3, 8.4, 7.8, 4.6, 3.2][i], i, { opacity: [4, 5, 9].includes(i) ? .48 : .78 }));
  twigOrganized.push(...[
    [[99, 101, .45], [125, 128, .83], [116, 146, .52], [148, 184, .25]],
    [[137, 73, .45], [164, 109, .84], [156, 131, .6], [193, 163, .25]],
    [[125, 202, .4], [166, 177, .8], [183, 186, .54], [218, 162, .2]],
    [[181, 84, .4], [206, 122, .84], [198, 144, .6], [233, 184, .25]],
    [[189, 216, .4], [224, 194, .8], [243, 201, .5], [265, 187, .25]],
    [[239, 100, .4], [259, 133, .78], [254, 153, .55], [280, 192, .25]],
    [[350, 209, .3], [379, 189, .58], [394, 196, .45], [421, 180, .2]],
  ].map((values, i) => source(`shadow-${i}`, values, i === 6 ? 3 : [7, 6.8, 7.2, 7, 6.4, 5.5][i], i + 10, { opacity: i === 6 ? .46 : .72 })));

  // Fixed short-line groups are a procedural fine-line hypothesis, not a historical wrist sequence.
  const fineValues = [
    [[137, 53, .4], [147, 68, .75], [141, 77, .5], [153, 95, .2]],
    [[162, 49, .4], [175, 58, .7], [170, 73, .52], [181, 87, .2]],
    [[188, 61, .35], [197, 79, .7], [192, 88, .5], [203, 105, .2]],
    [[124, 105, .4], [140, 114, .72], [137, 134, .52], [150, 145, .2]],
    [[158, 96, .4], [167, 113, .76], [159, 129, .5], [175, 145, .2]],
    [[181, 115, .4], [196, 125, .76], [191, 136, .52], [198, 157, .2]],
    [[119, 161, .4], [136, 177, .76], [132, 188, .5], [141, 202, .2]],
    [[154, 154, .4], [161, 172, .74], [153, 182, .52], [168, 201, .2]],
    [[187, 170, .35], [197, 179, .7], [191, 196, .52], [203, 208, .2]],
    [[249, 70, .3], [259, 87, .66], [253, 99, .48], [269, 111, .2]],
    [[281, 81, .3], [293, 91, .66], [285, 109, .48], [298, 121, .2]],
    [[310, 91, .3], [318, 107, .66], [311, 115, .48], [326, 132, .2]],
    [[240, 131, .3], [256, 144, .66], [254, 156, .48], [267, 174, .2]],
    [[279, 141, .3], [290, 157, .66], [282, 166, .48], [300, 179, .2]],
    [[312, 150, .3], [324, 165, .66], [316, 177, .48], [329, 198, .2]],
    [[360, 120, .3], [378, 135, .62], [372, 146, .46], [385, 166, .2]],
    [[398, 145, .3], [407, 163, .62], [401, 173, .46], [418, 185, .2]],
    [[368, 185, .3], [381, 193, .62], [374, 212, .46], [386, 224, .2]],
  ];
  const finePlain = fineValues.map((_, i) => source(`fine-${i}`, [[100 + (i % 6) * 65, 53 + Math.floor(i / 6) * 58], [113 + (i % 6) * 65, 95 + Math.floor(i / 6) * 58]], 2.6, i, { ...neutral, opacity: .66 }));
  const fineCurved = fineValues.map((values, i) => source(`fine-${i}`, values, 2.6, i, { opacity: .66 }));
  const fineOrganized = fineValues.flatMap((values, i) => [10, 13].includes(i) ? [] : [source(`fine-${i}`, values, i < 9 ? 2.8 : 2.1, i, { opacity: i < 9 ? .72 : .5 })]);
  fineOrganized.push(...[
    [[143, 77, .3], [155, 91, .7], [147, 105, .52], [159, 119, .2]],
    [[171, 83, .3], [184, 96, .72], [176, 111, .5], [189, 126, .2]],
    [[113, 128, .3], [125, 142, .7], [117, 157, .52], [130, 171, .2]],
    [[145, 124, .3], [159, 138, .72], [150, 151, .5], [163, 166, .2]],
    [[174, 140, .3], [187, 152, .7], [180, 166, .5], [193, 180, .2]],
    [[145, 186, .3], [159, 198, .7], [151, 212, .5], [164, 227, .2]],
    [[210, 69, .3], [222, 83, .66], [214, 96, .48], [226, 111, .2]],
    [[211, 128, .3], [225, 141, .66], [216, 155, .48], [230, 170, .2]],
    [[211, 187, .3], [225, 200, .66], [218, 214, .48], [229, 228, .2]],
    [[285, 106, .3], [298, 119, .64], [290, 133, .46], [303, 147, .2]],
    [[338, 151, .3], [351, 164, .6], [344, 178, .44], [356, 191, .2]],
    [[404, 190, .3], [417, 203, .58], [410, 217, .42], [422, 229, .2]],
  ].map((values, i) => source(`infill-${i}`, values, i < 9 ? 2.6 : 2, i + 16, { opacity: i < 9 ? .66 : .46 })));

  // Focal dark strokes stay on selected structural paths. Stable author keys
  // vary each role a little; the scene's material seed never shuffles its light.
  const inkLayers = (strokes, accents, bodies) => authoredInkLayers(strokes, Object.fromEntries(strokes.map(stroke =>
    [stroke.id, accents.includes(stroke.id) ? 'accent' : bodies.includes(stroke.id) ? 'body' : 'wash'])));
  const layeredKnots = inkLayers(knotOrganized,
    ['organized-knot-0', 'cross-1', 'cross-4'],
    ['organized-knot-1', 'organized-knot-3', 'cross-0', 'cross-2']);
  const layeredTwigs = inkLayers(twigOrganized,
    ['twig-0', 'twig-6', 'shadow-2'],
    ['twig-1', 'twig-2', 'twig-7', 'shadow-0', 'shadow-1', 'shadow-4']);
  const layeredFine = inkLayers(fineOrganized,
    ['fine-0', 'fine-4', 'infill-3'],
    ['fine-1', 'fine-3', 'fine-6', 'fine-7', 'fine-8', 'infill-0', 'infill-2', 'infill-5', 'infill-6']);

  return [
    { id: 'jiesuo', title: '19 · 解索皴', techniqueIds: ['cun-jiesuo'], detail: [185, 132],
      variable: '直顺线对照 → 中锋屈曲 → 淡线底层与浓线穿插、明处留空。',
      criteria: '比较屈曲线的连贯与穿插，观察密处是否仍有结构方向和空隙。',
      limits: '三列分别改变作者笔路、笔数组合、宽度与叠压；第三列另有淡底浓提与笔序，不是同一路径只改曲率。屈曲由作者供给，库不自动生成山体脉络。',
      variants: [variant('straight', '对照 · 直顺线 / 9 笔', 'jiesuo', straight), variant('curved', '屈曲 · 中锋线 / 9 笔', 'jiesuo', curved), variant('organized', '层级 · 淡底浓线 / 13 笔', 'jiesuo', layeredKnots)] },
    { id: 'luanchai', title: '20 · 乱柴皴', techniqueIds: ['cun-luanchai'], detail: [187, 145],
      variable: '同向排线对照 → 直折交错 → 淡干底笔先行、少量浓笔提骨，阳面留气。',
      criteria: '直线与折线交错形成方向关系；比较左侧粗密和右侧疏细，不以随机划痕代替组织。',
      limits: '第一到第二列改变作者路径与局部接触；第三列增加7笔并改变宽度、枯润、浓淡层级与先淡后浓的笔序。阴阳关系为本样片作者组织，不是所有画家的唯一墨色。',
      variants: [variant('parallel', '对照 · 同向排线 / 10 笔', 'luanchai', sameDirection), variant('crossing', '直折 · 方向交错 / 10 笔', 'luanchai', crossing), variant('organized', '层级 · 淡皴浓骨 / 17 笔', 'luanchai', layeredTwigs)] },
    { id: 'niumao', title: '21 · 牛毛细线研究', techniqueIds: ['cun-niumao'], detail: [170, 143],
      variable: '细线平排对照 → 细短弯线 → 淡线分组、局部浓提，保留脉隙。',
      criteria: '观察细线的长度、屈曲、疏密与线间露纸；与解索对比，不以笔宽一项认定传统分类。',
      limits: '资料仅部分支持；细短弯线与密度是程序假设。三列同时改变路径、笔数、宽度、浓淡及笔序，未验证王蒙作品的真实笔序或全部牛毛皴范围。',
      variants: [variant('parallel', '对照 · 细线平排 / 18 笔', 'niumao', finePlain), variant('curved', '假设 · 细短弯线 / 18 笔', 'niumao', fineCurved), variant('organized', '层级 · 疏密浓淡 / 28 笔', 'niumao', layeredFine)] },
  ];
}

export function editLineCunStroke(document, id, { dx = 0, width } = {}) {
  if (!Number.isFinite(dx)) throw new RangeError('Stroke displacement must be finite');
  if (!document.recipe.strokes.some(stroke => stroke.id === id)) throw new RangeError('Unknown line-cun stroke id');
  return reviseCunDocument(document, { strokes: document.recipe.strokes.map(stroke => stroke.id !== id ? stroke : {
    ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx })),
    options: { ...stroke.options, ...(width === undefined ? {} : { width }) },
  }) });
}
