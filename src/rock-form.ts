import { createRandom, pointInPolygon } from './core.js';
import { getNoise1D } from './natural.js';
import { createStrokeGroupDocument } from './stroke-group-document.js';
import { generateRockTexture, clearsRockReserves } from './rock-texture.js';
import type { GroupStrokeSource, StrokeGroupSource } from './stroke-group-document.js';
import type { InkPoint, InkScene, Vec2 } from './types.js';
import type { RockDocument, RockDocumentInput, RockDocumentOptions, RockFaceSource,
  RockFormOptions, RockLineSource, RockRecipe, RockStructureSource } from './rock-form-types.js';

const sceneFields = ['width','height','seed','background','ink','strokeWidth','dryness','opacity'];
const executionFields = [...sceneFields,'technique','detail','idPrefix'];
const formFields = ['position','size','pose','seed'];
const inputFields = [...new Set([...executionFields,...formFields,'structure'])];
const GENERATOR = 'ink-structured-rock-v1';
function fields(value: object, allowed: readonly string[], name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const [key,item] of Object.entries(value)) if (!allowed.includes(key) || item === null) throw new RangeError(`Unsupported ${name} field: ${key}`);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value,name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function text(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Rock identities must be nonempty strings');
  return value;
}
function unit(value: number): number {
  if (finite(value,'pressure') < 0 || value > 1) throw new RangeError('Rock pressure must be in 0..1');
  return value;
}
function seed(value: number): number {
  if (!Number.isSafeInteger(finite(value,'seed'))) throw new RangeError('Rock seed must be a safe integer');
  return value >>> 0;
}
function hash(value: string): number {
  let key=2166136261;
  for (const c of value) key=Math.imul(key ^ c.charCodeAt(0),16777619);
  return key >>> 0;
}
function bounds(points: readonly Vec2[]) {
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  const width=Math.max(...points.map(p=>p.x))-x,height=Math.max(...points.map(p=>p.y))-y;
  positive(width,'rock span x');positive(height,'rock span y');
  return {x,y,width,height,scale:Math.max(width,height)};
}
function polygon(values: readonly Vec2[]): readonly Vec2[] {
  if (!Array.isArray(values) || values.length < 3 || values.length > 128) throw new RangeError('Rock polygons need 3..128 vertices');
  const result=values.map(p=>{
    fields(p,['x','y'],'rock vertex');
    return Object.freeze({x:finite(p.x,'x'),y:finite(p.y,'y')});
  });
  const b=bounds(result);
  // Translate first so a large scene origin does not dominate the area test.
  let twiceArea=0;
  for(let i=0;i<result.length;i++){
    const a=result[i]!,p=result[(i+1)%result.length]!;
    twiceArea+=(a.x-b.x)*(p.y-b.y)-(p.x-b.x)*(a.y-b.y);
  }
  if(!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= b.width*b.height*1e-10) throw new RangeError('Rock polygons need finite nonzero area');
  return Object.freeze(result);
}
function path(values: readonly InkPoint[]): readonly InkPoint[] {
  if (!Array.isArray(values) || values.length < 2 || values.length > 512) throw new RangeError('Rock paths need 2..512 points');
  const copied=values.map(p=>{
    fields(p,['x','y','pressure'],'rock path point');
    return Object.freeze({x:finite(p.x,'x'),y:finite(p.y,'y'),...(p.pressure===undefined?{}:{pressure:unit(p.pressure)})});
  });
  let length=0;
  for(let i=1;i<copied.length;i++)length+=Math.hypot(copied[i]!.x-copied[i-1]!.x,copied[i]!.y-copied[i-1]!.y);
  positive(length,'rock path length');
  return Object.freeze(copied);
}
function lines(values: readonly RockLineSource[], maximum: number): readonly RockLineSource[] {
  if(!Array.isArray(values)||values.length>maximum)throw new RangeError(`Rock lines support at most ${maximum} entries`);
  const ids=new Set<string>();
  return Object.freeze(values.map(line=>{
    fields(line,['id','points'],'rock line');text(line.id);
    if(ids.has(line.id))throw new RangeError('Duplicate rock line identity');ids.add(line.id);
    return Object.freeze({id:line.id,points:path(line.points)});
  }));
}
function contained(region: readonly Vec2[], outline: readonly Vec2[]): void {
  // Test all intervals cut by the silhouette, not only vertices: a face edge
  // can leave and reenter a concave outline while both endpoints stay inside.
  for(let i=0;i<region.length;i++){
    const a=region[i]!,b=region[(i+1)%region.length]!;
    if(!pointInPolygon(a,outline))throw new RangeError('Rock faces must stay inside their outline');
    const dx=b.x-a.x,dy=b.y-a.y,cuts=[0,1];
    for(let j=0;j<outline.length;j++){
      const p=outline[j]!,q=outline[(j+1)%outline.length]!,ex=q.x-p.x,ey=q.y-p.y;
      const den=dx*ey-dy*ex;
      if(Math.abs(den)<1e-12*Math.max(1,Math.hypot(dx,dy)*Math.hypot(ex,ey)))continue;
      const t=((p.x-a.x)*ey-(p.y-a.y)*ex)/den,u=((p.x-a.x)*dy-(p.y-a.y)*dx)/den;
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }
    cuts.sort((x,y)=>x-y);
    for(let j=1;j<cuts.length;j++){
      const t=(cuts[j-1]!+cuts[j]!)*.5;
      if(!pointInPolygon({x:a.x+dx*t,y:a.y+dy*t},outline))throw new RangeError('Rock face edges must stay inside their outline');
    }
  }
}
function ownStructure(value: RockStructureSource): RockStructureSource {
  fields(value,['outline','ridges','faces'],'rock structure');
  const outline=polygon(value.outline),ridges=lines(value.ridges,32);
  if(!Array.isArray(value.faces)||!value.faces.length||value.faces.length>8)throw new RangeError('Rock structures need 1..8 faces');
  const ids=new Set<string>();
  const faces=value.faces.map(face=>{
    fields(face,['id','region','flow','tone','fractures','reserves'],'rock face');text(face.id);
    if(ids.has(face.id))throw new RangeError('Duplicate rock face identity');ids.add(face.id);
    if(!['light','middle','dark'].includes(face.tone))throw new RangeError('Unknown rock face tone');
    const region=polygon(face.region);contained(region,outline);
    if(face.reserves!==undefined&&(!Array.isArray(face.reserves)||face.reserves.length>8))throw new RangeError('Rock faces support at most 8 reserves');
    return Object.freeze({id:face.id,region,flow:path(face.flow),tone:face.tone,
      ...(face.fractures===undefined?{}:{fractures:lines(face.fractures,8)}),
      ...(face.reserves===undefined?{}:{reserves:Object.freeze(face.reserves.map(polygon))}),
    });
  });
  return Object.freeze({outline,ridges,faces:Object.freeze(faces)});
}

