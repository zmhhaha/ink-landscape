/** Stable serialized IDs. Display names and historical confidence live in the catalog. */
export const CUN_TECHNIQUES = Object.freeze([
  'pima', 'axe', 'zhedai', 'jiesuo', 'luanchai', 'niumao',
  'cloud-study', 'point-study', 'heye',
] as const);

export type CunTechnique = typeof CUN_TECHNIQUES[number];

/** Existing region generation implements only these two methods. */
export const REGION_CUN_TECHNIQUES = Object.freeze(['pima', 'axe'] as const satisfies readonly CunTechnique[]);
export type RegionCunTechnique = typeof REGION_CUN_TECHNIQUES[number];

/** Authored-path documents currently support every canonical ID. */
export const AUTHORED_CUN_TECHNIQUES = CUN_TECHNIQUES;

export function isRegionCunTechnique(value: unknown): value is RegionCunTechnique {
  return typeof value === 'string' && (REGION_CUN_TECHNIQUES as readonly string[]).includes(value);
}

export function isAuthoredCunTechnique(value: unknown): value is CunTechnique {
  return typeof value === 'string' && (AUTHORED_CUN_TECHNIQUES as readonly string[]).includes(value);
}
