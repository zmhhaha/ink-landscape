import { renderCanvas } from '/dist/index.js';
import { makeStudy, studies } from './fixtures.mjs';

const canvas = document.querySelector('#painting');
const context = canvas.getContext('2d', { willReadFrequently: true });
const seedInput = document.querySelector('#seed');
const drynessInput = document.querySelector('#dryness');
const smoothingInput = document.querySelector('#smoothing');
const timeInput = document.querySelector('#time');
const error = document.querySelector('#error');
const checkStatus = document.querySelector('#check-status');
let activeStudy = 'brush';
let scene;
let pendingFrame = 0;

function render() {
  const started = performance.now();
  const stats = renderCanvas(context, scene, { time: Number(timeInput.value) });
  const elapsed = performance.now() - started;
  document.querySelector('#stroke-count').textContent = String(stats.strokeCount);
  document.querySelector('#wash-count').textContent = String(stats.washCount);
  document.querySelector('#render-time').textContent = `${elapsed.toFixed(1)} ms`;
  document.querySelector('#time-value').textContent = `${Number(timeInput.value).toFixed(1)} s`;
}

function rebuild() {
  error.textContent = '';
  checkStatus.textContent = '';
  try {
    if (!seedInput.checkValidity()) throw new RangeError('请输入 0 至 4294967295 的整数种子。');
    scene = makeStudy(activeStudy, { seed: Number(seedInput.value), dryness: Number(drynessInput.value), smoothing: smoothingInput.value });
    document.querySelector('#dryness-value').textContent = Number(drynessInput.value).toFixed(2);
    document.querySelector('#study-title').textContent = studies[activeStudy].title;
    document.querySelector('#study-caption').textContent = studies[activeStudy].caption;
    render();
  } catch (caught) {
    error.textContent = `绘制未完成：${caught.message}`;
  }
}

function schedule(callback) {
  cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(callback);
}

document.querySelectorAll('[data-study]').forEach(button => button.addEventListener('click', () => {
  activeStudy = button.dataset.study;
  document.querySelectorAll('[data-study]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  rebuild();
}));
document.querySelector('#redraw').addEventListener('click', rebuild);
seedInput.addEventListener('change', rebuild);
smoothingInput.addEventListener('change', rebuild);
drynessInput.addEventListener('input', () => schedule(rebuild));
timeInput.addEventListener('input', () => schedule(() => {
  try { render(); } catch (caught) { error.textContent = caught.message; }
}));

function download(blob, extension) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `ink-${activeStudy}-${seedInput.value}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#export-json').addEventListener('click', () => {
  if (scene) download(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }), 'json');
});
document.querySelector('#export-png').addEventListener('click', () => canvas.toBlob(blob => {
  if (blob) download(blob, 'png');
  else error.textContent = '浏览器未能生成 PNG。';
}, 'image/png'));

document.querySelector('#repeat-check').addEventListener('click', event => {
  event.currentTarget.disabled = true;
  try {
    renderCanvas(context, scene, { time: 6 });
    const first = context.getImageData(0, 0, canvas.width, canvas.height).data;
    renderCanvas(context, scene, { time: 2 });
    renderCanvas(context, scene, { time: 6 });
    const repeated = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const equal = first.every((value, index) => value === repeated[index]);
    checkStatus.textContent = equal ? '通过：6s → 2s → 6s，全部像素一致。' : '未通过：重复定位后像素出现差异。';
    checkStatus.dataset.result = equal ? 'pass' : 'fail';
  } catch (caught) {
    checkStatus.textContent = `检查失败：${caught.message}`;
    checkStatus.dataset.result = 'fail';
  } finally {
    render();
    event.currentTarget.disabled = false;
  }
});

rebuild();
