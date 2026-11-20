import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointTextureDocument,compilePointTextureRecipe,revisePointTextureDocument} from '../dist/point-texture.js';
import {createStrokeGroupDocument,compileStrokeGroupRecipe} from '../dist/stroke-group-document.js';
import {sampleBrushContact} from '../dist/brush-contact.js';
import {createPointTextureRevisionCases,createMiPointLayerControl} from '../examples/point-texture-revision-fixtures.mjs';
import {createInkProcessDocument,compileInkProcessRecipe,rasterizeInkProcess} from '../dist/ink-process.js';

const options={width:360,height:280,seed:20261120,idPrefix:'test'};
const feature=()=>({id:'fracture',technique:'rain',guide:[{x:90,y:40},{x:110,y:120},{x:170,y:220}],
  sites:[{id:'upper',at:.3,count:5,size:8,spread:15},{id:'lower',at:.8,count:4,size:12,spread:17,opacity:.4}],side:1});
function frozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));Object.values(value).forEach(frozen);}}

test('point texture owns structural source and ordinary editable groups with exact JSON replay',()=>{
  assert.equal(typeof document,'undefined');
  const source=[feature()],settings={...options};
  const a=createPointTextureDocument(source,settings);frozen(a);
  assert.deepEqual(compilePointTextureRecipe(JSON.parse(JSON.stringify(a.recipe))),a.result);
  const {idPrefix,...common}=options;
  const ordinary=createStrokeGroupDocument(JSON.parse(JSON.stringify(a.groups)),common);
  assert.deepEqual(compileStrokeGroupRecipe(ordinary.recipe),a.result);
  source[0].sites[0].at=.9;source[0].guide[0].x=-9;settings.seed=2;
  assert.equal(a.recipe.features[0].sites[0].at,.3);assert.equal(a.recipe.features[0].guide[0].x,90);
  assert.deepEqual(createPointTextureDocument([feature()],options),a);
});

test('editing one site and inserting or reordering features preserves all other identities and marks',()=>{
  const a=createPointTextureDocument([feature()],options),changed=structuredClone(a.recipe.features);
  changed[0].sites[0].at=.42;
  const b=revisePointTextureDocument(a,{features:changed});
  assert.deepEqual(a.groups.filter((g,i)=>JSON.stringify(g)!==JSON.stringify(b.groups[i])).map(g=>g.id),['4:test/8:fracture/5:upper']);
  changed[0].sites.unshift({id:'inserted',at:.6,count:2,size:5,spread:8});
  const extra=feature();extra.id='second';extra.technique='moss';
  const c=createPointTextureDocument([extra,...changed],options),byId=new Map(c.groups.map(g=>[g.id,g]));
  b.groups.forEach(g=>assert.deepEqual(byId.get(g.id),g));
  const marks=new Map(c.result.marks.map(m=>[m.id,m]));b.result.marks.forEach(m=>assert.deepEqual(marks.get(m.id),m));
});

test('point groups follow rigid guide rotation, authored direction and explicit pressure lifts',()=>{
  const original=feature();original.direction={x:.2,y:1};
  const a=createPointTextureDocument([original],options),rotated=structuredClone(original);
  rotated.guide=rotated.guide.map(p=>({...p,x:310-p.y,y:20+p.x}));rotated.direction={x:-1,y:.2};
  const b=createPointTextureDocument([rotated],options);
  for(let g=0;g<a.groups.length;g++)for(let i=0;i<a.groups[g].strokes.length;i++){
    const x=a.groups[g].strokes[i],y=b.groups[g].strokes[i];
    assert.equal(x.id,y.id);assert.equal(x.points.length,y.points.length);
    x.points.forEach((p,j)=>{assert.ok(Math.abs(y.points[j].x-(310-p.y))<1e-9);assert.ok(Math.abs(y.points[j].y-(20+p.x))<1e-9);});
  }
  original.guide=original.guide.map(p=>({...p,pressure:0}));
  createPointTextureDocument([original],options).result.marks.forEach(mark=>assert.ok(sampleBrushContact(mark).every(p=>p.halfWidth===0)));
});

test('Mi dots use filled, overlapping horizontal contacts and reserves omit nearby footprints',()=>{
  const input={id:'mi',technique:'mi',guide:[{x:40,y:100},{x:290,y:100}],direction:{x:1,y:0},
    sites:[{id:'tier',at:.5,count:6,size:10,spread:25}]};
  const a=createPointTextureDocument([input],options);
  assert.equal(a.groups[0].strokes.length,18);
  a.groups[0].strokes.forEach(s=>{
    assert.ok(s.points.every(p=>p.pressure>=.7));assert.equal(s.options.axis,'center');
    assert.ok(Math.abs(s.points.at(-1).x-s.points[0].x)>Math.abs(s.points.at(-1).y-s.points[0].y)*3);
  });
  const reserve=[{x:100,y:70},{x:130,y:70},{x:130,y:130},{x:100,y:130}];
  const guarded=createPointTextureDocument([{...input,reserves:[reserve]}],options);
  assert.ok(guarded.result.marks.length>0);
  assert.notDeepEqual(guarded.groups,a.groups);
  guarded.result.marks.flatMap(mark=>sampleBrushContact(mark)).forEach(p=>{
    assert.ok(p.centerX+p.halfWidth<100||p.centerX-p.halfWidth>130||p.centerY+p.halfWidth<70||p.centerY-p.halfWidth>130);
  });
  const blank=createPointTextureDocument([{...input,reserves:[[{x:0,y:0},{x:360,y:0},{x:360,y:280},{x:0,y:280}]]}],options);
  assert.equal(blank.result.marks.length,0);
});

