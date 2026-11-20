import { createRandom } from './core.js';
import { sampleStrokePath } from './path.js';
import { createStrokeGroupDocument } from './stroke-group-document.js';
import type { GroupStrokeSource, StrokeGroupOptions, StrokeGroupSource } from './stroke-group-document.js';
import type { InkPoint, InkScene, StrokePathSample, Vec2 } from './types.js';

/** These names select contact studies, not fixed historical shape definitions. */
export type PointTextureTechnique = 'rain' | 'bean' | 'nail' | 'mi' | 'moss';
export interface PointTextureSite {
  readonly id: string;
  /** Position on the guide's normalized arc length. */
  readonly at: number;
  readonly count: number;
  readonly size: number;
  /** Radius of the local cluster, in scene units. */
  readonly spread: number;
  /** Signed normal displacement in scene units; moss defaults inward by .35 size. */
  readonly offset?: number;
  readonly opacity?: number;
}
export interface PointTextureFeature {
  readonly id: string;
  readonly technique: PointTextureTechnique;
  readonly guide: readonly InkPoint[];
  readonly sites: readonly PointTextureSite[];
  /** Positive normal is (-dy, dx); used for inward moss and cluster depth. */
  readonly side?: -1 | 1;
  /** Optional authored contact direction; otherwise guide tangent (moss: normal). */
  readonly direction?: Vec2;
  readonly clip?: readonly Vec2[];
  /** Paper reserves: contacts whose whole conservative footprint meets these are omitted. */
  readonly reserves?: readonly (readonly Vec2[])[];
}
export interface PointTextureOptions extends Omit<StrokeGroupOptions, 'strokeWidth'> { readonly idPrefix?: string }
export interface PointTextureRecipe {
  readonly version: 1;
  readonly generator: 'ink-point-texture-v1';
  readonly features: readonly PointTextureFeature[];
  readonly options: PointTextureOptions;
}
export interface PointTextureDocument {
  readonly version: 1;
  readonly recipe: PointTextureRecipe;
  readonly groups: readonly StrokeGroupSource[];
  readonly result: InkScene;
}
export interface PointTexturePatch {
  readonly features?: readonly PointTextureFeature[];
  readonly options?: Partial<PointTextureOptions>;
}

