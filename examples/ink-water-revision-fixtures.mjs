import { createInkProcessDocument, rasterizeInkProcess } from '../dist/ink-process.js';
import { createWaterProcessDocument } from '../dist/water-process.js';
import { makeInkStudies } from './ink-fixtures.mjs';
import { makeWaterStudies } from './water-fixtures.mjs';

export const INK_WATER_REVISION_OPTIONS={width:360,height:280,seed:20261120,background:'#f5f2e9',ink:'#20251f'};
const copy=value=>JSON.parse(JSON.stringify(value));
function fit(document,model=false){
  const recipe=copy(document.recipe), field=recipe.layers?'layers':'events';
  const sx=360/recipe.options.width,sy=240/recipe.options.height;
  const point=p=>({...p,x:p.x*sx,y:p.y*sy+20});
  recipe[field]=recipe[field].map(item=>({...item,
    ...(item.strokes?{strokes:item.strokes.map(stroke=>({...stroke,points:stroke.points.map(point),options:{...stroke.options,
      width:(stroke.options?.width??24)*sx,...(stroke.options?.clip?{clip:stroke.options.clip.map(point)}:{})}}))}:{}),
    ...(item.droplets?{droplets:item.droplets.map(drop=>({...point(drop),radius:drop.radius*sx}))}:{}),
  }));
  return build(recipe[field],field,{...INK_WATER_REVISION_OPTIONS,...(model?{wetModel:'settling-v1'}:{})});
}
function build(source,field,options){return field==='layers'?createInkProcessDocument(source,options):createWaterProcessDocument(source,options);}
function select(items,id,variant){return items.find(item=>item.id===id).variants.find(item=>item.id===variant).document;}
function pair(layout,id){
  const ink=makeInkStudies({layout,seed:20261120}),water=makeWaterStudies({layout,seed:20261120});
  if(id==='layered'){
    const baseline=fit(select(ink,'layered','repeated'));
    const selective=fit(select(ink,'layered','selective'));
    const layers=selective.recipe.layers.map((layer,index)=>({...layer,concentration:[.18,.42,.86][index],
      edgeDeposit:index===0?.18:.52,edgeWidth:.24,
      strokes:layer.strokes.map(stroke=>({...stroke,options:{...stroke.options,
        controls:[{at:0,inkLoad:1,dryness:.2+index*.17},{at:.48,inkLoad:.91-index*.08,dryness:.26+index*.16},
          {at:1,inkLoad:.76-index*.12,dryness:.35+index*.18}]}})),
    }));
    return [baseline,createInkProcessDocument(layers,{...INK_WATER_REVISION_OPTIONS,wetModel:'settling-v1'})];
  }
  if(id==='broken'){
    const baseline=fit(select(ink,'broken','wet'));
    return [baseline,createInkProcessDocument(baseline.recipe.layers,{
      ...INK_WATER_REVISION_OPTIONS,wetModel:'settling-v1'})];
  }
  if(id==='water-after'||id==='ink-after'){
    const base=fit(select(water,id,id==='water-after'?'wet':'prewet'));
    return [base,createWaterProcessDocument(base.recipe.events,{...INK_WATER_REVISION_OPTIONS,wetModel:'settling-v1'})];
  }
  // A local collision across a leaf-shaped wet contact. Both columns receive
  // exactly the same pigment, water contacts and event order.
  const source=fit(select(water,'water-after','wet'));
  const events=source.recipe.events.map(event=>event.kind==='water'?{
    ...event,strokes:undefined,droplets:[{id:'left-lip',x:layout==='arc'?145:159,y:layout==='arc'?142:134,radius:17},
      {id:'right-lip',x:layout==='arc'?183:201,y:layout==='arc'?157:149,radius:11}],
  }:event);
  return [createWaterProcessDocument(events,INK_WATER_REVISION_OPTIONS),
    createWaterProcessDocument(events,{...INK_WATER_REVISION_OPTIONS,wetModel:'settling-v1'})];
}
const labels=[
  ['layered','积墨',['ink-layered'],'后层从原位覆盖改为沿暗面递加，含墨沿程降低，较干层只咬住局部边缘，保留第一层亮隙。','组织、枯润和边带同时变化；不是等墨量单变量。'],
  ['broken','破墨',['ink-broken'],'保持两次落墨路径与浓淡顺序，只有尚未沉积的部分参与交界交换，已沉积墨保留原位。','有限事件交换，不表示真实墨粒或流体。'],
  ['water-after','水破墨',['water-break-ink'],'清水只带动仍可移动的底墨；湿窗后段作用减弱，水线由移动墨在局部前沿停留。','没有白色覆盖、擦除或凭空描黑；湿窗由作者声明。'],
  ['ink-after','墨破水',['ink-break-water'],'预湿本身不可见；相同墨笔进入湿域后，一部分留骨，一部分受纸性和局部湿度迁移。','比较先水后墨的程序近似；不等同真实向内化墨。'],
  ['collision','撞水',['water-collision'],'局部水触冲开尚湿墨，边缘停墨不闭成均匀黑圈；保留已沉积的暗部骨架。','局部水接触研究，不推定撞击速度或真实水量。'],
];

export function createInkWaterRevisionCases(){return labels.map(([id,title,techniques,observation,limits])=>{
  const [baseline,improved]=pair('ridge',id),[transferBaseline,transfer]=pair('arc',id);
  return {id:'ink-'+id,title,family:'ink',techniques,baseline,improved,transferBaseline,transfer,observation,limits,
    changedVariable:id==='layered'?'后层组织、含墨、枯润与内缘沉积':'仅切换 wetModel: settling-v1，其他编辑源相同',
    sourceRecipe:improved.recipe,transferSourceRecipe:transfer.recipe};
});}

/** Fixed paths/amounts, three authored stages; diagnostics are event-time state. */
export function createWetStageComparisons(){
  const record=createInkWaterRevisionCases().find(item=>item.id==='ink-water-after');
  return [.15,1.2,3].map(at=>{
    const events=record.improved.recipe.events.map(event=>event.kind==='water'?{...event,at}:event);
    const document=createWaterProcessDocument(events,record.improved.recipe.options);
    const frame=rasterizeInkProcess(document.result,{cellSize:1.5,time:8});
    const sum=values=>values.reduce((a,b)=>a+b,0);
    return {at,document,pigment:sum(frame.density),mobile:sum(frame.mobileDensity),settled:sum(frame.settledDensity),interactions:frame.interactions};
  });
}
