# ink-landscape

可组合、可编辑的笔墨山水技法 TypeScript 库，供浏览器应用和创作 Agent 使用。几何与笔触数据独立于渲染器；初版使用 Canvas 2D，Shader 后端尚未实现，后续需通过画面对照验证其价值。

[创作 Agent Skill](skills/ink-landscape/SKILL.md)按需提供笔墨、皴法、树石鸟与墨层的真实 API 用法，保留自创笔路和可编辑源；运行时由宿主供应固定版本，选择不加载 WikiSkill 时不注入这些知识。

[枯木寒鸦代码临摹](examples/bada-study.html)使用现有笔组与墨层接口组织一幅完整习作，支持PNG和编辑源导出；[配方与重建说明](docs/bada-code-study.md)记录构图来源、局部修改及验证范围。

[树、石、鸟复合源](docs/subject-macros.md)提供可选的 `createTreeMacro()`、`createRockMacro()`、`createBirdMacro()`，将分枝、岩骨皴染、分件鸟组合为普通可编辑笔组。调用者可提供自己的骨架、区域、方向场或部件；[复合源浏览页](examples/subject-macros.html)可保存三项合图和JSON。这些模板仍是待艺术评价的程序近似。

目前是工程原型，整体技法库尚未完成艺术效果验收；首批三组回修前的归档样片曾获用户视觉认可，范围和局限见[首批记录](docs/foundation-review.md)，不延伸为回修后材质的认可。披麻皴、斧劈皴等名称表示受传统技法启发的程序近似，不代表已掌握传统画法，也不承诺复现任何参考作品。

2026-11-20起，按用户对前十二批的反馈回修毛边、分束、水墨交界与笔组组织。[十二批回修浏览页](examples/revision-review.html)可逐批换形、保存三项合并图与编辑源，并进入原试验台逐笔调整；[首轮记录](docs/twelve-batch-material-revision.md)说明材质回修，[第二轮记录](docs/hierarchy-water-growth-revision.md)说明水线沉积、皴笔浓淡、生长方向与收笔飞丝。随机性来自固定种子，几何与普通源保持可编辑；用户对首轮单笔质感的评价不扩为第二轮组合效果的验收。

已确认的目标、首版范围、验收与后续任务见 [需求说明](docs/requirements.md)，对应 OpenSpec 独立变更 `add-ink-landscape-technique-library`。

下一轮优先研究枝干勾皴与木结、提按顿折和沿程耗墨，再扩展禽鸟丝毛、画水线组及花鸟设色。既有技法的源码参考、实施顺序与对照要求见 [笔法改进与扩展设计](docs/technique-development-design.md)。

第一项已加入 [`createBarkDocument()`](docs/bark-document.md)：从枝干路径、局部枝径、叉口和木结控制生成普通可编辑笔组。[三组对照](examples/bark-study.html)提供主干叉口、悬垂朽木洞口与斜干换形；[整画试作](examples/bada-study.html?bark=structured)将前两处接回原画稿。当前为程序近似，视觉评价与后续控笔研究分别推进。

按最新安排，先回修已有的墨水、点皴、线皴和散锋四组，共18项。[四组优化对照](examples/existing-technique-revision.html)保留同题与换形前后的编辑源，可导出四张评价图；[实现与边界](docs/existing-technique-revision.md)说明移动/沉积墨、结构导向点皴/线皴和副毫滞后的实际范围。新行为显式选择，旧默认保留；可用 `getTechniqueRevisions(id)` 找到对应回修入口。

第13–30批已补入独立研究：共18批、54组，与原十二批合计30批、90组，覆盖100项目录。[新增批次浏览页](examples/remaining-review.html)支持换形、逐项源JSON编辑、局部试改及每批三项合图导出；[完整清单与边界](docs/remaining-technique-batches.md)记录研究范围。皴水保留缺证并仅提供中性湿域探针，品字点等候选也不升级为传统预设。公开研究索引 `getTechniqueStudies(id)` 与具名实现、阅读证据、艺术验收分别保存。

