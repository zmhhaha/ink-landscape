# 库消费与发布前整理

2026-11-24，基于 `d7c22f02bc8590bb5f2ef5372c1550c19541db0a` 的代码 review 回修。本轮针对组合、导入、缓存和验证流程，艺术效果继续沿用各技法的独立评价状态。

## 文档组合与身份

新增 `composeInkScene(sources, options)`。每项提供稳定且唯一的 `namespace` 和普通场景、笔迹数组、单笔或含 `result` 的文档。支持相同内容的多个实例；不会以内容哈希合并实例。

输出 ID 使用长度前缀编码命名空间与局部 ID。各源内的默认 ID、配方保持原样；组合结果保留源顺序、坐标、绝对时间和笔迹材料。生成器产出的 uint32 种子原样保留；外部手写种子沿用 core 的 uint32 规范化，不按新 ID 重派种子。

重复命名空间、同源内重复 ID 或非法笔迹会使整个调用失败。输出拥有独立副本并冻结，失败不修改输入。`InkProcess` 等墨水事件仍使用其专用接口和渲染器；组合不会隐式缩放、移动或重排它们。

原 builder 的重复 ID 检查继续生效。局部默认 ID 本身无需改成全局计数或随机值，已有结果和配方不会因此漂移。用法见 [README](../README.md)、[笔法](foundation-brush.md) 和 [点迹](dot-document.md)。

## 子入口与皴法能力

根入口继续兼容原导出，包括学习资料。新增 `core`、`canvas`、`brush`、`cun`、`ink`、`ink-canvas`、`subjects`、`learning` 八个子入口以及 `package.json` 导出，供调用者按需导入；`sideEffects: false` 支持打包器消除未使用模块。

实际安装 tarball 后记录 Node 加载图：`core` 为13个模块，`canvas` 为7个模块，均不加载技法语料、目录或研究索引；根入口仍加载32个模块。该记录验证导入依赖，不代表所有打包器的最终压缩体积。

九个皴法 ID 集中在 `cun-techniques.ts`，原字符串不变。区域生成仅支持 `pima / axe`，显式笔路文档支持九项；能力列表和类型守卫分别导出。旧 `CunTechnique` 类型导入保持兼容。review 中所述合法 `pima` 失败未复现，本轮没有为此改动生成器或增加伪支持。

## Canvas 缓存与颜色

只为无 `brush` 的旧笔迹分支增加完整路径采样的 `WeakMap` 缓存。要求 mark、points 数组和每个点都冻结；以对象身份缓存。可变 JSON、浅冻结和嵌套点编辑继续实时重算。先采样完整笔路再截取显露部分，保留乱序定位时的纹理一致性。带控制状态的笔迹原有绘制计划缓存继续使用。

原有连续两次 `fillStyle` 赋值是必要兜底：Canvas 会忽略非法 CSS 颜色。保留这些赋值并补注释；同时修复湿旧笔迹与 wash 的 `shadowColor`，使非法墨色的阴影也使用相同兜底。合法颜色下绘图状态维持原有语义。

辅助性能记录采用 Node 24、121笔、每轮60帧、20帧预热、交替顺序与五轮测量，Canvas 方法为空实现。旧分支中位数约36.45→31.80 ms/帧。它包含验证、采样与绘图命令生成，排除光栅化；机器未隔离负载，不能据此承诺通用提速比例或60 fps。

## 打包与验证

`prepack` 在打包前构建，`private: true` 保留。打包检查从没有 `dist/` 的源码副本执行 `npm pack`，再把 tarball 安装进独立消费项目，检查九个 JS／声明入口、`package.json`、无 DOM 导入、实际依赖图和 TypeScript 消费。

| 本地检查 | 结果 |
| --- | --- |
| Node 20.20.2 | 260项测试、类型检查、干净源码打包消费通过 |
| Node 22.23.5 | 260项测试、类型检查、干净源码打包消费通过 |
| Node 24.21.0 | `npm test` 260项、`npm run check`、打包消费通过 |
| 实际 Chrome 157，独立 headless profile | 21项通过，无页面异常 |
| 学习资料重新编译 | 100/100覆盖；生成源码和学习文档相对基线无差异 |
| 公开接口与文档 | 原根导出无删除；原 README 的67个研究链接保留 |

浏览器覆盖旧分支与控制笔迹的冻结／JSON一致、绝对时间乱序定位、可变宽度／点／controls、浅冻结编辑、组合和非法 CSS 兜底。这些结果不代表跨浏览器逐像素一致或艺术验收。CI 已加入 Node 20/22 矩阵、干净打包、生成资料漂移检查和 Playwright Chromium 实测；远程执行结果以对应 GitHub Actions run 为准。

跨 Node 验证还发现一个原有快照问题：`Math.pow` 在 V8 版本间有末位差异，旧提交和本轮输出在各自运行时完全一致，最大坐标差约 `2.84e-14`。兼容性快照仅将坐标和压力按 `1e-9` 量化，结构、ID、宽度和透明度继续精确比较；固定运行时的重复调用与 JSON 重建仍使用严格相等。笔迹算法没有为测试改动。

本地证据保留于 `D:/codex-work/archives/ink-landscape/20261124/library-readiness/`；报告、日志与截图不加入公开包。

## Review 入口

建议先看 `src/composition.ts` 及其行为测试，再看子入口和打包消费脚本，最后检查 Canvas 的不可变输入条件与浏览器用例。研究历史完整保留在 [CHANGELOG-research.md](CHANGELOG-research.md)。

```sh
npm run check
npm test
npm run test:package
npx playwright install chromium
npm run test:browser
```

在此 Windows 开发环境运行后两项时，将 `INK_LANDSCAPE_ARTIFACT_DIR` 设为 `D:/codex-work/tmp/ink-landscape/<task>/`；CI 使用 `runner.temp`。本地也可用 `INK_LANDSCAPE_CHROMIUM_EXECUTABLE` 指向已安装的 Chromium 系浏览器，测试仍新建独立 profile。
