import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNIQUE_CATALOG, TECHNIQUE_CATEGORIES, TECHNIQUE_SOURCES, findTechniques, getTechnique,
} from '../dist/technique-catalog.js';
import { TECHNIQUE_READINGS, getTechniqueReading } from '../dist/technique-learning.js';

test('learning catalogue stays pure, serializable and separates research from implementation', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.deepEqual(JSON.parse(JSON.stringify(TECHNIQUE_CATALOG)), TECHNIQUE_CATALOG);
  const categories = new Set(TECHNIQUE_CATEGORIES.map(value => value.id));
  const sources = new Set(TECHNIQUE_SOURCES.map(value => value.id));
  assert.equal(new Set(TECHNIQUE_CATALOG.map(value => value.id)).size, TECHNIQUE_CATALOG.length);
  assert.equal(sources.size, TECHNIQUE_SOURCES.length);
  assert.ok(TECHNIQUE_CATALOG.length >= 80, 'the catalogue spans the requested families without claiming exhaustiveness');
  for (const value of TECHNIQUE_CATALOG) {
    assert.match(value.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(categories.has(value.category));
    assert.ok(value.name && value.target && value.notes);
    assert.equal(value.validation, 'unreviewed', 'technical support must not imply artistic acceptance');
    assert.equal(value.entryPoint === null, value.implementation === 'pending');
    assert.equal(value.evidence.sourceIds.length === 0, value.evidence.status === 'pending');
    for (const id of value.evidence.sourceIds) assert.ok(sources.has(id), `${value.id}: missing source ${id}`);
    assert.ok(Object.isFrozen(value) && Object.isFrozen(value.evidence) && Object.isFrozen(value.aliases) && Object.isFrozen(value.variants));
  }
  assert.equal(getTechnique('ink-layered').implementation, 'prototype', 'editable layer timing is a procedural prototype, not artistic acceptance');
  assert.equal(getTechnique('ink-layered').entryPoint, 'createInkProcessDocument');
  assert.equal(getTechnique('ink-broken').implementation, 'prototype');
  assert.equal(getTechnique('water-break-ink').implementation, 'prototype', 'editable clear-water events are a finite exchange prototype, not a fluid simulation');
  assert.equal(getTechnique('water-break-ink').entryPoint, 'createWaterProcessDocument');
  for (const id of ['ink-break-water', 'water-sprinkle']) {
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).entryPoint, 'createWaterProcessDocument');
    assert.equal(getTechnique(id).reading.confidence, 'partial', 'implementing an experimental input does not strengthen reading evidence');
    assert.equal(getTechnique(id).validation, 'unreviewed');
  }
  assert.equal(getTechnique('cun-pima').implementation, 'prototype');
  assert.equal(getTechnique('cun-pima').evidence.status, 'definition', 'the dedicated museum term entry has now been read');
  for (const id of ['cun-pima', 'cun-axe', 'cun-zhedai']) {
    assert.equal(getTechnique(id).entryPoint, 'createCunDocument');
    assert.equal(getTechnique(id).implementation, 'prototype', 'authored guide execution does not complete traditional composition');
    assert.equal(getTechnique(id).validation, 'unreviewed');
    assert.equal(getTechnique(id).reading.confidence, 'supported', 'code progress does not alter the existing reading classification');
  }
  assert.ok(getTechnique('cun-jiesuo').reading.evidence.length, 'a new dedicated reading must preserve its actual source and scope');
  for (const id of ['cun-jiesuo', 'cun-luanchai', 'cun-niumao']) {
    assert.equal(getTechnique(id).entryPoint, 'createCunDocument');
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).validation, 'unreviewed');
    assert.equal(getTechnique(id).sampleReview, undefined, 'line-family prototypes inherit no artistic approval');
  }
  assert.equal(getTechnique('cun-jiesuo').reading.confidence, 'supported');
  assert.equal(getTechnique('cun-luanchai').reading.confidence, 'supported');
  assert.equal(getTechnique('cun-niumao').reading.confidence, 'partial', 'a fine-line study does not establish historical motion or composition');
  assert.match(getTechnique('cun-niumao').notes, /形态研究/);
  for (const id of ['cun-juanyun', 'cun-yuntou', 'cun-yudian', 'cun-douban', 'cun-heye']) {
    assert.equal(getTechnique(id).entryPoint, 'createCunDocument');
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).validation, 'unreviewed');
    assert.equal(getTechnique(id).sampleReview, undefined, 'shared studies inherit no artistic approval');
  }
  for (const id of ['cun-juanyun', 'cun-yuntou', 'cun-yudian', 'cun-douban']) {
    assert.equal(getTechnique(id).reading.confidence, 'partial', 'a shared experiment does not resolve historical naming');
    assert.match(getTechnique(id).notes, ['cun-juanyun', 'cun-yuntou'].includes(id) ? /cloud-study/ : /point-study/,
      'the catalogue identifies the applicable shared study');
  }
  assert.equal(getTechnique('cun-heye').reading.confidence, 'supported');
  assert.match(getTechnique('cun-heye').notes, /独立源路径/);
  assert.equal(getTechnique('brush-against').implementation, 'pending', 'spatial reverse drag does not establish traditional reverse-tip handling');
  assert.equal(getTechnique('brush-dot').implementation, 'prototype');
  for (const id of ['vegetation-moss', 'vegetation-dot-leaves', 'vegetation-outline-leaves']) {
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).entryPoint, 'createVegetationDocument');
    assert.equal(getTechnique(id).validation, 'unreviewed', 'authored branch and leaf data do not establish artistic acceptance');
    assert.equal(getTechnique(id).sampleReview, undefined, 'object studies inherit no foundation sample approval');
  }
  assert.equal(getTechnique('vegetation-outline-leaves').reading.confidence, 'partial', 'paired paths do not establish a traditional stroke sequence');
  for (const id of ['leaf-jie', 'leaf-ge', 'leaf-three-five']) {
    assert.equal(getTechnique(id).entryPoint, 'createVegetationDocument');
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).validation, 'unreviewed', 'authored cluster morphology does not establish traditional mastery');
    assert.equal(getTechnique(id).sampleReview, undefined);
  }
  assert.equal(getTechnique('leaf-jie').reading.confidence, 'partial');
  assert.equal(getTechnique('leaf-ge').reading.confidence, 'partial');
  assert.equal(getTechnique('leaf-three-five').reading.confidence, 'supported');
  for (const id of ['leaf-pepper', 'leaf-broken', 'vegetation-pine-needles']) {
    assert.equal(getTechnique(id).entryPoint, 'createVegetationDocument');
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).validation, 'unreviewed', 'authored dots, split paths and needle fans do not establish artistic acceptance');
    assert.equal(getTechnique(id).sampleReview, undefined);
  }
  assert.equal(getTechnique('leaf-pepper').reading.confidence, 'supported');
  assert.equal(getTechnique('leaf-broken').reading.confidence, 'partial', 'explicit correlated paths do not establish traditional bristle contact');
  assert.equal(getTechnique('vegetation-pine-needles').reading.confidence, 'partial', 'needle geometry does not establish a traditional stroke sequence');
  for (const id of ['vegetation-bamboo-leaves', 'leaf-plum', 'line-double-outline']) {
    assert.equal(getTechnique(id).entryPoint, 'createVegetationDocument');
    assert.equal(getTechnique(id).implementation, 'prototype');
    assert.equal(getTechnique(id).validation, 'unreviewed', 'authored bamboo, leaf clusters and paired contours do not establish artistic acceptance');
    assert.equal(getTechnique(id).sampleReview, undefined);
  }
  assert.equal(getTechnique('vegetation-bamboo-leaves').reading.confidence, 'partial', 'authored bamboo paths do not establish a traditional flick sequence');
  assert.equal(getTechnique('leaf-plum').reading.confidence, 'partial', 'a leaf-dot prototype does not establish painting real plum flowers');
  assert.equal(getTechnique('line-double-outline').reading.confidence, 'supported', 'the painting definition remains separate from copying calligraphy');
  assert.match(getTechnique('line-double-outline').notes, /复制法帖/);
  assert.equal(getTechnique('leaf-pin').implementation, 'pending', 'a named teaching item without a confirmed diagram must not inherit another cluster study');
  const sampleApproved = TECHNIQUE_CATALOG.filter(item => item.sampleReview?.status === 'user-approved');
  assert.deepEqual(sampleApproved.map(item => item.id).sort(),
    ['brush-center', 'brush-side', 'brush-lift', 'brush-press', 'ink-dry', 'ink-wet', 'ink-flying-white'].sort());
  assert.ok(sampleApproved.every(item => item.validation === 'unreviewed' && Object.isFrozen(item.sampleReview)
    && item.sampleReview.scope.includes('弧线样片')), 'sample feedback must not approve other paths or comprehensive technique validation');
});