/** Bounded construction grammar, not inference from arbitrary silhouettes. */
export function createRockForm(options: RockFormOptions = {}): RockStructureSource {
  fields(options,formFields,'rock form option');
  const pose=options.pose??'upright',size=positive(options.size??220,'size'),key=seed(options.seed??1);
  if(!['upright','reclining','leaning'].includes(pose))throw new RangeError('Unknown rock pose');
  const position=options.position??{x:0,y:0};fields(position,['x','y'],'position');finite(position.x,'position.x');finite(position.y,'position.y');
  const random=createRandom(key^0x61ac31ef);
  const low=pose==='reclining',lean=pose==='leaning'?.15:0;
  const vertices=low
    ? [[.01,.96],[.035,.71],[.11,.53],[.24,.49],[.31,.24],[.62,.065],[.83,.12],[.89,.43],[.84,.58],[.98,.66],[.96,.92],[.72,1],[.49,.99]]
    : pose==='leaning'
      ? [[.05,.99],[.13,.68],[.18,.40],[.32,.34],[.31,.15],[.59,.035],[.80,.12],[.88,.32],[.79,.53],[.88,.76],[.80,.98],[.57,1.01],[.36,1.01]]
      : [[.08,1],[.03,.76],[.08,.51],[.21,.37],[.20,.14],[.42,.035],[.68,.15],[.77,.39],[.87,.54],[.84,.72],[.99,.90],[.81,1.02],[.60,1.02]];
  const width=size*(low?1:pose==='leaning'?.77:.76),height=size*(low?.57:pose==='leaning'?.89:1);
  const shift=(xy: readonly number[],amplitude=.022): Vec2=>{
    const x=xy[0]!+(random()-.5)*amplitude,y=xy[1]!+(random()-.5)*amplitude;
    return {x:position.x+(x+lean*(1-y))*width,y:position.y+y*height};
  };
  const v=vertices.map(xy=>shift(xy));
  const z=shift(low?[.56,.42]:pose==='leaning'?[.63,.31]:[.53,.32]);
  const m=shift(low?[.63,.63]:pose==='leaning'?[.49,.56]:[.58,.57]);
  const n=shift(low?[.49,.78]:pose==='leaning'?[.53,.76]:[.51,.73]);
  const p=(xy:readonly number[]):InkPoint=>({...shift(xy,.008),pressure:.8});
  const line=(id:string,points:readonly Vec2[]):RockLineSource=>({id,points:points.map((q,i)=>({...q,pressure:i===points.length-1?.08:i===0?.3:.78}))});
  const outline=v;
  const cap=[v[4]!,v[5]!,v[6]!,v[7]!,z];
  const front=[...v.slice(0,5),z,m,n,v[12]!];
  const side=[z,...v.slice(7),n,m];
  // Flow and fractures share the same pose transform as their face polygons.
  const faces:RockFaceSource[]=[
    {id:'cap',region:cap,tone:'light',flow:[p(low?[.61,.14]:[.48,.13]),p(low?[.63,.29]:[.55,.23]),{...z,pressure:.55}],fractures:[]},
    {id:'front',region:front,tone:'light',flow:[p(low?[.35,.45]:pose==='leaning'?[.40,.35]:[.30,.28]),
      p(low?[.31,.62]:pose==='leaning'?[.34,.56]:[.36,.50]),p(low?[.24,.85]:pose==='leaning'?[.28,.78]:[.26,.76]),p([.27,.97])],
      fractures:[line('upper-scar',[p(low?[.21,.55]:[.19,.51]),p(low?[.27,.61]:[.27,.58]),p(low?[.24,.71]:[.24,.68])])]},
    {id:'side',region:side,tone:'dark',flow:[p(low?[.69,.40]:pose==='leaning'?[.73,.37]:[.68,.36]),
      p(low?[.79,.58]:pose==='leaning'?[.65,.55]:[.70,.57]),p(low?[.78,.80]:pose==='leaning'?[.69,.75]:[.73,.80]),p(pose==='leaning'?[.62,.97]:[.77,.98])],
      fractures:[line('near-fold',[{...z},p(low?[.67,.58]:pose==='leaning'?[.57,.53]:[.65,.52]),p(low?[.72,.69]:pose==='leaning'?[.63,.65]:[.69,.65])]),
        line('foot-cleft',[p([.84,.74]),p([.76,.81]),p([.79,.94])])]},
  ];
  const mix=(a:Vec2,b:Vec2,t:number,pressure:number):InkPoint=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,pressure});
  const ridges:RockLineSource[]=[
    {id:'upper-turn',points:[{...z,pressure:.28},{...m,pressure:.78},mix(m,n,.4,0)]},
    {id:'foot-fold',points:[mix(n,v[12]!,.25,.12),mix(n,v[12]!,.61,.63),mix(n,v[12]!,.84,0)]},
    {id:'shoulder',points:[{...v[4]!,pressure:.08},mix(v[4]!,z,.52,.63),{...z,pressure:.34},mix(z,v[7]!,.45,0)]},
  ];
  return ownStructure({outline,ridges,faces});
}

