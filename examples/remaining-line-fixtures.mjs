import { createStrokeGroupDocument } from '../dist/index.js';
import { authoredPathTexture } from './authored-study-path.mjs';

const size = Object.freeze({ width: 560, height: 260, background: '#f5f2e9', ink: '#252820' });
const layouts = Object.freeze(['slope', 'arc', 'fold']);
const cache = new Map();
const mix = (a, b, t) => a * (1 - t) + b * t;
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;
const point = ([x, y], pressure = 1) => ({ x, y, pressure });

// Original cloth objects. Layout changes the supports, sag, hem and force paths;
// these are three authored drapes, rather than rotations of one line specimen.
const drapes = {
  slope: {
    supports: [[138, 54], [418, 91]],
    edges: [
      [[138, 54], [220, 79], [270, 120], [337, 106], [418, 91]],
      [[138, 54], [124, 106], [103, 165], [131, 222]],
      [[418, 91], [443, 133], [475, 175], [459, 224]],
      [[131, 222], [211, 210], [280, 235], [367, 213], [459, 224]],
    ],
    fans: [
      [[138, 54], [144, 101], [151, 165], [171, 213]],
      [[138, 54], [179, 91], [184, 163], [214, 215]],
      [[138, 54], [210, 87], [231, 160], [261, 224]],
      [[138, 54], [244, 88], [272, 147], [303, 221]],
      [[418, 91], [369, 114], [303, 152], [285, 228]],
      [[418, 91], [398, 123], [355, 181], [339, 218]],
      [[418, 91], [430, 130], [402, 175], [394, 215]],
      [[418, 91], [448, 126], [456, 181], [441, 220]],
    ],
  },
  arc: {
    supports: [[205, 58], [354, 59]],
    edges: [
      [[205, 58], [240, 84], [283, 105], [322, 83], [354, 59]],
      [[205, 58], [146, 108], [108, 180], [170, 225]],
      [[354, 59], [411, 111], [461, 181], [397, 230]],
      [[170, 225], [235, 207], [285, 236], [342, 212], [397, 230]],
    ],
    fans: [
      [[205, 58], [160, 110], [137, 161], [166, 210]],
      [[205, 58], [185, 113], [176, 170], [209, 215]],
      [[205, 58], [218, 122], [224, 174], [259, 225]],
      [[205, 58], [246, 116], [271, 166], [289, 228]],
      [[354, 59], [315, 113], [287, 178], [307, 227]],
      [[354, 59], [345, 119], [332, 171], [350, 218]],
      [[354, 59], [378, 119], [392, 177], [389, 215]],
      [[354, 59], [413, 110], [441, 179], [417, 211]],
    ],
  },
  fold: {
    supports: [[190, 56], [348, 111]],
    edges: [
      [[190, 56], [270, 65], [310, 89], [348, 111], [457, 142]],
      [[190, 56], [147, 102], [111, 145], [182, 209]],
      [[457, 142], [452, 184], [432, 223]],
      [[182, 209], [246, 217], [302, 231], [367, 213], [432, 223]],
    ],
    fans: [
      [[190, 56], [160, 104], [140, 145], [191, 204]],
      [[190, 56], [184, 114], [178, 155], [234, 211]],
      [[190, 56], [218, 117], [218, 166], [273, 222]],
      [[190, 56], [253, 117], [264, 163], [309, 225]],
      [[348, 111], [304, 123], [299, 177], [330, 221]],
      [[348, 111], [338, 138], [348, 181], [366, 211]],
      [[348, 111], [375, 137], [388, 174], [400, 214]],
      [[348, 111], [410, 140], [431, 173], [426, 215]],
    ],
  },
};

