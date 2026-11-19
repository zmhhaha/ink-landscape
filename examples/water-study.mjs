import { renderInkProcess, compileWaterProcessRecipe, createWaterProcessDocument, TECHNIQUE_SOURCES, getTechnique } from '../dist/index.js';
import { makeWaterStudies, editWaterEvent, editWaterDroplet, waterInputs, waterSize } from './water-fixtures.mjs';
import { verifyWaterStudies } from './water-verify.mjs';

const byId = id => document.getElementById(id);
// JSON object key order is formatting; array order still defines event order.
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};
const sources = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
let inputs = { ...waterInputs }, studies = [], edited, inputKey, editMemo;
const readInputs = () => ({ seed: Number(byId('water-seed').value), layout: byId('water-layout').value,
  water: Number(byId('water-water').value), interval: Number(byId('water-interval').value), time: Number(byId('water-time').value) });

function overlay(context, document) {
  context.save(); context.strokeStyle = '#427f98'; context.lineWidth = 1.1; context.setLineDash([4, 3]);
  for (const event of document.recipe.events) {
    if (event.kind !== 'water' || (event.at ?? 0) > inputs.time) continue;
    for (const drop of event.droplets ?? []) {
      context.beginPath(); context.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2); context.stroke();
    }
    for (const stroke of event.strokes ?? []) {
      context.beginPath(); stroke.points.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
      for (const point of stroke.points) { context.beginPath(); context.arc(point.x, point.y, 2, 0, Math.PI * 2); context.stroke(); }
    }
  }
  context.restore();
}
function draw(canvas, document, withOverlay = byId('water-overlay').checked) {
  canvas.width = document.result.width; canvas.height = document.result.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  renderInkProcess(context, document.result, { time: inputs.time, cellSize: 1 });
  if (withOverlay) overlay(context, document);
}
function detailView(sourceCanvas, study) {
  const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 200; canvas.className = 'ink-detail';
  canvas.setAttribute('aria-label', '水墨作用区原图局部放大两倍');
  const context = canvas.getContext('2d'); context.fillStyle = waterSize.background; context.fillRect(0, 0, 560, 200);
  context.fillStyle = '#65705e'; context.font = '13px Microsoft YaHei,sans-serif'; context.fillText('作用局部 ×2', 16, 30);
  const [x, y] = study.detail; context.drawImage(sourceCanvas, x - 48, y - 48, 96, 96, 184, 4, 192, 192);
  return canvas;
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
  return { kind: 'water-process-study', version: 1, inputs,
    studies: studies.map(study => ({ id: study.id, variants: study.variants.map(variant => ({ id: variant.id, label: variant.label, document: variant.document })) })),
    edit: { selectedId: byId('water-edit-id').value, dx: Number(byId('water-edit-x').value), amount: Number(byId('water-edit-amount').value), document: edited },
    artisticValidation: 'unreviewed' };
}
function renderEditor() {
  const original = studies[2].variants[1].document, selected = byId('water-edit-id').value;
  const dx = Number(byId('water-edit-x').value), amount = Number(byId('water-edit-amount').value);
  if (!editMemo || editMemo.original !== original || editMemo.selected !== selected || editMemo.dx !== dx || editMemo.amount !== amount) {
    edited = selected.startsWith('drop:') ? editWaterDroplet(original, 'clear-water', selected.slice(5), { dx, radius: amount })
      : editWaterEvent(original, selected.slice(6), { dx, water: amount });
    editMemo = { original, selected, dx, amount, document: edited };
  } else edited = editMemo.document;
  draw(byId('water-editor-canvas'), edited);
  byId('water-edit-x-value').textContent = dx;
  byId('water-edit-amount-value').textContent = selected.startsWith('drop:') ? amount.toFixed(0) : amount.toFixed(2);
  const eventId = selected.startsWith('drop:') ? 'clear-water' : selected.slice(6);
  const otherEvents = original.recipe.events.every((event, i) => event.id === eventId || same(event, edited.recipe.events[i]));
  const eventIndex = original.recipe.events.findIndex(event => event.id === eventId);
  const seeds = original.result.layers[eventIndex].marks.every((mark, i) => mark.seed === edited.result.layers[eventIndex].marks[i].seed);
  let otherDrops = true;
  if (selected.startsWith('drop:')) otherDrops = original.recipe.events[eventIndex].droplets.every((drop, i) => drop.id === selected.slice(5)
    || same(drop, edited.recipe.events[eventIndex].droplets[i]));
  byId('water-editor-status').textContent = `当前修改 ${selected} · 其余事件${otherEvents ? '源数据保持' : '出现变化'}${selected.startsWith('drop:') ? ` · 其余水滴${otherDrops ? '保持' : '出现变化'}` : ''} · 材质种子${seeds ? '保持' : '出现变化'}`;
  byId('water-editor-status').dataset.status = otherEvents && otherDrops && seeds ? 'passed' : 'failed';
  byId('water-record').textContent = JSON.stringify(record());
}
function resetEditor() {
  const original = studies[2].variants[1].document, selected = byId('water-edit-id').value, control = byId('water-edit-amount');
  byId('water-edit-x').value = 0;
  if (selected.startsWith('drop:')) {
    const drop = original.recipe.events.find(event => event.id === 'clear-water').droplets.find(drop => drop.id === selected.slice(5));
    byId('water-edit-amount-label').textContent = '水滴半径'; control.min = 2; control.max = 32; control.step = 1; control.value = drop.radius;
  } else {
    const event = original.recipe.events.find(event => event.id === selected.slice(6));
    byId('water-edit-amount-label').textContent = '所选事件水量'; control.min = 0; control.max = 1; control.step = .01; control.value = event.water;
  }
  renderEditor();
}
function renderAll(resetEdit = true) {
  if (!byId('water-seed').checkValidity()) { byId('water-seed').reportValidity(); return; }
  try {
    const next = readInputs(), key = JSON.stringify([next.seed, next.layout, next.water, next.interval]);
    if (!studies.length || inputKey !== key) { studies = makeWaterStudies(next); inputKey = key; }
    inputs = next; byId('water-error').textContent = '';
    byId('water-water-value').textContent = inputs.water.toFixed(2);
    for (const key of ['interval', 'time']) byId(`water-${key}-value`).textContent = `${inputs[key].toFixed(1)} 秒`;
    byId('water-conditions').textContent = `种子 ${inputs.seed} · 每格 560 × 260 · 栅格步长 2 · 局部 ×2 · Canvas 2D · 当前 ${inputs.time.toFixed(1)} 秒${byId('water-overlay').checked ? ' · 蓝色虚线仅为清水源笔路与水滴接触辅助线，不是可见水痕。' : ''}`;
    const container = byId('water-studies'); container.replaceChildren();
    for (const study of studies) {
      const section = document.createElement('section'), heading = document.createElement('div'), title = document.createElement('h2'), variable = document.createElement('p'), grid = document.createElement('div');
      section.className = 'ink-group'; section.dataset.study = study.id; section.id = `water-study-${study.id}`;
      heading.className = 'ink-heading'; title.textContent = study.title; variable.textContent = study.variable; heading.append(title, variable); grid.className = 'ink-grid';
      for (const variant of study.variants) {
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption'), meta = document.createElement('p');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id; canvas.setAttribute('aria-label', `${study.title} ${variant.label}`);
        draw(canvas, variant.document); caption.textContent = variant.label; meta.className = 'water-meta';
        meta.textContent = variant.document.recipe.events.map(event => `${event.kind === 'water' ? '清水' : '墨'}：${(event.at ?? 0).toFixed(1)}s / 水${(event.water ?? .5).toFixed(2)}`).join(' → ');
        figure.append(canvas, detailView(canvas, study), caption, meta); grid.append(figure);
      }
      const notes = document.createElement('div'); notes.className = 'ink-notes';
      for (const [label, text] of [['观察记录', study.criteria], ['当前范围', study.limits]]) {
        const paragraph = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = `${label}：`; paragraph.append(strong, document.createTextNode(text)); notes.append(paragraph);
      }
      section.append(heading, grid, notes, referenceList(study.techniqueIds)); container.append(section);
    }
    const select = byId('water-edit-id'), selected = select.value; select.replaceChildren();
    for (const event of studies[2].variants[1].document.recipe.events) {
      const option = document.createElement('option'); option.value = `event:${event.id}`; option.textContent = `事件 · ${event.kind === 'water' ? '清水' : '墨'}`; select.append(option);
      for (const drop of event.droplets ?? []) { const option = document.createElement('option'); option.value = `drop:${drop.id}`; option.textContent = `水滴 · ${drop.id}`; select.append(option); }
    }
    select.value = selected || 'drop:d3'; if (resetEdit) resetEditor(); else renderEditor();
    byId('water-verification').dataset.status = 'idle'; byId('water-verification').textContent = '尚未运行'; document.querySelector('main').dataset.status = 'ready';
  } catch (error) { byId('water-error').textContent = error.message; document.querySelector('main').dataset.status = 'failed'; }
}
function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `water-methods-batch05-${inputs.seed}-${inputs.layout}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1840;
  const context = canvas.getContext('2d'); context.fillStyle = waterSize.background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304734'; context.font = '28px Microsoft YaHei,sans-serif'; context.fillText('水法第五批 · 水破墨 / 墨破水 / 分散加水', 26, 44);
  context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.layout} · ${inputs.time.toFixed(1)} 秒 · 原创程序样片 · 待统一评价`, 26, 76);
  const sample = document.createElement('canvas');
  for (const [row, study] of studies.entries()) {
    const y = 118 + row * 560; context.font = '22px Microsoft YaHei,sans-serif'; context.fillText(study.title, 26, y);
    for (const [column, variant] of study.variants.entries()) {
      draw(sample, variant.document, false); context.drawImage(sample, 26 + column * 574, y + 18);
      const detail = detailView(sample, study); context.drawImage(detail, 26 + column * 574, y + 280); detail.width = 0;
      context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(variant.label, 26 + column * 574, y + 510);
    }
  }
  sample.width = 0; canvas.toBlob(blob => { if (blob) download(blob, 'png'); canvas.width = 0; }, 'image/png');
}
function loadJson(text) {
  try {
    if (text.length > 8_000_000) throw new RangeError('JSON 超过 8 MB');
    const parsed = JSON.parse(text); let entries;
    if (parsed.kind === 'water-process-study') {
      if (parsed.version !== 1 || !Array.isArray(parsed.studies)) throw new RangeError('不支持的水法记录版本');
      entries = parsed.studies.flatMap(study => study.variants.map(variant => ({ label: String(variant.label), document: variant.document })));
      if (parsed.edit?.document) entries.push({ label: '已保存的接触修改', document: parsed.edit.document });
    } else entries = [{ label: '载入的水墨组合', document: parsed }];
    if (!entries.length || entries.length > 16) throw new RangeError('每次载入 1–16 个水墨组合');
    const restored = entries.map(entry => {
      if (entry.document.version !== 1) throw new RangeError('不支持的水法文档版本');
      const result = compileWaterProcessRecipe(entry.document.recipe);
      if (!same(result, entry.document.result)) throw new RangeError('保存结果与重新生成的水墨事件不一致');
      return { label: entry.label, document: createWaterProcessDocument(entry.document.recipe.events, entry.document.recipe.options) };
    });
    const container = byId('water-imported'); container.replaceChildren();
    for (const entry of restored) { const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption'); draw(canvas, entry.document, false); caption.textContent = entry.label; figure.append(canvas, caption); container.append(figure); }
    byId('water-import-status').textContent = `已载入 ${restored.length} 个水墨组合，源重编译结果一致。艺术效果待统一评价。`; byId('water-import-status').dataset.status = 'passed'; byId('water-error').textContent = '';
  } catch (error) { byId('water-import-status').textContent = '载入失败'; byId('water-import-status').dataset.status = 'failed'; byId('water-error').textContent = error.message; }
}
byId('water-controls').addEventListener('submit', event => { event.preventDefault(); renderAll(); });
for (const id of ['water-layout', 'water-water', 'water-interval']) byId(id).addEventListener('input', () => renderAll());
for (const id of ['water-time', 'water-overlay']) byId(id).addEventListener('input', () => renderAll(false));
for (const id of ['water-edit-x', 'water-edit-amount']) byId(id).addEventListener('input', renderEditor);
byId('water-edit-id').addEventListener('change', resetEditor); byId('water-edit-reset').addEventListener('click', resetEditor);
byId('water-export-json').addEventListener('click', () => download(new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' }), 'json'));
byId('water-export-png').addEventListener('click', exportSheet); byId('water-load-text').addEventListener('click', () => loadJson(byId('water-json-input').value));
byId('water-import-json').addEventListener('change', async event => { try { const file = event.currentTarget.files[0]; if (!file) return; if (file.size > 8_000_000) throw new RangeError('JSON 超过 8 MB'); loadJson(await file.text()); } catch (error) { byId('water-error').textContent = error.message; } });
byId('water-check').addEventListener('click', async event => {
  const button = event.currentTarget, output = byId('water-verification'); button.disabled = true; output.dataset.status = 'running'; output.textContent = '正在检查三种笔组…';
  try { await new Promise(resolve => requestAnimationFrame(resolve)); const result = await verifyWaterStudies({ seed: inputs.seed }); output.textContent = JSON.stringify(result, null, 2); output.dataset.status = result.passed ? 'passed' : 'failed'; }
  catch (error) { output.textContent = error.message; output.dataset.status = 'failed'; } finally { button.disabled = false; }
});
renderAll();
