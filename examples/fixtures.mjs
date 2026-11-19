import { createInkScene, createRandom } from '/dist/index.js';

export const studies = Object.freeze({
  brush: { title: '笔触试纸', caption: '由左至右比较圆锋、侧锋与枯笔；下方短笔展示提按、顿挫和断白。枯润参数作用于笔触，所有路径均可单独修改。' },
  cun: { title: '皴擦研究', caption: '左侧是受披麻皴启发的长短曲笔，右侧是受斧劈皴启发的短阔侧锋。两者使用不同岩面和方向组织，区域边界负责限制笔触。' },
  wash: { title: '铺染留白', caption: '以不同浓淡、轮廓和叠放次序建立远近，直接留下云带与水面。铺染是可控的形状叠墨近似，尚未模拟真实水分扩散。' },
  landscape: { title: '山水组合', caption: '将自主设计的山形、局部皴擦、远山淡墨、松枝和飞鸟组合成一幅小景。它是调用示例，构图没有写入技法库核心。' },
});

const shape = coordinates => coordinates.map(([x, y, pressure]) => pressure === undefined ? { x, y } : { x, y, pressure });
const clamp = value => Math.max(0, Math.min(1, value));

function brushStudy(scene, dryness) {
  const curves = [
    [[130, 160, .1], [180, 145, .6], [235, 175, .95], [300, 155, .55], [340, 110, .08]],
    [[490, 160, .15], [535, 145, .75], [590, 182, 1], [652, 162, .7], [695, 110, .05]],
    [[850, 160, .15], [895, 145, .75], [950, 182, 1], [1012, 162, .7], [1055, 110, .05]],
  ];
  curves.forEach((path, i) => scene.stroke(shape(path), { id: `curve-${i}`, width: i === 1 ? 42 : 22, nib: i === 0 ? 'round' : 'flat', tipAngle: -.65, dryness: clamp(dryness + (i - 1) * .26), start: .15 + i * .3, duration: .8 }));
  for (let column = 0; column < 3; column++) {
    const x = 130 + column * 360;
    scene.stroke(shape([[x + 150, 300, .08], [x + 80, 325, .7], [x + 30, 380, 1], [x + 75, 435, .7], [x + 185, 455, .05]]), { width: 32, nib: column === 1 ? 'flat' : 'round', tipAngle: -.7, dryness: clamp(dryness + (column - 1) * .25), start: 1.4 + column * .3, duration: .9 });
    scene.stroke(shape([[x + 35, 615, .08], [x + 75, 580, .6], [x + 120, 575, 1], [x + 180, 605, .08]]), { width: 21, nib: 'flat', tipAngle: -1.1, dryness: clamp(dryness + (column - 1) * .2), start: 3 + column * .35, duration: .6 });
    for (let dot = 0; dot < 4; dot++) {
      scene.stroke(shape([[x + dot * 53, 680 - dot * 6, .85], [x + dot * 53 + 9, 684 - dot * 6, .1]]), { width: 12 + dot * 3, dryness, nib: 'flat', tipAngle: -.8, start: 4.2 + dot * .2 + column * .12, duration: .2 });
    }
  }
}

function cunStudy(scene, dryness) {
  const left = shape([[120, 650], [155, 505], [220, 393], [263, 238], [322, 150], [366, 264], [432, 365], [487, 515], [532, 650], [335, 617]]);
  const right = shape([[730, 651], [762, 519], [804, 454], [812, 331], [892, 198], [918, 164], [956, 300], [1021, 345], [1044, 484], [1127, 632], [966, 670]]);
  scene.wash(left, { opacity: .16, passes: 5, roughness: .55, start: .1, duration: .8 });
  scene.wash(right, { opacity: .15, passes: 5, roughness: .5, start: .4, duration: .8 });
  scene.cun(left, { idPrefix: 'pima', technique: 'pima', count: 104, length: 95, width: 4.6, dryness, opacity: .58, flow: point => ({ x: (point.x - 315) * .005 + .12, y: 1 }), start: 1.1, duration: 2.4 });
  scene.cun(right, { idPrefix: 'axe', technique: 'axe', count: 80, length: 65, width: 24, dryness, opacity: .49, direction: { x: .42, y: 1 }, tipAngle: -.8, start: 1.1, duration: 2.4 });
  scene.stroke(shape([[154, 515, .1], [221, 392, .42], [264, 238, .8], [322, 150, .25], [367, 266, .06]]), { width: 8, dryness, start: 3.6, duration: .8 });
  scene.stroke(shape([[763, 516, .1], [805, 453, .5], [813, 333, .9], [892, 198, .35], [918, 164, .05]]), { width: 10, nib: 'flat', dryness, start: 3.6, duration: .8 });
}

