import { createTreeMacro,createRockMacro,createBirdMacro } from '../dist/subject-macros.js';
import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';
import { renderCanvas } from '../dist/canvas.js';

const seed=821731, width=400,height=340;
const examples=[
  {name:'树：有界递归分枝 · 压力收尖',macro:createTreeMacro({id:'tree-study',seed,start:{x:206,y:318},size:143,width:14,depth:3,style:'dry'})},
  {name:'石：自定折角岩脊 · 皴擦与点苔',macro:createRockMacro({id:'rock-study',seed,position:{x:200,y:240},size:173,
    outline:[{x:65,y:275},{x:102,y:161},{x:167,y:79},{x:216,y:111},{x:245,y:95},{x:307,y:183},{x:343,y:282}],
    ridges:[{id:'fold',points:[{x:169,y:83,pressure:.4},{x:181,y:156,pressure:.9},{x:158,y:189,pressure:.6},{x:187,y:273,pressure:0}]}],moss:true,textureCount:18})},
  {name:'鸟：显式落脚点 · 分件笔组',macro:createBirdMacro({id:'bird-study',seed,attachment:{point:{x:165,y:240},tangent:{x:1,y:-.06}},size:168,pose:'looking-up',facing:'left'})},
];
const records=[];
try{
 for(const [index,example] of examples.entries()){
  const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');
  canvas.width=width;canvas.height=height;caption.textContent=example.name;
  const groups=[...example.macro.groups];
  if(index===2)groups.unshift({id:'perch-study',role:'structure',strokes:[{id:'branch',points:[{x:44,y:249,pressure:.18},{x:165,y:240,pressure:.85},{x:352,y:226,pressure:0}],options:{width:7,dryness:.68,opacity:.75,ink:'#55594c',duration:0}}]});
  const source=createStrokeGroupDocument(groups,{width,height,seed,background:'#f5f2e9'});
  renderCanvas(canvas.getContext('2d',{willReadFrequently:true}),source.result,{time:1,paperTexture:.02});
  figure.append(canvas,caption);document.querySelector('#gallery').append(figure);
  records.push({name:example.name,macro:example.macro,recipe:source.recipe});
 }
 window.subjectMacroStudy={records};document.body.dataset.status='ready';
 document.querySelector('#status').textContent='3项 · 可导出JSON重建';
 function save(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 document.querySelector('#save-source').onclick=()=>save(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}),'ink-subject-macros.json');
 document.querySelector('#save-png').onclick=()=>{
  const sheet=document.createElement('canvas');sheet.width=1248;sheet.height=410;
  const context=sheet.getContext('2d');context.fillStyle='#f5f2e9';context.fillRect(0,0,sheet.width,sheet.height);
  document.querySelectorAll('#gallery canvas').forEach((canvas,i)=>context.drawImage(canvas,16+i*416,16));
  context.fillStyle='#30372c';context.font='17px sans-serif';records.forEach((record,i)=>context.fillText(record.name,22+i*416,385));
  sheet.toBlob(blob=>save(blob,'ink-subject-macros.png'));
 };
}catch(error){document.body.dataset.status='failed';document.querySelector('#status').textContent=error.message;throw error;}
