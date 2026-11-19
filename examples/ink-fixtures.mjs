import { createInkProcessDocument, reviseInkProcessDocument } from '../dist/index.js';

export const inkInputs = Object.freeze({ seed: 261122, layout: 'ridge', concentration: .82, accumulation: 1, interval: .6, time: 8 });
export const inkSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#20251f' });

/** Authored path transfers; no region filling or generated landscape template. */
export function inkPath(points, layout) {
  if (!['ridge', 'arc', 'fold'].includes(layout)) throw new RangeError('Unknown ink path layout');
  return points.map((point, index) => {
    if (layout === 'arc') return { ...point, y: 130 + (point.y - 130) * .66 + 24 * Math.sin((point.x - 60) * Math.PI / 440) };
    if (layout === 'fold') return { ...point, x: point.x + (index % 2 ? -8 : 8), y: point.y + (index % 2 ? 13 : -10) };
    return { ...point };
  });
}

const points = values => values.map(([x, y, pressure]) => ({ x, y, pressure }));
const sourceStroke = (id, values, width, inputs, index, extras = {}) => ({
  points: inkPath(points(values), inputs.layout),
  options: { id, seed: (inputs.seed ^ ((index + 1) * 2654435761)) >>> 0, width, opacity: .9, dryness: .15,
    axis: 'side', smoothing: 'catmull-rom', ...extras },
});
const moveStroke = (stroke, dx, dy, scale = 1) => ({ ...stroke, options: { ...stroke.options, width: stroke.options.width * scale },
  points: stroke.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) });
// Drying belongs to the author's layer design. Later deposits have separate
// material identities rather than stamping exactly the same grain three times.
const drierStrokes = (strokes, dryness, phase) => strokes.map(stroke => ({ ...stroke,
  options: { ...stroke.options, dryness, seed: (stroke.options.seed ^ phase) >>> 0,
    controls: [{ at: 0, dryness: Math.min(1, dryness + .08) }, { at: .34, dryness },
      { at: .72, dryness: Math.min(1, dryness + .12) }, { at: 1, dryness: Math.min(1, dryness + .2) }] },
}));

