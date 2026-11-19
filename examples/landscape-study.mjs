import { renderCanvas } from '/dist/index.js';
import { makeRockLandscape } from './rock-fixtures.mjs';
import { createLandscapeRenderer } from './scene.js';
import { verifyLandscape } from './landscape-verify.mjs';

const canvas = document.querySelector('#landscape-canvas');
const seedInput = document.querySelector('#landscape-seed');
const timeInput = document.querySelector('#landscape-time');
const error = document.querySelector('#landscape-error');
const checkOutput = document.querySelector('#landscape-check-result');
let renderer;
let pending = 0;

function png(source) {
  const copy = document.createElement('canvas');
  copy.width = source.width; copy.height = source.height;
  copy.getContext('2d').drawImage(source, 0, 0);
  const result = copy.toDataURL('image/png');
  copy.width = 0; copy.height = 0;
  return result;
}

function render() {
  const start = performance.now();
  const stats = renderer.render(Number(timeInput.value));
  document.querySelector('#landscape-strokes').textContent = String(stats.strokeCount);
  document.querySelector('#landscape-builds').textContent = String(stats.cacheBuilds);
  document.querySelector('#landscape-bytes').textContent = `${(stats.cacheBytes / 1048576).toFixed(1)} MiB`;
  document.querySelector('#landscape-elapsed').textContent = `${(performance.now() - start).toFixed(2)} ms`;
  document.querySelector('#landscape-time-value').textContent = `${Number(timeInput.value).toFixed(1)} s`;
}

function drawDiagnostics() {
  const diagnostics = renderer.diagnostics();
  const container = document.querySelector('#landscape-layer-grid');
  container.replaceChildren();
  for (const [key, label] of [['unmaskedMountains','擦除前的透明山体'],['maskedMountains','云海擦除后的山体'],['cloudMask','实际云海擦除遮罩']]) {
    const source = diagnostics[key];
    const figure = document.createElement('figure');
    const view = document.createElement('canvas');
    view.width = source.width; view.height = source.height;
    view.getContext('2d').drawImage(source, 0, 0);
    const caption = document.createElement('figcaption'); caption.textContent = label;
    figure.append(view, caption); container.append(figure);
  }
}

function rebuild(data) {
  if (!seedInput.checkValidity()) { seedInput.reportValidity(); return; }
  error.textContent = ''; checkOutput.textContent = '尚未运行'; checkOutput.dataset.status = 'idle';
  try {
    const start = performance.now();
    const next = createLandscapeRenderer(canvas, data !== undefined ? { data, diagnostics: true }
      : { width: 1280, height: 800, seed: Number(seedInput.value), diagnostics: true });
    document.querySelector('#landscape-initialization').textContent = `${(performance.now() - start).toFixed(1)} ms`;
    renderer?.dispose(); renderer = next;
    const description = renderer.describe();
    seedInput.value = String(description.seed);
    render();
    const after = document.querySelector('#landscape-after');
    renderer.render(6);
    after.getContext('2d').drawImage(canvas, 0, 0);
    render();
    const before = document.querySelector('#landscape-before');
    renderCanvas(before.getContext('2d'), makeRockLandscape('structured', { seed: Number(seedInput.value) }), { time: 6, paperTexture: .025 });
    document.querySelector('#landscape-record').textContent = JSON.stringify(description);
    drawDiagnostics();
    if (new URLSearchParams(location.search).get('evidence') === '1') {
      const diagnostics = renderer.diagnostics();
      document.querySelector('#landscape-evidence').textContent = JSON.stringify({
        landscape: after.toDataURL('image/png'),
        unmasked: png(diagnostics.unmaskedMountains),
        masked: png(diagnostics.maskedMountains),
        cloud: png(diagnostics.cloudMask),
      });
    }
    document.querySelector('main').dataset.status = 'ready';
  } catch (caught) {
    error.textContent = `生成失败：${caught.message}`;
    document.querySelector('main').dataset.status = 'failed';
  }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url;
  link.download = `ink-sword-peaks-${seedInput.value}.${extension}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#landscape-controls').addEventListener('submit', event => { event.preventDefault(); rebuild(); });
timeInput.addEventListener('input', () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => { try { render(); } catch (caught) { error.textContent = caught.message; } });
});
document.querySelector('#landscape-export-png').addEventListener('click', () => canvas.toBlob(blob => {
  if (blob) download(blob, 'png');
}, 'image/png'));
document.querySelector('#landscape-export-json').addEventListener('click', () => {
  if (renderer) download(new Blob([JSON.stringify(renderer.describe(), null, 2)], { type: 'application/json' }), 'json');
});
const fileInput = document.querySelector('#landscape-file');
document.querySelector('#landscape-import-json').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try { rebuild(JSON.parse(await file.text())); }
  catch (caught) { error.textContent = `载入失败：${caught.message}`; }
  finally { fileInput.value = ''; }
});
document.querySelector('#landscape-check').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  checkOutput.dataset.status = 'running'; checkOutput.textContent = '正在检查…';
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const result = await verifyLandscape({ seed: Number(seedInput.value) });
    checkOutput.textContent = JSON.stringify(result, null, 2);
    checkOutput.dataset.status = result.passed ? 'passed' : 'failed';
  } catch (caught) {
    checkOutput.textContent = JSON.stringify({ passed: false, error: caught.message }, null, 2);
    checkOutput.dataset.status = 'failed';
  } finally { button.disabled = false; }
});
rebuild();
