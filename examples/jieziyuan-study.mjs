import { drawRemainingDocument, rebuildRemainingDocument } from './remaining-document.mjs';
import { createJieziyuanStudies } from './jieziyuan-study-fixtures.mjs';

const columns = ['baseline', 'improved', 'transferBaseline', 'transfer'];
const labels = ['同题 · 均匀对照', '同题 · 图式转译', '换形 · 均匀对照', '换形 · 图式转译'];
const time = 8, cellSize = 1;
const records = [];
const status = document.querySelector('#status');
const editStatus = document.querySelector('#edit-status');
const select = document.querySelector('#case-select');
const editor = document.querySelector('#recipe-source');
const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));
const sourceOnly = documentData => ({ version: documentData.version, recipe: documentData.recipe });

function controlsDisabled(disabled) {
  document.querySelectorAll('button, select, textarea').forEach(element => { element.disabled = disabled; });
}
function fail(error, target = status) {
  target.textContent = error instanceof Error ? error.message : String(error);
  target.dataset.error = 'true';
}
function save(blob, name) {
  if (!blob) throw new Error('浏览器未能生成导出文件');
  const link = document.createElement('a'), url = URL.createObjectURL(blob);
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function paint(documentData, label, at = time) {
  if (documentData?.result?.width !== 360 || documentData?.result?.height !== 280) throw new RangeError('选读样片画幅需为 360×280');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', label);
  drawRemainingDocument(canvas, documentData, at);
  return canvas;
}
function selectedRecord() {
  const record = records[Number(select.value)];
  if (!record) throw new RangeError('请先选择已生成的样片');
  return record;
}
function showRecipe() {
  editor.value = JSON.stringify(selectedRecord().improved.recipe, null, 2);
  editStatus.textContent = ''; editStatus.dataset.error = 'false';
}
function evidenceList(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) throw new RangeError('每个选读样片都需要图版出处与定位');
  const list = document.createElement('ul'); list.className = 'evidence';
  for (const citation of evidence) {
    if (!citation.title || !citation.locator) throw new RangeError('图版出处需要标题与定位');
    const url = new URL(citation.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new RangeError('图版出处需为公开 HTTP 链接');
    const item = document.createElement('li'), link = document.createElement('a');
    link.textContent = citation.title; link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(link, document.createTextNode(' · ' + citation.locator)); list.append(item);
  }
  return list;
}
function compactLine(context, text, maxWidth) {
  let line = String(text);
  while (line.length && context.measureText(line).width > maxWidth) line = line.slice(0, -1);
  return line === text ? line : line + '…';
}
function sheet() {
  const output = document.createElement('canvas'); output.width = 1488; output.height = 86 + records.length * 360;
  const context = output.getContext('2d');
  context.fillStyle = '#f5f2e9'; context.fillRect(0, 0, output.width, output.height);
  context.fillStyle = '#30382e'; context.font = '21px sans-serif'; context.fillText('芥子园画谱 · 本轮选读与结构转译', 16, 28);
  context.font = '13px sans-serif'; context.fillText('三个局部的原创程序研究 · 固定编辑源与种子 · Canvas 2D · 尚待艺术评价', 16, 49);
  labels.forEach((label, index) => context.fillText(label, 12 + index * 370, 72));
  records.forEach((record, index) => {
    const y = 86 + index * 360;
    context.font = '17px sans-serif'; context.fillText(record.title, 12, y + 23);
    record.canvases.forEach((canvas, column) => context.drawImage(canvas, 12 + column * 370, y + 32));
    const citation = record.evidence[0];
    context.font = '12px sans-serif';
    context.fillText(compactLine(context, '选读定位：' + citation.title + ' · ' + citation.locator, 1450), 12, y + 334);
  });
  return output;
}
async function initialize() {
  document.body.dataset.status = 'loading'; controlsDisabled(true);
  const studies = createJieziyuanStudies();
  if (!Array.isArray(studies) || studies.length !== 3) throw new RangeError('本轮需提供三项选读对照');
  const ids = new Set();
  for (const [index, study] of studies.entries()) {
    if (!study.id || ids.has(study.id)) throw new RangeError('选读样片 ID 需唯一'); ids.add(study.id);
    status.textContent = `正在绘制第 ${index + 1} / ${studies.length} 项…`;
    const record = { ...study, initial: study.improved, canvases: [] };
    const section = document.createElement('section'); section.className = 'study';
    const heading = document.createElement('h2'); heading.textContent = study.title;
    const pair = document.createElement('div'); pair.className = 'pair';
    section.append(heading, pair); document.querySelector('#gallery').append(section);
    for (const [column, key] of columns.entries()) {
      const canvas = paint(record[key], study.title + ' · ' + labels[column]); record.canvases.push(canvas);
      const figure = document.createElement('figure'), caption = document.createElement('figcaption'); caption.textContent = labels[column];
      figure.append(canvas, caption); pair.append(figure); await yieldFrame();
    }
    const note = document.createElement('p'); note.className = 'note'; note.textContent = study.observation;
    const limits = document.createElement('p'); limits.className = 'limits'; limits.textContent = study.limits;
    section.append(note, limits, evidenceList(study.evidence));
    records.push(record);
    const option = document.createElement('option'); option.value = String(index); option.textContent = study.title; select.append(option);
    await yieldFrame();
  }
  showRecipe(); controlsDisabled(false); document.body.dataset.status = 'ready';
  status.textContent = '3 项选读 · 12 个同题与换形画面'; status.dataset.error = 'false';
}
function replaceImproved(record, documentData) {
  const canvas = paint(documentData, record.title + ' · ' + labels[1]);
  record.canvases[1].replaceWith(canvas); record.canvases[1] = canvas; record.improved = documentData;
}
select.addEventListener('change', () => { try { showRecipe(); } catch (error) { fail(error, editStatus); } });
document.querySelector('#save-png').addEventListener('click', () => {
  try { sheet().toBlob(blob => { try { save(blob, 'jieziyuan-selected-studies.png'); } catch (error) { fail(error); } }); }
  catch (error) { fail(error); }
});
document.querySelector('#save-source').addEventListener('click', () => {
  try {
    const sources = records.map(({ canvases, initial, ...record }) => {
      const saved = { ...record }; for (const key of columns) saved[key] = sourceOnly(record[key]); return saved;
    });
    save(new Blob([JSON.stringify({ version: 1, study: 'jieziyuan-selected-studies-v1',
      scope: '本轮三个局部的选读、原创程序转译及换形；未声称通读全书',
      render: { backend: 'Canvas 2D', time, cellSize, paperTexture: 0 }, cases: sources }, null, 2)],
    { type: 'application/json' }), 'jieziyuan-selected-studies.json');
  } catch (error) { fail(error); }
});
document.querySelector('#apply-source').addEventListener('click', () => {
  try {
    const record = selectedRecord(), recipe = JSON.parse(editor.value);
    if (recipe.options?.width !== 360 || recipe.options?.height !== 280) throw new RangeError('编辑源画幅需保持 360×280');
    replaceImproved(record, rebuildRemainingDocument(recipe)); record.manualEdit = true;
    editStatus.textContent = '已重绘这一列；其余画面与出处保持'; editStatus.dataset.error = 'false';
  } catch (error) { fail(error, editStatus); }
});
document.querySelector('#restore-source').addEventListener('click', () => {
  try {
    const record = selectedRecord(); replaceImproved(record, record.initial); delete record.manualEdit; showRecipe();
    editStatus.textContent = '已还原';
  } catch (error) { fail(error, editStatus); }
});
document.querySelector('#check-replay').addEventListener('click', () => {
  controlsDisabled(true); status.textContent = '正在核对编辑源与绝对时间…'; status.dataset.error = 'false';
  setTimeout(async () => {
    let checked = 0;
    try {
      for (const record of records) for (const [column, key] of columns.entries()) {
        const rebuilt = rebuildRemainingDocument(JSON.parse(JSON.stringify(record[key].recipe)));
        const canvas = paint(rebuilt, '临时重建核验');
        const expected = record.canvases[column].toDataURL();
        if (canvas.toDataURL() !== expected) throw new Error(record.title + ' · ' + labels[column] + ' JSON 重建差异');
        drawRemainingDocument(canvas, rebuilt, -1); await yieldFrame();
        drawRemainingDocument(canvas, rebuilt, time);
        if (canvas.toDataURL() !== expected) throw new Error(record.title + ' · ' + labels[column] + ' 乱序定位差异');
        checked++; await yieldFrame();
      }
      status.textContent = `${checked} 个画面重建与 8→-1→8 定位一致`;
    } catch (error) { fail(error); }
    finally { controlsDisabled(false); }
  }, 0);
});
setTimeout(() => initialize().catch(error => { document.body.dataset.status = 'failed'; fail(error); }), 0);
