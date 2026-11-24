# 可编辑点迹文档

第三批研究单点提按、横竖斜点势，以及成组点迹的疏密与呼应。`createDotDocument`把调用者的落点、逐点设定、公共控制和生成结果一起保存；每个落点生成一条独立的短笔路，不在点之间连线，也不随机填充区域。点形是程序候选，传统适用范围见[第三批观察记录](dot-review.md)。

数据生成、修改与编译使用纯 TypeScript，在 Node 中不需要 DOM 或 Canvas。Canvas 2D只在最后负责绘制；预览入口为[点迹第三批](../examples/dot-study.html)。

## 创建、修改、保存与重放

```ts
import {
  createDotDocument, reviseDotDocument, compileDotRecipe,
} from 'ink-landscape/brush';
import { createInkScene, composeInkScene } from 'ink-landscape/core';
import { renderCanvas } from 'ink-landscape/canvas';

const document = createDotDocument([
  { id: 'lead', x: 70, y: 80, pressure: .8, shape: 'oblique' },
  { id: 'answer', x: 130, y: 105, pressure: .6, angle: -.25 },
  { id: 'finish', x: 180, y: 90, pressure: .9, size: 30 },
], {
  seed: 261119, size: 24, shape: 'round',
  axis: 'center', dryness: .3, start: 0, duration: .6, interval: .2,
  controls: [
    { at: 0, side: 0, dryness: .15 },
    { at: .6, side: .4 },
    { at: 1, side: .2, dryness: .75 },
  ],
});

// 以稳定ID选择要改的一点；提供positions时整体替换数组。
const revised = reviseDotDocument(document, {
  positions: document.recipe.positions.map(point => point.id === 'answer'
    ? { ...point, x: point.x + 12, angle: .35 }
    : point),
});
const saved = JSON.stringify(revised);
const restored = JSON.parse(saved);
const marks = compileDotRecipe(restored.recipe);

const scene = createInkScene({ width: 280, height: 220, seed: 261119 });
for (const mark of marks) scene.stroke(mark.points, mark);
renderCanvas(context, scene.snapshot(), { time: 1 });
```

`context`由浏览器调用者提供。仅重放既有笔迹时，可直接把保存的`result`放入场景；需要按设定修改或核对生成关系时，再编译`recipe`。从外部JSON读取后，应校验文档结构，并按需要比较重新编译的结果与保存的结果；一段可被JSON解析的文本并不自动成为有效文档。

## 文档结构与接口

| 接口或字段 | 作用 |
| --- | --- |
| `createDotDocument(positions, options?)` | 创建`DotDocument`；每个落点对应一笔，最多2048笔。空数组仍校验公共设定。 |
| `compileDotRecipe(recipe)` | 按保存的编辑源生成`readonly StrokeMark[]`。 |
| `reviseDotDocument(document, { positions?, options? })` | 修改编辑源并返回新文档；原文档保持不变。 |
| `document.version` | 文档版本，目前为`1`。 |
| `document.recipe` | `version: 1`、`generator: 'ink-dot-contact-v1'`、`positions`和`options`。 |
| `document.result` | 可独立保存、绘制的普通笔迹数组，与落点顺序一致。 |
| `document.documents` | 每一点生成的`BrushDocument`数组，保存该点展开后的短笔路、接触控制与结果。 |

`recipe.positions`保留逐点原始配置，不把公共选项逐点抄写；`documents`是本次编译展开的数据。希望移动、调整或重新组织点群时，修改顶层点迹编辑源。若直接编辑某个展开后的`BrushDocument`，那会成为独立笔迹，不会反向更新点迹配方。

输入数据与返回文档各自拥有独立副本，返回值深冻结。`options`浅合并；新的`positions`、`controls`或其他数组会整体替换，调用者须自行保留未改的成员。编译拒绝未知配方版本、生成器和不支持的设定；修改还检查文档版本。

## 落点与公共设定

落点是锋尖短笔路的起点，**不是墨迹的几何中心**。点腹会随点势、提按和接触偏置向一侧展开。

