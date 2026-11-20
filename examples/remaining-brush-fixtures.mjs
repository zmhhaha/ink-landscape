import { createStrokeGroupDocument, createNoise1D, jitterPath, varyPressure, splitBristles, sampleStrokePath } from '../dist/index.js';
import { authoredPathTexture } from './authored-study-path.mjs';

// All paths are original authored exercises. Names identify the reading question,
// not an assertion that the procedural result reproduces historical brushwork.
const size = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const layouts = Object.freeze(['slope', 'arc', 'fold']);
const plain = Object.freeze({ gestureModel: 'local-v1', smoothing: 'linear', entry: 'preserve', finish: 'preserve',
  pressureProfile: 'preserve', turn: 'preserve', rhythm: 'continuous', drag: 'forward' });
const continuous = (values, key) => authoredPathTexture(values, key, { step: 4, amplitude: .32, smooth: true });
const flow = continuous([[64, 174, .42], [132, 137, .76], [205, 111, .68], [281, 140, .86],
  [361, 104, .71], [437, 96, .57], [496, 122, .27]], 'remaining-brush-shared-flow');
const copy = values => values.map(value => [...value]);
const p = (values, pressure) => values.map(([x, y]) => [x, y, pressure]);
const contact = (side = 0, angle = Math.PI / 2) => [{ at: 0, side, angle }, { at: 1, side, angle }];

// Nonrigid coordinate maps preserve shared attachment points while changing the
// local tangent and the distribution of space; neither is a picture rotation.
function transfer([x, y, pressure = 1], layout) {
  if (layout === 'arc') return { x: 280 + (x - 280) * .93 + (y - 130) * .035,
    y: 130 + (y - 130) * .82 - 21 * Math.sin((x - 55) * Math.PI / 450), pressure };
  if (layout === 'fold') return { x: x + (y - 130) * .095,
    y: 24 + y * .82 + Math.abs(x - 280) * .055, pressure };
  return { x, y, pressure };
}

function author(layout, seed) {
  const stroke = (id, points, width = 27, options = {}) => ({ id,
    points: points.map(point => transfer(point, layout)),
    options: { ...plain, width, opacity: .89, dryness: .25, start: 0, duration: 2.4, ...options } });
  const group = (id, strokes, role = 'mark', parentId) => ({ id, role,
    ...(parentId === undefined ? {} : { parentId }), strokes });
  return { stroke, group, seed };
}

function buildStudy({ id, title, techniqueIds, variable, criteria, limits, detail = [280, 130], labels, make }, inputs) {
  const a = author(inputs.layout, inputs.seed);
  const focus = transfer(detail, inputs.layout);
  return { id, title, techniqueIds, variable, criteria, limits, detail: [focus.x, focus.y],
    variants: labels.map((label, stage) => ({ id: ['baseline', 'mechanism', 'combined'][stage], label,
      document: createStrokeGroupDocument(make(stage, a), { ...size, seed: inputs.seed, strokeWidth: 27, dryness: .25, opacity: .89 }) })) };
}

const strokeLength = points => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);
function peakPosition(stroke) {
  const peak = Math.max(...stroke.points.map(q => q.pressure ?? 1)), index = stroke.points.findIndex(q => q.pressure === peak);
  return strokeLength(stroke.points.slice(0, index + 1)) / strokeLength(stroke.points);
}
function turning(points) {
  let total = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1],
      ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    total += Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  }
  return total;
}
function sample(values, t) {
  const f = Math.min(values.length - 1, Math.max(0, t * (values.length - 1))), i = Math.min(values.length - 2, Math.floor(f));
  const u = f - i, a = values[i], b = values[i + 1];
  return a.map((value, k) => value + (b[k] - value) * u);
}

const sourcePoints = values => values.map(([x, y, pressure = 1]) => ({ x, y, pressure }));
const sourceValues = points => points.map(({ x, y, pressure = 1 }) => [x, y, pressure]);
const fineFlow = sampleStrokePath(sourcePoints(flow), { spacing: 1.6 }).map(({ x, y, pressure }) => ({ x, y, pressure }));
const seedFor = (seed, id) => {
  let value = seed >>> 0;
  for (const character of id) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
};

// Fine resistance belongs to editable source. Keeping drag='forward' avoids the
// older periodic reverse geometry from being applied a second time at compile.
function resistanceSource(seed, reverse = false) {
  const materialSeed = (seed ^ (reverse ? 0x381397 : 0x420419)) >>> 0;
  const small = jitterPath(fineFlow, reverse ? .36 : .27, { seed: materialSeed, wavelength: reverse ? 6.3 : 8.7,
    tangentRatio: .055, preserveEndpoints: true });
  const layered = jitterPath(small, reverse ? .17 : .13, { seed: (materialSeed ^ 0x632f8a) >>> 0,
    wavelength: reverse ? 19.7 : 28.3, tangentRatio: .04, preserveEndpoints: true });
  const noise = createNoise1D(materialSeed ^ 0x35b17), total = strokeLength(fineFlow);
  let distance = 0;
  return layered.map((point, i) => {
    if (i > 0) distance += Math.hypot(fineFlow[i].x - fineFlow[i - 1].x, fineFlow[i].y - fineFlow[i - 1].y);
    if (i === 0 || i === layered.length - 1) return [point.x, point.y, fineFlow[i].pressure];
    const before = fineFlow[Math.max(0, i - 1)], after = fineFlow[Math.min(fineFlow.length - 1, i + 1)],
      length = Math.hypot(after.x - before.x, after.y - before.y),
      envelope = Math.min(1, distance / 18, (total - distance) / 18),
      lag = (noise(distance / 4.9) + 1) * (reverse ? .13 : .035) * envelope;
    const pressure = varyPressure(varyPressure(fineFlow[i].pressure, reverse ? .12 : .09,
      { seed: materialSeed, at: distance, wavelength: reverse ? 9.1 : 12.7 }), .045,
    { seed: (materialSeed ^ 0x18a43) >>> 0, at: distance, wavelength: 37.3 });
    return [point.x - (after.x - before.x) / length * lag,
      point.y - (after.y - before.y) / length * lag, pressure];
  });
}

function resistanceControls(seed, reverse) {
  const noise = createNoise1D(seed ^ (reverse ? 0x38a37 : 0x42a71)), total = strokeLength(fineFlow), locations = [0];
  let distance = 0;
  while ((distance += 9 + (noise(distance / 31.7) + 1) * 5.5) < total - 6) locations.push(distance);
  locations.push(total);
  return locations.map(at => {
    const t = at / total;
    return { at: t, pressure: Math.min(.99, .87 + noise(at / 13.9) * .075),
      side: (reverse ? .25 : .105) + noise(at / 27.1) * .035,
      angle: 1.45 + noise(at / 34.7) * .09,
      inkLoad: .945 + noise(at / 21.3) * .032 };
  });
}

const distances = points => points.reduce((list, point, index) => {
  if (index) list.push(list.at(-1) + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y));
  return list;
}, [0]);
// Selection names an authored action, not a detected corner. Dense sampling
// may place its nearest station a fraction of a unit away from that anchor.
const namedStation = (values, [x, y]) => values.reduce((best, point, index) =>
  Math.hypot(point[0] - x, point[1] - y) < Math.hypot(values[best][0] - x, values[best][1] - y) ? index : best, 0);
const steadyContact = side => [{ at: 0, pressure: .9, side, angle: Math.PI / 2, inkLoad: .86 },
  { at: 1, pressure: .9, side, angle: Math.PI / 2, inkLoad: .86 }];
