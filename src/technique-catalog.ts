import { getTechniqueReading, TECHNIQUE_READING_SOURCES } from './technique-learning.js';
import type { TechniqueReadingNote } from './technique-learning.js';

/**
 * A learning catalogue, not a claim that every historical school is covered.
 * Sources, executable approximations and visual acceptance are separate fields.
 * Entries with pending evidence are research questions, not sourced definitions.
 */
export type TechniqueCategory = 'brushwork' | 'ink' | 'water' | 'texture' | 'vegetation' | 'linework' | 'calligraphy';
export type TechniqueLevel = 'brush-action' | 'ink-state' | 'ink-process' | 'texture-family'
  | 'water-process' | 'vegetation-method' | 'depiction-method' | 'line-style' | 'calligraphic-stroke';
export type TechniqueEvidenceStatus = 'definition' | 'mentioned' | 'pending';
export type TechniqueImplementation = 'prototype' | 'pending';

export interface TechniqueSource {
  readonly id: string;
  readonly title: string;
  readonly institution: string;
  readonly url: string;
  readonly accessed: string;
  readonly supports: string;
  readonly kind?: string;
  readonly scope?: string;
}

export interface TechniqueEntry {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** Related forms within a family, rather than exact synonyms. */
  readonly variants: readonly string[];
  readonly category: TechniqueCategory;
  readonly level: TechniqueLevel;
  /** Observable study target; it is not a historical definition when evidence is pending. */
  readonly target: string;
  readonly evidence: {
    readonly status: TechniqueEvidenceStatus;
    readonly sourceIds: readonly string[];
  };
  readonly implementation: TechniqueImplementation;
  /** Null means this catalogue does not expose an implementation for this entry. */
  readonly entryPoint: string | null;
  readonly validation: 'unreviewed';
  /** User feedback on named samples, kept separate from comprehensive validation. */
  readonly sampleReview?: {
    readonly status: 'user-approved';
    readonly batch: 'foundation-batch1';
    readonly date: '2026-11-19';
    readonly scope: string;
    readonly record: string;
  };
  readonly notes: string;
  /** Completed reading notes can still contain disputed or unresolved meanings. */
  readonly reading: TechniqueReadingNote;
}

export const TECHNIQUE_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'brushwork', name: '基础用笔', description: '笔锋、起收、提按、转折与运行节奏。' }),
  Object.freeze({ id: 'ink', name: '墨态与墨法', description: '墨色、干湿与叠加组织；墨态不等于墨法。' }),
  Object.freeze({ id: 'water', name: '水法', description: '水与墨的先后、相破和区域组织；当前尚无流体模拟。' }),
  Object.freeze({ id: 'texture', name: '山石皴法', description: '顺山石结构组织线、面、点；同名可有流派差异。' }),
  Object.freeze({ id: 'vegetation', name: '树叶与苔点', description: '点叶、夹叶、针叶与苔点的组织方法。' }),
  Object.freeze({ id: 'linework', name: '勾描与衣纹', description: '造形方法和线描类型；十八描是一组历史分类。' }),
  Object.freeze({ id: 'calligraphy', name: '书法笔画', description: '先以永字八法整理单笔动作，不把书体当作笔法。' }),
] as const);

const INITIAL_TECHNIQUE_SOURCES: readonly TechniqueSource[] = Object.freeze([
  Object.freeze({
    id: 'dpm-wangshen-yucun', title: '王诜渔村小雪图卷', institution: '故宫博物院',
    url: 'https://www.dpm.org.cn/collection/paint/234606.html', accessed: '2026-11-19',
    supports: '馆藏说明实际描述侧锋短笔勾皴、清水向内化开轮廓的破墨，以及中锋浓墨寒林；仅支持该作品的观察范围。',
  }),
  Object.freeze({
    id: 'dpm-baoshi-cun', title: '抱石皴', institution: '故宫博物院',
    url: 'https://www.dpm.org.cn/lemmas/239776.html', accessed: '2026-11-19',
    supports: '说明破笔散锋、聚散分明；提及披麻、解索、乱柴、牛毛、卷云、折带的融合，不分别定义这些皴法。',
  }),
  Object.freeze({
    id: 'dpm-pima', title: '披麻皴', institution: '故宫博物院',
    url: 'https://www.dpm.org.cn/lemmas/240232.html', accessed: '2026-11-19',
    supports: '实际读取词条正文；亦称麻皮皴，如麻披散、错落交搭，并比较董源偏短与巨然偏长。未以此替代作品笔触的局部对照。',
  }),
  Object.freeze({
    id: 'dpm-axe', title: '斧劈皴', institution: '故宫博物院',
    url: 'https://www.dpm.org.cn/lemmas/243376.html', accessed: '2026-11-19',
    supports: '实际读取词条正文；以毛笔横扫及坚硬石质说明这种皴法，不能把全部斧劈皴解释成纵向长黑条。',
  }),
  Object.freeze({
    id: 'dpm-shan-ink-survey', title: '单国强《水墨画技法综述》首段单页', institution: '故宫博物院',
    url: 'https://www.dpm.org.cn/Uploads/pdf/1882/T00047_00.pdf', accessed: '2026-11-19',
    supports: '可访问文件为印刷页47单页，仅实读首段；列用笔、用墨与用水方法，无逐项定义，不能据此声称已读完整文章。',
  }),
  Object.freeze({
    id: 'shufa-shupu', title: '孙过庭《书谱》公开转录及今译', institution: '书法空间公开文献页',
    url: 'https://www.9610.com/lilun/sgt.htm', accessed: '2026-11-19',
    supports: '原文“执使转用”及点画内的起伏衄挫；网页同时有今译，属于公开转录，未作版本校勘。',
  }),
  Object.freeze({
    id: 'shufa-xushupu', title: '姜夔《续书谱》节录、图解及译文', institution: '书法空间公开文献页',
    url: 'https://www.9610.com/lilun/jiangkui.htm', accessed: '2026-11-19',
    supports: '原文谈笔锋在画中、转折停驻、迟速露藏及悬针垂露；网页为节录并含后人图解译注，未作版本校勘。',
  }),
  Object.freeze({
    id: 'shufa-yiying-study', title: '怎样临习《乙瑛碑》', institution: '书法空间转载，页末注明摘自《中国书画报》',
    url: 'https://www.9610.com/qinhan/yyb/01.htm', accessed: '2026-11-19',
    supports: '现代临习教学文章，实读起收、提按和转折操作；可辅助解释逆入、回锋、转折及波捺，不是汉代作者自述。',
  }),
]);

