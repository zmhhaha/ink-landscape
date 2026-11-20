import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurfaceCunDocument, compileSurfaceCunRecipe, reviseSurfaceCunDocument } from '../dist/surface-cun.js';
import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';
import { sampleBrushContact } from '../dist/brush-contact.js';
import { createLineTextureRevisionCases } from '../examples/line-texture-revision-fixtures.mjs';

const options={width:300,height:260,seed:20261120,technique:'pima'};
const surface=()=>({id:'face',region:[{x:20,y:20},{x:270,y:20},{x:270,y:240},{x:20,y:240}],
  flow:[{x:110,y:30},{x:92,y:125},{x:75,y:230}],
  fracture:[{x:160,y:30},{x:185,y:130},{x:200,y:230}],
  reserves:[[{x:140,y:80},{x:205,y:80},{x:205,y:150},{x:140,y:150}]],
  sites:[{id:'a',at:.05,offset:-5,length:130,tone:'body'},{id:'b',at:.3,offset:-45,length:90,tone:'accent'},
    {id:'c',at:.6,offset:8,length:70,tone:'wash'}]});
const frozen=value=>{
  if(value&&typeof value==='object'){
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(frozen);
  }
};
test('surface cun owns semantic and ordinary editable sources with exact JSON reconstruction in Node',()=>{
  assert.equal(typeof document,'undefined');
  const input=[surface()], style={...options};
  const doc=createSurfaceCunDocument(input,style);
  frozen(doc);
  assert.deepEqual(compileSurfaceCunRecipe(JSON.parse(JSON.stringify(doc.recipe))),doc.result);
  const {technique,idPrefix,...sceneOptions}=doc.recipe.options;
  assert.deepEqual(createStrokeGroupDocument(JSON.parse(JSON.stringify(doc.groups)),sceneOptions).result,doc.result);
  input[0].flow[0].x=-200;input[0].sites[0].length=5;style.seed=8;
  assert.equal(doc.recipe.surfaces[0].flow[0].x,110);
  assert.equal(doc.recipe.surfaces[0].sites[0].length,130);
  assert.equal(doc.recipe.options.seed,20261120);
});
test('editing or inserting one site preserves unrelated stroke geometry and material identities',()=>{
  const doc=createSurfaceCunDocument([surface()],options);
  const edit=structuredClone(doc.recipe.surfaces);
  edit[0].sites[1].offset-=8;
  const revised=reviseSurfaceCunDocument(doc,{surfaces:edit});
  assert.deepEqual(revised.groups[0].strokes[0],doc.groups[0].strokes[0]);
  assert.deepEqual(revised.result.marks[0],doc.result.marks[0]);
  assert.notDeepEqual(revised.groups[0].strokes[1],doc.groups[0].strokes[1]);
  edit[0].sites.unshift({id:'new',at:.1,offset:15,length:42});
  const inserted=createSurfaceCunDocument(edit,options);
  const byId=new Map(inserted.result.marks.map(mark=>[mark.id,mark]));
  for(const mark of revised.result.marks)assert.deepEqual(byId.get(mark.id),mark);
});
test('surface directions and local lengths follow a changed rock while sites retain their IDs',()=>{
  const original=surface();original.reserves=[];
  const doc=createSurfaceCunDocument([original],options);
  const move=p=>({...p,x:260-p.y,y:p.x-10});
  const rotated={...original,region:original.region.map(move),flow:original.flow.map(move),fracture:original.fracture.map(move)};
  const result=createSurfaceCunDocument([rotated],options);
  assert.deepEqual(result.groups[0].strokes.map(s=>s.id),doc.groups[0].strokes.map(s=>s.id));
  for(let i=0;i<doc.groups[0].strokes.length;i++){
    const a=doc.groups[0].strokes[i],b=result.groups[0].strokes[i];
    assert.equal(a.points.length,b.points.length);
    for(let j=0;j<a.points.length;j++){
      const expected=move(a.points[j]);
      assert.ok(Math.abs(expected.x-b.points[j].x)<1e-8);
      assert.ok(Math.abs(expected.y-b.points[j].y)<1e-8);
      assert.ok(Math.abs(a.points[j].pressure-b.points[j].pressure)<1e-8);
    }
  }
});
test('clear openings lift actual compiled contacts and axe marks use the fracture guide',()=>{
  const source=surface();
  source.flow=[{x:168,y:25},{x:168,y:235}];
  source.sites=[{id:'a',at:0,offset:0,length:200,width:8}];
  const doc=createSurfaceCunDocument([source],options), mark=doc.result.marks[0];
  const contact=sampleBrushContact(mark);
  const hole=contact.filter(p=>p.y>88&&p.y<143);
  assert.ok(hole.length>8);
  assert.ok(hole.every(p=>p.halfWidth===0));
  const axe=createSurfaceCunDocument([surface()],{...options,technique:'axe'});
  const pima=createSurfaceCunDocument([surface()],options);
  assert.ok(axe.groups[0].strokes[0].points[0].x>pima.groups[0].strokes[0].points[0].x+30);
});
test('all five paired studies use equal principal stroke budgets and rebuild their authoring source',()=>{
  const cases=createLineTextureRevisionCases();
  assert.equal(cases.length,5);
  for(const item of cases){
    assert.equal(item.baseline.result.width,360);assert.equal(item.baseline.result.height,280);
    assert.equal(item.improved.result.marks.length,item.baseline.result.marks.length);
    assert.equal(item.transfer.result.marks.length,item.transferBaseline.result.marks.length);
    assert.deepEqual(compileSurfaceCunRecipe(JSON.parse(JSON.stringify(item.sourceRecipe))),
      createSurfaceCunDocument(item.sourceRecipe.surfaces,item.sourceRecipe.options).result);
    assert.notDeepEqual(item.improved.result,item.baseline.result);
    assert.notDeepEqual(item.improved.result,item.transfer.result);
  }
});
test('unknown structures, unsupported options and unbounded budgets fail before generation',()=>{
  for(const source of [[],Array.from({length:17},(_,i)=>({...surface(),id:String(i)})),
    [surface(),surface()],[{...surface(),flow:[{x:1,y:1},{x:1,y:1}]}],
    [{...surface(),sites:[{id:'a',at:1,offset:0,length:20}]}],
    [{...surface(),sites:[{id:'a',at:.5,offset:NaN,length:20}]}],
    [{...surface(),sites:[{id:'a',at:.5,offset:0,length:0}]}],
    [{...surface(),sites:Array.from({length:513},(_,i)=>({id:String(i),at:.5,offset:0,length:20}))}],
    [{...surface(),sites:[{id:'same',at:.5,offset:0,length:20},{id:'same',at:.7,offset:0,length:20}]}],
  ])assert.throws(()=>createSurfaceCunDocument(source,options));
  for(const extra of [{technique:'cloud'},{unknown:true},{opacity:2},{dryness:NaN},{seed:.4}])
    assert.throws(()=>createSurfaceCunDocument([surface()],{...options,...extra}));
  const doc=createSurfaceCunDocument([surface()],options);
  assert.throws(()=>compileSurfaceCunRecipe({...doc.recipe,version:7}));
  assert.throws(()=>reviseSurfaceCunDocument(doc,{invisible:true}));
  const invisible=createSurfaceCunDocument([surface()],{...options,opacity:0});
  assert.ok(invisible.result.marks.every(mark=>mark.opacity===0));
});