function pauseContact(line, index, peakSide = .18, peakAngle = 1.5) {
  const measured = distances(line.points), total = measured.at(-1), center = measured[index], baseSide = .04;
  const states = [[-19, .9, baseSide, Math.PI / 2, .86], [-11, .86, baseSide, Math.PI / 2, .86],
    [-4, .95, peakSide * .7, peakAngle, .95], [0, 1, peakSide, peakAngle, 1],
    [5, .94, peakSide * .65, peakAngle + .06, .94], [12, .87, baseSide, Math.PI / 2, .86],
    [19, .9, baseSide, Math.PI / 2, .86]];
  return [steadyContact(baseSide)[0], ...states.map(([delta, pressure, side, angle, inkLoad]) =>
    ({ at: (center + delta) / total, pressure, side, angle, inkLoad })), steadyContact(baseSide)[1]];
}

function resistanceTurnContact(line, index) {
  const controls = line.options.controls, measured = distances(line.points), total = measured.at(-1), center = measured[index] / total;
  // Keep the original controls at both window boundaries. Outside those
  // existing stations interpolation is exactly the unchanged mechanism.
  const left = controls.filter(control => control.at <= center - 15 / total).at(-1).at,
    right = controls.find(control => control.at >= center + 15 / total).at;
  const valueAt = (at, key) => {
    const a = controls.filter(control => control.at <= at).at(-1), b = controls.find(control => control.at >= at),
      fraction = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at), u = fraction * fraction * (3 - 2 * fraction);
    return a[key] * (1 - u) + b[key] * u;
  };
  const locations = [...new Set([...controls.map(control => control.at), center - 5 / total, center, center + 6 / total])].sort((a, b) => a - b);
  return locations.map(at => {
    if (at <= left || at >= right) return controls.find(control => control.at === at);
    const u = at <= center ? (at - left) / (center - left) : (right - at) / (right - center), pulse = u * u * (3 - 2 * u);
    return { at, pressure: Math.min(1, valueAt(at, 'pressure') + .075 * pulse),
      side: valueAt(at, 'side') + .14 * pulse, angle: valueAt(at, 'angle') + .12 * pulse,
      inkLoad: Math.min(1, valueAt(at, 'inkLoad') + .065 * pulse) };
  });
}

function splitStrokes(stage, { stroke, seed }) {
  if (stage === 0) return Array.from({ length: 6 }, (_, i) => {
    const points = Array.from({ length: 97 }, (_, j) => {
      const t = j / 96, [x, y] = sample(flow, t);
      const left = sample(flow, Math.max(0, t - .01)), right = sample(flow, Math.min(1, t + .01));
      const dx = right[0] - left[0], dy = right[1] - left[1], length = Math.hypot(dx, dy);
      const offset = (i - 2.5) * 5.7;
      return [x - dy / length * offset, y + dx / length * offset, .8];
    });
    return stroke(`bundle-${i}`, points, 3.5, { opacity: .77, dryness: .22,
      start: i * .025, duration: 2.5, controls: contact(0) });
  });
  const splitSeed = (seed ^ 0x3917a) >>> 0, count = stage === 1 ? 7 : 8,
    bundles = splitBristles(fineFlow, count, { seed: splitSeed, spread: stage === 1 ? 30 : 40,
      width: 5.4, opacity: .79, variance: stage === 1 ? .36 : .48, spacing: 1.8 });
  return bundles.flatMap((bundle, i) => {
    const center = i === 0, identity = bundle.id.split('-part')[0], key = seedFor(splitSeed, identity), noise = createNoise1D(key),
      width = center ? (stage === 1 ? 11.8 : 12.5) : Math.min(4.9, bundle.width * (1.02 + (noise(.4) + 1) * .22)),
      opacity = center ? .96 : .44 + bundle.opacity * .35 + (noise(2.1) + 1) * .06;
    // The main loaded contact follows the unchanged authored skeleton exactly.
    const points = (center ? fineFlow : bundle.points).map((point, j) => {
      if (center) return { ...point, pressure: j === 0 || j === fineFlow.length - 1 ? point.pressure
        : varyPressure(point.pressure ?? 1, .045, { seed: key, at: j * 1.8, wavelength: 31 }) };
      const t = j / (bundle.points.length - 1), enter = .045 + (noise(3.7) + 1) * .035,
        exit = .06 + (noise(5.9) + 1) * .05, e = Math.min(1, t / enter), f = Math.min(1, (1 - t) / exit),
        envelope = (.08 + .92 * e * e * (3 - 2 * e)) * (.05 + .95 * f * f * (3 - 2 * f));
      return { ...point, pressure: varyPressure(Math.pow(point.pressure ?? 1, .85) * envelope, .11,
        { seed: key, at: j * 1.8, wavelength: 12.3 }) };
    });
    // Outer hairs touch in unequal short runs rather than long parallel rails.
    // Every omitted interval is absent source data, never white overpainting.
    const sections = [];
    if (center) sections.push(points);
    else {
      let cursor = Math.floor((noise(11.3) + 1) * 3), part = 0;
      while (cursor < points.length - 2) {
        const length = (stage === 1 ? 12 : 8) + Math.round((noise(part * 1.79 + 13.7) + 1) * (stage === 1 ? 11 : 8)),
          section = points.slice(cursor, Math.min(points.length, cursor + length));
        if (section.length > 2) sections.push(section);
        cursor += length + 4 + Math.round((noise(part * 2.13 + 17.9) + 1) * 5);
        part++;
      }
    }
    return sections.map((section, part) => {
      const faded = section.map((point, j) => {
        const entering = Math.min(1, j / 3), releasing = Math.min(1, (section.length - 1 - j) / 4),
          taper = center ? 1 : Math.pow(entering, 1.25) * Math.pow(releasing, 1.4);
        return { ...point, pressure: (point.pressure ?? 1) * taper };
      });
      const local = center ? 1 : .74 + (noise(part * 1.37 + 23.1) + 1) * .13;
      return stroke(`${center ? 'center' : 'outer'}-${bundle.id}${sections.length > 1 ? `-cut-${part}` : ''}`,
      sourceValues(faded), width * local, { opacity: opacity * local, dryness: center ? .15 : .28 + (noise(7.1 + part * .47) + 1) * .07,
        start: center ? 0 : .035 + (noise(9.2) + 1) * .08, duration: 2.5,
        controls: [{ at: 0, side: center ? .05 : .11, inkLoad: center ? .99 : .86 },
          { at: .47, side: center ? .07 : .19, inkLoad: center ? 1 : .94 * Math.sqrt(local) },
          { at: 1, side: center ? .03 : .08, inkLoad: center ? .98 : .82 }],
      });
    });
    });
}

