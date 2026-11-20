# 枯木寒鸦代码临摹

参照[故宫博物院藏《朱耷枯木寒鸦图轴》](https://www.dpm.org.cn/collection/paint/228289.html)，藏品号新00108969，纸本水墨，纵178.5厘米、横91.5厘米。此例研究四鸟的姿态、枯木分叉、右侧岩面与大片留白，仍是第一版代码习作，艺术效果待评价。

构建后打开 `/examples/bada-study.html`，可保存全图与编辑源。默认画幅540×1053，种子821730。没有把原作像素、题款或印章放进绘制程序。

## 源与材料

- `examples/bada-tree.mjs`：作者提供的树、枝与地面笔路。
- `examples/bada-rocks.mjs`：右侧岩面及局部折块。
- `examples/bada-crows.mjs`：四组不同姿态的鸟；胸腹靠未落墨区域留纸，只有眼白使用纸色小笔。
- `examples/bada-composition.mjs`：把观察坐标转换到画幅，生成17组、333笔普通 `StrokeGroupDocument`。
- `examples/bada-material.mjs`：将树石笔组交给既有 `InkProcess` 密度模型，四鸟交给既有接触笔渲染器；不修改库的默认材质。

主墨面使用五个有明确位置和网格尺寸的材料区域。它们各自保留墨层、笔路、压力、浓度、裁切与种子。分区用于满足密度场的容量限制；同一笔不按截图切片，也不包含参考贴图。材料区域以正片叠底合成，鸟笔最后叠入。

## 重建与局部修改

导出的JSON生成器为 `bada-ink-composition-v1`，保存五份标准墨层配方、四鸟的标准笔组配方，以及材料区域的位置和网格。用示例模块重建：

```js
import { compileBadaInkComposition, drawBadaInkComposition }
  from './examples/bada-material.mjs';

const composition = compileBadaInkComposition(savedRecipe);
drawBadaInkComposition(canvas, composition);
```

也可从几何源继续改画，再重新编译材料：

```js
import { createBadaDocument, prepareBadaDocument }
  from './examples/bada-composition.mjs';
import { reviseStrokeGroupDocument } from './dist/index.js';

const original = createBadaDocument();
const groups = JSON.parse(JSON.stringify(original.recipe.groups));
const frontBird = groups.find(group => group.id === 'crow-center-front');
frontBird.strokes.find(stroke => stroke.id === 'tail-main').points.at(-1).y += 7;
const edited = reviseStrokeGroupDocument(original, { groups });
const composition = prepareBadaDocument(edited);
```

几何创建、材料编译和JSON重建可在Node运行；`drawBadaInkComposition`由浏览器提供Canvas。静态绘制采用固定绝对时间，不依赖墙钟。

## 验证与范围

已检查标准墨层和鸟笔的JSON精确重建、修改单根尾羽时其他笔与材料区域不变，以及浏览器重复绘制、重新载入和导出配方重绘。工程检查不表示已完成原作艺术效果验收。

此例也作为图片学习框架的本地手工候选执行：冻结参考与自包含工具源码，调用真实图片渲染链路，保存候选与独立外部看图评价。这个模式不等于已启动线上模型自动创作、自动评审或知识发布。项目身份与执行回执随私有归档保存，公共仓库只包含本库的示例源。
