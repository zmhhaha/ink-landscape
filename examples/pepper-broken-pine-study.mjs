import { renderCanvas, compileVegetationRecipe, createVegetationDocument, TECHNIQUE_SOURCES, getTechnique } from '../dist/index.js';
import { makePepperBrokenPineStudies, editPepperBrokenPineCluster, pepperBrokenPineInputs, pepperBrokenPineSize } from './pepper-broken-pine-fixtures.mjs';
import { verifyPepperBrokenPineStudies } from './pepper-broken-pine-verify.mjs';

const byId = id => document.getElementById(id);
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};
const sources = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
let inputs = { ...pepperBrokenPineInputs }, studies = [], edited, inputKey, editMemo;
const readInputs = () => ({ seed: Number(byId('pbp-seed').value), layout: byId('pbp-layout').value,
  widthScale: Number(byId('pbp-width').value), dryness: Number(byId('pbp-dryness').value), time: Number(byId('pbp-time').value) });
function overlay(context, document) {
  context.save(); context.strokeStyle = '#a66d57'; context.lineWidth = .8; context.setLineDash([4, 3]);
  for (const stroke of document.recipe.units.flatMap(unit => unit.strokes)) {
    if ((stroke.options?.start ?? 0) > inputs.time) continue;
    context.beginPath(); stroke.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
  }
  context.restore();
}
function draw(canvas, document, withOverlay = byId('pbp-overlay').checked) {
  canvas.width = document.result.width; canvas.height = document.result.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderCanvas(context, document.result, { time: inputs.time, paperTexture: 0 }); if (withOverlay) overlay(context, document);
}
function detailView(sourceCanvas, study, variant) {
  const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 200; canvas.className = 'ink-detail';
  canvas.setAttribute('aria-label', '同一标识点簇或针束原图局部放大两倍');
  const context = canvas.getContext('2d'); context.fillStyle = pepperBrokenPineSize.background; context.fillRect(0, 0, 560, 200);
  context.fillStyle = '#65705e'; context.font = '13px Microsoft YaHei,sans-serif'; context.fillText('同一对象 ×2', 16, 30);
  const anchor = variant.document.recipe.units.find(unit => unit.id === 'cluster-1').strokes[0].points[0];
  const [x, y] = [anchor.x, anchor.y + 8];
  context.drawImage(sourceCanvas, x - 48, y - 48, 96, 96, 184, 4, 192, 192); return canvas;
}
function referenceList(ids) {
  const details = document.createElement('details'), summary = document.createElement('summary'), list = document.createElement('ul'), seen = new Set();
  details.className = 'ink-sources'; summary.textContent = '阅读依据与术语范围'; details.append(summary);
  for (const id of ids) for (const evidence of getTechnique(id)?.reading.evidence ?? []) {
    const source = sources.get(evidence.sourceId); if (!source || seen.has(source.id)) continue; seen.add(source.id);
    const item = document.createElement('li'), link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = source.title;
    item.append(link, document.createTextNode(`；定位：${evidence.locator}`)); list.append(item);
  }
  details.append(list); return details;
}
function record() {
  return { kind: 'pepper-broken-pine-guides-study', version: 1, inputs,
    studies: studies.map(study => ({ id: study.id, variants: study.variants.map(variant => ({ id: variant.id, label: variant.label, document: variant.document })) })),
    edit: { studyId: byId('pbp-edit-study').value, variantId: studies.find(study => study.id === byId('pbp-edit-study').value).variants[2].id, selectedId: byId('pbp-edit-id').value, dx: Number(byId('pbp-edit-x').value), widthScale: editMemo?.widthScale,
      rotationRadians: (editMemo?.rotation ?? 0) * Math.PI / 180, document: edited }, artisticValidation: 'unreviewed' };
}
function renderEditor() {
  const selectedStudy = studies.find(study => study.id === byId('pbp-edit-study').value);
  const original = selectedStudy.variants[2].document, id = byId('pbp-edit-id').value;
  const dx = Number(byId('pbp-edit-x').value), widthScale = Number(byId('pbp-edit-width').value), rotation = Number(byId('pbp-edit-rotation').value);
  if (!editMemo || editMemo.original !== original || editMemo.id !== id || editMemo.dx !== dx || editMemo.widthScale !== widthScale || editMemo.rotation !== rotation) {
    edited = editPepperBrokenPineCluster(original, id, { dx, widthScale, rotation: rotation * Math.PI / 180 });
    editMemo = { original, id, dx, widthScale, rotation, document: edited };
  } else edited = editMemo.document;
  draw(byId('pbp-editor-canvas'), edited);
  byId('pbp-edit-x-value').textContent = dx;
  byId('pbp-edit-width-value').textContent = `×${widthScale.toFixed(2)}`;
  byId('pbp-edit-rotation-value').textContent = `${rotation}°`;
  const otherSources = original.recipe.units.every((unit, i) => unit.id === id || same(unit, edited.recipe.units[i]));
  const prefix = `${id.length}:${id}/`;
  const otherMarks = original.result.marks.every((mark, i) => mark.id.startsWith(prefix) || same(mark, edited.result.marks[i]));
  const seeds = original.result.marks.every((mark, i) => mark.seed === edited.result.marks[i].seed);
  byId('pbp-editor-status').textContent = `当前对象 ${id} · 其余对象源${otherSources ? '保持' : '改变'} · 其余笔迹${otherMarks ? '保持' : '改变'} · 材质种子${seeds ? '保持' : '改变'}`;
  byId('pbp-editor-status').dataset.status = otherSources && otherMarks && seeds ? 'passed' : 'failed'; byId('pbp-record').textContent = JSON.stringify(record());
}
function populateEditor(resetEdit = true) {
  const select = byId('pbp-edit-id'), selected = select.value;
  const selectedStudy = studies.find(study => study.id === byId('pbp-edit-study').value);
  select.replaceChildren();
  for (const unit of selectedStudy.variants[2].document.recipe.units.filter(unit => unit.role !== 'structure')) {
    const option = document.createElement('option'); option.value = unit.id; option.textContent = unit.id; select.append(option);
  }
  select.value = selectedStudy.variants[2].document.recipe.units.some(unit => unit.id === selected) ? selected : 'cluster-1';
  if (resetEdit) resetEditor(); else renderEditor();
}
function resetEditor() {
  byId('pbp-edit-x').value = 0; byId('pbp-edit-width').value = 1; byId('pbp-edit-rotation').value = 0; renderEditor();
}
function renderAll(resetEdit = true) {
  if (!byId('pbp-seed').checkValidity()) { byId('pbp-seed').reportValidity(); return; }
  try {
    const next = readInputs(), key = JSON.stringify([next.seed, next.layout, next.widthScale, next.dryness]);
    if (!studies.length || inputKey !== key) { studies = makePepperBrokenPineStudies(next); inputKey = key; }
    inputs = next; byId('pbp-error').textContent = ''; byId('pbp-width-value').textContent = inputs.widthScale.toFixed(2);
    byId('pbp-dryness-value').textContent = inputs.dryness.toFixed(2); byId('pbp-time-value').textContent = `${inputs.time.toFixed(1)} 秒`;
    byId('pbp-conditions').textContent = `种子 ${inputs.seed} · 每格 560 × 260 · 局部 ×2 · Canvas 2D · 纸纹 0 · 当前 ${inputs.time.toFixed(1)} 秒${byId('pbp-overlay').checked ? ' · 虚线为作者源路径。' : ''}`;
    const container = byId('pbp-studies'); container.replaceChildren();
    for (const study of studies) {
      const section = document.createElement('section'), heading = document.createElement('div'), title = document.createElement('h2'), variable = document.createElement('p'), grid = document.createElement('div');
      section.className = 'ink-group'; section.id = `pbp-study-${study.id}`; heading.className = 'ink-heading'; title.textContent = study.title; variable.textContent = study.variable; heading.append(title, variable); grid.className = 'ink-grid';
      for (const variant of study.variants) {
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption'), meta = document.createElement('p');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id; canvas.setAttribute('aria-label', `${study.title} ${variant.label}`);
        draw(canvas, variant.document); caption.textContent = variant.label; meta.className = 'pbp-meta'; meta.textContent = `${variant.document.recipe.units.length} 个可编辑对象 · 枯润 ${inputs.dryness.toFixed(2)} · 笔宽 ×${inputs.widthScale.toFixed(2)}`;
        figure.append(canvas, detailView(canvas, study, variant), caption, meta); grid.append(figure);
      }
      const notes = document.createElement('div'); notes.className = 'ink-notes';
      for (const [label, text] of [['观察记录', study.criteria], ['当前范围', study.limits]]) {
        const paragraph = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${label}：`; paragraph.append(strong, document.createTextNode(text)); notes.append(paragraph);
      }
      section.append(heading, grid, notes, referenceList(study.techniqueIds)); container.append(section);
    }
    populateEditor(resetEdit);
    byId('pbp-verification').dataset.status = 'idle'; byId('pbp-verification').textContent = '尚未运行'; document.querySelector('main').dataset.status = 'ready';
  } catch (error) { byId('pbp-error').textContent = error.message; document.querySelector('main').dataset.status = 'failed'; }
}
function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `pepper-broken-pine-batch11-${inputs.seed}-${inputs.layout}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1840;
  const context = canvas.getContext('2d'); context.fillStyle = pepperBrokenPineSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304734'; context.font = '28px Microsoft YaHei,sans-serif'; context.fillText('点与针第十一批 · 胡椒点 / 破笔点 / 松针', 26, 44);
  context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.layout} · ${inputs.time.toFixed(1)} 秒 · 原创程序样片 · 待统一评价`, 26, 76);
  const sample = document.createElement('canvas');
  for (const [row, study] of studies.entries()) {
    const y = 118 + row * 560; context.font = '22px Microsoft YaHei,sans-serif'; context.fillText(study.title, 26, y);
    for (const [column, variant] of study.variants.entries()) {
      draw(sample, variant.document, false); context.drawImage(sample, 26 + column * 574, y + 18);
      const detail = detailView(sample, study, variant); context.drawImage(detail, 26 + column * 574, y + 280); detail.width = 0;
      context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(variant.label, 26 + column * 574, y + 510);
    }
  }
  sample.width = 0; canvas.toBlob(blob => { if (blob) download(blob, 'png'); canvas.width = 0; }, 'image/png');
}
function loadJson(text) {
  try {
    if (text.length > 32_000_000) throw new RangeError('JSON 超过 32 MB'); const parsed = JSON.parse(text); let entries;
    if (parsed.kind === 'pepper-broken-pine-guides-study') {
      if (parsed.version !== 1 || !Array.isArray(parsed.studies)) throw new RangeError('不支持的点与针记录版本');
      entries = parsed.studies.flatMap(study => study.variants.map(variant => ({ label: String(variant.label), document: variant.document })));
      if (parsed.edit?.document) entries.push({ label: '已保存的整簇修改', document: parsed.edit.document });
    } else entries = [{ label: '载入的点与针组合', document: parsed }];
    if (!entries.length || entries.length > 16) throw new RangeError('每次载入 1–16 个点与针组合');
    const restored = entries.map(entry => {
      if (entry.document.version !== 1) throw new RangeError('不支持的点与针文档版本'); const result = compileVegetationRecipe(entry.document.recipe);
      if (!same(result, entry.document.result)) throw new RangeError('保存结果与重新生成的点与针笔迹不一致');
      return { label: entry.label, document: createVegetationDocument(entry.document.recipe.units, entry.document.recipe.options) };
    });
    const container = byId('pbp-imported'); container.replaceChildren();
    for (const entry of restored) { const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption'); draw(canvas, entry.document, false); caption.textContent = entry.label; figure.append(canvas, caption); container.append(figure); }
    byId('pbp-import-status').textContent = `已载入 ${restored.length} 个点与针组合，源重编译结果一致。艺术效果待统一评价。`; byId('pbp-import-status').dataset.status = 'passed'; byId('pbp-error').textContent = '';
  } catch (error) { byId('pbp-import-status').textContent = '载入失败'; byId('pbp-import-status').dataset.status = 'failed'; byId('pbp-error').textContent = error.message; }
}
for (const [suffix, key] of [['seed', 'seed'], ['layout', 'layout'], ['width', 'widthScale'], ['dryness', 'dryness'], ['time', 'time']]) {
  byId(`pbp-${suffix}`).value = pepperBrokenPineInputs[key];
}
byId('pbp-controls').addEventListener('submit', event => { event.preventDefault(); renderAll(); });
for (const id of ['pbp-layout', 'pbp-width', 'pbp-dryness']) byId(id).addEventListener('input', () => renderAll());
for (const id of ['pbp-time', 'pbp-overlay']) byId(id).addEventListener('input', () => renderAll(false));
byId('pbp-edit-x').addEventListener('input', renderEditor);
byId('pbp-edit-width').addEventListener('input', renderEditor);
byId('pbp-edit-rotation').addEventListener('input', renderEditor);
byId('pbp-edit-study').addEventListener('change', () => populateEditor());
byId('pbp-edit-id').addEventListener('change', resetEditor); byId('pbp-edit-reset').addEventListener('click', resetEditor);
byId('pbp-export-json').addEventListener('click', () => download(new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' }), 'json'));
byId('pbp-export-png').addEventListener('click', exportSheet); byId('pbp-load-text').addEventListener('click', () => loadJson(byId('pbp-json-input').value));
byId('pbp-import-json').addEventListener('change', async event => { try { const file = event.currentTarget.files[0]; if (!file) return; if (file.size > 32_000_000) throw new RangeError('JSON 超过 32 MB'); loadJson(await file.text()); } catch (error) { byId('pbp-error').textContent = error.message; } });
byId('pbp-check').addEventListener('click', async event => {
  const button = event.currentTarget, output = byId('pbp-verification'); button.disabled = true; output.dataset.status = 'running'; output.textContent = '正在检查三种结构…';
  try { await new Promise(resolve => requestAnimationFrame(resolve)); const result = await verifyPepperBrokenPineStudies({ seed: inputs.seed }); output.textContent = JSON.stringify(result, null, 2); output.dataset.status = result.passed ? 'passed' : 'failed'; }
  catch (error) { output.textContent = error.message; output.dataset.status = 'failed'; } finally { button.disabled = false; }
});
renderAll();