function cubic(values, count = 28) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, s = 1 - t;
    return { x: values[0][0] * s ** 3 + values[1][0] * 3 * s * s * t + values[2][0] * 3 * s * t * t + values[3][0] * t ** 3,
      y: values[0][1] * s ** 3 + values[1][1] * 3 * s * s * t + values[2][1] * 3 * s * t * t + values[3][1] * t ** 3 };
  });
}
function at(points, t) {
  const position = Math.max(0, Math.min(1, t)) * (points.length - 1), index = Math.min(points.length - 2, Math.floor(position));
  return { x: mix(points[index].x, points[index + 1].x, position - index), y: mix(points[index].y, points[index + 1].y, position - index) };
}
function portion(points, from, to) {
  const first = Math.floor(from * (points.length - 1)) + 1, last = Math.ceil(to * (points.length - 1));
  return [at(points, from), ...points.slice(first, last), at(points, to)];
}
const profile = (kind, t, i) => {
  const wave = Math.sin(Math.PI * t);
  if (kind === 'thread') return .65 + wave * .22;
  if (kind === 'taut') return .72 + wave * .19;
  if (kind === 'wire' || kind === 'round') return .76 + wave * .19;
  if (kind === 'nail') return t < .14 ? mix(.72, 1, t / .14) : mix(1, .025, ((t - .14) / .86) ** .65);
  if (kind === 'blunt') return t < .25 ? .85 : mix(.96, .35, (t - .25) / .75);
  if (kind === 'almond') return .045 + .94 * Math.exp(-(((t - [.41, .53, .46][i % 3]) / .25) ** 2));
  if (kind === 'reed') return .1 + .8 * wave ** .5;
  if (kind === 'dry') return .38 + .56 * wave ** .65;
  return .06 + .9 * wave ** (kind === 'willow' ? 1.2 : .7);
};
const sourceLength = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);

