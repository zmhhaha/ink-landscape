import { drawRemainingDocument, rebuildRemainingDocument } from './remaining-document.mjs';
import { createStructuredRockStudies, createRockTransferStudies } from './structured-rock-fixtures.mjs';

const columns = ['baseline', 'axe', 'jiesuo', 'structure'];
const labels = ['旧宏 · 同骨架', '新法 · 大斧劈', '新法 · 解索', '结构示意'];
const techniqueLabels = { axe: '大斧劈', jiesuo: '解索' };
const width = 420, height = 360, time = 8, cellSize = 1;
const records = [];
const status = document.querySelector('#status');
const editStatus = document.querySelector('#edit-status');
const caseSelect = document.querySelector('#case-select');
const techniqueSelect = document.querySelector('#technique-select');
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
  if (documentData?.recipe?.generator !== 'ink-stroke-groups-v1') throw new RangeError('本轮样片需提供普通笔组配方');
  if (documentData.result?.width !== width || documentData.result?.height !== height) throw new RangeError('山石样片画幅需为 420×360');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', label);
  drawRemainingDocument(canvas, documentData, at);
  return canvas;
}
function selected() {
  const record = records[Number(caseSelect.value)], technique = techniqueSelect.value;
  if (!record || !Object.hasOwn(techniqueLabels, technique)) throw new RangeError('请选择已生成的山石样片与新法');
  return { record, technique };
}
function showRecipe() {
  const { record, technique } = selected();
  editor.value = JSON.stringify(record[technique].recipe, null, 2);
  editStatus.textContent = ''; editStatus.dataset.error = 'false';
}
function evidenceList(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) throw new RangeError('山石样片需要图版出处与定位');
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
  const value = String(text); let line = value;
  while (line.length && context.measureText(line + (line === value ? '' : '…')).width > maxWidth) line = line.slice(0, -1);
  return line === value ? line : line + '…';
}
function sheet(suite) {
  const selectedRecords = records.filter(record => record.suite === suite);
  if (!selectedRecords.length) throw new RangeError('没有可导出的样片');
  const margin = 16, gap = 12, step = width + gap, header = 112, rowHeight = 448;
  const output = document.createElement('canvas');
  output.width = margin * 2 + width * columns.length + gap * (columns.length - 1);
  output.height = header + selectedRecords.length * rowHeight + 20;
  const context = output.getContext('2d');
  context.fillStyle = '#f5f2e9'; context.fillRect(0, 0, output.width, output.height);
  context.fillStyle = '#30382e'; context.font = '23px sans-serif';
  context.fillText(suite === 'main' ? '芥子园山石 · 三种石势与两种皴法' : '芥子园山石 · 换形与预登记种子', margin, 31);
  context.font = '13px sans-serif';
  context.fillText('同一旧宏分别与新大斧劈、新解索比较 · 同时改变用笔和组织 · Canvas 2D · 尚待艺术评价', margin, 55);
  context.fillText('结构列为代码示意；参考原页未进入渲染。编辑源与出处可单独保存。', margin, 76);
  labels.forEach((label, column) => context.fillText(label, margin + column * step, 101));
  selectedRecords.forEach((record, index) => {
    const y = header + index * rowHeight;
    context.font = '17px sans-serif'; context.fillText(record.title, margin, y + 23);
    record.canvases.forEach((canvas, column) => context.drawImage(canvas, margin + column * step, y + 32));
    const citation = record.evidence[0], seed = record.axe.recipe.options.seed;
    context.font = '12px sans-serif';
    context.fillText(compactLine(context, '种子：' + seed + ' · 出处：' + citation.title + ' · ' + citation.locator, output.width - margin * 2), margin, y + 415);
  });
  return output;
}
async function initialize() {
  document.body.dataset.status = 'loading'; controlsDisabled(true);
  const primary = createStructuredRockStudies(), transfer = createRockTransferStudies();
  if (!Array.isArray(primary) || primary.length !== 3 || !Array.isArray(transfer) || transfer.length !== 2) throw new RangeError('本轮需有三种石势及两项换形研究');
  const studies = [...primary.map(study => ({ ...study, suite: 'main' })), ...transfer.map(study => ({ ...study, suite: 'transfer' }))];
  const ids = new Set();
  for (const [index, study] of studies.entries()) {
    if (!study.id || ids.has(study.id)) throw new RangeError('山石样片 ID 需唯一'); ids.add(study.id);
    status.textContent = `正在绘制第 ${index + 1} / ${studies.length} 项…`;
    const record = { ...study, initial: { axe: study.axe, jiesuo: study.jiesuo }, canvases: [] };
    const section = document.createElement('section'); section.className = 'study'; section.dataset.caseId = study.id;
    const heading = document.createElement('h2'); heading.textContent = study.title;
    const comparison = document.createElement('div'); comparison.className = 'comparison';
    section.append(heading, comparison);
    document.querySelector(study.suite === 'main' ? '#gallery' : '#transfer-gallery').append(section);
    for (const [column, key] of columns.entries()) {
      const canvas = paint(record[key], study.title + ' · ' + labels[column]); record.canvases.push(canvas);
      const figure = document.createElement('figure'), caption = document.createElement('figcaption');
      caption.textContent = labels[column]; figure.append(canvas, caption); comparison.append(figure); await yieldFrame();
    }
    const note = document.createElement('p'); note.className = 'note'; note.textContent = study.observation;
    const limits = document.createElement('p'); limits.className = 'limits'; limits.textContent = study.limits;
    section.append(note, limits, evidenceList(study.evidence));
    records.push(record);
    const option = document.createElement('option'); option.value = String(index);
    option.textContent = (study.suite === 'transfer' ? '换形 · ' : '') + study.title; caseSelect.append(option);
    await yieldFrame();
  }
  showRecipe(); controlsDisabled(false); document.body.dataset.status = 'ready';
  status.textContent = '3 种石势＋2 项换形 · 共 20 个画面'; status.dataset.error = 'false';
}
function replaceDocument(record, technique, documentData) {
  const column = columns.indexOf(technique);
  const canvas = paint(documentData, record.title + ' · ' + labels[column]);
  record.canvases[column].replaceWith(canvas); record.canvases[column] = canvas; record[technique] = documentData;
}
for (const select of [caseSelect, techniqueSelect]) select.addEventListener('change', () => {
  try { showRecipe(); } catch (error) { fail(error, editStatus); }
});
for (const [id, suite, name] of [['#save-png', 'main', 'structured-rock-main.png'], ['#save-transfer', 'transfer', 'structured-rock-transfer.png']]) {
  document.querySelector(id).addEventListener('click', () => {
    try { sheet(suite).toBlob(blob => { try { save(blob, name); } catch (error) { fail(error); } }); }
    catch (error) { fail(error); }
  });
}
document.querySelector('#save-source').addEventListener('click', () => {
  try {
    const cases = records.map(({ canvases, initial, ...record }) => {
      const saved = { ...record }; for (const key of columns) saved[key] = sourceOnly(record[key]); return saved;
    });
    save(new Blob([JSON.stringify({ version: 1, study: 'jieziyuan-structured-rock-v1',
      scope: '独立块石、大斧劈与解索的程序研究；不是全书通读或艺术通过',
      comparison: '同一旧宏与两种新法比较，同时改变接触及组织；结构列为代码示意',
      render: { backend: 'Canvas 2D', width, height, time, cellSize, paperTexture: 0 }, cases,
    }, null, 2)], { type: 'application/json' }), 'structured-rock-sources.json');
  } catch (error) { fail(error); }
});
document.querySelector('#apply-source').addEventListener('click', () => {
  try {
    const { record, technique } = selected(), recipe = JSON.parse(editor.value);
    if (recipe.generator !== 'ink-stroke-groups-v1' || recipe.options?.width !== width || recipe.options?.height !== height) throw new RangeError('编辑源需为 420×360 的普通笔组配方');
    replaceDocument(record, technique, rebuildRemainingDocument(recipe));
    record.manualEdits = { ...record.manualEdits, [technique]: true };
    editStatus.textContent = '已重绘所选' + techniqueLabels[technique] + '画面'; editStatus.dataset.error = 'false';
  } catch (error) { fail(error, editStatus); }
});
document.querySelector('#restore-source').addEventListener('click', () => {
  try {
    const { record, technique } = selected(); replaceDocument(record, technique, record.initial[technique]);
    if (record.manualEdits) { delete record.manualEdits[technique]; if (!Object.keys(record.manualEdits).length) delete record.manualEdits; }
    showRecipe(); editStatus.textContent = '已还原所选' + techniqueLabels[technique] + '画面';
  } catch (error) { fail(error, editStatus); }
});
document.querySelector('#check-replay').addEventListener('click', () => {
  controlsDisabled(true); status.textContent = '正在核对全部编辑源与绝对时间…'; status.dataset.error = 'false'; document.body.dataset.status = 'checking';
  setTimeout(async () => {
    let checked = 0;
    try {
      for (const record of records) for (const [column, key] of columns.entries()) {
        const rebuilt = rebuildRemainingDocument(JSON.parse(JSON.stringify(record[key].recipe)));
        const canvas = paint(rebuilt, '临时重建核验');
        const expected = record.canvases[column].toDataURL();
        if (canvas.toDataURL() !== expected) throw new Error(record.title + ' · ' + labels[column] + ' JSON 重建差异');
        drawRemainingDocument(canvas, rebuilt, -1); await yieldFrame(); drawRemainingDocument(canvas, rebuilt, time);
        if (canvas.toDataURL() !== expected) throw new Error(record.title + ' · ' + labels[column] + ' 乱序定位差异');
        checked++; await yieldFrame();
      }
      status.textContent = `${checked} 个画面重建与 8→-1→8 定位一致`;
    } catch (error) { fail(error); }
    finally { controlsDisabled(false); document.body.dataset.status = 'ready'; }
  }, 0);
});
setTimeout(() => initialize().catch(error => { document.body.dataset.status = 'failed'; fail(error); }), 0);
