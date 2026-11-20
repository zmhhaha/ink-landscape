import { createRandom, pointInPolygon } from './core.js';
import { jitterPath } from './perturbation.js';
import { createStrokeGroupDocument } from './stroke-group-document.js';
import type { GroupStrokeOptions, GroupStrokeSource, StrokeGroupSource } from './stroke-group-document.js';
import type { InkPoint, Vec2 } from './types.js';

export interface SubjectAttachment {
  readonly id: string;
  readonly groupId: string;
  readonly point: Vec2;
  readonly tangent: Vec2;
}
/** Source data only. Pass groups to createStrokeGroupDocument to render or edit. */
export interface SubjectMacro {
  readonly version: 1;
  readonly kind: 'tree' | 'rock' | 'bird';
  readonly groups: readonly StrokeGroupSource[];
  readonly attachments: readonly SubjectAttachment[];
}
interface SubjectOptions {
  readonly id?: string;
  readonly seed?: number;
  readonly ink?: string;
}
export interface TreeBranchSource {
  readonly id: string;
  readonly points: readonly InkPoint[];
  readonly width?: number;
  readonly parentId?: string;
  /** Fraction of the parent's authored arc length. Translates this entire path. */
  readonly attachAt?: number;
}
export interface TreeMacroOptions extends SubjectOptions {
  readonly start?: Vec2;
  readonly angle?: number;
  readonly size?: number;
  readonly width?: number;
  readonly depth?: number;
  readonly style?: 'dry' | 'wet';
  /** Absolute scene paths. Supplied branches replace recursive generation. */
  readonly branches?: readonly TreeBranchSource[];
}
export interface RockRidgeSource { readonly id: string; readonly points: readonly InkPoint[] }
export interface RockMacroOptions extends SubjectOptions {
  readonly position?: Vec2;
  readonly size?: number;
  /** Absolute scene coordinates. Defaults to an irregular eight-corner study. */
  readonly outline?: readonly Vec2[];
  /** Restricts internal deposits; defaults to outline. Does not clip bone lines. */
  readonly region?: readonly Vec2[];
  readonly ridges?: readonly RockRidgeSource[];
  readonly textureCount?: number;
  readonly moss?: boolean;
  readonly mossCount?: number;
  readonly mossAnchors?: readonly Vec2[];
  /** Evaluated while authoring. The resulting ordinary paths are serialized. */
  readonly flow?: (point: Vec2) => Vec2;
}
export type BirdPart = 'tail' | 'back' | 'wing' | 'head' | 'beak' | 'feet' | 'eye';
export interface BirdMacroOptions extends SubjectOptions {
  readonly position?: Vec2;
  readonly size?: number;
  readonly angle?: number;
  readonly type?: 'crow';
  readonly pose?: 'sitting' | 'looking-up' | 'looking-down';
  readonly facing?: 'left' | 'right';
  readonly paper?: string;
  /** Perch origin and optional local x direction. No branch geometry is inferred. */
  readonly attachment?: { readonly point: Vec2; readonly tangent?: Vec2 };
  /** Absolute scene strokes replace a whole part; [] explicitly omits it. */
  readonly parts?: Partial<Readonly<Record<BirdPart, readonly GroupStrokeSource[]>>>;
}

