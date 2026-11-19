/** Executable research coverage. Neither a named technique preset nor artistic acceptance. */
export interface TechniqueStudyBatch {
  readonly number: number;
  readonly title: string;
  readonly techniqueIds: readonly string[];
  readonly example: string;
}
export const TECHNIQUE_STUDY_BATCHES: readonly TechniqueStudyBatch[] = Object.freeze([
  {"number":1,"title":"基础运笔","techniqueIds":["brush-lift","brush-press","brush-center","brush-side","ink-wet","ink-dry","ink-flying-white"],"example":"examples/revision-review.html?batch=1"},
  {"number":2,"title":"起收转折","techniqueIds":["brush-exposed-entry","brush-hidden-entry","brush-side","brush-exposed-finish","brush-return-finish","brush-turn","brush-fold","brush-center"],"example":"examples/revision-review.html?batch=2"},
  {"number":3,"title":"点迹组织","techniqueIds":["brush-dot","brush-lift","brush-press","brush-side"],"example":"examples/revision-review.html?batch=3"},
  {"number":4,"title":"浓淡积破","techniqueIds":["ink-light","ink-dark","ink-layered","ink-broken","ink-wet"],"example":"examples/revision-review.html?batch=4"},
  {"number":5,"title":"水墨先后","techniqueIds":["water-break-ink","ink-break-water","water-sprinkle"],"example":"examples/revision-review.html?batch=5"},
  {"number":6,"title":"披麻斧劈折带","techniqueIds":["cun-pima","cun-axe","cun-zhedai"],"example":"examples/revision-review.html?batch=6"},
  {"number":7,"title":"解索乱柴牛毛","techniqueIds":["cun-jiesuo","cun-luanchai","cun-niumao"],"example":"examples/revision-review.html?batch=7"},
  {"number":8,"title":"环抱点皴筋脉","techniqueIds":["cun-juanyun","cun-yuntou","cun-yudian","cun-douban","cun-heye"],"example":"examples/revision-review.html?batch=8"},
  {"number":9,"title":"点苔点叶夹叶","techniqueIds":["vegetation-moss","vegetation-dot-leaves","vegetation-outline-leaves"],"example":"examples/revision-review.html?batch=9"},
  {"number":10,"title":"介字个字聚簇","techniqueIds":["leaf-jie","leaf-ge","leaf-three-five"],"example":"examples/revision-review.html?batch=10"},
  {"number":11,"title":"胡椒破笔松针","techniqueIds":["leaf-pepper","leaf-broken","vegetation-pine-needles"],"example":"examples/revision-review.html?batch=11"},
  {"number":12,"title":"竹叶梅花双勾","techniqueIds":["vegetation-bamboo-leaves","leaf-plum","line-double-outline"],"example":"examples/revision-review.html?batch=12"},
  {"number":13,"title":"锋势与毛束","techniqueIds":["brush-offset","brush-follow","brush-against","brush-split"],"example":"examples/remaining-review.html?batch=13"},
  {"number":14,"title":"局部驻转与阻力","techniqueIds":["brush-pause","brush-reposition","brush-resistant"],"example":"examples/remaining-review.html?batch=14"},
  {"number":15,"title":"运行节奏与摩擦","techniqueIds":["brush-fast","brush-slow","brush-scrub"],"example":"examples/remaining-review.html?batch=15"},
  {"number":16,"title":"墨料与大面布墨","techniqueIds":["ink-scorched","ink-aged","ink-splashed"],"example":"examples/remaining-review.html?batch=16"},
  {"number":17,"title":"区域造形","techniqueIds":["ink-rendering","ink-background-wash","line-mogu"],"example":"examples/remaining-review.html?batch=17"},
  {"number":18,"title":"染层与透显","techniqueIds":["ink-divided-wash","ink-glazing","ink-supporting-wash"],"example":"examples/remaining-review.html?batch=18"},
  {"number":19,"title":"水法条件与缺证","techniqueIds":["water-soak","water-collision","water-texture"],"example":"examples/remaining-review.html?batch=19"},
  {"number":20,"title":"湿点与综合皴组","techniqueIds":["cun-midian","cun-tuoni","cun-baoshi"],"example":"examples/remaining-review.html?batch=20"},
  {"number":21,"title":"骨架、短皴与待核叶组","techniqueIds":["cun-kulou","cun-dingtou","leaf-pin"],"example":"examples/remaining-review.html?batch=21"},
  {"number":22,"title":"线墨造形与取舍","techniqueIds":["line-hun","line-baimiao","line-jianbi"],"example":"examples/remaining-review.html?batch=22"},
  {"number":23,"title":"细劲长线","techniqueIds":["line-gaogu-yousi","line-qinxian","line-tiexian"],"example":"examples/remaining-review.html?batch=23"},
  {"number":24,"title":"流向与贴体线组","techniqueIds":["line-xingyun-liushui","line-qiuyin","line-caoyi"],"example":"examples/remaining-review.html?batch=24"},
  {"number":25,"title":"短线起收","techniqueIds":["line-mahuang","line-dingtou-shuwei","line-juetou"],"example":"examples/remaining-review.html?batch=25"},
  {"number":26,"title":"衣纹宽窄与叶形比喻","techniqueIds":["line-ganlan","line-zaohe","line-liuye","line-zhuye"],"example":"examples/remaining-review.html?batch=26"},
  {"number":27,"title":"衣纹转折与枯接触","techniqueIds":["line-zhelu","line-zhanbi-shuiwen","line-kuchai"],"example":"examples/remaining-review.html?batch=27"},
  {"number":28,"title":"八法的点横竖","techniqueIds":["eight-ce","eight-le","eight-nu"],"example":"examples/remaining-review.html?batch=28"},
  {"number":29,"title":"八法的钩提撇","techniqueIds":["eight-ti","eight-ce-lift","eight-lue"],"example":"examples/remaining-review.html?batch=29"},
  {"number":30,"title":"短撇、捺与结构勾勒","techniqueIds":["eight-zhuo","eight-zhe","line-outline"],"example":"examples/remaining-review.html?batch=30"},
].map(batch => Object.freeze({ ...batch, techniqueIds: Object.freeze(batch.techniqueIds) })));

/** Some entries share a study; unresolved names can link to an explicitly neutral probe. */
export function getTechniqueStudies(id: string): readonly TechniqueStudyBatch[] {
  return Object.freeze(TECHNIQUE_STUDY_BATCHES.filter(batch => batch.techniqueIds.includes(id)));
}
