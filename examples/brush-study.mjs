import { renderCanvas } from '/dist/index.js';
import { brushStudyInputs, makeBrushComparisons } from './brush-fixtures.mjs';

const samples = makeBrushComparisons();
const container = document.querySelector('#brush-comparisons');
const error = document.querySelector('#study-error');
const canvases = [];
try {
  for (const sample of samples) {
    const figure = document.createElement('figure');
    const heading = document.createElement('h2');
    heading.textContent = sample.label;
    const canvas = document.createElement('canvas');
    canvas.id = sample.id;
    canvas.width = brushStudyInputs.width;
    canvas.height = brushStudyInputs.height;
    canvas.setAttribute('aria-label', sample.label);
    const caption = document.createElement('figcaption');
    caption.textContent = sample.description;
    figure.append(heading, canvas, caption);
    container.append(figure);
    renderCanvas(canvas.getContext('2d'), sample.scene, { time: brushStudyInputs.time, paperTexture: .025 });
    canvases.push(canvas);
  }
  container.dataset.status = 'ready';
} catch (caught) {
  container.dataset.status = 'failed';
  error.textContent = `绘制失败：${caught.message}`;
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ink-brush-study-${brushStudyInputs.seed}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#study-export-json').addEventListener('click', () => {
  download(new Blob([JSON.stringify({ kind: 'ink-brush-study', inputs: brushStudyInputs, samples }, null, 2)], { type: 'application/json' }), 'json');
});

document.querySelector('#study-export-png').addEventListener('click', () => {
  const sheet = document.createElement('canvas');
  sheet.width = 1280;
  sheet.height = 1140;
  const context = sheet.getContext('2d');
  context.fillStyle = '#f7f6f1';
  context.fillRect(0, 0, sheet.width, sheet.height);
  context.fillStyle = '#263f32';
  context.font = '24px Microsoft YaHei, sans-serif';
  context.fillText('笔法对照 · 固定种子 261119 · Canvas 2D', 30, 42);
  context.font = '13px Microsoft YaHei, sans-serif';
  context.fillText('两列采用相同的当前材质；每片 600 × 260，完成时间 3s。', 30, 70);
  canvases.forEach((canvas, i) => {
    const x = 30 + (i % 2) * 620;
    const y = 108 + Math.floor(i / 2) * 330;
    context.fillStyle = '#263f32';
    context.font = '16px Microsoft YaHei, sans-serif';
    context.fillText(samples[i].label, x, y);
    context.drawImage(canvas, x, y + 14);
    context.fillStyle = '#62695d';
    context.font = '11px Microsoft YaHei, sans-serif';
    context.fillText(samples[i].description, x, y + 294);
  });
  context.fillText('程序化近似，尚待艺术验收；平滑可能改变刻意折笔。', 30, 1120);
  sheet.toBlob(blob => blob ? download(blob, 'png') : error.textContent = '浏览器未能生成 PNG。', 'image/png');
});
