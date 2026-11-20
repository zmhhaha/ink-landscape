import {createInkWaterRevisionCases,createWetStageComparisons} from './ink-water-revision-fixtures.mjs';
import {createPointTextureRevisionCases,createMiPointLayerControl} from './point-texture-revision-fixtures.mjs';
import {createLineTextureRevisionCases} from './line-texture-revision-fixtures.mjs';
import {createSplitTextureRevisionCases} from './split-texture-revision-fixtures.mjs';
export const REVISION_FAMILIES=[{id:'ink',title:'积墨、破墨与用水'},{id:'points',title:'雨点、豆瓣、钉头、米点、点苔'},
  {id:'lines',title:'披麻、解索、牛毛、斧劈、折带'},{id:'split',title:'散锋、破笔点、抱石皴'}];
export const createExistingTechniqueRevisionCases=()=>[...createInkWaterRevisionCases(),...createPointTextureRevisionCases(),
  ...createLineTextureRevisionCases(),...createSplitTextureRevisionCases()];
export {createWetStageComparisons};
export {createMiPointLayerControl};
