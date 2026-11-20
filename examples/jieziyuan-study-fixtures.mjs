import { createBarkDocument, createSurfaceCunDocument, createCunDocument,
  createStrokeGroupDocument } from '../dist/index.js';
import { authoredBranchAttachment, authoredGrowthLeaf, authoredPathTexture } from './authored-study-path.mjs';

// Original author studies of organization, not traced facsimiles or historical presets.
// All geometry, including attachments and paper openings, remains in ordinary source.
const common = Object.freeze({ width: 360, height: 280, seed: 20261120,
  background: '#f5f2e9', ink: '#252820' });
const P = values => values.map(([x, y, pressure = .72]) => ({ x, y, pressure }));
const V = values => values.map(([x, y]) => ({ x, y }));
const treeDirectory = 'https://i.cafa.edu.cn/waterprint/ch/chanciebwnl/?x=300002003';
const stoneDirectory = 'https://i.cafa.edu.cn/waterprint/ch/chanciebwnl/?x=300002004';
const bookRecord = 'https://i.cafa.edu.cn/waterprint/ch/chancieb/?ai=300002';
const preview = number => `https://yihua.art/wp-content/uploads/2022/02/jzycjwjkx-${number}.jpg`;
const compile = groups => createStrokeGroupDocument(groups, common);
const stroke = (id, values, width, extra = {}) => ({ id, points: P(values), options: {
  width, dryness: .55, opacity: .74, axis: 'center', gestureModel: 'local-v1',
  smoothing: 'catmull-rom', duration: 0, ...extra,
} });
function transformedGroups(groups, move) {
  return groups.map(group => ({ ...group, strokes: group.strokes.map(s => ({ ...s,
    points: s.points.map(move), options: { ...s.options,
      ...(s.options.clip ? { clip: s.options.clip.map(move) } : {}),
    },
  })) }));
}

// Each tree keeps the same eight branch paths and contour material. Placement,
// lean, scale, tone and overlap are explicit author decisions at group level.
const treeSkeleton = [
  { id: 'trunk', points: P([[0,0,.9],[-6,-35,.86],[1,-74,.84],[-5,-110,.76],[4,-147,.62],[-1,-177,.42],[7,-195,0]]),
    width: [{ at: 0, width: 15 }, { at: .38, width: 10 }, { at: .75, width: 5 }, { at: 1, width: .4 }],
    junctions: [{ id: 'left-opening', at: .4, side: -1, span: .07 }, { id: 'right-opening', at: .58, side: 1, span: .06 }] },
  { id: 'left-limb', points: P([[1,-74,.8],[-24,-94,.74],[-37,-120,.6],[-62,-136,.3],[-69,-149,0]]), width: 6 },
  { id: 'right-limb', points: P([[-5,-110,.7],[26,-128,.65],[37,-151,.4],[62,-167,0]]), width: 5 },
  { id: 'upper-left', points: P([[4,-147,.65],[-19,-163,.52],[-31,-183,0]]), width: 3.6 },
  { id: 'left-fork', points: P([[-37,-120,.57],[-29,-142,.48],[-37,-163,0]]), width: 2.8 },
  { id: 'right-fork', points: P([[37,-151,.55],[59,-146,.4],[77,-153,0]]), width: 2.5 },
  { id: 'low-twig', points: P([[-24,-94,.5],[-52,-101,.38],[-69,-118,0]]), width: 2.4 },
  { id: 'tip-twig', points: P([[-1,-177,.48],[22,-184,.35],[31,-199,0]]), width: 2.2 },
];
function treeGroups({ id, x, y, scale, lean = 0, mirror = 1, opacity = 1, bend = 0 }) {
  const move = p => ({ ...p, x: x + scale * (mirror * p.x - p.y * lean + bend * (p.y / 200) ** 2), y: y + p.y * scale });
  const shaped = branch => P(authoredPathTexture(branch.points.map(p => [p.x,p.y,p.pressure]),
    'book-tree/' + branch.id, { step: 4, amplitude: .65, smooth: true })).map(move);
  const branches = treeSkeleton.slice(0,3).map(branch => ({ ...branch, points: shaped(branch),
    width: typeof branch.width === 'number' ? branch.width * scale
      : branch.width.map(control => ({ ...control, width: control.width * scale })),
  }));
  const contours = createBarkDocument(branches, { ...common, idPrefix: id, contourWidth: .105,
    strokeWidth: 3.1 * scale, opacity, textureStrength: 0 }).groups;
  // Small branches turn into single tapered contacts rather than two parallel
  // contour rails. Their authored junctions are unchanged by path sampling.
  return [...contours, { id:id+'/single-twigs',role:'structure',strokes:treeSkeleton.slice(3).map(branch => ({
    id:branch.id,points:shaped(branch),options:{width:2.8*scale,opacity:.75*opacity,dryness:.63,
      smoothing:'catmull-rom',axis:'center',gestureModel:'local-v1',duration:0},
  })) }];
}
function grove(organized, transfer) {
  const placements = organized
    ? transfer
      ? [{ x: 226, y: 247, scale: .99, lean: -.15, mirror: -1, opacity: 1, bend: -10 },
        { x: 119, y: 230, scale: .7, lean: -.28, mirror: 1, opacity: .76, bend: 10 },
        { x: 272, y: 235, scale: .48, lean: .2, mirror: -1, opacity: .62, bend: -6 }]
      : [{ x: 142, y: 248, scale: 1, lean: -.03, mirror: 1, opacity: 1 },
        { x: 236, y: 232, scale: .71, lean: .2, mirror: -1, opacity: .78 },
        { x: 92, y: 237, scale: .48, lean: -.24, mirror: -1, opacity: .62 }]
    : [91, 180, 269].map(x => ({ x, y: 244, scale: .83, lean: transfer ? -.13 : 0,
      mirror: transfer ? -1 : 1, opacity: .85, bend: transfer ? -9 : 0 }));
  // Rear trees are drawn first. No opaque white shapes erase intersections.
  const groups = placements.map((p, i) => treeGroups({ ...p, id: 'tree-' + i })).reverse().flat();
  return compile(groups);
}