function validate(inputs) {
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['ridge', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown ink path layout');
  for (const [key, max] of [['concentration', 1], ['accumulation', 1.5], ['interval', 4], ['time', 8]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < 0 || inputs[key] > max) throw new RangeError(`${key} must be in 0..${max}`);
  }
}

export function makeInkStudies(options = {}) {
  const inputs = { ...inkInputs, ...options }; validate(inputs);
  const processOptions = { ...inkSize, seed: inputs.seed };
  const strokes = [
    sourceStroke('spine', [[92, 213, 0], [154, 139, .72], [222, 69, .84], [306, 109, .74], [416, 178, 0]], 43, inputs, 0),
    sourceStroke('cross', [[125, 116, 0], [221, 143, .84], [321, 161, .78], [454, 134, 0]], 36, inputs, 1),
    sourceStroke('lower', [[159, 213, 0], [227, 176, .78], [321, 205, .76], [412, 209, 0]], 29, inputs, 2),
  ];
  const layer = (id, marks, concentration, at = 0, extras = {}) => ({ id, strokes: marks, concentration, water: .5, at,
    dryAfter: 1, mode: 'glaze', ...extras });
  const variant = (id, label, layers) => ({ id, label, document: createInkProcessDocument(layers, processOptions) });
  const tone = concentration => [layer('tone', strokes, concentration)];
  const initial = layer('first', strokes, .18);
  const repeated = [initial, layer('second', drierStrokes(strokes, .34, 0x593167af), .24 * inputs.accumulation, 3),
    layer('third', drierStrokes(strokes, .52, 0x19d756c3), .36 * inputs.accumulation, 6)];
  const selectiveSecond = [moveStroke(strokes[0], 23, 10, .78), moveStroke(strokes[1], 18, 14, .72), moveStroke(strokes[2], 22, -7, .82)];
  const selectiveThird = [
    sourceStroke('spine', [[251, 104, 0], [287, 129, .8], [324, 166, .76], [356, 193, 0]], 31, inputs, 0),
    sourceStroke('cross', [[252, 165, 0], [294, 180, .83], [347, 198, .7], [396, 210, 0]], 25, inputs, 1),
    sourceStroke('lower', [[187, 194, 0], [218, 190, .73], [246, 208, .7], [269, 222, 0]], 21, inputs, 2),
  ];
  const selective = [initial, layer('second', drierStrokes(selectiveSecond, .34, 0x593167af), .24 * inputs.accumulation, 3),
    layer('third', drierStrokes(selectiveThird, .52, 0x19d756c3), .36 * inputs.accumulation, 6)];
  const under = [sourceStroke('under', [[88, 163, 0], [181, 133, .9], [285, 126, .96], [393, 146, .86], [482, 159, 0]], 94, inputs, 6)];
  const over = [sourceStroke('over', [[220, 55, 0], [258, 106, .9], [294, 157, .94], [346, 214, 0]], 65, inputs, 7)];
  const breaking = (at, reversed = false) => [
    layer('under', under, reversed ? .78 : .18, 0, { water: .88, dryAfter: 2, mode: 'glaze' }),
    layer('over', over, reversed ? .18 : .78, at, { water: .88, dryAfter: 2, mode: 'wet-mix' }),
  ];
  const insideWetWindow = inputs.interval < 2;
  return [
    { id: 'tone', title: '10 · 浓淡', variable: '同一笔组，只改颜料浓度：0.18 → 0.45 → 可调浓度。',
      criteria: '看同一接触和留纸下的墨色轻重、交叠与纹理可读性；水量、透明度、笔路和压力保持一致。',
      limits: '浓度在程序中控制光学密度，水量另行记录；它不是实测墨液配比，也不能概括传统浓淡墨的所有纸性与用法。',
      techniqueIds: ['ink-light', 'ink-dark'],
      variants: [variant('light', '淡 · 浓度 0.18', tone(.18)), variant('middle', '中 · 浓度 0.45', tone(.45)),
        variant('dark', `浓 · 浓度 ${inputs.concentration.toFixed(2)}`, tone(inputs.concentration))] },
    { id: 'layered', title: '11 · 积墨', variable: '单层薄墨 → 三层原位递加 → 三层分区递加；每次待干，后层渐枯。',
      criteria: '比较原位增厚与有选择的增补。后层以不同束纹、较枯接触咬合已有墨迹；第三列改变后两层的笔路和覆盖，在暗处加深，保留较轻的第一层。',
      limits: '第一列3笔，后两列9笔；后层同时改变枯润和材质种子，第三列又改变路径、线宽和覆盖，因此不是单变量或等墨量实验。这是分层组织研究，不以层数或叠黑程度证明传统积墨成立。',
      techniqueIds: ['ink-layered'],
      variants: [variant('single', '对照 · 单层薄墨 / 3 笔', [initial]), variant('repeated', '变化 · 三层原位全覆 / 9 笔', repeated),
        variant('selective', '组织 · 三层分区递加 / 9 笔', selective)] },
    { id: 'broken', title: '12 · 破墨', variable: '固定两次落墨路径，先比待干与未干；第三列反转浓淡，另作方向比较。',
      criteria: '第一、二列只改第二次落墨时刻；看局部交界交换与已干叠层的区别。第三列先浓后淡，查看反向组织。设定湿窗为2秒，间隔达到2秒后第二、三列也只作已干叠层。',
      limits: '水量与干燥窗口由调用者声明，局部有限交换是视觉近似，不是宣纸扩散。第三列同时反转浓度，不能与第二列当成单变量实验。时间表示整层到达，不表示连续落笔。',
      techniqueIds: ['ink-broken', 'ink-wet'],
      variants: [variant('dry', '对照 · 待干后叠加 / 间隔 4 秒', breaking(4)),
        variant('wet', `${insideWetWindow ? '未干 · 浓破淡' : '已过湿窗 · 添浓墨'} / 间隔 ${inputs.interval.toFixed(1)} 秒`, breaking(inputs.interval)),
        variant('reverse', `反向 · ${insideWetWindow ? '淡破浓' : '已干后添淡墨'} / 间隔 ${inputs.interval.toFixed(1)} 秒`, breaking(inputs.interval, true))] },
  ];
}

/** Source edits deliberately recompile the process; wet interactions may affect shared pixels. */
export function editInkLayer(document, id, { dx = 0, concentration } = {}) {
  if (!document.recipe.layers.some(layer => layer.id === id)) throw new RangeError('Unknown layer id');
  if (!Number.isFinite(dx)) throw new RangeError('Layer displacement must be finite');
  return reviseInkProcessDocument(document, { layers: document.recipe.layers.map(layer => layer.id !== id ? layer : {
    ...layer, ...(concentration === undefined ? {} : { concentration }),
    strokes: layer.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx })) })),
  }) });
}