function washStudy(scene, dryness) {
  const layers = [
    [[0, 385], [65, 360], [124, 367], [180, 330], [225, 345], [281, 317], [332, 347], [401, 340], [460, 365], [530, 330], [600, 342], [664, 315], [720, 337], [789, 314], [854, 330], [925, 355], [1008, 341], [1090, 365], [1176, 334], [1280, 362], [1280, 416], [0, 425]],
    [[0, 454], [80, 437], [155, 453], [232, 395], [287, 414], [345, 378], [390, 412], [442, 450], [524, 436], [600, 466], [662, 451], [755, 394], [789, 370], [834, 414], [900, 435], [973, 417], [1066, 453], [1150, 438], [1280, 459], [1280, 510], [0, 498]],
    [[140, 574], [200, 515], [244, 421], [268, 309], [290, 268], [317, 359], [350, 407], [384, 482], [435, 551], [478, 581], [370, 574], [280, 602]],
    [[686, 592], [728, 541], [780, 474], [816, 378], [844, 356], [869, 443], [918, 486], [972, 560], [1029, 594], [939, 614], [838, 599]],
    [[0, 753], [42, 705], [118, 680], [206, 703], [257, 750], [338, 800], [0, 800]],
  ];
  const opacities = [.07, .1, .26, .19, .55];
  layers.forEach((outline, i) => scene.wash(shape(outline), { id: `layer-${i}`, opacity: opacities[i], roughness: .65, passes: 6, start: .15 + i * .65, duration: 1 }));
  scene.cun(shape(layers[2]), { count: 37, width: 6, length: 61, opacity: .36, dryness, start: 3.2, duration: 1 });
  scene.cun(shape(layers[3]), { count: 26, width: 5, length: 50, opacity: .27, dryness, start: 3.4, duration: 1 });
  scene.stroke(shape([[1040, 674, .05], [1090, 672, .4], [1125, 675, .08]]), { width: 2, opacity: .25, dryness: .1, start: 4.5, duration: .7 });
}

function pine(scene, random, x, y, size, dryness, start) {
  const p = (dx, dy, pressure) => ({ x: x + dx * size, y: y + dy * size, pressure });
  scene.stroke([p(0, 0, .9), p(-6, -56, .8), p(6, -102, .6), p(1, -145, .1)], { width: 10 * size, dryness, start, duration: .8 });
  const branches = [[-5, -48, -45, -59], [0, -72, 42, -82], [4, -99, -31, -108], [4, -120, 28, -127], [1, -139, -13, -141]];
  branches.forEach(([a, b, c, d], index) => {
    scene.stroke([p(a, b, .7), p((a + c) / 2, d + 5, .6), p(c, d, .08)], { width: 5 * size, dryness, start: start + .2, duration: .6 });
    const spread = (17 - index * 1.8) * size;
    for (let needle = 0; needle < 8; needle++) {
      const px = x + c * size + (random() - .5) * spread * 1.5;
      const py = y + d * size + (random() - .5) * spread * .28;
      scene.stroke([{ x: px, y: py, pressure: .8 }, { x: px + (random() - .5) * 15 * size, y: py - (3 + random() * 7) * size, pressure: .05 }], { width: 3.5 * size, nib: 'flat', dryness, opacity: .82, start: start + .4 + index * .05, duration: .25 });
    }
  });
}

