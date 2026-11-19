import { createBrushDocument, reviseBrushDocument, createInkScene } from '../dist/index.js';

export const gestureInputs = Object.freeze({ seed: 261120, pathVariant: 'curve', strength: .9, side: .8, tailDryness: .72 });
export const gestureSize = Object.freeze({ width: 560, height: 240, background: '#f5f2e9' });

/** Original caller-authored paths; no reference artwork is copied. */
export function gesturePath(pathVariant, turning = false) {
  const layouts = turning ? {
    straight: [[65, 161, .52], [259, 161, .91], [259, 76, .74], [488, 76, .28]],
    curve: [[65, 167, .52], [164, 109, .84], [277, 109, .65], [277, 166, .91], [490, 98, .28]],
    corner: [[65, 162, .52], [183, 69, .90], [287, 165, .67], [390, 74, .85], [492, 137, .28]],
  } : {
    straight: [[66, 124, .54], [160, 124, .87], [386, 124, .64], [493, 124, .35]],
    curve: [[66, 157, .54], [158, 90, .87], [265, 144, .61], [376, 83, .81], [493, 118, .35]],
    corner: [[66, 165, .54], [179, 73, .87], [282, 164, .61], [386, 74, .81], [493, 136, .35]],
  };
  if (!Object.hasOwn(layouts, pathVariant)) throw new RangeError('Unknown gesture path');
  return layouts[pathVariant].map(([x, y, pressure]) => ({ x, y, pressure }));
}

export function gestureScene(documents, seed = gestureInputs.seed) {
  const scene = createInkScene({ ...gestureSize, seed });
  for (const document of documents) scene.stroke(document.result.points, document.result);
  return scene.snapshot();
}

function validate(inputs) {
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  for (const [key, low, high] of [['strength', 0, 1], ['side', 0, 1], ['tailDryness', 0, 1]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < low || inputs[key] > high) throw new RangeError(`${key} must be in ${low}..${high}`);
  }
}

export function makeGestureStudies(options = {}) {
  const inputs = { ...gestureInputs, ...options }; validate(inputs);
  const path = gesturePath(inputs.pathVariant);
  const common = { id: 'gesture-stroke', seed: inputs.seed, width: 34, ink: '#20251f', opacity: .94,
    dryness: .20, smoothing: inputs.pathVariant === 'corner' ? 'linear' : 'catmull-rom',
    gestureModel: 'local-v1', strength: inputs.strength, start: 0, duration: 2 };
  const variant = (id, label, document) => ({ id, label, document, scene: gestureScene([document], inputs.seed) });
  const plain = createBrushDocument(path, common);
  const exposed = reviseBrushDocument(plain, { options: { entry: 'exposed' } });
  const concealed = reviseBrushDocument(plain, { options: { entry: 'concealed' } });
  const open = reviseBrushDocument(plain, { options: { finish: 'open' } });
  const returned = reviseBrushDocument(plain, { options: { finish: 'return' } });
  const corner = createBrushDocument(gesturePath(inputs.pathVariant, true), { ...common, smoothing: 'linear', turn: 'angular' });
  const round = reviseBrushDocument(corner, { options: { turn: 'round' } });
  const sideEntry = [{ at: 0, side: inputs.side }, { at: .16, side: inputs.side }, { at: .4, side: 0 }, { at: 1, side: 0 }];
  const turnControl = [{ at: 0, side: 0, angle: Math.PI / 2 }, { at: .28, side: inputs.side, angle: Math.PI * .35 },
    { at: .58, side: inputs.side * .35, angle: Math.PI * .65 }, { at: 1, side: 0, angle: Math.PI / 2 }];
  return [
    { id: 'entry', title: '04 · 起笔', variable: '先比较露入与逆入，再在同一逆入动作上叠加偏侧接触。',
      criteria: '放大起端并打开笔路：观察由细入实、逆向进入后折回，以及起端接触展开。主体路径和墨色保持一致。',
      limits: '露入是起端压力变化，逆入是短程折返；它们不是给两种线条换笔帽。尚不模拟毫束藏锋、驻笔或具体书体笔顺。',
      techniqueIds: ['brush-exposed-entry', 'brush-hidden-entry', 'brush-side'],
      variants: [variant('baseline', '对照 · 露入', exposed), variant('variable', '变化 · 逆入后行', concealed),
        variant('combined', '组合 · 逆入 + 偏侧展开', reviseBrushDocument(concealed, { options: { controls: sideEntry } }))] },
    { id: 'finish', title: '05 · 收笔', variable: '只替换收笔方式，分别观察原收、提收与回行；三列是收法对照。',
      criteria: '观察末端提起的收束、回入笔画内部的行迹，以及动作是否局限于尾段。原收保留作者给定的压力。',
      limits: '提收通过尾段压力减小表达；回行通过末段折返表达。当前回收不等同所有传统回锋，时间显露不模拟真实提笔速度。',
      techniqueIds: ['brush-exposed-finish', 'brush-return-finish'],
      variants: [variant('baseline', '基线 · 保留原收', plain), variant('variable', '变化 · 提收出锋', open),
        variant('combined', '对照 · 回行收束', returned)] },
    { id: 'turn', title: '06 · 转折与换向', variable: '先比较保折与圆转，再在相同圆转笔路上增加局部接触朝向变化。',
      criteria: '观察角点是否保留、圆转是否过度膨胀，以及换锋后接触区与锋尖的关系。三种布局均保留实际折向供比较。',
      limits: '圆转只替换角点附近的一段笔路，保留远处长直段；局部接触朝向是可编辑近似，尚不模拟毫束翻转、顿驻和调锋全过程。',
      techniqueIds: ['brush-turn', 'brush-fold', 'brush-center', 'brush-side'],
      variants: [variant('baseline', '对照 · 保角与局部提按', corner), variant('variable', '变化 · 圆转笔路', round),
        variant('combined', '组合 · 圆转 + 局部换锋', reviseBrushDocument(round, { options: { controls: turnControl } }))] },
  ];
}

/** A small two-stroke composition. Each source remains independently editable. */
export function makeGestureComposition(options = {}) {
  const inputs = { ...gestureInputs, ...options }; validate(inputs);
  const first = createBrushDocument([{ x: 69, y: 163, pressure: .75 }, { x: 189, y: 82, pressure: .85 },
    { x: 303, y: 137, pressure: .8 }, { x: 485, y: 89, pressure: .7 }], {
    id: 'gesture-composition-first', seed: inputs.seed, width: 29, dryness: .19, opacity: .85,
    gestureModel: 'local-v1', entry: 'concealed', finish: 'open', strength: inputs.strength, smoothing: 'catmull-rom',
    start: 0, duration: 1.4,
    controls: [{ at: 0, side: inputs.side }, { at: .3, side: .15 }, { at: 1, side: .15 }],
  });
  const second = createBrushDocument([{ x: 200, y: 45, pressure: .7 }, { x: 285, y: 124, pressure: .85 },
    { x: 421, y: 195, pressure: .65 }], {
    id: 'gesture-composition-second', seed: (inputs.seed ^ 0x6712) >>> 0, width: 25, dryness: .35, opacity: .8,
    gestureModel: 'local-v1', entry: 'exposed', finish: 'return', strength: inputs.strength, turn: 'angular', start: .8, duration: 1.4,
    controls: [{ at: 0, dryness: .3 }, { at: 1, dryness: inputs.tailDryness }],
  });
  return { documents: [first, second], scene: gestureScene([first, second], inputs.seed) };
}