export const TECHNIQUE_SOURCES: readonly TechniqueSource[] = Object.freeze([
  ...new Map([...INITIAL_TECHNIQUE_SOURCES, ...TECHNIQUE_READING_SOURCES].map(source => [source.id, source])).values(),
]);

type EntryOptions = {
  aliases?: readonly string[];
  variants?: readonly string[];
  sourceIds?: readonly string[];
  evidence?: TechniqueEvidenceStatus;
  entryPoint?: string;
  notes?: string;
};

const surveyMentions = new Set(['brush-follow', 'brush-against', 'brush-fast', 'brush-slow', 'brush-dot', 'brush-scrub',
  'ink-light', 'ink-scorched', 'ink-dry', 'ink-wet', 'ink-layered', 'ink-splashed', 'ink-rendering', 'ink-background-wash', 'ink-supporting-wash',
  'water-soak', 'water-collision', 'water-texture', 'water-sprinkle', 'water-break-ink', 'ink-break-water']);

const firstBatchIds = new Set(['brush-center', 'brush-side', 'brush-lift', 'brush-press', 'ink-dry', 'ink-wet', 'ink-flying-white']);
const firstBatchReview = Object.freeze({
  status: 'user-approved' as const, batch: 'foundation-batch1' as const, date: '2026-11-19' as const,
  scope: '首批回修前归档的弧线样片效果获用户认可；不扩为本轮回修材质、所有笔路、真实毛笔动作或传统技法全义的验收。',
  record: 'docs/foundation-review.md',
});

function entry(id: string, name: string, category: TechniqueCategory, level: TechniqueLevel, target: string, options: EntryOptions = {}): TechniqueEntry {
  const reading = getTechniqueReading(id);
  if (!reading) throw new Error(`Missing technique reading: ${id}`);
  const previousSources = options.sourceIds ?? (surveyMentions.has(id) ? ['dpm-shan-ink-survey'] : []);
  const sourceIds = [...new Set([...previousSources, ...reading.evidence.map(item => item.sourceId)])];
  const previousStatus = options.evidence ?? (surveyMentions.has(id) ? 'mentioned' : 'pending');
  const hasDefinition = reading.confidence === 'supported' && reading.evidence.some(item => item.support === 'definition');
  const evidenceStatus = hasDefinition ? 'definition' : previousStatus === 'pending' && sourceIds.length ? 'mentioned' : previousStatus;
  return Object.freeze({ id, name, aliases: Object.freeze([...(options.aliases ?? [])]), variants: Object.freeze([...(options.variants ?? [])]), category, level, target,
    evidence: Object.freeze({ status: evidenceStatus, sourceIds: Object.freeze(sourceIds) }),
    implementation: options.entryPoint ? 'prototype' : 'pending', entryPoint: options.entryPoint ?? null,
    validation: 'unreviewed', notes: options.notes ?? '已补逐项阅读笔记；程序实现和作品局部的艺术效果对照分别记录。',
    ...(firstBatchIds.has(id) ? { sampleReview: firstBatchReview } : {}),
    reading,
  });
}

const wang = ['dpm-wangshen-yucun'];
const baoshi = ['dpm-baoshi-cun'];

