import { renderCanvas, sampleStrokePath } from '../dist/index.js';
import { rockStudyInputs, makeRockComparisons, makeRockLandscape } from './rock-fixtures.mjs';

const seedInput = document.querySelector('#rock-seed');
const faceInput = document.querySelector('#rock-faces');
const error = document.querySelector('#rock-error');
const localContainer = document.querySelector('#rock-comparisons');
const landscapeContainer = document.querySelector('#rock-landscapes');
let samples = [];
let landscapes = [];
let figures = [];
let sheet;

function showPlanes(context, faces) {
  const colors = ['#ad9343', '#607f9e', '#8e687e'];
  context.save();
  faces.forEach((face, index) => {
    const points = face.outline;
    if (!points?.length) return;
    context.beginPath();
    points.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.closePath();
    context.fillStyle = colors[index % colors.length];
    context.globalAlpha = .12;
    context.fill();
    context.strokeStyle = colors[index % colors.length];
    context.globalAlpha = .85;
    context.lineWidth = 1;
    context.setLineDash([5, 4]);
    context.stroke();
  });
  context.restore();
}

function drawingBudget(scene) {
  let proxy = 0;
  const strokes = scene.marks.filter(mark => mark.kind === 'stroke');
  for (const mark of strokes) {
    const points = sampleStrokePath(mark.points, { smoothing: mark.smoothing ?? 'linear', spacing: 2 });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      proxy += (b.distance - a.distance) * (a.pressure + b.pressure) * .5 * mark.width * mark.opacity;
    }
  }
  return { strokeCount: strokes.length, washCount: scene.marks.length - strokes.length, nominalInkProxy: proxy };
}

function figureFor(sample, container, isLandscape) {
  const figure = document.createElement('figure');
  const title = document.createElement('h2');
  title.textContent = sample.label;
  const canvas = document.createElement('canvas');
  canvas.id = sample.id;
  canvas.width = sample.scene.width;
  canvas.height = sample.scene.height;
  canvas.setAttribute('aria-label', sample.label);
  const caption = document.createElement('figcaption');
  caption.textContent = sample.description;
  figure.append(title, canvas, caption);
  container.append(figure);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderCanvas(context, sample.scene, { time: rockStudyInputs.time, paperTexture: .025 });
  // Read artwork before adding the optional explanatory overlay.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let darkness = 0;
  const background = [242, 239, 229];
  for (let i = 0; i < pixels.length; i += 4) {
    darkness += Math.max(0, background[0] - pixels[i]) + Math.max(0, background[1] - pixels[i + 1])
      + Math.max(0, background[2] - pixels[i + 2]);
  }
  if (faceInput.checked && !isLandscape) showPlanes(context, sample.analysis?.faces ?? []);
  return { sample, canvas, isLandscape, diagnostics: { ...drawingBudget(sample.scene), pixelDarkness: darkness } };
}

function buildSheet() {
  const rowHeights = [0, 0, 0];
  figures.forEach(({ canvas }, index) => {
    rowHeights[Math.floor(index / 2)] = Math.max(rowHeights[Math.floor(index / 2)], canvas.height / canvas.width * 600);
  });
  const rowY = rowHeights.map((_, row) => 112 + rowHeights.slice(0, row).reduce((sum, height) => sum + height + 65, 0));
  sheet = document.createElement('canvas');
  sheet.width = 1280;
  sheet.height = 154 + rowHeights.reduce((sum, height) => sum + height + 65, 0);
  const context = sheet.getContext('2d');
  context.fillStyle = '#f7f6f1';
  context.fillRect(0, 0, sheet.width, sheet.height);
  context.fillStyle = '#263f32';
  context.font = '25px Microsoft YaHei, sans-serif';
  context.fillText('岩石分面对照 · 相同笔触，不同组织', 30, 39);
  context.font = '13px Microsoft YaHei, sans-serif';
  context.fillText(`种子 ${seedInput.value} · 每石 42 笔皴擦＋6 条骨线 · 左均匀，右按面组织${faceInput.checked ? ' · 含分面示意' : ''}`, 30, 70);
  figures.forEach(({ sample, canvas }, index) => {
    const row = Math.floor(index / 2);
    const x = 30 + index % 2 * 620;
    const y = rowY[row];
    const height = canvas.height / canvas.width * 600;
    context.fillStyle = '#263f32';
    context.font = '16px Microsoft YaHei, sans-serif';
    context.fillText(sample.label, x, y);
    context.drawImage(canvas, x, y + 16, 600, height);
    context.font = '11px Microsoft YaHei, sans-serif';
    context.fillStyle = '#62695d';
    context.fillText(sample.description, x, y + height + 37, 598);
  });
  context.fillText('原创程序化样片；分面关系、自然皴法与整体画面需分别观察。', 30, sheet.height - 20);
  document.querySelector('#rock-sheet-data').textContent = sheet.toDataURL('image/png');
}

function redraw() {
  error.textContent = '';
  try {
    if (!seedInput.checkValidity()) throw new RangeError('请输入0至4294967295的整数种子。');
    const seed = Number(seedInput.value);
    samples = makeRockComparisons({ seed });
    landscapes = ['uniform', 'structured'].map(treatment => ({
      id: `rock-landscape-${treatment}`, treatment,
      label: treatment === 'uniform' ? '03 · 小景 / 均匀组织' : '03 · 小景 / 按面组织',
      description: '同一组岩体、布局与墨色层次，仅替换皴擦组织方式。',
      scene: makeRockLandscape(treatment, { seed }),
    }));
    localContainer.replaceChildren();
    landscapeContainer.replaceChildren();
    figures = samples.map(sample => figureFor(sample, localContainer, false));
    figures.push(...landscapes.map(sample => figureFor(sample, landscapeContainer, true)));
    document.querySelector('#rock-face-key').hidden = !faceInput.checked;
    document.querySelector('#rock-record').textContent = JSON.stringify({
      kind: 'rock-plane-study', inputs: { ...rockStudyInputs, seed }, faceOverlay: faceInput.checked,
      samples, landscapes,
      diagnostics: figures.map(({ sample, diagnostics }) => ({ id: sample.id, ...diagnostics })),
      diagnosticScope: '名义墨量代理为弧长×平均压力×宽度×透明度之和；像素暗度为相对纸底RGB差之和。它们均非物理墨量，不作为美术验收。',
    });
    buildSheet();
    localContainer.dataset.status = 'ready';
  } catch (caught) {
    localContainer.dataset.status = 'failed';
    error.textContent = `绘制失败：${caught.message}`;
  }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ink-rock-planes-${seedInput.value}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#rock-controls').addEventListener('submit', event => { event.preventDefault(); redraw(); });
faceInput.addEventListener('change', redraw);
document.querySelector('#rock-export-json').addEventListener('click', () => {
  if (localContainer.dataset.status === 'ready') download(new Blob([document.querySelector('#rock-record').textContent], { type: 'application/json' }), 'json');
});
document.querySelector('#rock-export-png').addEventListener('click', () => {
  if (localContainer.dataset.status === 'ready') sheet.toBlob(blob => blob ? download(blob, 'png') : error.textContent = '浏览器未能生成PNG。', 'image/png');
});
redraw();