const brush13 = [
  { id: 'brush-offset', title: '37 · 偏移与复正', techniqueIds: ['brush-offset'], detail: [281, 140],
    variable: '持续倒侧的中性接触对照 → 前段偏移后复正 → 在两个换向处主动侧用再聚。',
    criteria: '同一作者笔路、原压力、墨色和最大笔宽，复正时先局部减压收束，再连续归中；接触侧移和压力共同限幅，避免转锋突然膨成团块。',
    limits: '偏锋与侧锋存在异说。本页比较持续偏移、复正与有意侧用，不设“偏移超过某值即败笔”的传统标准，也没有模拟笔杆或真实调锋。',
    labels: ['对照 · 持续偏侧', '复正 · 前侧后中', '局部 · 侧用再聚'],
    make(stage, { stroke, group }) {
      const controls = stage === 0 ? contact(.96, 1.2) : stage === 1
        ? [{ at: 0, side: .96, pressure: .9, angle: 1.2 }, { at: .11, side: .92, pressure: .88, angle: 1.24 },
          { at: .18, side: .78, pressure: .83, angle: 1.3 }, { at: .25, side: .46, pressure: .68, angle: 1.39 },
          { at: .31, side: .17, pressure: .64, angle: 1.49 }, { at: .38, side: .04, pressure: .73, angle: 1.57 },
          { at: .49, side: .04, pressure: .88, angle: 1.57 }, { at: 1, side: .04, pressure: .92, angle: 1.57 }]
        : [{ at: 0, side: .12, pressure: .9, angle: 1.57 }, { at: .22, side: .25, pressure: .86, angle: 1.47 },
          { at: .255, side: .51, pressure: .83, angle: 1.35 }, { at: .29, side: .78, pressure: .78, angle: 1.23 },
          { at: .34, side: .88, pressure: .65, angle: 1.22 }, { at: .385, side: .58, pressure: .61, angle: 1.3 },
          { at: .43, side: .21, pressure: .69, angle: 1.47 }, { at: .49, side: .06, pressure: .83, angle: 1.57 },
          { at: .59, side: .2, pressure: .85, angle: 1.68 }, { at: .625, side: .43, pressure: .81, angle: 1.79 },
          { at: .655, side: .66, pressure: .76, angle: 1.88 }, { at: .69, side: .75, pressure: .63, angle: 1.95 },
          { at: .735, side: .45, pressure: .6, angle: 1.82 }, { at: .79, side: .14, pressure: .7, angle: 1.65 },
          { at: .86, side: .04, pressure: .84, angle: 1.57 }, { at: 1, side: .04, pressure: .9, angle: 1.57 }];
      return [group('main', [stroke('line', flow, 29, { controls })])];
    } },
  { id: 'brush-follow-against', title: '38 · 顺拖与逆推候选', techniqueIds: ['brush-follow', 'brush-against'], detail: [281, 140],
    variable: '同一行进方向的顺拖 → 同笔路的逆推候选 → 逆入后仍顺拖，区分起笔和主体。',
    criteria: '三列共用连续骨架、采样站与行进方向；逆推候选仅增加不到一像素的非周期细阻力、微小后滞与连续负荷，第三列只在起端逆入而主体顺拖，避免断折和反转坐标。',
    limits: '采用现代《运笔用墨》的顺逆语境。候选扰动直接保存在作者源中，关闭旧周期reverse派生；噪声只检验细阻力的形态，并非真实受力或逆锋完成度。逆入不等于全程逆推。',
    labels: ['顺拖 · 同向行进', '逆推 · 局部阻向', '逆入 · 主体顺拖'],
    make(stage, { stroke, group, seed }) {
      return [group('main', [stroke('line', stage === 1 ? resistanceSource(seed, true) : sourceValues(fineFlow), 29,
        { drag: 'forward', entry: stage === 2 ? 'concealed' : 'preserve',
          controls: stage === 1 ? resistanceControls(seed, true) : contact(.25, 1.35), strength: .85 })])];
    } },
  { id: 'brush-split', title: '39 · 散锋聚散', techniqueIds: ['brush-split'], detail: [300, 130],
    variable: '等距等长梳丝反例 → 共同行势内的异束接触 → 局部断续、聚拢与墨量差。',
    criteria: '实主毫保留原骨架、端点并连续承墨；外毫按共同笔势形成异强、异长的短接触，零压力起收与明确源缺段留出白缝，避免多条等长平行轨道。',
    limits: '以抱石皴条目中的聚散组织为动作依据，显式束线仍为程序近似，不复原真实笔毫，也不把这组接触实验直接命名为抱石皴或飞白书体。',
    labels: ['反例 · 等距梳丝', '分束 · 共势聚散', '局部 · 断续再聚'],
    make(stage, a) { return [a.group('split', splitStrokes(stage, a))]; } },
];

const paused = continuous([[64, 174, .5], [132, 137, .68], [205, 111, .61], [265, 134, .48], [281, 140, .96],
  [296, 135, .53], [361, 104, .69], [437, 96, .55], [496, 122, .25]], 'remaining-brush-pause');
const repositionAnchors = [[64, 174, .5], [132, 137, .72], [205, 111, .63], [266, 134, .66],
  [276, 138, .77], [270, 141, .45], [277, 136, .87], [297, 132, .59], [361, 104, .68], [437, 96, .52], [496, 122, .21]];
// Only the small reversal remains angular. Its approach and departure are
// separately authored curves, so global smoothing cannot erase the action.
const repositioned = [...continuous(repositionAnchors.slice(0, 4), 'remaining-brush-reposition-in').slice(0, -1),
  ...authoredPathTexture(repositionAnchors.slice(3, 8), 'remaining-brush-reposition-local', { step: 3, amplitude: .12 }),
  ...continuous(repositionAnchors.slice(7), 'remaining-brush-reposition-out').slice(1)];
const brush14 = [
  { id: 'brush-pause', title: '40 · 顿后再行', techniqueIds: ['brush-pause'], detail: [281, 140],
    variable: '仅延长显露的等接触对照 → 局部轻提、按驻、释放 → 顿后换锋进入新段。',
    criteria: '三列时长相同；中列只在中段短尺度按开，再明确释放继续。末列在同一顿处整理接触朝向，远处笔路保持不变。',
    limits: '顿势由局部接触和续行候选表达，不是原地等待的沉墨。没有物理驻笔时间或含水沉积模型；不要求每个转角都膨大。',
    labels: ['对照 · 等接触缓显', '局部 · 按驻释放', '承接 · 顿后换锋'],
    make(stage, { stroke, group }) {
      const points = stage === 0 ? p(flow, .68) : paused;
      const line = stroke('line', points, 28, { duration: 3.6 });
      line.options.controls = stage === 0 ? steadyContact(.04)
        : pauseContact(line, namedStation(points, [281, 140]), stage === 2 ? .29 : .17, stage === 2 ? 1.35 : 1.5);
      return [group('main', [line])];
    } },
  { id: 'brush-reposition', title: '41 · 挫势动作假设', techniqueIds: ['brush-reposition'], detail: [275, 138],
    variable: '只有按驻 → 局部短回调再转入 → 回调与接触复正协同。',
    criteria: '查看作者路径中的短回调及随后的新方向，回调局限于一点附近；压力峰、行进方向和接触朝向可分别编辑，不能用满笔抖动代替。',
    limits: '《翰林要诀》与《书谱》只部分支持具体微动作；此处是可核对的候选，不规定挫、衄、顿的统一边界，不宣称已经还原运腕。',
    labels: ['对照 · 仅顿后行', '回调 · 一点内挫', '协同 · 回调复正'],
    make(stage, { stroke, group }) {
      const points = stage === 0 ? paused : repositioned, line = stroke('line', points, 28);
      line.options.controls = pauseContact(line, namedStation(points, stage === 0 ? [281, 140] : [277, 136]),
        stage === 2 ? .43 : .18, stage === 2 ? 1.84 : 1.5);
      return [group('main', [line])];
    } },
  { id: 'brush-resistant', title: '42 · 涩行接触候选', techniqueIds: ['brush-resistant'], detail: [280, 140],
    variable: '均匀颤线反例 → 非周期细阻力与连续负荷 → 换向处局部增负后再放行。',
    criteria: '中、末列共用同一条低幅多尺度扰动源，接触站距与负荷非周期变化；微移小于一像素，保留主势及端点，不用等频大锯齿表现涩。',
    limits: '据刘熙载“涩非迟”“强效有形战掣”限制解释。接触负荷通道是程序假设，不能由粗糙度、速度或干墨单独认定得涩。',
    labels: ['反例 · 外露均颤', '候选 · 稳路变触', '局部 · 负荷承转'],
    make(stage, { stroke, group, seed }) {
      const points = stage === 0 ? Array.from({ length: 55 }, (_, i) => { const q = sample(flow, i / 54);
        return [q[0], q[1] + (i === 0 || i === 54 ? 0 : Math.sin(i * 2.4) * 5.4), q[2]]; })
        : resistanceSource(seed, false);
      const controls = stage === 0 ? contact(.04) : resistanceControls(seed, false),
        line = stroke('line', points, 28, { controls, dryness: .26 });
      if (stage === 2) line.options.controls = resistanceTurnContact(line, namedStation(sourceValues(fineFlow), [281, 140]));
      return [group('main', [line])];
    } },
];

