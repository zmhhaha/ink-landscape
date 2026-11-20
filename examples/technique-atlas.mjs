import { renderCanvas, TECHNIQUE_CATALOG, TECHNIQUE_CATEGORIES, TECHNIQUE_SOURCES, findTechniques, getTechniqueStudies, getTechniqueRevisions } from '../dist/index.js';
import { makeTechniqueStudies, techniqueStudyInputs } from './technique-fixtures.mjs';
import { verifyTechniqueStudies } from './technique-verify.mjs';

const byId = id => document.getElementById(id);
const sourceById = new Map(TECHNIQUE_SOURCES.map(source => [source.id, source]));
const readingLabels = { supported: '有明确支持', partial: '部分支持', disputed: '存在异说', unresolved: '操作释义未确证' };
const batch11Studies = new Set(['leaf-pepper', 'leaf-broken', 'vegetation-pine-needles']);
const batch12Studies = new Set(['vegetation-bamboo-leaves', 'leaf-plum', 'line-double-outline']);
let studies = [], selected = 'contact';
let inputs = { ...techniqueStudyInputs, pathVariant: 'original' };
const sourceLink = source => { const link = document.createElement('a'); link.href = source.url; link.textContent = source.title; link.target = '_blank'; link.rel = 'noreferrer'; return link; };

function drawPath(context, scene) {
  context.save(); context.strokeStyle = '#ad4a36'; context.fillStyle = '#ad4a36'; context.globalAlpha = .72; context.lineWidth = .8;
  for (const mark of scene.marks) {
    if (mark.kind !== 'stroke') continue;
    context.beginPath(); mark.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
    for (const point of [mark.points[0], mark.points.at(-1)]) { context.beginPath(); context.arc(point.x, point.y, 2, 0, Math.PI * 2); context.fill(); }
  }
  context.restore();
}

function renderActive() {
  const study = studies.find(item => item.id === selected) ?? studies[0];
  selected = study.id;
  byId('atlas-study-title').textContent = study.name;
  byId('atlas-variable').textContent = `比较变量：${study.variable}`;
  byId('atlas-observation').textContent = study.observation;
  byId('atlas-canvases').replaceChildren();
  for (const variant of study.variants) {
    const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
    canvas.width = 560; canvas.height = 220; canvas.setAttribute('aria-label', variant.label);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    renderCanvas(context, variant.scene, { time: inputs.time, paperTexture: .025 });
    if (byId('atlas-overlay').checked) drawPath(context, variant.scene);
    caption.textContent = variant.label; figure.append(canvas, caption); byId('atlas-canvases').append(figure);
  }
  const refs = byId('atlas-study-sources'); refs.replaceChildren(document.createTextNode('阅读依据：'));
  for (const [index, id] of study.sourceIds.entries()) {
    if (index) refs.append(document.createTextNode(' · '));
    const source = sourceById.get(id);
    refs.append(source ? sourceLink(source) : document.createTextNode(`待接入来源 ${id}`));
  }
  for (const button of byId('atlas-study-list').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.study === selected));
}

function sheet() {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 90 + studies.length * 284;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#f8f7f1'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#304b38'; context.font = '24px Microsoft YaHei, sans-serif'; context.fillText('基础笔法学习册 · 原创程序样片', 28, 38);
  context.font = '12px Microsoft YaHei, sans-serif'; context.fillText(`种子 ${inputs.seed} · ${inputs.pathVariant} · Canvas 2D · 传统效果待对照`, 28, 64);
  const sample = document.createElement('canvas'); sample.width = 560; sample.height = 220;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });
  studies.forEach((study, index) => {
    const top = 90 + index * 284;
    context.fillStyle = '#304b38'; context.font = '17px Microsoft YaHei, sans-serif'; context.fillText(study.name, 28, top + 20);
    study.variants.forEach((variant, column) => {
      renderCanvas(sampleContext, variant.scene, { time: inputs.time, paperTexture: .025 });
      const x = 28 + column * 584;
      context.drawImage(sample, x, top + 32);
      context.font = '12px Microsoft YaHei, sans-serif'; context.fillStyle = '#52644c'; context.fillText(variant.label, x, top + 270);
    });
  });
  sample.width = 0; sample.height = 0;
  return canvas;
}