第13–22批（编号37–66）继续按反馈回修摩擦、散束、沉积、湿边、色层和线笔提按，见[进阶材质回修记录](docs/advanced-material-revision.md)。新增可选的[微扰工具](docs/perturbation.md)将固定种子的路径、压力和散束变化保存为普通源数据，保留逐笔编辑和重放。

后续自然组织回修补入[梯度噪声、fBm、泊松锚点和内缘积墨](docs/natural-authoring.md)，用于有主次的点组、叶片正侧、断续散束与局部湿边。工具保留显式种子、JSON源和既有默认覆盖，回修范围与验证见[本轮记录](docs/natural-hierarchy-revision.md)。

当前按基础笔墨的依赖逐批推进。「笔法学习册」在 `/examples/technique-atlas.html` 提供分层术语目录、来源、实现进度与成对样片；先补起收笔、提按、转折和点迹，再逐步研究墨法、水法与皴法。已读文献和学习路线见 [笔法研究](docs/brush-research.md)，可组合 API 与适用边界见 [基础用笔](docs/brushwork.md)。目录收录不等于已经实现或掌握这些技法。

[基础笔法第一批](examples/foundation-study.html)集中研究提按、中锋／侧锋、枯润／飞白。新 `createBrushDocument()` 同时保存原始笔路、技法设定、局部控制、生成器标识和生成结果，可在同一笔内调整接触与枯润，并从保存的设定继续修改。试验台提供三种笔路、同题与组合对照、PNG／JSON导出及JSON载入核对。原有视觉认可限定于回修前归档样片；不扩为全部传统用法或新材质。[接口说明](docs/foundation-brush.md)与[已确认开发方案](docs/foundation-plan.md)分别说明数据语义和后续顺序。

[起收转折第二批](examples/gesture-study.html)继续起笔、收笔和转折三组，沿用可编辑源与局部接触控制，比较露入／逆入、渐提／回收和保折／圆转的程序表现。该批显式使用`gestureModel: 'local-v1'`及新的生成器标识；默认旧模型保持，首批不迁移。[第二批观察记录](docs/gesture-review.md)说明资料、对照变量及边界。按用户最新安排，每批三个技法，合成一张对照总览展示；计划内各批完成后，再由用户安排其他Agent统一查看。

[点迹第三批](examples/dot-study.html)研究单点提按、横竖斜点势和成组点迹的疏密与呼应。新`createDotDocument()`保留显式落点、逐点控制、稳定ID与生成结果，供后续修改、保存和重编译；调用者自行组织点群，不自动填充区域。第二批和本批的艺术判断仍待用户确认，详见[第三批观察记录](docs/dot-review.md)与[点迹接口](docs/dot-document.md)。

[墨法第四批](examples/ink-study.html)研究同笔组的浓淡、逐层加墨与留明，以及干后叠加／未干浓淡互破的差别。新`createInkProcessDocument()`保存逐层笔组、浓度、水分和绝对时间；纯TypeScript生成接触密度与有限湿态交换，`renderInkProcess()`交给Canvas 2D呈现。层在指定时间整层到达，当前没有真实纸内流动、干燥或连续行笔模拟。本批艺术效果仍待评判，详见[第四批观察记录](docs/ink-review.md)与[墨层接口](docs/ink-process.md)。

[水法第五批](examples/water-study.html)将先墨后水、先水后墨与分散加水分别组织为三组。新`createWaterProcessDocument()`显式保存墨事件、清水笔路与逐滴中心、半径和ID，仍编译为可重放的`InkProcess`；清水自身不着色或擦墨，只在声明湿窗的局部交区参与有限密度交换。分散加水保持“洒水研究”的部分支持范围，不等同完整传统洒水法。按用户最新澄清，每批三个技法合成一张对照总览，艺术效果最后统一评价，详见[第五批观察记录](docs/water-review.md)与[清水事件接口](docs/water-process.md)。

