import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { createInkProcessDocument, compileInkProcessRecipe, rasterizeInkProcess } from '../dist/ink-process.js';
import { createWaterProcessDocument, compileWaterProcessRecipe, reviseWaterProcessDocument } from '../dist/water-process.js';

const options={width:112,height:80,seed:20261120,wetModel:'settling-v1'};
const stroke=(id,y,width=28)=>({points:[{x:12,y,pressure:.2},{x:38,y:y-3,pressure:.95},{x:75,y:y+2,pressure:.9},{x:100,y,pressure:0}],
  options:{id,width,dryness:.08,opacity:.9,smoothing:'catmull-rom'}});
const ink={kind:'ink',id:'ink',strokes:[stroke('body',40)],concentration:.7,water:.9,at:0,dryAfter:2};
const clear=at=>({kind:'water',id:'clear',droplets:[{id:'touch',x:60,y:42,radius:21}],water:.95,at,dryAfter:2});
const sum=values=>values.reduce((a,b)=>a+b,0);
const raster=(events,settings={})=>rasterizeInkProcess(createWaterProcessDocument(events,{...options,...settings}).result,{cellSize:1.5});
const close=(a,b,tolerance=2e-6)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('explicit settling source owns its selected model and reconstructs exact event frames out of order',()=>{
  const doc=createWaterProcessDocument([ink,clear(.3)],options), saved=JSON.parse(JSON.stringify(doc.recipe));
  assert.equal(doc.result.wetModel,'settling-v1');
  assert.deepEqual(compileWaterProcessRecipe(saved),doc.result);
  const end=rasterizeInkProcess(doc.result,{time:4,cellSize:2});
  rasterizeInkProcess(doc.result,{time:-1,cellSize:2});
  rasterizeInkProcess(doc.result,{time:.1,cellSize:2});
  assert.deepEqual(rasterizeInkProcess(compileWaterProcessRecipe(saved),{time:4,cellSize:2}),end);
  assert.deepEqual(reviseWaterProcessDocument(doc,{}).recipe,doc.recipe);
  const legacy=createWaterProcessDocument([ink,clear(.3)],{width:112,height:80,seed:20261120});
  assert.equal(legacy.result.wetModel,undefined);
  assert.equal(rasterizeInkProcess(legacy.result).mobileDensity,undefined);
  assert.notDeepEqual(rasterizeInkProcess(legacy.result).density,rasterizeInkProcess(doc.result).density);
});

test('clear water conserves pigment in both orders and never contributes visible pigment',()=>{
  const original=raster([ink]);
  const after=raster([ink,clear(.2)]), before=raster([{...clear(0)}, {...ink,at:.2}]);
  for(const frame of [after,before]){
    close(sum(frame.density),sum(original.density));
    assert.ok(frame.density.every(value=>Number.isFinite(value)&&value>=0));
    for(let i=0;i<frame.density.length;i++)close(frame.density[i],frame.mobileDensity[i]+frame.settledDensity[i]);
  }
  assert.ok(raster([clear(0)]).density.every(value=>value===0));
  assert.notDeepEqual(after.density,before.density);
});

test('later water moves less pigment as the authored wet interval closes and does not revive dry ink',()=>{
  const original=raster([ink]), early=raster([ink,clear(.15)]), half=raster([ink,clear(1.25)]), dry=raster([ink,clear(3)]);
  const difference=frame=>sum(frame.density.map((value,i)=>Math.abs(value-original.density[i])));
  assert.ok(difference(early)>difference(half)*1.5);
  assert.ok(sum(early.mobileDensity)>sum(half.mobileDensity));
  close(difference(dry),0,1e-4);
  assert.equal(dry.interactions,0);
  assert.ok(dry.mobileDensity.every(value=>value===0));
  for(let i=0;i<dry.density.length;i++)close(dry.density[i],original.density[i]);
});

test('already bound pigment stays at its own pixels while still-mobile pigment changes locally',()=>{
  const before=raster([ink]), after=raster([ink,clear(.4)]);
  let decreased=0,increased=0;
  for(let i=0;i<before.density.length;i++){
    assert.ok(after.settledDensity[i]+1e-6>=before.settledDensity[i]);
    if(after.density[i]<before.density[i]-1e-4)decreased++;
    if(after.density[i]>before.density[i]+1e-4)increased++;
  }
  assert.ok(decreased>10&&increased>10);
  const distant=raster([ink,{...clear(.4),droplets:[{id:'far',x:106,y:2,radius:2}]}]);
  for(let i=0;i<before.density.length;i++)close(distant.density[i],before.density[i]);
});

test('dry accumulation adds optical depth and keeps authored light openings without repainting paper',()=>{
  const a={id:'a',strokes:[stroke('first',30,15)],concentration:.2,water:.8,at:0,dryAfter:1};
  const b={id:'b',strokes:[stroke('second',48,14)],concentration:.6,water:.4,at:3,dryAfter:1};
  const render=layers=>rasterizeInkProcess(createInkProcessDocument(layers,options).result,{cellSize:2});
  const first=render([a]),second=render([b]),together=render([a,b]);
  for(let i=0;i<together.density.length;i++)close(together.density[i],first.density[i]+second.density[i]);
  assert.equal(together.density[0],0);
  assert.ok(sum(together.density)>sum(first.density));
  assert.deepEqual(compileInkProcessRecipe(JSON.parse(JSON.stringify(createInkProcessDocument([a,b],options).recipe))),createInkProcessDocument([a,b],options).result);
});

test('unknown wet models fail in source, revisions and imported compiled processes',()=>{
  assert.throws(()=>createInkProcessDocument([],{...options,wetModel:'fluid'}));
  assert.throws(()=>createWaterProcessDocument([ink],{...options,wetModel:null}));
  const doc=createWaterProcessDocument([ink],options);
  assert.throws(()=>reviseWaterProcessDocument(doc,{options:{wetModel:'unknown'}}));
  assert.throws(()=>rasterizeInkProcess({...doc.result,wetModel:'unknown'}));
});

test('legacy exchange density matches the pre-revision Node baseline exactly',()=>{
  const doc=createWaterProcessDocument([ink,clear(.3)],{width:112,height:80,seed:20261120});
  const frame=rasterizeInkProcess(doc.result,{cellSize:2});
  // Captured by compiling commit 86c7be5 separately, before the opt-in model.
  assert.equal(createHash('sha256').update(Buffer.from(frame.density.buffer)).digest('hex'),
    'be1b9cddea2aa0830c59e7af7c71c8f074eca2e178b9838931198189921dd6b9');
});

test('an unrelated earlier water event does not redirect a later local interaction',()=>{
  const local=raster([ink,clear(.4)]),split=raster([ink,{...clear(.1),id:'distant',droplets:[{id:'far',x:106,y:2,radius:2}]},clear(.4)]);
  assert.equal(split.interactions,local.interactions);
  for(let i=0;i<local.density.length;i++)for(const key of ['density','mobileDensity','settledDensity'])
    close(split[key][i],local[key][i]);
});