function execution(options: RockDocumentOptions): RockDocumentOptions {
  fields(options,executionFields,'rock document option');
  if(!['axe','jiesuo'].includes(options.technique))throw new RangeError('Structured rocks support axe or jiesuo');
  const detail=options.detail??2;
  if(!Number.isInteger(detail)||detail<1||detail>3)throw new RangeError('Rock detail must be an integer in 1..3');
  const idPrefix=text(options.idPrefix??'rock');
  const selected=Object.fromEntries(sceneFields.filter(key=>key in options).map(key=>[key,(options as unknown as Record<string,unknown>)[key]]));
  const canonical=createStrokeGroupDocument([],selected as unknown as RockDocumentOptions).recipe.options;
  return Object.freeze({...canonical,seed:seed(canonical.seed??1),technique:options.technique,detail,idPrefix});
}
function drawStructure(structure:RockStructureSource,options:RockDocumentOptions):StrokeGroupSource[] {
  const prefix=`${options.idPrefix!.length}:${options.idPrefix}`,ink=options.ink??'#252820',key=options.seed!,extent=bounds(structure.outline);
  const scale=extent.scale,mark=(id:string,points:readonly InkPoint[],width:number,opacity:number,dryness=.64,clip?:readonly Vec2[]):GroupStrokeSource=>({id,points,
    options:{width,ink,opacity,dryness,axis:'center',gestureModel:'local-v1',smoothing:'linear',duration:0,...(clip?{clip}:{})}});
  const rough=(points:readonly InkPoint[],id:string):InkPoint[]=>{
    const out:InkPoint[]=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),steps=Math.min(32,Math.max(2,Math.ceil(length/5)));
      for(let j=i===1?0:1;j<=steps;j++){
        const t=j/steps,offset=getNoise1D(i*7.3+t*3.7,key^hash(id))*scale*.0024*Math.sin(t*Math.PI);
        const at=(i-1+t)/(points.length-1),gap=.34+getNoise1D(3.71,key^hash(id))*.06;
        const lift=id.startsWith('contour')&&((at>gap&&at<gap+.045)||(at>.81&&at<.85));
        out.push({x:a.x+dx*t-dy/(length||1)*offset,y:a.y+dy*t+dx/(length||1)*offset,
          pressure:lift?0:(a.pressure??.65)*(1-t)+(b.pressure??.65)*t});
      }
    }
    return out;
  };
  const v=structure.outline;
  const split=Math.max(2,Math.floor(v.length*.5));
  const contours=[v.slice(0,split+1),v.slice(split).concat([v[0]!])].map((values,index)=>mark('outline-'+index,
    rough(values.map((p,i)=>({...p,pressure:i===0?.12:i===values.length-1?.05:.55+getNoise1D(i*.63+4.2,key^index)*.24})),`contour-${index}`),
    options.strokeWidth??scale*.014,index?.74:.86));
  const bones=structure.ridges.map(line=>mark('ridge/'+line.id,rough(line.points,line.id),scale*.011,.7));
  const reserves=structure.faces.flatMap(face=>face.reserves??[]);
  const safeBones=[...contours,...bones].filter(stroke=>clearsRockReserves(stroke.points,stroke.options!.width!,reserves));
  const groups:StrokeGroupSource[]=safeBones.length?[{id:prefix+'/bones',role:'structure',strokes:safeBones}]:[];
  const parent=safeBones.length?{parentId:prefix+'/bones'}:{};
  for(const face of structure.faces){
    const id=prefix+`/face/${face.id.length}:${face.id}`,local=bounds(face.region);
    const wash=face.tone==='light'?.009:face.tone==='dark'?.045:.025;
    // A sparse translucent contact follows the slope; no polygon fill is used.
    const baseWidth=local.scale*.21,a=face.flow[0]!,b=face.flow[1]!,c=face.flow[Math.min(2,face.flow.length-1)]!;
    const basePoints=[{x:a.x+(b.x-a.x)*.48,y:a.y+(b.y-a.y)*.48,pressure:.08},{...b,pressure:.6},
      {x:b.x+(c.x-b.x)*.35,y:b.y+(c.y-b.y)*.35,pressure:0}];
    if(clearsRockReserves(basePoints,baseWidth,face.reserves))groups.push({id:id+'/base',role:'mark',...parent,strokes:[{id:'pale-slope',points:basePoints,
      options:{width:baseWidth,ink,opacity:wash,dryness:.24,axis:'side',smoothing:'catmull-rom',gestureModel:'local-v1',duration:0,clip:face.region}}]});
    const fractures=(face.fractures??[]).map(line=>mark('cleft/'+line.id,rough(line.points,id+'/'+line.id),local.scale*(face.tone==='dark'?.014:.008),face.tone==='dark'?.82:.46,.7,face.region))
      .filter(stroke=>clearsRockReserves(stroke.points,stroke.options!.width!,face.reserves));
    if(fractures.length)groups.push({id:id+'/clefts',role:'mark',...parent,strokes:fractures});
  }
  return groups;
}
function build(structure:RockStructureSource,options:RockDocumentOptions):RockDocument {
  const owned=ownStructure(structure),canonical=execution(options),prefix=`${canonical.idPrefix!.length}:${canonical.idPrefix}`;
  const base=drawStructure(owned,canonical),parent=base.some(group=>group.id===prefix+'/bones')?{parentId:prefix+'/bones'}:{};
  const textures=generateRockTexture(owned,{technique:canonical.technique,detail:canonical.detail!,seed:canonical.seed!,idPrefix:canonical.idPrefix!,ink:canonical.ink??'#252820'})
    .map(group=>({...group,...parent}));
  const groups=[...base,...textures].map(group=>({...group,strokes:group.strokes.map(stroke=>({...stroke,options:{...stroke.options,
    opacity:(stroke.options?.opacity??1)*(canonical.opacity??1),...(canonical.dryness===undefined?{}:{dryness:canonical.dryness}),
  }}))}));
  const scene=Object.fromEntries(sceneFields.filter(key=>key in canonical).map(key=>[key,(canonical as unknown as Record<string,unknown>)[key]]));
  const document=createStrokeGroupDocument(groups,scene as unknown as RockDocumentOptions);
  const recipe:RockRecipe=Object.freeze({version:1,generator:GENERATOR,structure:owned,options:canonical});
  return Object.freeze({version:1,recipe,groups:document.recipe.groups,result:document.result});
}

