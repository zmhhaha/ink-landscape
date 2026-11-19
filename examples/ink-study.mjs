import { renderInkProcess, createInkProcessDocument, compileInkProcessRecipe, TECHNIQUE_SOURCES, getTechnique } from '../dist/index.js';
import { makeInkStudies, editInkLayer, inkInputs, inkSize } from './ink-fixtures.mjs';
import { verifyInkStudies } from './ink-verify.mjs';

const byId = id => document.getElementById(id);
const sourcesById = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let inputs = { ...inkInputs }, studies = [], edited, studyInputKey, editorMemo;
const programInputKeys = ['seed', 'layout', 'concentration', 'accumulation', 'interval'];
const readInputs = () => ({ seed: Number(byId('ink-seed').value), layout: byId('ink-layout').value,
  concentration: Number(byId('ink-concentration').value), accumulation: Number(byId('ink-accumulation').value),
  interval: Number(byId('ink-interval').value), time: Number(byId('ink-time').value) });

function overlay(context, process, selected) {
  const colors = ['#aa6955', '#4a7b73', '#657fa1'];
  context.save(); context.lineWidth = .9; context.font = '10px ui-monospace,monospace';
  for (const [index, layer] of process.layers.entries()) {
    if (layer.at > inputs.time) continue;
    context.strokeStyle = colors[index % colors.length]; context.fillStyle = colors[index % colors.length];
    context.globalAlpha = selected && layer.id !== selected ? .5 : .9;
    for (const mark of layer.marks) {
      context.beginPath(); mark.points.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
      const point = mark.points[0]; context.beginPath(); context.arc(point.x, point.y, 3, 0, Math.PI * 2); context.stroke();
    }
  }
  context.restore();
}

function draw(canvas, process, showOverlay = byId('ink-overlay').checked, selected) {
  canvas.width = process.width; canvas.height = process.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderInkProcess(context, process, { time: inputs.time, cellSize: 1 });
  if (showOverlay) overlay(context, process, selected);
}

function detailView(sourceCanvas, studyId) {
  const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 200; canvas.className = 'ink-detail';
  canvas.setAttribute('aria-label', '墨层交界原图局部放大两倍');
  const context = canvas.getContext('2d'); context.fillStyle = inkSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#65705e'; context.font = '13px Microsoft YaHei,sans-serif'; context.fillText('交界局部 ×2', 16, 30);
  const [x, y] = studyId === 'broken' ? [280, 145] : [275, 157];
  context.drawImage(sourceCanvas, x - 48, y - 48, 96, 96, 184, 4, 192, 192);
  return canvas;
}

