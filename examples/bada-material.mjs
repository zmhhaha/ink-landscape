import { createInkProcessDocument, compileInkProcessRecipe } from '../dist/ink-process.js';
import { createStrokeGroupDocument, compileStrokeGroupRecipe } from '../dist/stroke-group-document.js';
import { renderInkProcess } from '../dist/ink-canvas.js';
import { renderCanvas } from '../dist/canvas.js';

// This composition deliberately uses the existing density renderer for broad
// wood/rock deposits and the existing contact renderer for the four birds.
// Independent subject bounds retain a useful grid size within the core budget.
const specs = [
  { id:'rock', select:g=>g.id.startsWith('bada-rock'), cell:.7 },
  { id:'wood', select:g=>['tree/trunk','tree/broken-limbs','tree/bark'].includes(g.id), cell:1.05 },
  { id:'upper-branch', select:g=>g.id==='tree/upper-bare-branch', cell:.6 },
  { id:'stump', select:g=>g.id==='tree/lower-stump', cell:.5 },
  { id:'ground', select:g=>g.id==='ground', cell:.65 },
];
function concentration(id) {
  if(id.includes('pale-planes'))return .12;
  if(id.includes('cap-facets')||id.includes('body-facets'))return .34;
  if(id.includes('rock'))return .3;
  if(id==='tree/bark')return .51;
  if(id==='ground')return .25;
  return .32;
}

/** Frozen recipes, including grid and placement, are sufficient for replay. */
export function createBadaInkComposition(geometry) {
  const {width,height,seed,background}=geometry.recipe.options, scale=width/540;
  const panels=specs.map(spec=>{
    const groups=geometry.recipe.groups.filter(spec.select);
    const samples=groups.flatMap(g=>g.strokes.flatMap(s=>s.points.map(p=>({x:p.x,y:p.y,r:s.options.width*.65}))));
    const x=Math.floor(Math.max(0,Math.min(...samples.map(p=>p.x-p.r))-3));
    const y=Math.floor(Math.max(0,Math.min(...samples.map(p=>p.y-p.r))-3));
    const w=Math.ceil(Math.min(width,Math.max(...samples.map(p=>p.x+p.r))+3)-x);
    const h=Math.ceil(Math.min(height,Math.max(...samples.map(p=>p.y+p.r))+3)-y);
    const shift=p=>({...p,x:p.x-x,y:p.y-y});
    const layers=groups.map(group=>({ id:group.id,concentration:concentration(group.id),
      at:0,dryAfter:0,mode:'glaze',water:.3,edgeSoftness:group.id.includes('bark')?.07:.2,
      strokes:group.strokes.map(stroke=>({points:stroke.points.map(shift),
        options:Object.fromEntries(Object.entries({...stroke.options,id:stroke.id,
          dryness:Math.min(.7,stroke.options.dryness),
          ...(stroke.options.clip?{clip:stroke.options.clip.map(shift)}:{})})
          .filter(([key])=>!['ink','start','duration'].includes(key))) })) }));
    const document=createInkProcessDocument(layers,{width:w,height:h,seed,background:'#ffffff',ink:'#353a31'});
    return { id:spec.id,x,y,width:w,height:h,
      cellSize:Math.max(spec.cell*scale,Math.sqrt(w*h/240000)),document };
  });
  const accents=createStrokeGroupDocument(geometry.recipe.groups.filter(g=>g.id.startsWith('crow')),geometry.recipe.options);
  return { recipe:{version:1,generator:'bada-ink-composition-v1',width,height,seed,background,
    panels:panels.map(({id,x,y,width,height,cellSize,document})=>({id,x,y,width,height,cellSize,recipe:document.recipe})),
    accents:accents.recipe},
    result:{panels,accents:accents.result} };
}

/** Rebuild the exported material recipes, without the original authoring code. */
export function compileBadaInkComposition(recipe) {
  if(recipe?.version!==1||recipe.generator!=='bada-ink-composition-v1')throw new RangeError('Unsupported Bada composition recipe');
  return {recipe,result:{panels:recipe.panels.map(panel=>({...panel,
    document:{result:compileInkProcessRecipe(panel.recipe)}})),accents:compileStrokeGroupRecipe(recipe.accents)}};
}

// Browser caches are disposable; all editable geometry stays in the recipes.
const surfaces=new WeakMap();
export function drawBadaInkComposition(canvas,composition) {
  const recipe=composition.recipe;
  canvas.width=recipe.width;canvas.height=recipe.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.fillStyle=recipe.background;context.fillRect(0,0,canvas.width,canvas.height);
  let prepared=surfaces.get(composition);
  if(!prepared){
    prepared=composition.result.panels.map(panel=>{
      const surface=document.createElement('canvas');surface.width=panel.width;surface.height=panel.height;
      renderInkProcess(surface.getContext('2d',{willReadFrequently:true}),panel.document.result,{time:1,cellSize:panel.cellSize});
      const target=surface.getContext('2d');
      // Materialize the prepared raster before compositing it with other panels.
      // This keeps the static source on the same software Canvas path on replay.
      const pixels=target.getImageData(0,0,surface.width,surface.height);
      target.putImageData(pixels,0,0);
      return {surface,x:panel.x,y:panel.y};
    });
    surfaces.set(composition,prepared);
  }
  context.globalCompositeOperation='multiply';
  for(const panel of prepared)context.drawImage(panel.surface,panel.x,panel.y);
  context.globalCompositeOperation='source-over';
  renderCanvas(context,composition.result.accents,{time:1,clear:false});
}