function landscapeStudy(scene, dryness, seed) {
  const random = createRandom(seed);
  const far = [];
  for (let x = 0; x <= 1280; x += 32) far.push([x, 475 - 19 * Math.sin(x * .008) - 14 * Math.sin(x * .026) - random() * 12]);
  scene.wash(shape([...far, [1280, 550], [0, 550]]), { opacity: .075, passes: 4, start: .1, duration: .9 });
  const rear = shape([[811, 576], [850, 512], [892, 487], [925, 408], [955, 345], [977, 415], [1001, 436], [1041, 515], [1100, 580], [974, 599]]);
  scene.wash(rear, { opacity: .17, roughness: .6, start: .5, duration: .9 });
  scene.cun(rear, { count: 36, width: 4, length: 47, opacity: .24, dryness, flow: point => ({ x: (point.x - 955) * .006, y: 1 }), start: 1.1, duration: 1.4 });
  const mountain = shape([[421, 587], [456, 532], [481, 466], [512, 422], [528, 323], [556, 266], [574, 158], [590, 134], [603, 227], [621, 277], [644, 249], [661, 342], [697, 405], [723, 381], [749, 480], [796, 579], [694, 598], [621, 572], [535, 607]]);
  scene.wash(mountain, { opacity: .27, passes: 6, roughness: .63, start: .8, duration: 1.1 });
  scene.wash(shape([[507, 531], [534, 388], [556, 309], [574, 201], [584, 161], [591, 294], [605, 372], [623, 510], [597, 572]]), { opacity: .24, roughness: .65, start: 1.5, duration: 1 });
  scene.cun(mountain, { count: 132, width: 5.2, length: 84, opacity: .5, dryness, flow: point => ({ x: (point.x - 588) * .006 - .1, y: 1 }), start: 1.7, duration: 1.6 });
  scene.stroke(shape([[458, 533, .1], [485, 466, .5], [513, 422, .6], [530, 324, .4], [557, 265, .7], [575, 158, .55], [590, 134, .06]]), { width: 8.5, dryness, opacity: .8, start: 2.1, duration: 1.2 });
  const near = shape([[0, 610], [47, 590], [93, 614], [135, 606], [194, 653], [237, 670], [278, 723], [340, 762], [364, 800], [0, 800]]);
  scene.wash(near, { opacity: .73, roughness: .5, passes: 5, start: 2.3, duration: .8 });
  scene.cun(near, { technique: 'axe', count: 44, width: 21, length: 42, opacity: .45, dryness, direction: { x: .7, y: 1 }, start: 2.7, duration: .8 });
  pine(scene, random, 103, 615, .91, dryness, 3.2);
  pine(scene, random, 181, 650, .64, dryness, 3.4);
  const sun = Array.from({ length: 40 }, (_, i) => ({ x: 1060 + Math.cos(i * Math.PI / 20) * 28, y: 165 + Math.sin(i * Math.PI / 20) * 28 }));
  scene.wash(sun, { ink: '#b34330', opacity: .85, roughness: .04, passes: 3, start: 4.2, duration: .5 });
  for (let i = 0; i < 5; i++) {
    const x = 872 + i * 26, y = 143 - i * 9;
    scene.stroke(shape([[x - 7, y + 2, .1], [x - 3, y - 1, .5], [x, y + 1, .6], [x + 4, y - 2, .4], [x + 8, y - 2, .05]]), { width: 1.7, dryness: .2, opacity: .65, start: 4.6 + i * .1, duration: .25 });
  }
}

export function makeStudy(kind, { seed = 261119, dryness = .55, smoothing = 'catmull-rom' } = {}) {
  if (!(kind in studies)) throw new RangeError('Unknown study');
  if (smoothing !== 'linear' && smoothing !== 'catmull-rom') throw new RangeError('Unknown smoothing');
  const scene = createInkScene({ width: 1280, height: 800, seed, background: '#f2efe5' });
  if (kind === 'brush') brushStudy(scene, dryness);
  if (kind === 'cun') cunStudy(scene, dryness);
  if (kind === 'wash') washStudy(scene, dryness);
  if (kind === 'landscape') landscapeStudy(scene, dryness, seed);
  const snapshot = scene.snapshot();
  return Object.freeze({ ...snapshot, marks: Object.freeze(snapshot.marks.map(mark => mark.kind === 'stroke'
    ? Object.freeze({ ...mark, smoothing }) : mark)) });
}