test('point global opacity and dryness are effective, with finite source budgets and strict fields',()=>{
  const doc=createPointTextureDocument([feature()],{...options,opacity:0,dryness:.91});
  assert.ok(doc.result.marks.every(mark=>mark.opacity===0&&mark.dryness===.91));
  const rejects=[
    [{...feature(),technique:'grid'}],[feature(),feature()],[{...feature(),guide:[{x:1,y:1},{x:1,y:1}]}],
    [{...feature(),sites:[{id:'a',at:1.1,count:3,size:8,spread:10}]}],
    [{...feature(),sites:[{id:'a',at:.3,count:2.1,size:8,spread:10}]}],
    [{...feature(),direction:{x:0,y:0}}],[{...feature(),direction:{x:1.7e308,y:1.7e308}}],
    [{...feature(),sites:Array.from({length:49},(_,i)=>({id:String(i),at:.5,count:1,size:8,spread:10}))}],
    [{...feature(),technique:'mi',sites:Array.from({length:10},(_,i)=>({id:String(i),at:.5,count:20,size:8,spread:10}))}],
  ];
  rejects.forEach(source=>assert.throws(()=>createPointTextureDocument(source,options)));
  assert.throws(()=>createPointTextureDocument([feature()],{...options,strokeWidth:4}));
  assert.throws(()=>compilePointTextureRecipe({...doc.recipe,generator:'new'}));
  assert.throws(()=>revisePointTextureDocument(doc,{unsupported:1}));
});

test('five revisions retain their previous sources, fixed geometry and ordinary replayable transfer documents',()=>{
  const cases=createPointTextureRevisionCases();assert.equal(cases.length,5);
  assert.deepEqual(cases.flatMap(c=>c.techniques),['cun-yudian','cun-douban','cun-dingtou','cun-midian','vegetation-moss']);
  for(const item of cases){
    for(const document of [item.baseline,item.improved,item.transferBaseline,item.transfer]){
      assert.equal(document.recipe.options.width,360);assert.equal(document.recipe.options.height,280);assert.equal(document.recipe.options.seed,20261120);
      assert.ok(['ink-stroke-groups-v1','ink-layer-process-v1'].includes(document.recipe.generator));
    }
    assert.notDeepEqual(item.sourceRecipe.features,item.transferSourceRecipe.features);
    assert.ok(item.baselineOrigin.startsWith('examples/'));
  }
  for(const id of ['rain-texture','bean-texture','moss-texture']){
    const item=cases.find(c=>c.id===id);
    assert.deepEqual(item.baseline.recipe.groups.filter(g=>g.role==='structure'),item.improved.recipe.groups.filter(g=>g.role==='structure'));
  }
  const nail=cases.find(c=>c.id==='nail-texture');
  assert.deepEqual(nail.baseline.recipe.layers.filter(l=>l.id!=='short-nails'),nail.improved.recipe.layers.filter(l=>l.id!=='short-nails'));
});

test('Mi layer control fixes anchors and timing while matching total raster pigment layer by layer',()=>{
  const control=createMiPointLayerControl();
  const a=control.baseline,b=control.improved;
  assert.equal(a.recipe.layers.length,2);assert.equal(b.recipe.layers.length,2);
  assert.deepEqual(a.recipe.options,b.recipe.options);
  assert.equal(a.recipe.options.seed,20261120);assert.equal(a.recipe.options.width,360);assert.equal(a.recipe.options.height,280);
  const mass=process=>rasterizeInkProcess(process,{time:8,cellSize:1}).density.reduce((sum,value)=>sum+value,0);
  for(let i=0;i<2;i++){
    const before=a.recipe.layers[i],after=b.recipe.layers[i];
    const {strokes:ignoredBefore,concentration:beforeConcentration,...beforeState}=before;
    const {strokes:ignoredAfter,concentration:afterConcentration,...afterState}=after;
    assert.deepEqual(beforeState,afterState);
    assert.deepEqual(before.strokes,after.strokes.filter(stroke=>stroke.options.id.endsWith('/part-0')));
    assert.equal(after.strokes.length,before.strokes.length*3);
    assert.ok(afterConcentration<beforeConcentration);
    const first=mass(createInkProcessDocument([before],a.recipe.options).result),second=mass(createInkProcessDocument([after],b.recipe.options).result);
    assert.ok(Math.abs(first-second)/Math.max(1,first)<2e-6);
  }
  const massA=mass(a.result),massB=mass(b.result);
  assert.ok(Math.abs(massA-massB)/massA<2e-6);
  for(const doc of [a,b]){
    const rebuilt=compileInkProcessRecipe(JSON.parse(JSON.stringify(doc.recipe)));
    assert.deepEqual(rebuilt,doc.result);
    assert.deepEqual(rasterizeInkProcess(rebuilt,{time:8,cellSize:1}).density,rasterizeInkProcess(doc.result,{time:8,cellSize:1}).density);
  }
});
