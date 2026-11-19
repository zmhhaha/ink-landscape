import { renderCanvas, createDotDocument, compileDotRecipe, sampleBrushContact, TECHNIQUE_SOURCES, getTechnique } from '../dist/index.js';
import { makeDotStudies, editDotPlacement, dotInputs, dotSize, dotScene } from './dot-fixtures.mjs';
import { verifyDotStudies } from './dot-verify.mjs';

const byId = id => document.getElementById(id);
const sourceById = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
let inputs = { ...dotInputs }, studies = [], edited;
const readInputs = () => ({ seed: Number(byId('dot-seed').value), layout: byId('dot-layout').value,
  press: Number(byId('dot-press').value), spacing: Number(byId('dot-spacing').value), response: Number(byId('dot-response').value) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function overlay(context, source, selected) {
  context.save(); context.lineWidth = .85; context.font = '10px ui-monospace, monospace';
  for (const [i, mark] of source.result.entries()) {
    const samples = sampleBrushContact(mark), anchor = source.recipe.positions[i];
    context.globalAlpha = .85; context.strokeStyle = '#a94d3b'; context.setLineDash([]); context.beginPath();
    samples.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
    context.strokeStyle = '#62966a'; context.setLineDash([3, 3]); context.beginPath();
    samples.forEach((point, index) => index ? context.lineTo(point.centerX, point.centerY) : context.moveTo(point.centerX, point.centerY)); context.stroke();
    context.setLineDash([]); context.strokeStyle = anchor.id === selected ? '#a94d3b' : '#546d92';
    context.beginPath(); context.arc(anchor.x, anchor.y, anchor.id === selected ? 5 : 3, 0, Math.PI * 2); context.stroke();
    context.fillStyle = '#546d92'; context.fillText(anchor.id ?? `${i + 1}`, anchor.x - 7, anchor.y - 9);
  }
  context.restore();
}

function draw(canvas, scene, source, showOverlay = byId('dot-overlay').checked, selected) {
  canvas.width = scene.width; canvas.height = scene.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderCanvas(context, scene, { time: 4, paperTexture: .02 });
  if (showOverlay) overlay(context, source, selected);
}

function detailView(sourceCanvas, source, studyId) {
  const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 200; canvas.className = 'dot-detail';
  const index = studyId === 'group' ? 3 : 0, samples = sampleBrushContact(source.result[index]);
  const point = samples[Math.floor(samples.length / 2)], label = studyId === 'group' ? '第 4 点附近' : '第 1 点';
  canvas.setAttribute('aria-label', `${label}原图局部放大两倍`);
  const context = canvas.getContext('2d'); context.fillStyle = dotSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#65705e'; context.font = '13px Microsoft YaHei, sans-serif'; context.fillText(`局部 · ${label} ×2`, 16, 30);
  context.drawImage(sourceCanvas, point.centerX - 48, point.centerY - 48, 96, 96, 184, 4, 192, 192);
  return canvas;
}

function referenceList(ids) {
  const details = document.createElement('details'), title = document.createElement('summary');
  details.className = 'dot-sources'; title.textContent = '阅读依据与传统术语范围'; details.append(title);
  const sources = new Map();
  for (const id of ids) for (const evidence of getTechnique(id)?.reading.evidence ?? []) {
    const source = sourceById.get(evidence.sourceId);
    if (source && !sources.has(source.id)) sources.set(source.id, { source, locator: evidence.locator });
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
  return { kind: 'ink-dot-study', version: 1, inputs,
    studies: studies.map(study => ({ id: study.id, variants: study.variants.map(variant => ({ id: variant.id, label: variant.label, document: variant.document })) })),
    edit: { selectedId: byId('dot-edit-id').value, dx: Number(byId('dot-edit-x').value), dy: Number(byId('dot-edit-y').value), angleDegrees: Number(byId('dot-edit-angle').value), document: edited },
    artisticValidation: 'unreviewed' };
}

function renderEditor() {
  const original = studies.find(study => study.id === 'group').variants[2].document, id = byId('dot-edit-id').value;
  const dx = Number(byId('dot-edit-x').value), dy = Number(byId('dot-edit-y').value), angleDegrees = Number(byId('dot-edit-angle').value);
  edited = editDotPlacement(original, id, { dx, dy, angle: angleDegrees * Math.PI / 180 });
  draw(byId('dot-editor-canvas'), dotScene(edited, inputs.seed), edited, byId('dot-overlay').checked, id);
  for (const [key, value] of [['x', dx], ['y', dy], ['angle', `${angleDegrees}°`]]) byId(`dot-edit-${key}-value`).textContent = value;
  const unchanged = original.result.every((mark, i) => original.recipe.positions[i].id === id || same(mark, edited.result[i]));
  const index = original.recipe.positions.findIndex(point => point.id === id), seedStable = original.result[index].seed === edited.result[index].seed;
  byId('dot-editor-status').textContent = `当前仅修改 ${id} · 其余 8 笔${unchanged ? '数据保持一致' : '数据出现变化'} · 所选笔材质种子${seedStable ? '保持一致' : '出现变化'}`;
  byId('dot-editor-status').dataset.status = unchanged && seedStable ? 'passed' : 'failed';
  byId('dot-record').textContent = JSON.stringify(record());
}

function renderAll() {
  if (!byId('dot-seed').checkValidity()) { byId('dot-seed').reportValidity(); return; }
  try {
    inputs = readInputs(); studies = makeDotStudies(inputs); byId('dot-error').textContent = '';
    for (const key of ['press', 'spacing', 'response']) byId(`dot-${key}-value`).textContent = inputs[key].toFixed(2);
    byId('dot-conditions').textContent = `同组固定笔迹集合 · 种子 ${inputs.seed} · 每格 ${dotSize.width} × ${dotSize.height} · 原图局部 ×2 · Canvas 2D${byId('dot-overlay').checked ? ' · 蓝圈：原始落点（锋尖起点，非笔肚中心）；红线：锋尖；绿虚线：接触中心。零压力处可保留笔路，但不落墨。' : ''}`;
    const container = byId('dot-studies'); container.replaceChildren();
    for (const study of studies) {
      const section = document.createElement('section'); section.className = 'dot-group'; section.dataset.study = study.id;
      const heading = document.createElement('div'), title = document.createElement('h2'), variable = document.createElement('p');
      heading.className = 'dot-heading'; title.textContent = study.title; variable.textContent = study.variable; heading.append(title, variable);
      const grid = document.createElement('div'); grid.className = 'dot-grid';
      for (const variant of study.variants) {
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id; canvas.setAttribute('aria-label', `${study.title} ${variant.label}`);
        draw(canvas, variant.scene, variant.document); caption.textContent = variant.label;
        figure.append(canvas, detailView(canvas, variant.document, study.id), caption); grid.append(figure);
      }
      const notes = document.createElement('div'); notes.className = 'dot-notes';
      for (const [label, text] of [['看什么', study.criteria], ['当前范围', study.limits]]) {
        const paragraph = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${label}：`;
        paragraph.append(strong, document.createTextNode(text)); notes.append(paragraph);
      }
      section.append(heading, grid, notes, referenceList(study.techniqueIds)); container.append(section);
    }
    const selected = byId('dot-edit-id').value, select = byId('dot-edit-id'); select.replaceChildren();
    for (const point of studies[2].variants[2].document.recipe.positions) {
      const option = document.createElement('option'); option.value = point.id; option.textContent = point.id; select.append(option);
    }
    select.value = selected || 'group-4'; renderEditor();
    byId('dot-verification').dataset.status = 'idle'; byId('dot-verification').textContent = '尚未运行';
    document.querySelector('main').dataset.status = 'ready';
  } catch (error) { byId('dot-error').textContent = error.message; document.querySelector('main').dataset.status = 'failed'; }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `ink-dot-batch03-${inputs.seed}-${inputs.layout}.${extension}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1740;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = dotSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304734'; context.font = '28px Microsoft YaHei, sans-serif'; context.fillText('基础笔法第三批 · 单点提按 / 横竖斜点势 / 群点组织', 26, 44);
  context.font = '15px Microsoft YaHei, sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.layout} · 原创程序样片 · 艺术效果待评判`, 26, 76);
  const sample = document.createElement('canvas');
  for (const [row, study] of studies.entries()) {
    const y = 118 + row * 530; context.font = '22px Microsoft YaHei, sans-serif'; context.fillText(study.title, 26, y);
    for (const [column, variant] of study.variants.entries()) {
      draw(sample, variant.scene, variant.document, false); context.drawImage(sample, 26 + column * 574, y + 18);
      const detail = detailView(sample, variant.document, study.id); context.drawImage(detail, 26 + column * 574, y + 260);
      detail.width = 0; detail.height = 0; context.font = '15px Microsoft YaHei, sans-serif'; context.fillText(variant.label, 26 + column * 574, y + 490);
    }
  }
  sample.width = 0; sample.height = 0;
  canvas.toBlob(blob => { if (blob) download(blob, 'png'); else byId('dot-error').textContent = '浏览器未能生成 PNG'; canvas.width = 0; canvas.height = 0; }, 'image/png');
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
    if (value.kind === 'ink-dot-study') {
      if (value.version !== 1 || !Array.isArray(value.studies) || value.studies.length > 12) throw new RangeError('不支持的练习文件版本或结构');
      documents = value.studies.flatMap(study => {
        if (!Array.isArray(study.variants) || study.variants.length > 6) throw new TypeError('练习 variants 无效');
        return study.variants.map(variant => ({ label: `${study.id} · ${variant.label}`, document: variant.document }));
      });
      if (value.edit?.document) documents.push({ label: `独立编辑 · ${value.edit.selectedId}`, document: value.edit.document });
    } else documents = [{ label: '载入的点组', document: value }];
    if (!documents.length || documents.length > 36) throw new RangeError('每次载入 1–36 个点组');
    const verified = documents.map(({ label, document: saved }) => {
      if (!saved || saved.version !== 1 || !saved.recipe || !Array.isArray(saved.result) || !Array.isArray(saved.recipe.positions)
          || saved.recipe.positions.length > 72) throw new RangeError('不支持的点迹文档版本、结构或点数');
      const result = compileDotRecipe(saved.recipe);
      if (JSON.stringify(stable(result)) !== JSON.stringify(stable(saved.result))) throw new Error(`${label}：保存笔迹与重新生成的结果不一致`);
      return { label, document: createDotDocument(saved.recipe.positions, saved.recipe.options) };
    });
    const figures = verified.map(({ label, document: saved }) => {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
      draw(canvas, dotScene(saved, saved.recipe.options.seed), saved, false); caption.textContent = label; figure.append(canvas, caption); return figure;
    });
    byId('dot-imported').replaceChildren(...figures);
    byId('dot-error').textContent = ''; byId('dot-import-status').textContent = `已载入 ${verified.length} 个点组，版本与重新生成结果一致。艺术效果仍待评判。`;
    byId('dot-import-status').dataset.status = 'passed';
  } catch (error) { byId('dot-error').textContent = error.message; byId('dot-import-status').textContent = '载入未完成，保留上次成功载入的样片'; byId('dot-import-status').dataset.status = 'failed'; }
}

function resetEditor() { for (const key of ['x', 'y', 'angle']) byId(`dot-edit-${key}`).value = 0; renderEditor(); }
byId('dot-controls').addEventListener('submit', event => { event.preventDefault(); renderAll(); });
for (const id of ['dot-layout', 'dot-overlay']) byId(id).addEventListener('change', renderAll);
for (const id of ['dot-press', 'dot-spacing', 'dot-response']) byId(id).addEventListener('input', renderAll);
for (const id of ['dot-edit-x', 'dot-edit-y', 'dot-edit-angle']) byId(id).addEventListener('input', renderEditor);
byId('dot-edit-id').addEventListener('change', resetEditor); byId('dot-edit-reset').addEventListener('click', resetEditor);
byId('dot-export-json').addEventListener('click', () => download(new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' }), 'json'));
byId('dot-export-png').addEventListener('click', exportSheet);
byId('dot-load-text').addEventListener('click', () => loadJson(byId('dot-json-input').value));
byId('dot-import-json').addEventListener('change', async event => {
  try { const file = event.currentTarget.files[0]; if (!file) return;
    if (file.size > 2_000_000) throw new RangeError('JSON 超过 2 MB，请载入较小的练习文件'); loadJson(await file.text());
  } catch (error) { byId('dot-error').textContent = error.message; }
});
byId('dot-check').addEventListener('click', async event => {
  const button = event.currentTarget, output = byId('dot-verification'); button.disabled = true;
  output.dataset.status = 'running'; output.textContent = '正在检查三种落点布局…';
  try { await new Promise(resolve => requestAnimationFrame(resolve)); const result = await verifyDotStudies({ seed: inputs.seed });
    output.textContent = JSON.stringify(result, null, 2); output.dataset.status = result.passed ? 'passed' : 'failed';
  } catch (error) { output.textContent = error.message; output.dataset.status = 'failed'; }
  finally { button.disabled = false; }
});
renderAll();
