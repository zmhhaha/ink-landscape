import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { splitBristles } from '../dist/perturbation.js';
import { createStrokeGroupDocument, compileStrokeGroupRecipe } from '../dist/stroke-group-document.js';
import { createSplitTextureRevisionCases } from '../examples/split-texture-revision-fixtures.mjs';

const path = [{x:20,y:220,pressure:.3},{x:110,y:180,pressure:.85},{x:170,y:85,pressure:.7},{x:300,y:45,pressure:0}];
const options = {seed:377,spread:30,width:4,opacity:.82,variance:.5,spacing:3};
const dynamics = {...options,dynamics:'contact-lag-v1'};
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('split contact dynamics are explicit and omitted options retain the pinned previous output', () => {
  const original=splitBristles(path,7,options);
  assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),
    'cf181becc30e3b7bf16a0f0de969bd0df172c974e8b9a15cadd1b49bd67163a1');
  assert.deepEqual(splitBristles(path,7,{...options,dynamics:undefined}),original);
  assert.notDeepEqual(splitBristles(path,7,dynamics),original);
});

test('the new model retains a loaded central route and owns editable, unequal broken outer contacts', () => {
  const source=structuredClone(path), bundle=splitBristles(source,7,dynamics);
  assert.deepEqual(bundle,splitBristles(JSON.parse(JSON.stringify(path)),7,dynamics));
  assert.equal(bundle[0].id,'bristle-0');
  for(const p of path) assert.ok(bundle[0].points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-9&&Math.abs(p.pressure-q.pressure)<1e-9));
  assert.ok(bundle.slice(1).every(b=>b.width<bundle[0].width&&b.opacity<bundle[0].opacity));
  assert.ok(bundle.some(b=>b.id.includes('-part-')));
  assert.ok(bundle.slice(1).every(b=>b.points[0].pressure===0&&b.points.at(-1).pressure===0));
  assert.ok(Object.isFrozen(bundle)&&bundle.every(b=>Object.isFrozen(b)&&Object.isFrozen(b.points)&&b.points.every(Object.isFrozen)));
  source[0].x=-500;
  assert.equal(bundle[0].points[0].x,20);
  assert.ok(new Set(bundle.slice(1).map(b=>b.width)).size>4);
});

test('direction memory changes subsidiary contacts near a turn while preserving the main route', () => {
  const turn=[{x:20,y:30,pressure:.8},{x:120,y:30,pressure:.8},{x:120,y:180,pressure:.8}];
  const style={...dynamics,spread:42,release:0,breakup:0};
  const immediate=splitBristles(turn,7,{...style,lag:0}),lagged=splitBristles(turn,7,{...style,lag:32});
  assert.deepEqual(immediate[0],lagged[0]);
  let shift=0;
  for(let i=1;i<immediate.length;i++) for(let j=0;j<immediate[i].points.length;j++){
    const a=immediate[i].points[j],b=lagged[i].points[j];
    near(a.pressure,b.pressure);
    shift=Math.max(shift,Math.hypot(a.x-b.x,a.y-b.y));
  }
  assert.ok(shift>6,'the outer contact must retain a visibly different bearing near the turn');
});

test('outer spread responds to pressure and release rather than fixed parallel offsets', () => {
  const line=pressure=>[{x:0,y:100,pressure},{x:240,y:100,pressure}];
  const fixed={...dynamics,spread:40,breakup:0,release:0,variance:0};
  const light=splitBristles(line(.1),7,fixed),pressed=splitBristles(line(1),7,fixed);
  for(let i=1;i<light.length;i++) for(let j=0;j<light[i].points.length;j++){
    near(light[i].points[j].y-100,(pressed[i].points[j].y-100)*Math.pow(.1,.7));
  }
  const gathered=splitBristles(line(1),7,{...fixed,release:1});
  for(let i=1;i<gathered.length;i++){
    const last=gathered[i].points.at(-1),separate=pressed[i].points.at(-1);
    assert.ok(Math.abs(last.y-100)<Math.abs(separate.y-100)*.13);
  }
  assert.deepEqual(gathered[0],pressed[0]);
});

