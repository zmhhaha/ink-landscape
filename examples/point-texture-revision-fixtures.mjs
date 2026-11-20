import { createPointTextureDocument } from '../dist/point-texture.js';
import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';
import { createInkProcessDocument, rasterizeInkProcess } from '../dist/ink-process.js';
import { makeBranchCunStudies } from './branch-cun-fixtures.mjs';
import { makeVegetationStudies } from './vegetation-fixtures.mjs';
import { remainingInkBatches } from './remaining-ink-fixtures.mjs';

export const POINT_TEXTURE_REVISION_OPTIONS = Object.freeze({width:360,height:280,seed:20261120,background:'#f5f2e9',ink:'#252820'});
const pts = values => values.map(([x,y,pressure=.7])=>({x,y,pressure}));
const vectors = values => values.map(([x,y])=>({x,y}));
const scale=.64;
const normalize=p=>({...p,x:p.x*scale,y:p.y*scale+55});
const changeShape=p=>({...p,x:180+(p.x-180)*.88+(p.y-145)*.22,y:145+(p.y-145)*.96-(p.x-180)*.16});
const common=POINT_TEXTURE_REVISION_OPTIONS;
function moveStroke(stroke,move,widthScale=1){return {...stroke,points:stroke.points.map(move),options:{...stroke.options,
  ...(stroke.options?.width===undefined?{}:{width:stroke.options.width*widthScale}),
  ...(stroke.options?.clip?{clip:stroke.options.clip.map(move)}:{}),
}};}
function transformDocument(document,move,widthScale=1){
  const recipe=document.recipe;
  if(recipe.groups)return createStrokeGroupDocument(recipe.groups.map(g=>({...g,strokes:g.strokes.map(s=>moveStroke(s,move,widthScale))})),common);
  return createInkProcessDocument(recipe.layers.map(l=>({...l,strokes:l.strokes.map(s=>moveStroke(s,move,widthScale))})),common);
}
function pointsFromCun(document){return document.recipe.strokes.map(s=>({...s,options:{...s.options,gestureModel:'local-v1'}}));}
const ROCK = vectors([[52,197],[67,153],[100,134],[128,95],[161,104],[178,132],[217,123],[249,151],[297,173],[313,198]]);
const structure = [{id:'shared-rock-structure',role:'structure',strokes:[
  {id:'ridge',points:ROCK.slice(0,7).map(p=>({...p,pressure:.58})),options:{width:1.6,opacity:.65,dryness:.61,smoothing:'catmull-rom',duration:0}},
  {id:'right',points:ROCK.slice(6).map((p,i)=>({...p,pressure:i===3?.1:.48})),options:{width:1.4,opacity:.53,dryness:.61,smoothing:'catmull-rom',duration:0}},
  {id:'fracture',points:pts([[128,96,.1],[132,126,.68],[153,145,.52],[157,174,.35],[183,198,.1]]),options:{width:1.2,opacity:.56,dryness:.64,duration:0}},
]}];
const region=vectors([[49,213],[60,123],[89,79],[165,76],[188,107],[239,101],[315,166],[326,223]]);
const reserve=vectors([[160,106],[176,107],[191,135],[191,153],[174,147],[160,129]]);
function feature(id,technique,guide,sites,extra={}){
  return {id,technique,guide:pts(guide.map(([x,y])=>[x,y,1])),sites:sites.map(([id,at,count,size,spread,opacity,offset])=>({id,at,count,size,spread,opacity,...(offset===undefined?{}:{offset})})),
    clip:region,reserves:[reserve],...extra};
}
function rockFeatures(technique){return [
  feature('near-fracture',technique,[[115,121],[98,151],[113,177],[140,189]],
    [['upper',.08,5,7.2,23,.85],['turn',.34,5,7.3,24,.78],['lower',.65,5,7.8,24,.86],['foot',.91,4,6.8,23,.66]],{direction:{x:.1,y:1}}),
  feature('far-face',technique,[[208,151],[243,177],[280,196]],
    [['rear',.12,6,5.8,24,.46],['middle',.5,5,6.3,24,.51],['low',.87,4,5.6,24,.4]],{direction:{x:.16,y:1}}),
];}
function mossFeatures(){return [
  feature('upper-ridge','moss',[[44.16,197.08],[75.52,149.72],[120.32,99.16],[160.64,115.16],[196.48,153.56]],
    [['turn',.22,5,5.9,20,.76],['peak',.57,8,6.4,23,.93],['shoulder',.85,7,5.8,22,.7]],{side:1,reserves:[]}),
  feature('rear-ridge','moss',[[196.48,153.56],[224.64,140.12],[256,137.56],[304,180.44]],
    [['rear',.32,8,5.2,22,.68],['lower',.77,7,4.8,23,.54]],{side:1,reserves:[]}),
];}
function nailFeatures(){return [
  feature('fracture-nails','nail',[[123,147],[169,178],[230,198]],
    [['upper',.12,5,8.3,23,.78],['shadow',.55,10,9.2,26,.86],['lower',.9,5,7.1,24,.64]],{direction:{x:.3,y:1}}),
];}
function miFeatures(){return [
  feature('far-cloud-mountain','mi',[[83,130],[112,115],[156,151]],
    [['far-top',.17,6,8,25,.57],['far-middle',.45,6,8.6,28,.58],['far-lower',.84,6,9.8,26,.53]],{direction:{x:1,y:.04},clip:region,reserves:[]}),
  feature('near-cloud-mountain','mi',[[175,168],[213,155],[263,188]],
    [['near-top',.21,8,10.8,28,.81],['near-middle',.5,8,11.6,31,.87],['near-lower',.85,8,12.6,30,.76]],{direction:{x:1,y:.07},clip:region,reserves:[]}),
];}
function moveFeatures(features,move){return features.map(f=>({...f,guide:f.guide.map(move),
  ...(f.clip?{clip:f.clip.map(move)}:{}),...(f.reserves?{reserves:f.reserves.map(p=>p.map(move))}:{}),
}));}
function toOrdinary(semantic,bones=structure){return createStrokeGroupDocument([...bones,...semantic.groups],common);}
function toMiProcess(semantic){
  return createInkProcessDocument(semantic.groups.map((group,i)=>({id:group.id,
    strokes:group.strokes.map(stroke=>({points:stroke.points,options:{id:stroke.id,...stroke.options,ink:undefined,duration:undefined}})).map(s=>({points:s.points,options:Object.fromEntries(Object.entries(s.options).filter(([key,value])=>!['duration','start','ink'].includes(key)&&value!==undefined))})),
    at:i<3?i*.12:2.8+(i-3)*.18,concentration:i<3?.27:.55,water:i<3?.8:.76,dryAfter:1.6,mode:'wet-mix',edgeSoftness:.35,edgeDeposit:.12,
  })),common);
}

