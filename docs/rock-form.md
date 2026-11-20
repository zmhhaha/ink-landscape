# 可编辑的块石造形

`structured-v1` 是独立块石的程序造形研究：用位置、尺度、石势和种子生成轮廓、骨线与分面，再用已有 `axe`／`jiesuo` 接触组织皴擦。生成与重建只处理 TypeScript 数据，不依赖浏览器或 Canvas。Canvas 2D 负责显示最终场景。

本轮提供立石 `upright`、卧石 `reclining`、斜石 `leaning`，以及大斧劈近似 `axe`、解索近似 `jiesuo`。这些名称表示当前程序转译的范围，尚待艺术评价。

## 最少参数接入

```ts
import { createRockMacro, createStrokeGroupDocument } from 'ink-landscape';

const rock = createRockMacro({
  construction: 'structured-v1',
  position: { x: 80, y: 40 },
  size: 260,
  pose: 'upright',
  technique: 'axe',
  seed: 17,
});

const document = createStrokeGroupDocument(rock.groups, {
  width: 420,
  height: 360,
  seed: 17,
});
```

宏仍返回普通的 `{ version, kind, groups, attachments }`。`groups` 中的骨线、淡触、裂隙和皴笔均是带身份的可编辑点列，可以与树、鸟或调用者的笔组组合。宏沿用既有 `moss`、`mossCount`、`mossAnchors` 和附着点规则；不需要点苔时传 `moss: false`。多个宏组合时应分别指定不同 `id`。

`construction` 必须显式设置为 `structured-v1`。省略它继续使用原山石宏的默认造形与通用侧锋碎面；原来的默认笔法与渲染器没有切换。结构分支不接受旧宏的 `outline`、`region`、`ridges`、`textureCount` 或函数式 `flow`，完整自供结构应改用下述 `structure`。

## 生成结构和文档

`createRockForm()` 只生成 `RockStructureSource`；`createRockDocument()` 将结构编译为普通笔组及 `InkScene`：

```ts
import { createRockForm, createRockDocument } from 'ink-landscape';

const structure = createRockForm({
  position: { x: 35, y: 110 },
  size: 350,
  pose: 'reclining',
  seed: 17,
});

const rock = createRockDocument({
  width: 420,
  height: 360,
  technique: 'jiesuo',
  seed: 17,
  detail: 2,
  idPrefix: 'foreground-stone',
  structure,
});
// rock.recipe：结构配方；rock.groups：普通笔组；rock.result：场景。
```

也可以省略中间步骤，直接把 `position`、`size`、`pose` 传给 `createRockDocument()`，由它自动生成结构。实际接口没有 `layout` 字段。`structure` 与顶层 `position`／`size`／`pose` 互斥；`seed` 可以与 `structure` 并用，用于后续笔触组织及材料重建。

| 输入 | 含义与默认值 |
| --- | --- |
| `position` | 自动造形的场景坐标偏移，默认 `{ x: 0, y: 0 }`。 |
| `size` | 自动造形的正尺度，默认 `220`；各石势采用不同宽高关系，不保证轮廓恰好落入 `size × size` 方框。 |
| `pose` | `upright`、`reclining`、`leaning`，默认 `upright`。这是有限的造形规则，不是任意姿态求解。 |
| `technique` | 文档接口必须给出 `axe` 或 `jiesuo`；结构宏中默认 `axe`。 |
| `seed` | 安全整数种子，默认 `1`；内部规范化为无符号32位值。 |
| `detail` | 整数 `1..3`，默认 `2`，控制每面的有界笔量；不表示画质评分。 |
| `idPrefix` | 文档内笔组命名空间，默认 `rock`。宏使用其 `id`。 |
| `width`、`height` | 文档画幅；不是自动缩放参数。结构和笔路使用场景坐标。 |

`createRockDocument()` 还接受普通笔组文档的 `background`、`ink`、`strokeWidth`、`dryness`、`opacity`。这些是执行选项；完整字段以 [`RockDocumentOptions`](../src/rock-form-types.ts) 为准。