[皴法第六批](examples/cun-study.html)以调用者显式组织的笔路研究披麻、斧劈和折带三项。新`createCunDocument()`保留逐笔路径、稳定身份与局部覆盖，按所选技法编译为普通`InkScene`，继续使用Canvas 2D接触绘制。错落交搭、石面关系和分层折带仍由作者组织，不以随机填充或统一山形代替；旧`builder.cun()`不自动迁移或获得艺术认可。三项合成一张总览，范围见[第六批观察记录](docs/cun-review.md)与[皴法文档接口](docs/cun-document.md)。

[线皴第七批](examples/line-cun-study.html)沿用可编辑皴笔文档，研究解索的屈曲穿插、乱柴的直折交错和牛毛细线形态。作者保留逐笔骨线、粗细、疏密、留脉与叠压责任，库提供接触和局部动作默认。牛毛阅读仍部分支持，细短曲线只是待核形态假设，不代表已取得可靠传统笔序或艺术认可。三项合成一张总览，最后统一评价，见[第七批观察记录](docs/line-cun-review.md)。

[环抱、点皴与筋脉第八批](examples/branch-cun-study.html)比较卷云／云头的环抱线研究、雨点／豆瓣的短点研究与荷叶皴的分歧筋脉。前两组各共用研究接触基础，保留逐名资料和待核边界，不因此裁定同义或虚构互斥预设。作者提供开面、聚散、主次交接及笔序，库执行接触与上重下轻等控制；不自动生成分支山形。三组合成一张总览，艺术最后统一评价，见[第八批观察记录](docs/branch-cun-review.md)。

[点苔、点叶与夹叶第九批](examples/vegetation-study.html)把点笔与细线用于作者组织的石脊、枝架和叶簇。新`createVegetationDocument()`按稳定单元与逐笔身份保存结构线、点叶和夹叶两边的显式路径，供局部修改及JSON重建；不生成固定树冠或随机填叶。夹叶仍只作部分支持的形态研究，三组合成一张总览，艺术最后统一评价，见[第九批记录](docs/vegetation-review.md)与[植被文档接口](docs/vegetation-document.md)。

[介字、个字与叶簇第十批](examples/leaf-cluster-study.html)研究介字与个字的分向叶组，以及攒三聚五的聚散组织。三项共享`dot-leaf`接触基础，作者逐笔提供不同叶组；示例的四笔与三笔只是本次标注选择，不是传统固定数额。新增`transformVegetationUnit()`可对一个显式叶组整组平移、绕指定支点旋转和缩放笔宽，保留身份与其余源。品字点仍待图式核实；三组合成总览、最后统一评价，见[第十批记录](docs/leaf-cluster-review.md)。

[胡椒、破笔与松针第十一批](examples/pepper-broken-pine-study.html)比较细粒点簇、相关分束接触形态与偏向针束组织。三项仍编译为普通`VegetationDocument`；新增`createSplitVegetationUnit()`按作者指定束偏移与束宽展开显式多笔源，供逐束修改和整组变换，不宣称还原真实散锋物理。胡椒点的密簇与细白、松针的长短扇向及枝端关系均由作者组织；破笔点和松针阅读仍为部分支持。三组合成一张总览、最后统一评价，见[第十一批记录](docs/pepper-broken-pine-review.md)。

[竹叶、梅花点与双勾第十二批](examples/bamboo-plum-outline-study.html)继续研究尖长竹叶的枝叶穿插、花簇式树叶的短叶围攒，以及两侧轮廓的合拢、宽窄和叠压断续。三项复用普通植被文档与整组变换，竹叶和梅花点仍为部分支持的形态研究；梅花点不等同画梅花实物，绘画双钩与复制法帖分开。双边内区保持透明，后缘省略由作者源段明确表达，不以白色填充覆盖既有墨迹。三项合成一张总览、最后统一评价，见[第十二批记录](docs/bamboo-plum-outline-review.md)。

[100项逐条学习总册](docs/learning/README.md) 为每条补充动作、笔迹观察、适用对象、误区、程序转译假设及来源定位。资料阅读的明确支持、部分支持、异说和未确证分别记录；它们不改变代码实现或艺术验收状态。学习册目录可以展开这些笔记，也可用 `getTechniqueReading(id)` 读取纯数据。

