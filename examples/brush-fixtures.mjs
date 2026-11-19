import { createInkScene } from '/dist/index.js';

export const brushStudyInputs = Object.freeze({ seed: 261119, width: 600, height: 260, time: 3 });
const path = coordinates => coordinates.map(([x, y, pressure]) => ({ x, y, pressure }));
const base = (seed = brushStudyInputs.seed) => createInkScene({ width: 600, height: 260, seed, background: '#f2efe5' });

function turns(smoothing, transfer = false) {
  const scene = base();
  const paths = transfer ? [
    [[45, 109, .08], [116, 45, .65], [134, 46, .95], [150, 114, .8], [244, 57, .08]],
    [[336, 195, .08], [352, 93, .5], [402, 53, 1], [421, 137, .7], [548, 167, .08]],
  ] : [
    [[48, 84, .08], [126, 54, .65], [228, 108, 1], [350, 76, .65], [470, 36, .35], [550, 70, .08]],
    [[48, 204, .08], [126, 174, .65], [228, 228, 1], [350, 196, .65], [470, 156, .35], [550, 190, .08]],
  ];
  paths.forEach((points, i) => scene.stroke(path(points), {
    id: `turn-${i}`, seed: 734 + i, smoothing, width: i === 0 ? 34 : 52,
    nib: i === 0 ? 'round' : 'flat', tipAngle: -.65, dryness: .28,
    opacity: .85, start: 0, duration: 2,
  }));
  return scene.snapshot();
}

function dryBrush() {
  const scene = base();
  [.2, .55, .85].forEach((dryness, i) => scene.stroke(path([
    [45, 54 + i * 78, .08], [130, 34 + i * 78, .75], [235, 68 + i * 78, 1],
    [360, 40 + i * 78, .8], [472, 56 + i * 78, .5], [553, 30 + i * 78, .04],
  ]), { id: `dry-${i}`, seed: 8642, smoothing: 'catmull-rom', nib: 'flat',
    tipAngle: -.85, width: 54, dryness, opacity: .9, duration: 2 }));
  return scene.snapshot();
}

function rockFace() {
  const scene = base();
  const region = path([[157, 244], [204, 137], [230, 91], [283, 24], [309, 82], [347, 68],
    [387, 145], [445, 241], [359, 232], [288, 250], [220, 235]]);
  scene.wash(region, { opacity: .13, passes: 4, roughness: .45 });
  scene.cun(region, { idPrefix: 'rock-short', count: 34, length: 39, width: 7,
    seed: 361, opacity: .5, dryness: .68, smoothing: 'catmull-rom',
    flow: point => ({ x: (point.x - 295) * .012 - .1, y: 1 }), duration: 2 });
  const ridges = [
    [[205, 137, .1], [234, 93, .65], [269, 47, .7], [283, 24, .1]],
    [[283, 29, .1], [287, 100, .7], [269, 152, .75], [251, 201, .08]],
    [[311, 92, .1], [347, 68, .6], [361, 104, .8], [385, 151, .15]],
  ];
  ridges.forEach((points, i) => scene.stroke(path(points), { id: `rock-ridge-${i}`,
    width: 10, dryness: .45, opacity: .7, smoothing: 'catmull-rom', duration: 2 }));
  return scene.snapshot();
}

export function makeBrushComparisons() {
  return [
    { id: 'turns-linear', label: '01 · 原始折线', description: '上：圆锋 34；下：侧锋 52。枯润 0.28。', scene: turns('linear') },
    { id: 'turns-smooth', label: '01 · 平滑笔路', description: '相同控制点、压力、种子和材质，仅改变笔路插值。', scene: turns('catmull-rom') },
    { id: 'transfer-linear', label: '02 · 换形 / 原始折线', description: '改用急转与不等距控制点；左圆锋，右侧锋。', scene: turns('linear', true) },
    { id: 'transfer-smooth', label: '02 · 换形 / 平滑笔路', description: '检查转折与端点，观察平滑是否损失刻意折笔。', scene: turns('catmull-rom', true) },
    { id: 'dryness', label: '03 · 飞白与墨量', description: '由上至下枯润 0.20 / 0.55 / 0.85；保持同一笔势与纹理种子。', scene: dryBrush() },
    { id: 'rock', label: '04 · 岩面短笔组合', description: '短皴顺岩面分向，叠加淡底与骨线；仅作组合与换形观察。', scene: rockFace() },
  ];
}
