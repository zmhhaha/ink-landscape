import { createInkProcessDocument, createWaterProcessDocument, createStrokeGroupDocument } from '../dist/index.js';

// These are authored comparisons, not inferred reconstructions of named techniques.
// Every material irregularity is seeded; the saved documents retain editable paths.
const SIZE = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const LAYOUTS = Object.freeze(['slope', 'arc', 'fold']);
const hash = value => {
  let n = 2166136261;
  for (const ch of String(value)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
};
function random(seed) {
  let n = seed >>> 0;
  return () => { n = (n + 0x6d2b79f5) >>> 0; let t = Math.imul(n ^ n >>> 15, n | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function context({ seed = 261120, layout = 'slope' } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  if (!LAYOUTS.includes(layout)) throw new RangeError('Unknown remaining-ink layout');
  const xy = ([x, y]) => {
    if (layout === 'arc') return { x: x + 9 * Math.sin((y - 40) / 190 * Math.PI), y: 133 + (y - 133) * .86 + 19 * Math.sin((x - 65) / 430 * Math.PI) };
    if (layout === 'fold') return { x: x + 12 * Math.sin((y - 80) / 150 * Math.PI), y: y + (x < 275 ? (x - 160) * -.10 : (x - 360) * .16) };
    return { x, y };
  };
  const stroke = (id, coords, width = 3, dryness = .35, opacity = .8, extra = {}) => ({
    points: coords.map(([x, y, pressure = .8]) => ({ ...xy([x, y]), pressure })),
    options: { id, seed: (seed ^ hash(id)) >>> 0, width, dryness, opacity, axis: 'center', smoothing: 'catmull-rom',
      gestureModel: 'local-v1', ...extra, ...(extra.clip ? { clip: extra.clip.map(xy) } : {}) },
  });
  const group = (id, strokes, role = 'mark', parentId) => ({ id, role, ...(parentId ? { parentId } : {}),
    strokes: strokes.map(source => { const { id: strokeId, seed: ignoredSeed, ...options } = source.options;
      return { id: strokeId, points: source.points, options }; }) });
  const options = { ...SIZE, seed };
  return { seed, layout, xy, stroke, group,
    ink: layers => createInkProcessDocument(layers, options),
    water: events => createWaterProcessDocument(events, options),
    groups: groups => createStrokeGroupDocument(groups, options),
  };
}
const layer = (id, strokes, concentration = .4, at = 0, water = .4, dryAfter = 1, mode = 'glaze') =>
  ({ id, strokes, concentration, at, water, dryAfter, mode });
const inkEvent = (...args) => ({ kind: 'ink', ...layer(...args) });
const waterEvent = (id, strokes, at, water = .8, dryAfter = 1.2) =>
  ({ kind: 'water', id, strokes, at, water, dryAfter, mode: 'wet-mix' });
const variant = (id, label, document) => ({ id, label, document });
const study = (id, title, techniqueIds, variable, criteria, limits, variants, detail = [280, 140]) =>
  ({ id, title, techniqueIds, variable, criteria, limits, detail, variants });
const ROCK = [[81, 221], [105, 153], [156, 123], [200, 62], [251, 76], [278, 121], [339, 106], [389, 150], [465, 185], [489, 224]];
const SHADE = [[211, 101], [237, 103], [269, 139], [300, 143], [335, 132], [363, 164], [401, 188], [419, 218], [316, 220], [277, 194], [250, 172], [243, 146], [221, 129]];
const REAR = [[89, 209], [103, 130], [158, 67], [212, 109], [249, 165], [293, 215]];
function outline(c, id = 'structure', width = 2.4, dryness = .52) {
  return [c.stroke(`${id}-ridge`, ROCK.slice(0, 7).map(([x, y], i) => [x, y, i === 0 ? .25 : .72]), width, dryness, .83),
    c.stroke(`${id}-right`, [[339, 106, .25], [389, 150, .7], [465, 185, .6], [489, 224, .1]], width, dryness, .76),
    c.stroke(`${id}-inner`, [[200, 65, .15], [207, 111, .8], [240, 139, .65], [245, 181, .6], [285, 221, .1]], width * .8, dryness, .66),
    c.stroke(`${id}-ledge`, [[278, 122, .1], [313, 160, .7], [367, 178, .55], [404, 210, .1]], width * .85, dryness, .68)];
}
function regionRows(c, id, polygon, { width = 24, dryness = .12, opacity = .75, ink, clip = polygon } = {}) {
  const marks = [], rng = random(c.seed ^ hash(id));
  const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  let doubleArea = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; doubleArea += a[0] * b[1] - b[0] * a[1]; }
  const inside = (x, y) => {
    let yes = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
  };
  const edgeDistance = (x, y) => {
    let result = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
      result = Math.min(result, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
    }
    return result;
  };
  const contactWidth = width * 2 + 6, count = Math.max(20, Math.ceil(Math.abs(doubleArea) * .5 / (contactWidth * contactWidth) * 11));
  // Nonperiodic, highly overlapping round contacts make a continuous weak field.
  // A short near-constant-pressure path has no repeated taper or global hatch axis.
  for (let k = 0; k < count; k++) {
    let x, y;
    do { x = minX + rng() * (maxX - minX); y = minY + rng() * (maxY - minY); } while (!inside(x, y));
    const angle = rng() * Math.PI * 2, extent = contactWidth * (.025 + rng() * .06);
    const dx = Math.cos(angle) * extent, dy = Math.sin(angle) * extent, pressure = .89 + rng() * .09;
    const edge = Math.min(1, edgeDistance(x, y) / (contactWidth * .34));
    const load = (.68 + .32 * (y - minY) / Math.max(1, maxY - minY)) * (.86 + rng() * .28);
    marks.push(c.stroke(`${id}-contact-${k}`, [[x - dx, y - dy, pressure], [x + dx, y + dy, pressure]],
      contactWidth * (.94 + rng() * .48), dryness * .35, opacity * .087 * load * Math.max(.025, edge),
      { axis: 'center', smoothing: 'linear', clip, ...(ink ? { ink } : {}) }));
  }
  return marks;
}
function striations(c, id = 'friction', count = 11, dark = false) {
  const rng = random(c.seed ^ hash(id));
  return Array.from({ length: count }, (_, i) => {
    const x = 172 + (i % 5) * 35 + rng() * 16, y = 113 + Math.floor(i / 5) * 43 + rng() * 13;
    return c.stroke(`${id}-${i}`, [[x, y, .3], [x + 5, y + 12, dark ? .96 : .82], [x + 18, y + 24, dark ? .82 : .56], [x + 23, y + 42, .15]],
      dark ? 6.3 + rng() * 3.1 : 2.1 + rng() * 1.7, dark ? .58 : .54, dark ? .96 : .65,
      { rhythm: 'hesitant', strength: .48, controls: [{ at: .12, inkLoad: .98 }, { at: .73, inkLoad: dark ? .8 : .48, dryness: dark ? .74 : .68 }] });
  });
}
function dot(c, id, x, y, length, width, dryness = .25, opacity = .8) {
  return c.stroke(id, [[x - length * .42, y - 1.8, .18], [x, y, .95], [x + length * .58, y + 1.2, .12]], width, dryness, opacity,
    { axis: 'side', entry: 'concealed', finish: 'open', strength: .32 });
}
function dots(c, id, anchors, { count = 5, spread = 20, width = 13, dryness = .25, opacity = .8 } = {}) {
  const rng = random(c.seed ^ hash(id)), result = [];
  anchors.forEach(([x, y], a) => {
    for (let j = 0; j < count + a % 2; j++) {
      const radius = Math.sqrt(-2 * Math.log(Math.max(.001, rng()))) * spread * .42, angle = rng() * Math.PI * 2;
      result.push(dot(c, `${id}-${a}-${j}`, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .52,
        10 + rng() * 13, width * (.6 + rng() * .6), dryness + rng() * .12, opacity * (.7 + rng() * .3)));
    }
  });
  return result;
}
function leaves(c, id = 'leaf') {
  const regions = [
    [[117, 175], [140, 114], [222, 73], [211, 135], [174, 168]],
    [[250, 165], [280, 92], [365, 61], [345, 125], [297, 161]],
    [[328, 180], [382, 157], [454, 179], [406, 215], [364, 209]],
  ];
  const veins = [
    [[117, 175, .35], [160, 140, .8], [222, 73, .12]],
    [[250, 165, .3], [299, 125, .7], [365, 61, .1]],
    [[328, 180, .3], [382, 185, .7], [454, 179, .1]],
  ];
  return { regions, veins: veins.map((p, i) => c.stroke(`${id}-vein-${i}`, p, 1.7, .4, .78)),
    edges: regions.map((p, i) => c.stroke(`${id}-edge-${i}`, [...p, p[0]].map(([x, y]) => [x, y, .7]), 1.55, .42, .74)),
    stem: c.stroke(`${id}-stem`, [[79, 218, .2], [160, 183, .85], [252, 165, .6], [328, 180, .3]], 3.5, .46, .85),
  };
}
function leafWashes(c, id, shapes, { fraction = 1, ...opts } = {}) {
  return shapes.flatMap((poly, i) => {
    const region = fraction === 1 ? poly : poly.map(([x, y], j) => j < 2 ? [x, y] : [x * fraction + poly[0][0] * (1 - fraction), y]);
    return regionRows(c, `${id}-${i}`, region, { width: 23, ...opts });
  });
}

function batch16(options) {
  const c = context(options), structure = outline(c), grain = striations(c, 'dry-focal', 12, true);
  const wash = regionRows(c, 'light-underpainting', ROCK, { width: 28, opacity: .65 });
  const fragments = [
    c.stroke('retained-dark-a', [[171, 174, .12], [187, 159, .92], [215, 157, .66], [227, 176, .1]], 20, .69, .95, { axis: 'side' }),
    c.stroke('retained-dark-b', [[275, 149, .15], [298, 145, .9], [328, 166, .66], [340, 184, .1]], 23, .65, .91, { axis: 'side' }),
    c.stroke('retained-dark-c', [[359, 190, .1], [389, 187, .94], [421, 207, .1]], 17, .72, .94, { axis: 'side' }),
  ];
  const paleTraces = [c.stroke('retained-pale-a', [[139, 180, .2], [170, 196, .86], [237, 192, .25]], 29, .16, .73, { axis: 'side' }),
    c.stroke('retained-pale-b', [[260, 165, .1], [315, 181, .88], [366, 197, .2]], 34, .19, .76, { axis: 'side' })];
  const waterAlong = [c.stroke('adjacent-clear-water', [[154, 196, .3], [225, 205, .85], [303, 199, .7], [373, 212, .2]], 26, .08, .9, { axis: 'side' })];
  const mass = regionRows(c, 'initial-ink-mass', [[89, 192], [145, 92], [213, 89], [280, 136], [342, 113], [432, 180], [471, 223], [127, 225]], { width: 38, opacity: .83, dryness: .18 });
  const secondMass = [c.stroke('directional-mass-a', [[183, 202, .1], [210, 131, .88], [265, 131, .8], [324, 196, .1]], 63, .12, .9, { axis: 'side' }),
    c.stroke('directional-mass-b', [[331, 202, .15], [367, 155, .85], [416, 181, .9], [455, 215, .1]], 42, .2, .88, { axis: 'side' })];
  return [
    study('scorched', '46 · 焦墨', ['ink-scorched'], '黑色面块 → 枯劲行线 → 湿底后局部干焦点醒。',
      '看高墨量是否仍有行笔、留纸与重点，第三列把焦笔放到结构节点。',
      '程邃作品与米氏分析支持局部用法；高浓度、低水和枯接触只是程序近似，不能把粗糙黑块当作焦墨已成立。', [
        variant('black-pad', '对照 · 满黑面块', c.ink([layer('flat-black', regionRows(c, 'solid-block', SHADE, { dryness: .03 }), .98, 0, .1)])),
        variant('dry-lines', '机制 · 干重线与留纸', c.ink([layer('dry-structure', [...outline(c, 'dry-outline', 5.4, .59), ...grain], .96, 0, .05)])),
        variant('focal', '组织 · 湿底后焦笔点醒', c.ink([layer('wet-base', wash, .16, 0, .8), layer('structure', structure, .62, 2.3, .08), layer('dry-focal', grain, .94, 4.7, .03)])),
      ]),
    study('aged', '47 · 宿墨 · 材料外观研究', ['ink-aged'], '均匀水墨 → 浓痕与旁侧淡水痕 → 分区点醒。',
      '比较浓墨保留、淡墨痕与邻接水迹，同时保留可辨认的结构。',
      '未模拟留置、脱胶、储存天数或真实沉淀；仅将部分支持的浓宿、淡宿观察线索拆开，不用纸张泛黄冒充宿墨。', [
        variant('uniform', '对照 · 均一湿墨', c.ink([layer('uniform-load', wash, .4, 0, .75)])),
        variant('material', '机制 · 浓痕 / 淡痕 / 清水', c.water([inkEvent('retained-dark', fragments, .88, 0, .25, 2), inkEvent('retained-pale', paleTraces, .17, .5, .85, 2), waterEvent('adjacent-water', waterAlong, 1.2, .65)])),
        variant('organized', '组织 · 山体暗处点醒', c.water([inkEvent('under-structure', structure, .57, 0, .06, .2), inkEvent('retained-pale', [...wash, ...paleTraces], .13, .7, .8, 2), inkEvent('retained-dark', fragments, .89, 1.4, .18, 1.2), waterEvent('adjacent-water', waterAlong, 1.7, .58)])),
      ]),
    study('splashed', '48 · 泼墨', ['ink-splashed'], '大面墨势未收拾 → 顺势选笔 → 多面墨势与勾染组织。',
      '分别看初始墨势、后续选择和可读形体。第三列收拾的线不沿墨团机械描一圈。',
      '初始面由调用者区域和宽笔路给出，未模拟倾倒、手布晕开或流体；保留史例支持的先布墨、再勾染关系。', [
        variant('unresolved', '对照 · 只有初始墨势', c.ink([layer('initial-mass', mass, .42, 0, .86, 2)])),
        variant('selected', '机制 · 顺墨势收拾', c.ink([layer('initial-mass', mass, .32, 0, .86, 2), layer('selected-contours', [structure[0], structure[2], ...grain.slice(0, 4)], .74, 3.2, .08)])),
        variant('organized', '组织 · 两层墨势 / 选择勾染', c.ink([layer('initial-mass', mass, .2, 0, .86, 2), layer('local-mass', secondMass, .46, .8, .8, 2, 'wet-mix'), layer('selected-contours', [...structure, ...grain.slice(3, 8)], .77, 3.6, .08)])),
      ]),
  ];
}

function batch17(options) {
  const c = context(options), structure = outline(c), texture = striations(c), local = regionRows(c, 'local-tone', SHADE, { width: 25, opacity: .68 });
  const backgroundLeft = [[43, 95], [77, 63], [122, 48], [165, 59], [146, 83], [112, 121], [90, 166], [81, 204], [49, 218], [42, 167]];
  const backgroundRight = [[266, 71], [329, 49], [401, 60], [466, 82], [513, 118], [515, 192], [490, 218], [460, 181], [388, 147], [338, 102], [279, 116]];
  // Only the inner mountain-facing edge is a deposit boundary. The outer cloud
  // fades through its authored contacts; no visible polygon cuts its perimeter.
  const leftClip = [[-120, -120], [213, -120], [167, 59], [146, 83], [112, 121], [90, 166], [81, 204], [49, 290], [-120, 350]];
  const rightClip = [[247, -120], [700, -120], [700, 350], [487, 350], [490, 218], [460, 181], [388, 147], [338, 102], [279, 116]];
  const around = [...regionRows(c, 'background-left', backgroundLeft, { width: 34, opacity: .75, clip: leftClip }), ...regionRows(c, 'background-right', backgroundRight, { width: 37, opacity: .65, clip: rightClip })];
  const flowers = (id, centers, outlined = false) => centers.flatMap(([x, y, scale], index) => {
    const hues = ['#a36555', '#b9806d', '#ba705b'];
    return [-2.55, -1.35, -.12, 1.05, 2.26].map((a, k) => {
      const dx = Math.cos(a), dy = Math.sin(a), length = (27 + (k % 2) * 8) * scale;
      return c.stroke(`${id}-${index}-${k}`, [[x + dx * length, y + dy * length, .08], [x + dx * length * .63 - dy * 3, y + dy * length * .63 + dx * 3, .9], [x + dx * 3, y + dy * 3, .45]],
        (outlined ? 16 : 22) * scale, .21 + k * .025, .66 + k * .035, { axis: 'side', ink: hues[(index + k) % hues.length], finish: 'open' });
    });
  });
  const floralStem = [c.stroke('flower-stem', [[133, 225, .2], [205, 177, .8], [270, 155, .65], [332, 83, .12]], 3.8, .5, .86, { ink: '#596044' }),
    c.stroke('flower-side-stem', [[238, 169, .3], [347, 168, .64], [415, 128, .1]], 2.8, .48, .8, { ink: '#596044' })];
  const foliage = [c.stroke('leaf-left', [[201, 182, .12], [175, 160, .95], [124, 151, .08]], 22, .37, .78, { axis: 'side', ink: '#67734f' }),
    c.stroke('leaf-right', [[281, 150, .18], [319, 126, .94], [377, 126, .08]], 25, .29, .76, { axis: 'side', ink: '#6d7856' }),
    c.stroke('leaf-low', [[319, 169, .14], [348, 191, .9], [409, 201, .08]], 24, .42, .8, { axis: 'side', ink: '#556948' })];
  const petals = flowers('flower', [[265, 151, 1.12], [332, 82, .82], [415, 127, .7]]);
  const centerMarks = [[265, 151], [332, 82], [415, 127]].flatMap(([x, y], i) => [dot(c, `calyx-${i}`, x, y + 4, 9, 6, .48, .85)]);
  const outlinePetal = c.stroke('independent-petal-outline', [[212, 122, .8], [213, 91, .8], [239, 71, .8], [266, 91, .8], [280, 65, .8], [313, 86, .8], [309, 119, .8], [333, 128, .8], [310, 162, .8], [273, 162, .8], [249, 179, .8], [216, 151, .8], [212, 122, .8]], 2.2, .3, .9);
  return [
    study('rendering', '49 · 渲染', ['ink-rendering'], '结构上全覆均灰 → 皴擦处局部略敷 → 局部与外围分工。',
      '染区须与已有皴擦和体面相连，线条在薄染后仍可读。第三列另外引入外围染区。',
      '采用故宫词条的具体渲/染区分；不是所有时代的唯一术语标准。区域笔路与湿态交换只提供视觉近似。', [
        variant('all-over', '对照 · 整体平均铺灰', c.ink([layer('structure', [...structure, ...texture], .57, 0, .06, .2), layer('blanket', regionRows(c, 'blanket', ROCK), .27, 1.5, .7)])),
        variant('local', '机制 · 皴擦处略敷', c.ink([layer('structure', [...structure, ...texture], .62, 0, .05, .2), layer('local-rendering', local, .2, 1.5, .75)])),
        variant('organized', '组织 · 局部 / 外围分别染', c.ink([layer('structure', [...structure, ...texture], .63, 0, .05, .2), layer('local-rendering', local, .23, 1.5, .73), layer('outside-rendering', around, .13, 3.4, .65)])),
      ]),
    study('background-wash', '50 · 烘染', ['ink-background-wash'], '主体上铺灰 → 主体周围染 → 远染 / 雪白 / 近景。',
      '同一山体保留纸白，背景与明亮主体相邻，第三列用前后浓淡组织空间。',
      '背景染区由作者避开主体，不用白色覆盖或擦除；馆藏雪景支持这种衬托关系，不代表一切云雾配方。', [
        variant('on-subject', '对照 · 灰色落在主体上', c.ink([layer('subject-gray', regionRows(c, 'subject', ROCK), .27, 0, .65), layer('structure', structure, .58, 2, .04)])),
        variant('around', '机制 · 外围染 / 留主体白', c.ink([layer('background-wash', around, .24, 0, .72), layer('structure', structure, .58, 2, .04)])),
        variant('organized', '组织 · 远染留白 / 近景重笔', c.ink([layer('background-wash', around, .23, 0, .72), layer('snow-structure', structure.slice(0, 3), .45, 2, .05), layer('foreground', [c.stroke('foreground-bank', [[65, 225, .1], [152, 212, .82], [222, 226, .7], [326, 231, .12]], 9, .78, .96), ...striations(c, 'foreground-rock', 5, true)], .86, 4, .04)])),
      ]),
    study('mogu', '51 · 没骨 · 设色造形', ['line-mogu'], '独立勾廓支架 → 色笔边缘造形 → 花叶枝的叠接。',
      '中、右列花瓣和叶面的色与空白承担轮廓，不依靠预先的闭合墨线。枝梗仍是物象自身的线。',
      '范围限于词条支持的直接设色。色笔叠接是程序近似，未宣称覆盖水墨没骨的全部历史范围。', [
        variant('outlined', '对照 · 独立墨廓支撑色面', c.groups([c.group('color', flowers('single', [[266, 123, 1.1]], true)), c.group('independent-outline', [outlinePetal], 'structure')])),
        variant('direct-color', '机制 · 色笔叠接 / 无独立墨廓', c.groups([c.group('direct-petals', flowers('direct', [[280, 134, 1.4]]))])),
        variant('organized', '组织 · 色花 / 叶面 / 枝梗', c.groups([c.group('stems', floralStem, 'structure'), c.group('direct-leaves', foliage, 'mark', 'stems'), c.group('direct-petals', petals, 'mark', 'stems'), c.group('calyx', centerMarks, 'mark', 'stems')])),
      ], [266, 150]),
  ];
}

function batch18(options) {
  const c = context(options), leaf = leaves(c), outlines = [leaf.stem, ...leaf.edges, ...leaf.veins];
  const flat = leafWashes(c, 'flat', leaf.regions), local = leafWashes(c, 'shadow', leaf.regions, { fraction: .48, dryness: .21, opacity: .78 });
  const push = leaf.veins.map((source, i) => ({ ...source, options: { ...source.options, id: `water-push-${i}`, width: 24, dryness: .04, opacity: .9 } }));
  const frontPaint = leafWashes(c, 'front-color', leaf.regions, { width: 21, dryness: .26, opacity: .39, ink: '#78835c' });
  const backing = leafWashes(c, 'back-white', leaf.regions, { width: 23, dryness: .08, opacity: .33, ink: '#e8ddba' });
  const shiftBack = backing.map(source => ({ ...source, points: source.points.map(p => ({ ...p, x: p.x + 29, y: p.y + 18 })),
    options: { ...source.options, clip: source.options.clip.map(p => ({ ...p, x: p.x + 29, y: p.y + 18 })) } }));
  const frontStructure = outlines.map(source => ({ ...source, options: { ...source.options, ink: '#596044', opacity: .77 } }));
  const supportDoc = (support, registered) => c.groups([
    ...(support ? [c.group(registered ? 'paper-back-registered' : 'paper-back-offset', support, 'mark', 'front-shape')] : []),
    c.group('front-color', frontPaint, 'mark', 'front-shape'), c.group('front-shape', frontStructure, 'structure'),
  ]);
  return [
    study('divided-wash', '52 · 分染', ['ink-divided-wash'], '平涂 → 局部暗笔与清水推染 → 分区再染。',
      '水笔沿叶片局部结构推开深浅，初始墨线干层不随水事件整体漂移。第三列只在暗面加深。',
      '借工笔花鸟两笔关系作单色结构实验；每个事件整组瞬时到达，湿窗不是实测半干时间，也不是完整连续运水。', [
        variant('flat', '对照 · 轮廓内平均平涂', c.water([inkEvent('dry-lines', outlines, .67, 0, .03, .2), inkEvent('flat-color', flat, .3, 1, .65, 1)])),
        variant('two-brush', '机制 · 局部施墨 / 清水推开', c.water([inkEvent('dry-lines', outlines, .67, 0, .03, .2), inkEvent('local-shadow', local, .35, 1, .77, 2), waterEvent('clear-push', push, 1.4, .76)])),
        variant('organized', '组织 · 两笔过渡 / 暗面复染', c.water([inkEvent('dry-lines', outlines, .67, 0, .03, .2), inkEvent('local-shadow', local, .27, 1, .77, 2), waterEvent('clear-push', push, 1.4, .76), inkEvent('local-second-pass', leafWashes(c, 'shadow-second', leaf.regions, { fraction: .31, dryness: .35 }), .23, 3.9, .24, .7)])),
      ], [299, 126]),
    study('glazing', '53 · 罩染 · 单色层次研究', ['ink-glazing'], '只有局部深浅 → 厚层盖平 → 薄层统一仍存结构。',
      '看已有线、局部深浅与统一层是否共存。中列故意过重，右列将薄罩放在已干结构之后。',
      '原证据主要是设色工笔，这里只借鉴先局部后整体的层次组织；单颜料光学密度不能替代实际罩色、颜料混色或胶性。', [
        variant('local-only', '对照 · 局部分染 / 未罩', c.ink([layer('dry-lines', outlines, .62, 0, .04, .2), layer('local-values', local, .29, .8, .55)])),
        variant('heavy', '反例 · 罩层过厚', c.ink([layer('dry-lines', outlines, .62, 0, .04, .2), layer('local-values', local, .29, .8, .55), layer('overall-glaze', flat, .53, 3.4, .5)])),
        variant('thin', '组织 · 已干局部 / 薄罩统一', c.ink([layer('dry-lines', outlines, .62, 0, .04, .2), layer('local-values', local, .29, .8, .55), layer('overall-glaze', flat, .11, 3.4, .5)])),
      ], [299, 126]),
    study('supporting-wash', '54 · 托 · 纸背透显近似', ['ink-supporting-wash'], '无背层 → 背层错位 → 对位背层衰减透显。',
      '纸背来源独立保存；中列故意错位，右列回到同一叶面并以较弱覆盖近似透显。',
      '这里只研究已核实的纸背托色分支。二维绘制顺序和0.33覆盖近似纸背位置与衰减，没有真实双面纸、散射、白粉光学或泛称“托”的统一实现。', [
        variant('unbacked', '对照 · 正面色层 / 无纸背层', supportDoc(null, false)),
        variant('misregistered', '变量 · 纸背层错位', supportDoc(shiftBack, false)),
        variant('registered', '组织 · 对位背层 / 衰减透显', supportDoc(backing, true)),
      ], [300, 125]),
  ];
}

function batch19(options) {
  const c = context(options), leaf = leaves(c), structure = [leaf.stem, ...leaf.veins];
  const pad = [c.stroke('ink-contact', [[170, 138, .25], [213, 140, .95], [261, 146, .7], [299, 154, .1]], 64, .16, .86, { axis: 'side' })];
  const held = [c.stroke('held-water-contact', [[207, 149, .55], [220, 154, .92], [239, 158, .65]], 41, .04, .95, { axis: 'side' })];
  const shapes = leafWashes(c, 'leaf-base', leaf.regions, { dryness: .18, opacity: .81 });
  const waterPaths = [c.stroke('leaf-water-a', [[154, 154, .25], [169, 139, .84], [191, 116, .32]], 28, .04, .95),
    c.stroke('leaf-water-b', [[286, 139, .3], [301, 124, .84], [327, 100, .25]], 30, .04, .95),
    c.stroke('leaf-water-c', [[365, 184, .2], [387, 189, .85], [417, 188, .15]], 23, .04, .95)];
  const texturedField = regionRows(c, 'wet-region', SHADE, { width: 30, dryness: .12, opacity: .8 });
  const scratches = striations(c, 'region-lines', 10, true);
  const irregularWater = [c.stroke('water-branch-a', [[220, 113, .2], [234, 140, .82], [262, 157, .67], [279, 190, .2]], 18, .04, .9),
    c.stroke('water-branch-b', [[296, 146, .2], [318, 161, .85], [359, 173, .5], [388, 199, .15]], 23, .04, .95)];
  return [
    study('soak', '55 · 渍水 · 接触停留研究', ['water-soak'], '低水接触 → 同区含水接触 → 分区水痕与墨痕。',
      '水源是短而非圆形的笔头接触，观察局部重分布与边缘变化，不以完整圆圈为标准。',
      '动作线索来自待复核教学汇编；程序用独立水接触与湿窗表达停留条件，不是连续逗留或传统渍水的已验证复现。', [
        variant('low-water', '对照 · 墨痕 / 低水接触', c.water([inkEvent('ink-load', pad, .57, 0, .2, 2), waterEvent('held-water', held, .65, .04)])),
        variant('held-contact', '机制 · 同区含水接触', c.water([inkEvent('ink-load', pad, .57, 0, .8, 2), waterEvent('held-water', held, .65, .92)])),
        variant('organized', '组织 · 分区停留 / 保留骨线', c.water([inkEvent('dry-structure', structure, .66, 0, .04, .2), inkEvent('leaf-ink', shapes, .34, .7, .8, 2.5), waterEvent('held-water', waterPaths, 1.45, .85)])),
      ], [227, 154]),
    study('collision', '56 · 撞水', ['water-collision'], '完全过湿窗再加水 → 湿窗内局部注水 → 依叶面向背组织。',
      '前两列初始墨区与水路径相同，只改加水时刻；第三列增加已干叶脉和暗面复笔。',
      '依据居廉作品解说的半干注少水关系；离散湿窗仅近似时机，不是真实半干状态、熟纸绢性或色墨流体，也不添加白色擦除。', [
        variant('late', '对照 · 已过湿窗 / 加水', c.water([inkEvent('leaf-ink', shapes, .42, 0, .8, 2), waterEvent('local-water', waterPaths, 3.1, .65)])),
        variant('in-window', '机制 · 湿窗内 / 同路局部加水', c.water([inkEvent('leaf-ink', shapes, .42, 0, .8, 2), waterEvent('local-water', waterPaths, 1.2, .65)])),
        variant('organized', '组织 · 叶面向背 / 局部注水', c.water([inkEvent('dry-structure', structure, .63, 0, .04, .2), inkEvent('leaf-ink', shapes, .36, .5, .8, 2), waterEvent('local-water', waterPaths, 1.7, .65), inkEvent('shaded-base', leafWashes(c, 'shaded-base', leaf.regions, { fraction: .3, dryness: .55 }), .18, 4, .09, .5)])),
      ], [301, 125]),
    study('water-texture-probe', '57 · 皴水待考 · 中性湿区纹理实验', ['water-texture'], '干底后添线 → 湿底内添线 → 湿底局部清水分区。',
      '只比较已知程序条件：干湿时序、不同方向的笔路和清水区。三列都可执行、可编辑。',
      '“皴水”只核实原刊列名，动作释义未确证。本图明确不是传统皴水实现，也没有为它指定外观标准。', [
        variant('dry-field', '中性对照 · 干底添线', c.water([inkEvent('region-base', texturedField, .24, 0, .7, 1), inkEvent('region-lines', scratches, .63, 2.2, .56, 1, 'wet-mix')])),
        variant('wet-lines', '中性机制 · 湿底添线', c.water([inkEvent('region-base', texturedField, .24, 0, .7, 2), inkEvent('region-lines', scratches, .63, .7, .56, 1, 'wet-mix')])),
        variant('wet-partition', '中性组织 · 湿区 / 清水 / 干线', c.water([inkEvent('region-base', texturedField, .27, 0, .8, 2.5), waterEvent('clear-partition', irregularWater, .8, .86), inkEvent('dry-structure', outline(c, 'neutral-outline'), .61, 3.8, .05)])),
      ]),
  ];
}

function scatterBundles(c, id, anchors, count = 7) {
  const rng = random(c.seed ^ hash(id));
  return anchors.flatMap(([x, y, dx, dy], a) => Array.from({ length: count }, (_, k) => {
    const offset = (k - (count - 1) / 2) * 2.4, drift = rng() * 5;
    return c.stroke(`${id}-${a}-${k}`, [[x + offset, y, .06], [x + dx * .27 + offset * .7, y + dy * .28 + drift, .75 + rng() * .2],
      [x + dx * .58 + offset * 1.2 + (k % 2 ? 4 : -3), y + dy * .62, .45 + rng() * .25], [x + dx + offset * 1.7, y + dy, .04]],
      1.3 + rng() * 2.7, .66 + rng() * .26, .57 + rng() * .34,
      { axis: k % 3 ? 'center' : 'side', rhythm: 'hesitant', strength: .6, controls: [{ at: .31, inkLoad: .95 }, { at: .77, inkLoad: .32, dryness: .91 }] });
  }));
}
function batch20(options) {
  const c = context(options);
  const rowDots = Array.from({ length: 21 }, (_, i) => dot(c, `uniform-dot-${i}`, 130 + i % 7 * 48, 102 + Math.floor(i / 7) * 46, 23, 13));
  const rearDots = dots(c, 'rear-wet-dots', [[163, 105], [192, 123], [231, 147]], { count: 5, spread: 31, width: 13, dryness: .12, opacity: .7 });
  const nearDots = dots(c, 'near-wet-dots', [[309, 146], [351, 163], [390, 193]], { count: 6, spread: 33, width: 18, dryness: .17, opacity: .87 });
  const frontDots = dots(c, 'dry-focal-dots', [[315, 177], [387, 208]], { count: 3, spread: 20, width: 11, dryness: .66, opacity: .95 });
  const wetDrag = [c.stroke('drag-upper', [[109, 170, .1], [174, 120, .9], [241, 136, .78], [292, 175, .1]], 42, .17, .86, { axis: 'side', drag: 'reverse', strength: .6 }),
    c.stroke('drag-lower', [[207, 210, .1], [281, 178, .88], [354, 182, .7], [438, 216, .1]], 37, .2, .8, { axis: 'side', drag: 'reverse', strength: .54 })];
  const draggingWater = [c.stroke('directional-clear-drag', [[146, 151, .1], [217, 156, .86], [278, 187, .65], [352, 205, .1]], 39, .04, .9, { axis: 'side' })];
  const field = regionRows(c, 'drag-field', ROCK, { width: 32, dryness: .14, opacity: .7 });
  const parallel = Array.from({ length: 20 }, (_, i) => c.stroke(`parallel-${i}`, [[138 + i * 11, 102, .2], [174 + i * 11, 202, .75]], 2.2, .78, .8));
  const bundles = scatterBundles(c, 'scatter-bundle', [[193, 92, 41, 94], [271, 132, 63, 71], [359, 159, 66, 58]]);
  const composite = [...scatterBundles(c, 'long-flow', [[155, 119, 27, 91], [213, 89, 39, 125]], 6),
    ...scatterBundles(c, 'cross-flow', [[280, 131, 65, 67], [352, 160, 86, 51]], 7),
    ...dots(c, 'aggregate-accents', [[218, 187], [331, 188]], { count: 3, spread: 17, dryness: .73, width: 10 })];
  return [
    study('midian', '58 · 米点皴', ['cun-midian'], '等距横点 → 含水横点分层相叠 → 远近点层与云气留白。',
      '点既可分辨又能积染成面；第三列两座点山之间留出空隙，远层轻小，近层重厚，局部干点醒。',
      '依据李流芳与米家词条的横点、叠点关系。点位和层级由作者给定，未以模糊或任意椭圆散布替代运笔。', [
        variant('grid', '对照 · 等距横点', c.ink([layer('regular-dots', rowDots, .48, 0, .45)])),
        variant('wet-tiers', '机制 · 横点相叠 / 两层', c.ink([layer('pale-tier', rearDots, .27, 0, .86, 2), layer('overlap-tier', nearDots, .47, .8, .83, 2, 'wet-mix')])),
        variant('organized', '组织 · 远近点山 / 云隙 / 焦点', c.ink([layer('rear-tier', rearDots, .19, 0, .87, 2), layer('near-tier', nearDots, .43, 2.7, .82, 1.7), layer('dry-focal', frontDots, .8, 5, .06)])),
      ], [341, 165]),
    study('tuoni-probe', '59 · 拖泥带水待考 · 中性水墨拖曳', ['cun-tuoni'], '待干后交叠 → 湿区拖曳与清水交界 → 墨势、拖曳、干笔分工。',
      '记录每次水墨的方向、湿窗与先后，观察虚实交界而不指定同名传统标准。',
      '故宫只确证米友仁的相关称谓，详细动作未核实。这里保留未定名拖曳实验，不将逆拖参数或任何湿边直接等同拖泥带水皴。', [
        variant('dry-overlap', '中性对照 · 已干底 / 拖笔', c.water([inkEvent('base-field', field, .19, 0, .6, 1), inkEvent('drag', wetDrag, .48, 2.2, .8, 1, 'wet-mix'), waterEvent('clear-drag', draggingWater, 2.5, .7)])),
        variant('wet-drag', '中性机制 · 湿底 / 拖笔 / 清水', c.water([inkEvent('base-field', field, .19, 0, .8, 2.5), inkEvent('drag', wetDrag, .48, .7, .8, 1.5, 'wet-mix'), waterEvent('clear-drag', draggingWater, 1.1, .7)])),
        variant('organized', '中性组织 · 墨势 / 交界 / 干线', c.water([inkEvent('base-field', field, .13, 0, .82, 2.5), inkEvent('drag', wetDrag, .4, .7, .8, 1.5, 'wet-mix'), waterEvent('clear-drag', draggingWater, 1.1, .7), inkEvent('dry-structure', [...outline(c), ...striations(c, 'dry-interrupt', 5, true)], .68, 4.1, .05)])),
      ]),
    study('baoshi-research', '60 · 抱石 · 散锋与山势研究', ['cun-baoshi'], '均匀平行丝 → 散锋束的聚散 → 多方向线面与墨层。',
      '束内路径、压力和枯润不同，束间跟随山体转向；第三列将长线、交线、聚区点和底墨分开保存。',
      '馆方支持破笔散锋、聚散分明与综合语汇。这里仅研究其中可描述的接触与组织，不能以散锋或噪声概括傅抱石个人风格。', [
        variant('parallel', '反例 · 均一平行刷丝', c.ink([layer('parallel-threads', parallel, .7, 0, .08)])),
        variant('bundles', '机制 · 三束散锋 / 压力与聚散', c.ink([layer('scattered-bundles', bundles, .78, 0, .06)])),
        variant('organized', '组织 · 山势线面 / 聚散 / 薄底', c.ink([layer('pale-mountain', regionRows(c, 'pale-mountain', ROCK, { dryness: .23 }), .13, 0, .72), layer('broken-structure', outline(c, 'broken-structure', 2.5, .8), .67, 2.6, .04), layer('integrated-groups', composite, .79, 4.8, .06)])),
      ]),
  ];
}

function batch21(options) {
  const c = context(options);
  const loop = (id, x, y, sx, sy) => c.stroke(id, [[x - sx, y, .7], [x - sx * .7, y - sy, .7], [x + sx * .5, y - sy, .7], [x + sx, y, .7], [x + sx * .3, y + sy, .7], [x - sx * .7, y + sy * .6, .7], [x - sx, y, .7]], 1.8, .25, .8);
  const closedLoops = [loop('loop-a', 178, 145, 58, 62), loop('loop-b', 284, 151, 55, 53), loop('loop-c', 393, 164, 51, 58)];
  const fineSkeleton = [
    c.stroke('open-ridge', [[125, 198, .12], [130, 137, .7], [156, 91, .58], [197, 72, .7], [227, 108, .1]], 1.8, .39, .87),
    c.stroke('open-right', [[239, 113, .14], [258, 145, .75], [249, 185, .62], [272, 210, .1]], 1.7, .42, .8),
    c.stroke('inner-rib-a', [[154, 123, .1], [188, 110, .68], [207, 133, .57], [201, 166, .1]], 1.4, .39, .83),
    c.stroke('inner-rib-b', [[140, 162, .14], [177, 159, .7], [197, 189, .1]], 1.4, .43, .8),
    c.stroke('base-rib', [[153, 202, .1], [191, 215, .67], [223, 204, .12]], 1.6, .4, .82),
  ];
  const smallRock = (id, dx, dy, scale) => fineSkeleton.map(source => ({ ...source, points: source.points.map(p => ({ ...p, x: 140 + (p.x - 140) * scale + dx, y: 90 + (p.y - 90) * scale + dy })), options: { ...source.options, id: `${id}-${source.options.id}`, width: source.options.width * (.8 + scale * .2) } }));
  const rounded = dots(c, 'rounded', [[160, 137], [245, 166], [340, 157], [407, 190]], { count: 4, width: 12, spread: 21, dryness: .22 });
  const nails = (id, anchors) => {
    const rng = random(c.seed ^ hash(id));
    return anchors.flatMap(([x, y, count], a) => Array.from({ length: count }, (_, i) => {
      const px = x + (rng() - .5) * 48, py = y + (rng() - .5) * 38, len = 12 + rng() * 15;
      return c.stroke(`${id}-${a}-${i}`, [[px, py, .95], [px + 2 + rng() * 3, py + 4, .85], [px + 6 + rng() * 5, py + len, .02]],
        8 + rng() * 6, .58 + rng() * .25, .83, { axis: 'side', smoothing: 'linear', entry: 'concealed', finish: 'open', strength: .48 });
    }));
  };
  const nailMarks = nails('nail', [[212, 142, 7], [310, 166, 8], [392, 201, 6]]);
  const branches = [c.stroke('tree-trunk', [[174, 231, .25], [218, 182, .9], [257, 149, .7], [284, 76, .12]], 5.4, .56, .88),
    c.stroke('branch-left', [[239, 163, .7], [198, 128, .55], [148, 113, .12]], 3.3, .58, .85),
    c.stroke('branch-right', [[257, 150, .65], [328, 132, .5], [376, 90, .1]], 3.2, .54, .82)];
  const anchors = [[148, 113], [284, 76], [376, 90], [328, 132]];
  const attachedLeafGroups = anchors.map(([x, y], i) => {
    const rng = random(c.seed ^ hash(`attached-${i}`));
    return Array.from({ length: 4 + i % 3 }, (_, k) => {
      const angle = (-2.9 + rng() * 2.6) + (i % 2 ? .3 : -.15), len = 18 + rng() * 21;
      return c.stroke(`attached-${i}-${k}`, [[x, y, .24], [x + Math.cos(angle) * len * .47, y + Math.sin(angle) * len * .47, .92], [x + Math.cos(angle) * len, y + Math.sin(angle) * len, .04]], 8 + rng() * 7, .31 + rng() * .3, .83, { axis: 'side', finish: 'open', strength: .3 });
    });
  });
  const triangularStamp = Array.from({ length: 4 }, (_, i) => [[166 + i * 65, 109], [153 + i * 65, 134], [180 + i * 65, 134]].map(([x, y], k) => dot(c, `stamp-${i}-${k}`, x, y, 11, 12, .2)));
  const ordinaryGroups = dots(c, 'ordinary-staggered', [[151, 121], [280, 81], [379, 105]], { count: 5, spread: 24, width: 12 });
  return [
    study('kulou-probe', '61 · 骷髅皴待考 · 细勾骨架研究', ['cun-kulou'], '重复闭环 → 细线骨架与疏处 → 小石组间的空隙。',
      '骨架为不等长细勾，局部密而留空；第三列错开石组尺度、位置和开口。',
      '仅有部分二手文字支持精细勾勒与密处有疏，未取得足够原书图版。这里不是骷髅图案，也不规定骨孔数量或宣称完成传统骷髅皴。', [
        variant('closed-loops', '对照 · 等强闭环 / 重复孔形', c.groups([c.group('uniform-contours', closedLoops, 'structure')])),
        variant('fine-skeleton', '中性机制 · 细勾骨架 / 开口疏处', c.groups([c.group('fine-skeleton', fineSkeleton, 'structure')])),
        variant('organized', '中性组织 · 大小石组 / 疏密空隙', c.groups([c.group('main-rock', fineSkeleton, 'structure'), c.group('right-rock', smallRock('right', 171, 34, .79), 'structure'), c.group('front-rock', smallRock('front', 90, 100, .45), 'structure')])),
      ], [189, 147]),
    study('dingtou', '62 · 钉头皴 · 教学近似', ['cun-dingtou'], '圆横点 → 方重头与提尖尾 → 暗面短皴 / 亮面留白。',
      '看单笔头尾势差、短小参差和依石面疏密。第三列先勾廓，再在暗面短皴，薄染联系。',
      '依据同一教学账号的两篇资料，尚无独立图版校核；不混同钉头鼠尾衣纹、豆瓣皴或雨点皴，也不以固定几何头形作历史定义。', [
        variant('round-dots', '对照 · 圆横点', c.groups([c.group('rounded-dots', rounded)])),
        variant('nail-marks', '机制 · 方重头 / 渐提尖尾', c.groups([c.group('nail-marks', nailMarks)])),
        variant('organized', '组织 · 勾廓 / 暗面短皴 / 淡染', c.ink([layer('stone-contour', outline(c, 'stone-contour', 2.5), .66, 0, .06, .4), layer('short-nails', nailMarks, .77, 1.3, .12), layer('light-shade', regionRows(c, 'light-shade', SHADE, { dryness: .24 }), .11, 3.5, .5)])),
      ], [310, 166]),
    study('pin-probe', '63 · 品字点待考 · 普通错位点叶组织', ['leaf-pin'], '固定三点图章反例 → 不等数错位点组 → 点叶根部附枝。',
      '中列只称普通点组；右列每叶根部与枝梗端点相接，组与组留出呼吸空间。',
      '公开课件只确证“品字点叶”名称，未核实图页、笔序或计数。这里明确不是品字点复现，不从“品”字强造三点规范，也不与攒三聚五合并。', [
        variant('fixed-triples', '反例 · 从字形猜固定三点图章', c.groups(triangularStamp.map((marks, i) => c.group(`triangle-stamp-${i}`, marks)))),
        variant('staggered', '中性机制 · 不等数错位点组', c.groups([c.group('ordinary-staggered-groups', ordinaryGroups)])),
        variant('attached', '中性组织 · 普通点叶附枝 / 留组间空隙', c.groups([c.group('branch-scaffold', branches, 'structure'), ...attachedLeafGroups.map((marks, i) => c.group(`ordinary-attached-${i}`, marks, 'mark', 'branch-scaffold'))])),
      ], [283, 83]),
  ];
}

const events = document => document.recipe.events ?? document.recipe.layers ?? [];
const allStrokes = document => document.recipe.groups?.flatMap(g => g.strokes) ?? events(document).flatMap(e => e.strokes ?? []);
const sourceId = source => source.id ?? source.options?.id;
const findVariant = (studies, studyId, variantId) => studies.find(s => s.id === studyId)?.variants.find(v => v.id === variantId)?.document;
const findEvent = (document, id) => events(document).find(e => e.id === id);
const check = (id, pass, detail) => ({ id, pass: !!pass, ...(detail ? { detail } : {}) });
function commonAudit(studies, expectedCount = 3) {
  return [check('three-distinct-variants-per-study', studies.length === expectedCount && studies.every(s => s.variants.length === 3 && new Set(s.variants.map(v => JSON.stringify(v.document.recipe))).size === 3)),
    check('editable-paths-and-pressure', studies.every(s => s.variants.every(v => allStrokes(v.document).length > 0 && allStrokes(v.document).every(source => source.points.length >= 2 && source.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.pressure)))))),
    check('stable-source-ids', studies.every(s => s.variants.every(v => allStrokes(v.document).every(source => typeof sourceId(source) === 'string' && sourceId(source).length > 0)))),
    check('canvas-and-completed-time', studies.every(s => s.variants.every(v => v.document.recipe.options.width === 560 && v.document.recipe.options.height === 260 && v.document.recipe.options.background === SIZE.background && events(v.document).every(e => (e.at ?? 0) <= 8) && allStrokes(v.document).every(source => (source.options?.start ?? 0) + (source.options?.duration ?? 0) <= 8)))),
  ];
}
function audit16(studies) {
  const focal = findVariant(studies, 'scorched', 'focal'), aged = findVariant(studies, 'aged', 'material'), splash = findVariant(studies, 'splashed', 'organized');
  return [check('dry-focal-after-wet-base', findEvent(focal, 'dry-focal')?.at > findEvent(focal, 'wet-base')?.at + findEvent(focal, 'wet-base')?.dryAfter && findEvent(focal, 'dry-focal')?.strokes.every(s => s.options.dryness >= .55 && s.options.width >= 6)),
    check('retained-ink-water-sources-independent', ['retained-dark', 'retained-pale', 'adjacent-water'].every(id => findEvent(aged, id)) && findEvent(aged, 'adjacent-water')?.kind === 'water' && findEvent(aged, 'retained-dark')?.concentration > findEvent(aged, 'retained-pale')?.concentration),
    check('splash-mass-precedes-selective-contours', findEvent(splash, 'initial-mass')?.at < findEvent(splash, 'local-mass')?.at && findEvent(splash, 'local-mass')?.at < findEvent(splash, 'selected-contours')?.at && findEvent(splash, 'initial-mass')?.strokes.some(s => s.options.clip?.length >= 6))];
}
function audit17(studies) {
  const rendering = findVariant(studies, 'rendering', 'organized'), background = findVariant(studies, 'background-wash', 'around'), mogu = findVariant(studies, 'mogu', 'organized');
  const backgroundClips = findEvent(background, 'background-wash')?.strokes.map(s => s.options.clip);
  return [check('separate-local-and-outer-rendering-regions', findEvent(rendering, 'local-rendering')?.strokes.every(s => s.options.clip?.length >= 3) && findEvent(rendering, 'outside-rendering')?.strokes.every(s => s.options.clip?.length >= 3) && JSON.stringify(findEvent(rendering, 'local-rendering')?.strokes[0].options.clip) !== JSON.stringify(findEvent(rendering, 'outside-rendering')?.strokes[0].options.clip)),
    check('background-is-two-authored-regions', new Set(backgroundClips?.map(p => JSON.stringify(p))).size === 2 && !findEvent(background, 'subject-gray')),
    check('direct-color-without-independent-petal-outline', mogu.recipe.groups.some(g => g.id === 'direct-petals') && !mogu.recipe.groups.some(g => g.id.includes('outline')) && mogu.recipe.groups.filter(g => g.id === 'direct-petals' || g.id === 'direct-leaves').every(g => g.parentId === 'stems' && g.strokes.every(s => s.options.ink !== SIZE.ink)))];
}
function audit18(studies) {
  const divided = findVariant(studies, 'divided-wash', 'organized'), heavy = findVariant(studies, 'glazing', 'heavy'), thin = findVariant(studies, 'glazing', 'thin');
  const registered = findVariant(studies, 'supporting-wash', 'registered'), offset = findVariant(studies, 'supporting-wash', 'misregistered');
  const support = registered.recipe.groups.find(g => g.id === 'paper-back-registered'), mis = offset.recipe.groups.find(g => g.id === 'paper-back-offset');
  return [check('local-ink-then-clear-push-before-second-pass', findEvent(divided, 'local-shadow')?.at < findEvent(divided, 'clear-push')?.at && findEvent(divided, 'clear-push')?.kind === 'water' && findEvent(divided, 'clear-push')?.at < findEvent(divided, 'local-second-pass')?.at),
    check('thin-glaze-retains-independent-local-sources', findEvent(thin, 'overall-glaze')?.concentration < findEvent(heavy, 'overall-glaze')?.concentration && JSON.stringify(findEvent(thin, 'local-values')) === JSON.stringify(findEvent(heavy, 'local-values')) && findEvent(thin, 'overall-glaze')?.at > findEvent(thin, 'local-values')?.at + findEvent(thin, 'local-values')?.dryAfter),
    check('back-source-position-and-attenuation-explicit', support?.parentId === 'front-shape' && registered.recipe.groups[0].id === support.id && support.strokes.every(s => s.options.opacity > 0 && s.options.opacity <= .33 * .22) && Math.abs(mis.strokes[0].points[0].x - support.strokes[0].points[0].x - 29) < 1e-8 && Math.abs(mis.strokes[0].points[0].y - support.strokes[0].points[0].y - 18) < 1e-8)];
}
function audit19(studies) {
  const low = findVariant(studies, 'soak', 'low-water'), held = findVariant(studies, 'soak', 'held-contact'), late = findVariant(studies, 'collision', 'late'), active = findVariant(studies, 'collision', 'in-window');
  const probe = studies.find(s => s.id === 'water-texture-probe');
  return [check('held-contact-is-authored-path-and-more-water', findEvent(held, 'held-water')?.water > findEvent(low, 'held-water')?.water && findEvent(held, 'held-water')?.strokes.every(s => s.points.length >= 3) && !findEvent(held, 'held-water')?.droplets),
    check('collision-changes-only-water-time', findEvent(late, 'local-water')?.at > findEvent(late, 'leaf-ink')?.at + findEvent(late, 'leaf-ink')?.dryAfter && findEvent(active, 'local-water')?.at < findEvent(active, 'leaf-ink')?.at + findEvent(active, 'leaf-ink')?.dryAfter && JSON.stringify(findEvent(late, 'leaf-ink')) === JSON.stringify(findEvent(active, 'leaf-ink')) && JSON.stringify(findEvent(late, 'local-water')?.strokes) === JSON.stringify(findEvent(active, 'local-water')?.strokes)),
    check('water-texture-explicitly-neutral-and-executable', probe?.title.includes('中性') && probe.limits.includes('不是传统皴水实现') && probe.variants.every(v => v.document.recipe.generator === 'water-event-process-v1'))];
}
function audit20(studies) {
  const midian = findVariant(studies, 'midian', 'organized'), tuoni = studies.find(s => s.id === 'tuoni-probe'), baoshi = findVariant(studies, 'baoshi-research', 'organized');
  const scattered = findEvent(baoshi, 'integrated-groups')?.strokes ?? [];
  return [check('horizontal-dot-tiers-and-later-dry-focal', ['rear-tier', 'near-tier', 'dry-focal'].every(id => findEvent(midian, id)) && findEvent(midian, 'rear-tier')?.concentration < findEvent(midian, 'near-tier')?.concentration && findEvent(midian, 'dry-focal')?.water < .1 && findEvent(midian, 'rear-tier')?.strokes.every(s => Math.abs(s.points.at(-1).x - s.points[0].x) > Math.abs(s.points.at(-1).y - s.points[0].y) * 2)),
    check('tuoni-remains-unnamed-directional-research', tuoni?.title.includes('中性') && tuoni.limits.includes('未定名') && findEvent(tuoni.variants[1].document, 'clear-drag')?.kind === 'water'),
    check('baoshi-multiple-flow-groups-over-independent-base', scattered.some(s => sourceId(s).startsWith('long-flow')) && scattered.some(s => sourceId(s).startsWith('cross-flow')) && scattered.some(s => sourceId(s).startsWith('aggregate-accents')) && new Set(scattered.map(s => s.options.width)).size > 10 && findEvent(baoshi, 'pale-mountain')?.at < findEvent(baoshi, 'integrated-groups')?.at)];
}
function audit21(studies) {
  const kulou = studies.find(s => s.id === 'kulou-probe'), nail = findVariant(studies, 'dingtou', 'nail-marks'), pin = studies.find(s => s.id === 'pin-probe');
  const tree = findVariant(studies, 'pin-probe', 'attached'), scaffold = tree.recipe.groups.find(g => g.id === 'branch-scaffold');
  const branchPoints = scaffold.strokes.flatMap(s => s.points);
  const attachments = tree.recipe.groups.filter(g => g.parentId === 'branch-scaffold');
  return [check('fine-skeleton-remains-open-and-limited', kulou?.limits.includes('不规定骨孔数量') && allStrokes(kulou.variants[1].document).every(s => Math.hypot(s.points.at(-1).x - s.points[0].x, s.points.at(-1).y - s.points[0].y) > 8 && s.options.width < 2)),
    check('short-nails-pressed-head-and-lifted-tail', allStrokes(nail).every(s => s.points[0].pressure >= .9 && s.points.at(-1).pressure <= .03 && s.options.axis === 'side')),
    check('ordinary-leaf-roots-meet-editable-branches', attachments.length === 4 && attachments.every(g => g.strokes.every(s => branchPoints.some(p => Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) < 1e-8)))),
    check('pin-name-not-used-as-fixed-count-rule', pin?.limits.includes('不是品字点复现') && new Set(attachments.map(g => g.strokes.length)).size > 1)];
}
const definitions = [
  [16, 'retained-scorched-splash', '焦墨 / 宿墨 / 泼墨', batch16, audit16],
  [17, 'render-background-mogu', '渲染 / 烘染 / 没骨', batch17, audit17],
  [18, 'divided-glazing-back', '分染 / 罩染 / 托', batch18, audit18],
  [19, 'contact-collision-probe', '渍水 / 撞水 / 皴水待考', batch19, audit19],
  [20, 'wet-dot-broken-research', '米点 / 拖泥带水待考 / 抱石研究', batch20, audit20],
  [21, 'fine-nail-leaf-research', '骷髅皴待考 / 钉头皴 / 品字点待考', batch21, audit21],
];
export const remainingInkBatches = Object.freeze(definitions.map(([number, id, title, make, audit]) => Object.freeze({
  number, id, title, layouts: LAYOUTS, layout: 'slope', make,
  audit(studies) { const checks = [...commonAudit(studies), ...audit(studies)]; return { ok: checks.every(item => item.pass), checks }; },
})));