const GENERATOR = 'ink-point-texture-v1';
const optionFields = ['width','height','seed','background','ink','dryness','opacity','idPrefix'];
const techniqueNames = ['rain','bean','nail','mi','moss'];
function fields(value: object, allowed: readonly string[], name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const [key, item] of Object.entries(value)) if (!allowed.includes(key) || item === null) throw new RangeError(`Unsupported ${name} field: ${key}`);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function range(value: number, min: number, max: number, name: string): number {
  if (finite(value,name) < min || value > max) throw new RangeError(`${name} must be in ${min}..${max}`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value,name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function id(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Point texture IDs must be nonempty');
  return value;
}
function hash(text: string): number {
  let n=2166136261;
  for(let i=0;i<text.length;i++) n=Math.imul(n^text.charCodeAt(i),16777619);
  return n>>>0;
}
function path(input: readonly InkPoint[], pressure: boolean, minimum=2): readonly InkPoint[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > 1024) throw new RangeError(`Point texture paths need ${minimum}..1024 vertices`);
  return Object.freeze(input.map(point=>{
    fields(point,pressure?['x','y','pressure']:['x','y'],'point texture vertex');
    return Object.freeze({x:finite(point.x,'x'),y:finite(point.y,'y'),
      ...(point.pressure===undefined?{}:{pressure:range(point.pressure,0,1,'pressure')})});
  }));
}
function ownFeatures(input: readonly PointTextureFeature[]): readonly PointTextureFeature[] {
  if (!Array.isArray(input) || input.length > 16) throw new RangeError('Point textures support at most 16 features');
  const featureIds=new Set<string>(); let sites=0,strokes=0;
  return Object.freeze(input.map(feature=>{
    fields(feature,['id','technique','guide','sites','side','direction','clip','reserves'],'point texture feature');
    id(feature.id); if(featureIds.has(feature.id)) throw new RangeError('Duplicate point texture feature ID');
    featureIds.add(feature.id);
    if(!techniqueNames.includes(feature.technique)) throw new RangeError('Unknown point texture technique');
    if(feature.side!==undefined && feature.side!==-1 && feature.side!==1) throw new RangeError('side must be -1 or 1');
    const guide=path(feature.guide,true);
    if(sampleStrokePath(guide,{spacing:Number.MAX_VALUE}).at(-1)!.distance<=1e-8) throw new RangeError('Point texture guide needs nonzero length');
    if(!Array.isArray(feature.sites)) throw new TypeError('Point texture sites must be an array');
    sites+=feature.sites.length; if(sites>48) throw new RangeError('Point textures support at most 48 sites');
    const siteIds=new Set<string>();
    const ownedSites=Object.freeze(feature.sites.map((site: PointTextureSite)=>{
      fields(site,['id','at','count','size','spread','offset','opacity'],'point texture site');
      id(site.id); if(siteIds.has(site.id)) throw new RangeError('Duplicate point texture site ID');siteIds.add(site.id);
      range(site.at,0,1,'site.at'); range(site.count,1,20,'site.count');
      if(!Number.isInteger(site.count)) throw new RangeError('site.count must be an integer');
      positive(site.size,'site.size');range(site.spread,0,1000000,'site.spread');
      if(site.offset!==undefined) finite(site.offset,'site.offset');
      if(site.opacity!==undefined)range(site.opacity,0,1,'site.opacity');
      strokes+=site.count*(feature.technique==='mi'?3:1);
      if(strokes>512)throw new RangeError('Point textures exceed 512 strokes');
      return Object.freeze({...site});
    }));
    let direction: Vec2|undefined;
    if(feature.direction!==undefined){
      fields(feature.direction,['x','y'],'point texture direction');
      direction=Object.freeze({x:finite(feature.direction.x,'direction.x'),y:finite(feature.direction.y,'direction.y')});
      const magnitude=Math.hypot(direction.x,direction.y);
      if(!Number.isFinite(magnitude)||magnitude<=1e-8)throw new RangeError('direction must have finite nonzero magnitude');
    }
    if(feature.reserves!==undefined&&(!Array.isArray(feature.reserves)||feature.reserves.length>8))throw new RangeError('At most 8 paper reserves per feature');
    return Object.freeze({id:feature.id,technique:feature.technique,guide,sites:ownedSites,
      ...(feature.side===undefined?{}:{side:feature.side}),...(direction?{direction}:{}),
      ...(feature.clip===undefined?{}:{clip:path(feature.clip,false,3)}),
      ...(feature.reserves===undefined?{}:{reserves:Object.freeze(feature.reserves.map((p: readonly Vec2[])=>path(p,false,3)))}),
    });
  }));
}
function station(samples: readonly StrokePathSample[], at: number): StrokePathSample {
  const target=samples.at(-1)!.distance*Math.max(0,Math.min(1,at));
  let i=0;while(i<samples.length-2&&samples[i+1]!.distance<target)i++;
  const a=samples[i]!,b=samples[i+1]!,t=(target-a.distance)/(b.distance-a.distance);
  const nx=a.nx*(1-t)+b.nx*t,ny=a.ny*(1-t)+b.ny*t,m=Math.hypot(nx,ny)||1;
  return {...a,x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t,pressure:a.pressure*(1-t)+b.pressure*t,nx:nx/m,ny:ny/m};
}
function inside(point: Vec2, polygon: readonly Vec2[]): boolean {
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i]!,b=polygon[j]!;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }return hit;
}
function distance(point: Vec2,a: Vec2,b: Vec2): number {
  const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
  const t=d===0?0:Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/d));
  return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t);
}
function blocked(point: Vec2,radius: number,reserves: PointTextureFeature['reserves']): boolean {
  return (reserves??[]).some(polygon=>inside(point,polygon)||polygon.some((a,i)=>distance(point,a,polygon[(i+1)%polygon.length]!)<radius));
}