/** Original studies supply the left column; this function does not mutate them. */
export function createPointTextureRevisionCases(){
  const oldPoint=makeBranchCunStudies({seed:common.seed}).find(s=>s.id==='point').variants.find(v=>v.id==='clustered').document;
  const oldMoss=makeVegetationStudies({seed:common.seed}).find(s=>s.id==='moss').variants.at(-1).document;
  const wet=remainingInkBatches.find(b=>b.number===20).make({seed:common.seed}).find(s=>s.id==='midian').variants.find(v=>v.id==='organized').document;
  const nail=remainingInkBatches.find(b=>b.number===21).make({seed:common.seed}).find(s=>s.id==='dingtou').variants.find(v=>v.id==='organized').document;
  const normalizedPoints=createStrokeGroupDocument([{id:'previous-authored-points',role:'mark',strokes:pointsFromCun(oldPoint).map(s=>moveStroke(s,normalize,scale))}],common);
  const withBones=document=>createStrokeGroupDocument([...structure,...document.recipe.groups],common);
  const normalizedMoss=createStrokeGroupDocument(oldMoss.recipe.units.map(unit=>({id:unit.id,role:unit.role??'mark',
    strokes:unit.strokes.map(stroke=>moveStroke({...stroke,options:{...stroke.options,gestureModel:'local-v1'}},normalize,scale)),
  })),common);
  const definitions=[
    {id:'rain-texture',title:'雨点 · 依裂聚散',technique:'rain',ids:['cun-yudian'],features:rockFeatures('rain'),baseline:withBones(normalizedPoints),
      origin:'examples/branch-cun-fixtures.mjs: point / clustered',observation:'保持旧研究的同一石形与34个点位预算，将显式散点转成沿裂口的重、淡点群，亮面留空。',limits:'雨点与豆瓣的传统名称关系仍部分支持；本次以同源短点的方向、按腹和组织作比较，不将尺寸阈值当成历史定义。'},
    {id:'bean-texture',title:'豆瓣 · 按腹与暗面',technique:'bean',ids:['cun-douban'],features:rockFeatures('bean'),baseline:withBones(normalizedPoints),
      origin:'examples/branch-cun-fixtures.mjs: point / clustered',observation:'使用同一结构与点数，把较宽短按触集中在暗部转折；辅点更淡、点群之间留气。',limits:'较宽接触是本次作者选择，与雨点共享资料与原语，不声称两个互斥的传统预设。'},
    {id:'nail-texture',title:'钉头 · 裂隙暗部短皴',technique:'nail',ids:['cun-dingtou'],features:nailFeatures(),baseline:transformDocument(nail,normalize,scale),
      origin:'examples/remaining-ink-fixtures.mjs: dingtou / organized',observation:'保留原先重头提尾的接触和20笔预算，改为沿同一裂隙的三簇疏密与不同墨色，亮侧不补点。',limits:'钉头阅读仍是教学近似；方向与聚散是可编辑作者控制，不作为传统技法已验收的结论。'},
    {id:'mi-texture',title:'米点 · 湿横接触与层间留白',technique:'mi',ids:['cun-midian'],features:miFeatures(),baseline:transformDocument(wet,normalize,scale),
      origin:'examples/remaining-ink-fixtures.mjs: midian / organized',observation:'沿远近山势组织两层点群，每个点由3笔含水横触穿插，组间留出云隙，近层浓而大。',limits:'同时改动点群路径、点数、尺度和墨层组织；有限湿态交换不等于真实纸内流动。'},
    {id:'moss-texture',title:'点苔 · 岩脊内偏与聚散',technique:'moss',ids:['vegetation-moss'],features:mossFeatures(),baseline:normalizedMoss,
      origin:'examples/vegetation-fixtures.mjs: moss / organized',observation:'沿同一岩脊向内偏移，顶折处聚点、低处轻疏，不用整面噪点替代石面结构。',limits:'自动生成仅限作者指定的岩脊与落点组；不推断完整光照或山石类型。'},
  ];
  return definitions.map(item=>{
    const options={...common,idPrefix:item.id};
    const source=createPointTextureDocument(item.features,options);
    const transferred=createPointTextureDocument(moveFeatures(item.features,changeShape),options);
    let improved,transfer;
    if(item.technique==='mi'){improved=toMiProcess(source);transfer=toMiProcess(transferred);}
    else if(item.technique==='nail'){
      // Preserve the old contours and wash source, replace only its point layer.
      const replace=(base,semantic)=>createInkProcessDocument(base.recipe.layers.map(layer=>layer.id!=='short-nails'?layer:{...layer,
        strokes:semantic.groups.flatMap(g=>g.strokes.map(s=>({points:s.points,options:{id:g.id+'/'+s.id,...Object.fromEntries(Object.entries(s.options).filter(([key])=>!['ink','duration','start'].includes(key)))}}))),
      }),common);
      improved=replace(item.baseline,source);transfer=replace(transformDocument(item.baseline,changeShape),transferred);
    }else {
      const bones=item.technique==='moss'?item.baseline.recipe.groups.filter(g=>g.role==='structure'):structure;
      improved=toOrdinary(source,bones);
      transfer=toOrdinary(transferred,bones.map(g=>({...g,strokes:g.strokes.map(s=>moveStroke(s,changeShape))})));
    }
    return {id:item.id,title:item.title,family:'points',techniques:item.ids,baseline:item.baseline,improved,
      transferBaseline:transformDocument(item.baseline,changeShape),transfer,
      sourceRecipe:source.recipe,transferSourceRecipe:transferred.recipe,baselineOrigin:item.origin,
      observation:item.observation,limits:item.limits};
  });
}

