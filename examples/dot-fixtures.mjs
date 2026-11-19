import { createDotDocument, reviseDotDocument, createInkScene } from '../dist/index.js';

export const dotInputs = Object.freeze({ seed: 261121, layout: 'straight', press: .94, spacing: 1, response: .78 });
export const dotSize = Object.freeze({ width: 560, height: 240, background: '#f5f2e9' });

/** Original authored placements; these layouts do not distribute marks over a region. */
export function dotLayout(positions, layout) {
  if (!['straight', 'arc', 'slope'].includes(layout)) throw new RangeError('Unknown dot layout');
  return positions.map(point => {
    if (layout === 'arc') return { ...point, y: point.y + 22 * (1 - ((point.x - 280) / 230) ** 2) };
    if (layout === 'slope') {
      const angle = -.16, x = point.x - 280, y = point.y - 120;
      return { ...point, x: 280 + x * Math.cos(angle) - y * Math.sin(angle),
        y: 120 + x * Math.sin(angle) + y * Math.cos(angle), angle: (point.angle ?? 0) + angle };
    }
    return { ...point };
  });
}

export function dotScene(document, seed = dotInputs.seed) {
  const scene = createInkScene({ ...dotSize, seed });
  for (const mark of document.result) scene.stroke(mark.points, mark);
  return scene.snapshot();
}

function validate(inputs) {
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  for (const key of ['press', 'spacing', 'response']) if (!Number.isFinite(inputs[key]) || inputs[key] < 0 || inputs[key] > 1) throw new RangeError(`${key} must be in 0..1`);
}