[《芥子园画谱》专题选读](docs/learning/jieziyuan.md)记录版本范围、原文短句与树石叶组织观察；[三项代码对照](examples/jieziyuan-study.html)复用现有笔触研究群树主副、石面皴擦和附枝叶群，提供12个同题/换形画面、逐笔编辑和合图导出。公开图版仅作阅读来源，未加载进渲染；当前为选读与程序假设，尚待艺术评价。

基础笔法新增可选平滑笔路与不均匀丝束飞白。运行预览后，可从「笔法对照」进入固定种子局部样片，比较折线与平滑、急转换形和枯润梯度；本轮观察与局限见 [笔法实验记录](docs/brush-study.md)。

「岩石分面」提供直立石、斜卧石和三石组合的对照：两组复用42笔皴擦、6条骨线和底墨，比较均匀铺笔与按亮、侧、暗面组织的变化，可切换分面示意并导出 PNG／JSON。配方继续由普通 `stroke`／`wash` 组合，见 [岩面实验记录](docs/rock-planes.md)。

「剑峰云海」改用开放锐脊、沿岩面下落的长劈干擦和独立透明云海遮罩，组合淡远山、焦墨松树、红日与飞鸟。几何与材质预计算后缓存为裁剪图层，时间定位只做图像合成；支持导出、编辑和载入笔路 JSON。它是 `examples/scene.js` 中的完整场景研究，接口与缓存边界见 [剑峰场景说明](docs/sword-landscape.md)。

## 开发与使用

需要 Node.js 20 或更高版本。取得源码后运行：

```sh
npm install
npm run build
npm run dev
```

开发页面地址以终端输出为准。检查代码与测试：

```sh
npm run check
npm test
```

这是独立的 npm 项目，可构建后供其他项目引用，也可在消费项目中通过 `npm install /path/to/ink-landscape` 安装本地源码包。`package.json` 中的 `private: true` 用于防止意外发布到 npm，不妨碍在 GitHub 开源或本地复用；不会自动公开 npm 包。

## 最小示例

下面是已构建项目中的浏览器示例。`createInkScene()` 返回 builder，调用绘制方法积累数据，再将 `snapshot()` 交给渲染器。

```html
<canvas id="ink" width="960" height="600"></canvas>
<script type="module">
  import { createInkScene, renderCanvas } from './dist/index.js';

  const canvas = document.querySelector('#ink');
  const ctx = canvas.getContext('2d');
  const scene = createInkScene({
    width: 960, height: 600, seed: 42, background: '#f3efe4'
  });

  // 轮廓与笔势由调用者创作，库不预设整幅山水构图。
  const slope = [
    { x: 160, y: 500 }, { x: 360, y: 160 },
    { x: 420, y: 230 }, { x: 500, y: 130 },
    { x: 740, y: 500 }
  ];
  scene.wash(slope, { ink: '#30332d', opacity: 0.18, passes: 3 });
  scene.cun(slope, {
    technique: 'pima', count: 70, length: 90,
    direction: { x: 0.25, y: 1 },
    width: 3, dryness: 0.7, opacity: 0.45
  });
  scene.stroke([
    { x: 160, y: 500, pressure: 0.25 },
    { x: 360, y: 160, pressure: 0.75 },
    { x: 420, y: 230, pressure: 0.35 }
  ], { width: 7, dryness: 0.45, smoothing: 'catmull-rom', start: 0, duration: 2 });

  renderCanvas(ctx, scene.snapshot(), { time: 2, paperTexture: 0.06 });
</script>
```

## 接口边界

