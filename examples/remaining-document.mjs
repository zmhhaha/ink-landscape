import { createStrokeGroupDocument, createInkProcessDocument, createWaterProcessDocument,
  renderCanvas, renderInkProcess } from '../dist/index.js';

/** Rebuild only authored data; saved playback is deliberately not consulted. */
export function rebuildRemainingDocument(recipe) {
  if (recipe?.version !== 1) throw new RangeError('Unsupported study recipe version');
  const keys = Object.keys(recipe);
  const field = recipe.generator === 'ink-stroke-groups-v1' ? 'groups'
    : recipe.generator === 'ink-layer-process-v1' ? 'layers'
      : recipe.generator === 'water-event-process-v1' ? 'events' : undefined;
  if (!field || keys.some(key => !['version', 'generator', field, 'options'].includes(key))) throw new RangeError('Unsupported study recipe');
  return field === 'groups' ? createStrokeGroupDocument(recipe.groups, recipe.options)
    : field === 'layers' ? createInkProcessDocument(recipe.layers, recipe.options)
      : createWaterProcessDocument(recipe.events, recipe.options);
}
export function drawRemainingDocument(canvas, document, time = 8) {
  const result = document.result;
  canvas.width = result.width; canvas.height = result.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (Array.isArray(result.layers)) renderInkProcess(context, result, { time, cellSize: 1 });
  else renderCanvas(context, result, { time, paperTexture: 0 });
}
/** Local source edit used by the UI and verification; all unrelated source entries stay intact. */
export function editRemainingDocument(document, { dx = 12, widthScale = 1.15 } = {}) {
  const recipe = JSON.parse(JSON.stringify(document.recipe));
  const field = recipe.groups ? 'groups' : recipe.layers ? 'layers' : 'events';
  const hasContact = item => item.strokes?.length || item.droplets?.length;
  let index = recipe[field].findIndex(item => item.role !== 'structure' && hasContact(item));
  if (index < 0) index = recipe[field].findIndex(hasContact);
  if (index < 0) throw new RangeError('No editable contact in the study');
  const item = recipe[field][index];
  if (item.strokes?.length) {
    const stroke = item.strokes[0];
    stroke.points = stroke.points.map(point => ({ ...point, x: point.x + dx }));
    if (stroke.options?.clip) stroke.options.clip = stroke.options.clip.map(point => ({ ...point, x: point.x + dx }));
    const defaultWidth = field === 'groups' ? 3 : 24;
    stroke.options = { ...stroke.options, width: (stroke.options?.width ?? recipe.options.strokeWidth ?? defaultWidth) * widthScale };
  } else {
    item.droplets[0].x += dx; item.droplets[0].radius *= widthScale;
  }
  return { document: rebuildRemainingDocument(recipe), field, index };
}
