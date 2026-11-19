import { rebuildRemainingDocument, drawRemainingDocument, editRemainingDocument } from './remaining-document.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pixelsEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const passed = rows => rows.every(row => Object.entries(row).every(([key, value]) => typeof value !== 'boolean' || value));
const ownReadonly = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(ownReadonly); Object.freeze(value); }
  return value;
};
export async function verifyRemainingBatch(batch) {
  const canvas = document.createElement('canvas'), results = [], pairs = [], editing = [], audits = [];
  const capture = (document, time = 8) => {
    drawRemainingDocument(canvas, document, time);
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  };
  try {
    for (const layout of batch.layouts) {
      const studies = batch.make({ layout });
      if (studies.length !== 3) throw new Error('Every batch must contain three studies');
      if (batch.audit) audits.push({ layout, ...batch.audit(studies) });
      for (const study of studies) {
        if (study.variants.length !== 3) throw new Error('Every study must contain three variants');
        if (batch.auditStudy) audits.push({ layout, study: study.id, ...batch.auditStudy(study) });
        const images = [];
        for (const variant of study.variants) {
          // Saved playback is readonly just like a core snapshot. This permits
          // the backend's immutable geometry cache across absolute time seeks.
          const input = JSON.stringify(variant.document), saved = ownReadonly(JSON.parse(input)), rebuilt = rebuildRemainingDocument(saved.recipe);
          const complete = capture(saved), replay = capture(rebuilt), early = capture(saved, -1);
          capture(saved, 1.7); capture(saved, .1);
          const seek = capture(saved);
          images.push(complete);
          results.push({ layout, study: study.id, variant: variant.id,
            jsonRebuildEqual: same(rebuilt, saved), pixelsRebuildEqual: pixelsEqual(complete, replay),
            absoluteSeekEqual: pixelsEqual(complete, seek), preludeDiffers: !pixelsEqual(complete, early),
            sourceUnchanged: input === JSON.stringify(variant.document), hasVisibleMark: !pixelsEqual(complete, early) });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        pairs.push({ layout, study: study.id, firstSecondDiffer: !pixelsEqual(images[0], images[1]),
          secondThirdDiffer: !pixelsEqual(images[1], images[2]) });
        const before = study.variants[2].document, edit = editRemainingDocument(before), edited = edit.document;
        const original = before.recipe[edit.field], changed = edited.recipe[edit.field];
        const beforePixels = capture(before), afterPixels = capture(edited);
        editing.push({ layout, study: study.id, localSourceChanges: !same(original[edit.index], changed[edit.index]),
          otherSourcesUnchanged: original.every((item, index) => index === edit.index || same(item, changed[index])),
          pixelEditVisible: !pixelsEqual(beforePixels, afterPixels),
          editedJsonRebuildEqual: same(rebuildRemainingDocument(JSON.parse(JSON.stringify(edited.recipe))), edited) });
      }
    }
  } finally { canvas.width = 0; canvas.height = 0; }
  return { passed: passed(results) && passed(pairs) && passed(editing) && audits.every(audit => audit.ok),
    sampleCount: results.length, results, pairs, editing, audits };
}
