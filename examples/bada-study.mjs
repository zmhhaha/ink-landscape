import { createBadaDocument, drawBadaDocument, prepareBadaDocument, BADA_REFERENCE } from './bada-composition.mjs';
import { createBadaBarkApplication } from './bada-bark-application.mjs';

const canvas=document.querySelector('#painting');
try {
  const parameters=new URLSearchParams(location.search);
  const width=Number(parameters.get('width') || 540);
  const bark=parameters.get('bark')==='structured';
  const documentData=bark?createBadaBarkApplication({width}):createBadaDocument({width});
  drawBadaDocument(canvas,documentData);
  const composition=prepareBadaDocument(documentData);
  window.badaStudy={document:documentData,composition,reference:BADA_REFERENCE,draw:()=>drawBadaDocument(canvas,documentData)};
  document.querySelector('#status').textContent=`${documentData.recipe.groups.length} 个笔组 · ${documentData.result.marks.length} 笔${bark?' · 枝干勾皴试作':''}`;
  document.body.dataset.status='ready';
  function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  document.querySelector('#export-png').onclick=()=>canvas.toBlob(blob=>download(blob,'bada-dead-tree-study.png'));
  document.querySelector('#export-recipe').onclick=()=>download(new Blob([JSON.stringify(composition.recipe,null,2)],{type:'application/json'}),'bada-dead-tree-strokes.json');
}catch(error){document.body.dataset.status='failed';document.querySelector('#status').textContent=error.message;throw error;}
