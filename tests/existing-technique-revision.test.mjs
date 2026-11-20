import test from 'node:test';
import assert from 'node:assert/strict';
import {createExistingTechniqueRevisionCases,createWetStageComparisons} from '../examples/existing-technique-revision-data.mjs';
import {rebuildRemainingDocument} from '../examples/remaining-document.mjs';
import {compilePointTextureRecipe} from '../dist/point-texture.js';
import {compileSurfaceCunRecipe} from '../dist/surface-cun.js';
import {TECHNIQUE_CATALOG,TECHNIQUE_REVISIONS,getTechniqueRevisions} from '../dist/index.js';

test('eighteen revised studies retain four editable replayable views and discoverable technique coverage',()=>{
  const records=createExistingTechniqueRevisionCases();assert.equal(records.length,18);
  const catalogue=new Set(TECHNIQUE_CATALOG.map(item=>item.id));
  assert.equal(new Set(records.map(item=>item.id)).size,18);
  for(const record of records){
    for(const id of record.techniques){assert.ok(catalogue.has(id));assert.ok(getTechniqueRevisions(id).length);}
    for(const key of ['baseline','improved','transferBaseline','transfer']){
      const doc=record[key];assert.equal(doc.result.width,360);assert.equal(doc.result.height,280);assert.equal(doc.result.seed,20261120);
      assert.deepEqual(rebuildRemainingDocument(JSON.parse(JSON.stringify(doc.recipe))).result,doc.result);
    }
    if(record.sourceRecipe?.generator==='ink-point-texture-v1')assert.deepEqual(compilePointTextureRecipe(record.sourceRecipe),compilePointTextureRecipe(JSON.parse(JSON.stringify(record.sourceRecipe))));
    if(record.sourceRecipe?.generator==='ink-surface-cun-v1')assert.deepEqual(compileSurfaceCunRecipe(record.sourceRecipe),compileSurfaceCunRecipe(JSON.parse(JSON.stringify(record.sourceRecipe))));
  }
  assert.deepEqual(TECHNIQUE_REVISIONS.filter(item=>item.id!=='rock-form-20261120').map(item=>item.techniqueIds.length),[5,5,5,3]);
  assert.ok(getTechniqueRevisions('cun-axe').some(item=>item.example==='examples/structured-rock-study.html'));
  assert.ok(getTechniqueRevisions('cun-jiesuo').some(item=>item.id==='rock-form-20261120'));
});

test('wet stage comparisons hold the contacts and pigment amount while changing authored water time',()=>{
  const stages=createWetStageComparisons();assert.deepEqual(stages.map(item=>item.at),[.15,1.2,3]);
  const contacts=stages.map(item=>JSON.stringify(item.document.recipe.events.map(event=>{const {at,...source}=event;return source;})));
  assert.ok(contacts.every(source=>source===contacts[0]));
  assert.ok(stages[0].mobile>stages[1].mobile&&stages[1].mobile>stages[2].mobile);
  assert.equal(stages[2].interactions,0);
  for(const item of stages)assert.ok(Math.abs(item.pigment-stages[0].pigment)<stages[0].pigment*2e-6);
});