function rebuild() {
  const seedInput = byId('atlas-seed');
  if (!seedInput.checkValidity()) { seedInput.reportValidity(); return; }
  try {
    byId('atlas-error').textContent = '';
    inputs = { ...techniqueStudyInputs, seed: Number(seedInput.value), pathVariant: byId('atlas-path').value };
    studies = makeTechniqueStudies(inputs);
    const list = byId('atlas-study-list'); list.replaceChildren();
    for (const study of studies) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = study.name; button.dataset.study = study.id;
      button.addEventListener('click', () => { selected = study.id; renderActive(); }); list.append(button);
    }
    renderActive();
    byId('atlas-record').textContent = JSON.stringify({ kind: 'ink-technique-studies', inputs, studies });
    byId('atlas-check-result').dataset.status = 'idle'; byId('atlas-check-result').textContent = '尚未运行';
    if (new URLSearchParams(location.search).get('evidence') === '1') {
      const image = sheet(); byId('atlas-evidence').textContent = JSON.stringify({ sheet: image.toDataURL('image/png') }); image.width = 0; image.height = 0;
    }
    document.querySelector('main').dataset.status = 'ready';
  } catch (caught) { byId('atlas-error').textContent = caught.message; document.querySelector('main').dataset.status = 'failed'; }
}