const sentAnchors = [[64, 174, .38], [91, 158, .81], [166, 126, .72], [250, 137, .66], [308, 128, .74],
  [377, 101, .43], [436, 98, .19], [470, 109, .07], [496, 122, .015]];
const measuredAnchors = [[64, 174, .38], [132, 137, .75], [205, 111, .64], [249, 127, .57],
  [281, 140, .85], [306, 133, .7], [361, 104, .66], [437, 96, .53], [496, 122, .27]];
function scrubGroups(stage, { stroke, group }) {
  const scaffold = group('stone', [
    stroke('edge', [[72, 210, .5], [129, 126, .75], [246, 70, .6], [355, 100, .7], [477, 193, .3]], 4.1, { duration: .7, opacity: .8 }),
    ...Array.from({ length: 5 }, (_, i) => stroke(`cun-${i}`, [[151 + i * 44, 124 + i * 2, .5], [142 + i * 47, 163 + i * 2, .7],
      [157 + i * 43, 195 - i * 2, .22]], 3.5 + i % 2, { start: .2 + i * .1, duration: .6, dryness: .55, opacity: .65 })),
  ], 'structure');
  const strokes = stage === 0 ? [stroke('flat-grey', [[132, 158, .82], [414, 167, .82]], 76,
    { start: 1.4, duration: 1.8, opacity: .42, dryness: 0, controls: contact(0) })]
    : Array.from({ length: stage === 1 ? 5 : 7 }, (_, i) => {
      const x = 143 + i * (stage === 1 ? 51 : 36), y = 145 + [6, -2, 12, 1, 15, 3, 9][i];
      return stroke(`rub-${i}`, [[x, y, .2], [x + 12, y + 15, .54], [x + (stage === 2 ? 5 : 25), y + 32, .45],
        [x + 28, y + 42, .07]], [29, 23, 31, 25, 28, 21, 26][i], { start: 1.4 + i * .19, duration: .66,
        axis: 'side', controls: contact(.86, [1.2, 1.6, 1.35][i % 3]), dryness: .8, opacity: stage === 2 ? [.37, .27, .43, .32][i % 4] : .39 });
    });
  return [scaffold, group('scrub', strokes, 'mark', 'stone')];
}
const brush15 = [
  { id: 'brush-fast', title: '43 · 疾势送出候选', techniqueIds: ['brush-fast'], detail: [437, 100],
    variable: '同样短时的匀接触对照 → 起势后连续聚束送出 → 局部稳住后再送。',
    criteria: '全部以1.1秒显露，视觉变化必须来自源笔路和接触组织；尾部连续收拢，末列在转接处先有支点再出，不能由稀疏采样制造快感。',
    limits: '《书谱》《艺概》把疾与单纯速度区分。本页是起行收与送势的静态候选，duration只控制显露，不模拟局部真实速度、惯性或笔毫弹性。',
    labels: ['对照 · 短时匀触', '送势 · 渐聚出锋', '节奏 · 稳处再送'],
    make(stage, { stroke, group }) {
      let points = stage === 0 ? p(flow, .66) : copy(sentAnchors);
      if (stage === 2) { points[3] = [250, 137, .92]; points.splice(4, 0, [264, 138, .52]); }
      if (stage > 0) points = continuous(points, 'remaining-brush-send');
      return [group('main', [stroke('line', points, 28, { duration: 1.1, controls: stage === 0 ? contact(.08)
        : [{ at: 0, side: .14 }, { at: .42, side: stage === 2 ? .44 : .16 }, { at: .75, side: .07 }, { at: 1, side: .02 }] })])];
    } },
  { id: 'brush-slow', title: '44 · 徐行调锋候选', techniqueIds: ['brush-slow'], detail: [281, 140],
    variable: '单纯拉长显露的匀触对照 → 转接处受控接触 → 徐中有提、末段迅收的组织。',
    criteria: '三列总时长均4.8秒、墨色相同，比较局部提按与换向的衔接，末列提起后仍有明确出路；不以更黑、更宽等同徐行。',
    limits: '采用《书谱》的有意淹留及《续书谱》的徐疾相接语境。源数据可表达接触节奏，显露仍按弧长匀进，尚未表达真实分段运笔速度或吸水聚积。',
    labels: ['对照 · 仅缓显露', '调锋 · 缓行有节', '承接 · 徐后提收'],
    make(stage, { stroke, group }) {
      let points = stage === 0 ? p(flow, .66) : copy(measuredAnchors);
      if (stage === 2) points.splice(-1, 1, [468, 109, .19], [496, 122, .02]);
      if (stage > 0) points = continuous(points, 'remaining-brush-measured');
      return [group('main', [stroke('line', points, 28, { duration: 4.8, controls: stage === 0 ? contact(.06)
        : [{ at: 0, side: .05 }, { at: .34, side: .08 }, { at: .51, side: .36, angle: 1.28 },
          { at: .65, side: .05, angle: 1.6 }, { at: 1, side: .03 }] })])];
    } },
  { id: 'brush-scrub', title: '45 · 结构上局部擦动', techniqueIds: ['brush-scrub'], detail: [289, 163],
    variable: '整片平灰反例 → 皴迹之后轻侧擦 → 局部往复与轻重留白。',
    criteria: '石面骨线与皴迹保持相同，擦笔在其后出现；擦迹以独立短笔依面铺接，轻、宽、干的接触仍让原笔及纸面透出。',
    limits: '只部分支持现代假山石、花鸟教程中的擦动，不把“擦只能干笔”写成通则，也不把灰色覆盖或本页几笔程序纹理当作完整勾皴擦染。',
    labels: ['反例 · 平灰覆盖', '轻擦 · 依皴连面', '局部 · 往复留白'], make: scrubGroups },
];

