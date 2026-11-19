import { remainingBatches, remainingStage, makeRemainingBatch, remainingRecord } from './remaining-review-data.mjs';
import { drawRemainingDocument, rebuildRemainingDocument, editRemainingDocument } from './remaining-document.mjs';
import { verifyRemainingBatch } from './remaining-verify.mjs';

const byId = id => document.getElementById(id);
const batchSelect = byId('remaining-batch'), layoutSelect = byId('remaining-layout');
let batch, layout, studies = [], samples = [], generation = 0, chosen = [0, 0];
for (const item of remainingBatches) batchSelect.add(new Option(`第${item.number}批 · ${item.title}`, String(item.number)));
function selectBatch() {
  batch = remainingBatches.find(item => item.number === Number(batchSelect.value));
  layoutSelect.replaceChildren(...batch.layouts.map(value => new Option(value, value)));
  layoutSelect.value = batch.layout; regenerate();
}
function regenerate() { layout = layoutSelect.value; studies = makeRemainingBatch(batch, layout); chosen = [0, 0]; paint(); }
function loadEditor(row, col) {
  chosen = [row, col]; const study = studies[row], variant = study.variants[col];
  byId('remaining-source').value = JSON.stringify(variant.document.recipe, null, 2);
  byId('remaining-selection').textContent = `${study.title} · ${variant.label}`;
}
async function paint() {
  const ticket = ++generation, status = byId('remaining-status');
  status.dataset.status = 'loading'; status.textContent = '绘制这一批…';
  byId('remaining-png').disabled = true; byId('remaining-json').disabled = true;
  try {
    const sections = [], nextSamples = [];
    for (const [row, study] of studies.entries()) {
      const section = document.createElement('section'), title = document.createElement('h2'), variable = document.createElement('p'), grid = document.createElement('div');
      title.textContent = study.title; variable.textContent = study.variable; grid.className = 'grid';
      for (const [col, variant] of study.variants.entries()) {
        await new Promise(resolve => requestAnimationFrame(resolve)); if (ticket !== generation) return;
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), detail = document.createElement('canvas'), caption = document.createElement('figcaption'), edit = document.createElement('button');
        canvas.setAttribute('aria-label', `${study.title} ${variant.label}`); canvas.dataset.study = study.id; canvas.dataset.variant = variant.id;
        drawRemainingDocument(canvas, variant.document);
        detail.width = 560; detail.height = 200; detail.className = 'detail';
        const context = detail.getContext('2d'), [x, y] = Array.isArray(study.detail) ? study.detail : [280, 130];
        context.fillStyle = '#f5f2e9'; context.fillRect(0, 0, 560, 200); context.fillStyle = '#65705e'; context.font = '13px Microsoft YaHei,sans-serif';
        context.fillText('原图局部 ×2', 16, 30); context.drawImage(canvas, x - 48, y - 48, 96, 96, 184, 4, 192, 192);
        caption.textContent = variant.label; edit.textContent = '编辑此源'; edit.type = 'button'; edit.setAttribute('aria-label', `编辑 ${study.id} ${variant.id}`);
        edit.addEventListener('click', () => { loadEditor(row, col); byId('remaining-editor').open = true; byId('remaining-editor').scrollIntoView({ block: 'start' }); });
        figure.append(canvas, detail, caption, edit); grid.append(figure); nextSamples.push({ canvas, detail });
      }
      const criteria = document.createElement('p'), limits = document.createElement('p'); criteria.className = 'criteria'; limits.className = 'limits';
      criteria.textContent = study.criteria; limits.textContent = study.limits;
      section.append(title, variable, grid, criteria, limits); sections.push(section);
    }
    if (ticket !== generation) return;
    samples = nextSamples; byId('remaining-studies').replaceChildren(...sections);
    byId('remaining-record').textContent = JSON.stringify(remainingRecord(batch, layout, studies)); loadEditor(...chosen);
    status.textContent = `第${batch.number}批 · ${batch.title} · ${layout} · 三项九格`; status.dataset.status = 'ready';
    byId('remaining-png').disabled = false; byId('remaining-json').disabled = false;
  } catch (error) { status.textContent = error.message; status.dataset.status = 'failed'; }
}
function applyDocument(document) {
  const [row, col] = chosen; const next = [...studies[row].variants]; next[col] = { ...next[col], document };
  studies = studies.map((study, index) => index === row ? { ...study, variants: next } : study);
  byId('remaining-edit-status').textContent = '已从编辑源重新生成，图片和源导出均包含此修改。'; paint();
}
byId('remaining-apply').addEventListener('click', () => {
  try { applyDocument(rebuildRemainingDocument(JSON.parse(byId('remaining-source').value))); }
  catch (error) { byId('remaining-edit-status').textContent = error.message; }
});
byId('remaining-local-edit').addEventListener('click', () => {
  try { applyDocument(editRemainingDocument(studies[chosen[0]].variants[chosen[1]].document).document); }
  catch (error) { byId('remaining-edit-status').textContent = error.message; }
});
function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `remaining-batch-${batch.number}-${layout}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId('remaining-json').addEventListener('click', () => download(new Blob([byId('remaining-record').textContent], { type: 'application/json' }), 'json'));
byId('remaining-png').addEventListener('click', () => {
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1840;
  const context = canvas.getContext('2d'); context.fillStyle = '#f5f2e9'; context.fillRect(0, 0, 1760, 1840);
  context.fillStyle = '#34442f'; context.font = '25px Microsoft YaHei,sans-serif'; context.fillText(`第${batch.number}批 · ${batch.title} · ${remainingStage.label}`, 24, 40);
  context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(`布局 ${layout} · 固定种子 · 原尺寸与两倍局部 · 资料范围见浏览页`, 24, 68);
  studies.forEach((study, row) => {
    const y = 110 + row * 570; context.font = '21px Microsoft YaHei,sans-serif'; context.fillText(study.title, 24, y);
    study.variants.forEach((variant, col) => {
      const x = 24 + col * 576, sample = samples[row * 3 + col];
      context.drawImage(sample.canvas, x, y + 20); context.drawImage(sample.detail, x, y + 288);
      context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(variant.label, x, y + 518, 552);
    });
  });
  canvas.toBlob(blob => { if (blob) download(blob, 'png'); canvas.width = 0; }, 'image/png');
});
async function checkBatches(batches) {
  const output = byId('remaining-checks'), buttons = [byId('remaining-check'), byId('remaining-check-current')];
  buttons.forEach(button => { button.disabled = true; }); output.dataset.status = 'running'; const results = [];
  for (const item of batches) {
    output.textContent = JSON.stringify({ completed: results.length, current: item.number, results });
    try { results.push({ batch: item.number, result: await verifyRemainingBatch(item) }); }
    catch (error) { results.push({ batch: item.number, result: { passed: false, error: error.message } }); }
  }
  const ok = results.every(item => item.result.passed); output.textContent = JSON.stringify({ passed: ok, completed: results.length, results });
  output.dataset.status = ok ? 'passed' : 'failed'; buttons.forEach(button => { button.disabled = false; });
}
byId('remaining-check').addEventListener('click', () => checkBatches(remainingBatches));
byId('remaining-check-current').addEventListener('click', () => checkBatches([batch]));
batchSelect.addEventListener('change', selectBatch); layoutSelect.addEventListener('change', regenerate);
const requested = Number(new URL(location.href).searchParams.get('batch'));
batchSelect.value = String(remainingBatches.some(item => item.number === requested) ? requested : 13); selectBatch();