const commonFields = ['id', 'seed', 'ink'];
const treeFields = [...commonFields, 'start', 'angle', 'size', 'width', 'depth', 'style', 'branches'];
const rockFields = [...commonFields, 'position', 'size', 'outline', 'region', 'ridges', 'textureCount', 'moss', 'mossCount', 'mossAnchors', 'flow'];
const birdParts: readonly BirdPart[] = ['tail', 'back', 'wing', 'head', 'beak', 'feet', 'eye'];
const birdFields = [...commonFields, 'position', 'size', 'angle', 'type', 'pose', 'facing', 'paper', 'attachment', 'parts'];
function fields(value: object, allowed: readonly string[], name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key) || (value as Record<string, unknown>)[key] === null) throw new RangeError(`Unsupported ${name} field: ${key}`);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function integer(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(finite(value, name)) || value < min || value > max) throw new RangeError(`${name} must be an integer in ${min}..${max}`);
  return value;
}
function unit(value: number, name: string): number {
  if (finite(value, name) < 0 || value > 1) throw new RangeError(`${name} must be in 0..1`);
  return value;
}
function text(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('IDs must be nonempty strings');
  return value;
}
function colour(value: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError('Macro colours must be #RRGGBB');
  return value.toLowerCase();
}
function point(value: Vec2): Vec2 {
  fields(value, ['x', 'y'], 'point');
  return { x: finite(value.x, 'x'), y: finite(value.y, 'y') };
}
function path(values: readonly InkPoint[]): InkPoint[] {
  if (!Array.isArray(values) || values.length < 2 || values.length > 4096) throw new RangeError('Macro paths need 2..4096 points');
  const owned = values.map(p => {
    fields(p, ['x', 'y', 'pressure'], 'path point');
    return { x: finite(p.x, 'x'), y: finite(p.y, 'y'), ...(p.pressure === undefined ? {} : { pressure: unit(p.pressure, 'pressure') }) };
  });
  if (!owned.some(p => p.x !== owned[0]!.x || p.y !== owned[0]!.y)) throw new RangeError('Macro paths need nonzero length');
  return owned;
}
function polygon(values: readonly Vec2[]): Vec2[] {
  if (!Array.isArray(values) || values.length < 3 || values.length > 4096) throw new RangeError('Macro regions need 3..4096 points');
  const owned = values.map(point), origin = owned[0]!;
  const area = owned.reduce((sum, a, i) => { const b = owned[(i + 1) % owned.length]!; return sum + (a.x-origin.x)*(b.y-origin.y)-(b.x-origin.x)*(a.y-origin.y); }, 0);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-8) throw new RangeError('Macro regions need nonzero area');
  return owned;
}
function hash(value: string): number {
  let result = 2166136261;
  for (const ch of value) result = Math.imul(result ^ ch.charCodeAt(0), 16777619);
  return result >>> 0;
}
function settings(options: SubjectOptions, kind: SubjectMacro['kind']) {
  return { id: text(options.id ?? kind), seed: integer(options.seed ?? 1, 'seed', -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) >>> 0,
    ink: colour(options.ink ?? '#252b24') };
}
function mark(id: string, points: readonly InkPoint[], width: number, options: GroupStrokeOptions = {}): GroupStrokeSource {
  return { id, points, options: { width, opacity: .78, dryness: .5, smoothing: 'catmull-rom', gestureModel: 'local-v1', duration: 0, ...options } };
}
function finish(kind: SubjectMacro['kind'], groups: StrokeGroupSource[], attachments: SubjectAttachment[], seed: number): SubjectMacro {
  if (groups.reduce((sum, g) => sum + g.strokes.length, 0) > 512) throw new RangeError('A subject macro cannot exceed 512 strokes');
  // Reuse the neutral source compiler for ownership, controls and parent checks.
  const document = createStrokeGroupDocument(groups, { width: 1, height: 1, seed });
  const anchors = attachments.map(a => {
    const p = point({ x: a.point.x, y: a.point.y }), t = point(a.tangent), length = Math.hypot(t.x, t.y);
    if (length <= 0) throw new RangeError('Attachment direction must be nonzero');
    return Object.freeze({ ...a, point: Object.freeze(p), tangent: Object.freeze({ x: t.x / length, y: t.y / length }) });
  });
  return Object.freeze({ version: 1, kind, groups: document.recipe.groups, attachments: Object.freeze(anchors) });
}
function station(points: readonly InkPoint[], at: number): { point: InkPoint; tangent: Vec2 } {
  const lengths = points.slice(1).map((b, i) => Math.hypot(b.x-points[i]!.x,b.y-points[i]!.y));
  const total = lengths.reduce((a,b)=>a+b,0), distance = total * at;
  let before = 0;
  for (let i=0;i<lengths.length;i++) {
    const length=lengths[i]!;
    if (length>0 && (before+length>=distance || i===lengths.length-1)) {
      const a=points[i]!, b=points[i+1]!, t=Math.max(0,Math.min(1,(distance-before)/length));
      return { point:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,pressure:(a.pressure??1)*(1-t)+(b.pressure??1)*t}, tangent:{x:(b.x-a.x)/length,y:(b.y-a.y)/length} };
    }
    before+=length;
  }
  throw new RangeError('A branch needs finite nonzero length');
}
function branchStation(points: InkPoint[], at: number): { point: InkPoint; tangent: Vec2 } {
  const result=station(points,at);
  // Make the junction an interpolation anchor, so a smooth parent passes
  // through the same authored point as its child.
  if(!points.some(p=>p.x===result.point.x&&p.y===result.point.y)){
    let best=0,error=Infinity;
    for(let i=0;i<points.length-1;i++){
      const a=points[i]!,b=points[i+1]!,length=Math.hypot(b.x-a.x,b.y-a.y);
      const distance=Math.abs(Math.hypot(result.point.x-a.x,result.point.y-a.y)+Math.hypot(b.x-result.point.x,b.y-result.point.y)-length);
      if(distance<error){best=i;error=distance;}
    }
    points.splice(best+1,0,result.point);
  }
  return result;
}

