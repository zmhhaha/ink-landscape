import { createBrushDocument, reviseBrushDocument, createInkScene } from '../dist/index.js';

export const foundationInputs = Object.freeze({ seed: 261119, pathVariant: 'curve', press: .92, switchAt: .55, tailDryness: .90 });
export const foundationSize = Object.freeze({ width: 560, height: 240, background: '#f5f2e9' });

export function foundationPath(pathVariant) {
  const paths = {
    straight: [[58, 124, .10], [100, 124, .76], [238, 124, .63], [372, 124, .89], [456, 124, .48], [503, 124, .04]],
    curve: [[58, 157, .10], [146, 98, .76], [247, 146, .61], [357, 79, .89], [503, 118, .04]],
    corner: [[58, 178, .10], [175, 65, .83], [271, 177, .59], [375, 64, .91], [503, 130, .04]],
  };
  if (!Object.hasOwn(paths, pathVariant)) throw new RangeError('Unknown foundation path');
  return paths[pathVariant].map(([x, y, pressure]) => ({ x, y, pressure }));
}

export function foundationScene(documents, seed = foundationInputs.seed) {
  const scene = createInkScene({ ...foundationSize, seed });
  for (const document of documents) scene.stroke(document.result.points, document.result);
  return scene.snapshot();
}

function validate(inputs) {
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  for (const [key, low, high] of [['press', .2, 1], ['switchAt', .2, .8], ['tailDryness', .1, 1]]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < low || inputs[key] > high) throw new RangeError(`${key} must be in ${low}..${high}`);
  }
}

/** Original, caller-authored paths. These are controlled studies, not copied artwork. */
export function makeFoundationStudies(options = {}) {
  const inputs = { ...foundationInputs, ...options }; validate(inputs);
  const path = foundationPath(inputs.pathVariant);
  const common = { id: 'foundation-stroke', seed: inputs.seed, width: 35, ink: '#20251f', opacity: .94,
    dryness: .12, smoothing: inputs.pathVariant === 'corner' ? 'linear' : 'catmull-rom', start: 0, duration: 2 };
  const baseline = createBrushDocument(path, common);
  const variant = (id, label, document) => ({ id, label, document, scene: foundationScene([document], inputs.seed) });
  // Authored loading and release have different lengths; all comparison
  // columns keep this same source path and change only the declared channels.
  const pressure = [{ at: 0, pressure: .18 }, { at: .19, pressure: inputs.press * .66 },
    { at: .41, pressure: inputs.press }, { at: .57, pressure: inputs.press * .83 },
    { at: .79, pressure: inputs.press * .46 }, { at: 1, pressure: .10 }];
  const side = [{ at: 0, side: 0 }, { at: inputs.switchAt - .12, side: 0 }, { at: inputs.switchAt + .12, side: 1 }, { at: 1, side: 1 }];
  const dry = [{ at: 0, dryness: .12 }, { at: .28, dryness: .12 }, { at: 1, dryness: inputs.tailDryness }];
  const combinedControls = (channels) => {
    const positions = [...new Set(channels.flatMap(channel => channel.map(control => control.at)))].sort((a, b) => a - b);
    // Sparse control channels are intentionally merged without filling the others.
    return positions.map(at => Object.assign({ at }, ...channels.flatMap(channel => channel.filter(control => control.at === at))));
  };
  return [
    { id: 'pressure', title: '01 · 提按', variable: '仅改变沿笔路的压力倍率；保持锋向、墨色和枯润。',
      criteria: '观察轻提到重按的接触展开、再提起的收束，以及原始笔路是否连续。',
      limits: '压力是接触控制量；当前样片不表示已还原笔杆动作、毫束弹性或驻笔积墨。起收的渐细来自作者输入的压力。',
      techniqueIds: ['brush-lift', 'brush-press'],
      variants: [variant('baseline', '基线 · 保持作者压力', baseline),
        variant('variable', '变化 · 轻—重—轻', reviseBrushDocument(baseline, { options: { controls: pressure } })),
        variant('combined', '组合 · 提按 + 用锋转换', reviseBrushDocument(baseline, { options: { controls: combinedControls([pressure, side]) } }))] },
    { id: 'axis', title: '02 · 中锋／侧锋', variable: '仅改变锋尖与接触区的关系；同一笔中途转换。',
      criteria: '打开笔路观察锋尖在接触区中的位置，再看偏侧展开、转向和两侧承墨。圆厚或扁宽外形本身不能证明用锋成立。',
      limits: '采用注明范围的程序接触模型，尚待与实际毛笔局部对照。侧锋与偏锋在传统资料中的用词差异仍保留在阅读笔记中。',
      techniqueIds: ['brush-center', 'brush-side'],
      variants: [variant('baseline', '基线 · 中央接触', baseline),
        variant('variable', '变化 · 中央转偏侧', reviseBrushDocument(baseline, { options: { controls: side } })),
        variant('combined', '组合 · 用锋转换 + 提按', reviseBrushDocument(baseline, { options: { controls: combinedControls([side, pressure]) } }))] },
    { id: 'dry', title: '03 · 枯润／飞白', variable: '仅改变沿笔路的枯润；保持作者压力和用锋。',
      criteria: '观察实墨到露纸的变化，空白是否随笔势延续，断续、粗细是否避免均匀梳齿和重复章印。',
      limits: '枯润和接触覆盖是可控的视觉近似，不表示真实含水量、毛细渗透或墨液干燥。没有把纸张做旧效果混入笔法定义。',
      techniqueIds: ['ink-wet', 'ink-dry', 'ink-flying-white'],
      variants: [variant('baseline', '基线 · 连续承墨', baseline),
        variant('variable', '变化 · 前润后枯', reviseBrushDocument(baseline, { options: { controls: dry } })),
        variant('combined', '组合 · 偏侧 + 前润后枯', reviseBrushDocument(baseline, { options: { axis: 'side', controls: dry } }))] },
  ];
}

/** Two independently editable strokes; order is deliberate, not an accumulated-ink claim. */
export function makeFoundationComposition(options = {}) {
  const { seed = foundationInputs.seed } = options;
  const first = createBrushDocument([{ x: 76, y: 161, pressure: .15 }, { x: 238, y: 82, pressure: .9 }, { x: 475, y: 150, pressure: .12 }], {
    id: 'crossing-first', seed, width: 37, opacity: .70, dryness: .15, smoothing: 'catmull-rom', start: 0, duration: 1.2,
    controls: [{ at: 0, side: 0 }, { at: .65, side: 1 }, { at: 1, side: .4 }],
  });
  const second = createBrushDocument([{ x: 205, y: 43, pressure: .2 }, { x: 300, y: 136, pressure: .85 }, { x: 408, y: 200, pressure: .1 }], {
    id: 'crossing-second', seed: (seed ^ 0x6d31) >>> 0, width: 30, opacity: .84, dryness: .64, smoothing: 'catmull-rom', start: .8, duration: 1.3,
    controls: [{ at: 0, dryness: .3 }, { at: 1, dryness: .86 }],
  });
  return { documents: [first, second], scene: foundationScene([first, second], seed) };
}
