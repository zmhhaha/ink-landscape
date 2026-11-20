import { createBarkDocument } from '../dist/bark-document.js';
import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';
import { sampleStrokePath } from '../dist/path.js';
import { createBadaTreeGroups } from './bada-tree.mjs';
import { createBadaHangingWoodGroups } from './bada-hanging-wood.mjs';

const points = values => values.map(([x, y, pressure = .7]) => ({ x, y, pressure }));
export const BARK_STUDY_OPTIONS = Object.freeze({ width: 360, height: 400, seed: 821735, background: '#f5f2e9' });

// Authored study coordinates are retained here so the same sources can be
// placed back in the complete painting. Both columns share these trunk shapes.
export const BARK_APPLICATION_CASES = [
  {
    id: 'left-crook', title: '左侧主干叉口',
    methodOptions: { contourWidth: .055, textureStrength: .78 },
    view: { x: 145, y: 1520, width: 220, height: 400 },
    branches: [{
      id: 'crook',
      points: points([[242.5,1818.5],[242,1761.5],[238.5,1698],[239.5,1618],[240,1588.5]]),
      width: [{ at: 0, width: 69 }, { at: .33, width: 110 }, { at: .7, width: 103 }, { at: 1, width: 99 }],
      leftEdge: points([[214,1799,.2],[191,1741,.75],[185,1679,.7],[191,1592,.55],[197,1564,0]]),
      rightEdge: points([[271,1838,.2],[293,1782,.7],[292,1717,.61],[288,1644,.48],[283,1613,0]]),
      shadowSide: 1,
      knots: [
        { id: 'crook-wound', at: .055, side: 1, offset: .75, size: .85, count: 13 },
        { id: 'upper-scar', at: .67, side: -1, offset: -.55, size: .42, count: 4 },
      ],
      junctions: [{ id: 'fork-opening', at: .055, side: 1, span: .12 }],
    }],
    baselineSelection: [
      { groupId: 'bone-tree-contours', strokeIds: ['left-rise-west-low','left-rise-east-low'] },
      { groupId: 'bone-tree-dot-cun', strokeIds: Array.from({ length: 12 }, (_, i) => 'left-fork-' + i).concat(Array.from({ length: 3 }, (_, i) => 'left-rise-' + i),'pale-eroded-face-4') },
      { groupId: 'bone-tree-joints', strokeIds: ['left-socket','left-knot-lip'] },
    ],
    changedVariable: '将原来按画幅坐标摆放的木结点皴，改为按局部枝径、切向和叉口组织。',
  },
  {
    id: 'hanging-cavity', title: '右侧悬垂朽木洞口',
    methodOptions: { contourWidth: .024, textureStrength: .78 },
    view: { x: 985, y: 705, width: 440, height: 290 },
    branches: [{
      id: 'hollow-trunk',
      points: points([[1208,764.5],[1201,823.5],[1198,868],[1190.5,911.5]]),
      width: [{ at: 0, width: 370 }, { at: .4, width: 368 }, { at: 1, width: 320 }],
      // This branch runs downwards: the minus-normal edge lies on screen right.
      leftEdge: points([[1393,778,.1],[1385,843,.43],[1360,881,.35],[1350,911,0]]),
      rightEdge: points([[1023,751,.28],[1017,804,.68],[1036,855,.9],[1031,912,.45],[1041,950,0]]),
      shadowSide: 1,
      knots: [
        { id: 'shoulder-cavity', at: .43, side: 1, offset: .66, size: .38, count: 15, kind: 'cavity' },
        { id: 'lower-bark', at: .8, side: 1, offset: .79, size: .15, count: 4 },
      ],
    }],
    baselineSelection: [
      { groupId: 'bone-hanging-wood-contours', strokeIds: ['shoulder-left','faint-right-upper'] },
      { groupId: 'bone-hanging-wood-dot-cun', strokeIds: Array.from({ length: 12 }, (_, i) => 'knot-1-' + i) },
      { groupId: 'bone-hanging-wood-fissures', strokeIds: ['shoulder-hollow'] },
      { groupId: 'bone-hanging-wood-knot-lips', strokeIds: ['lip-0'] },
    ],
    changedVariable: '将独立短点和破钩改为围绕洞口组织的点皴、裂纹和干擦，保留洞心纸白。',
  },
];

const TRANSFER_CASE = {
  id: 'tilted-transfer', title: '换形验证 · 斜干与枝径变化',
  methodOptions: { contourWidth: .055, textureStrength: .78 },
  view: { x: 0, y: 55, width: 400, height: 300 },
  branches: [{
    id: 'tilted-trunk',
    points: points([[52,300],[132,274],[218,222],[288,169],[348,93]]),
    width: [{ at: 0, width: 76 }, { at: .38, width: 63 }, { at: .7, width: 42 }, { at: 1, width: 26 }],
    shadowSide: 1,
    knots: [
      { id: 'large-wound', at: .3, side: 1, offset: .25, size: 1.1, count: 13 },
      { id: 'small-scar', at: .76, side: -1, offset: -.35, size: .42, count: 4 },
    ],
    junctions: [{ id: 'branch-opening', at: .3, side: 1, span: .12 }],
  }],
  changedVariable: '用相同木结控制转到斜向、渐细的干形，检查点皴朝向和尺度。',
};