const ce = [[237, 63, .16], [254, 82, .65], [270, 107, .94], [273, 121, .7], [264, 132, .19], [257, 136, .025]];
const le = continuous([[74, 151, .43], [92, 146, .77], [184, 139, .62], [285, 133, .68], [388, 129, .59], [477, 122, .82]], 'remaining-eight-le');
const nu = continuous([[280, 36, .4], [277, 69, .79], [275, 112, .7], [281, 157, .68], [280, 205, .78], [277, 219, .6]], 'remaining-eight-nu');
const calligraphy28 = [
  { id: 'eight-ce', title: '82 · 侧点顾盼', techniqueIds: ['eight-ce'], detail: [265, 115],
    variable: '均匀斜印反例 → 顾右入腹、转收 → 点尾顾向下一横。',
    criteria: '侧是八法点名，主点有起、腹、收三段；末列用短出口对准下一横的入势方向，点与横各为独立作者笔画。',
    limits: '采用《书法钩玄》本章，不把侧点等同side参数；未复原永字范字或腕法，也不宣称八法覆盖全部书体和山水点法。',
    labels: ['反例 · 均匀斜印', '动作 · 入腹转收', '顾盼 · 点应横入'],
    make(stage, { stroke, group }) {
      const points = stage === 0 ? [[237, 63, .8], [273, 121, .8]] : copy(ce);
      if (stage === 2) points.splice(-2, 2, [265, 132, .2], [255, 139, .025]);
      const groups = [group('dot', [stroke('dot', points, 34, { duration: .85, controls: contact(.13) })])];
      if (stage === 2) groups.push(group('answer', [stroke('bar', [[182, 180, .3], [208, 173, .66], [360, 161, .4]], 10,
        { start: 1, duration: 1.2, opacity: .68, entry: 'concealed', finish: 'return' })], 'structure'));
      return groups;
    } },
  { id: 'eight-le', title: '83 · 勒横仰偃', techniqueIds: ['eight-le'], detail: [300, 134],
    variable: '等宽横杠反例 → 微仰偃与有控收势 → 长短横依位置相让。',
    criteria: '主横保留独立起、行、收，不用大坡度冒充“不得卧”；末列新增较轻短横，长度、位置和向背分开设计。',
    limits: '采用《钩玄》与《翰林要诀》的受控横行语境，不把勒马比喻换成物理拉力；干湿尾部差异和具体书体仍需范字比较。',
    labels: ['反例 · 等宽算子', '行势 · 微仰偃收', '组织 · 长短相让'],
    make(stage, { stroke, group }) {
      const groups = [group('main', [stroke('bar', stage === 0 ? [[74, 139, .7], [477, 139, .7]] : le, 27,
        { entry: stage === 0 ? 'preserve' : 'concealed', finish: stage === 0 ? 'preserve' : 'return', duration: 2.4, controls: contact(.04) })])];
      if (stage === 2) groups.push(group('short', [stroke('bar', [[149, 87, .45], [229, 82, .71], [396, 91, .48]], 17,
        { start: 2.6, duration: 1.1, entry: 'concealed', finish: 'return', opacity: .76 })], 'mark', 'main'));
      return groups;
    } },
  { id: 'eight-nu', title: '84 · 努竖微曲', techniqueIds: ['eight-nu'], detail: [279, 165],
    variable: '僵直粗柱反例 → 小幅势向与受控提按 → 竖势承接长短横。',
    criteria: '竖行保持向下，不夸张成香蕉弧；微曲与压力分别保存。末列横竖位置与长短不同，不能复制同一竖模板解释所有结体。',
    limits: '“努不宜直”不是曲率阈值，本页只保留微曲候选；楷书垂露、悬针和隶书收束不合并成一个端帽，未完成具体字形验证。',
    labels: ['反例 · 僵直粗柱', '候选 · 直中微曲', '承接 · 竖撑横势'],
    make(stage, { stroke, group }) {
      const groups = [];
      if (stage === 2) groups.push(group('crossbars', [
        stroke('upper', [[201, 93, .36], [280, 89, .65], [347, 94, .3]], 15, { start: 0, duration: .7, opacity: .72 }),
        stroke('lower', [[175, 162, .4], [280, 157, .62], [384, 164, .25]], 16, { start: .8, duration: .8, opacity: .75 }),
      ], 'structure'));
      groups.push(group('main', [stroke('vertical', stage === 0 ? [[280, 36, .75], [280, 219, .75]] : nu, 30,
        { entry: stage === 0 ? 'preserve' : 'concealed', finish: stage === 0 ? 'preserve' : 'return', start: stage === 2 ? 1.8 : 0, duration: 2.5, controls: contact(.04) })]));
      return groups;
    } },
];

const ti = [[280, 36, .4], [279, 109, .76], [282, 170, .68], [281, 199, .7], [277, 207, .94],
  [272, 206, .77], [261, 193, .35], [249, 180, .025]];
const lift = [[116, 195, .37], ...continuous([[125, 198, .87], [147, 185, .72], [231, 154, .62], [344, 111, .35], [446, 77, .025]], 'remaining-eight-ce-lift')];
const lue = continuous([[418, 49, .3], [400, 85, .78], [352, 129, .69], [289, 171, .49], [211, 202, .21], [113, 222, .02]], 'remaining-eight-lue');
const calligraphy29 = [
  { id: 'eight-ti', title: '85 · 趯自努出', techniqueIds: ['eight-ti'], detail: [278, 202],
    variable: '竖尾另贴尖钩反例 → 同笔蹲挫转出 → 钩根接触整理与短出口。',
    criteria: '中、末列从竖到钩为一条连续源路径，钩前局部按驻、末段渐提；末列钩口更短，接触朝向在转出区回正。',
    limits: '采用《钩玄》趯自努出的楷书候选；隶书钩“转而无挑”另有语境，不设全书体通用钩。几何连续与压力峰不等于已经确认蓄势质量。',
    labels: ['反例 · 尾部贴钩', '连续 · 蹲挫转出', '局部 · 整锋短出'],
    make(stage, { stroke, group }) {
      if (stage === 0) return [group('main', [stroke('vertical', [[280, 36, .7], [280, 207, .7]], 30),
        stroke('pasted-hook', [[280, 207, .55], [249, 180, .02]], 30, { start: 2.45, duration: .4 })])];
      const points = copy(ti); if (stage === 2) points.splice(-2, 2, [267, 196, .37], [260, 186, .025]);
      return [group('main', [stroke('vertical-hook', points, 30, { duration: 2.8, controls: stage === 1 ? contact(.06)
        : [{ at: 0, side: .04 }, { at: .78, side: .1 }, { at: .87, side: .38, angle: 1.2 }, { at: 1, side: .025, angle: 1.65 }] })])];
    } },
  { id: 'eight-ce-lift', title: '86 · 策提 · 钩玄候选', techniqueIds: ['eight-ce-lift'], detail: [133, 191],
    variable: '等宽斜线反例 → 筑锋后仰进提收 → 提画顾向下一笔。',
    criteria: '先有短入势与支点，再向右仰进渐提，末列把出口接向下一竖的上部；策是点画门类，不能与泛称提笔合并。',
    limits: '只选《书法钩玄》的右向仰进候选。《翰林要诀》“圆锋左出”异文未校勘，样片不裁定版本，也不把右上固定为世界坐标定义。',
    labels: ['反例 · 等宽斜线', '钩玄 · 筑后仰进', '顾向 · 提接后笔'],
    make(stage, { stroke, group }) {
      const points = stage === 0 ? [[116, 195, .7], [446, 77, .7]] : lift;
      const groups = [group('main', [stroke('lift', points, 28, { duration: 1.5, controls: contact(.08) })])];
      if (stage === 2) groups.push(group('answer', [stroke('vertical', [[459, 66, .35], [461, 115, .7], [451, 194, .35]], 19,
        { start: 1.7, duration: 1.7, entry: 'concealed', finish: 'return', opacity: .76 })], 'structure'));
      return groups;
    } },
  { id: 'eight-lue', title: '87 · 掠势 · 钩玄左出', techniqueIds: ['eight-lue'], detail: [277, 180],
    variable: '长直削线反例 → 轻驻后微曲左送 → 与右下笔的开合承接。',
    criteria: '左下送势具有中段支撑、曲势与连续收束，不能只按长度区别掠、啄；末列另一笔从主笔内部的显式点分出，形成开合空间。',
    limits: '只采用《钩玄》左出候选，《翰林要诀》“右出微仰”仍待校勘；不宣称所有左下长线或山水线均为书法掠。',
    labels: ['反例 · 长直削线', '钩玄 · 微曲左送', '组合 · 开合相应'],
    make(stage, { stroke, group }) {
      const groups = [group('main', [stroke('left-fall', stage === 0 ? [[418, 49, .74], [113, 222, .02]] : lue, 28,
        { duration: 2.3, controls: contact(.06) })])];
      if (stage === 2) groups.push(group('answer', [stroke('right-fall', [[352, 129, .4], [375, 165, .75], [412, 197, .57], [459, 220, .02]], 21,
        { start: 2.5, duration: 1.5, opacity: .78, controls: contact(.13) })], 'mark', 'main'));
      return groups;
    } },
];

