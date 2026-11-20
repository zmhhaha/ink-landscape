import { createCunDocument } from './cun-document.js';
import type { CunTechnique, CunStrokeSource } from './cun-document.js';
import { createStrokeGroupDocument } from './stroke-group-document.js';
import type { StrokeGroupOptions, StrokeGroupSource } from './stroke-group-document.js';
import { sampleStrokePath } from './path.js';
import { createNoise1D } from './perturbation.js';
import type { InkPoint, InkScene, StrokeMark, StrokePathSample, Vec2 } from './types.js';

export type SurfaceCunTechnique = Extract<CunTechnique, 'pima' | 'jiesuo' | 'niumao' | 'axe' | 'zhedai'>;
export interface SurfaceCunSite {
  readonly id: string;
  /** Position along the authored flow/stratum guide, 0..1. */
  readonly at: number;
  /** Signed transverse offset in scene units. */
  readonly offset: number;
  readonly length: number;
  readonly width?: number;
  readonly tone?: 'wash' | 'body' | 'accent';
}
export interface CunSurfaceSource {
  readonly id: string;
  readonly region: readonly Vec2[];
  /** Down-slope path for long cun, or a stratum path for folded cun. */
  readonly flow: readonly InkPoint[];
  /** Axe marks start along this fracture when provided. */
  readonly fracture?: readonly InkPoint[];
  /** Paper openings; generated contacts lift before reaching these regions. */
  readonly reserves?: readonly (readonly Vec2[])[];
  readonly sites: readonly SurfaceCunSite[];
}
export interface SurfaceCunOptions extends StrokeGroupOptions {
  readonly technique: SurfaceCunTechnique;
  readonly idPrefix?: string;
}
export interface SurfaceCunRecipe {
  readonly version: 1;
  readonly generator: 'ink-surface-cun-v1';
  readonly surfaces: readonly CunSurfaceSource[];
  readonly options: SurfaceCunOptions;
}
export interface SurfaceCunDocument {
  readonly version: 1;
  readonly recipe: SurfaceCunRecipe;
  readonly groups: readonly StrokeGroupSource[];
  readonly result: InkScene;
}
const techniques = ['pima', 'jiesuo', 'niumao', 'axe', 'zhedai'];
function fields(value: object, keys: readonly string[], name: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const [key, item] of Object.entries(value)) if (!keys.includes(key) || item === null) throw new RangeError(`Unsupported ${name} field: ${key}`);
}
function finite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: number, name: string): number {
  if (finite(value, name) <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}
function identity(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Surface and site IDs must be nonempty');
  return value;
}
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}
function polygon(points: readonly Vec2[]): readonly Vec2[] {
  if (!Array.isArray(points) || points.length < 3 || points.length > 256) throw new RangeError('A surface polygon needs 3..256 vertices');
  return Object.freeze(points.map(p => {
    fields(p, ['x', 'y'], 'surface vertex');
    return Object.freeze({ x: finite(p.x, 'x'), y: finite(p.y, 'y') });
  }));
}
function path(points: readonly InkPoint[]): readonly InkPoint[] {
  if (!Array.isArray(points) || points.length < 2 || points.length > 512) throw new RangeError('A surface guide needs 2..512 points');
  const owned = points.map(p => {
    fields(p, ['x', 'y', 'pressure'], 'surface guide point');
    if (p.pressure !== undefined && (finite(p.pressure, 'pressure') < 0 || p.pressure > 1)) throw new RangeError('Guide pressure must be in 0..1');
    return Object.freeze({ x: finite(p.x, 'x'), y: finite(p.y, 'y'), ...(p.pressure === undefined ? {} : { pressure: p.pressure }) });
  });
  if (sampleStrokePath(owned, { spacing: Number.MAX_VALUE }).at(-1)!.distance <= 1e-6) throw new RangeError('Surface guides need length');
  return Object.freeze(owned);
}
function inside(point: Vec2, vertices: readonly Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!, b = vertices[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
function distance(point: Vec2, vertices: readonly Vec2[]): number {
  let nearest = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const dx = b.x - a.x, dy = b.y - a.y, d = dx * dx + dy * dy;
    const t = d > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / d)) : 0;
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return nearest;
}
function sampleAt(samples: readonly StrokePathSample[], at: number): StrokePathSample {
  const atDistance = Math.max(0, Math.min(1, at)) * samples.at(-1)!.distance;
  let index = 0;
  while (index < samples.length - 2 && samples[index + 1]!.distance < atDistance) index++;
  const a = samples[index]!, b = samples[index + 1]!;
  const t = (atDistance - a.distance) / (b.distance - a.distance || 1);
  const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, norm = Math.hypot(nx, ny) || 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
    nx: nx / norm, ny: ny / norm, distance: atDistance, pressure: a.pressure + (b.pressure - a.pressure) * t };
}
function ownedSurfaces(values: readonly CunSurfaceSource[]): readonly CunSurfaceSource[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 16) throw new RangeError('Surface cun needs 1..16 surfaces');
  let count = 0;
  const ids = new Set<string>();
  return Object.freeze(values.map(source => {
    fields(source, ['id', 'region', 'flow', 'fracture', 'reserves', 'sites'], 'cun surface');
    const id = identity(source.id);
    if (ids.has(id)) throw new RangeError('Duplicate cun surface ID');
    ids.add(id);
    if (!Array.isArray(source.sites) || source.sites.length < 1 || (count += source.sites.length) > 512) throw new RangeError('Surface cun supports 1..512 total sites');
    const siteIds = new Set<string>();
    const sites = source.sites.map((site: SurfaceCunSite) => {
      fields(site, ['id', 'at', 'offset', 'length', 'width', 'tone'], 'surface cun site');
      const id = identity(site.id);
      if (siteIds.has(id)) throw new RangeError('Duplicate surface site ID');
      siteIds.add(id);
      if (finite(site.at, 'site.at') < 0 || site.at >= 1) throw new RangeError('site.at must be in 0..1, excluding 1');
      finite(site.offset, 'site.offset'); positive(site.length, 'site.length');
      if (site.width !== undefined) positive(site.width, 'site.width');
      if (site.tone !== undefined && !['wash', 'body', 'accent'].includes(site.tone)) throw new RangeError('Unknown surface tone');
      return Object.freeze({ ...site });
    });
    if (source.reserves !== undefined && (!Array.isArray(source.reserves) || source.reserves.length > 16)) throw new RangeError('Surface reserves support at most 16 polygons');
    return Object.freeze({ id, region: polygon(source.region), flow: path(source.flow), sites: Object.freeze(sites),
      ...(source.fracture === undefined ? {} : { fracture: path(source.fracture) }),
      ...(source.reserves === undefined ? {} : { reserves: Object.freeze(source.reserves.map(polygon)) }) });
  }));
}