function referenceList(ids) {
  const details = document.createElement('details'), summary = document.createElement('summary');
  details.className = 'ink-sources'; summary.textContent = '阅读依据与传统术语范围'; details.append(summary);
  const sources = new Map();
  for (const id of ids) for (const evidence of getTechnique(id)?.reading.evidence ?? []) {
    const source = sourcesById.get(evidence.sourceId);
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
  return { kind: 'ink-process-study', version: 1, inputs,
    studies: studies.map(study => ({ id: study.id, variants: study.variants.map(variant => ({ id: variant.id, label: variant.label, document: variant.document })) })),
    edit: { selectedId: byId('ink-edit-id').value, dx: Number(byId('ink-edit-x').value), concentration: Number(byId('ink-edit-concentration').value), document: edited },
    artisticValidation: 'unreviewed' };
}

function renderEditor() {
  const original = studies[1].variants[2].document, id = byId('ink-edit-id').value;
  const dx = Number(byId('ink-edit-x').value), concentration = Number(byId('ink-edit-concentration').value);
  if (!editorMemo || editorMemo.original !== original || editorMemo.id !== id
    || editorMemo.dx !== dx || editorMemo.concentration !== concentration) {
    edited = editInkLayer(original, id, { dx, concentration });
    editorMemo = { original, id, dx, concentration, document: edited };
  } else edited = editorMemo.document;
  draw(byId('ink-editor-canvas'), edited.result, byId('ink-overlay').checked, id);
  byId('ink-edit-x-value').textContent = dx; byId('ink-edit-concentration-value').textContent = concentration.toFixed(2);
  const unchanged = original.recipe.layers.every((layer, i) => layer.id === id || same(layer, edited.recipe.layers[i]));
  const index = original.result.layers.findIndex(layer => layer.id === id);
  const seedsStable = original.result.layers[index].marks.every((mark, i) => mark.seed === edited.result.layers[index].marks[i].seed);
  byId('ink-editor-status').textContent = `当前修改 ${id} · 其余 ${original.recipe.layers.length - 1} 层源数据${unchanged ? '保持一致' : '出现变化'} · 材质种子${seedsStable ? '保持一致' : '出现变化'}`;
  byId('ink-editor-status').dataset.status = unchanged && seedsStable ? 'passed' : 'failed';
  byId('ink-record').textContent = JSON.stringify(record());
}

function resetEditor() {
  const id = byId('ink-edit-id').value, layer = studies[1].variants[2].document.recipe.layers.find(layer => layer.id === id);
  byId('ink-edit-x').value = 0; byId('ink-edit-concentration').value = layer.concentration; renderEditor();
}

function renderAll(resetEdit = true) {
  if (!byId('ink-seed').checkValidity()) { byId('ink-seed').reportValidity(); return; }
  try {
    const nextInputs = readInputs(), nextStudyInputKey = JSON.stringify(programInputKeys.map(key => nextInputs[key]));
    // Time and overlays only change presentation. Keep the same frozen programs
    // so the density masks and renderer's event-phase frames can be reused.
    if (!studies.length || nextStudyInputKey !== studyInputKey) {
      studies = makeInkStudies(nextInputs); studyInputKey = nextStudyInputKey;
    }
    inputs = nextInputs; byId('ink-error').textContent = '';
    for (const key of ['concentration', 'accumulation']) byId(`ink-${key}-value`).textContent = inputs[key].toFixed(2);
    for (const key of ['interval', 'time']) byId(`ink-${key}-value`).textContent = `${inputs[key].toFixed(1)} 秒`;
    byId('ink-conditions').textContent = `种子 ${inputs.seed} · 每格 ${inkSize.width} × ${inkSize.height} · 栅格步长 2 · 原图局部 ×2 · Canvas 2D · 当前 ${inputs.time.toFixed(1)} 秒${byId('ink-overlay').checked ? ' · 色线为各层锋尖笔路，圆圈为源起点，零压力仍不落墨。' : ''}`;
    const container = byId('ink-studies'); container.replaceChildren();
    for (const study of studies) {
      const section = document.createElement('section'); section.className = 'ink-group'; section.dataset.study = study.id; section.id = `ink-study-${study.id}`;
      const heading = document.createElement('div'), title = document.createElement('h2'), variable = document.createElement('p');
      heading.className = 'ink-heading'; title.textContent = study.title; variable.textContent = study.variable; heading.append(title, variable);
      const grid = document.createElement('div'); grid.className = 'ink-grid';
      for (const variant of study.variants) {
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption'), meta = document.createElement('p');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id; canvas.setAttribute('aria-label', `${study.title} ${variant.label}`);
        draw(canvas, variant.document.result); caption.textContent = variant.label; meta.className = 'ink-layer-meta';
        meta.textContent = variant.document.result.layers.map(layer => `${layer.id}：${layer.at.toFixed(1)}s / 浓${layer.concentration.toFixed(2)} / 水${layer.water.toFixed(2)}`).join(' · ');
        figure.append(canvas, detailView(canvas, study.id), caption, meta); grid.append(figure);
      }
      const notes = document.createElement('div'); notes.className = 'ink-notes';
      for (const [label, text] of [['看什么', study.criteria], ['当前范围', study.limits]]) {
        const paragraph = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${label}：`;
        paragraph.append(strong, document.createTextNode(text)); notes.append(paragraph);
      }
      section.append(heading, grid, notes, referenceList(study.techniqueIds)); container.append(section);
    }
    const selected = byId('ink-edit-id').value, select = byId('ink-edit-id'); select.replaceChildren();
    for (const layer of studies[1].variants[2].document.recipe.layers) {
      const option = document.createElement('option'); option.value = layer.id; option.textContent = layer.id; select.append(option);
    }
    select.value = selected || 'third'; if (resetEdit) resetEditor(); else renderEditor();
    byId('ink-verification').dataset.status = 'idle'; byId('ink-verification').textContent = '尚未运行';
    document.querySelector('main').dataset.status = 'ready';
  } catch (error) { byId('ink-error').textContent = error.message; document.querySelector('main').dataset.status = 'failed'; }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `ink-methods-batch04-${inputs.seed}-${inputs.layout}.${extension}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1840;
  const context = canvas.getContext('2d'); context.fillStyle = inkSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304734'; context.font = '28px Microsoft YaHei,sans-serif'; context.fillText('墨法第四批 · 浓淡 / 积墨 / 破墨', 26, 44);
  context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.layout} · ${inputs.time.toFixed(1)} 秒 · 原创程序样片 · 艺术效果待评判`, 26, 76);
  const sample = document.createElement('canvas');
  for (const [row, study] of studies.entries()) {
    const y = 118 + row * 560; context.font = '22px Microsoft YaHei,sans-serif'; context.fillText(study.title, 26, y);
    for (const [column, variant] of study.variants.entries()) {
      draw(sample, variant.document.result, false); context.drawImage(sample, 26 + column * 574, y + 18);
      const detail = detailView(sample, study.id); context.drawImage(detail, 26 + column * 574, y + 280); detail.width = 0; detail.height = 0;
      context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(variant.label, 26 + column * 574, y + 510);
    }
  }
  sample.width = 0; sample.height = 0;
  canvas.toBlob(blob => { if (blob) download(blob, 'png'); else byId('ink-error').textContent = '浏览器未能生成 PNG'; canvas.width = 0; canvas.height = 0; }, 'image/png');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function loadJson(text) {
  try {
    if (text.length > 8_000_000) throw new RangeError('JSON 超过 8 MB，请载入较小的练习文件');
    const value = JSON.parse(text); let documents;
    if (value.kind === 'ink-process-study') {
      if (value.version !== 1 || !Array.isArray(value.studies) || value.studies.length > 12) throw new RangeError('不支持的练习文件版本或结构');
      documents = value.studies.flatMap(study => {
        if (!Array.isArray(study.variants) || study.variants.length > 6) throw new TypeError('练习 variants 无效');
        return study.variants.map(variant => ({ label: `${study.id} · ${variant.label}`, document: variant.document }));
      });
      if (value.edit?.document) documents.push({ label: `独立编辑 · ${value.edit.selectedId}`, document: value.edit.document });
    } else documents = [{ label: '载入的墨层', document: value }];
    if (!documents.length || documents.length > 36) throw new RangeError('每次载入 1–36 个墨层组合');
    const verified = documents.map(({ label, document: saved }) => {
      if (!saved || saved.version !== 1 || !saved.recipe || !saved.result || !Array.isArray(saved.recipe.layers)
        || saved.recipe.layers.length > 24 || saved.recipe.layers.some(layer => !Array.isArray(layer.strokes) || layer.strokes.length > 32)) throw new RangeError('不支持的墨层文档版本、结构或笔数');
      const result = compileInkProcessRecipe(saved.recipe);
      if (JSON.stringify(stable(result)) !== JSON.stringify(stable(saved.result))) throw new Error(`${label}：保存结果与重新生成的墨层不一致`);
      if (result.width > 1280 || result.height > 1280) throw new RangeError('预览仅载入不超过 1280 × 1280 的墨层');
      return { label, document: createInkProcessDocument(saved.recipe.layers, saved.recipe.options) };
    });
    const figures = verified.map(({ label, document: saved }) => {
      const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
      draw(canvas, saved.result, false); caption.textContent = label; figure.append(canvas, caption); return figure;
    });
    byId('ink-imported').replaceChildren(...figures); byId('ink-error').textContent = '';
    byId('ink-import-status').textContent = `已载入 ${verified.length} 个墨层组合，版本与重编译结果一致。艺术效果仍待评判。`;
    byId('ink-import-status').dataset.status = 'passed';
  } catch (error) { byId('ink-error').textContent = error.message; byId('ink-import-status').textContent = '载入未完成，保留上次成功载入的样片'; byId('ink-import-status').dataset.status = 'failed'; }
}

byId('ink-controls').addEventListener('submit', event => { event.preventDefault(); renderAll(); });
byId('ink-layout').addEventListener('change', () => renderAll());
byId('ink-overlay').addEventListener('change', () => renderAll(false));
for (const id of ['ink-concentration', 'ink-accumulation', 'ink-interval']) byId(id).addEventListener('input', () => renderAll());
byId('ink-time').addEventListener('input', () => renderAll(false));
for (const id of ['ink-edit-x', 'ink-edit-concentration']) byId(id).addEventListener('input', renderEditor);
byId('ink-edit-id').addEventListener('change', resetEditor); byId('ink-edit-reset').addEventListener('click', resetEditor);
byId('ink-export-json').addEventListener('click', () => download(new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' }), 'json'));
byId('ink-export-png').addEventListener('click', exportSheet);
byId('ink-load-text').addEventListener('click', () => loadJson(byId('ink-json-input').value));
byId('ink-import-json').addEventListener('change', async event => {
  try { const file = event.currentTarget.files[0]; if (!file) return;
    if (file.size > 8_000_000) throw new RangeError('JSON 超过 8 MB，请载入较小的练习文件'); loadJson(await file.text());
  } catch (error) { byId('ink-error').textContent = error.message; }
});
byId('ink-check').addEventListener('click', async event => {
  const button = event.currentTarget, output = byId('ink-verification'); button.disabled = true; output.dataset.status = 'running'; output.textContent = '正在检查三种笔组…';
  try { await new Promise(resolve => requestAnimationFrame(resolve)); const result = await verifyInkStudies({ seed: inputs.seed });
    output.textContent = JSON.stringify(result, null, 2); output.dataset.status = result.passed ? 'passed' : 'failed';
  } catch (error) { output.textContent = error.message; output.dataset.status = 'failed'; }
  finally { button.disabled = false; }
});
renderAll();
