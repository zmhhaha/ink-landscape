# 枯木寒鸦代码临摹

参照[故宫博物院藏《朱耷枯木寒鸦图轴》](https://www.dpm.org.cn/collection/paint/228289.html)，藏品号新00108969，纸本水墨，纵178.5厘米、横91.5厘米。此例研究四鸟的姿态、枯木分叉、悬垂朽木与大片留白。本轮根据“枯枝笔触过于粗放”的反馈，改用断续墨线勾勒干形，以局部点皴、短横节疤和破钩表现木结与剥蚀树皮；艺术效果仍待评价。

此前把右侧悬垂形体按岩石组织，误读了原作。重新对照后，它应作为与斜枝相接的枯木段处理：上端有翻折树皮和树洞，下方沿纵向白槽、横断节疤收束。造形因此一并改为枯木勾皴。

构建后打开 `/examples/bada-study.html`，可保存全图与编辑源。默认画幅540×1053，种子821730。没有把原作像素、题款或印章放进绘制程序。

## 源与材料

- `examples/bada-tree.mjs`：作者提供的树、枝与地面笔路，以轻重不同的断续边线围出干形，配少量淡侧影、裂纹和聚散点皴；移除贯穿主干的 `tree/wet-structure` 宽湿笔组。
- `examples/bada-hanging-wood.mjs`：右侧悬垂朽木的勾边、洞口、细颈、节疤与木结点簇。一侧较重，另一侧淡断，内部保留纸白。
- `examples/bada-crows.mjs`：四组不同姿态的鸟，淡体面、黑头、干羽、尾羽与喙眼爪分别落笔；胸腹靠未落墨区域留纸，只有眼白使用纸色小笔。
- `examples/bada-composition.mjs`：把观察坐标转换到画幅，生成20组、463笔普通 `StrokeGroupDocument`；树与地面218笔、悬垂朽木104笔、四鸟141笔。
- `examples/bada-material.mjs`：组合既有 `InkProcess` 密度模型和接触笔渲染器，不修改库的默认材质。

笔序分为三层：先用接触笔勾枯木轮廓，再以正片叠底合成九个密度区域，最后落木结点皴、裂口和鸟的干羽、焦墨细节。密度区域为悬垂朽木、主干、上枝、残桩、地面五区，以及四鸟各自的淡体面；鸟源中以 `soft-` 标识的笔进入淡体面，其他笔保留接触笔表现。

各区域保存明确的位置、网格尺寸、墨层、笔路、压力、浓度、裁切与种子。分区用于满足密度场的容量限制；同一笔不按截图切片，也不包含参考贴图。完整几何保留父组关系；材料子集只保留该子集内部存在的父组链接。

树干由不等重的边线、淡侧影与局部结疤共同交代。边线有断口和压力变化，避免全周封闭；点皴集中在叉口、洞口与节疤周围，大小、墨量和间距不等，点簇之间留出白木面。每个点、短钩和勾线仍是独立笔路，可单独改动。

本幅临摹继续保留作者按原作观察组织的显式骨架。同时新增独立的[树、石、鸟复合源API](subject-macros.md)与[浏览页](../examples/subject-macros.html)：可递归造树，也可提供自有枝架、岩脊和鸟部件，返回普通可编辑笔组。默认递归树不会替换本幅的构图骨架。

## 重建与局部修改

当前导出的JSON生成器仍为 `bada-ink-composition-v2`，保存九份标准墨层配方、勾线 `underlines`、最后叠入的 `accents`，以及材料区域的位置和网格。本轮首个区域改为 `hanging-wood`，配方结构不变。`compileBadaInkComposition()`同时支持第一版 `bada-ink-composition-v1` 的五区域配方和此前的v2配方，已有编辑源可以继续重建。用示例模块重建：

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

几何创建、材料编译和JSON重建可在Node运行；`drawBadaInkComposition`由浏览器提供Canvas。静态绘制采用固定绝对时间，不依赖墙钟。浏览器先在新建的软件Canvas上完成整帧，再按合成对象缓存 `ImageData`；这个缓存可以丢弃，编辑源不依赖它。修改几何后重新编译会得到新的合成对象，不复用旧画面的像素。

## 验证与范围

本轮已核对固定种子下九个密度区域、勾线和最终笔组的JSON精确重建；修改单根尾羽的一个端点只改变该笔，九个密度区域保持不变。旧v1与此前v2配方均可编译。逐组比较归档源，四鸟、地面与接地细节保持一致。

实际Chrome中已核对重复绘制、重新载入、导出配方与新建几何源重绘的像素一致，并操作PNG、JSON导出，未出现页面错误。像素检查限定同一浏览器后端与固定输入，不承诺跨浏览器、系统或GPU的像素相同。

复合源API另有纯Node、共享分枝锚点、JSON重建、稳定身份和局部编辑检查；三项宏浏览页已核对重新载入、配方重绘和两种导出，无页面错误。全仓196项测试与类型检查通过。工程检查不表示已完成原作艺术效果验收。

本例在图片学习框架的同一本地项目中保留历次手工候选：冻结参考与自包含工具源码，调用真实图片渲染链路，分别保存候选与独立外部看图评价，不覆盖旧图。这个模式没有启动线上模型自动创作任务，也不代表自动评审、艺术采纳或知识发布。项目身份与执行回执随私有归档保存，公共仓库只包含本库的示例源。

当前仍是程序造形：分枝衔接、木结分布和鸟羽走向由作者逐笔组织，没有植物生长、羽毛物理或宣纸毛细流动求解。勾线与点簇仍可能显得重复或像符号，需要继续与原作比较。
