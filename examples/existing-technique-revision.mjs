import {renderCanvas} from '../dist/canvas.js';
import {renderInkProcess} from '../dist/ink-canvas.js';
import {rebuildRemainingDocument} from './remaining-document.mjs';
import {createExistingTechniqueRevisionCases,REVISION_FAMILIES,createWetStageComparisons,createMiPointLayerControl} from './existing-technique-revision-data.mjs';
const status=document.querySelector('#status'),editStatus=document.querySelector('#edit-status');
const select=document.querySelector('#case-select'),editor=document.querySelector('#recipe-source');
const columns=['baseline','improved','transferBaseline','transfer'];
const labels=['同题 · 原组织','同题 · 优化组织','换形 · 原组织','换形 · 优化组织'];
const time=8,cellSize=1,records=[],stages=[];
let family='ink',miControl;
function paint(canvas,documentData,at=time){
  canvas.width=documentData.result.width;canvas.height=documentData.result.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(documentData.result.layers)renderInkProcess(context,documentData.result,{time:at,cellSize});
  else renderCanvas(context,documentData.result,{time:at,paperTexture:0});
}
function save(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const sourceOnly=documentData=>({version:documentData.version,recipe:documentData.recipe});
async function makeCanvases(record){
  if(record.canvases)return;
  record.canvases=[];
  for(const key of columns){const canvas=document.createElement('canvas');paint(canvas,record[key]);record.canvases.push(canvas);
    await new Promise(resolve=>setTimeout(resolve,0));}
}
function showRecipe(){editor.value=JSON.stringify(records[Number(select.value)].improved.recipe,null,2);editStatus.textContent='';}
async function showFamily(id){
  family=id;
  document.querySelectorAll('button').forEach(button=>button.disabled=true);
  document.querySelectorAll('[data-family]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.family===id)));
  const gallery=document.querySelector('#gallery');gallery.replaceChildren();select.replaceChildren();
  for(const [index,record] of records.entries()){
    if(record.family!==id)continue;
    await makeCanvases(record);
    const section=document.createElement('section');section.className='study';
    const heading=document.createElement('h2');heading.textContent=record.title;
    const pair=document.createElement('div');pair.className='pair';
    record.canvases.forEach((canvas,k)=>{const figure=document.createElement('figure'),caption=document.createElement('figcaption');
      caption.textContent=labels[k];figure.append(canvas,caption);pair.append(figure);});
    const note=document.createElement('p');note.className='note';note.textContent=record.observation;
    const limits=document.createElement('p');limits.className='limits';limits.textContent=record.limits;
    section.append(heading,pair,note,limits);gallery.append(section);
    const option=document.createElement('option');option.value=String(index);option.textContent=record.title;select.append(option);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  document.querySelector('#wet-stages').hidden=id!=='ink';
  document.querySelector('#mi-control').hidden=id!=='points';
  if(id==='ink'&&!stages.length){
    for(const item of createWetStageComparisons()){
      const canvas=document.createElement('canvas');paint(canvas,item.document);
      const figure=document.createElement('figure'),caption=document.createElement('figcaption');
      caption.textContent=`${item.at} 秒 · ${item.interactions?'仍可迁移':'已过湿窗'}`;figure.append(canvas,caption);
      document.querySelector('#stage-gallery').append(figure);stages.push({...item,canvas});
    }
  }
  if(id==='points'&&!miControl){
    miControl=createMiPointLayerControl();miControl.canvases=[];
    for(const [key,label] of [['baseline','同锚点 · 单触'],['improved','同锚点 · 三触叠接']]){
      const canvas=document.createElement('canvas');paint(canvas,miControl[key]);miControl.canvases.push(canvas);
      const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=label;
      figure.append(canvas,caption);document.querySelector('#mi-gallery').append(figure);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    document.querySelector('#mi-note').textContent=miControl.observation;
  }
  showRecipe();status.textContent=`${records.filter(record=>record.family===id).length} 项对照 · 固定种子 20261120`;
  document.querySelectorAll('button').forEach(button=>button.disabled=false);
}
function sheet(){
  const chosen=records.filter(record=>record.family===family);
  const output=document.createElement('canvas');output.width=1488;output.height=chosen.length*336+64+(['ink','points'].includes(family)?340:0);
  const context=output.getContext('2d');context.fillStyle='#f5f2e9';context.fillRect(0,0,output.width,output.height);
  context.fillStyle='#30382e';context.font='20px sans-serif';context.fillText(REVISION_FAMILIES.find(item=>item.id===family).title,16,28);
  context.font='14px sans-serif';labels.forEach((label,index)=>context.fillText(label,12+index*370,53));
  chosen.forEach((record,index)=>{const y=64+index*336;context.font='17px sans-serif';context.fillText(record.title,12,y+22);
    record.canvases.forEach((canvas,k)=>context.drawImage(canvas,12+k*370,y+30));});
  if(family==='ink'){const y=64+chosen.length*336;context.fillText('同一清水接触：初湿 / 半干 / 干后',12,y+20);
    stages.forEach((stage,i)=>{context.drawImage(stage.canvas,12+i*370,y+30);context.fillText(`${stage.at} 秒`,12+i*370,y+330);});}
  if(family==='points'){const y=64+chosen.length*336;context.fillText('米点控制：同42锚点、时序、每层等墨量 / 单触与三触',12,y+20);
    miControl.canvases.forEach((canvas,i)=>context.drawImage(canvas,12+i*370,y+30));}
  return output;
}
try{
  records.push(...createExistingTechniqueRevisionCases().map(record=>({...record,initial:record.improved})));
  document.querySelectorAll('[data-family]').forEach(button=>button.onclick=()=>{status.textContent='正在绘制本组…';setTimeout(()=>showFamily(button.dataset.family),0);});
  select.onchange=showRecipe;
  document.querySelector('#save-png').onclick=()=>sheet().toBlob(blob=>save(blob,`existing-techniques-${family}.png`));
  document.querySelector('#save-source').onclick=()=>save(new Blob([JSON.stringify({version:1,study:'existing-technique-revision-20261120',
    render:{time,cellSize,paperTexture:0,backend:'Canvas 2D'},cases:records.map(({canvases,initial,...record})=>{
      const saved={...record};for(const key of columns)saved[key]=sourceOnly(record[key]);return saved;}),
    wetStages:stages.map(({canvas,document:documentData,...stage})=>({...stage,document:sourceOnly(documentData)})),
    ...(miControl?{miControl:{title:miControl.title,normalization:miControl.normalization,observation:miControl.observation,limits:miControl.limits,
      baseline:sourceOnly(miControl.baseline),improved:sourceOnly(miControl.improved)}}:{})},null,2)],{type:'application/json'}),'existing-technique-revision.json');
  document.querySelector('#apply-source').onclick=()=>{try{
    const record=records[Number(select.value)],recipe=JSON.parse(editor.value);
    if(recipe.options.width!==360||recipe.options.height!==280)throw Error('样片画幅需保持 360×280');
    record.improved=rebuildRemainingDocument(recipe);record.manualEdit=true;paint(record.canvases[1],record.improved);
    editStatus.textContent='逐笔编辑已重绘；结构配方保留为修改前的生成来源';editStatus.dataset.error='false';
  }catch(error){editStatus.textContent=error.message;editStatus.dataset.error='true';}};
  document.querySelector('#restore-source').onclick=()=>{const record=records[Number(select.value)];record.improved=record.initial;delete record.manualEdit;
    paint(record.canvases[1],record.improved);showRecipe();editStatus.textContent='已还原';};
  document.querySelector('#check-replay').onclick=()=>{status.textContent='正在核对本组…';
    document.querySelectorAll('button').forEach(button=>button.disabled=true);
    setTimeout(async()=>{let checked=0;try{
    for(const record of records.filter(item=>item.family===family))for(const [i,key] of columns.entries()){
      const canvas=document.createElement('canvas');const rebuilt=rebuildRemainingDocument(JSON.parse(JSON.stringify(record[key].recipe)));
      paint(canvas,rebuilt);if(canvas.toDataURL()!==record.canvases[i].toDataURL())throw Error(`${record.title} ${labels[i]} 重建差异`);
      paint(canvas,rebuilt,-1);paint(canvas,rebuilt,time);
      if(canvas.toDataURL()!==record.canvases[i].toDataURL())throw Error('乱序时间定位差异');checked++;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(family==='points')for(const [i,key] of ['baseline','improved'].entries()){
      const canvas=document.createElement('canvas'),rebuilt=rebuildRemainingDocument(JSON.parse(JSON.stringify(miControl[key].recipe)));
      paint(canvas,rebuilt);paint(canvas,rebuilt,-1);paint(canvas,rebuilt,time);
      if(canvas.toDataURL()!==miControl.canvases[i].toDataURL())throw Error('米点控制重建差异');checked++;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    status.textContent=`${checked} 个画面重建与乱序定位一致`;status.dataset.error='false';
  }catch(error){status.textContent=error.message;status.dataset.error='true';}
  finally{document.querySelectorAll('button').forEach(button=>button.disabled=false);}},0);};
  const selectedFamily=new URLSearchParams(location.search).get('family')||'ink';
  if(!REVISION_FAMILIES.some(item=>item.id===selectedFamily))throw Error('未知笔法组');
  setTimeout(()=>showFamily(selectedFamily).then(()=>{document.body.dataset.status='ready';}).catch(error=>{
    status.textContent=error.message;document.body.dataset.status='failed';}),0);
}catch(error){status.textContent=error.message;document.body.dataset.status='failed';throw error;}