/** Optional bounded branch grammar, or a caller's exact branch graph. */
export function createTreeMacro(options: TreeMacroOptions = {}): SubjectMacro {
  fields(options, treeFields, 'tree option');
  const s=settings(options,'tree'), size=positive(options.size??160,'size'), width=positive(options.width??size*.085,'width');
  const depth=integer(options.depth??3,'depth',0,6), start=point(options.start??{x:0,y:0}), angle=finite(options.angle??-Math.PI/2,'angle');
  const style=options.style??'dry';
  if (!['dry','wet'].includes(style)) throw new RangeError('Unknown tree style');
  type Branch = {id:string;points:InkPoint[];width:number;parentId?:string;attachAt?:number};
  const branches: Branch[]=[];
  if (options.branches !== undefined) {
    if (!Array.isArray(options.branches) || options.branches.length<1 || options.branches.length>127) throw new RangeError('Trees support 1..127 branches');
    const lookup=new Map<string,TreeBranchSource>();
    for(const branch of options.branches){
      fields(branch,['id','points','width','parentId','attachAt'],'branch');text(branch.id);
      if(lookup.has(branch.id))throw new RangeError('Duplicate branch ID');
      lookup.set(branch.id,branch);
    }
    const resolved=new Map<string,Branch>(), visiting=new Set<string>();
    const resolve=(id:string):Branch=>{
      if(resolved.has(id))return resolved.get(id)!;
      if(visiting.has(id))throw new RangeError('Branch parents must be acyclic');
      const source=lookup.get(id);if(!source)throw new RangeError('Unknown parent branch');visiting.add(id);
      let points=path(source.points), parent:Branch|undefined;
      if(source.parentId!==undefined){parent=resolve(text(source.parentId));const at=unit(source.attachAt??.78,'attachAt'),anchor=branchStation(parent.points,at).point;
        const dx=anchor.x-points[0]!.x,dy=anchor.y-points[0]!.y;points=points.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
      }else if(source.attachAt!==undefined)throw new RangeError('attachAt requires parentId');
      const branchWidth=positive(source.width??(parent?parent.width*.56:width),'branch width');
      if(parent&&branchWidth>=parent.width)throw new RangeError('Child branch width must be smaller than its parent');
      points=points.map((p,i)=>({...p,pressure:i===points.length-1?0:p.pressure??(.88-i/points.length*.18)}));
      const branch:Branch={id,points,width:branchWidth,...(source.parentId===undefined?{}:{parentId:source.parentId,attachAt:source.attachAt??.78})};
      resolved.set(id,branch);visiting.delete(id);return branch;
    };
    for(const source of options.branches)resolve(source.id);
    // Parent-first paint order, independent of input array order.
    branches.push(...resolved.values());
  } else {
    const grow=(id:string,p:Vec2,a:number,length:number,w:number,level:number,parent?:Branch,at?:number)=>{
      const random=createRandom(s.seed^hash(id)),bend=(random()-.5)*.24;
      const points:InkPoint[]=[{...p,pressure:.9},...[.32,.7,1].map((t,i)=>({x:p.x+Math.cos(a+bend*t)*length*t,y:p.y+Math.sin(a+bend*t)*length*t,pressure:[.96,.63,0][i]!}))];
      const branch:Branch={id,points,width:w,...(parent?{parentId:parent.id,attachAt:at!}:{})};branches.push(branch);
      if(level<depth)for(const [index,side] of [-1,1].entries()){
        const at=.64+random()*.18,anchor=branchStation(points,at).point;
        grow(`${id}.${index}`,anchor,a+side*(Math.PI/12+random()*Math.PI/12),length*(.57+random()*.14),w*(.48+random()*.13),level+1,branch,at);
      }
    };
    grow('root',start,angle,size,width,0);
  }
  const groups:StrokeGroupSource[]=[],attachments:SubjectAttachment[]=[];
  for(const branch of branches){
    const id=`${s.id.length}:${s.id}/branch/${branch.id}`,random=createRandom(s.seed^hash(id));
    const strokes=[mark('body',branch.points,branch.width,{ink:s.ink,opacity:style==='dry'?.42:.55,dryness:style==='dry'?.5:.22})];
    // A broken narrower grain, not a transverse row of repeated dabs.
    const grain=jitterPath(branch.points.map((p,i)=>({...p,pressure:i===branch.points.length-1?0:(p.pressure??1)*(.28+random()*.37)})),branch.width*.05,{seed:s.seed^hash(`${id}/grain`),wavelength:Math.max(1,branch.width)});
    strokes.push(mark('grain',grain,branch.width*.38,{ink:s.ink,opacity:.7,dryness:.82,axis:'side'}));
    if(branch.parentId&&random()>.42){
      const p=branch.points[0]!,t=station(branch.points,.1).tangent,reach=branch.width*.8;
      strokes.push(mark('joint',[{x:p.x-t.x*reach*.2,y:p.y-t.y*reach*.2,pressure:.25},{...p,pressure:.82},{x:p.x+t.x*reach,y:p.y+t.y*reach,pressure:0}],branch.width*1.25,{ink:s.ink,opacity:.49,dryness:.15}));
    }
    groups.push({id,role:'structure',...(branch.parentId?{parentId:`${s.id.length}:${s.id}/branch/${branch.parentId}`} :{}),strokes});
    attachments.push({id:`${branch.id}:root`,groupId:id,point:branch.points[0]!,tangent:station(branch.points,0).tangent},
      {id:`${branch.id}:tip`,groupId:id,point:branch.points.at(-1)!,tangent:station(branch.points,1).tangent});
  }
  return finish('tree',groups,attachments,s.seed);
}

