import { createWaterProcessDocument, reviseWaterProcessDocument, sampleStrokePath, getNoise1D, getNoise2D } from '../dist/index.js';

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
function unevenWetContact(source, seed, amplitude) {
  const samples = sampleStrokePath(source.points, { spacing: 4.5, smoothing: 'catmull-rom' });
  return { ...source, points: samples.map((p, i) => {
    const s = p.distance, envelope = Math.sin(Math.PI * i / Math.max(1, samples.length - 1));
    const offset = amplitude * envelope * (.67 * getNoise1D(s / 27 + 13.7, seed) + .28 * getNoise1D(s / 8.6 + 31.2, seed ^ 0x19d7515f)
      + .13 * getNoise1D(s / 2.9 + 57.8, seed ^ 0x8170ae75));
    const pressure = Math.max(0, Math.min(1, Math.pow(p.pressure, .87) * (1 + .12 * getNoise2D(p.x / 24 + 3.1, p.y / 19 + 7.3, seed))));
    return { x: p.x + p.nx * offset, y: p.y + p.ny * offset, pressure };
  }), options: { ...source.options, smoothing: 'linear' } };
}
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
  const waterStrokes = [unevenWetContact(stroke('water-inward', [[253, 84, .6], [285, 115, 1], [301, 153, .9], [327, 178, .25]], 56, 2,
    { axis: 'center', dryness: 0 }), inputs.seed ^ 0x1870baf3, 5.4)];
  const prewetStrokes = [unevenWetContact(stroke('prewet-field', [[96, 149, .6], [223, 128, 1], [358, 150, 1], [472, 171, .6]], 155, 3,
    { axis: 'center', dryness: 0 }), inputs.seed ^ 0x7934a65b, 6.2)];
  const dropletValues = [['d1', 169, 122, 10], ['d2', 196, 166, 16], ['d3', 253, 106, 21],
    ['d4', 312, 177, 13], ['d5', 366, 146, 19], ['d6', 390, 183, 8], ['d7', 221, 191, 7]];
  const droplets = dropletValues.map(([id, x, y, radius], index) => ({ id, ...transfer({ x, y }, inputs.layout, index), radius }));
  const dropletTouches = droplets.flatMap((drop, index) => Array.from({ length: [3, 2, 4, 2, 3, 2, 2][index] }, (_, lobe) => {
    const seed = (inputs.seed ^ Math.imul(index + 21, 2654435761) ^ Math.imul(lobe + 3, 1597334677)) >>> 0;
    const angle = [0, 1.63, 3.81, 5.22][lobe] + getNoise1D(index * 1.71 + 2.4, inputs.seed) * .9;
    const ux = Math.cos(angle), uy = Math.sin(angle), tx = -uy, ty = ux;
    const centerX = drop.x + ux * drop.radius * (.74 + getNoise1D(lobe + 7.31, seed) * .1);
    const centerY = drop.y + uy * drop.radius * (.74 + getNoise1D(lobe + 9.87, seed) * .1);
    const length = drop.radius * (.46 + .13 * getNoise1D(index + 4.8, seed));
    const source = { points: [{ x: centerX - tx * length, y: centerY - ty * length, pressure: .62 },
      { x: centerX + ux * drop.radius * .08, y: centerY + uy * drop.radius * .08, pressure: .94 },
      { x: centerX + tx * length, y: centerY + ty * length, pressure: .55 }], options: {
      id: `drop-${drop.id}-wet-edge-${lobe}`, seed, width: drop.radius * (.80 + .15 * getNoise1D(index + 2.6, seed)), opacity: .9, dryness: 0, axis: 'center', smoothing: 'catmull-rom',
    } };
    return unevenWetContact(source, seed, Math.max(.7, drop.radius * .09));
  }));
  const dropletContacts = { droplets, strokes: dropletTouches };
  const ink = at => ({ kind: 'ink', id: 'ink', strokes: inkStrokes, concentration: .76, water: .95, at, dryAfter: 2, mode: 'wet-mix', edgeDeposit: .42, edgeWidth: .29 });
  const clear = (at, contacts) => ({ kind: 'water', id: 'clear-water', ...contacts, water: inputs.water, at, dryAfter: 2, mode: 'wet-mix' });
  const variant = (id, label, events) => ({ id, label, document: compiledDocument(events, settings) });
  const waterFront = transfer({ x: 322, y: 170 }, inputs.layout, 3);
  const inkFront = transfer({ x: 340, y: 191 }, inputs.layout, 3);
  const dropDetail = droplets.find(drop => drop.id === 'd5');
  const wet = inputs.interval < 2;
  return [
    { id: 'water-after', title: '13 · 水破墨', variable: '同一底墨与清水笔路：无加水 → 过窗后加水 → 湿窗内加水。',
      criteria: '清水笔路采用连续多频微偏移与缓变含水接触；看湿内区变浅、前沿迁移、小段浓墨沉积和不等宽水线，干后加水保留原墨。',
      limits: '后两列只改清水到达时机。已有有限前沿沉积继续执行，墨层另显式保存内向边带分配；二者都不凭空造墨、加白、擦墨或沿整圈描黑，未还原真实水流、蒸发或向内化墨。',
      techniqueIds: ['water-break-ink'], detail: [waterFront.x, waterFront.y],
      variants: [variant('baseline', '对照 · 原墨 / 未加水', [ink(0)]),
        variant('dry', '已过湿窗 · 4 秒后加水', [ink(0), clear(4, { strokes: waterStrokes })]),
        variant('wet', `${wet ? '未干' : '已过湿窗'} · ${inputs.interval.toFixed(1)} 秒后加水`, [ink(0), clear(inputs.interval, { strokes: waterStrokes })])] },
    { id: 'ink-after', title: '14 · 墨破水', variable: '同一墨笔进入干接触、已过窗预湿区与仍湿预湿区。',
      criteria: '预湿阶段只有水、不显色；不规则多频预湿域内落相同墨笔，比较受水内区、迁移前沿与局部较深的停留段。',
      limits: '第二、三列只改墨到达时机；第一列没有预湿事件。湿窗是程序条件，不是纸张实测秒数；深边在到达事件内生成，不随等待模拟连续变干。',
      techniqueIds: ['ink-break-water'], detail: [inkFront.x, inkFront.y],
      variants: [variant('baseline', '对照 · 不预湿，直接落墨', [ink(0)]),
        variant('expired', '先水后墨 · 预湿已过窗', [clear(0, { strokes: prewetStrokes }), ink(4)]),
        variant('prewet', `先水后墨 · ${wet ? '仍湿' : '已过湿窗'} / ${inputs.interval.toFixed(1)} 秒`, [clear(0, { strokes: prewetStrokes }), ink(inputs.interval)])] },
    { id: 'droplets', title: '15 · 分散加水', variable: '显式水滴及相邻短湿触：原墨 → 墨后加水 → 水后落墨。',
      criteria: '每滴保留可编辑中心/半径，另保存2–4条不等短湿触打破圆边；比较同一组合接触的局部水线、断续浓墨与较浅内区。',
      limits: '这是洒水的待核实程序实验。短湿触是显式独立坐标，组合编辑helper才同步移动/缩放；直接手改JSON的一滴不会自动带动其他笔。第三列改变水墨先后，不以圆斑、描黑圈或白点数量证明真实材料方向性或传统技法成立。',
      techniqueIds: ['water-sprinkle'], detail: [dropDetail.x, dropDetail.y],
      variants: [variant('baseline', '对照 · 原墨 / 未加水', [ink(0)]),
        variant('after', `墨后加水 · ${wet ? '湿窗内' : '已过窗'} / ${inputs.interval.toFixed(1)} 秒`, [ink(0), clear(inputs.interval, dropletContacts)]),
        variant('before', `水后落墨 · ${wet ? '湿窗内' : '已过窗'} / ${inputs.interval.toFixed(1)} 秒`, [clear(0, dropletContacts), ink(inputs.interval)])] },
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
  const previous = event.droplets.find(drop => drop.id === id), scale = (radius ?? previous.radius) / previous.radius;
  return reviseWaterProcessDocument(document, { events: document.recipe.events.map(event => event.id !== eventId ? event : {
    ...event, droplets: event.droplets.map(drop => drop.id !== id ? drop : { ...drop, x: drop.x + dx, ...(radius === undefined ? {} : { radius }) }),
    ...(event.strokes ? { strokes: event.strokes.map(stroke => !stroke.options?.id?.startsWith(`drop-${id}-wet-edge-`) ? stroke : {
      ...stroke, points: stroke.points.map(point => ({ ...point, x: previous.x + dx + (point.x - previous.x) * scale, y: previous.y + (point.y - previous.y) * scale })),
      options: { ...stroke.options, width: stroke.options.width * scale },
    }) } : {}),
  }) });
}