| 调用 | 输入与作用 |
| --- | --- |
| `createInkScene({ width, height, seed?, background? })` | 创建场景 builder |
| `builder.stroke(points, options?)` | 沿 `{ x, y, pressure? }` 点序列生成笔触；可设置宽度、墨色、枯湿、笔头与时间 |
| `builder.wash(outline, options?)` | 在轮廓内生成墨洗；可设置浓度、边缘变化与叠加次数 |
| `builder.cun(outline, options?)` | 在区域内生成 `pima` 或 `axe` 皴擦笔触；支持数量、长度、方向与方向场 |
| `builder.snapshot()` | 取得可保存、可继续编辑的 `InkScene` 数据 |
| `sampleStrokePath(points, { spacing?, smoothing? })` | 在纯 TypeScript 中采样笔路，返回坐标、压力、弧长与单位法线 |
| `createBrushStroke(points, options?)` | 组合起收、提按、转折与接触变化，返回普通可保存的 `StrokeMark` |
| `createBrushDocument(points, options?)` | 保存原始笔路、可组合动作、局部接触控制及生成结果 |
| `reviseBrushDocument(document, { points?, options? })` | 修改编辑源并重新生成，原文档保持不变 |
| `compileBrushRecipe(recipe)` | 按保存的生成器与设定重新生成普通 `StrokeMark` |
| `sampleBrushContact(mark, { spacing? })` | 纯 TypeScript 采样锋尖、接触中心、边界与局部状态 |
| `createDotMarks(positions, options?)` | 在调用者落点上生成圆、横、竖、斜及成组点迹，不自动填充区域 |
| `createDotDocument(positions, options?)` | 每个显式落点生成一笔，并保存逐点设定、稳定ID和可编辑配方 |
| `reviseDotDocument(document, { positions?, options? })` | 修改点迹编辑源并重新生成，逐点位置数组整体替换 |
| `compileDotRecipe(recipe)` | 从保存的点迹配方重建普通`StrokeMark[]` |
| `createInkProcessDocument(layers, options)` | 保存显式笔组、逐层浓度、水分、时间窗口与编译后的墨层程序 |
| `reviseInkProcessDocument(document, { layers?, options? })` | 从编辑源修改墨层；层数组整体替换，公共选项浅合并 |
| `compileInkProcessRecipe(recipe)` | 按版本化配方重建独立于浏览器的`InkProcess` |
| `createWaterProcessDocument(events, options)` | 显式区分清水与墨事件，保存清水笔路、逐滴位置及到达先后 |
| `reviseWaterProcessDocument(document, { events?, options? })` | 从编辑源修改事件；事件数组整体替换，公共选项浅合并 |
| `compileWaterProcessRecipe(recipe)` | 从清水事件配方重建普通`InkProcess`，清水编译浓度固定为零 |
| `createCunDocument(strokes, options)` | 保存显式皴笔及技法执行设定，编译为普通`InkScene` |
| `reviseCunDocument(document, { strokes?, options? })` | 从原始逐笔路径重新生成；笔数组整体替换，公共选项浅合并 |
| `compileCunRecipe(recipe)` | 从版本化皴法编辑源重建可重放场景 |
| `createVegetationDocument(units, options)` | 保存作者组织的结构线、苔点和逐叶笔组，编译为普通`InkScene` |
| `reviseVegetationDocument(document, { units?, options? })` | 从编辑源修改植被单元；单元数组整体替换，公共选项浅合并 |
| `compileVegetationRecipe(recipe)` | 从版本化植被编辑源重建可重放场景 |
| `createStrokeGroupDocument(groups, options)` | 执行作者笔组及逐笔控制，保存稳定身份和可选父组关系，不推断技法或对象结构 |
| `createTreeMacro(options)` | 生成有界递归分枝或执行自有枝架，输出共享交点、收尖笔路和具名附着点 |
| `createRockMacro(options)` | 组合骨线、淡面、皴擦与点苔，可传自有轮廓、区域、岩脊和方向场 |
| `createBirdMacro(options)` | 输出可替换的七类鸟部件，以显式落脚点定位，保留普通笔组和附着数据 |
| `compileStrokeGroupRecipe(recipe)` / `reviseStrokeGroupDocument(document, patch)` | 重建或修改普通笔组源，保留其他笔组身份与材质种子 |
| `getTechniqueStudies(id)` | 返回100项目录对应的独立研究批次与浏览入口；不代表具名预设或艺术通过 |
| `transformVegetationUnit(document, unitId, transform)` | 对一个作者单元平移、绕显式支点旋转或按有效笔宽缩放；重建普通植被文档 |
| `rasterizeInkProcess(process, { time?, cellSize? })` | 在纯TypeScript中计算密度场及有限湿态交换 |
| `renderInkProcess(ctx, process, { time?, cellSize? })` | 将墨层密度绘制到Canvas 2D，独立于普通场景入口 |
| `findTechniques({ category?, query?, implementation? })` | 检索分层技法目录、出处与当前实现进度 |
| `renderCanvas(ctx, snapshot, { time?, paperTexture?, clear? })` | 将场景绘制到 Canvas 2D，返回绘制统计 |