/** Bone lines, sparse pale deposits, broken facets and clustered moss sources. */
export function createRockMacro(options: RockMacroOptions = {}): SubjectMacro {
  fields(options,rockFields,'rock option');
  const s=settings(options,'rock'),size=positive(options.size??100,'size'),position=point(options.position??{x:0,y:0});
  const outline=polygon(options.outline??[[0,.85],[.08,.35],[.34,.02],[.67,.12],[.88,.43],[1,.87],[.71,1],[.2,.97]].map(([x,y])=>({x:position.x+x!*size,y:position.y+y!*size})));
  const region=polygon(options.region??outline),xs=outline.map(p=>p.x),ys=outline.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
  const scale=Math.max(w,h),count=integer(options.textureCount??14,'textureCount',0,96),mossCount=integer(options.mossCount??8,'mossCount',0,32);
  if(options.moss!==undefined&&typeof options.moss!=='boolean')throw new TypeError('moss must be boolean');
  if(options.flow!==undefined&&typeof options.flow!=='function')throw new TypeError('flow must be a function');
  const ridges=options.ridges??[{id:'fold',points:[{x:left+w*.35,y:top+h*.07,pressure:.6},{x:left+w*.43,y:top+h*.43,pressure:.9},{x:left+w*.28,y:top+h*.8,pressure:.05}]}];
  if(!Array.isArray(ridges)||ridges.length>64)throw new RangeError('Rocks support at most 64 ridges');
  const boneStrokes=[mark('outline',[...outline.map((p,i)=>({...p,pressure:.32+(i%3)*.23})),{...outline[0]!,pressure:0}],scale*.018,{ink:s.ink,dryness:.69,smoothing:'linear'})];
  const ridgeIds=new Set<string>();
  for(const ridge of ridges){fields(ridge,['id','points'],'ridge');text(ridge.id);if(ridgeIds.has(ridge.id))throw new RangeError('Duplicate ridge ID');ridgeIds.add(ridge.id);boneStrokes.push(mark(`ridge/${ridge.id}`,path(ridge.points),scale*.016,{ink:s.ink,dryness:.61,smoothing:'linear'}));}
  const groups:StrokeGroupSource[]=[{id:`${s.id.length}:${s.id}/bones`,role:'structure',strokes:boneStrokes}];
  groups.push({id:`${s.id.length}:${s.id}/pale`,role:'mark',parentId:`${s.id.length}:${s.id}/bones`,strokes:[mark('shadow',[{x:left+w*.57,y:top+h*.17,pressure:.25},{x:left+w*.68,y:top+h*.52,pressure:.9},{x:left+w*.62,y:top+h*.91,pressure:0}],scale*.32,{ink:s.ink,opacity:.12,dryness:.14,axis:'side',clip:region})]});
  const random=createRandom(s.seed^hash(`${s.id.length}:${s.id}/texture`)),texture:GroupStrokeSource[]=[];
  for(let attempt=0;texture.length<count&&attempt<count*60;attempt++){
    const p={x:left+random()*w,y:top+random()*h};if(!pointInPolygon(p,region))continue;
    const direction=options.flow?point(options.flow({...p})):{x:.24+(p.x-left)/Math.max(w,1)*.24,y:1},length=Math.hypot(direction.x,direction.y);
    if(length<=0)throw new RangeError('Rock flow must be nonzero');
    const tx=direction.x/length,ty=direction.y/length,reach=scale*(.09+random()*.18),side=(random()-.5)*scale*.07;
    texture.push(mark(`facet/${texture.length}`,[{...p,pressure:.65},{x:p.x+tx*reach*.55-ty*side,y:p.y+ty*reach*.55+tx*side,pressure:.8},{x:p.x+tx*reach,y:p.y+ty*reach,pressure:0}],scale*(.025+random()*.035),{ink:s.ink,opacity:.3+random()*.36,dryness:.61+random()*.25,axis:'side',smoothing:'linear',clip:region}));
  }
  if(texture.length)groups.push({id:`${s.id.length}:${s.id}/texture`,role:'mark',parentId:`${s.id.length}:${s.id}/bones`,strokes:texture});
  const anchors=options.mossAnchors?.map(point)??outline.filter(p=>p.y<=top+h*.35);
  if(options.mossAnchors!==undefined&&(!Array.isArray(options.mossAnchors)||anchors.length>64))throw new RangeError('Rocks support at most 64 moss anchors');
  if((options.moss??true)&&mossCount>0&&anchors.length){
    const mossRandom=createRandom(s.seed^hash(`${s.id.length}:${s.id}/moss`)),moss:GroupStrokeSource[]=[];
    for(let i=0;i<mossCount;i++){
      const anchor=anchors[Math.floor(i/3)%anchors.length]!,dx=(mossRandom()-.5)*scale*.11,dy=mossRandom()*scale*.045;
      const x=anchor.x+dx,y=anchor.y+dy,reach=scale*(.02+mossRandom()*.025);
      moss.push(mark(`dab/${i}`,[{x,y,pressure:.24},{x:x+reach*.3,y:y+reach*.2,pressure:.94},{x:x+reach,y:y+reach*.35,pressure:0}],scale*(i%3===0?.05:.03),{ink:s.ink,opacity:i%3===0?.95:.7,dryness:.52,axis:'side'}));
    }
    groups.push({id:`${s.id.length}:${s.id}/moss`,role:'mark',parentId:`${s.id.length}:${s.id}/bones`,strokes:moss});
  }
  return finish('rock',groups,anchors.map((p,i)=>({id:`moss-anchor/${i}`,groupId:`${s.id.length}:${s.id}/bones`,point:p,tangent:{x:1,y:0}})),s.seed);
}