const zhuo = [[355, 65, .2], ...continuous([[348, 76, .93], [328, 99, .6], [289, 131, .24], [237, 162, .02]], 'remaining-eight-zhuo')];
const zhe = [[91, 60, .16], [107, 57, .35], [176, 96, .49], [255, 141, .7], [337, 179, .91],
  [374, 192, .95], [400, 191, .62], [439, 184, .21], [476, 179, .02]];
function outlineGroups(stage, { stroke, group }) {
  if (stage === 0) return [group('rear', [stroke('closed', [[88, 212, .65], [123, 115, .65], [208, 93, .65], [309, 145, .65], [301, 221, .65], [88, 212, .65]], 4)]),
    group('front', [stroke('closed', [[245, 202, .65], [266, 112, .65], [347, 67, .65], [438, 104, .65], [474, 193, .65], [245, 202, .65]], 4)])];
  const groups = [group('rear', [stroke('visible-top', [[88, 212, .4], [123, 115, .7], [208, 93, .62], [257, 120, .18]], 4,
    { start: 0, duration: 1, opacity: .67 }), stroke('visible-base', [[88, 212, .4], [170, 227, .6], [245, 220, .18]], 3.6,
    { start: 1.1, duration: .7, opacity: .62 })], 'structure'),
  group('front', [stroke('visible-edge', [[245, 202, .54], [266, 112, .84], [347, 67, .6], [438, 104, .73], [474, 193, .17]], 4.9,
    { start: 1.9, duration: 1.6, opacity: .87 })], 'structure')];
  if (stage === 2) groups.push(group('turning-plane', [stroke('inner-edge', [[278, 158, .2], [337, 122, .64], [414, 147, .18]], 2.8,
    { start: 3.7, duration: .8, opacity: .63 }), stroke('short-turn', [[323, 175, .25], [351, 160, .65], [386, 178, .15]], 2.4,
    { start: 4.6, duration: .7, opacity: .56 })], 'mark', 'front'));
  return groups;
}
const calligraphy30 = [
  { id: 'eight-zhuo', title: '88 · 啄的短促落出', techniqueIds: ['eight-zhuo'], detail: [343, 82],
    variable: '等比缩小长撇的反例 → 前段集中落势、短促提收 → 与短点的顾应。',
    criteria: '压力峰在很短的入纸段，之后仍有明确左出与连续尾部；末列以另一个短点改变顾向，动作次序不能由长度阈值代替。',
    limits: '只研究《钩玄》《翰林要诀》的短促左出候选；采样密度不随快慢降低，不把任意短线、鸟形或植物叶片直接命名为啄。',
    labels: ['反例 · 缩小长撇', '动作 · 点首撇尾', '顾应 · 短点相向'],
    make(stage, { stroke, group }) {
      const points = stage === 0 ? [[355, 65, .2], [347, 90, .57], [327, 116, .82], [285, 140, .49], [237, 162, .02]] : zhuo;
      const groups = [group('main', [stroke('short-fall', points, 32, { duration: .95, controls: contact(.08) })])];
      if (stage === 2) groups.push(group('answer', [stroke('dot', [[389, 117, .18], [401, 133, .84], [407, 147, .4], [401, 152, .025]], 22,
        { start: 1.1, duration: .7, opacity: .77, controls: contact(.22) })], 'mark', 'main'));
      return groups;
    } },
  { id: 'eight-zhe', title: '89 · 磔的驻转舒展', techniqueIds: ['eight-zhe'], detail: [375, 191],
    variable: '一路加宽骤尖的楔形反例 → 入势、捺身、驻转、渐收 → 缩脚与左侧开合。',
    criteria: '捺脚的压力峰位于内部，随后有实际行程提收并改变尾部方向；末列缩短展开长度，与左下笔形成不同空白，避免同款夸张燕尾。',
    limits: '采用八法的右送之波候选，未把《乙瑛碑》的隶书波捺或所有楷书捺合成统一模板。驻转不是聚黑墨团，露藏与尾长没有统一比例。',
    labels: ['反例 · 楔形骤收', '阶段 · 驻转渐出', '变化 · 缩脚开合'],
    make(stage, { stroke, group }) {
      let points = stage === 0 ? [[91, 60, .1], [220, 119, .4], [373, 190, .96], [476, 179, .02]] : copy(zhe);
      if (stage === 2) points.splice(-3, 3, [395, 189, .6], [421, 182, .2], [447, 175, .02]);
      if (stage > 0) points = [...continuous(points.slice(0, 5), 'remaining-eight-zhe-body').slice(0, -1),
        ...points.slice(4, 7), ...continuous(points.slice(6), 'remaining-eight-zhe-release').slice(1)];
      const groups = [group('main', [stroke('right-fall', points, 34, { duration: 2.7, controls: stage === 0 ? contact(.15)
        : [{ at: 0, side: .07 }, { at: .6, side: .18 }, { at: .77, side: .48, angle: 1.22 }, { at: .9, side: .17 }, { at: 1, side: .02 }] })])];
      if (stage === 2) groups.push(group('answer', [stroke('left-fall', [[255, 141, .37], [206, 183, .67], [135, 218, .02]], 20,
        { start: 2.9, duration: 1.3, opacity: .77 })], 'mark', 'main'));
      return groups;
    } },
  { id: 'line-outline', title: '90 · 勾勒与遮挡断续', techniqueIds: ['line-outline'], detail: [261, 118],
    variable: '重叠封闭线框反例 → 作者省略后缘、分段取廓 → 加入轻重不同的转面线。',
    criteria: '两块石形由作者路径承担造形，后石只保存可见边段，前石随后勾出；内线解释转面，不用自动闭合、透明面片或白色擦除隐藏后缘。',
    limits: '仅研究绘画勾勒的开放轮廓及人工遮挡分段，不是通用自动造形或隐藏线算法，也没有覆盖完整工笔淡勾、重醒、设色流程。',
    labels: ['反例 · 重叠线框', '造形 · 前后断续', '转面 · 轻重藏露'], make: outlineGroups },
];

function batch(number, id, title, specs) {
  return Object.freeze({ number, id, title, layouts, layout: 'slope', make({ seed = 261120 + number, layout = 'slope' } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
    if (!layouts.includes(layout)) throw new RangeError('Unknown remaining brush layout');
    return specs.map(spec => buildStudy(spec, { seed, layout }));
  }, audit(studies) {
    const checks = studies.flatMap(study => auditRemainingBrush(study).checks.map(check => ({ ...check, id: `${study.id}/${check.id}` })));
    return { ok: checks.every(check => check.pass), checks };
  } });
}

export const remainingBrushBatches = Object.freeze([
  batch(13, 'remaining-brush-contact', '调锋、顺逆与散锋', brush13),
  batch(14, 'remaining-brush-adjustment', '顿、挫与涩行', brush14),
  batch(15, 'remaining-brush-rhythm', '疾、徐与擦动', brush15),
  batch(28, 'remaining-eight-first', '侧、勒与努', calligraphy28),
  batch(29, 'remaining-eight-connected', '趯、策与掠', calligraphy29),
  batch(30, 'remaining-eight-outline', '啄、磔与勾勒', calligraphy30),
]);