`start`、`duration` 与渲染选项 `time` 使用绝对秒数。省略 `time` 时显示全部完成的笔触；同一时间点可重新渲染。固定数据、种子及时间面向可重复结果设计，但不承诺不同浏览器间的像素完全一致。默认 `clear: true` 会重绘整个画面；`clear: false` 用于在已有画面上叠加，会受之前绘制结果影响。

`smoothing` 省略时保留原始折线；`'catmull-rom'` 在控制点间插入平滑曲线，并缓动压力变化。曲线可能越出控制点范围，刻意折笔宜使用 `'linear'`，精确区域限制用 `clip`。预览页默认选择平滑。旧 JSON 仍能读取，但本轮飞白材质已改变，相同数据的成图需同时固定库版本。

Builder 返回的笔触和快照会被冻结，避免外部修改影响正在使用的版本。调整已生成笔触时，可通过对象展开与 `map` 创建新场景，再交给渲染器：

```ts
const original = builder.snapshot();
const revised = {
  ...original,
  marks: original.marks.map(mark => mark.kind === 'stroke'
    ? { ...mark, width: mark.width * 1.2 }
    : mark)
};
renderCanvas(ctx, revised);
```

也可保存为 JSON。在 JavaScript 中，`structuredClone(original)` 可取得独立的可写副本；TypeScript 会保留原有的 `readonly` 类型，建议采用上面的重建方式。

需要继续按技法含义修改时，保存 `BrushDocument`：

```ts
const document = createBrushDocument(points, {
  id: 'editable-stroke', seed: 42, width: 28,
  controls: [
    { at: 0, pressure: .3, side: 0, dryness: .15 },
    { at: .5, pressure: 1, side: .5 },
    { at: 1, pressure: .2, side: 1, dryness: .85 },
  ],
});
const revised = reviseBrushDocument(document, { options: { width: 32 } });
const mark = compileBrushRecipe(JSON.parse(JSON.stringify(revised.recipe)));
scene.stroke(mark.points, mark);
```

以上函数从包入口导入。`at`为生成路径的归一化弧长，`pressure`乘以已有压力；稀疏通道独立插值，控制上限128个包含自动首尾端点。修改时 `controls` 数组整体替换。新接口的接触方向由局部控制表达，拒绝旧笔头参数 `nib`、`tipAngle` 和直接传入 `brush`；详见[完整使用说明](docs/foundation-brush.md)。

皴擦的 `flow(point)` 只在生成笔触时使用，不进入序列化数据。更多参数与使用边界见 [技法说明](docs/techniques.md) 和 [类型定义](src/types.ts)。

## 与 Agent、WikiSkill 及视频流程的关系

Agent 负责构图、轮廓、笔势和技法选择；本库提供可组合的执行工具。调用者可以直接编辑场景数据和自行生成路径，无需服从固定的山水模板。

WikiSkill 用于记录创作方法、观察依据和适用范围，不能替代代码库。未来可由 HyperFrames 驱动绝对时间来渲染连续帧；当前独立原型尚未接入正式视频业务，也未验证动画艺术效果。

按最新澄清继续分批实现，每批三个技法合成一张对照总览，逐项留存工程检查和局限，艺术效果最后统一评价；计划内各批完成后由用户安排其他Agent统一查看，实际Agent调用、修改、保存和重放闭环保留为后续任务。默认推荐给创作Agent的能力应具备明确的验收范围；实验原型另行标识并显式选用。

仓库不包含参考版权图片、凭据、私有服务数据或业务实现。请保留作品的绘制源码和参数，自行确认加入的素材及依赖许可。

## 许可

[MIT](LICENSE) · Copyright © 2026 ink-landscape contributors