/** A small crow study. Components can be replaced with absolute authored paths. */
export function createBirdMacro(options: BirdMacroOptions = {}): SubjectMacro {
  fields(options,birdFields,'bird option');
  const s=settings(options,'bird'),size=positive(options.size??64,'size'),paper=colour(options.paper??'#f5f2e9');
  if((options.type??'crow')!=='crow')throw new RangeError('Only the crow study is available');
  const pose=options.pose??'sitting',facing=options.facing??'left';
  if(!['sitting','looking-up','looking-down'].includes(pose)||!['left','right'].includes(facing))throw new RangeError('Unknown bird pose or facing');
  let origin=point(options.position??{x:0,y:0}),angle=finite(options.angle??0,'angle');
  if(options.attachment){fields(options.attachment,['point','tangent'],'attachment');origin=point(options.attachment.point);if(options.attachment.tangent){const t=point(options.attachment.tangent);if(Math.hypot(t.x,t.y)<=0)throw new RangeError('Perch direction must be nonzero');angle+=Math.atan2(t.y,t.x);}}
  if(options.parts)fields(options.parts,birdParts,'bird part');
  const flip=facing==='left'?1:-1,c=Math.cos(angle),sn=Math.sin(angle);
  const transform=([x,y,p=1]:readonly number[]):InkPoint=>({x:origin.x+(x!*flip*c-y!*sn)*size,y:origin.y+(x!*flip*sn+y!*c)*size,pressure:p});
  const draw=(id:string,values:readonly (readonly number[])[],width:number,extra:GroupStrokeOptions={})=>mark(id,values.map(transform),width*size,{ink:s.ink,...extra});
  const h=pose==='looking-up'?[-.22,-.64]:pose==='looking-down'?[-.39,-.39]:[-.31,-.51],hx=h[0]!,hy=h[1]!;
  const beak=pose==='looking-up'?[-.12,-.2]:pose==='looking-down'?[-.22,.16]:[-.25,.045];
  const parts:Record<BirdPart,GroupStrokeSource[]>={tail:[],back:[],wing:[],head:[],beak:[],feet:[],eye:[]};
  parts.tail.push(draw('main',[[.21,-.19,.48],[.48,-.01,.9],[.9,.12,0]],.095,{dryness:.76,opacity:.9}),draw('split',[[.23,-.16,.3],[.58,.12,.7],[.84,.17,0]],.045,{dryness:.84,opacity:.64}));
  parts.back.push(draw('back-wash',[[hx*.6,hy*.8,.3],[-.02,-.4,.92],[.22,-.26,.7],[.28,-.13,0]],.35,{opacity:.3,dryness:.16}),draw('nape',[[hx,hy+.07,.3],[-.13,-.31,.8],[.04,-.31,0]],.19,{opacity:.54,dryness:.25}));
  const random=createRandom(s.seed^hash(`${s.id.length}:${s.id}/wing`));
  for(let i=0;i<5;i++){const x=-.12+i*.072,y=-.29+i*.035;parts.wing.push(draw(`feather/${i}`,[[x,y,.35],[x+.14,y+.07,.75+random()*.2],[x+.26+random()*.07,y+.15,0]],.085+random()*.035,{dryness:.58+random()*.25,opacity:.57+random()*.24}));}
  parts.head.push(draw('head',[[hx+.09,hy-.04,.3],[hx,hy,.96],[hx-.065,hy+.075,.55]],.25,{dryness:.2,opacity:.91}),draw('throat',[[hx-.02,hy+.06,.65],[hx+.06,hy+.16,.83],[hx+.15,hy+.2,0]],.13,{dryness:.4,opacity:.65}));
  parts.beak.push(draw('upper',[[hx-.06,hy+.035,.7],[hx+beak[0]!,hy+beak[1]!,0]],.035,{dryness:.76,opacity:1,smoothing:'linear'}),draw('lower',[[hx-.055,hy+.07,.65],[hx+beak[0]!*.84,hy+beak[1]!+.02,0]],.019,{dryness:.66,opacity:.9,smoothing:'linear'}));
  parts.feet.push(draw('leg',[[-.03,-.09,.25],[.01,-.015,.85],[0,0,.5]],.025,{dryness:.7,opacity:.9}),draw('toe-left',[[0,0,.75],[-.09,.01,0]],.024,{dryness:.66,opacity:1}),draw('toe-right',[[0,0,.75],[.12,.015,0]],.022,{dryness:.71,opacity:.94}));
  parts.eye.push(draw('socket',[[hx-.035,hy-.01,.2],[hx-.07,hy+.025,.7],[hx-.035,hy+.04,.35]],.065,{ink:paper,opacity:.95,dryness:.07}),draw('pupil',[[hx-.055,hy+.008,.95],[hx-.052,hy+.018,.85]],.031,{ink:s.ink,dryness:.59,opacity:1}));
  const groups:StrokeGroupSource[]=[];
  for(const part of birdParts){
    const selected=options.parts?.[part]??parts[part];
    if(!Array.isArray(selected)||selected.length>64)throw new RangeError('Each bird part supports at most 64 strokes');
    if(selected.length)groups.push({id:`${s.id.length}:${s.id}/${part}`,role:part==='feet'?'structure':'mark',strokes:selected.map(stroke=>{
      fields(stroke,['id','points','options'],'bird stroke');
      return {id:stroke.id,points:path(stroke.points),options:{ink:s.ink,...stroke.options}};
    })});
  }
  const feet=groups.find(g=>g.id===`${s.id.length}:${s.id}/feet`)??groups[0];
  return finish('bird',groups,feet?[{id:'perch',groupId:feet.id,point:origin,tangent:{x:c,y:sn}}]:[],s.seed);
}