/** Organizes point contacts around explicit fracture/ridge sites; never fills a whole shape. */
export function createPointTextureDocument(features: readonly PointTextureFeature[], options: PointTextureOptions): PointTextureDocument {
  fields(options,optionFields,'point texture option');
  const {idPrefix='point-texture',...common}=options;id(idPrefix);
  const sceneOptions=createStrokeGroupDocument([],common).recipe.options;
  const owned=ownFeatures(features),groups: StrokeGroupSource[]=[];
  for(const feature of owned){
    const length=sampleStrokePath(feature.guide,{spacing:Number.MAX_VALUE}).at(-1)!.distance;
    const samples=sampleStrokePath(feature.guide,{spacing:length/128});
    for(const site of feature.sites){
      const key=`${idPrefix.length}:${idPrefix}/${feature.id.length}:${feature.id}/${site.id.length}:${site.id}`;
      const strokes: GroupStrokeSource[]=[],occupied: Vec2[]=[];
      for(let i=0;i<site.count;i++){
        const random=createRandom((sceneOptions.seed??1)^hash(key+'/'+i));
        const size=site.size*(i===0?1.12:.65+random()*.45);
        const side=feature.side??1;
        let p: StrokePathSample|undefined,origin: Vec2|undefined,best=-1;
        // A bounded local dart search keeps subordinate dots distinguishable.
        // It is scoped to one stable site, so other sites do not reshuffle.
        for(let attempt=0;attempt<(i===0?1:20);attempt++){
          const along=i===0?0:(random()+random()-1)*site.spread;
          const candidate=station(samples,site.at+along/length);
          const depth=(random()+random()-1)*site.spread*.58;
          const normal=(site.offset??(feature.technique==='moss'?size*.35*side:0))
            +(i===0?0:feature.technique==='moss'?Math.abs(depth)*side*.45:depth);
          const point={x:candidate.x+candidate.nx*normal,y:candidate.y+candidate.ny*normal};
          if(feature.clip&&!inside(point,feature.clip)||blocked(point,size*3,feature.reserves))continue;
          const separation=occupied.length?Math.min(...occupied.map(other=>Math.hypot(other.x-point.x,other.y-point.y))):Infinity;
          if(separation>best){best=separation;origin=point;p=candidate;}
          if(separation>size*(feature.technique==='mi'?.75:.85))break;
        }
        if(!origin||!p)continue;
        occupied.push(origin);
        const axis=feature.direction??(feature.technique==='moss'?{x:p.nx*side,y:p.ny*side}:{x:p.ny,y:-p.nx});
        const angle=(random()-.5)*.38,mag=Math.hypot(axis.x,axis.y);
        const tx=(axis.x*Math.cos(angle)-axis.y*Math.sin(angle))/mag,ty=(axis.x*Math.sin(angle)+axis.y*Math.cos(angle))/mag;
        const local=(x:number,y:number,pressure:number):InkPoint=>({x:origin.x+tx*x-ty*y,y:origin.y+ty*x+tx*y,pressure:pressure*p.pressure});
        const technique=feature.technique,wet=technique==='mi';
        const parts=wet?3:1;
        for(let part=0;part<parts;part++){
          const width=size*(technique==='rain'?.57:technique==='bean'?.86:technique==='nail'?.7:technique==='moss'?.92:.88)*(part? .67+random()*.22:1);
          const reach=size*(technique==='rain'?1.15:technique==='bean'?.74:technique==='nail'?1.85:technique==='moss'?.42:1.72);
          const shift=part===0?0:(part===1?-.22:.28)*size;
          const across=part===0?0:(part===1?.16:-.16)*size;
          const points=wet?[local(shift,across,.78),local(shift+reach*.48,across+size*.025,1),local(shift+reach,across,.82)]
            :technique==='moss'?[local(0,0,.58),local(reach*.43,size*.05,1),local(reach,size*.02,.56)]
            :technique==='nail'?[local(0,0,.97),local(reach*.15,size*.12,.86),local(reach*.55,size*.16,.48),local(reach,size*.2,0)]
              :[local(0,0,.15),local(reach*.25,size*.06,.79),local(reach*.62,-size*.025,.98),local(reach,size*.03,.06)];
          const opacity=(sceneOptions.opacity??1)*(site.opacity??.8)*(i===0?1:.48+random()*.38)*(part?.58:1);
          strokes.push({id:`dot-${i}/part-${part}`,points,options:{width,ink:sceneOptions.ink??'#283027',
            opacity,dryness:sceneOptions.dryness??(wet?.08:technique==='moss'?.61:technique==='nail'?.64:.42),
            axis:technique==='nail'?'side':'center',smoothing:technique==='nail'?'linear':'catmull-rom',duration:0,
            gestureModel:'local-v1',finish:'preserve',
            ...(feature.clip?{clip:feature.clip}:{}),
          }});
        }
      }
      if(strokes.length)groups.push({id:key,role:'mark',strokes});
    }
  }
  const compiled=createStrokeGroupDocument(groups,sceneOptions);
  const recipe: PointTextureRecipe=Object.freeze({version:1,generator:GENERATOR,features:owned,
    options:Object.freeze({...sceneOptions,idPrefix})});
  return Object.freeze({version:1,recipe,groups:compiled.recipe.groups,result:compiled.result});
}
export function compilePointTextureRecipe(recipe: PointTextureRecipe): InkScene {
  fields(recipe,['version','generator','features','options'],'point texture recipe');
  if(recipe.version!==1||recipe.generator!==GENERATOR)throw new RangeError('Unsupported point texture recipe');
  return createPointTextureDocument(recipe.features,recipe.options).result;
}
export function revisePointTextureDocument(document: PointTextureDocument,patch: PointTexturePatch): PointTextureDocument {
  fields(document,['version','recipe','groups','result'],'point texture document');
  if(document.version!==1)throw new RangeError('Unsupported point texture document');
  compilePointTextureRecipe(document.recipe);
  fields(patch,['features','options'],'point texture patch');
  return createPointTextureDocument(patch.features??document.recipe.features,{...document.recipe.options,...patch.options});
}