test('new contact geometry follows rigid rotation and preserves narrow explicit pressure lifts', () => {
  const source=[{x:0,y:30,pressure:.8},{x:73.1,y:30,pressure:.8},{x:73.3,y:30,pressure:0},
    {x:73.5,y:30,pressure:.8},{x:201,y:30,pressure:.8}];
  const a=splitBristles(source,6,dynamics),b=splitBristles(source.map(p=>({...p,x:300-p.y,y:20+p.x})),6,dynamics);
  for(let i=0;i<a.length;i++){
    assert.equal(a[i].id,b[i].id);assert.equal(a[i].points.length,b[i].points.length);
    for(let j=0;j<a[i].points.length;j++){
      near(b[i].points[j].x,300-a[i].points[j].y);near(b[i].points[j].y,20+a[i].points[j].x);
      near(a[i].points[j].pressure,b[i].points[j].pressure);
    }
  }
  assert.ok(a[0].points.some(p=>Math.abs(p.x-73.3)<1e-9&&p.pressure===0));
});

test('generated split groups rebuild from JSON and one edited member preserves all other marks', () => {
  const bundle=splitBristles(path,7,dynamics);
  const source={id:'contact',strokes:bundle.map(b=>({id:b.id,points:b.points,options:{width:b.width,opacity:b.opacity,duration:0}}))};
  const doc=createStrokeGroupDocument([source],{width:360,height:280,seed:377});
  assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(doc.recipe))),doc.result);
  const edited=JSON.parse(JSON.stringify(doc.recipe));
  edited.groups[0].strokes[1].points[1].y+=3;
  const result=compileStrokeGroupRecipe(edited);
  assert.notDeepEqual(result.marks[1],doc.result.marks[1]);
  doc.result.marks.forEach((mark,i)=>{if(i!==1)assert.deepEqual(result.marks[i],mark);});
});

test('the three existing-technique comparisons include changed-shape ordinary source and fixed ink organization', () => {
  const cases=createSplitTextureRevisionCases();
  assert.deepEqual(cases.flatMap(c=>c.techniques),['brush-split','leaf-broken','cun-baoshi']);
  for(const item of cases){
    for(const name of ['baseline','improved','transferBaseline','transfer']){
      const doc=item[name];assert.equal(doc.result.width,360);assert.equal(doc.result.height,280);
      assert.equal(doc.recipe.options.seed,20261120);
      assert.deepEqual(compileStrokeGroupRecipe(JSON.parse(JSON.stringify(doc.recipe))),doc.result);
    }
    assert.notDeepEqual(item.baseline.result,item.improved.result);
    assert.notDeepEqual(item.improved.result,item.transfer.result);
  }
  const rock=cases[2];
  for(const id of ['pale-surface','surface-bone','aggregate-points']){
    assert.deepEqual(rock.baseline.recipe.groups.find(g=>g.id===id),rock.improved.recipe.groups.find(g=>g.id===id));
  }
  for(const item of cases.slice(0,2)) assert.ok(item.authoring.originalPaths.length);
});

test('new dynamics validates its controls and bounds long/dense source before group compilation', () => {
  for(const extra of [{dynamics:'typo'},{lag:1},{release:1},{breakup:1},{dynamics:'contact-lag-v1',lag:-1},
    {dynamics:'contact-lag-v1',release:2},{dynamics:'contact-lag-v1',breakup:NaN}]){
    assert.throws(()=>splitBristles(path,7,{...options,...extra}));
  }
  const large=splitBristles([{x:0,y:0},{x:1e8,y:0}],64,{...dynamics,spacing:.01});
  assert.ok(large.reduce((sum,b)=>sum+b.points.length,0)<=100000);
  assert.ok(large.every(b=>b.points.length<=4096));
  assert.ok(large.flatMap(b=>b.points).every(p=>Object.values(p).every(Number.isFinite)));
});