## 自供结构与范围限制

调用者可以完整提供 `RockStructureSource`，替换自动造形。库不会从一个任意 `outline` 推断石面、裂隙或正确的皴法。

| 结构字段 | 调用者提供的内容 |
| --- | --- |
| `outline` | 整石轮廓，多边形场景坐标。 |
| `ridges` | `{ id, points }` 骨线；点可带 `pressure`，可用终点零压力表达提起。 |
| `faces[].id` | 稳定且在该结构内唯一的石面身份。 |
| `faces[].region` | 该面允许落笔的多边形，须完整位于 `outline` 内。 |
| `faces[].flow` | 非零长度的坡向点列，引导面内皴线；不要求处在面的几何中心。 |
| `faces[].tone` | `light`、`middle`、`dark`，选择不同的疏密和墨色组织。 |
| `faces[].fractures` | 可选的具名裂隙点列，供局部深触附着。 |
| `faces[].reserves` | 可选的纸白多边形；候选笔触靠近这些区域时整笔省略，不是先涂满再擦白。 |

一份结构支持 `1..8` 个面、至多 `32` 条骨线；每面至多 `8` 条裂隙、`8` 个纸白区域。多边形为 `3..128` 个有限坐标顶点，线为 `2..512` 个点且总长度大于零，显式压力在 `0..1` 内。空面积、多余字段、重复身份及超出范围的输入会拒绝。区域和点列的检查不构成通用网格修复或任意几何的视觉理解。

每个面的纹理随机流由执行种子、命名空间和该面身份确定，各接触再按自己的身份取样；面数组不用于连续消耗同一个全局随机流。保留身份与输入可避免插入另一面时仅因重新编号而改写已有面的随机选择。改动共享骨线、该面的几何、坡向或执行选项仍可改变其结果，改变 `idPrefix` 也会改变随机流。

每面的候选次数与接触数量有上限；纸白约束、狭窄区域或不合适的坡向可能使实际笔数少于目标。增加 `detail` 不会强制填满每一面。组合后仍受普通笔组文档的总体预算约束。

## 两层配方的保存和修改

结构文档配方为 `{ version: 1, generator: 'ink-structured-rock-v1', structure, options }`。它保存已经解析的完整结构与执行选项；最初的 `position`／`size`／`pose` 不作为第二套隐含几何保留。返回的数据独立拥有并冻结，可以经 JSON 保存。

```ts
import { compileRockRecipe, reviseRockDocument } from 'ink-landscape';

const savedRecipe = JSON.parse(JSON.stringify(rock.recipe));
const rebuiltScene = compileRockRecipe(savedRecipe);

const anotherTechnique = reviseRockDocument(rock, {
  options: { technique: 'axe', detail: 3 },
});

const anotherForm = reviseRockDocument(rock, {
  structure: createRockForm({
    position: { x: 90, y: 45 },
    size: 270,
    pose: 'leaning',
    seed: 18,
  }),
  options: { seed: 18 },
});
```

`compileRockRecipe()` 返回重建后的 `InkScene`；`reviseRockDocument()` 返回新的完整 `RockDocument`。仅修改执行种子会在已保存的结构上重新组织笔触，不会重新调用自动造形。改变石势时应生成或编辑结构，再通过 `structure` 替换；不能把 `pose` 塞进执行选项。

另一层是 `ink-stroke-groups-v1` 普通配方：用 `createStrokeGroupDocument(rock.groups, sceneOptions)` 保存已经生成的逐笔源，再用普通笔组编译、修订接口编辑。修改普通笔组不会反向推导或同步结构配方；若再次编译原结构配方，得到的是该结构生成的笔触，并不包含后来逐笔手改的结果。

## 本轮图版依据

