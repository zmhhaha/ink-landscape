import { renderCanvas, renderInkProcess, sampleBrushContact } from '../dist/index.js';
import { makeFoundationStudies } from './foundation-fixtures.mjs';
import { makeGestureStudies } from './gesture-fixtures.mjs';
import { makeDotStudies } from './dot-fixtures.mjs';
import { makeInkStudies } from './ink-fixtures.mjs';
import { makeWaterStudies } from './water-fixtures.mjs';
import { makeCunStudies } from './cun-fixtures.mjs';
import { makeLineCunStudies } from './line-cun-fixtures.mjs';
import { makeBranchCunStudies } from './branch-cun-fixtures.mjs';
import { makeVegetationStudies } from './vegetation-fixtures.mjs';
import { makeLeafClusterStudies } from './leaf-cluster-fixtures.mjs';
import { makePepperBrokenPineStudies } from './pepper-broken-pine-fixtures.mjs';
import { makeBambooPlumOutlineStudies } from './bamboo-plum-outline-fixtures.mjs';

export const revisionStage = Object.freeze({ id: 'twelve-batch-hierarchy-revision', label: '层级回修',
  backend: 'canvas-contact-waterline-hierarchy-20261120' });

export const revisionBatches = [
  ['foundation', '基础运笔', makeFoundationStudies, 'Foundation', 'curve', ['straight', 'curve', 'corner']],
  ['gesture', '起收转折', makeGestureStudies, 'Gesture', 'curve', ['straight', 'curve', 'corner']],
  ['dot', '点迹组织', makeDotStudies, 'Dot', 'straight', ['straight', 'arc', 'slope']],
  ['ink', '浓淡积破', makeInkStudies, 'Ink', 'ridge'],
  ['water', '水墨先后', makeWaterStudies, 'Water', 'ridge'],
  ['cun', '披麻斧劈折带', makeCunStudies, 'Cun', 'slope'],
  ['line-cun', '解索乱柴牛毛', makeLineCunStudies, 'LineCun', 'slope'],
  ['branch-cun', '环抱点皴筋脉', makeBranchCunStudies, 'BranchCun', 'slope'],
  ['vegetation', '点苔点叶夹叶', makeVegetationStudies, 'Vegetation', 'slope'],
  ['leaf-cluster', '介字个字聚簇', makeLeafClusterStudies, 'LeafCluster', 'slope'],
  ['pepper-broken-pine', '胡椒破笔松针', makePepperBrokenPineStudies, 'PepperBrokenPine', 'slope'],
  ['bamboo-plum-outline', '竹叶梅花双勾', makeBambooPlumOutlineStudies, 'BambooPlumOutline', 'slope'],
].map(([id, title, make, verifyName, layout, layouts], index) => ({
  id, title, make, verifyName, number: index + 1, layout,
  layouts: layouts ?? [layout, 'arc', 'fold'],
}));

export function makeRevisionBatch(batch, layout = batch.layout) {
  return batch.make(batch.number <= 2 ? { pathVariant: layout } : { layout });
}

export function drawRevisionVariant(canvas, batch, variant) {
  const scene = variant.scene ?? variant.document.result;
  canvas.width = scene.width; canvas.height = scene.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (batch.number === 4 || batch.number === 5) renderInkProcess(context, scene, { time: 8, cellSize: 1 });
  else renderCanvas(context, scene, { time: 8, paperTexture: 0 });
}

export function revisionDetail(batch, study, variant) {
  const recipe = variant.document.recipe;
  if (batch.number >= 9) {
    const units = recipe.units.filter(unit => unit.id === 'cluster-1' || unit.id === 'leaf-1');
    const points = units.flatMap(unit => unit.strokes?.flatMap(stroke => stroke.points) ?? unit.points ?? []);
    if (points.length) return [(Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2,
      (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2];
  }
  if (Array.isArray(study.detail)) return study.detail;
  if (study.detail) return [study.detail.x + study.detail.width / 2, study.detail.y + study.detail.height / 2];
  if (batch.number <= 2) {
    const points = variant.document.result.points;
    const at = study.id === 'entry' ? 0 : study.id === 'finish' ? 1 : study.id === 'dry' ? .8 : .5;
    const point = points[Math.round((points.length - 1) * at)];
    return [point.x, point.y];
  }
  if (batch.number === 3) {
    const mark = variant.document.result.find(mark => mark.id === (study.id === 'group' ? 'group-4' : 'point-1'));
    const samples = sampleBrushContact(mark), middle = samples[Math.floor(samples.length / 2)];
    return [middle.centerX, middle.centerY];
  }
  return [280, 145];
}

export function revisionRecord(batch, layout, studies) {
  return { version: 1, study: revisionStage.id, batch: batch.number, layout,
    render: { backend: revisionStage.backend, paperTexture: 0, time: 8, cellSize: 1 },
    documents: studies.flatMap(study => study.variants.map(variant => ({
      study: study.id, variant: variant.id, document: variant.document,
    }))) };
}
