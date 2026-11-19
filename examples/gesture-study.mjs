import { renderCanvas, compileBrushRecipe, sampleBrushContact, TECHNIQUE_SOURCES, getTechnique } from '../dist/index.js';
import { makeGestureStudies, makeGestureComposition, gestureInputs, gestureSize, gestureScene } from './gesture-fixtures.mjs';
import { verifyGestureStudies } from './gesture-verify.mjs';

const byId = id => document.getElementById(id);
const sourceById = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
let inputs = { ...gestureInputs }, studies = [], composition;
const readInputs = () => ({ seed: Number(byId('gesture-seed').value), pathVariant: byId('gesture-path').value,
  strength: Number(byId('gesture-strength').value), side: Number(byId('gesture-side').value), tailDryness: Number(byId('gesture-dry').value) });

function overlay(context, document) {
  const samples = sampleBrushContact(document.result);
  context.save();
  context.lineWidth = .8; context.strokeStyle = '#a94d3b'; context.globalAlpha = .8;
  context.beginPath();
  samples.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
  context.setLineDash([4, 4]); context.strokeStyle = '#62966a'; context.beginPath();
  samples.forEach((point, i) => i ? context.lineTo(point.centerX, point.centerY) : context.moveTo(point.centerX, point.centerY)); context.stroke();
  context.setLineDash([]); context.fillStyle = '#a94d3b';
  for (const point of [samples[0], samples.at(-1)]) { context.beginPath(); context.arc(point.x, point.y, 2, 0, Math.PI * 2); context.fill(); }
  context.restore();
}

function draw(canvas, scene, documents, showOverlay = byId('gesture-overlay').checked) {
  canvas.width = scene.width; canvas.height = scene.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderCanvas(context, scene, { time: 3, paperTexture: .02 });
  if (showOverlay) for (const document of documents) overlay(context, document);
}

function detailView(sourceCanvas, source, studyId) {
  const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 136;
  canvas.className = 'gesture-detail';
  const point = studyId === 'entry' ? source.recipe.points[0]
    : studyId === 'finish' ? source.recipe.points.at(-1) : source.recipe.points[1];
  const label = studyId === 'entry' ? '起端' : studyId === 'finish' ? '尾端' : '首个折向';
  canvas.setAttribute('aria-label', `${label}放大两倍`);
  const context = canvas.getContext('2d');
  context.fillStyle = gestureSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#65705e'; context.font = '13px Microsoft YaHei, sans-serif';
  context.fillText(`局部 · ${label} ×2`, 16, 30);
  context.drawImage(sourceCanvas, point.x - 32, point.y - 32, 64, 64, 210, 4, 128, 128);
  return canvas;
}

function referenceList(ids) {
  const details = document.createElement('details'), title = document.createElement('summary');
  details.className = 'gesture-sources'; title.textContent = '阅读依据与传统术语范围'; details.append(title);
  const sources = new Map();
  for (const id of ids) {
    const technique = getTechnique(id);
    for (const evidence of technique?.reading.evidence ?? []) {
      const source = sourceById.get(evidence.sourceId);
      if (source && !sources.has(source.id)) sources.set(source.id, { source, locator: evidence.locator });
    }
  }
  const list = document.createElement('ul');
  for (const { source, locator } of sources.values()) {
    const item = document.createElement('li'), link = document.createElement('a');
    link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = source.title;
    item.append(link, document.createTextNode(`；定位：${locator}`)); list.append(item);
  }
  details.append(list); return details;
}

function record() {
  return { kind: 'ink-gesture-study', version: 1, inputs,
    studies: studies.map(study => ({ id: study.id, variants: study.variants.map(variant => ({ id: variant.id, label: variant.label, document: variant.document })) })),
    composition: composition.documents,
    artisticValidation: 'unreviewed' };
}