export function makeDotStudies(options = {}) {
  const inputs = { ...dotInputs, ...options }; validate(inputs);
  const common = { seed: inputs.seed, shape: 'round', size: 52, angle: 0, interval: 0,
    axis: 'center', dryness: .22, opacity: .94, ink: '#20251f', start: 0, duration: 1.6 };
  const three = dotLayout([110, 270, 430].map((x, index) => ({ id: `point-${index + 1}`, x, y: 112,
    pressure: .86, start: index * .08 })), inputs.layout);
  const pressureControls = [{ at: 0, pressure: .12 }, { at: .27, pressure: inputs.press * .35 },
    { at: .58, pressure: inputs.press }, { at: .8, pressure: inputs.press * .82 }, { at: 1, pressure: .08 }];
  const plain = createDotDocument(three, { ...common, controls: [{ at: 0, pressure: .58 }, { at: 1, pressure: .58 }] });
  const pressed = reviseDotDocument(plain, { options: { controls: pressureControls } });
  const side = reviseDotDocument(pressed, { options: { axis: 'side' } });
  // One shared, deliberately asymmetric pressure/side envelope: the belly is
  // loaded later than the light entry, rather than forming a centered diamond.
  // The direction experiment changes only rotation, including these controls.
  const directionalControls = [
    { at: 0, pressure: .08, side: .02, angle: 1.5, inkLoad: .62 },
    { at: .28, pressure: .18, side: .08, angle: 1.5, inkLoad: .72 },
    { at: .58, pressure: 1, side: .36, angle: 1.4, inkLoad: 1 },
    { at: .77, pressure: 1, side: .52, angle: 1.45, inkLoad: 1 },
    { at: .91, pressure: .7, side: .3, angle: 1.5, inkLoad: .85 },
    { at: 1, pressure: .05, side: .04, angle: 1.5, inkLoad: .62 },
  ];
  const directed = angle => createDotDocument(three, { ...common, shape: 'horizontal', size: 52, controls: directionalControls, angle });
  // Unequal local groups and broad gaps are author decisions, with exactly the
  // same nine sizes/pressures retained for this position-only comparison.
  const organized = [[110, 144], [132, 122], [148, 153], [170, 133], [279, 116], [299, 96], [321, 125], [423, 86], [452, 110]];
  const angles = [-.82, -.3, .22, .64, -.65, -.12, .52, -.9, -.35];
  const grid = Array.from({ length: 9 }, (_, i) => ({ id: `group-${i + 1}`, x: 100 + (i % 3) * 175,
    y: 59 + Math.floor(i / 3) * 55, pressure: .74 + (i % 3) * .06, size: 28 + (i % 3) * 3, start: i * .04 }));
  const spaced = grid.map((point, i) => ({ ...point, x: point.x + (organized[i][0] - point.x) * inputs.spacing,
    y: point.y + (organized[i][1] - point.y) * inputs.spacing }));
  const groupOptions = { ...common, shape: 'horizontal', dryness: .3, size: 32, controls: directionalControls };
  const grouped = createDotDocument(dotLayout(spaced, inputs.layout), groupOptions);
  const responding = reviseDotDocument(grouped, { positions: dotLayout(spaced.map((point, i) => ({ ...point, angle: angles[i] * inputs.response })), inputs.layout) });
  const variant = (id, label, document) => ({ id, label, document, scene: dotScene(document, inputs.seed) });
  return [
    { id: 'press', title: '07 · 单点提按', variable: '落点、点形和墨色相同：均一压力倍率 → 局部提按 → 保留提按并偏侧接触。',
      criteria: '看局部压力峰值如何改变点迹的饱满和收束，再看偏侧接触如何把锋尖与接触区分开。',
      limits: '所有点形的原始短笔路已有首末提起；第一列是均一压力倍率，不能理解为恒定接触宽度。这里只研究单点接触，不代表已完成传统点苔或点叶。',
      techniqueIds: ['brush-dot', 'brush-lift', 'brush-press', 'brush-side'],
      variants: [variant('baseline', '对照 · 均一压力倍率', plain), variant('variable', '变化 · 局部提按', pressed), variant('combined', '组合 · 提按 + 偏侧', side)] },
    { id: 'direction', title: '08 · 横竖斜点势', variable: '固定同一种短点形和三个落点，只改变公共方向；三列是方向对照。',
      criteria: '看点迹沿横、竖、斜方向的伸展。形状、压力、种子和材质完全相同，方向由调用者显式给定。',
      limits: '横竖斜是同一程序点形的旋转对照，尚未涵盖传统点法各自的入纸、行笔、收笔差别。',
      techniqueIds: ['brush-dot'], variants: [variant('baseline', '横势 · 0°', directed(0)), variant('variable', '竖势 · 90°', directed(Math.PI / 2)), variant('combined', '斜势 · −45°', directed(-Math.PI / 4))] },
    { id: 'group', title: '09 · 群点组织', variable: '同一组九笔：等距排布 → 只改疏密位置 → 保留位置并加入方向呼应。',
      criteria: '先看间距带来的疏密，再看同一位置上方向的呼应。每个点有稳定 ID，尺寸、压力和材质在三列中逐点一致。',
      limits: '位置与呼应角均是作者给定的示例，可逐点修改；没有用随机点填满区域，也不据此宣称已实现介字点、个字点、米点等传统点法。',
      techniqueIds: ['brush-dot'], variants: [variant('baseline', '对照 · 等距九点', createDotDocument(dotLayout(grid, inputs.layout), groupOptions)), variant('variable', '变化 · 只改疏密位置', grouped), variant('combined', '组合 · 疏密 + 方向呼应', responding)] },
  ];
}

/** Edit only one authored placement; all other marks keep their explicit IDs and start times. */
export function editDotPlacement(document, id, { dx = 0, dy = 0, angle = 0 } = {}) {
  if (!document.recipe.positions.some(point => point.id === id)) throw new RangeError('Unknown dot id');
  return reviseDotDocument(document, { positions: document.recipe.positions.map(point => point.id === id
    ? { ...point, x: point.x + dx, y: point.y + dy, angle: (point.angle ?? 0) + angle } : point) });
}
