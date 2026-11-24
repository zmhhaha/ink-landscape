# ink-landscape

可组合、可编辑的笔墨山水 TypeScript 库。纯数据与几何核心可在 Node 中运行；Canvas 2D 渲染器负责显示。调用者保留路径、区域、方向场、结构和逐笔修改权。

固定输入、种子、库版本与绝对时间用于重建结果。当前为工程原型；传统技法名称表示程序近似，艺术适用范围仍在通过图样比较完善。

## 安装与最小示例

项目尚未发布到 npm。在库目录先执行 `npm ci` 和 `npm run build`，再在消费项目中从源码目录本地安装：

```sh
npm install ../ink-landscape
```

在支持 npm 模块导入的浏览器应用中，从需要的子入口导入：

```js
import { composeInkScene } from 'ink-landscape/core';
import { createBrushDocument } from 'ink-landscape/brush';
import { renderCanvas } from 'ink-landscape/canvas';

const outline = createBrushDocument([
  { x: 40, y: 190, pressure: .2 },
  { x: 180, y: 45, pressure: .9 },
  { x: 360, y: 180, pressure: .1 },
], { width: 12, seed: 17, dryness: .5 });
const texture = createBrushDocument([
  { x: 170, y: 90, pressure: .7 },
  { x: 190, y: 170, pressure: 0 },
], { width: 5, seed: 18, dryness: .7 });

const scene = composeInkScene([
  { namespace: 'outline', source: outline },
  { namespace: 'texture', source: texture },
], { width: 420, height: 240, seed: 42 });

const canvas = document.createElement('canvas');
canvas.width = scene.width;
canvas.height = scene.height;
document.body.append(canvas);
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');
renderCanvas(context, scene, { time: 0, paperTexture: .04 });
```

两个文档可以保留相同的局部默认 ID。`composeInkScene()` 用调用者提供的唯一命名空间区分实例，保留各笔的种子、原坐标和绝对时间；同一内容可用不同命名空间重复叠画。组合后的场景仍是可序列化、可继续编辑的普通数据。

## 接口分层

| 子入口 | 主要能力 | 说明 |
| --- | --- | --- |
| `ink-landscape/core` | `createInkScene`、`composeInkScene`、笔路采样、普通笔组与噪声工具 | [数据与基础接口](docs/techniques.md) |
| `ink-landscape/brush` | 基础用笔、可编辑笔法文档、点迹文档 | [笔法](docs/foundation-brush.md) · [点迹](docs/dot-document.md) |
| `ink-landscape/cun` | 显式皴笔、结构导向线皴与点皴 | [皴法与能力范围](docs/cun-document.md) |
| `ink-landscape/subjects` | 树石鸟、枝干木结、植被和块石结构 | [复合源](docs/subject-macros.md) · [块石](docs/rock-form.md) |
| `ink-landscape/ink` | 墨层、清水事件及纯数据密度计算 | [墨层](docs/ink-process.md) · [清水](docs/water-process.md) |
| `ink-landscape/ink-canvas` | `renderInkProcess` | 墨层程序的 Canvas 2D 绘制 |
| `ink-landscape/canvas` | `renderCanvas` | 普通 `InkScene` 的 Canvas 2D 绘制 |
| `ink-landscape/learning` | 技法目录、阅读证据与研究索引 | [学习总册](docs/learning/README.md)，按需导入 |

`builder.cun()` 在区域内生成 `pima / axe`；`createCunDocument()` 执行调用者组织的九类显式皴笔。两者共享稳定技法 ID，能力集合分别声明；选择名称不会自动推断山体或获得传统画法认可。

## 数据与绘制边界

- 几何、笔路和配方可脱离浏览器生成、保存与修改；返回数据拥有独立副本并冻结。
- `time`、`start`、`duration` 使用绝对秒数。像素对照还需固定画布、渲染版本与浏览器后端；不承诺跨浏览器逐像素一致。
- `composeInkScene()` 接受普通场景、笔迹及其文档结果。墨层 `InkProcess` 使用单独的墨层接口与渲染器。
- Canvas 2D 是当前后端；Shader 尚未实现。纸笔和水墨表现是程序近似。

## 开发与验证

需要 Node.js 20 或更高版本：

```sh
npm ci
npm run check
npm test
npm run dev
```

开发页面地址以终端输出为准。`npm pack` 会先构建 `dist/`；`private: true` 保持 npm 发布关闭，GitHub 提交与 npm 发布分别管理。

打包消费与真实浏览器检查见 [验证命令及本轮 review 说明](docs/library-readiness.md)。

## 文档与研究

[需求与架构](docs/requirements.md) · [创作 Agent Skill](skills/ink-landscape/SKILL.md) · [研究记录与全部历史入口](docs/CHANGELOG-research.md) · [笔法学习册](examples/technique-atlas.html) · [《芥子园》选读](docs/learning/jieziyuan.md)

文献阅读、程序实现和艺术评价分别记录。批次样片、参考调研与已知局限保留在研究记录中，供继续比较和改进。