export function selectBadaBarkBaseline(caseId) {
  const item = BARK_APPLICATION_CASES.find(record => record.id === caseId);
  if (!item) throw new RangeError('Unknown Bada bark study');
  const original = [...createBadaTreeGroups(), ...createBadaHangingWoodGroups()];
  return item.baselineSelection.map(selection => {
    const group = original.find(value => value.id === selection.groupId);
    const strokes = group.strokes.filter(stroke => selection.strokeIds.includes(stroke.id));
    if (strokes.length !== selection.strokeIds.length) throw new Error('Missing original bark strokes');
    return { id: group.id, role: group.role, strokes };
  });
}

function widthAt(width, at) {
  if (typeof width === 'number') return width;
  const upper = width.findIndex(control => control.at >= at);
  if (upper === -1) return width.at(-1).width;
  if (upper === 0) return width[0].width;
  const a = width[upper - 1], b = width[upper], t = (at - a.at) / (b.at - a.at);
  return a.width + (b.width - a.width) * t;
}

function edgePaths(branch) {
  const samples = sampleStrokePath(branch.points, { spacing: 5, smoothing: 'catmull-rom' });
  const total = samples.at(-1).distance;
  return [-1, 1].map((side, index) => branch[index === 0 ? 'leftEdge' : 'rightEdge'] ?? samples.map(point => ({
    x: point.x + point.nx * widthAt(branch.width, point.distance / total) * side * .5,
    y: point.y + point.ny * widthAt(branch.width, point.distance / total) * side * .5,
    pressure: point.pressure,
  })));
}

function commonOutlineGroups(item) {
  return item.branches.map(branch => ({
    id: item.id + '/shared-shape/' + branch.id, role: 'structure',
    strokes: edgePaths(branch).map((path, i) => ({
      id: i === 0 ? 'left-edge' : 'right-edge', points: path,
      options: { width: 5.8, ink: '#30382e', opacity: i === 0 ? .77 : .51, dryness: .55, axis: 'center', smoothing: 'catmull-rom', duration: 0 },
    })),
  }));
}

function transferBaseline() {
  const dabs = [[148,268,17],[158,272,13],[141,278,10],[302,154,9],[310,160,7]];
  return [{ id: 'transfer/manual-knots', role: 'mark', strokes: dabs.map(([x,y,width], i) => ({
    id: 'dab-' + i, points: [{x,y,pressure:.25},{x:x+3,y:y-3,pressure:.9},{x:x+7,y:y-6,pressure:0}],
    options: {width,ink:'#30382e',opacity:.65,dryness:.52,axis:'center',duration:0},
  })) }];
}

export function createBarkStudyCases() {
  return [...BARK_APPLICATION_CASES, TRANSFER_CASE].map(item => {
    const options = { ...BARK_STUDY_OPTIONS, idPrefix: 'study/' + item.id, ...item.methodOptions };
    const source = createBarkDocument(transformStudyBranches(item.branches, item.view), options);
    const baselineGroups = item.baselineSelection ? selectBadaBarkBaseline(item.id) : [
      ...commonOutlineGroups(item), ...transferBaseline(),
    ];
    const baseline = createStrokeGroupDocument(transformStudyGroups(baselineGroups, item.view), BARK_STUDY_OPTIONS);
    return { ...item, baseline, source, options };
  });
}

export function createBadaBarkDocument(caseId, options = {}) {
  const item = BARK_APPLICATION_CASES.find(record => record.id === caseId);
  if (!item) throw new RangeError('Unknown Bada bark study');
  return createBarkDocument(item.branches, {
    width: 1533, height: 2851, seed: BARK_STUDY_OPTIONS.seed,
    background: BARK_STUDY_OPTIONS.background, idPrefix: 'bada-bark/' + item.id,
    ...item.methodOptions, ...options,
  });
}

export function studyTransform(view, width = 360, height = 400) {
  const scale = Math.min((width - 42) / view.width, (height - 38) / view.height);
  return { scale, x: (width - view.width * scale) * .5 - view.x * scale, y: (height - view.height * scale) * .5 - view.y * scale };
}

export function transformStudyGroups(groups, view) {
  const frame = studyTransform(view);
  const move = p => ({ ...p, x: p.x * frame.scale + frame.x, y: p.y * frame.scale + frame.y });
  return groups.map(group => ({ ...group, strokes: group.strokes.map(stroke => ({
    ...stroke, points: stroke.points.map(move), options: { ...stroke.options,
      width: stroke.options.width * frame.scale,
      ...(stroke.options.clip ? { clip: stroke.options.clip.map(move) } : {}),
    },
  })) }));
}

export function transformStudyBranches(branches, view) {
  const frame = studyTransform(view);
  const move = p => ({ ...p, x: p.x * frame.scale + frame.x, y: p.y * frame.scale + frame.y });
  return branches.map(branch => ({
    ...branch, points: branch.points.map(move),
    width: typeof branch.width === 'number' ? branch.width * frame.scale
      : branch.width.map(control => ({ ...control, width: control.width * frame.scale })),
    ...(branch.leftEdge ? { leftEdge: branch.leftEdge.map(move) } : {}),
    ...(branch.rightEdge ? { rightEdge: branch.rightEdge.map(move) } : {}),
  }));
}