function catalogue() {
  const matches = findTechniques({ query: byId('atlas-query').value,
    ...(byId('atlas-category').value ? { category: byId('atlas-category').value } : {}),
    ...(byId('atlas-progress').value ? { implementation: byId('atlas-progress').value } : {}),
  });
  const rows = byId('atlas-catalog-rows'); rows.replaceChildren();
  const evidenceLabels = { definition: '已有释义依据', mentioned: '来源提及', pending: '待核对出处' };
  for (const item of matches) {
    const row = document.createElement('tr');
    const title = document.createElement('td'); title.textContent = item.name;
    const category = document.createElement('small'); category.textContent = TECHNIQUE_CATEGORIES.find(value => value.id === item.category)?.name ?? item.category; title.append(category);
    const target = document.createElement('td'); target.textContent = item.target;
    const notes = document.createElement('small'); notes.textContent = item.notes; target.append(notes);
    const reading = document.createElement('details'), readingTitle = document.createElement('summary');
    reading.className = 'atlas-reading'; reading.dataset.technique = item.id;
    readingTitle.textContent = `阅读笔记 · ${readingLabels[item.reading.confidence]}`; reading.append(readingTitle);
    const abstract = document.createElement('p'); abstract.textContent = item.reading.summary; reading.append(abstract);
    const content = document.createElement('dl');
    for (const [label, key] of [['动作', 'actions'], ['笔迹观察', 'appearance'], ['适用范围', 'application'], ['误区与边界', 'pitfall'], ['程序转译假设', 'translation']]) {
      const term = document.createElement('dt'), description = document.createElement('dd');
      term.textContent = label; description.textContent = item.reading[key]; content.append(term, description);
    }
    reading.append(content);
    const citations = document.createElement('ul');
    for (const itemEvidence of item.reading.evidence) {
      const source = sourceById.get(itemEvidence.sourceId), citation = document.createElement('li');
      if (source) citation.append(sourceLink(source));
      citation.append(document.createTextNode(`；定位：${itemEvidence.locator}。${itemEvidence.note}`)); citations.append(citation);
    }
    reading.append(citations); target.append(reading);
    const evidence = document.createElement('td'); evidence.textContent = evidenceLabels[item.evidence.status];
    for (const id of item.evidence.sourceIds) { const source = sourceById.get(id); if (source) { const ref = document.createElement('small'); ref.append(sourceLink(source)); evidence.append(ref); } }
    const progress = document.createElement('td'); progress.className = 'atlas-status'; progress.textContent = item.implementation === 'prototype' ? '含程序近似' : '待实现';
    const visual = document.createElement('small'); visual.textContent = '传统效果未验收'; progress.append(visual);
    if (item.sampleReview) { const sample = document.createElement('small'); sample.textContent = '首批样片获用户认可'; sample.title = item.sampleReview.scope; progress.append(sample); }
    if (batch11Studies.has(item.id)) { const sample = document.createElement('a'); sample.href = '/examples/pepper-broken-pine-study.html'; sample.textContent = '第十一批对照'; progress.append(sample); }
    if (batch12Studies.has(item.id)) { const sample = document.createElement('a'); sample.href = '/examples/bamboo-plum-outline-study.html'; sample.textContent = '第十二批对照'; progress.append(sample); }
    for (const batch of getTechniqueStudies(item.id)) {
      const link = document.createElement('a'); link.href = `/${batch.example}`;
      link.textContent = `第${batch.number}批研究对照`; progress.append(link);
    }
    for (const revision of getTechniqueRevisions(item.id)) {
      const link=document.createElement('a');link.href=`/${revision.example}`;link.textContent=revision.title;progress.append(link);
    }
    row.append(title, target, evidence, progress); rows.append(row);
  }
  byId('atlas-filter-count').textContent = `${matches.length} / ${TECHNIQUE_CATALOG.length} 项`;
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `ink-brush-learning-${inputs.seed}-${inputs.pathVariant}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

byId('atlas-total').textContent = TECHNIQUE_CATALOG.length;
byId('atlas-prototypes').textContent = TECHNIQUE_CATALOG.filter(item => item.implementation === 'prototype').length;
byId('atlas-source-count').textContent = TECHNIQUE_SOURCES.length;
byId('atlas-reading-count').textContent = `${TECHNIQUE_CATALOG.filter(item => item.reading).length} / ${TECHNIQUE_CATALOG.length}`;
byId('atlas-reading-status').textContent = Object.entries(readingLabels).map(([status, label]) => `${label} ${TECHNIQUE_CATALOG.filter(item => item.reading.confidence === status).length} 项`).join(' · ') + '。阅读、实现与艺术验收分别记录。';
for (const category of TECHNIQUE_CATEGORIES) { const option = document.createElement('option'); option.value = category.id; option.textContent = category.name; byId('atlas-category').append(option); }
for (const source of TECHNIQUE_SOURCES) { const item = document.createElement('li'); item.id = `source-${source.id}`; item.append(sourceLink(source), document.createTextNode(` · ${source.institution} · 阅读日期 ${source.accessed}`)); const range = document.createElement('div'); range.textContent = [source.scope, source.supports].filter(Boolean).join(' '); item.append(range); byId('atlas-sources').append(item); }
byId('atlas-controls').addEventListener('submit', event => { event.preventDefault(); rebuild(); });
byId('atlas-path').addEventListener('change', rebuild);
byId('atlas-overlay').addEventListener('change', renderActive);
for (const id of ['atlas-query', 'atlas-category', 'atlas-progress']) byId(id).addEventListener(id === 'atlas-query' ? 'input' : 'change', catalogue);
byId('atlas-export-json').addEventListener('click', () => download(new Blob([JSON.stringify({ kind: 'ink-technique-studies', inputs, studies }, null, 2)], { type: 'application/json' }), 'json'));
byId('atlas-export-png').addEventListener('click', () => { const image = sheet(); image.toBlob(blob => { if (blob) download(blob, 'png'); else byId('atlas-error').textContent = '浏览器未能导出 PNG'; image.width = 0; image.height = 0; }, 'image/png'); });
byId('atlas-check').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true; const output = byId('atlas-check-result'); output.dataset.status = 'running'; output.textContent = '正在检查…';
  try { await new Promise(resolve => requestAnimationFrame(resolve)); const result = verifyTechniqueStudies(inputs); output.textContent = JSON.stringify(result, null, 2); output.dataset.status = result.passed ? 'passed' : 'failed'; }
  catch (caught) { output.textContent = caught.message; output.dataset.status = 'failed'; }
  finally { button.disabled = false; }
});
catalogue(); rebuild();
