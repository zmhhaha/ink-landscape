import { createBarkDocument, compileBarkRecipe } from '../dist/bark-document.js';
import { renderCanvas } from '../dist/canvas.js';
import { createBarkStudyCases, BARK_STUDY_OPTIONS } from './bark-study-fixtures.mjs';

const { width, height, background } = BARK_STUDY_OPTIONS;
const settings = { time: 1, paperTexture: .02 };
const status = document.querySelector('#status');
const editorStatus = document.querySelector('#edit-status');
const select = document.querySelector('#case-select');
const sourceEditor = document.querySelector('#recipe-source');
const records = [];
const baselineCaption = record => record.baselineSelection ? '原笔组' : '手工笔组';

function paint(canvas, scene) {
  renderCanvas(canvas.getContext('2d', { willReadFrequently: true }), scene, settings);
}

function save(blob, name) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showRecipe() {
  sourceEditor.value = JSON.stringify(records[Number(select.value)].source.recipe, null, 2);
  editorStatus.textContent = '';
  editorStatus.dataset.error = 'false';
}

function repaintSource(index, recipe) {
  const checked = compileBarkRecipe(recipe);
  const record = records[index];
  if (recipe.options.width !== width || recipe.options.height !== height) throw new RangeError('样片画幅需保持 360×400');
  const rebuilt = createBarkDocument(recipe.branches, recipe.options);
  paint(record.canvases[1], checked);
  record.source = rebuilt;
  return record;
}

function sheet() {
  const output = document.createElement('canvas');
  output.width = 760;
  output.height = records.length * 460;
  const context = output.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, output.width, output.height);
  context.fillStyle = '#30372c';
  context.font = '17px sans-serif';
  records.forEach((record, index) => {
    const y = index * 460;
    context.fillText(record.title, 16, y + 23);
    context.drawImage(record.canvases[0], 12, y + 32);
    context.drawImage(record.canvases[1], 388, y + 32);
    context.fillText(baselineCaption(record), 18, y + 450);
    context.fillText('枝径与笔势组织', 394, y + 450);
  });
  return output;
}

try {
  for (const study of createBarkStudyCases()) {
    const section = document.createElement('section');
    section.className = 'study';
    const title = document.createElement('h2');
    title.textContent = study.title;
    const pair = document.createElement('div');
    pair.className = 'pair';
    const canvases = [study.baseline.result, study.source.result].map((scene, index) => {
      const figure = document.createElement('figure');
      const canvas = document.createElement('canvas');
      const caption = document.createElement('figcaption');
      canvas.width = width;
      canvas.height = height;
      caption.textContent = index === 0 ? baselineCaption(study) : '枝径与笔势组织';
      paint(canvas, scene);
      figure.append(canvas, caption);
      pair.append(figure);
      return canvas;
    });
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = study.changedVariable;
    section.append(title, pair, note);
    document.querySelector('#gallery').append(section);
    const option = document.createElement('option');
    option.value = String(records.length);
    option.textContent = study.title;
    select.append(option);
    records.push({ ...study, canvases, initialRecipe: study.source.recipe });
  }
  select.onchange = showRecipe;
  showRecipe();
  document.querySelector('#apply-source').onclick = () => {
    try {
      repaintSource(Number(select.value), JSON.parse(sourceEditor.value));
      showRecipe();
      editorStatus.textContent = '已按编辑源重绘';
    } catch (error) {
      editorStatus.textContent = error.message;
      editorStatus.dataset.error = 'true';
    }
  };
  document.querySelector('#restore-source').onclick = () => {
    repaintSource(Number(select.value), records[Number(select.value)].initialRecipe);
    showRecipe();
    editorStatus.textContent = '已还原';
  };
  document.querySelector('#save-png').onclick = () => sheet().toBlob(blob => save(blob, 'bark-method-study.png'));
  document.querySelector('#save-source').onclick = () => save(new Blob([JSON.stringify({
    version: 1, seed: BARK_STUDY_OPTIONS.seed,
    cases: records.map(record => ({ id: record.id, title: record.title, changedVariable: record.changedVariable,
      view: record.view, baseline: record.baseline.recipe, bark: record.source.recipe, groups: record.source.groups })),
  }, null, 2)], { type: 'application/json' }), 'bark-method-study.json');
  document.querySelector('#verify-replay').onclick = () => {
    const checks = records.map(record => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      paint(canvas, compileBarkRecipe(JSON.parse(JSON.stringify(record.source.recipe))));
      return canvas.toDataURL() === record.canvases[1].toDataURL();
    });
    status.textContent = checks.every(Boolean) ? '3 组配方重建一致' : '重建检查出现差异';
    status.dataset.error = String(!checks.every(Boolean));
  };
  window.barkStudy = { records, repaintSource, sheet, settings };
  document.body.dataset.status = 'ready';
  status.textContent = '3 组固定种子对照';
} catch (error) {
  document.body.dataset.status = 'failed';
  status.textContent = error.message;
  throw error;
}
