import { createRockForm, createRockDocument, createRockMacro, createStrokeGroupDocument } from '../dist/index.js';

const frame=Object.freeze({width:420,height:360,seed:20261120,background:'#f5f2e9',ink:'#252820'});
const image='https://yihua.art/wp-content/uploads/2022/02/jzycjwjkx-5.jpg';
const point=(x,y,pressure=.75)=>({x,y,pressure});
const path=values=>values.map(([x,y,p=.75])=>point(x,y,p));
const poly=values=>values.map(([x,y])=>({x,y}));
const mainForms=[
  {id:'upright',title:'立石 · 窄顶、转面与基脚',pose:'upright',size:285,position:{x:105,y:29},seed:20261120},
  {id:'reclining',title:'卧石 · 低脊与横展石势',pose:'reclining',size:350,position:{x:31,y:102},seed:20261120},
  {id:'leaning',title:'斜石 · 偏势与落脚',pose:'leaning',size:287,position:{x:85,y:43},seed:20261120},
];
// Registered before looking at the transfer render. This source has four
// independent faces and a paper opening, not a transformed main-study mesh.
const custom={
  outline:poly([[40,289],[66,214],[71,132],[121,94],[156,36],[226,61],[247,111],[302,153],[326,248],[295,292],[180,309]]),
  ridges:[{id:'front-fold',points:path([[171,133,.3],[152,206,.85],[180,309,0]])},
    {id:'cap-fold',points:path([[71,132,.2],[171,133,.7],[247,111,0]])},
    {id:'lower-layer',points:path([[152,206,.3],[260,218,.8],[302,153,0]])}],
  faces:[
    {id:'custom-cap',region:poly([[71,132],[121,94],[156,36],[226,61],[247,111],[171,133]]),
      flow:path([[154,63],[181,96],[171,127]]),tone:'light'},
    {id:'custom-front',region:poly([[40,289],[66,214],[71,132],[171,133],[152,206],[180,309]]),
      flow:path([[115,143],[114,194],[98,244],[111,293]]),tone:'middle',
      fractures:[{id:'front-scar',points:path([[83,171,.3],[101,181,.8],[92,210,0]])}],
      reserves:[poly([[111,204],[133,198],[140,208],[118,217]])]},
    {id:'custom-right',region:poly([[171,133],[247,111],[302,153],[260,218],[152,206]]),
      flow:path([[211,127],[223,167],[244,207]]),tone:'dark',
      fractures:[{id:'right-notch',points:path([[207,145,.3],[205,172,.9],[227,189,0]])}]},
    {id:'custom-foot',region:poly([[152,206],[260,218],[302,153],[326,248],[295,292],[180,309]]),
      flow:path([[254,226],[269,253],[271,289]]),tone:'middle',
      fractures:[{id:'foot-scar',points:path([[209,233,.2],[226,254,.7],[220,283,0]])}]},
  ],
};
function diagram(structure,seed){
  const colors=['#a0814b','#4f7b70','#68618c','#9d7058'];
  const line=(id,points,ink,width=2)=>({id,points,options:{ink,width,opacity:.76,dryness:.12,
    gestureModel:'local-v1',axis:'center',smoothing:'linear',duration:0}});
  const groups=[{id:'diagram-outline',role:'structure',strokes:[line('outline',
    [...structure.outline,structure.outline[0]].map(p=>({...p,pressure:.65})),'#6f746b')]},
    {id:'diagram-ridges',role:'structure',strokes:structure.ridges.map(r=>line(r.id,r.points,'#985744',2.8))}];
  for(const [i,face] of structure.faces.entries()){
    const a=face.flow.at(-2),b=face.flow.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y),tx=(b.x-a.x)/length,ty=(b.y-a.y)/length;
    const arrow=[point(b.x-tx*10-ty*5,b.y-ty*10+tx*5,.7),point(b.x,b.y,.8),point(b.x-tx*10+ty*5,b.y-ty*10-tx*5,0)];
    groups.push({id:'diagram-face-'+face.id,role:'mark',strokes:[line('boundary',
      [...face.region,face.region[0]].map(p=>({...p,pressure:.48})),colors[i%colors.length],1.4),
      line('flow',face.flow,colors[i%colors.length],3),line('arrow',arrow,colors[i%colors.length],2),
      ...(face.reserves??[]).map((reserve,j)=>line('reserve-'+j,[...reserve,reserve[0]].map(p=>({...p,pressure:.7})),'#af8252',2)),
    ]});
  }
  return createStrokeGroupDocument(groups,{...frame,seed});
}
function study(form){
  const {id,title,seed,structure:authored,...layout}=form;
  const geometry=authored??createRockForm({...layout,seed});
  const options={...frame,seed,idPrefix:'stone',detail:2,structure:geometry};
  const axe=createRockDocument({...options,technique:'axe'});
  const jiesuo=createRockDocument({...options,technique:'jiesuo'});
  const baseline=createStrokeGroupDocument(createRockMacro({id:'stone',seed,ink:frame.ink,
    outline:geometry.outline,ridges:geometry.ridges,textureCount:24,moss:false}).groups,{...frame,seed});
  return {id,title,baseline,axe:createStrokeGroupDocument(axe.groups,{...frame,seed}),
    jiesuo:createStrokeGroupDocument(jiesuo.groups,{...frame,seed}),structure:diagram(geometry,seed),
    generation:{seed,layout:authored?'caller-authored-four-face':layout,detail:2,moss:false},
    originalSemanticRecipes:{axe:axe.recipe,jiesuo:jiesuo.recipe},
    observation:'同一轮廓与骨线：旧宏为通用侧锋碎面，新法分别按石面、断缘、亮面和局部裂隙组织。结构列赭线为骨线、有色箭头为坡向。',
    limits:'旧宏没有解索选项，同一旧输出分别与两种新法比较；笔量、接触与组织同时改变。结构源保留在originalSemanticRecipes，页面逐笔编辑只更新当前普通配方。木刻图式不作纸笔物理测量，艺术效果待评价。',
    evidence:[{title:'《芥子园画传》公开图5（以画雅集二次分发）',url:image,
      locator:'左大斧劈法、右解索皴法；版次及普林斯顿归属未独立核验'}],
  };
}
export function createStructuredRockStudies(){return mainForms.map(study);}
export function createRockTransferStudies(){return [
  study({id:'registered-seed',title:'换种子 · 9137斜石（预登记）',pose:'leaning',position:{x:91,y:44},size:280,seed:9137}),
  study({id:'caller-four-face',title:'自供结构 · 四面石与纸白口',structure:custom,seed:60421}),
];}
