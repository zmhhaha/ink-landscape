import { splitBristles } from '../dist/perturbation.js';
import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';

const OPTIONS = Object.freeze({ width: 360, height: 280, seed: 20261120, background: '#f5f2e9' });
const p = coordinates => coordinates.map(([x, y, pressure = .7]) => ({ x, y, pressure }));
const style = { ink: '#30352d', duration: 0, smoothing: 'linear', gestureModel: 'local-v1' };
const transform = (path, move) => path.map(point => ({ ...point, ...move(point) }));

function bundleGroup(id, path, parameters, improved, clip) {
  const options = {
    seed: parameters.seed, spread: parameters.spread, width: parameters.width,
    opacity: parameters.opacity ?? .86, variance: parameters.variance ?? .55, spacing: 1.7,
    ...(improved ? { dynamics: 'contact-lag-v1', lag: parameters.lag ?? parameters.spread * .9, release: 1, breakup: .72 } : {}),
  };
  const strands = splitBristles(path, parameters.count, options);
  const group = { id, role: 'mark', strokes: strands.map(strand => ({
    id: strand.id, points: strand.points,
    options: { ...style, width: strand.width, opacity: strand.opacity,
      dryness: strand.id === 'bristle-0' ? .51 : .71, axis: 'center', ...(clip ? { clip } : {}),
    },
  })) };
  return { group, source: { id, path, count: parameters.count, options } };
}

function splitFlow(transfer, improved) {
  const path = p([[37, 228, .2], [124, 198, .9], [174, 101, .75], [304, 46, 0]]);
  const moved = transfer ? transform(path, point => ({ x: 332 - point.x * .85, y: 15 + (280 - point.y) * .81 })) : path;
  const bundle = bundleGroup('turn-and-release', moved,
    { count: 8, seed: OPTIONS.seed ^ 3917, spread: 46, width: 7.8 }, improved);
  return { paths: [moved], groups: [bundle.group], bundles: [bundle.source] };
}

function brokenPoints(transfer, improved) {
  // A short press-and-lift is shared by all members; these are contacts, not long hatch strokes.
  const anchors = transfer
    ? [[88,65,-.5,1.1],[116,83,.05,.75],[94,111,.3,.85],[201,128,.7,1],[222,147,.9,.7],[247,144,.3,.66],[274,166,.55,.9]]
    : [[80,125,.1,1.1],[110,105,-.35,.8],[108,139,.35,.7],[216,120,.4,.9],[242,139,.05,1],[267,126,-.2,.68],[276,154,.45,.8]];
  const paths = anchors.map(([x,y,angle,scale]) => p([[0,0,.18],[1,5.4,.98],[-.8,11.5,.7],[1.5,17,0]])
    .map(point => ({ ...point, x: x + scale*(point.x*Math.cos(angle)-point.y*Math.sin(angle)),
      y: y + scale*(point.x*Math.sin(angle)+point.y*Math.cos(angle)) })));
  const bundles = paths.map((path,i) => bundleGroup('broken-contact-'+i, path,
    { count: 5, seed: OPTIONS.seed ^ (0x32a1 + i*977), spread: 19*anchors[i][3], width: 6.3*anchors[i][3], variance: .65 }, improved));
  return { paths, groups: bundles.map(b=>b.group), bundles: bundles.map(b=>b.source) };
}

function baoshiGroup(transfer, improved) {
  const region = p([[50,235],[74,139],[128,57],[180,48],[225,101],[299,149],[317,233]]).map(({x,y})=>({x,y}));
  const bone = p([[51,235,.2],[76,139,.75],[129,57,.55],[180,48,.5],[225,101,.7],[299,149,.38],[317,233,0]]);
  const paths = [
    p([[94,130,.15],[108,164,.86],[106,211,0]]),
    p([[137,76,.15],[148,126,.9],[128,188,0]]),
    p([[172,75,.1],[188,131,.95],[170,188,0]]),
    p([[198,125,.15],[215,150,.82],[266,197,0]]),
    p([[159,162,.15],[194,184,.7],[234,208,0]]),
  ];
  const move = transfer ? point => ({ x: 325-(point.x-35)*.94, y: 7+point.y*.94+(point.x-180)*.15 }) : point => ({x:point.x,y:point.y});
  const clip = region.map(move);
  const moved = paths.map(path=>transform(path,move));
  const common = [
    { id:'pale-surface',role:'structure',strokes: [
      p([[126,92,.1],[155,143,.75],[142,222,.1]]),
      p([[197,127,.1],[228,165,.7],[284,214,.1]]),
    ].map((path,i)=>({id:'wash-'+i,points:transform(path,move),options:{...style,width:47,axis:'side',opacity:.13,dryness:.37,clip}})) },
    { id:'surface-bone',role:'structure',strokes:[{id:'open-outline',points:transform(bone,move),options:{...style,width:2.5,opacity:.62,dryness:.65}}] },
  ];
  const accents = p([[134,199,.15],[140,201,.85],[145,207,0]]);
  const bundles=moved.map((path,i)=>bundleGroup('surface-flow-'+i,path,
    {count:7,seed:OPTIONS.seed^(0x605e+i*977),spread:[29,34,33,26,22][i],width:[4.8,5.2,4.5,4.2,3.3][i]},improved,clip));
  return { paths:moved, bundles:bundles.map(b=>b.source), groups:[...common,
    ...bundles.map(b=>b.group),
    {id:'aggregate-points',role:'mark',strokes:[{id:'dark-node',points:transform(accents,move),options:{...style,width:10,opacity:.78,dryness:.64,axis:'side',clip}}]},
  ] };
}

const cases = [
  { id:'split-turn-release', title:'散锋 · 转折滞后与提笔收束', techniques:['brush-split'], make:splitFlow,
    observation:'固定主笔路、提按、束数与材质；比较副毫转向滞后、不同起落长度、断墨和末端收束。',
    limits:'路径历史只近似转向关系，不是笔毫受力或墨液求解。主毫沿原笔路，副毫可逐段编辑。' },
  { id:'broken-contact', title:'破笔点 · 短触分束与断白', techniques:['leaf-broken'], make:brokenPoints,
    observation:'同一组短促按提点比较旧分束和随受压开合的短触；换一组附着位置与方向再观察。',
    limits:'这里研究破笔点的接触形态；不把破笔点等同破墨，也不规定所有点叶必须采用此形。' },
  { id:'baoshi-composite', title:'抱石皴研究 · 顺势线、交线与聚点', techniques:['cun-baoshi'], make:baoshiGroup,
    observation:'岩形、底墨、骨线、聚点和五条主笔路固定；新束围绕局部笔势聚散，交线偏斜相搭，换形后复检。',
    limits:'抱石皴是综合用笔，此处只改散锋接触与线面点组织的一个层次，不代表傅抱石画风复现。' },
];

export function createSplitTextureRevisionCases() {
  return cases.map(item=>{
    const before=item.make(false,false),after=item.make(false,true);
    const transferredBefore=item.make(true,false),transferred=item.make(true,true);
    const document=groups=>createStrokeGroupDocument(groups,OPTIONS);
    return {id:item.id,title:item.title,family:'split',techniques:item.techniques,
      baseline:document(before.groups),improved:document(after.groups),
      transferBaseline:document(transferredBefore.groups),transfer:document(transferred.groups),
      observation:item.observation,limits:item.limits,
      authoring:{version:1,generator:'split-texture-revision-v1',dynamics:'contact-lag-v1',seed:OPTIONS.seed,
        originalPaths:after.paths,transferPaths:transferred.paths,
        originalBundles:after.bundles,transferBundles:transferred.bundles},
    };
  });
}