const definitions = [
  { id: 'hun', title: '混描候选', ids: ['line-hun'], kind: 'mixed', width: 3.2,
    feature: '淡线先定褶骨，再只在受力和背折处浓墨醒线，末列另用淡宽笔接成局部墨面。',
    limits: '部分支持：采用现代教学的淡勾、浓醒与线面衔接解释；古诀短注未校定，不将本候选视为完整传统混描。' },
  { id: 'baimiao', title: '白描', ids: ['line-baimiao'], kind: 'plain', width: 2.8,
    feature: '同一布褶只以墨线交代支撑、重力和前后；主线承力，次线轻收，空白保留体面。',
    limits: '明确支持墨线造形且不施彩色；这是原创布褶替代物的造形研究，不代表所有人物、花鸟白描。' },
  { id: 'jianbi', title: '减笔描', ids: ['line-jianbi'], kind: 'sparse', width: 5.7,
    feature: '按作者判断保留两端支撑、中心垂势和转面，仅省略次要褶线；组合列以少量辅笔接合姿态。',
    limits: '明确支持疏体和概括对象；省略由作者指定，不由随机删笔、采样稀疏或加速播放决定，艺术可读性待评。' },
  { id: 'yousi', title: '高古游丝描', ids: ['line-gaogu-yousi'], kind: 'thread', width: 1.9,
    feature: '细而连贯的中锋沿长弯承接，小幅提按保持圆匀；末列在拉紧与垂落处安排细密和空隙。',
    limits: '馆方文字明确支持中锋笔尖圆匀细描；仅作布褶长线研究，不以一根矢量细线宣称游丝全义。' },
  { id: 'qinxian', title: '琴弦描候选', ids: ['line-qinxian'], kind: 'taut', width: 2.7,
    feature: '缩小无关摆动，使长褶从支撑向下拉紧；保留顺物象的少量弯曲，组合列强调长短张力。',
    limits: '部分支持：平直挺拔与韧性来自现代转载；古诀画家比拟不提供统一等宽或绝对直线规则。' },
  { id: 'tiexian', title: '铁线描', ids: ['line-tiexian'], kind: 'wire', width: 3.5,
    feature: '中锋较稳地承墨，圆转及曲折处保持宽度和骨力，主次线共同解释布褶的挺折。',
    limits: '馆方文字支持中锋圆劲，未规定处处等宽；不以多沟槽金属线缆材质代替笔线。' },
  { id: 'xingyun', title: '行云流水描候选', ids: ['line-xingyun-liushui'], kind: 'flow', width: 3.4,
    feature: '支撑附近收束、下部舒展，长线在整组流向中有起倒；组合列让次线承接主势而不等距成波。',
    limits: '部分支持：现代释义与二手古文引句限定范围；不是所有平滑、弯曲或正弦笔路都叫行云流水。' },
  { id: 'qiuyin', title: '蚯蚓描候选', ids: ['line-qiuyin'], kind: 'round', width: 3.9,
    feature: '以较圆浑的接触连续转向，布褶回转仍相互牵引；宽度守住限度，避免虫形管状印章。',
    limits: '部分支持：采用现代教学的篆书圆匀解释；正式十八描词条仅列名，不裁定古法唯一曲线。' },
  { id: 'caoyi', title: '曹衣描的限定候选', ids: ['line-caoyi'], kind: 'dense', width: 2.1,
    feature: '以布面曲面作贴体衣褶替代物：支撑处较紧密，转面随体收束，下部留出非等宽通道。',
    limits: '存在异说：古诀转载与现代教材的历史人物归属不一；这里只采用注明来源的贴体稠密解释，不是三维人体、真实湿衣或通用曹衣笔刷。' },
  { id: 'mahuang', title: '马蝗描', ids: ['line-mahuang'], kind: 'short', width: 4.8,
    feature: '短促提按沿既有褶骨断续承接，中段有起伏而不肥钝；长短、曲势和留空共同交代衣纹。',
    limits: '馆方马和之语境支持短促迅疾与兰叶描变化；不将所有兰叶线同名，也不据现代归属概括各时代。' },
  { id: 'dingtou-shuwei', title: '钉头鼠尾描', ids: ['line-dingtou-shuwei'], kind: 'nail', width: 5.2,
    feature: '在褶纹的受力起端先按顿，再沿同一走势渐提尖收；头部尺度随结构改变，避免平均盖黑点。',
    limits: '馆方有起笔顿挫、收笔尖细的直接释义；这里只研究布褶候选，不扩成所有书画起收。' },
  { id: 'juetou', title: '撅头钉描候选', ids: ['line-juetou'], kind: 'blunt', width: 5.6,
    feature: '短而壮的钝起与中段强转向相接，尾部略收；局部方折由布褶支点决定，不只是截断尖尾线。',
    limits: '部分支持：古诀短注只支持秃笔，较完整形态来自现代教学；橛头丁、橛头钉等写法保留，不裁定归属。' },
  { id: 'ganlan-zaohe', title: '橄榄／枣核同题候选', ids: ['line-ganlan', 'line-zaohe'], kind: 'almond', width: 6.3,
    feature: '同一褶骨上比较两端收束、偏置压力峰和中段转折；组合列把长短和宽窄交错安排，保留共同形态。',
    limits: '两项均部分支持且形态有交叉；逐名保留阅读依据，不设置互斥长宽比、唯一枣核曲线或传统分类阈值。' },
  { id: 'liuye', title: '柳叶描候选', ids: ['line-liuye'], kind: 'willow', width: 4.6,
    feature: '轻入、局部按开、顺褶提收，较长与较短线在受力方向上相应；中段宽面不变成植物叶贴片。',
    limits: '部分支持：采用现代教学的轻盈叶形比喻；柳、兰、竹叶名称交叉，不以单一宽度或长度作历史判界。' },
  { id: 'zhuye', title: '衣纹竹叶描候选', ids: ['line-zhuye'], kind: 'bamboo', width: 6.7,
    feature: '短促偏侧撇捺沿布褶的支点和转向按开提出，数笔有向背与空隙，群内宽短不一。',
    limits: '部分支持：古诀“肥短撇捺”及现代教学限定候选；这是衣纹，不继承第十二批植物竹叶的组织或视觉结论。' },
  { id: 'zhelu', title: '折芦描候选', ids: ['line-zhelu'], kind: 'reed', width: 3.9,
    feature: '细入细收，布褶硬折处局部加按换向；棱角与前后长段接成一势，不把所有采样节点折尖。',
    limits: '部分支持：古诀转载和现代释义限定长笔、细端与折处关系；未复原人物用腕，不规定统一折角。' },
  { id: 'zhanbi', title: '战笔水纹描', ids: ['line-zhanbi-shuiwen'], kind: 'tremor', width: 2.8,
    feature: '保留主褶方向，在有限局部加入固定作者键的相关细屈曲；缩略观看仍须读出支撑和垂势。',
    limits: '馆方说明瘦硬战掣与颤动屈曲；有界作者扰动只是候选，不是无向白噪声、周期波纹或完整传统用腕。' },
  { id: 'kuchai', title: '枯柴描候选', ids: ['line-kuchai'], kind: 'dry', width: 7.5,
    feature: '以少量较宽干侧笔沿主褶顿挫，聚束和断白相间；末列保留实墨骨与空白使苍涩仍有结构。',
    limits: '部分支持：古诀粗大减笔及现代渴笔偏侧解释；人物衣褶另作研究，不继承乱柴皴、基础枯笔的艺术结论。' },
];

