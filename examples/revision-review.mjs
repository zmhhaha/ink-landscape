import { revisionBatches, revisionStage, makeRevisionBatch, drawRevisionVariant, revisionDetail, revisionRecord } from './revision-review-data.mjs';

const byId = id => document.getElementById(id);
let selected = 0, studies = [], samples = [], layout, renderVersion = 0;
const batchSelect = byId('revision-batch'), layoutSelect = byId('revision-layout');
for (const batch of revisionBatches) batchSelect.add(new Option(`第${batch.number}批 · ${batch.title}`, String(batch.number)));
function selectBatch() {
  selected = Number(batchSelect.value) - 1;
  const batch = revisionBatches[selected];
  layoutSelect.replaceChildren(...batch.layouts.map(value => new Option(value, value)));
  layoutSelect.value = batch.layout; render();
}
async function render() {
  const version = ++renderVersion;
  byId('revision-status').dataset.status = 'loading'; byId('revision-status').textContent = '绘制这一批…';
  byId('revision-png').disabled = true; byId('revision-json').disabled = true;
  try {
    const batch = revisionBatches[selected], nextLayout = layoutSelect.value;
    const nextStudies = makeRevisionBatch(batch, nextLayout), nextSamples = [], sections = [];
    byId('revision-edit').href = `/examples/${batch.id}-study.html`;
    for (const study of nextStudies) {
      const section = document.createElement('section'), title = document.createElement('h2'), note = document.createElement('p'), grid = document.createElement('div');
      title.textContent = study.title; note.textContent = study.variable ?? study.criteria ?? ''; grid.className = 'grid';
      for (const variant of study.variants) {
        // Yield between canvases so a detailed wet-contact render does not
        // block controls. Obsolete selections never replace the latest batch.
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (version !== renderVersion) return;
        const figure = document.createElement('figure'), canvas = document.createElement('canvas'), detail = document.createElement('canvas'), caption = document.createElement('figcaption');
        canvas.dataset.study = study.id; canvas.dataset.variant = variant.id;
        canvas.setAttribute('aria-label', `${study.title} ${variant.label}`); drawRevisionVariant(canvas, batch, variant);
        detail.width = 560; detail.height = 200; detail.className = 'detail'; detail.setAttribute('aria-label', '笔迹原图两倍局部');
        const context = detail.getContext('2d'), [x, y] = revisionDetail(batch, study, variant);
        context.fillStyle = '#f5f2e9'; context.fillRect(0, 0, 560, 200); context.fillStyle = '#65705e';
        context.font = '13px Microsoft YaHei,sans-serif'; context.fillText('原图局部 ×2', 16, 30);
        context.drawImage(canvas, x - 48, y - 48, 96, 96, 184, 4, 192, 192);
        caption.textContent = variant.label; figure.append(canvas, detail, caption); grid.append(figure); nextSamples.push({ canvas, detail });
      }
      section.append(title, note, grid); sections.push(section);
    }
    studies = nextStudies; samples = nextSamples; layout = nextLayout;
    byId('revision-studies').replaceChildren(...sections);
    byId('revision-record').textContent = JSON.stringify(revisionRecord(batch, layout, studies));
    byId('revision-status').textContent = `第${batch.number}批 · ${batch.title} · ${layout} · 三项九格`;
    byId('revision-status').dataset.status = 'ready';
    byId('revision-png').disabled = false; byId('revision-json').disabled = false;
  } catch (error) {
    if (version === renderVersion) { byId('revision-status').textContent = error.message; byId('revision-status').dataset.status = 'failed'; }
  }
}
function download(blob, extension, identity = { number: selected + 1, layout }) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = `revision-batch-${String(identity.number).padStart(2, '0')}-${identity.layout}.${extension}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId('revision-png').addEventListener('click', () => {
  const identity = { number: selected + 1, layout };
  const canvas = document.createElement('canvas'); canvas.width = 1760; canvas.height = 1840;
  const context = canvas.getContext('2d'); context.fillStyle = '#f5f2e9'; context.fillRect(0, 0, 1760, 1840);
  context.fillStyle = '#34442f'; context.font = '25px Microsoft YaHei,sans-serif';
  context.fillText(`第${selected + 1}批 · ${revisionBatches[selected].title} · ${revisionStage.label}`, 24, 40);
  context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(`布局 ${layout} · 固定种子 · 原尺寸与两倍局部`, 24, 68);
  studies.forEach((study, row) => {
    const y = 110 + row * 570; context.fillStyle = '#34442f'; context.font = '21px Microsoft YaHei,sans-serif'; context.fillText(study.title, 24, y);
    study.variants.forEach((variant, col) => {
      const x = 24 + col * 576, sample = samples[row * 3 + col];
      context.drawImage(sample.canvas, x, y + 20); context.drawImage(sample.detail, x, y + 288);
      context.font = '15px Microsoft YaHei,sans-serif'; context.fillText(variant.label, x, y + 518, 552);
    });
  });
  canvas.toBlob(blob => { if (blob) download(blob, 'png', identity); canvas.width = 0; }, 'image/png');
});
byId('revision-json').addEventListener('click', () => download(new Blob([byId('revision-record').textContent], { type: 'application/json' }), 'json'));
async function checkBatches(batches) {
  const output = byId('revision-checks'), buttons = [byId('revision-check'), byId('revision-check-current')];
  buttons.forEach(button => { button.disabled = true; }); output.dataset.status = 'running';
  const results = [];
  for (const batch of batches) {
    output.textContent = JSON.stringify({ completed: results.length, current: batch.number, results });
    try {
      const module = await import(`./${batch.id}-verify.mjs`);
      results.push({ batch: batch.number, result: await module[`verify${batch.verifyName}Studies`]() });
    } catch (error) { results.push({ batch: batch.number, result: { passed: false, error: error.message } }); }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  output.textContent = JSON.stringify({ passed: results.every(item => item.result.passed), completed: results.length, results });
  output.dataset.status = results.every(item => item.result.passed) ? 'passed' : 'failed';
  buttons.forEach(button => { button.disabled = false; });
}
byId('revision-check').addEventListener('click', () => checkBatches(revisionBatches));
byId('revision-check-current').addEventListener('click', () => checkBatches([revisionBatches[selected]]));
batchSelect.addEventListener('change', selectBatch); layoutSelect.addEventListener('change', render);
const requested = Number(new URL(location.href).searchParams.get('batch'));
batchSelect.value = String(Number.isInteger(requested) && requested >= 1 && requested <= 12 ? requested : 1);
selectBatch();
