import { createSurfaceCunDocument } from '../dist/surface-cun.js';
import { createCunDocument } from '../dist/cun-document.js';
import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';

export const LINE_TEXTURE_REVISION_OPTIONS = Object.freeze({ width: 360, height: 280, seed: 20261120,
  background: '#f5f2e9', ink: '#30352d' });
const P = values => values.map(([x,y,pressure=.82]) => ({x,y,pressure}));
const R = values => values.map(([x,y]) => ({x,y}));
const shape = R([[47,238],[71,152],[109,106],[147,57],[197,79],[225,111],[290,128],[315,192],[304,241],[231,250],[139,244]]);
const flow = P([[150,63],[140,98],[127,140],[107,181],[75,229]]);
const fracture = P([[150,65],[176,99],[198,132],[218,175],[242,231]]);
const ledge = P([[69,123],[124,95],[186,104],[234,128],[290,155]]);
const reserve = R([[198,99],[221,121],[274,137],[286,177],[242,178],[211,156]]);
const titles = {pima:'披麻 · 长线随坡',jiesuo:'解索 · 屈曲顺脉',niumao:'牛毛 · 细短成簇',axe:'斧劈 · 断面浓提',zhedai:'折带 · 横行随层'};
const ids = {pima:'cun-pima',jiesuo:'cun-jiesuo',niumao:'cun-niumao',axe:'cun-axe',zhedai:'cun-zhedai'};
const width = {pima:3.9,jiesuo:3.3,niumao:1.8,axe:15,zhedai:8};
const observations = {
  pima:'长线沿主坡转向，暗脉处长短交搭，右上亮面留空；同笔数比较方向与墨色主次。',
  jiesuo:'屈曲由沿坡路径与两段不同频率的连续扰动构成，穿插集中在暗脉，不把全石铺成同幅波纹。',
  niumao:'短细线按岩脉分为数簇，簇间保留纸白，较浓短线只提局部转折。',
  axe:'作者提供断面边线，侧锋短劈集中在断缘内侧；少量浓提与淡枯笔相接。',
  zhedai:'横向层理导引折带，横行与短折落随各层转向，后层较淡，避免等长阶梯排满石面。',
};
function sites(technique) {
  const count = technique === 'niumao' ? 28 : technique === 'axe' ? 12 : technique === 'zhedai' ? 10 : 14;
  return Array.from({length:count},(_,i)=>{
    const band = i%4, cluster = Math.floor(i/4);
    let at, offset, length;
    if(technique==='zhedai') {
      at=[.03,.2,.42,.61,.13,.34,.55,.09,.29,.46][i];
      offset=[0,5,12,13,31,39,43,64,70,76][i];
      length=[76,92,70,63,98,78,62,69,83,60][i];
    } else if(technique==='axe') {
      at=[.03,.09,.18,.28,.34,.42,.51,.57,.64,.72,.79,.85][i];
      offset=[5,20,8,14,29,9,6,25,11,17,4,20][i];
      length=[41,37,49,44,33,45,48,30,44,40,35,29][i];
    } else if(technique==='niumao') {
      at=.07+cluster*.115+band*.018;
      offset=[-4,-12,-23,-34][band] + (cluster%2?5:0);
      length=[24,29,20,27][band] - (cluster%3)*1.5;
    } else {
      at=[.02,.07,.13,.21,.31,.43,.49,.56,.66,.17,.28,.38,.53,.68][i];
      offset=[-2,-15,-29,-39,-8,-23,-44,-14,-33,-60,-70,-55,-65,-52][i];
      length=[126,112,110,92,105,82,75,65,51,75,68,61,50,42][i];
    }
    return {id:'mark-'+i,at,offset,length,width:width[technique]*([1,.92,1.08,.88][i%4]),
      tone:i%7===0?'accent':i%3===0?'wash':'body'};
  });
}
function source(technique, transfer) {
  const surface = {id:'rock-face',region:shape,flow:technique==='zhedai'?ledge:flow,
    fracture,reserves:[reserve],sites:sites(technique)};
  if(!transfer)return surface;
  return {...surface,region:surface.region.map(move),flow:surface.flow.map(move),fracture:surface.fracture.map(move),
    reserves:surface.reserves.map(region=>region.map(move)),
    sites:surface.sites.map(site=>({...site,offset:site.offset*.82,length:site.length*.85,width:site.width*.9}))};
}
function move(p) {return {...p,x:55+(p.x-55)*.92+(p.y-140)*.31,y:68+(p.y-65)*.7+(p.x-180)*.12};}
function bones(transfer) {
  const paths=[P([[47,238,.2],[71,152,.55],[109,106,.6],[147,57,.8],[197,79,.4],[225,111,.2]]),
    P([[225,111,.2],[290,128,.45],[315,192,.6],[304,241,.1]]),
    P([[150,65,.2],[176,99,.5],[198,132,.6],[218,175,.2],[242,231,0]]),
    P([[61,234,.1],[139,244,.3],[231,250,.4],[302,241,0]])];
  return [{id:'shared-rock-bones',role:'structure',strokes:paths.map((points,i)=>({id:'bone-'+i,
    points:transfer?points.map(move):points,options:{width:i===2?2.2:2.7,opacity:i===2?.46:.63,dryness:.58,
      axis:'center',smoothing:'linear',duration:0}}))}];
}
function ordinary(document,transfer) {
  return createStrokeGroupDocument([...bones(transfer),...document.groups],LINE_TEXTURE_REVISION_OPTIONS);
}
function baseline(technique,transfer) {
  const siteData=sites(technique), count=siteData.length;
  const strokes=siteData.map((site,i)=>{
    const columns=technique==='niumao'?7:technique==='axe'?4:technique==='zhedai'?5:7;
    const row=Math.floor(i/columns), col=i%columns;
    const x=77+col*(technique==='niumao'?28:technique==='zhedai'?42:technique==='axe'?52:29);
    const y=technique==='niumao'?115+row*29:technique==='axe'?102+row*43:technique==='zhedai'?113+row*65:105+row*67;
    const l=technique==='niumao'?site.length:technique==='axe'?site.length:technique==='zhedai'?site.length*.62:70;
    let points=technique==='zhedai'?P([[x,y,.3],[x+l*.6,y,.8],[x+l*.6,y+17,.7],[x+l,y+17,0]])
      : technique==='axe'?P([[x,y,.5],[x+10,y+l*.3,1],[x+13,y+l,0]])
      : technique==='jiesuo'?P([[x,y,.3],[x+7,y+l*.25,.85],[x-6,y+l*.53,.6],[x+8,y+l*.74,.8],[x,y+l,0]])
      : P([[x,y,.3],[x+5,y+l*.45,.88],[x-2,y+l*.77,.6],[x,y+l,0]]);
    if(transfer)points=points.map(move);
    return {id:site.id,points,options:{width:site.width*(transfer ? .9 : 1),opacity:({wash:.24,body:.53,accent:.88}[site.tone]),
      dryness:site.tone==='wash'?.77:technique==='axe'?.65:.55,clip:transfer?shape.map(move):shape,duration:0}};
  });
  const cun=createCunDocument(strokes,{...LINE_TEXTURE_REVISION_OPTIONS,technique});
  const group={id:'baseline/'+technique,role:'mark',strokes:cun.result.marks.map(mark=>({id:mark.id,points:mark.points,
    options:{width:mark.width,opacity:mark.opacity,dryness:mark.dryness,ink:mark.ink,
      smoothing:mark.smoothing,axis:'center',controls:mark.brush.controls,clip:mark.clip,duration:0,gestureModel:'local-v1'}}))};
  if(group.strokes.length!==count)throw Error('Line revision baseline budget mismatch');
  return createStrokeGroupDocument([...bones(transfer),group],LINE_TEXTURE_REVISION_OPTIONS);
}
export function createLineTextureRevisionCases() {
  return ['pima','jiesuo','niumao','axe','zhedai'].map(technique=>{
    const improved=createSurfaceCunDocument([source(technique,false)],{...LINE_TEXTURE_REVISION_OPTIONS,technique,idPrefix:'revision/'+technique});
    const transfer=createSurfaceCunDocument([source(technique,true)],{...LINE_TEXTURE_REVISION_OPTIONS,technique,idPrefix:'revision/'+technique});
    return {id:technique,title:titles[technique],family:'lines',techniques:[ids[technique]],
      baseline:baseline(technique,false),improved:ordinary(improved,false),
      transferBaseline:baseline(technique,true),transfer:ordinary(transfer,true),
      sourceRecipe:improved.recipe,transferSourceRecipe:transfer.recipe,
      observation:observations[technique],
      limits:'基线为旧cun接触上的均匀作者笔组，非历史截图；同一对保持轮廓、骨线、种子、主笔数、逐笔宽度和墨色角色，改动方向、位置、长度、留白约束。换形还缩放长度与横距。名称是程序近似，仍待艺术评价。'};
  });
}