const outer = V([[43,237],[58,172],[92,139],[118,91],[174,71],[207,101],[215,135],[264,150],[305,201],[317,241]]);
const rockFaces = [
  { id: 'top', region: V([[92,139],[118,91],[174,71],[207,101],[193,135],[154,124]]),
    flow: P([[119,98,1],[151,106,1],[179,120,1],[194,132,1]]),
    sites: [[.12,-11,27,2,'wash'],[.22,1,30,2.3,'wash'],[.4,-8,25,2.2,'body'],[.55,3,22,1.9,'wash']] },
  { id: 'front', region: V([[43,237],[58,172],[92,139],[154,124],[185,157],[172,208],[190,241]]),
    flow: P([[125,137,1],[112,168,1],[93,196,1],[83,233,1]]),
    sites: [[.03,-19,78,3.2,'wash'],[.08,-7,81,3.1,'body'],[.12,7,73,3.4,'body'],[.2,20,64,3.1,'wash'],
      [.27,-30,61,3,'body'],[.31,-19,54,3.3,'body'],[.34,-4,63,3.5,'accent'],[.4,12,52,2.8,'wash'],
      [.48,25,43,3.1,'body'],[.54,-24,39,3.3,'body'],[.64,-11,34,3.4,'accent'],[.71,6,26,2.7,'wash']] },
  { id: 'side', region: V([[154,124],[193,135],[215,135],[264,150],[305,201],[317,241],[190,241],[172,208],[185,157]]),
    flow: P([[199,144,1],[218,173,1],[242,203,1],[268,238,1]]),
    sites: [[.02,-11,83,3.2,'body'],[.03,1,83,3.6,'accent'],[.06,14,77,3.3,'body'],[.12,-23,77,3.1,'wash'],
      [.18,27,70,3.6,'accent'],[.23,4,67,3.2,'body'],[.27,-11,64,3.1,'body'],[.32,19,58,3.4,'accent'],
      [.4,-29,52,3.2,'wash'],[.46,-4,46,3.5,'body'],[.52,29,42,3.2,'accent'],[.6,13,35,3.4,'body'],
      [.69,-18,29,3,'body'],[.76,1,22,3.2,'wash']] },
];
function rockMove(p) { return { ...p, x: 353 - p.x + (p.y - 158) * .11, y: 35 + p.y * .83 + (p.x - 180) * .07 }; }
const toneOpacity = { wash: .24, body: .53, accent: .88 };
function flattenCun(document, id) {
  return { id, role: 'mark', strokes: document.result.marks.map(mark => ({ id: mark.id, points: mark.points,
    options: { width: mark.width, opacity: mark.opacity, dryness: mark.dryness, ink: mark.ink,
      smoothing: mark.smoothing ?? 'linear', axis: 'center', gestureModel: 'local-v1', duration: 0,
      ...(mark.brush ? { controls: mark.brush.controls } : {}), ...(mark.clip ? { clip: mark.clip } : {}),
    },
  })) };
}
function rock(organized, transfer) {
  const move = transfer ? rockMove : p => ({ ...p });
  const bones = [{ id: 'rock-bones', role: 'structure', strokes: [
    stroke('outer-left', outer.slice(0, 6).map(p => [p.x,p.y]), 3, { smoothing: 'linear' }),
    stroke('outer-right', outer.slice(5).map(p => [p.x,p.y]), 2.6, { smoothing: 'linear', opacity: .55 }),
    ...(organized ? [stroke('front-ridge', [[174,71,.28],[154,124,.8],[185,157,.76],[172,208,.52],[190,241,0]], 2.7, { smoothing: 'linear' }),
      stroke('cap-ridge', [[92,139,0],[154,124,.7],[193,135,.6],[215,135,.25]], 2.4, { smoothing: 'linear', opacity: .57 })] : []),
  ] }];
  let groups;
  if (organized) {
    const surfaces = rockFaces.map(face => ({ id: face.id, region: face.region, flow: face.flow,
      sites: face.sites.map(([at,offset,length,width,tone], i) => ({ id: 'cun-' + i, at, offset, length, width, tone })) }));
    groups = createSurfaceCunDocument(surfaces, { ...common, technique: 'pima', idPrefix: 'rock-cun' }).groups;
  } else {
    // Same 30 primary cun contacts and per-contact material roles; directions
    // and positions ignore faces. This is an authored uniform control.
    const sites = rockFaces.flatMap(face => face.sites);
    const contacts = sites.map(([, , length,width,tone], i) => {
      const x = 66 + i % 6 * 43, y = 116 + Math.floor(i / 6) * 23;
      return { id: 'cun-' + i, points: P([[x,y,.22],[x+3,y+length*.35,.86],[x-2,y+length*.72,.6],[x,y+length,0]]),
        options: { width, opacity: toneOpacity[tone], dryness: tone === 'wash' ? .77 : .55, clip: outer, duration: 0 } };
    });
    groups = [flattenCun(createCunDocument(contacts, { ...common, technique: 'pima' }), 'uniform-cun')];
  }
  return compile(transformedGroups([...groups, ...bones], move));
}