test('all catalogue entries carry sourced reading notes without implying implementation or artistic acceptance', () => {
  const sourceIds = new Set(TECHNIQUE_SOURCES.map(source => source.id));
  assert.equal(TECHNIQUE_READINGS.length, 100);
  assert.equal(new Set(TECHNIQUE_READINGS.map(note => note.id)).size, 100);
  for (const item of TECHNIQUE_CATALOG) {
    const note = getTechniqueReading(item.id);
    assert.equal(item.reading, note);
    for (const key of ['summary', 'actions', 'appearance', 'application', 'pitfall', 'translation']) assert.ok(note[key].length >= 12);
    assert.ok(note.evidence.length && note.evidence.every(evidence => sourceIds.has(evidence.sourceId) && evidence.locator && typeof evidence.note === 'string'));
    assert.ok(Object.isFrozen(note) && Object.isFrozen(note.evidence) && note.evidence.every(Object.isFrozen));
    assert.equal(item.validation, 'unreviewed');
  }
  assert.equal(getTechniqueReading('not-a-technique'), undefined);
  assert.equal(getTechnique('line-caoyi').reading.confidence, 'disputed');
  assert.equal(getTechnique('line-caoyi').implementation, 'pending');
  assert.ok(findTechniques({ query: '金属线缆' }).some(item => item.id === 'line-tiexian'), 'search includes the actual reading, beyond the old study target');
  assert.ok(findTechniques({ query: '曹衣出水' }).some(item => item.id === 'line-caoyi'));
  assert.throws(() => { getTechniqueReading('line-caoyi').evidence[0].locator = 'changed'; }, TypeError);
});

