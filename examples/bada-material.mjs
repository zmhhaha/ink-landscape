import { createInkProcessDocument, compileInkProcessRecipe } from '../dist/ink-process.js';
import { createStrokeGroupDocument, compileStrokeGroupRecipe } from '../dist/stroke-group-document.js';
import { renderInkProcess } from '../dist/ink-canvas.js';
import { renderCanvas } from '../dist/canvas.js';

// This composition deliberately uses the existing density renderer for broad
// pale wood deposits and bird bodies; contact rendering retains the outlines,
// dry feathers, eyes, beaks and claws.
// Independent subject bounds retain a useful grid size within the core budget.
const specs = [
  { id:'hanging-wood', select:g=>g.id.startsWith('hanging-wood/'), cell:.7 },
  { id:'wood', select:g=>['tree/trunk','tree/broken-limbs','tree/bark'].includes(g.id), cell:1.05 },
  { id:'upper-branch', select:g=>g.id==='tree/upper-bare-branch', cell:.6 },
  { id:'stump', select:g=>g.id==='tree/lower-stump', cell:.5 },
  { id:'ground', select:g=>g.id==='ground', cell:.65 },
];
function concentration(id) {
  if(id.startsWith('crow'))return .38;
  if(id.startsWith('hanging-wood/'))return .24;
  if(id==='tree/bark')return .51;
  if(id==='ground')return .4;
  return .4;
}

/** Frozen recipes, including grid and placement, are sufficient for replay. */
export function createBadaInkComposition(geometry) {
  const {width,height,seed,background}=geometry.recipe.options, scale=width/540;
  const subset=(predicate,strokeFilter=()=>true)=>{
    const selected=geometry.recipe.groups.filter(predicate)
      .map(group=>({...group,strokes:group.strokes.filter(strokeFilter)})).filter(group=>group.strokes.length);
    const ids=new Set(selected.map(group=>group.id));
    return createStrokeGroupDocument(selected.map(group=>{
      // The full geometry retains subject attachments. Material subsets retain
      // only parent links whose groups are included in the same subset.
      const {parentId,...source}=group;
      return parentId&&ids.has(parentId)?{...source,parentId}:source;
    }),geometry.recipe.options);
  };
  const birdSpecs=geometry.recipe.groups.filter(group=>group.id.startsWith('crow')&&group.strokes.some(s=>s.id.startsWith('soft-')))
    .map(group=>({id:group.id,select:g=>g.id===group.id,cell:.45,softOnly:true}));
  const panels=[...specs,...birdSpecs].map(spec=>{
    const groups=geometry.recipe.groups.filter(spec.select).map(group=>({...group,
      strokes:spec.softOnly?group.strokes.filter(stroke=>stroke.id.startsWith('soft-')):group.strokes}));
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
  const underlines=subset(g=>g.id.startsWith('bone-')&&g.role==='structure');
  const accents=subset(g=>g.id.startsWith('crow')||(g.id.startsWith('bone-')&&g.role!=='structure'),
    stroke=>!stroke.id.startsWith('soft-'));
  return { recipe:{version:2,generator:'bada-ink-composition-v2',width,height,seed,background,
    panels:panels.map(({id,x,y,width,height,cellSize,document})=>({id,x,y,width,height,cellSize,recipe:document.recipe})),
    underlines:underlines.recipe,accents:accents.recipe},
    result:{panels,underlines:underlines.result,accents:accents.result} };
}

/** Rebuild the exported material recipes, without the original authoring code. */
export function compileBadaInkComposition(recipe) {
  const legacy=recipe?.version===1&&recipe.generator==='bada-ink-composition-v1';
  const current=recipe?.version===2&&recipe.generator==='bada-ink-composition-v2';
  if(!legacy&&!current)throw new RangeError('Unsupported Bada composition recipe');
  return {recipe,result:{panels:recipe.panels.map(panel=>({...panel,
    document:{result:compileInkProcessRecipe(panel.recipe)}})),
    ...(current?{underlines:compileStrokeGroupRecipe(recipe.underlines)}:{}),
    accents:compileStrokeGroupRecipe(recipe.accents)}};
}

// Browser caches are disposable; all editable geometry stays in the recipes.
const frames=new WeakMap();
export function drawBadaInkComposition(canvas,composition) {
  const recipe=composition.recipe;
  canvas.width=recipe.width;canvas.height=recipe.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  let pixels=frames.get(composition);
  if(!pixels){
    // A complete static frame is prepared on a fresh software surface. Both
    // first presentation and replay use the same ImageData transfer, avoiding
    // a browser changing compositing paths after the first canvas readback.
    const frame=document.createElement('canvas');frame.width=recipe.width;frame.height=recipe.height;
    const target=frame.getContext('2d',{willReadFrequently:true});
    target.fillStyle=recipe.background;target.fillRect(0,0,frame.width,frame.height);
    if(composition.result.underlines)renderCanvas(target,composition.result.underlines,{time:1,clear:false});
    target.globalCompositeOperation='multiply';
    for(const panel of composition.result.panels){
      const surface=document.createElement('canvas');surface.width=panel.width;surface.height=panel.height;
      renderInkProcess(surface.getContext('2d',{willReadFrequently:true}),panel.document.result,{time:1,cellSize:panel.cellSize});
      const layer=surface.getContext('2d');
      layer.putImageData(layer.getImageData(0,0,surface.width,surface.height),0,0);
      target.drawImage(surface,panel.x,panel.y);
    }
    target.globalCompositeOperation='source-over';
    renderCanvas(target,composition.result.accents,{time:1,clear:false});
    pixels=target.getImageData(0,0,frame.width,frame.height);
    frames.set(composition,pixels);
  }
  context.putImageData(pixels,0,0);
}
