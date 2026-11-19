# ink-landscape

可组合、可编辑的笔墨山水技法 TypeScript 库，供浏览器应用和创作 Agent 使用。几何与笔触数据独立于渲染器；初版使用 Canvas 2D，Shader 后端尚未实现，后续需通过画面对照验证其价值。

目前是工程原型，尚未通过艺术效果验收。披麻皴、斧劈皴等名称表示受传统技法启发的程序近似，不代表已掌握传统画法，也不承诺复现任何参考作品。

已确认的目标、首版范围、验收与后续任务见 [需求说明](docs/requirements.md)，对应 OpenSpec 独立变更 `add-ink-landscape-technique-library`。

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
  ], { width: 7, dryness: 0.45, start: 0, duration: 2 });

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
| `renderCanvas(ctx, snapshot, { time?, paperTexture?, clear? })` | 将场景绘制到 Canvas 2D，返回绘制统计 |

`start`、`duration` 与渲染选项 `time` 使用绝对秒数。省略 `time` 时显示全部完成的笔触；同一时间点可重新渲染。固定数据、种子及时间面向可重复结果设计，但不承诺不同浏览器间的像素完全一致。默认 `clear: true` 会重绘整个画面；`clear: false` 用于在已有画面上叠加，会受之前绘制结果影响。

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

皴擦的 `flow(point)` 只在生成笔触时使用，不进入序列化数据。更多参数与使用边界见 [技法说明](docs/techniques.md) 和 [类型定义](src/types.ts)。

## 与 Agent、WikiSkill 及视频流程的关系

Agent 负责构图、轮廓、笔势和技法选择；本库提供可组合的执行工具。调用者可以直接编辑场景数据和自行生成路径，无需服从固定的山水模板。

WikiSkill 用于记录创作方法、观察依据和适用范围，不能替代代码库。未来可由 HyperFrames 驱动绝对时间来渲染连续帧；当前独立原型尚未接入正式视频业务，也未验证动画艺术效果。

仓库不包含参考版权图片、凭据、私有服务数据或业务实现。请保留作品的绘制源码和参数，自行确认加入的素材及依赖许可。

## 许可

[MIT](LICENSE) · Copyright © 2026 ink-landscape contributors