/** Checks concern authored action/structure only; no check grants art acceptance. */
export function auditRemainingBrush(study) {
  const checks = [], add = (id, pass, detail) => checks.push({ id, pass: Boolean(pass), detail });
  if (!study || !Array.isArray(study.variants) || study.variants.length !== 3) {
    add('three-variants', false, 'Each study needs three variants.'); return { ok: false, checks };
  }
  const documents = study.variants.map(variant => variant.document), source = documents.map(document => document.recipe.groups);
  const flat = i => source[i].flatMap(group => group.strokes), main = i => source[i].find(group => group.id === 'main')?.strokes[0];
  const controls = stroke => stroke?.options?.controls ?? [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const pressurePeak = stroke => Math.max(...stroke.points.map(point => point.pressure ?? 1));
  const tail = stroke => stroke.points.at(-1).pressure ?? 1;
  const excursions = list => list.reduce((state, item) => ({ count: state.count + (item.side > .6 && !state.active ? 1 : 0),
    active: item.side > .6 }), { count: 0, active: false }).count;
  const maxSegment = points => Math.max(...points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y)));
  const variableIntervals = list => new Set(list.slice(1).map((q, i) => (q.at - list[i].at).toFixed(5))).size > 8;
  add('public-source', documents.every(document => document.recipe.generator === 'ink-stroke-groups-v1'), 'All variants retain explicit group/brush source.');
  add('fixed-frame-and-time', documents.every(document => document.result.width === 560 && document.result.height === 260 &&
    document.result.background === size.background && document.result.marks.every(mark => mark.start + mark.duration < 8)), 'Fixed frame; all marks complete before eight seconds.');
  switch (study.id) {
    case 'brush-offset': {
      add('contact-recovers', controls(main(0)).every(c => c.side > .9) && controls(main(1)).at(-1).side < .1 &&
        excursions(controls(main(2))) === 2 && same(main(0).points, main(2).points), 'Persistent offset versus two local side excursions and recovery, on unchanged source geometry.');
      add('bounded-turn-shrink', [1, 2].every(i => {
        const list = controls(main(i));
        return list.every((q, j) => q.pressure <= .95 && (j === 0 || Math.abs(q.side - list[j - 1].side) / (q.at - list[j - 1].at) < 9)) &&
          list.some((q, j) => j > 0 && q.side < list[j - 1].side && q.pressure <= .65) && main(i).options.width === main(0).options.width;
      }), 'Recovery pressure contracts in a bounded window; side change is gradual and maximum nominal width stays fixed.'); break;
    }
    case 'brush-follow-against': {
      const reference = main(0).points, reverse = main(1).points, sameStations = reverse.length === reference.length,
        deviations = sameStations ? reverse.map((q, i) => Math.hypot(q.x - reference[i].x, q.y - reference[i].y)) : [Infinity];
      add('direction-is-not-reversed', same(main(0).points, main(2).points) && reverse.length === reference.length &&
        same(reference[0], reverse[0]) && same(reference.at(-1), reverse.at(-1)) &&
        [0, 1, 2].every(i => main(i).options.drag === 'forward') && main(2).options.entry === 'concealed',
      'Source order and endpoints stay fixed; reverse-entry and explicit fine resistance do not invoke periodic reverse geometry.');
      add('continuous-fine-resistance', sameStations && Math.max(...deviations) < 1 && Math.max(...deviations) > .03 && maxSegment(reverse) < 2.5 &&
        reverse.slice(1).every((q, i) => (q.x - reverse[i].x) * (reference[i + 1].x - reference[i].x) +
          (q.y - reverse[i].y) * (reference[i + 1].y - reference[i].y) > 0) && variableIntervals(controls(main(1))),
      'Subpixel multi-scale displacement keeps forward continuity; irregular contact spacing replaces repeated teeth.'); break;
    }
    case 'brush-split': {
      add('unequal-coupled-bundles', new Set(flat(0).map(s => s.options.width)).size === 1 &&
      new Set(flat(1).map(s => s.options.width)).size >= 4 && new Set(flat(1).map(s => Math.round(strokeLength(s.points)))).size >= 4 &&
        flat(2).length > flat(1).length, 'The comb control has equal widths; organized bundles differ in width, extent and continuity.');
      add('central-load-and-outer-gaps', [1, 2].every(i => {
        const center = flat(i).filter(s => s.id.startsWith('center-')), outer = flat(i).filter(s => s.id.startsWith('outer-'));
        return center.length === 1 && center[0].options.width > Math.max(...outer.map(s => s.options.width)) * 1.5 &&
          center[0].options.opacity > Math.max(...outer.map(s => s.options.opacity)) + .12 &&
          outer.some(s => s.id.includes('-part-') || s.id.includes('-cut-')) &&
          new Set(outer.map(s => s.options.opacity.toFixed(4))).size > 2 &&
          new Set(outer.map(s => `${s.points[0].x.toFixed(3)}/${s.points.at(-1).x.toFixed(3)}`)).size > 3;
      }), 'A single broad, loaded center stays continuous; outer strands differ in ink, extent and explicit source gaps.');
      add('short-lifted-outer-contacts', [1, 2].every(i => {
        const center = flat(i).find(s => s.id.startsWith('center-')), outer = flat(i).filter(s => s.id.startsWith('outer-'));
        return outer.every(s => s.points[0].pressure === 0 && tail(s) === 0 && strokeLength(s.points) < strokeLength(center.points) * .2) &&
          center.options.dryness < .2 && center.options.opacity >= .95;
      }), 'Each unequal outer contact is short and explicitly lifted at both ends; the main contact stays loaded.'); break;
    }
    case 'brush-pause': { const points = main(1).points, peak = points.findIndex(q => q.pressure === .96);
      const near = q => Math.hypot(q.x - points[peak].x, q.y - points[peak].y) < 26;
      add('press-release-and-continue', peak > 0 && peak < points.length - 2 &&
        points.slice(0, peak).some(q => near(q) && q.pressure < .6) && points.slice(peak + 1).some(q => near(q) && q.pressure < .6) &&
        documents.every((_, i) => main(i).options.duration === 3.6), 'A bounded press has release and continued travel; reveal duration is controlled.');
      add('authored-short-contact', [1, 2].every(i => {
        const line = main(i), list = controls(line), center = list.find(c => c.pressure === 1), measured = distances(line.points),
          index = line.points.findIndex(q => q.pressure === .96);
        return center && Math.abs(center.at * measured.at(-1) - measured[index]) < 1e-8 &&
          (list.at(-2).at - list[1].at) * measured.at(-1) <= 38.000001 &&
          list.filter(c => c.inkLoad === 1).length === 1 && list.every(c => c.side <= .3) && line.options.width === 28;
      }), 'Only the explicitly authored pause carries a bounded 38-unit contact/load window; noise corners are not classified as pauses.'); break; }
    case 'brush-reposition': { const points = main(1).points, dx = main(1).points.at(-1).x - points[0].x;
      add('bounded-local-retreat', points.some((q, i) => i > 0 && (q.x - points[i - 1].x) * dx < 0 && Math.hypot(q.x - points[i - 1].x, q.y - points[i - 1].y) < 12) &&
        controls(main(2)).some(c => c.side > .4) && controls(main(2)).at(-1).side < .1, 'One short authored retreat is followed by forward travel and contact recovery.');
      add('retreat-load-is-local', [1, 2].every(i => {
        const line = main(i), list = controls(line), measured = distances(line.points), index = line.points.findIndex(q => q.pressure === .87),
          center = list.find(c => c.pressure === 1);
        return center && Math.abs(center.at * measured.at(-1) - measured[index]) < 1e-8 &&
          (list.at(-2).at - list[1].at) * measured.at(-1) <= 38.000001 &&
          list[0].inkLoad === .86 && list.at(-1).inkLoad === .86 && list.every(c => c.side <= .45);
      }), 'Load is attached to the named exit of the short authored retreat, with unchanged contact outside its local window.'); break; }
    case 'brush-resistant': {
      add('steady-source-variable-contact', same(main(1).points, main(2).points) && turning(main(0).points) > turning(main(1).points) * 2 &&
        new Set(controls(main(1)).map(c => c.pressure)).size > 3 && documents.every((_, i) => main(i).options.dryness === .26),
      'Candidates share a finely perturbed skeleton; contact load changes independently of dryness and overt trembling.');
      add('aperiodic-small-load', variableIntervals(controls(main(1))) && maxSegment(main(1).points) < 2.5 &&
        controls(main(1)).every(c => c.inkLoad > .9 && c.pressure > .78) &&
        main(1).points[0].x === main(0).points[0].x && main(1).points.at(-1).x === main(0).points.at(-1).x,
      'Irregular load stations and dense continuous source keep resistance small and endpoints stable.');
      const measured = distances(main(1).points), total = measured.at(-1), center = measured[namedStation(sourceValues(fineFlow), [281, 140])] / total,
        original = controls(main(1)), changed = controls(main(2)), left = original.filter(c => c.at <= center - 15 / total).at(-1).at,
        right = original.find(c => c.at >= center + 15 / total).at;
      add('named-turn-window-only', (right - left) * total < 70 &&
        changed.filter(c => c.at <= left || c.at >= right).every(c => same(c, original.find(q => q.at === c.at))) &&
        changed.some(c => c.at === center && c.side > .2 && c.inkLoad > .97) && changed.every(c => c.side < .3),
      'The extra load is confined between existing contact stations around the named authored turn; all outside controls are exact.'); break;
    }
    case 'brush-fast': add('send-with-continuous-release', documents.every((_, i) => main(i).options.duration === 1.1) && tail(main(1)) < .03 &&
      main(1).points.slice(-4).every((q, i, list) => i === 0 || q.pressure < list[i - 1].pressure) && pressurePeak(main(2)) > pressurePeak(main(1)), 'Same reveal time; multiple source stations release pressure after a controlled support.'); break;
    case 'brush-slow': add('controlled-contact-not-playback-only', documents.every((_, i) => main(i).options.duration === 4.8) &&
      new Set(main(1).points.map(q => q.pressure)).size > 4 && controls(main(1)).some(c => c.side > .3) && tail(main(2)) < .03, 'Same long reveal; contact organization and a final lift supply actual source changes.'); break;
    case 'brush-scrub': { const structure = source[1].find(g => g.id === 'stone'), rub = source[1].find(g => g.id === 'scrub');
      const end = Math.max(...structure.strokes.map(s => s.options.start + s.options.duration));
      add('scrub-follows-structure', rub.parentId === structure.id && rub.strokes.every(s => s.options.start > end && s.options.dryness > .7 &&
        s.options.opacity < .5 && controls(s).every(c => c.side > .8)) && same(source[0][0], source[2][0]), 'Unchanged structure precedes lightweight broad side contact, with explicit parent ownership.'); break; }
    case 'eight-ce': { const dot = source[2].find(g => g.id === 'dot').strokes[0], answer = source[2].find(g => g.id === 'answer').strokes[0];
      const before = dot.points.at(-2), end = dot.points.at(-1), target = answer.points[0];
      add('dot-turns-toward-answer', pressurePeak(dot) > dot.points[0].pressure * 3 && tail(dot) < .03 &&
        (end.x - before.x) * (target.x - end.x) + (end.y - before.y) * (target.y - end.y) > 0, 'Dot has a loaded belly and a distinct light exit directed toward the next bar.'); break; }
    case 'eight-le': add('bar-shape-and-hierarchy', main(1).points.length >= 5 && main(1).options.finish === 'return' &&
      source[2].some(g => g.id === 'short' && strokeLength(g.strokes[0].points) < strokeLength(main(2).points) * .75 &&
        g.strokes[0].options.width < main(2).options.width), 'A shaped primary bar and shorter lighter second bar replace equal repeated beams.'); break;
    case 'eight-nu': { const points = main(1).points;
      add('controlled-downward-support', points.every((q, i) => i === 0 || q.y > points[i - 1].y) && points.length > 4 &&
        source[2].some(g => g.id === 'crossbars' && g.strokes.length === 2 && strokeLength(g.strokes[0].points) < strokeLength(g.strokes[1].points)), 'Downward travel retains local stations and supports unequal crossbars.'); break; }
    case 'eight-ti': { const points = main(1).points, last = points.at(-1), root = points[4];
      add('hook-belongs-to-vertical', source[0][0].strokes.length === 2 && source[1][0].strokes.length === 1 &&
        last.x < root.x && last.y < root.y && root.pressure === pressurePeak(main(1)) && tail(main(1)) < .03,
      'Loaded root and upward-left release are one continuous source stroke instead of a pasted hook.'); break; }
    case 'eight-ce-lift': { const points = main(1).points, peak = points.findIndex(q => q.pressure === pressurePeak(main(1)));
      add('support-before-ascending-release', peakPosition(main(1)) < .15 && points.at(-1).y < points[peak].y &&
        points.slice(peak).every((q, i, list) => i === 0 || q.pressure < list[i - 1].pressure) && source[2].some(g => g.id === 'answer'),
      'The selected Guxuan candidate loads before ascending and gradually lifting toward an answer.'); break; }
    case 'eight-lue': { const points = main(1).points, answer = source[2].find(g => g.id === 'answer').strokes[0];
      add('curved-left-send-and-open-join', points.every((q, i) => i === 0 || q.x < points[i - 1].x) && tail(main(1)) < .03 &&
        points.some(q => q.x === answer.points[0].x && q.y === answer.points[0].y), 'Leftward candidate uses multiple support stations and the companion starts at an explicit shared point.'); break; }
    case 'eight-zhuo': add('short-early-load', peakPosition(main(1)) < .15 && peakPosition(main(0)) > .3 && tail(main(1)) < .03 && source[2].length === 2,
    'Short-pull candidate loads earlier than the shrunken long-pull control and has an independently authored response.'); break;
    case 'eight-zhe': { const points = main(1).points, peak = points.findIndex(q => q.pressure === pressurePeak(main(1)));
      const incoming = { x: points[peak].x - points[peak - 1].x, y: points[peak].y - points[peak - 1].y },
        outgoing = { x: points.at(-1).x - points[peak + 1].x, y: points.at(-1).y - points[peak + 1].y };
      add('foot-turn-and-travelled-release', peak > 2 && peak < points.length - 2 && incoming.x * outgoing.y - incoming.y * outgoing.x < 0 &&
        points.slice(peak).every((q, i, list) => i === 0 || q.pressure < list[i - 1].pressure) && source[2].some(g => g.parentId === 'main'),
      'Internal foot load turns into a travelled release; the companion has explicit structural ownership.'); break; }
    case 'line-outline': { const closed = s => Math.hypot(s.points[0].x - s.points.at(-1).x, s.points[0].y - s.points.at(-1).y) < .01;
      add('authored-visible-boundaries', flat(0).every(closed) && flat(1).every(s => !closed(s)) &&
        source[1].find(g => g.id === 'rear').strokes.length === 2 && source[2].find(g => g.id === 'turning-plane')?.parentId === 'front',
      'Closed overlapping control becomes explicit visible rear spans and open front contours, with child turning-plane lines.'); break; }
    default: add('known-study', false, 'Unknown brush study.');
  }
  return { ok: checks.every(check => check.pass), checks };
}