// Both columns have identical branches and 44 identical leaf contacts. Only
// attachment positions and directions change: six explicit groups vs one leaf
// at every equally spaced station. No point count is attributed to the book.
const leafBranches = [
  [[170,250,.88],[173,196,.8],[166,151,.7],[177,106,.65],[160,69,.3],[168,40,0]],
  [[166,151,.68],[130,126,.6],[101,111,.46],[73,91,.36],[47,87,0]],
  [[177,106,.66],[209,87,.56],[241,78,.44],[268,57,.25],[290,50,0]],
  [[173,196,.64],[204,171,.58],[232,158,.42],[259,139,.3],[286,132,0]],
  [[166,151,.62],[143,171,.51],[111,184,.4],[82,196,.28],[54,195,0]],
];
const leafRoots = [
  { branch: 1, at: [73,91], count: 8, angle: -.3 },
  { branch: 1, at: [130,126], count: 6, angle: .1 },
  { branch: 0, at: [160,69], count: 7, angle: -.2 },
  { branch: 2, at: [241,78], count: 9, angle: .08 },
  { branch: 3, at: [259,139], count: 8, angle: .25 },
  { branch: 4, at: [82,196], count: 6, angle: -.1 },
];
function station(values, t) {
  const lengths = [0];
  for (let i=1;i<values.length;i++) lengths.push(lengths.at(-1)+Math.hypot(values[i][0]-values[i-1][0],values[i][1]-values[i-1][1]));
  const target = t * lengths.at(-1); let i=1;
  while (i < lengths.length-1 && lengths[i] < target) i++;
  const a=values[i-1],b=values[i],d=lengths[i]-lengths[i-1],q=(target-lengths[i-1])/d;
  return { x:a[0]+(b[0]-a[0])*q,y:a[1]+(b[1]-a[1])*q,tx:(b[0]-a[0])/d,ty:(b[1]-a[1])/d,
    nx:-(b[1]-a[1])/d,ny:(b[0]-a[0])/d };
}
function rootFraction(values, root) {
  let total=0, at=0;
  for(let i=1;i<values.length;i++) {
    total+=Math.hypot(values[i][0]-values[i-1][0],values[i][1]-values[i-1][1]);
    if(values[i][0]===root[0] && values[i][1]===root[1]) at=total;
  }
  return at/total;
}
function leafMove(p) { return { ...p, x: 345-p.x+(p.y-140)*.12, y: 26+p.y*.86+(p.x-170)*.08 }; }
function leaves(organized, transfer) {
  const structure = { id:'leaf-branches', role:'structure', strokes:leafBranches.map((p,i) => stroke('branch-'+i,p, i ? 3 : 4.4)) };
  const leafGroups = []; let serial=0;
  for (const [index, root] of leafRoots.entries()) {
    const frame = authoredBranchAttachment(leafBranches[root.branch],root.at);
    const rootAt = rootFraction(leafBranches[root.branch],root.at);
    const marks=[];
    for(let j=0;j<root.count;j++,serial++) {
      // Several neighboring branch stations make a leafy mass. Sharing one
      // root for every contact would make a regular radial flower stamp.
      const close = station(leafBranches[root.branch], Math.max(.04,Math.min(.99,
        rootAt+[-.06,.03,-.11,.09,0,-.16,.05,-.035,.13][j])));
      const anchor = organized ? { ...close, tx:frame.tx,ty:frame.ty,nx:frame.nx,ny:frame.ny }
        : station(leafBranches[1 + serial % 4], .08 + Math.floor(serial / 4) * .083);
      const spread = organized ? [-1.18,.82,-.65,1.32,-.15,-1.43,.46,1.1,-.95][j]+root.angle : (serial%2 ? .7 : -.7);
      const contact=authoredGrowthLeaf(anchor,{ length:[24,19,27,17,22,18,25,20,23][j], spread, curl:j%2 ? 1.3 : -.8, stem:2 });
      marks.push(stroke('leaf-'+j,contact.values,[7.5,6.6,8.4,6.3,7.3,6.8,7.6,6.5,7.1][j],{
        axis:'side',dryness:.38,opacity:[.87,.65,.91,.57,.78,.61,.82,.7,.73][j],
        controls:[{at:0,pressure:.18,side:.1,angle:1.48},{at:.2,pressure:.65,side:.28,angle:1.4},
          {at:.47,pressure:1,side:.45,angle:1.46},{at:.78,pressure:.63,side:.22,angle:1.56},
          {at:1,pressure:.02,side:.02,angle:1.5}],
      }));
    }
    leafGroups.push({id:'leaf-group-'+index,role:'mark',parentId:'leaf-branches',strokes:marks});
  }
  const groups=[structure,...leafGroups];
  return compile(transfer ? transformedGroups(groups,leafMove) : groups);
}

