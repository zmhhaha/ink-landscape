import { createBrushStroke, createDotMarks, createInkScene } from '../dist/index.js';

export const techniqueStudyInputs = Object.freeze({ width: 560, height: 220, seed: 261119, time: 3 });

function exercise(variant) {
  return (variant === 'transfer' ? [
    [70, 173, .86], [167, 51, .86], [257, 145, .86], [346, 61, .86], [486, 110, .86],
  ] : [
    [62, 114, .86], [167, 83, .86], [257, 136, .86], [362, 84, .86], [489, 111, .86],
  ]).map(([x, y, pressure]) => ({ x, y, pressure }));
}

const base = seed => createInkScene({ width: 560, height: 220, seed, background: '#f2efe5' });
const common = seed => ({ id: 'study-stroke', seed, width: 31, opacity: .88, dryness: .24, start: 0, duration: 2, smoothing: 'linear' });

/** Each pair shares its input path, pressure, seed and all unmentioned options. */
export function makeTechniqueStudies({ seed = 261119, pathVariant = 'original' } = {}) {
  if (!Number.isSafeInteger(seed)) throw new RangeError('seed must be a safe integer');
  if (!['original', 'transfer'].includes(pathVariant)) throw new RangeError('Unknown study path');
  const path = exercise(pathVariant);
  const pair = (id, name, variable, observation, sourceIds, variants) => ({
    id, name, variable, observation, sourceIds, inputPath: path.map(point => ({ ...point })),
    variants: variants.map(([label, options]) => {
      const scene = base(seed);
      const stroke = createBrushStroke(path, { ...common(seed), ...options });
      scene.stroke(stroke.points, stroke);
      return { label, scene: scene.snapshot() };
    }),
  });
  const studies = [
    pair('contact', '01 · 中锋／侧锋的接触研究', '接触配置 axis（连同默认笔头与朝向）',
      '观察对称承墨与偏侧宽面的差别。这里研究笔迹外形，尚未模拟真实笔锋在笔画中的位置。',
      ['dpm-wangshen-yucun', 'shufa-xushupu'], [['对称接触', { axis: 'center' }], ['偏侧接触', { axis: 'side' }]]),
    pair('entry', '02 · 露锋与藏锋起笔', 'entry；其余参数一致',
      '比较尖入和逆入回转的起端；打开笔路可以看见藏锋增加的小回折。',
      ['shufa-yiying-study'], [['露锋起笔', { entry: 'exposed' }], ['藏锋起笔', { entry: 'concealed' }]]),
    pair('finish', '03 · 出锋与回锋收笔', 'finish；其余参数一致',
      '比较渐提出尖与向末段内部回行；回锋仍需继续打磨收端，不能只看路径存在。',
      ['shufa-yiying-study'], [['出锋收笔', { finish: 'open' }], ['回锋收笔', { finish: 'return' }]]),
    pair('pressure', '04 · 提按的接触宽度', 'pressureProfile；原始压力固定为0.86',
      '观察起终轻提、中段加按的宽度起伏；零压力仍保持为零，不覆盖调用者原有压力。',
      ['shufa-yiying-study', 'dpm-shan-ink-survey'], [['保持原压力', { pressureProfile: 'preserve' }], ['提按起伏', { pressureProfile: 'lift-press' }]]),
    pair('turn', '05 · 折与转的路径研究', 'turn（含角部提按或平滑插值）',
      '比较保留转角与圆转；圆转不代表所有传统转笔，折笔也不是简单的几何尖角。',
      ['shufa-xushupu', 'shufa-shupu'], [['折角与角部提按', { turn: 'angular' }], ['圆转笔路', { turn: 'round' }]]),
    pair('rhythm', '06 · 连贯与涩行接触研究', 'rhythm；总时长保持2秒',
      '只观察空间接触起伏和局部笔路变化；没有速度、驻笔时间或纸面摩擦的物理模拟。',
      ['shufa-shupu', 'shufa-xushupu'], [['连贯接触', { rhythm: 'continuous' }], ['断续接触', { rhythm: 'hesitant' }]]),
    pair('dry', '07 · 润笔与枯笔', 'dryness：0.16／0.86',
      '观察实墨和飞白；丝束仍是程序近似，不能据此认定干湿与宣纸渗化已实现。',
      ['dpm-shan-ink-survey', 'shufa-shupu'], [['较润', { dryness: .16 }], ['较枯', { dryness: .86 }]]),
    pair('tone', '08 · 浓淡的单笔研究', 'opacity：0.30／0.90',
      '只控制当前笔迹的浓淡视觉；降低透明度不等于完整的淡墨技法。',
      ['dpm-shan-ink-survey'], [['淡墨外观', { opacity: .30 }], ['浓墨外观', { opacity: .90 }]]),
  ];
  const positions = (pathVariant === 'transfer' ? [[98, 157], [203, 88], [341, 145], [460, 71]]
    : [[92, 110], [215, 110], [338, 110], [461, 110]]).map(([x, y]) => ({ x, y, pressure: .86 }));
  const dots = (id, name, observation, shapes) => ({
    id, name, variable: '点迹形状 shape；落点、尺寸、种子一致', observation,
    sourceIds: ['dpm-shan-ink-survey', 'shufa-yiying-study', 'shufa-shupu'], inputPath: positions.map(point => ({ ...point })),
    variants: shapes.map(([label, shape]) => {
      const scene = base(seed);
      for (const stroke of createDotMarks(positions, { shape, size: 27, seed, idPrefix: id, opacity: .88, dryness: .24, start: 0, duration: 2 })) {
        scene.stroke(stroke.points, stroke);
      }
      return { label, scene: scene.snapshot() };
    }),
  });
  studies.push(dots('dot-direction', '09 · 横点与竖点',
    '落点由调用者给定；每点都有独立的短行笔与提按，既不把全部落点连线，也不把点叶皴法简化成均匀散点。',
    [['横向点迹', 'horizontal'], ['竖向点迹', 'vertical']]));
  studies.push(dots('dot-groups', '10 · 对点与三点',
    '比较群内的呼应关系。这里只有点迹组合原语，尚不是介字点、个字点或米点皴的传统效果验收。',
    [['成对点迹', 'paired'], ['三点组合', 'triple']]));
  return studies;
}
