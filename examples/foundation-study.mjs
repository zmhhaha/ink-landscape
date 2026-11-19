import { renderCanvas, compileBrushRecipe, sampleBrushContact, TECHNIQUE_SOURCES, getTechnique } from '../dist/index.js';
import { makeFoundationStudies, makeFoundationComposition, foundationInputs, foundationSize, foundationScene } from './foundation-fixtures.mjs';
import { verifyFoundationStudies } from './foundation-verify.mjs';

const byId = id => document.getElementById(id);
const sourceById = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
let inputs = { ...foundationInputs }, studies = [], composition;
const readInputs = () => ({ seed: Number(byId('foundation-seed').value), pathVariant: byId('foundation-path').value,
  press: Number(byId('foundation-press').value), switchAt: Number(byId('foundation-switch').value), tailDryness: Number(byId('foundation-dry').value) });

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

function draw(canvas, scene, documents, showOverlay = byId('foundation-overlay').checked) {
  canvas.width = scene.width; canvas.height = scene.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderCanvas(context, scene, { time: 3, paperTexture: .02 });
  if (showOverlay) for (const document of documents) overlay(context, document);
}

function referenceList(ids) {
  const details = document.createElement('details'), title = document.createElement('summary');
  details.className = 'foundation-sources'; title.textContent = '阅读依据与传统术语范围'; details.append(title);
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
  return { kind: 'ink-foundation-study', version: 1, inputs,
    studies: studies.map(study => ({ id: study.id, variants: study.variants.map(variant => ({ id: variant.id, label: variant.label, document: variant.document })) })),
    composition: composition.documents,
    artisticValidation: 'unreviewed', sampleReview: getTechnique('brush-center').sampleReview };
}

function renderAll() {
  if (!byId('foundation-seed').checkValidity()) { byId('foundation-seed').reportValidity(); return; }
  try {
    inputs = readInputs(); studies = makeFoundationStudies(inputs); composition = makeFoundationComposition(inputs);
    byId('foundation-error').textContent = '';
    byId('foundation-press-value').textContent = inputs.press.toFixed(2);
    byId('foundation-switch-value').textContent = `${Math.round(inputs.switchAt * 100)}%`;
    byId('foundation-dry-value').textContent = inputs.tailDryness.toFixed(2);
    byId('foundation-conditions').textContent = `同一笔路 · 种子 ${inputs.seed} · 每格 ${foundationSize.width} × ${foundationSize.height} · Canvas 2D · 参数按弧长定位${byId('foundation-overlay').checked ? ' · 红线：锋尖笔路；绿虚线：接触区中心' : ''}`;
    const container = byId('foundation-studies'); container.replaceChildren();
    for (const study of studies) {
      const section = document.createElement('section'); section.className = 'foundation-group'; section.dataset.study = study.id;
      const heading = document.createElement('div'), title = document.createElement('h2'), variable = document.createElement('p');
      heading.className = 'foundation-heading'; title.textContent = study.title; variable.textContent = study.variable; heading.append(title, variable);
      const grid = document.createElement('div'); grid.className = 'foundation-grid';
      for (const variant of study.variants) {
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id; canvas.setAttribute('aria-label', `${study.title} ${variant.label}`);
        draw(canvas, variant.scene, [variant.document]); caption.textContent = variant.label; figure.append(canvas, caption); grid.append(figure);
      }
      const notes = document.createElement('div'); notes.className = 'foundation-notes';
      for (const [label, text] of [['看什么', study.criteria], ['当前范围', study.limits]]) {
        const paragraph = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${label}：`;
        paragraph.append(strong, document.createTextNode(text)); notes.append(paragraph);
      }
      section.append(heading, grid, notes, referenceList(study.techniqueIds)); container.append(section);
    }
    draw(byId('foundation-composition-canvas'), composition.scene, composition.documents);
    byId('foundation-record').textContent = JSON.stringify(record());
    byId('foundation-verification').dataset.status = 'idle'; byId('foundation-verification').textContent = '尚未运行';
    document.querySelector('main').dataset.status = 'ready';
  } catch (error) { byId('foundation-error').textContent = error.message; document.querySelector('main').dataset.status = 'failed'; }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `ink-foundation-batch01-${inputs.seed}-${inputs.pathVariant}.${extension}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1160;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = foundationSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304734'; context.font = '28px Microsoft YaHei, sans-serif'; context.fillText('基础笔法第一批 · 提按 / 中侧锋 / 枯润飞白', 26, 44);
  context.font = '15px Microsoft YaHei, sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.pathVariant} · 首批展示原样已获认可 · 修改另行观察`, 26, 76);
  const sample = document.createElement('canvas');
  for (const [row, study] of studies.entries()) {
    const y = 118 + row * 342; context.font = '22px Microsoft YaHei, sans-serif'; context.fillText(study.title, 26, y);
    for (const [column, variant] of study.variants.entries()) {
      draw(sample, variant.scene, [variant.document], false); context.drawImage(sample, 26 + column * 574, y + 18);
      context.font = '15px Microsoft YaHei, sans-serif'; context.fillText(variant.label, 26 + column * 574, y + 280);
    }
  }
  sample.width = 0; sample.height = 0;
  canvas.toBlob(blob => { if (blob) download(blob, 'png'); else byId('foundation-error').textContent = '浏览器未能生成 PNG'; canvas.width = 0; canvas.height = 0; }, 'image/png');
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
    if (value.kind === 'ink-foundation-study') {
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
    const container = byId('foundation-imported'); container.replaceChildren();
    for (const { label, document: saved } of verified) {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
      draw(canvas, foundationScene([saved], saved.result.seed), [saved], false); caption.textContent = label; figure.append(canvas, caption); container.append(figure);
    }
    byId('foundation-error').textContent = ''; byId('foundation-import-status').textContent = `已载入 ${verified.length} 笔，版本与重新生成结果一致。艺术效果仍待评判。`;
    byId('foundation-import-status').dataset.status = 'passed';
  } catch (error) { byId('foundation-error').textContent = error.message; byId('foundation-import-status').textContent = '载入未完成'; byId('foundation-import-status').dataset.status = 'failed'; }
}

byId('foundation-controls').addEventListener('submit', event => { event.preventDefault(); renderAll(); });
for (const id of ['foundation-path', 'foundation-overlay']) byId(id).addEventListener('change', renderAll);
for (const id of ['foundation-press', 'foundation-switch', 'foundation-dry']) byId(id).addEventListener('input', renderAll);
byId('foundation-export-json').addEventListener('click', () => download(new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' }), 'json'));
byId('foundation-export-png').addEventListener('click', exportSheet);
byId('foundation-load-text').addEventListener('click', () => loadJson(byId('foundation-json-input').value));
byId('foundation-import-json').addEventListener('change', async event => {
  try {
    const file = event.currentTarget.files[0]; if (!file) return;
    if (file.size > 2_000_000) throw new RangeError('JSON 超过 2 MB，请载入较小的练习文件');
    loadJson(await file.text());
  } catch (error) { byId('foundation-error').textContent = error.message; }
});
byId('foundation-check').addEventListener('click', async event => {
  const button = event.currentTarget, output = byId('foundation-verification'); button.disabled = true;
  output.dataset.status = 'running'; output.textContent = '正在检查三种笔路…';
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const result = await verifyFoundationStudies({ seed: inputs.seed }); output.textContent = JSON.stringify(result, null, 2);
    output.dataset.status = result.passed ? 'passed' : 'failed';
  } catch (error) { output.textContent = error.message; output.dataset.status = 'failed'; }
  finally { button.disabled = false; }
});
renderAll();
