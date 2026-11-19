import { createWaterProcessDocument, reviseWaterProcessDocument } from '../dist/index.js';

export const waterInputs = Object.freeze({ seed: 261123, layout: 'ridge', water: .95, interval: .5, time: 8 });
export const waterSize = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#20251f' });
const documentCache = new Map();
function compiledDocument(events, settings) {
  const key = JSON.stringify([events, settings]);
  let document = documentCache.get(key);
  if (!document) document = createWaterProcessDocument(events, settings);
  else documentCache.delete(key);
  documentCache.set(key, document);
  if (documentCache.size > 64) documentCache.delete(documentCache.keys().next().value);
  return document;
}

const transfer = (point, layout, index = 0) => layout === 'arc'
  ? { ...point, y: 130 + (point.y - 130) * .66 + 24 * Math.sin((point.x - 60) * Math.PI / 440) }
  : layout === 'fold' ? { ...point, x: point.x + (index % 2 ? -8 : 8), y: point.y + (index % 2 ? 13 : -10) } : { ...point };
const path = (values, layout) => values.map(([x, y, pressure], index) => transfer({ x, y, pressure }, layout, index));
function validate(inputs) {
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!['ridge', 'arc', 'fold'].includes(inputs.layout)) throw new RangeError('Unknown water study layout');
  for (const [key, max] of [['water', 1], ['interval', 4], ['time', 8]]) if (!Number.isFinite(inputs[key]) || inputs[key] < 0 || inputs[key] > max) throw new RangeError(`${key} must be in 0..${max}`);
}