/** Automatic defaults or a caller's complete structure, compiled into editable groups. */
export function createRockDocument(input:RockDocumentInput):RockDocument {
  fields(input,inputFields,'rock input');
  const options=Object.fromEntries(executionFields.filter(key=>key in input).map(key=>[key,(input as unknown as Record<string,unknown>)[key]])) as unknown as RockDocumentOptions;
  const form=Object.fromEntries(formFields.filter(key=>key in input).map(key=>[key,(input as unknown as Record<string,unknown>)[key]]));
  // Layout and source are alternatives. A source recipe never hides stale pose controls.
  if(input.structure!==undefined&&['position','size','pose'].some(key=>key in input))throw new RangeError('Supply either an authored rock structure or automatic layout controls');
  return build(input.structure??createRockForm(form),options);
}
export function compileRockRecipe(recipe:RockRecipe):InkScene {
  fields(recipe,['version','generator','structure','options'],'rock recipe');
  if(recipe.version!==1||recipe.generator!==GENERATOR)throw new RangeError('Unsupported structured rock recipe');
  return build(recipe.structure,recipe.options).result;
}
export function reviseRockDocument(document:RockDocument,patch:{readonly structure?:RockStructureSource;readonly options?:Partial<RockDocumentOptions>}):RockDocument {
  fields(document,['version','recipe','groups','result'],'rock document');
  if(document.version!==1)throw new RangeError('Unsupported rock document');
  fields(patch,['structure','options'],'rock patch');compileRockRecipe(document.recipe);
  return build(patch.structure??document.recipe.structure,{...document.recipe.options,...patch.options});
}
