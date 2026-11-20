import { remainingBrushBatches, auditRemainingBrush } from './remaining-brush-fixtures.mjs';
import * as inkFixtures from './remaining-ink-fixtures.mjs';
import { remainingLineBatches, auditRemainingLine } from './remaining-line-fixtures.mjs';

export const remainingStage = Object.freeze({ id: 'remaining-technique-batches-20261120',
  label: '完整研究批次', backend: 'canvas-contact-waterline-hierarchy-20261120' });
export const remainingBatches = [
  ...remainingBrushBatches.map(batch => ({ ...batch, auditStudy: auditRemainingBrush })),
  ...inkFixtures.remainingInkBatches.map(batch => ({ ...batch, auditStudy: inkFixtures.auditRemainingInk })),
  ...remainingLineBatches.map(batch => ({ ...batch, auditStudy: auditRemainingLine })),
].sort((a, b) => a.number - b.number);
export const makeRemainingBatch = (batch, layout = batch.layout) => batch.make({ layout });
export function remainingRecord(batch, layout, studies) {
  return { version: 1, study: remainingStage.id, batch: batch.number, layout,
    ...(batch.number <= 20 ? { sourceRevision: 'natural-hierarchy-revision-20261120' }
      : batch.number <= 22 ? { sourceRevision: 'advanced-material-revision-20261120' } : {}),
    render: { backend: remainingStage.backend, time: 8, paperTexture: 0, cellSize: 1 },
    documents: studies.flatMap(study => study.variants.map(variant => ({ study: study.id,
      variant: variant.id, techniqueIds: study.techniqueIds, limits: study.limits, document: variant.document }))) };
}