test('catalogue lookup searches variants while keeping different conceptual levels apart', () => {
  assert.equal(getTechnique('not-a-technique'), undefined);
  const axe = findTechniques({ query: '大斧劈皴', category: 'texture', implementation: 'prototype' });
  assert.deepEqual(axe.map(value => value.id), ['cun-axe']);
  assert.deepEqual(getTechnique('cun-axe').aliases, [], 'family variants are not listed as exact synonyms');
  assert.ok(findTechniques({ query: '蚂蝗描', category: 'linework' }).some(value => value.id === 'line-mahuang'));
  assert.equal(findTechniques({ category: 'water' }).length, 6);
  const mentionedWater = findTechniques({ category: 'water', evidence: 'mentioned' });
  assert.ok(mentionedWater.every(value => value.evidence.status === 'mentioned'));
  assert.ok(mentionedWater.some(value => value.id === 'water-texture'), 'an unresolved operation stays at the name-level evidence status');
  assert.equal(getTechnique('water-collision').evidence.status, 'definition', 'a contextual operation description supports the researched definition');
  assert.equal(getTechnique('water-collision').implementation, 'pending', 'learning an operation does not implement it');
  assert.ok(findTechniques({ category: 'calligraphy' }).every(value => value.level === 'calligraphic-stroke'));
  assert.notEqual(getTechnique('eight-ce').id, getTechnique('brush-side').id, 'eight-method ce and side brush are different concepts');
  assert.notEqual(getTechnique('line-zhuye').category, getTechnique('vegetation-bamboo-leaves').category);
  assert.equal(findTechniques({ query: 'nonexistent-technique' }).length, 0);
  assert.throws(() => findTechniques({ query: 1 }), /query/);
  const result = findTechniques({ query: '  PIMA  ' });
  assert.ok(result.some(value => value.id === 'cun-pima'));
  assert.ok(Object.isFrozen(result));
  assert.throws(() => { getTechnique('brush-center').evidence.sourceIds.push('fake'); }, TypeError);
});
