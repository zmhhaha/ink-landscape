import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';
import { createBadaInkComposition, drawBadaInkComposition } from './bada-material.mjs';
import { createBadaTreeGroups } from './bada-tree.mjs';
import { createBadaHangingWoodGroups } from './bada-hanging-wood.mjs';
import { createBadaCrowGroups } from './bada-crows.mjs';

export const BADA_REFERENCE = Object.freeze({
  title: '朱耷枯木寒鸦图轴', accession: '新00108969',
  url: 'https://www.dpm.org.cn/collection/paint/228289.html',
  study: 'Authored code study; no reference image is a rendering input.',
});

/** Each subject remains an ordinary, individually editable stroke group. */
export function createBadaDocument({ width = 540, seed = 821730 } = {}) {
  const scale = width / 1381, height = Math.round(width * 2692 / 1381);
  const groups = [...createBadaHangingWoodGroups(), ...createBadaTreeGroups(), ...createBadaCrowGroups()]
    .map(group => ({ ...group, strokes: group.strokes.map(stroke => ({ ...stroke,
      points: stroke.points.map(point => ({ ...point, x: (point.x - 73)*scale, y: (point.y-78)*scale })),
      options: { ...stroke.options, width: stroke.options.width*scale,
        ...(stroke.options.clip ? { clip: stroke.options.clip.map(point => ({ x:(point.x-73)*scale,y:(point.y-78)*scale })) } : {}) },
    })) }));
  return createStrokeGroupDocument(groups, { width, height, seed,
    background: '#f5f2e9', ink: '#30352d', opacity: .7, dryness: .65 });
}

const compositions=new WeakMap();
export function prepareBadaDocument(document) {
  if(!compositions.has(document))compositions.set(document,createBadaInkComposition(document));
  return compositions.get(document);
}
export function drawBadaDocument(canvas, document) {
  return drawBadaInkComposition(canvas,prepareBadaDocument(document));
}