/** Explicit contacts and nonuniform droplets belong to the caller, not a spray stamp. */
export function makeWaterStudies(options = {}) {
  const inputs = { ...waterInputs, ...options }; validate(inputs);
  const settings = { ...waterSize, seed: inputs.seed };
  const stroke = (id, points, width, index, extras = {}) => ({ points: path(points, inputs.layout), options: {
    id, seed: (inputs.seed ^ Math.imul(index + 1, 2654435761)) >>> 0,
    width, opacity: .95, dryness: .16, axis: 'side', smoothing: 'catmull-rom', ...extras,
  } });
  const inkStrokes = [stroke('ink-sweep', [[78, 173, 0], [155, 132, .91], [245, 111, .96], [344, 139, .88], [480, 176, 0]], 91, 0),
    stroke('ink-ridge', [[113, 112, 0], [206, 83, .72], [280, 113, .8], [356, 192, 0]], 24, 1)];
  const waterStrokes = [stroke('water-inward', [[253, 84, .6], [285, 115, 1], [301, 153, .9], [327, 178, .25]], 56, 2,
    { axis: 'center', dryness: 0 })];
  const prewetStrokes = [stroke('prewet-field', [[96, 149, .6], [223, 128, 1], [358, 150, 1], [472, 171, .6]], 155, 3,
    { axis: 'center', dryness: 0 })];
  const dropletValues = [['d1', 169, 122, 10], ['d2', 196, 166, 16], ['d3', 253, 106, 21],
    ['d4', 312, 177, 13], ['d5', 366, 146, 19], ['d6', 390, 183, 8], ['d7', 221, 191, 7]];
  const droplets = dropletValues.map(([id, x, y, radius], index) => ({ id, ...transfer({ x, y }, inputs.layout, index), radius }));
  const ink = at => ({ kind: 'ink', id: 'ink', strokes: inkStrokes, concentration: .76, water: .95, at, dryAfter: 2, mode: 'wet-mix' });
  const clear = (at, contacts) => ({ kind: 'water', id: 'clear-water', ...contacts, water: inputs.water, at, dryAfter: 2, mode: 'wet-mix' });
  const variant = (id, label, events) => ({ id, label, document: compiledDocument(events, settings) });
  const waterFront = transfer({ x: 322, y: 170 }, inputs.layout, 3);
  const inkFront = transfer({ x: 340, y: 191 }, inputs.layout, 3);
  const dropDetail = droplets.find(drop => drop.id === 'd5');
  const wet = inputs.interval < 2;
  return [
    { id: 'water-after', title: '13 · 水破墨', variable: '同一底墨与清水笔路：无加水 → 过窗后加水 → 湿窗内加水。',
      criteria: '看湿内区的变浅、前沿迁移与小段浓墨沉积；水线应有强弱和断续，干后加水保留原墨。局部放大取同一位置。',
      limits: '后两列只改清水到达时机；清水不加白色、不擦掉墨。边缘留墨是有限事件沉积近似，不是沿整圈描黑，也未还原真实水流、蒸发或向内化墨。',
      techniqueIds: ['water-break-ink'], detail: [waterFront.x, waterFront.y],
      variants: [variant('baseline', '对照 · 原墨 / 未加水', [ink(0)]),
        variant('dry', '已过湿窗 · 4 秒后加水', [ink(0), clear(4, { strokes: waterStrokes })]),
        variant('wet', `${wet ? '未干' : '已过湿窗'} · ${inputs.interval.toFixed(1)} 秒后加水`, [ink(0), clear(inputs.interval, { strokes: waterStrokes })])] },
    { id: 'ink-after', title: '14 · 墨破水', variable: '同一墨笔进入干接触、已过窗预湿区与仍湿预湿区。',
      criteria: '预湿阶段只有水、不显色；相同墨笔到达后，比较受水内区、迁移前沿与局部较深的停留段。',
      limits: '第二、三列只改墨到达时机；第一列没有预湿事件。湿窗是程序条件，不是纸张实测秒数；深边在到达事件内生成，不随等待模拟连续变干。',
      techniqueIds: ['ink-break-water'], detail: [inkFront.x, inkFront.y],
      variants: [variant('baseline', '对照 · 不预湿，直接落墨', [ink(0)]),
        variant('expired', '先水后墨 · 预湿已过窗', [clear(0, { strokes: prewetStrokes }), ink(4)]),
        variant('prewet', `先水后墨 · ${wet ? '仍湿' : '已过湿窗'} / ${inputs.interval.toFixed(1)} 秒`, [clear(0, { strokes: prewetStrokes }), ink(inputs.interval)])] },
    { id: 'droplets', title: '15 · 分散加水', variable: '显式水滴落点与大小：原墨 → 墨后加水 → 水后落墨。',
      criteria: '水滴疏密与大小由调用者逐点组织；比较同一组清水接触的局部水线、断续浓墨与较浅内区，避免每滴变成同样的黑圆圈。',
      limits: '这是洒水的待核实程序实验。第三列改变水墨先后，局部笔路偏置与事件种子会改变近似，不代表真实材料方向性已建立；不以圆斑、描黑圈或白点数量证明传统技法成立。',
      techniqueIds: ['water-sprinkle'], detail: [dropDetail.x, dropDetail.y],
      variants: [variant('baseline', '对照 · 原墨 / 未加水', [ink(0)]),
        variant('after', `墨后加水 · ${wet ? '湿窗内' : '已过窗'} / ${inputs.interval.toFixed(1)} 秒`, [ink(0), clear(inputs.interval, { droplets })]),
        variant('before', `水后落墨 · ${wet ? '湿窗内' : '已过窗'} / ${inputs.interval.toFixed(1)} 秒`, [clear(0, { droplets }), ink(inputs.interval)])] },
  ];
}

/** Move an explicit event while retaining every other source event and stable identity. */
export function editWaterEvent(document, id, { dx = 0, water } = {}) {
  if (!Number.isFinite(dx)) throw new RangeError('Event displacement must be finite');
  if (!document.recipe.events.some(event => event.id === id)) throw new RangeError('Unknown water event');
  return reviseWaterProcessDocument(document, { events: document.recipe.events.map(event => event.id !== id ? event : {
    ...event, ...(water === undefined ? {} : { water }),
    ...(event.strokes ? { strokes: event.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx })) })) } : {}),
    ...(event.droplets ? { droplets: event.droplets.map(drop => ({ ...drop, x: drop.x + dx })) } : {}),
  }) });
}

export function editWaterDroplet(document, eventId, id, { dx = 0, radius } = {}) {
  if (!Number.isFinite(dx)) throw new RangeError('Droplet displacement must be finite');
  const event = document.recipe.events.find(event => event.id === eventId);
  if (!event?.droplets?.some(drop => drop.id === id)) throw new RangeError('Unknown water droplet');
  return reviseWaterProcessDocument(document, { events: document.recipe.events.map(event => event.id !== eventId ? event : {
    ...event, droplets: event.droplets.map(drop => drop.id !== id ? drop : { ...drop, x: drop.x + dx, ...(radius === undefined ? {} : { radius }) }),
  }) });
}