| 字段 | 默认值与含义 |
| --- | --- |
| `x`、`y` | 必填有限坐标，由调用者决定点群的位置关系。 |
| `pressure` | 默认1，范围0–1；乘以短笔路的提按压力。0保持整笔不落墨。 |
| `id` | 可选的非空唯一ID；省略时用公共`idPrefix`和索引生成。 |
| `shape` | 可逐点覆盖公共点势；`'round'`、`'horizontal'`、`'vertical'`或`'oblique'`，公共默认`'round'`。 |
| `size` | 可逐点覆盖公共尺寸；公共默认24，必须为正数，单位为场景坐标。它不是最终墨迹包围盒。 |
| `angle` | 弧度，公共和逐点默认均为0；逐点角度与公共角度相加，再旋转基础点势。 |
| `controls` | 可逐点覆盖公共局部接触控制；给出时整体替换公共数组。 |
| `start` | 可逐点指定绝对起笔秒数；省略时为公共`start + 索引 × interval`。 |

公共`DotProgramOptions`还支持`idPrefix`（默认`'dot'`）、非负`interval`（默认0），以及[基础笔法文档](foundation-brush.md)中的墨色、透明度、种子、裁切、绝对时长、`axis`、起收转折、提按与`controls`等组合设定。`id`、`width`、`gestureModel`和`smoothing`由点迹编译器管理，不能作为公共点迹选项传入。尺寸使用`size`，各笔身份由逐点`id`或`idPrefix`管理。

每点先生成短距离入纸、按下与提出的轨迹，原始短笔路首尾压力为0，按压峰值乘以落点`pressure`；后续接触控制和组合动作仍会影响结果。基础方向在画布坐标中分别为圆点／横点0、竖点π/2、斜点−π/3，再加公共和逐点角度。内部使用`local-v1`动作模型及平滑短笔路。这保留点的运行过程，不以圆形盖章替代短笔路。模型不模拟实测笔速、驻笔时间或笔毫弹性。

`controls.at`按该笔最终生成路径的归一化弧长解释；改变点势、尺寸或起收动作后，其空间位置可能变化。控制通道的含义、插值和上限沿用基础笔法接口。点迹外层的`angle`旋转短笔路；`controls.angle`仍表示相对局部切线的接触展开方向，两者作用不同。

## 身份、种子与时间

显式ID参与推导该点的材质种子。同一公共种子和稳定ID下，移动一点或重排已有ID，不会只因索引变化而换掉该点的材质种子。实际像素仍会随位置、点势、控制和笔迹叠加顺序改变；ID稳定不等于像素不变。

匿名落点按索引分配ID，插入或重排可能改变后续点的身份和种子。需要后续Agent逐点编辑时，建议创建时就给每一点显式、唯一的ID。公共`idPrefix`可为源文档选择不同前缀；独立文档省略它时都从局部`dot-1`开始。

多个点迹文档可通过命名空间组合，保留每一点原有种子与绝对时间：

```ts
const left = createDotDocument([{ x: 35, y: 70 }, { x: 55, y: 85 }]);
const right = createDotDocument([{ x: 155, y: 60 }, { x: 180, y: 90 }]);
const combined = composeInkScene([
  { namespace: 'left-cluster', source: left },
  { namespace: 'right-cluster', source: right },
], { width: 240, height: 160, seed: 7 });
```

每个命名空间在一次组合中须唯一；同内容的两个实例也用不同命名空间区分。`composeInkScene()`不会修改原始点迹ID或重新计算已保存的材料种子。直接逐笔插入builder时仍需让输出ID全局唯一；重复显式ID会被拒绝。

时间使用绝对秒数，逐点`start`会替代该点由索引算出的起点。`interval`只安排各点先后，不自动形成视觉上的“起、带、应”；重排没有显式`start`的落点会改变时间。渲染器的`time`控制路径显露，不表示真实书写速度或纸内扩散。

固定输入、种子、绝对时间和代码版本可用于重建同一数据结果。逐像素重放还需固定场景、画布尺寸、渲染版本和浏览器后端；生成器标识不能代替实际库版本，也不承诺跨浏览器的像素一致。

## 与既有点迹接口的关系

旧`createDotMarks`继续保留原来的数据与行为，包括`paired`、`triple`、`cluster`等预设组态、`spread`、`count`和`groupInterval`。它返回普通笔迹数组；其形状集合和尺寸默认值与新文档接口不同。

新接口以每个显式落点对应一笔，调用者自己组织两点、三点或多点关系，并保留可修改的源配置。它不接受旧组态形状，也不把基础点群自动命名为点苔、点叶或米点皴。这些对象还需要各自的结构、组织和作品观察依据。