/** Structure-aware opt-in organization; existing cun contact/default recipes are unchanged. */
export function createSurfaceCunDocument(surfaces: readonly CunSurfaceSource[], options: SurfaceCunOptions): SurfaceCunDocument {
  fields(options, ['technique', 'idPrefix', 'width', 'height', 'seed', 'background', 'ink', 'strokeWidth', 'dryness', 'opacity'], 'surface cun option');
  if (!techniques.includes(options.technique)) throw new RangeError('Unsupported surface cun technique');
  const { technique, idPrefix = 'surface-cun', ...sceneOptions } = options;
  identity(idPrefix);
  const checked = createStrokeGroupDocument([], sceneOptions).recipe.options;
  const owned = ownedSurfaces(surfaces), groups: StrokeGroupSource[] = [];
  const canonical = Object.freeze({ ...checked, technique, idPrefix });
  for (const surface of owned) {
    const groupId = `${idPrefix.length}:${idPrefix}/${surface.id.length}:${surface.id}`;
    const guide = technique === 'axe' && surface.fracture ? surface.fracture : surface.flow;
    const length = sampleStrokePath(guide, { spacing: Number.MAX_VALUE }).at(-1)!.distance;
    const samples = sampleStrokePath(guide, { spacing: Math.max(length / 256, .01) });
    const strokes: CunStrokeSource[] = surface.sites.map(site => {
      const key = `${groupId}/${site.id.length}:${site.id}`;
      const noise = createNoise1D((checked.seed ?? 1) ^ hash(key));
      const baseWidth = site.width ?? checked.strokeWidth ?? ({ pima: 3.9, jiesuo: 3.3, niumao: 1.7, axe: 15, zhedai: 7.8 }[technique]);
      const span = Math.min(site.length, length * (1 - site.at));
      const count = Math.max(8, Math.min(128, Math.ceil(span / 2.4)));
      const positions = technique === 'zhedai' ? [0, .33, .38, .49, .78, .83, 1] : Array.from({ length: count + 1 }, (_, i) => i / count);
      const points = positions.map(t => {
        const p = sampleAt(samples, site.at + span * t / length);
        const wave = technique === 'jiesuo' ? .74 * noise(t * 4.3 + 13.41) + .26 * noise(t * 9.7 + 63.2)
          : noise(t * 1.7 + 13.41);
        let cross = site.offset + wave * span * (technique === 'jiesuo' ? .11 : technique === 'niumao' ? .055 : .025);
        if (technique === 'pima' || technique === 'jiesuo' || technique === 'niumao') cross += noise(t * 22.7 + 93.4) * Math.min(.38, baseWidth * .12);
        if (technique === 'zhedai') cross = site.offset + span * (t < .38 ? 0 : t < .49 ? (t - .38) / .11 * .2 : .2);
        if (technique === 'axe') cross += span * .18 * t;
        const position = { x: p.x + p.nx * cross, y: p.y + p.ny * cross };
        const reserve = (surface.reserves ?? []).some(region => inside(position, region) || distance(position, region) < baseWidth * 1.2);
        const profile = .22 + .7 * Math.pow(Math.max(0, 4 * t * (1 - t)), .65);
        const pressure = t === 1 || reserve || !inside(position, surface.region) ? 0 : p.pressure * profile * (.86 + noise(t * 7.1 + 43.2) * .16);
        return { ...position, pressure };
      });
      const tone = site.tone ?? 'body';
      const opacity = ({ wash: .24, body: .53, accent: .88 }[tone]) * (checked.opacity ?? 1);
      const dryness = checked.dryness ?? (tone === 'wash' ? .77 : technique === 'axe' ? .65 : .55);
      return { id: site.id, points, options: { width: baseWidth, opacity, dryness, clip: surface.region,
        start: 0, duration: 0, ...(technique === 'zhedai' ? { smoothing: 'linear', turn: 'preserve' } : {}) } };
    });
    // Resolve existing cun contacts once, then keep their concrete ordinary source.
    const cun = createCunDocument(strokes, { width: checked.width, height: checked.height, technique,
      seed: checked.seed ?? 1, background: checked.background ?? '#f5f2e9', ink: checked.ink ?? '#252820' });
    groups.push({ id: groupId, role: 'mark', strokes: cun.result.marks.filter((mark): mark is StrokeMark => mark.kind === 'stroke').map(mark => ({ id: mark.id, points: mark.points,
      options: { width: mark.width, opacity: mark.opacity, dryness: mark.dryness, ink: mark.ink,
        smoothing: mark.smoothing ?? 'linear', axis: 'center', gestureModel: 'local-v1', start: 0, duration: 0,
        ...(mark.brush ? { controls: mark.brush.controls } : {}), ...(mark.clip ? { clip: mark.clip } : {}) },
    })) });
  }
  const result = createStrokeGroupDocument(groups, checked);
  const recipe: SurfaceCunRecipe = Object.freeze({ version: 1, generator: 'ink-surface-cun-v1', surfaces: owned, options: canonical });
  return Object.freeze({ version: 1, recipe, groups: result.recipe.groups, result: result.result });
}

export function compileSurfaceCunRecipe(recipe: SurfaceCunRecipe): InkScene {
  fields(recipe, ['version', 'generator', 'surfaces', 'options'], 'surface cun recipe');
  if (recipe.version !== 1 || recipe.generator !== 'ink-surface-cun-v1') throw new RangeError('Unsupported surface cun recipe');
  return createSurfaceCunDocument(recipe.surfaces, recipe.options).result;
}
export function reviseSurfaceCunDocument(document: SurfaceCunDocument, patch: { readonly surfaces?: readonly CunSurfaceSource[]; readonly options?: Partial<SurfaceCunOptions> }): SurfaceCunDocument {
  fields(document, ['version', 'recipe', 'groups', 'result'], 'surface cun document');
  if (document.version !== 1) throw new RangeError('Unsupported surface cun document');
  fields(patch, ['surfaces', 'options'], 'surface cun patch');
  compileSurfaceCunRecipe(document.recipe);
  return createSurfaceCunDocument(patch.surfaces ?? document.recipe.surfaces, { ...document.recipe.options, ...patch.options });
}