function renderAll() {
  if (!byId('gesture-seed').checkValidity()) { byId('gesture-seed').reportValidity(); return; }
  try {
    inputs = readInputs(); studies = makeGestureStudies(inputs); composition = makeGestureComposition(inputs);
    byId('gesture-error').textContent = '';
    byId('gesture-strength-value').textContent = inputs.strength.toFixed(2);
    byId('gesture-side-value').textContent = inputs.side.toFixed(2);
    byId('gesture-dry-value').textContent = inputs.tailDryness.toFixed(2);
    byId('gesture-conditions').textContent = `同组保持原始输入 · 种子 ${inputs.seed} · 每格 ${gestureSize.width} × ${gestureSize.height} · 原图局部放大 ×2 · Canvas 2D${byId('gesture-overlay').checked ? ' · 红线：锋尖笔路；绿虚线：接触区中心' : ''}`;
    const container = byId('gesture-studies'); container.replaceChildren();
    for (const study of studies) {
      const section = document.createElement('section'); section.className = 'gesture-group'; section.dataset.study = study.id;
      const heading = document.createElement('div'), title = document.createElement('h2'), variable = document.createElement('p');
      heading.className = 'gesture-heading'; title.textContent = study.title; variable.textContent = study.variable; heading.append(title, variable);
      const grid = document.createElement('div'); grid.className = 'gesture-grid';
      for (const variant of study.variants) {
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id; canvas.setAttribute('aria-label', `${study.title} ${variant.label}`);
        draw(canvas, variant.scene, [variant.document]); caption.textContent = variant.label;
        figure.append(canvas, detailView(canvas, variant.document, study.id), caption); grid.append(figure);
      }
      const notes = document.createElement('div'); notes.className = 'gesture-notes';
      for (const [label, text] of [['看什么', study.criteria], ['当前范围', study.limits]]) {
        const paragraph = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${label}：`;
        paragraph.append(strong, document.createTextNode(text)); notes.append(paragraph);
      }
      section.append(heading, grid, notes, referenceList(study.techniqueIds)); container.append(section);
    }
    draw(byId('gesture-composition-canvas'), composition.scene, composition.documents);
    byId('gesture-record').textContent = JSON.stringify(record());
    byId('gesture-verification').dataset.status = 'idle'; byId('gesture-verification').textContent = '尚未运行';
    document.querySelector('main').dataset.status = 'ready';
  } catch (error) { byId('gesture-error').textContent = error.message; document.querySelector('main').dataset.status = 'failed'; }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `ink-gesture-batch02-${inputs.seed}-${inputs.pathVariant}.${extension}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1540;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = gestureSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304734'; context.font = '28px Microsoft YaHei, sans-serif'; context.fillText('基础笔法第二批 · 起笔 / 收笔 / 转折', 26, 44);
  context.font = '15px Microsoft YaHei, sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.pathVariant} · 原创程序样片 · 艺术效果待评判`, 26, 76);
  const sample = document.createElement('canvas');
  for (const [row, study] of studies.entries()) {
    const y = 118 + row * 466; context.font = '22px Microsoft YaHei, sans-serif'; context.fillText(study.title, 26, y);
    for (const [column, variant] of study.variants.entries()) {
      draw(sample, variant.scene, [variant.document], false); context.drawImage(sample, 26 + column * 574, y + 18);
      const detail = detailView(sample, variant.document, study.id);
      context.drawImage(detail, 26 + column * 574, y + 260);
      detail.width = 0; detail.height = 0;
      context.font = '15px Microsoft YaHei, sans-serif'; context.fillText(variant.label, 26 + column * 574, y + 426);
    }
  }
  sample.width = 0; sample.height = 0;
  canvas.toBlob(blob => { if (blob) download(blob, 'png'); else byId('gesture-error').textContent = '浏览器未能生成 PNG'; canvas.width = 0; canvas.height = 0; }, 'image/png');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function loadJson(text) {
  try {
    if (text.length > 2_000_000) throw new RangeError('JSON 超过 2 MB，请载入较小的练习文件');
    const value = JSON.parse(text); let documents;
    if (value.kind === 'ink-gesture-study') {
      if (value.version !== 1 || !Array.isArray(value.studies) || !Array.isArray(value.composition)) throw new RangeError('不支持的练习文件版本或结构');
      documents = [...value.studies.flatMap(study => {
        if (!Array.isArray(study.variants)) throw new TypeError('练习缺少 variants');
        return study.variants.map(variant => ({ label: `${study.id} · ${variant.label}`, document: variant.document }));
      }), ...value.composition.map((document, i) => ({ label: `两笔组合 · ${i + 1}`, document }))];
    } else documents = [{ label: '载入的单笔', document: value }];
    if (!documents.length || documents.length > 36) throw new RangeError('每次载入 1–36 笔');
    const verified = documents.map(({ label, document: saved }) => {
      if (!saved || saved.version !== 1 || !saved.recipe || !saved.result) throw new RangeError('不支持的笔法文档版本或结构');
      const result = compileBrushRecipe(saved.recipe);
      if (JSON.stringify(stable(result)) !== JSON.stringify(stable(saved.result))) throw new Error(`${label}：保存的笔迹与技法设定重新生成的结果不一致`);
      return { label, document: { ...saved, result } };
    });
    const container = byId('gesture-imported'); container.replaceChildren();
    for (const { label, document: saved } of verified) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
      draw(canvas, gestureScene([saved], saved.result.seed), [saved], false); caption.textContent = label; figure.append(canvas, caption); container.append(figure);
    }
    byId('gesture-error').textContent = ''; byId('gesture-import-status').textContent = `已载入 ${verified.length} 笔，版本与重新生成结果一致。艺术效果仍待评判。`;
    byId('gesture-import-status').dataset.status = 'passed';
  } catch (error) { byId('gesture-error').textContent = error.message; byId('gesture-import-status').textContent = '载入未完成'; byId('gesture-import-status').dataset.status = 'failed'; }
}

byId('gesture-controls').addEventListener('submit', event => { event.preventDefault(); renderAll(); });
for (const id of ['gesture-path', 'gesture-overlay']) byId(id).addEventListener('change', renderAll);
for (const id of ['gesture-strength', 'gesture-side', 'gesture-dry']) byId(id).addEventListener('input', renderAll);
byId('gesture-export-json').addEventListener('click', () => download(new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' }), 'json'));
byId('gesture-export-png').addEventListener('click', exportSheet);
byId('gesture-load-text').addEventListener('click', () => loadJson(byId('gesture-json-input').value));
byId('gesture-import-json').addEventListener('change', async event => {
  try {
    const file = event.currentTarget.files[0]; if (!file) return;
    if (file.size > 2_000_000) throw new RangeError('JSON 超过 2 MB，请载入较小的练习文件');
    loadJson(await file.text());
  } catch (error) { byId('gesture-error').textContent = error.message; }
});
byId('gesture-check').addEventListener('click', async event => {
  const button = event.currentTarget, output = byId('gesture-verification'); button.disabled = true;
  output.dataset.status = 'running'; output.textContent = '正在检查三种笔路…';
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const result = await verifyGestureStudies({ seed: inputs.seed }); output.textContent = JSON.stringify(result, null, 2);
    output.dataset.status = result.passed ? 'passed' : 'failed';
  } catch (error) { output.textContent = error.message; output.dataset.status = 'failed'; }
  finally { button.disabled = false; }
});
renderAll();