export function createJieziyuanStudies() {
  return [
    { id:'unequal-grove',title:'树法 · 三株参差与主副',
      baseline:grove(false,false),improved:grove(true,false),transferBaseline:grove(false,true),transfer:grove(true,true),
      observation:'图示观察：二株、三株的根位、高低和枝势错开，树与树相互照应。转译：保持三套八枝骨架，改变整树尺度、倾向、前后笔序和墨色。',
      limits:'两列都是本轮创作的控制组，非旧版截图；并非只改变一个参数。枝形不是图版描摹，远近墨色是程序作者假设，不从刻印图反推真实含水或腕法。',
      evidence:[{title:'《芥子园画传》公开图1（二次分发）',url:preview(1),locator:'右「二株畫法」、左「三株畫法」；「互相顧盼」「必須左右互讓」'},
        {title:'央美树谱目录',url:treeDirectory,locator:'206「二株參差」；207「三株對立法」；不同底本不混作同页'}],
    },
    { id:'rock-faces',title:'石法 · 骨线分面与随面皴擦',
      baseline:rock(false,false),improved:rock(true,false),transferBaseline:rock(false,true),transfer:rock(true,true),
      observation:'先分清石面的折向，再让既有披麻接触随各面下落，顶面少皴、侧面较重。两列保留同一外形和30条主皴笔及逐笔墨色角色；分面列另加两条内部骨线。',
      limits:'「石分三面」原文目前据央美机构介绍转引；本例面形与披麻分配为作者转译，不声称原书这一图就是披麻，也不把三面当成每块石头固定的三个多边形。',
      evidence:[{title:'央美《芥子园画传》介绍',url:bookRecord,locator:'「画石起手当分三面法」段；机构文章转引原书'},
        {title:'《芥子园画传》公开图5（二次分发）',url:preview(5),locator:'左大斧劈、右解索；借鉴随形分组，未把它们改名为披麻'},
        {title:'央美石谱目录',url:stoneDirectory,locator:'304石法与309皴法缩略图；正文未据小图转录'}],
    },
    { id:'leaf-openings',title:'叶法 · 沿枝成团与露枝留空',
      baseline:leaves(false,false),improved:leaves(true,false),transferBaseline:leaves(false,true),transfer:leaves(true,true),
      observation:'图示观察：叶点随枝形成数团，团间露枝、团内相搭。转译：同一枝架与44笔同材质叶触，由沿枝等距站点改为六段附枝点群，保留团间空口。',
      limits:'44笔和六团是本例的作者预算，不是原书口诀；沿枝几何与叶簇已显式编写，未实现自动树种识别或三维遮挡。',
      evidence:[{title:'《芥子园画传》公开图2（二次分发）',url:preview(2),locator:'菊花点、松叶点、尖头点等叶法；观察不同方向的团块与空口'},
        {title:'央美树谱目录',url:treeDirectory,locator:'209–210叶法；缩略图201044、201045'}],
    },
  ];
}