/** The gallery can audit a single edited study without regenerating its siblings. */
export function auditRemainingInk(item) {
  const get = id => item.variants.find(v => v.id === id)?.document;
  const result = [];
  const add = (id, pass) => result.push(check(id, pass));
  switch (item.id) {
    case 'scorched': {
      const doc = get('focal'), base = findEvent(doc, 'wet-base'), focal = findEvent(doc, 'dry-focal');
      add('focal-dry-lines-after-wet-base', focal.at > base.at + base.dryAfter && focal.strokes.every(s => s.options.dryness >= .55 && s.options.width >= 6)); break;
    }
    case 'aged': {
      const doc = get('material');
      add('retained-dark-pale-and-clear-sources', findEvent(doc, 'retained-dark').concentration > findEvent(doc, 'retained-pale').concentration && findEvent(doc, 'adjacent-water').kind === 'water'); break;
    }
    case 'splashed': {
      const doc = get('organized');
      add('mass-then-selective-shaping', findEvent(doc, 'initial-mass').at < findEvent(doc, 'local-mass').at && findEvent(doc, 'local-mass').at < findEvent(doc, 'selected-contours').at); break;
    }
    case 'rendering': {
      const doc = get('organized'), a = findEvent(doc, 'local-rendering'), b = findEvent(doc, 'outside-rendering');
      add('local-and-outside-regions-independent', a.strokes.every(s => s.options.clip) && b.strokes.every(s => s.options.clip) && JSON.stringify(a.strokes[0].options.clip) !== JSON.stringify(b.strokes[0].options.clip)); break;
    }
    case 'background-wash': {
      const doc = get('around');
      add('two-background-regions-and-white-subject', new Set(findEvent(doc, 'background-wash').strokes.map(s => JSON.stringify(s.options.clip))).size === 2 && !findEvent(doc, 'subject-gray')); break;
    }
    case 'mogu': {
      const doc = get('organized');
      add('colored-shapes-without-independent-contour', doc.recipe.groups.some(g => g.id === 'direct-petals') && !doc.recipe.groups.some(g => g.id.includes('outline')) && doc.recipe.groups.filter(g => ['direct-leaves', 'direct-petals'].includes(g.id)).every(g => g.parentId === 'stems' && g.strokes.every(s => s.options.ink !== SIZE.ink))); break;
    }
    case 'divided-wash': {
      const doc = get('organized');
      add('local-shadow-clear-push-and-second-local-pass', findEvent(doc, 'clear-push').kind === 'water' && findEvent(doc, 'clear-push').at > findEvent(doc, 'local-shadow').at && findEvent(doc, 'clear-push').at < findEvent(doc, 'local-second-pass').at); break;
    }
    case 'glazing': {
      const thin = get('thin'), heavy = get('heavy');
      add('thin-and-heavy-glazes-share-local-values', findEvent(thin, 'overall-glaze').concentration < findEvent(heavy, 'overall-glaze').concentration && JSON.stringify(findEvent(thin, 'local-values')) === JSON.stringify(findEvent(heavy, 'local-values'))); break;
    }
    case 'supporting-wash': {
      const doc = get('registered'), back = doc.recipe.groups[0], offset = get('misregistered').recipe.groups[0];
      add('registered-back-source-is-attenuated-and-editable', back.id === 'paper-back-registered' && back.parentId === 'front-shape' && back.strokes.every(s => s.options.opacity > 0 && s.options.opacity <= .33 * .22) && Math.abs(offset.strokes[0].points[0].x - back.strokes[0].points[0].x - 29) < 1e-8); break;
    }
    case 'soak': {
      const a = findEvent(get('low-water'), 'held-water'), b = findEvent(get('held-contact'), 'held-water');
      add('same-held-path-with-more-clear-water', b.kind === 'water' && b.water > a.water && JSON.stringify(a.strokes) === JSON.stringify(b.strokes)); break;
    }
    case 'collision': {
      const a = get('late'), b = get('in-window'), base = findEvent(a, 'leaf-ink');
      add('same-ink-and-water-paths-different-wet-time', JSON.stringify(base) === JSON.stringify(findEvent(b, 'leaf-ink')) && JSON.stringify(findEvent(a, 'local-water').strokes) === JSON.stringify(findEvent(b, 'local-water').strokes) && findEvent(a, 'local-water').at > base.at + base.dryAfter && findEvent(b, 'local-water').at < base.at + base.dryAfter); break;
    }
    case 'water-texture-probe': add('neutral-probe-not-traditional-water-texture', item.title.includes('中性') && item.limits.includes('不是传统皴水实现') && item.variants.every(v => v.document.recipe.generator === 'water-event-process-v1')); break;
    case 'midian': {
      const doc = get('organized');
      add('layered-horizontal-dots-and-dry-focal', findEvent(doc, 'rear-tier').concentration < findEvent(doc, 'near-tier').concentration && findEvent(doc, 'dry-focal').water < .1 && findEvent(doc, 'rear-tier').strokes.every(s => Math.abs(s.points.at(-1).x - s.points[0].x) > 2 * Math.abs(s.points.at(-1).y - s.points[0].y))); break;
    }
    case 'tuoni-probe': add('unnamed-wet-drag-research', item.title.includes('中性') && item.limits.includes('未定名') && findEvent(get('wet-drag'), 'clear-drag').kind === 'water'); break;
    case 'baoshi-research': {
      const doc = get('organized'), marks = findEvent(doc, 'integrated-groups').strokes;
      add('different-flow-bundles-and-aggregate-accents', ['long-flow', 'cross-flow', 'aggregate-accents'].every(prefix => marks.some(s => sourceId(s).startsWith(prefix))) && new Set(marks.map(s => s.options.width)).size > 10); break;
    }
    case 'kulou-probe': add('open-fine-contours-without-canonical-holes', item.limits.includes('不规定骨孔数量') && allStrokes(get('fine-skeleton')).every(s => s.options.width < 2 && Math.hypot(s.points.at(-1).x - s.points[0].x, s.points.at(-1).y - s.points[0].y) > 8)); break;
    case 'dingtou': add('pressed-head-and-lifted-tail', allStrokes(get('nail-marks')).every(s => s.points[0].pressure >= .9 && s.points.at(-1).pressure <= .03 && s.options.axis === 'side')); break;
    case 'pin-probe': {
      const groups = get('attached').recipe.groups, scaffold = groups.find(g => g.id === 'branch-scaffold').strokes.flatMap(s => s.points), attached = groups.filter(g => g.parentId === 'branch-scaffold');
      add('ordinary-leaf-roots-attach-to-branches', item.limits.includes('不是品字点复现') && new Set(attached.map(g => g.strokes.length)).size > 1 && attached.every(g => g.strokes.every(s => scaffold.some(p => Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) < 1e-8)))); break;
    }
    default: add('known-remaining-ink-study', false);
  }
  const checks = [...commonAudit([item], 1), ...result];
  return { ok: checks.every(entry => entry.pass), checks };
}