/** Intentionally includes named research backlog. Pending entries cannot be executed. */
export const TECHNIQUE_CATALOG: readonly TechniqueEntry[] = Object.freeze([
  // Basic actions. A round/flat software nib does not prove centered/side brush handling.
  entry('brush-center', '中锋', 'brushwork', 'brush-action', '观察线条两侧承墨、宽度与转向的稳定关系。', { sourceIds: [...wang, 'shufa-xushupu'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: '《续书谱》支持锋尖与点画的运行关系。新接触模型以side:0保持锋尖居中，可与提按等组合；它是待实际毛笔对照的程序近似，不由圆厚外形直接验收。' }),
  entry('brush-side', '侧锋', 'brushwork', 'brush-action', '观察偏侧接触形成的宽面、边缘虚实与方向变化。', { sourceIds: wang, evidence: 'mentioned', entryPoint: 'createBrushDocument', notes: '新接触模型以side、angle和压力控制接触区相对锋尖的偏置与展开，支持同笔转换；传统侧锋范围仍须参考对照，不以固定扁笔代替。' }),
  entry('brush-offset', '偏锋', 'brushwork', 'brush-action', '区分笔锋偏置、边缘薄厚与中侧锋转换的控制。', { notes: '与侧锋的评价和用法在不同论述中有差别，暂不作为侧锋同义词。' }),
  entry('brush-follow', '顺锋', 'brushwork', 'brush-action', '比较顺势运行时笔路与丝束拖曳方向的关系。'),
  entry('brush-against', '逆锋', 'brushwork', 'brush-action', '研究逆势入纸或逆行时的摩擦、翻转与顿挫。', { notes: '简单倒置点序只改变行进方向，不能代表真实逆锋接触。' }),
  entry('brush-hidden-entry', '藏锋', 'brushwork', 'brush-action', '比较逆入后转向的起笔与直接尖入的边缘形态。', { sourceIds: ['shufa-xushupu', 'shufa-yiying-study'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: 'local-v1模型的entry:concealed增加有界逆入再转向的路径，可与偏侧接触组合；现代临习解释用于辅助，不概括所有藏锋。' }),
  entry('brush-exposed-entry', '露锋', 'brushwork', 'brush-action', '观察锋尖入纸与压力渐增形成的起端。', { sourceIds: ['shufa-xushupu'], evidence: 'mentioned', entryPoint: 'createBrushDocument', notes: 'local-v1模型的entry:exposed在起段逐步展开接触，满强度从零压力进入；属于待对照的几何近似，不涵盖所有切入方式。' }),
  entry('brush-return-finish', '回锋', 'brushwork', 'brush-action', '比较收笔回转路径和停笔外形，不只封圆端点。', { sourceIds: ['shufa-yiying-study'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: 'local-v1模型的finish:return先渐提再短弧内收，满强度回行后离纸；不模拟笔毫翻转和真实停驻。' }),
  entry('brush-exposed-finish', '出锋', 'brushwork', 'brush-action', '观察提笔离纸时压力、宽度和路径延续的关系。', { entryPoint: 'createBrushDocument', notes: 'local-v1模型的finish:open在尾段渐提，满强度到零压力；原始笔路和控制分别保存，不以附加三角尖表示出锋全义。' }),
  entry('brush-lift', '提笔', 'brushwork', 'brush-action', '沿调用者路径减小接触宽度并保持笔路连续。', { sourceIds: ['shufa-yiying-study'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: '局部controls.pressure乘以路径已有压力，控制接触展开并保留零压力离纸段；可保存设定后继续修改，尚待艺术评判。' }),
  entry('brush-press', '按笔', 'brushwork', 'brush-action', '增加接触宽度，检查增重位置与前后衔接。', { sourceIds: ['shufa-yiying-study'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: '局部controls.pressure在弧长关键位置组织受压段，与用锋和枯润分别控制；压力未做真实设备或笔杆受力标定。' }),
  entry('brush-pause', '顿笔', 'brushwork', 'brush-action', '比较短促加压处的墨量与局部形变。'),
  entry('brush-reposition', '挫笔', 'brushwork', 'brush-action', '观察短距离移锋、重新定向与压力再分配。', { sourceIds: ['shufa-shupu'], evidence: 'mentioned', notes: '《书谱》谈点画内的衄挫；本条观察目标是现代程序拆解，不冒充原文逐字定义。' }),
  entry('brush-turn', '转笔', 'brushwork', 'brush-action', '检查转向处切线与接触宽度是否保持连续。', { sourceIds: ['shufa-xushupu', 'shufa-yiying-study'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: '《续书谱》有“转不欲滞”的要求；local-v1模型的turn:round仅局部圆转、保留长直段，可组合接触换向，尚不模拟毫锋转动。' }),
  entry('brush-fold', '折笔', 'brushwork', 'brush-action', '保留转折处的停顿、换向与棱角，避免全路径平滑。', { sourceIds: ['shufa-xushupu', 'shufa-yiying-study'], evidence: 'definition', entryPoint: 'createBrushDocument', notes: '《续书谱》有“折欲少驻”的要求；local-v1模型的turn:angular保留节点并组织肩部提按、转点承压，不模拟时间停驻。' }),
  entry('brush-fast', '疾笔', 'brushwork', 'brush-action', '研究快速行笔的提按压缩与断续，不以播放速度冒充材质。'),
  entry('brush-slow', '徐行', 'brushwork', 'brush-action', '研究慢行时的持续接触与用力节奏，不以播放速度冒充材质。'),
  entry('brush-resistant', '涩行', 'brushwork', 'brush-action', '观察前进中的小幅阻滞、节奏和干擦接触。', { entryPoint: 'createBrushStroke', notes: 'rhythm:hesitant仅以空间偏置和压力模拟局部接触节奏，既非真实速度也非物理阻力；专门术语证据待核实。' }),
  entry('brush-split', '散锋', 'brushwork', 'brush-action', '区分聚锋与散锋的接触束、聚散和局部断白。', { sourceIds: baoshi, evidence: 'definition', notes: '故宫抱石皴条目说明破笔散锋；“破笔”在不同场合也可能指笔具或用笔状态，不统一作别名。' }),
  entry('brush-dot', '点法', 'brushwork', 'brush-action', '研究单点的方向、提按和起收，再观察成组疏密。', { entryPoint: 'createDotDocument', notes: '保存调用者落点、逐点短笔路与提按、方向和局部控制；稳定标识允许独立移动、重排和改向。群点疏密由调用者组织，不表示点叶、点苔或米点等传统组织已经实现。旧createDotMarks继续保留。' }),
  entry('brush-scrub', '擦笔', 'brushwork', 'brush-action', '研究局部侧拖接触与已有皴线、墨面的连接。'),

  // Ink states and ink processes must remain distinct.
  entry('ink-dark', '浓墨', 'ink', 'ink-state', '固定笔势，比较较深墨色的层次和重叠关系。', { sourceIds: wang, evidence: 'mentioned', entryPoint: 'createInkProcessDocument', notes: '墨层concentration控制程序光学密度，与water、接触dryness及opacity分别保存；由同笔组观察浓淡及叠处，不是实测墨粒浓度或完整材料模拟。' }),
  entry('ink-light', '淡墨', 'ink', 'ink-state', '固定形状，观察浅墨的边缘、层次与留白。', { entryPoint: 'createInkProcessDocument', notes: '墨层可在保留相同接触与水量时降低concentration，观察淡墨外观；它是光学密度近似，不能独自概括传统淡墨的纸性与含水。旧透明度接口继续保留。' }),
  entry('ink-scorched', '焦墨', 'ink', 'ink-state', '比较高黑度与枯接触共存时的断白和积叠。', { notes: '可调黑色和枯润不等于已有焦墨法；本条仍待独立组织与参考对照。' }),
  entry('ink-dry', '干笔', 'ink', 'ink-state', '检查接触中断是否顺笔势变化，是否出现均匀排线。', { aliases: ['枯笔'], entryPoint: 'createBrushDocument', notes: '局部dryness与inkLoad控制顺笔路沉积和接触覆盖，可在同笔改变；它们是视觉控制量，尚非真实含水、储墨或纸面摩擦模型。' }),
  entry('ink-wet', '湿笔', 'ink', 'ink-state', '比较连续承墨与边缘虚实；含水量和含墨量分别观察。', { entryPoint: 'createBrushDocument', notes: '局部dryness可形成较连续的沉积，与墨色和透明度分别设置；当前接触模型不模拟毛细扩散、纸性或干燥，艺术效果待评。' }),
  entry('ink-flying-white', '飞白', 'ink', 'ink-state', '比较顺笔势断续的露纸丝束，排除等距梳齿纹。', { entryPoint: 'createBrushDocument', notes: '新接触渲染沿笔路生成断续墨束和露纸；这里只研究可见断白，历史飞白的范围及艺术效果仍须独立对照。' }),
  entry('ink-layered', '积墨', 'ink', 'ink-process', '分层安排先后、干湿和浓淡，观察叠墨后的结构是否保留。', { entryPoint: 'createInkProcessDocument', notes: '保存调用者逐层笔路、浓度、绝对时刻与声明干燥窗口，可修改覆盖与留明；第四批比较单薄层、全覆与分区递加。程序叠层和wash.passes都不独立证明传统积墨成立，艺术范围待评。' }),
  entry('ink-broken', '破墨', 'ink', 'ink-process', '研究水墨、浓淡相破的方向、时序和边缘关系。', { sourceIds: wang, evidence: 'definition', entryPoint: 'createInkProcessDocument', notes: 'wet-mix在新旧墨层仍有声明湿态的局部进行有限栅格颜料交换，区分待干叠加、浓破淡及反向淡破浓；不是全画模糊、连续干燥或真实纸内流体。王诜清水化轮廓用例的范围另记，不代表全部破墨。' }),
  entry('ink-splashed', '泼墨', 'ink', 'ink-process', '研究大面积墨势、流动与后续收拾，区分随机泼点。'),
  entry('ink-aged', '宿墨', 'ink', 'ink-process', '研究沉积、颗粒与边缘变化的视觉范围和材料前提。', { notes: '宿墨涉及材料状态；不能由一个噪声纹理开关冒充。' }),
  entry('ink-rendering', '渲染', 'ink', 'ink-process', '研究水墨在区域内的层次过渡和造形作用。', { entryPoint: 'wash', notes: '已有区域墨洗原型，尚无真实湿边交融。' }),
  entry('ink-background-wash', '烘染', 'ink', 'ink-process', '从形外或周围衬托对象，观察空白与明暗的关系。'),
  entry('ink-glazing', '罩染', 'ink', 'ink-process', '比较已有笔墨上薄层统一色调时的保形程度。'),
  entry('ink-divided-wash', '分染', 'ink', 'ink-process', '沿形体分区组织由深至浅的层次，避免均匀铺色。'),
  entry('ink-supporting-wash', '托', 'ink', 'ink-process', '先核对托法的对象、区域和前后关系，再设计局部对照。', { notes: '故宫综述仅列“托”；不同语境下的含义还需文献与作品交叉确认。' }),

  entry('water-soak', '渍水', 'water', 'water-process', '核对局部积水与墨层先后、边界沉积的关系。'),
  entry('water-collision', '撞水', 'water', 'water-process', '研究水与已有墨层相遇时的区域边缘；先区分干湿前提。'),
  entry('water-texture', '皴水', 'water', 'water-process', '先核对名词用例，再研究水的笔触与山石纹理的关系。'),
  entry('water-sprinkle', '洒水', 'water', 'water-process', '研究水滴大小、疏密及施于墨前墨后的差异。', { entryPoint: 'createWaterProcessDocument', notes: '第五批仅作分散加水／洒水研究：保存调用者显式清水滴与墨事件，比较先后和局部湿交换；水不着色或擦除。洒水阅读仍部分支持，陈容噗水是邻近用例，不能由水滴程序宣称传统洒水已复现。' }),
  entry('water-break-ink', '水破墨', 'water', 'water-process', '研究清水进入墨层时的先后顺序和边缘变化。', { entryPoint: 'createWaterProcessDocument', notes: '显式区分先墨与后到清水，在声明湿窗的局部交区重分布原墨，清水浓度固定为零，不用白色覆盖或擦除；王诜清水向内化轮廓只为具体用例，当前有限交换不等于真实纸内渗化，艺术效果留待统一评价。' }),
  entry('ink-break-water', '墨破水', 'water', 'water-process', '研究墨进入预湿区域时的先后顺序和边缘变化。', { entryPoint: 'createWaterProcessDocument', notes: '保存纸面预施清水与后到墨笔，区分有效湿窗与已过窗口；清水自身不可见。仅采用已读课堂文字的先水后墨语境，阅读仍部分支持，不并入笔中蘸水次序或全部湿底技法，艺术效果留待统一评价。' }),

  // Family entries keep long/short and large/small variants together.
  entry('cun-pima', '披麻皴', 'texture', 'texture-family', '用疏密、交搭和曲直变化的线组织山石走势。', { aliases: ['麻皮皴'], variants: ['长披麻皴', '短披麻皴'], sourceIds: ['dpm-pima', ...baoshi], evidence: 'definition', entryPoint: 'createCunDocument', notes: '第六批以作者显式笔路组织错落长线与长短交搭，pima提供顺线提按和接触默认；不自动填山体或决定坡势。故宫董源偏短、巨然偏长的比较不等于统一配方；旧cun原型保留，艺术范围待统一评价。' }),
  entry('cun-axe', '斧劈皴', 'texture', 'texture-family', '比较侧向切面、横扫落势和干湿接触对坚硬石质的作用。', { variants: ['大斧劈皴', '小斧劈皴'], sourceIds: ['dpm-axe'], evidence: 'definition', entryPoint: 'createCunDocument', notes: 'axe在作者横扫斜拖笔路上提供侧锋重起与收窄接触，石面、大小与交叠仍由作者组织；不同大小不是已确证的全部传统变体。故宫横扫用例不概括成纵向长黑条，旧cun不因此自动升级，艺术待评。' }),
  entry('cun-zhedai', '折带皴', 'texture', 'texture-family', '研究横向行笔与折转的带状结构，保留折处骨力。', { sourceIds: baoshi, evidence: 'mentioned', entryPoint: 'createCunDocument', notes: 'zhedai在作者横行折转骨线上保留方折并组织局部侧用和提按，分层位置与虚实仍需显式设计。不是任意曲线降平滑度或固定等距直角纹；传统用法及艺术效果留到统一评价。' }),
  entry('cun-jiesuo', '解索皴', 'texture', 'texture-family', '研究曲线交搭和松紧变化，避免平行长帘。', { sourceIds: baoshi, evidence: 'mentioned', entryPoint: 'createCunDocument', notes: '第七批jiesuo在作者屈曲笔路上提供中用接触与提按，屈曲尺度、穿插、疏密和山石主脉由作者组织；不从直线自动生成卷曲或用随机绕线填面。程序原型及艺术范围待统一评价。' }),
  entry('cun-luanchai', '乱柴皴', 'texture', 'texture-family', '研究交错短长线的结构组织，区别无向随机散线。', { sourceIds: baoshi, evidence: 'mentioned', entryPoint: 'createCunDocument', notes: '第七批luanchai在作者直折笔路上保折并组织轻重接触；阴处粗密、阳处疏细及多方向交错仍为显式作者设定。淡墨用例不强制全黑硬，不把均匀随机散线当成乱柴，艺术待评。' }),
  entry('cun-niumao', '牛毛皴', 'texture', 'texture-family', '研究细密曲线的疏密、层次和山体走向。', { sourceIds: baoshi, evidence: 'mentioned', entryPoint: 'createCunDocument', notes: '第七批niumao仅作牛毛细线形态研究：在作者细短曲路上提供细线接触默认，疏密、留脉、曲率和交叉比例是待核的程序假设。阅读仍部分支持，缺少可靠独立笔序与高清局部比较；不宣称传统牛毛皴成立，也不因有入口就默认推荐给创作Agent。' }),
  entry('cun-juanyun', '卷云皴', 'texture', 'texture-family', '研究卷曲笔组与山石轮廓的连接方式。', { sourceIds: baoshi, evidence: 'mentioned', entryPoint: 'createCunDocument', notes: '第八批以cloud-study共享入口研究作者环抱线的接触、开面与搭接。与云头的资料逐名保留，名称边界待核，不因共用程序判定同义，也不虚构互斥预设。阅读仍部分支持，无可靠完整笔序或艺术认可，不自动推荐。' }),
  entry('cun-yuntou', '云头皴', 'texture', 'texture-family', '核对块面转折与云团状线组的关系。', { entryPoint: 'createCunDocument', notes: '第八批以cloud-study共享研究作者开口环抱线和前后笔序；中侧接触不等于已复现团旋转背。与卷云名称边界及独立资料保留，阅读仍部分支持，不直接合并为同义词或默认推荐，艺术待统一评价。' }),
  entry('cun-yudian', '雨点皴', 'texture', 'texture-family', '比较密集点状皴擦的落向、疏密与体块关系。', { entryPoint: 'createCunDocument', notes: '第八批point-study共享入口沿作者短笔路执行轻触、按腹与收提，方向、阴阳聚散和留气由作者组织。雨点与豆瓣资料各自保留，阅读仍部分支持，不以固定长宽比划历史界线，不画落雨或自动撒点；原型不默认推荐，艺术待评。' }),
  entry('cun-douban', '豆瓣皴', 'texture', 'texture-family', '研究较宽点笔的提按、排列和山石结构。', { entryPoint: 'createCunDocument', notes: '第八批与雨点共用point-study作短点接触研究，保留两名各自资料及名称关系待核。按腹、粗细和布局由显式源控制，不用统一豆形图章或两套互斥阈值；阅读仍部分支持，无传统艺术认可，不自动推荐。' }),
  entry('cun-midian', '米点皴', 'texture', 'texture-family', '研究横点的大小、浓淡和层叠怎样联系云山。', { aliases: ['米家点'] }),
  entry('cun-heye', '荷叶皴', 'texture', 'texture-family', '研究主脉与分披走势，避免均匀放射线。', { entryPoint: 'createCunDocument', notes: '第八批heye在作者分歧筋脉上提供上重下轻与开收；峰顶、主次、交接、遮让和山脚留气由普通独立源路径及笔序组织。不自动创建父子拓扑、伞骨图章或固定山形；资料支持不代替程序艺术验收。' }),
  entry('cun-kulou', '骷髅皴', 'texture', 'texture-family', '核对凹凸、孔洞式山石结构与笔组的关系。'),
  entry('cun-tuoni', '拖泥带水皴', 'texture', 'texture-family', '研究带水拖笔与墨色连接的结构作用。'),
  entry('cun-dingtou', '钉头皴', 'texture', 'texture-family', '核对起笔重、收笔轻的点划及其组织关系。'),
  entry('cun-baoshi', '抱石皴', 'texture', 'texture-family', '研究破笔散锋的聚散层次，以及线面点的综合组织。', { sourceIds: baoshi, evidence: 'definition', notes: '有明确画家与形成背景的综合用笔；不能直接给噪声笔刷冠同名并宣称掌握。' }),

  entry('vegetation-moss', '点苔', 'vegetation', 'vegetation-method', '比较点的聚散、大小与岩面或树根结构的关系。', { entryPoint: 'createVegetationDocument', notes: '第九批moss在作者结构线和显式苔点路径上研究接触与聚散，稳定单元和逐笔身份保留局部修改责任。落点、大小、呼应和石面关系由作者组织，不随机填满或以加黑遮丑代替造形；程序原型显式选用，艺术待统一评价。' }),
  entry('vegetation-dot-leaves', '点叶', 'vegetation', 'vegetation-method', '以点笔组织叶丛的正侧、重叠和外轮廓。', { entryPoint: 'createVegetationDocument', notes: '第九批dot-leaf在作者单叶笔路上提供点叶接触默认，枝架、叶簇、顾盼、疏密和叠压均以显式单元与笔序保存。不自动补叶、指定树种或把全部点叶归并为一个图式；资料阅读与程序艺术范围分别记录，原型不默认推荐。' }),
  entry('vegetation-outline-leaves', '夹叶', 'vegetation', 'vegetation-method', '研究叶片双边勾出后与叶脉、枝条的衔接。', { entryPoint: 'createVegetationDocument', notes: '第九批outline-leaf研究作者提供的一叶两边细线及沿枝组织，叶片单元保留可编辑的逐边路径；内部留白来自未着墨区域，不使用填白图章。阅读仍部分支持，未确证完整笔序、树种或设色流程，不自动生成椭圆叶群或获得艺术认可。' }),
  entry('leaf-jie', '介字点', 'vegetation', 'vegetation-method', '研究介字式分叉点组的方向和聚散。', { entryPoint: 'createVegetationDocument', notes: '第十批共享dot-leaf执行作者分叉叶组，逐笔显式使用中用接触控制；中锋有馆藏文字用例，图式阅读仍部分支持。作者示例四笔是本次标注假设，不是传统固定笔数或唯一笔序；不把字体介字复制到树冠，艺术待统一评价。' }),
  entry('leaf-ge', '个字点', 'vegetation', 'vegetation-method', '研究个字式点组与枝条方向的连接。', { entryPoint: 'createVegetationDocument', notes: '第十批共享dot-leaf研究作者主向与两侧下垂的分向叶组，保留普通单元与逐笔身份；与介字使用分别组织的源而不只更换标签。三笔只是本次作者选择，静态图不证明固定数额、完整起收笔序或树种；阅读仍部分支持，程序原型显式选用。' }),
  entry('leaf-pin', '品字点', 'vegetation', 'vegetation-method', '研究三点组合的大小、间隙与疏密。'),
  entry('leaf-three-five', '攒三聚五', 'vegetation', 'vegetation-method', '研究三五点簇的聚散而非重复同一印章。', { entryPoint: 'createVegetationDocument', notes: '第十批沿用dot-leaf接触和作者显式叶簇，比较重复单元与数量、方向、浓淡、空白通道的组织；这是成簇聚散关系，不新增一套同名笔头或规定每处三片加五片。整组变换保留逐笔源与身份，阅读依据不代替完整树冠或艺术验收。' }),
  entry('leaf-pepper', '胡椒点', 'vegetation', 'vegetation-method', '核对细密点法的对象、浓淡与疏密变化。', { entryPoint: 'createVegetationDocument', notes: '第十一批沿用普通点笔接触，以作者显式保存的细短点路研究细粒密簇、簇边及细白；馆藏说明另有山顶浓墨戳点用例。不把米点缩小或均匀噪声作为胡椒点的完整定义，点数、附枝与留空仍由作者组织，艺术待统一评价。' }),
  entry('leaf-broken', '破笔点', 'vegetation', 'vegetation-method', '比较破笔接触在点叶、点苔中的不规则分束。', { entryPoint: 'createVegetationDocument', notes: '第十一批研究破笔点的散锋形态，createSplitVegetationUnit把作者给定笔路和相关束偏移展开为普通可编辑多笔源，保留束宽、压力与单元身份；它是几何多笔源近似，非真实一次接触物理。图式阅读仍部分支持，抱石皴词条只提供相关破笔散锋语境，不定义破笔点，也不等同破墨。' }),
  entry('vegetation-pine-needles', '松针', 'vegetation', 'vegetation-method', '研究针束扇开、交叉、叠合以及与枝干的连接。', { entryPoint: 'createVegetationDocument', notes: '第十一批沿用普通细线接触研究作者逐针保存的偏向扇束、长短、交叠与枝端空隙；针束为可编辑单元，不新增等角太阳式树冠预设。阅读仍部分支持，静态松叶点、刺松点图式不证明唯一落针顺序；刺绣松针词条明确排除，松干、竹叶与完整树法不连带认定实现。' }),
  entry('vegetation-bamboo-leaves', '竹叶', 'vegetation', 'vegetation-method', '研究叶笔的起按提收与成组穿插。', { entryPoint: 'createVegetationDocument', notes: '第十二批沿用dot-leaf接触，作者分别组织竹枝架、尖长叶笔、疏密俯仰与穿插；逐叶保存压力、笔宽、时间和组身份，普通单元可整体变换。图式阅读仍部分支持，不把个字点改名或同形叶片贴到任意枝上，也不规定唯一撇叶顺序、风雨动态或全部画竹法。' }),
  entry('leaf-plum', '梅花点', 'vegetation', 'vegetation-method', '先核对名称所指点叶图式，再研究多点簇的组织。', { entryPoint: 'createVegetationDocument', notes: '第十二批以作者显式短叶围攒研究树谱中的花簇式点叶，沿用dot-leaf基础，成员数量、方向、大小、叠接和簇间留空可编辑。阅读仍部分支持，不画梅花实物、不固定五瓣或五笔，不与品字点、梅花鼠足点裁为同义；程序原型不代替传统笔序与艺术评价。' }),

  entry('line-outline', '勾勒', 'linework', 'depiction-method', '以开放或闭合线勾出形体边界，并检查提按与转折。', { entryPoint: 'stroke', notes: 'stroke接受调用者路径；形成什么对象和画法由创作者决定。' }),
  entry('line-baimiao', '白描', 'linework', 'depiction-method', '研究不依赖设色的线条造形、主次与质感。', { notes: '白描是一种造形方法，不能简化为关闭颜色。' }),
  entry('line-mogu', '没骨', 'linework', 'depiction-method', '研究以墨色或色面直接造形、弱化独立轮廓线的关系。', { notes: '“没骨”不等于任意无描边填色。' }),
  entry('line-double-outline', '双勾', 'linework', 'depiction-method', '比较对象两侧轮廓、内部空白和转折的对应。', { entryPoint: 'createVegetationDocument', notes: '第十二批选取叶形对象，以outline-leaf细线接触执行作者分别提供的两侧轮廓、合拢、宽窄与分段遮挡，复用普通单元和整组编辑，不新增历史固定轮廓算法。绘画双钩词条有明确支持，与复制法帖的双钩廓填分别研究；内部留白来自未着墨，后缘省略由作者源段明确表达，不以白色填充擦除既有墨迹，也不自动认定完整花鸟造形。' }),

  entry('line-gaogu-yousi', '高古游丝描', 'linework', 'line-style', '研究细长连续线在转折、速度和压力上的稳定变化。'),
  entry('line-qinxian', '琴弦描', 'linework', 'line-style', '研究长线的张力与宽度控制，并核对历史分类。'),
  entry('line-tiexian', '铁线描', 'linework', 'line-style', '研究有力均整线条在转折和收笔中的控制。'),
  entry('line-xingyun-liushui', '行云流水描', 'linework', 'line-style', '研究连贯长线的曲折节奏与衣纹走向。'),
  entry('line-mahuang', '马蝗描', 'linework', 'line-style', '研究线条粗细、圆转和弹性变化。', { aliases: ['蚂蝗描'] }),
  entry('line-dingtou-shuwei', '钉头鼠尾描', 'linework', 'line-style', '研究重起轻收与线条衔接，不把它当成全部衣纹的统一压力模板。'),
  entry('line-hun', '混描', 'linework', 'line-style', '核对淡墨衣纹与浓墨醒线、线面交融的操作及历史范围。'),
  entry('line-juetou', '撅头钉描', 'linework', 'line-style', '核对硬折、端头与短线组织的具体形态。', { aliases: ['撅头丁描', '橛头丁描', '橛头钉描'] }),
  entry('line-caoyi', '曹衣描', 'linework', 'line-style', '研究衣纹密集、贴体的线组与结构关系。'),
  entry('line-zhelu', '折芦描', 'linework', 'line-style', '研究线的硬折、长短衔接和人物结构。'),
  entry('line-ganlan', '橄榄描', 'linework', 'line-style', '核对两端与中段宽度变化在真实衣纹中的组织。'),
  entry('line-zaohe', '枣核描', 'linework', 'line-style', '研究两端轻、中段重的压力节奏及转折形态。'),
  entry('line-liuye', '柳叶描', 'linework', 'line-style', '研究细长叶形线的按提和与相邻衣纹的衔接。'),
  entry('line-zhuye', '竹叶描', 'linework', 'line-style', '核对短长尖收线条在衣纹中的结构用法。', { notes: '衣纹竹叶描与画竹叶不是同一层级，分别研究。' }),
  entry('line-zhanbi-shuiwen', '战笔水纹描', 'linework', 'line-style', '研究受控小幅颤动与水纹式转折，避免独立随机抖线。'),
  entry('line-jianbi', '减笔描', 'linework', 'line-style', '研究省略与概括哪些线仍能保持对象结构。'),
  entry('line-kuchai', '枯柴描', 'linework', 'line-style', '核对干涩、折断线质与用线组织的关系。'),
  entry('line-qiuyin', '蚯蚓描', 'linework', 'line-style', '研究圆转曲线的厚度、连贯性及人物结构。'),

  // Eight methods name stroke forms; ce is not a synonym for side-tip brushwork.
  entry('eight-ce', '侧（点）', 'calligraphy', 'calligraphic-stroke', '研究点笔的入纸、按顿和回收。', { aliases: ['永字八法·侧'], notes: '八法“侧”是点法名称，不与“侧锋”混为同义词。' }),
  entry('eight-le', '勒（横）', 'calligraphy', 'calligraphic-stroke', '研究横画的入笔、行笔和收束。', { aliases: ['永字八法·勒'] }),
  entry('eight-nu', '努（竖）', 'calligraphy', 'calligraphic-stroke', '研究竖画的中段控制、力向与收笔。', { aliases: ['永字八法·努', '弩（竖）'] }),
  entry('eight-ti', '趯（钩）', 'calligraphy', 'calligraphic-stroke', '研究转折蓄势与钩出的短促提锋。', { aliases: ['永字八法·趯'] }),
  entry('eight-ce-lift', '策（提）', 'calligraphy', 'calligraphic-stroke', '研究轻入渐出或按后提行的具体笔势。', { aliases: ['永字八法·策'] }),
  entry('eight-lue', '掠（长撇）', 'calligraphy', 'calligraphic-stroke', '研究长撇的起行、弧势与提锋。', { aliases: ['永字八法·掠'] }),
  entry('eight-zhuo', '啄（短撇）', 'calligraphy', 'calligraphic-stroke', '研究短撇的迅捷落出及其压力压缩。', { aliases: ['永字八法·啄'] }),
  entry('eight-zhe', '磔（捺）', 'calligraphy', 'calligraphic-stroke', '研究捺画的渐按、转向与铺毫出锋。', { aliases: ['永字八法·磔'] }),
]);

export interface TechniqueQuery {
  readonly category?: TechniqueCategory;
  readonly implementation?: TechniqueImplementation;
  readonly evidence?: TechniqueEvidenceStatus;
  readonly query?: string;
}

export function getTechnique(id: string): TechniqueEntry | undefined {
  return TECHNIQUE_CATALOG.find(value => value.id === id);
}

/** Search names, documented aliases and study descriptions without mutating the catalogue. */
export function findTechniques(options: TechniqueQuery = {}): readonly TechniqueEntry[] {
  if (options.query !== undefined && typeof options.query !== 'string') throw new TypeError('query must be a string');
  const query = (options.query ?? '').trim().toLocaleLowerCase('zh-CN');
  return Object.freeze(TECHNIQUE_CATALOG.filter(value =>
    (!options.category || value.category === options.category)
    && (!options.implementation || value.implementation === options.implementation)
    && (!options.evidence || value.evidence.status === options.evidence)
    && (!query || [value.id, value.name, ...value.aliases, ...value.variants, value.target, value.notes,
      value.reading.summary, value.reading.actions, value.reading.appearance, value.reading.application,
      value.reading.pitfall, value.reading.translation].some(text => text.toLocaleLowerCase('zh-CN').includes(query)))));
}