/** Same anchors and pigment budget: one filled touch versus three wet overlaps. */
export function createMiPointLayerControl(){
  const source=createPointTextureDocument(miFeatures(),{...common,idPrefix:'mi-equal-pigment-control'});
  const inkStroke=(group,stroke)=>({points:stroke.points,options:{id:group.id+'/'+stroke.id,
    ...Object.fromEntries(Object.entries(stroke.options).filter(([key])=>!['ink','duration','start'].includes(key))),
  }});
  const layers=['far-cloud-mountain','near-cloud-mountain'].map((feature,index)=>({
    id:index===0?'mi-control-far':'mi-control-near',
    strokes:source.groups.filter(group=>group.id.includes(feature)).flatMap(group=>group.strokes.map(stroke=>inkStroke(group,stroke))),
    concentration:index===0?.27:.55,at:index===0?0:1.1,water:.78,dryAfter:2.2,mode:'wet-mix',
    edgeSoftness:.35,edgeDeposit:.12,
  }));
  const baselineLayers=layers.map(layer=>({...layer,strokes:layer.strokes.filter(stroke=>stroke.options.id.endsWith('/part-0'))}));
  const mass=layer=>rasterizeInkProcess(createInkProcessDocument([layer],common).result,{time:8,cellSize:1}).density.reduce((sum,value)=>sum+value,0);
  const normalization=[];
  const improvedLayers=layers.map((layer,index)=>{
    const target=mass(baselineLayers[index]),raw=mass(layer);
    const concentration=layer.concentration*target/raw;
    normalization.push({id:layer.id,cellSize:1,baselineMass:target,rawOverlapMass:raw,
      baselineConcentration:baselineLayers[index].concentration,overlapConcentration:concentration});
    return {...layer,concentration};
  });
  return {title:'米点控制 · 同锚点、同颜料量的单触与三触',
    baseline:createInkProcessDocument(baselineLayers,common),improved:createInkProcessDocument(improvedLayers,common),
    observation:'固定42个米点锚点、点向、种子、远近两层时序与含水量；左侧每点仅主触，右侧同点加入两笔相交湿横触。每层在cellSize=1的密度栅格下校准浓度，使总颜料量相等，比较积染形态而非加墨次数。',
    limits:'这是固定后端、固定cellSize=1的光学密度总量对照；补笔会改变局部墨色与接触范围，不代表真实液体质量或传统技法验收。浓度校准不能直接推广到其他栅格尺度。',
    normalization,
  };
}