function geometry(definition, drape, layout) {
  const kind = definition.kind;
  let selected = kind === 'sparse' ? [0, 3, 4, 7] : kind === 'dry' ? [0, 2, 4, 5, 7] : kind === 'taut' ? [0, 1, 3, 4, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  let fans = selected.map(i => drape.fans[i].map(p => p.slice()));
  if (kind === 'dense') fans = [0, 1].flatMap(side => Array.from({ length: 7 }, (_, i) => {
    const u = i / 6 * 3, a = Math.min(2, Math.floor(u)), t = u - a;
    return drape.fans[side * 4 + a].map((p, v) => p.map((n, axis) => mix(n, drape.fans[side * 4 + a + 1][v][axis], t)));
  }));
  return fans.map((fan, i) => {
    if (kind === 'taut') for (let j = 1; j < 3; j++) fan[j] = fan[j].map((n, axis) => mix(n, mix(fan[0][axis], fan[3][axis], j / 3), .73));
    if (kind === 'flow') {
      fan[1][0] += [17, -12, 21, -9][i % 4]; fan[2][0] -= [12, 19, 7][i % 3];
      fan[1][1] += 8; fan[2][1] -= 10;
    }
    let points = cubic(fan);
    if (kind === 'reed' || kind === 'blunt') {
      points = [at(points, 0), at(points, .29), at(points, .63), at(points, 1)];
      points[1].x += i % 2 ? -10 : 13; points[2].x += i % 2 ? 8 : -6;
    }
    if (kind === 'tremor') points = authoredPathTexture(points.map(p => [p.x, p.y, 1]), `cloth-${layout}-${i}`, {
      step: 3.4, amplitude: .95,
    }).map(([x, y]) => ({ x, y }));
    return points;
  });
}

function makeDocument(definition, { seed, layout }, stage) {
  const key = `${definition.id}/${seed}/${layout}/${stage}`;
  if (cache.has(key)) return cache.get(key);
  const drape = drapes[layout], kind = definition.kind, groups = [];
  let order = 0;
  const stroke = (id, points, width, options = {}) => ({ id, points,
    options: { width, opacity: .76, dryness: .24, smoothing: 'linear', entry: 'preserve', finish: 'preserve',
      pressureProfile: 'preserve', turn: 'preserve', start: order++ * .055, duration: .38, ...options } });
  const outlines = drape.edges.map((edge, i) => stroke(`edge-${i}`, edge.map((p, j) => point(p, [.4, .7, .55, .6, .3][j])),
    kind === 'sparse' && stage > 0 ? 2.5 : 1.65, { opacity: stage === 0 ? .38 : stage === 1 ? .52 : .62, smoothing: 'catmull-rom' }));
  // Small support contacts belong to the object, not UI labels or hidden pins.
  for (const [i, p] of drape.supports.entries()) outlines.push(stroke(`support-${i}`,
    [point(p, .7), point([p[0] + 2.2, p[1] + 2.8], 1), point([p[0] + 3.5, p[1] + 4], .2)], 3.4, { opacity: .76 }));
  groups.push({ id: 'cloth', role: 'structure', strokes: outlines });
  if (stage === 0) {
    for (let i = 0; i < 8; i++) groups.push({ id: `parallel-${i}`, role: 'mark', parentId: 'cloth', strokes: [stroke('line',
      [{ x: 174 + i * 26, y: 111, pressure: 1 }, { x: 174 + i * 26, y: 198, pressure: 1 }], 2.8,
      { opacity: .72, dryness: .12, controls: [{ at: 0, side: 0 }, { at: 1, side: 0 }] })] });
  } else {
    const curves = geometry(definition, drape, layout);
    const rearIndices = [1, curves.length - 2], crossings = rearIndices.map(i => at(curves[i], .53));
    if (kind === 'mixed' && stage === 2) for (const i of [1, 4, 6]) groups.push({ id: `soft-plane-${i}`, role: 'mark', parentId: `fold-${i}`,
      strokes: [stroke('soft-plane', portion(curves[i], .22, .83).map((p, j, list) => ({ ...p, pressure: .25 + .45 * Math.sin(Math.PI * j / (list.length - 1)) })),
        24 + i, { opacity: .12, dryness: .12, axis: 'side', controls: [{ at: 0, side: .75, inkLoad: .42 }, { at: 1, side: .55, inkLoad: .3 }] })] });
    for (const [i, curve] of curves.entries()) {
      const baseIntervals = ['short', 'nail', 'blunt', 'bamboo'].includes(kind) ? [[0, .2], [.28, .47], [.64, .82], [.88, 1]]
        : kind === 'almond' ? [[0, .34], [.42, .76], [.83, 1]] : kind === 'willow' ? [[0, .48], [.6, 1]] : [[0, 1]];
      const visible = rearIndices.includes(i) ? [[0, .46], [.6, 1]] : [[0, 1]];
      const intervals = baseIntervals.flatMap(([lo, hi]) => visible.map(([from, to]) => [Math.max(lo, from), Math.min(hi, to)]))
        .filter(([from, to]) => to - from > .025);
      const prominent = [0, Math.floor(curves.length / 2), curves.length - 2].includes(i);
      const side = ['bamboo', 'dry'].includes(kind) ? .68 : kind === 'blunt' ? .38 : .06;
      const strokes = intervals.map(([from, to], p) => {
        const values = portion(curve, from, to).map((value, j, list) => ({ ...value, pressure: profile(kind, j / (list.length - 1), i) }));
        const width = definition.width * [1, .84, 1.12, .92][i % 4] * (stage === 2 ? prominent ? 1.08 : .83 : 1);
        return stroke(`part-${p}`, values, width, { axis: side > .3 ? 'side' : 'center',
          dryness: kind === 'dry' ? .8 : ['wire', 'round', 'thread'].includes(kind) ? .12 : .26,
          opacity: kind === 'mixed' ? .32 : stage === 2 ? prominent ? .88 : .63 : .78,
          controls: [{ at: 0, side, angle: 1.3, inkLoad: kind === 'dry' ? .82 : 1 },
            { at: .38, side: Math.min(.95, side + .1), angle: 1.55 }, { at: 1, side: side * .6, angle: 1.4, inkLoad: kind === 'dry' ? .65 : .94 }] });
      });
      groups.push({ id: `fold-${i}`, role: 'mark', parentId: 'cloth', strokes });
    }
    if (stage === 2 && kind !== 'dense') {
      const parents = groups.filter(group => group.id.startsWith('fold-'));
      const selected = kind === 'sparse' || kind === 'dry' ? [0, 2] : [0, 2, 4, 6];
      for (const n of selected.filter(n => n < parents.length)) {
        const parent = parents[n], source = parent.strokes[0].points;
        const root = source[Math.max(1, Math.floor((source.length - 1) * .45))], tail = source.at(-1);
        const dx = tail.x - root.x, dy = tail.y - root.y, length = Math.hypot(dx, dy) || 1;
        const tip = { x: root.x + dx * .64 - dy / length * 11, y: root.y + dy * .64 + dx / length * 11 };
        groups.push({ id: `secondary-${n}`, role: 'mark', parentId: parent.id, strokes: [stroke('minor',
          [{ ...root, pressure: .2 }, { x: mix(root.x, tip.x, .38) - 3, y: mix(root.y, tip.y, .38), pressure: .65 }, { ...tip, pressure: .06 }],
          definition.width * .62, { opacity: .48, dryness: kind === 'dry' ? .72 : .28,
            controls: [{ at: 0, side: .1, inkLoad: .82 }, { at: 1, side: .04, inkLoad: .68 }] })] });
      }
    }
    if (kind === 'mixed') {
      for (const i of stage === 1 ? [1, 4] : [0, 3, 5]) groups.push({ id: `awake-${i}`, role: 'mark', parentId: `fold-${i}`,
        strokes: [stroke('wake', portion(curves[i], .08, rearIndices.includes(i) ? .42 : .79)
          .map((p, j, list) => ({ ...p, pressure: .22 + .7 * Math.sin(Math.PI * j / (list.length - 1)) })),
        3.2 + i * .08, { opacity: .82, dryness: .35, controls: [{ at: 0, side: .1, inkLoad: .96 }, { at: 1, side: .05, inkLoad: .86 }] })] });
    }
    // The rear source segments stop on either side of this authored front fold.
    // Nothing is filled white, and moving a group does not repair occlusion.
    crossings.sort((a, b) => a.x - b.x);
    const first = crossings[0], last = crossings.at(-1);
    groups.push({ id: 'front-fold', role: 'mark', parentId: 'cloth', strokes: [stroke('ridge',
      [{ x: first.x - 21, y: first.y - 5, pressure: .08 }, ...crossings.map(p => ({ ...p, pressure: .72 })),
        { x: last.x + 22, y: last.y + 5, pressure: .08 }], stage === 2 ? 3.2 : 2.5,
      { opacity: stage === 2 ? .86 : .74, smoothing: 'catmull-rom' })] });
  }
  const result = createStrokeGroupDocument(groups, { ...size, seed, strokeWidth: 3, dryness: .28, opacity: .78 });
  cache.set(key, result);
  if (cache.size > 256) cache.delete(cache.keys().next().value);
  return result;
}

function study(definition, number, inputs) {
  return { id: definition.id, title: `${number} · ${definition.title}`, techniqueIds: definition.ids,
    variable: '同一原创布褶：无视支撑的平行线反例 → 受力方向与本项笔性 → 主次、辅褶与显式前后。组织与接触同时改变，非单变量。',
    criteria: definition.feature,
    limits: `${definition.limits} 三布局分别为斜向双支撑、拱形收束和折肘承托；只是二维布褶替代物，不自动求解人体、材料受力或遮挡。移动后由调用者重设计交接，艺术待统一评价。`,
    detail: [285, 149], variants: [
      { id: 'parallel', label: '反例 · 等距平行', document: makeDocument(definition, inputs, 0) },
      { id: 'feature', label: '笔性 · 随褶承力', document: makeDocument(definition, inputs, 1) },
      { id: 'combined', label: '组合 · 主次遮让', document: makeDocument(definition, inputs, 2) },
    ] };
}

/** Pure source checks; these test relationships rather than naming or aesthetics. */
function audit(studies, requireThree = true) {
  const checks = [];
  const record = (id, pass, detail) => checks.push({ id, pass, ...(detail ? { detail } : {}) });
  record('three-variants-per-study', (requireThree ? studies.length === 3 : studies.length === 1) && studies.every(study => study.variants.length === 3));
  for (const item of studies) {
    const [a, b, c] = item.variants.map(variant => variant.document);
    const cloth = b.recipe.groups.find(group => group.id === 'cloth');
    const supports = cloth.strokes.filter(stroke => stroke.id.startsWith('support-')).map(stroke => stroke.points[0]);
    const folds = document => document.recipe.groups.filter(group => group.id.startsWith('fold-'));
    const rootAttached = document => folds(document).every(group => supports.some(support => near(support, group.strokes[0].points[0])));
    record(`${item.id}/support-roots`, supports.length === 2 && rootAttached(b) && rootAttached(c));
    record(`${item.id}/two-force-fans`, [b, c].every(document => supports.every(support => folds(document).some(group => near(support, group.strokes[0].points[0])))));
    record(`${item.id}/counterexample-not-attached`, a.recipe.groups.filter(group => group.id.startsWith('parallel-'))
      .every(group => supports.every(support => !near(support, group.strokes[0].points[0]))));
    record(`${item.id}/primary-secondary-geometry`, c.recipe.groups.filter(group => group.id.startsWith('secondary-')).every(group => {
      const parent = c.recipe.groups.find(parent => parent.id === group.parentId);
      return parent && parent.strokes.some(stroke => stroke.points.some(p => near(p, group.strokes[0].points[0])));
    }));
    record(`${item.id}/authored-front-fold-gap`, [b, c].every(document => {
      const rear = [folds(document)[1], folds(document).at(-2)];
      const ridge = document.recipe.groups.find(group => group.id === 'front-fold').strokes[0].points.slice(1, -1);
      return rear.every(group => group.strokes.length >= 2 && ridge.some(center => {
        const absent = group.strokes.every(stroke => stroke.points.every(p => Math.hypot(p.x - center.x, p.y - center.y) > 2));
        const betweenSegments = group.strokes.slice(1).some((stroke, i) => {
          const before = group.strokes[i].points.at(-1), after = stroke.points[0], dx = after.x - before.x, dy = after.y - before.y;
          const square = dx * dx + dy * dy, t = ((center.x - before.x) * dx + (center.y - before.y) * dy) / square;
          return square > 36 && t > 0 && t < 1 && Math.hypot(center.x - before.x - dx * t, center.y - before.y - dy * t) < 3.5;
        });
        return absent && betweenSegments;
      }));
    }));
    record(`${item.id}/foreground-painted-last`, [b, c].every(document => document.recipe.groups.at(-1).id === 'front-fold'));
    record(`${item.id}/variable-pressure`, folds(c).every(group => group.strokes.every(stroke => new Set(stroke.points.map(p => p.pressure)).size > 1)));
    record(`${item.id}/foreground-hierarchy`, new Set(folds(c).flatMap(group => group.strokes.map(stroke => stroke.options.width))).size >= 3);
    record(`${item.id}/parent-links`, [a, b, c].every(document => document.recipe.groups.every(group => !group.parentId || document.recipe.groups.some(parent => parent.id === group.parentId))));
    record(`${item.id}/bounded-sources-and-time`, [a, b, c].every(document => document.recipe.groups.every(group => group.strokes.every(stroke =>
      stroke.options.start + stroke.options.duration < 8 && stroke.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 560 && p.y >= 0 && p.y <= 260)))));
    record(`${item.id}/one-stroke-per-source`, [a, b, c].every(document => document.result.marks.length === document.recipe.groups.reduce((sum, group) => sum + group.strokes.length, 0)));
    const kind = definitions.find(definition => definition.id === item.id).kind;
    if (kind === 'mixed') record('hun/selective-darkening-and-plane', c.recipe.groups.some(group => group.id.startsWith('soft-plane-'))
      && c.recipe.groups.filter(group => group.id.startsWith('awake-')).length < folds(c).length
      && Math.max(...c.recipe.groups.filter(group => group.id.startsWith('awake-')).flatMap(group => group.strokes.map(stroke => stroke.options.start)))
        > Math.max(...folds(c).flatMap(group => group.strokes.map(stroke => stroke.options.start))));
    if (kind === 'sparse') record('jianbi/authored-selection', folds(b).length === 4 && folds(b).length < a.recipe.groups.filter(group => group.id.startsWith('parallel-')).length);
    if (kind === 'dense') record('caoyi/nonuniform-dense-fan', folds(c).length === 14 && item.limits.includes('存在异说'));
    if (['short', 'nail', 'blunt', 'bamboo'].includes(kind)) record(`${item.id}/short-strokes`, folds(b).every(group => group.strokes.length >= 3 && group.strokes.every(stroke => sourceLength(stroke.points) < 94)));
    if (kind === 'dry') record('kuchai/local-dry-contact', folds(c).every(group => group.strokes.every(stroke => stroke.options.dryness >= .8 && stroke.options.controls.some(control => control.side >= .65))));
    if (kind === 'almond') record('ganlan-zaohe/shared-not-exclusive', item.techniqueIds.length === 2 && item.limits.includes('不设置互斥'));
  }
  return { ok: checks.every(check => check.pass), checks };
}

export function auditRemainingLine(study) { return audit([study], false); }

export const remainingLineBatches = [
  ['line-shaping', '线墨造形与取舍'], ['line-fine', '细劲长线'], ['line-flow', '流向与贴体线组'],
  ['line-short', '短线起收'], ['line-leaf-shapes', '衣纹宽窄与叶形比喻'], ['line-angular-dry', '衣纹转折与枯接触'],
].map(([id, title], i) => ({ number: i + 22, id, title, layouts, layout: 'slope',
  make({ seed = 261122 + i, layout = 'slope' } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
    if (!layouts.includes(layout)) throw new RangeError('Unknown cloth layout');
    return definitions.slice(i * 3, i * 3 + 3).map((definition, j) => study(definition, 64 + i * 3 + j, { seed, layout }));
  }, audit,
}));