依据是[《芥子园画传》公开图5](https://yihua.art/wp-content/uploads/2022/02/jzycjwjkx-5.jpg)，来自[以画雅集二次分发预览](https://yihua.art/jie-zi-yuan-hua-zhuan-quan-ji.html)，访问日期2026-11-20。其所述普林斯顿藏本归属、康熙彩印版次未与原馆牌记独立核验；本轮没有读取付费完整 PDF，也未把公开文件序号当作原刻页码。

- 左页可读「大斧劈法」「馬遠夏圭多爲之」。横展的石体以不等高台肩和斜长断面组织，宽削触、窄长触与短断触混用；深色集中在断口、立边及基脚，中央仍有成片亮面。
- 右页可读「解索皴法」。较高的石体由不等大凸面叠接，深窄裂隙分隔宽亮面；长曲线依各自凸面成组下垂，起止有别，局部夹短弧。

程序据此分别安排宽削主触与副触、随凸面弯曲的长线组、少数深缝和开放面。立／卧／斜三种自动造形及其参数是本库作者的转译试验，不宣称原图提供了这三种姿态的完整生成算法。「画石起手当分三面法」另依[央美介绍的转引](https://i.cafa.edu.cn/waterprint/ch/chancieb/?ai=300002)，尚未核得该句的清晰原页。

木刻线形和印墨颗粒不能提供真实运腕、笔序、笔毫、宣纸或墨水交换的物理测量。当前范围是独立块石，不扩大为整座山体、完整山水生成或传统皴法全部表现的认可。更多选读边界见[《芥子园》专题](learning/jieziyuan.md)。

## 对照页和导出

[山石造形对照页](../examples/structured-rock-study.html)包含三项主样片：立石、卧石、斜石；另有两项换形研究：预登记种子的斜石和调用者自供的四面结构及纸白口。每项依次显示同骨架旧宏、新大斧劈、新解索和代码结构示意。旧宏没有解索选项，同一旧输出分别与两种新法比较；笔量、用笔和组织同时改变，不作为单变量实验。

页面分别导出一张主样片合图 `structured-rock-main.png`、一张换形合图 `structured-rock-transfer.png`，以及全部编辑源 `structured-rock-sources.json`。原图只作为出处链接，不参与绘制。结构列用于解释代码输入，不属于水墨成图。

导出源中的 `originalSemanticRecipes` 保存**生成时的原始结构配方快照**。页面编辑器修改所选新法的普通笔组配方，并以 `manualEdits` 标记；它不会同步修改 `originalSemanticRecipes` 或结构示意列。手改后的当前画面应使用当前普通配方重建，不能误用原始结构配方并期望保留手改。还原操作恢复所选新法的初始普通源。

## 验证状态

249项 `npm test` 和类型检查通过，其中13项块石专项覆盖冻结源、结构及普通笔组重建、姿态与平移缩放、方向导引、局部编辑隔离、预算与坏输入。留白检验覆盖底触、裂隙与纹理的实际接触范围；完全覆盖的留白可输出空笔组，宏默认点苔也不重新填入。旧宏默认的两份输出摘要与独立编译的 `b6c96a5` 一致。

实际浏览器20画面的JSON重建及 `8→-1→8` 定位像素一致。移动卧石解索的一笔，仅改变对应画面，还原后主合图像素一致。10份结构配方与普通源、宏输出在Node中复核，和浏览器保存源的最大数值差为 `5.684341886080802e-14`；不承诺不同运行时或后端逐像素一致。

预登记种子9137和自供四面结构60421在主样片调整结束后检查，未针对它们改组织规则。两种皴法与坡向关系仍可见；四面源不是对主样片整体旋转。可见局限包括：硬折外壳的变化范围有限；斧劈的主深触可能形成锐黑长刃，淡触仍偏梳纹；解索仍有依缝附着的根须感，各面贴束的倾向未消失；减少底墨使部分面偏空弱。显式纸白的合图辨识也有限，需结合接触核验。当前为工程原型，艺术效果待用户评价。

两张评价图、完整编辑源、两倍局部及验证保留在 `D:/codex-work/archives/ink-landscape/20261120/structured-rock-study/`。工程验证、图版释读和用户艺术判断分别记录。
