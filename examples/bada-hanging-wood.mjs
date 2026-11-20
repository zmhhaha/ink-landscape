import { createRandom } from '../dist/core.js';
import { authoredPathTexture } from './authored-study-path.mjs';

// The suspended form is dead wood, continuous with the diagonal bough. Its
// broad pale face is described by unequal broken edges, cavities and knot dabs.
export function createBadaHangingWoodGroups() {
  const groups=[];
  function group(id,role='mark',parentId){
    const source={id,role,...(parentId?{parentId}:{}),strokes:[]};groups.push(source);
    return (id,values,width,opacity=.75,dryness=.5,extra={})=>{
      const {texture=1.15,smooth=true,...options}=extra;
      source.strokes.push({id,
        points:authoredPathTexture(values,source.id+'/'+id,{step:7,amplitude:texture,smooth})
          .map(([x,y,pressure=1])=>({x,y,pressure})),
        options:{width,opacity,dryness,ink:'#30382e',axis:'center',
          gestureModel:'local-v1',smoothing:smooth?'catmull-rom':'linear',duration:0,...options}});
    };
  }

  const pale=group('hanging-wood/pale','structure');
  pale('crown-shadow',[[1041,682,.2],[1121,648,.8],[1215,631,.5],[1274,637,0]],68,.19,.28,{axis:'side'});
  pale('shoulder-shadow',[[1042,734,.2],[1078,840,.7],[1074,950,.4],[1092,1029,0]],58,.2,.35,{axis:'side'});
  pale('lower-side-shadow',[[1085,1080,.2],[1134,1243,.75],[1161,1378,.5],[1218,1504,0]],62,.17,.39,{axis:'side'});
  pale('cap-return',[[1190,677,.2],[1232,724,.8],[1313,756,.5],[1398,740,0]],49,.14,.33,{axis:'side'});
  pale('lower-neck',[[1219,1600,.25],[1239,1708,.7],[1273,1794,.4],[1303,1850,0]],46,.16,.37,{axis:'side'});
  pale('lower-twist',[[1280,1824,.25],[1329,1926,.65],[1382,2010,.4],[1438,2122,0]],53,.17,.39,{axis:'side'});
  const fragments=group('hanging-wood/fragments','mark','hanging-wood/pale');
  [
    [1128,679,47,27],[1178,737,40,-19],[1061,826,48,25],
    [1131,947,34,-15],[1125,1168,52,31],[1184,1285,37,-23],
    [1303,1760,48,24],[1322,1853,40,-20],
  ].forEach(([x,y,w,dx],i)=>fragments('weathered-shade-'+i,
    [[x-dx*.3,y-6,.25],[x,y,.9],[x+dx,y+12,.7],[x+dx*1.15,y+15,0]],
    w,.31+i%3*.07,.61+i%2*.08,{axis:'side',texture:1.3,smooth:false}));

  const edge=group('bone-hanging-wood-contours','structure','hanging-wood/pale');
  [
    ['crown-left',[[1018,730,.25],[1028,689,.7],[1060,650,.85],[1127,625,.65],[1190,613,0]],10,.82,.42],
    ['crown-high',[[1180,611,.2],[1269,592,.65],[1320,601,.52],[1354,621,0]],7,.55,.58],
    ['crown-down',[[1351,615,.2],[1376,653,.65],[1384,695,.8],[1404,721,.5],[1449,747,0]],8,.64,.5],
    ['shoulder-left',[[1023,751,.28],[1017,804,.68],[1036,855,.9],[1031,912,.45],[1041,950,0]],9,.87,.43],
    ['side-left-middle',[[1040,952,.2],[1037,1005,.8],[1062,1070,.65],[1085,1101,0]],9,.83,.48],
    ['side-left-lower',[[1090,1145,.2],[1091,1226,.75],[1112,1297,.7],[1126,1354,0]],8,.8,.5],
    ['terminal-left',[[1122,1387,.2],[1151,1440,.8],[1195,1492,.55],[1227,1569,0]],8,.73,.55],
    ['faint-right-upper',[[1393,778,.1],[1385,843,.43],[1360,881,.35],[1350,911,0]],5,.38,.66],
    ['faint-right-middle',[[1326,962,.15],[1312,1017,.45],[1296,1077,.56],[1273,1131,0]],6,.45,.61],
    ['faint-right-lower',[[1242,1198,.15],[1231,1266,.55],[1232,1335,.42],[1226,1365,0]],5,.42,.63],
    ['connecting-fibre',[[1226,1507,.2],[1228,1563,.7],[1217,1616,.6],[1226,1676,0]],7,.64,.5],
    ['lower-left',[[1219,1660,.2],[1211,1723,.7],[1236,1789,.65],[1266,1847,0]],8,.75,.5],
    ['lower-left-return',[[1270,1859,.2],[1301,1915,.7],[1353,1981,.55],[1401,2044,0]],7,.7,.55],
    ['lower-tip',[[1397,2034,.18],[1417,2086,.65],[1452,2145,.35],[1462,2170,0]],5,.53,.66],
    ['lower-right-broken',[[1264,1705,.16],[1309,1735,.45],[1332,1782,.6],[1335,1822,0]],5,.4,.65],
    ['lower-right-fold',[[1340,1877,.18],[1358,1925,.55],[1397,1961,.35],[1414,1986,0]],5,.44,.62],
  ].forEach(([id,path,width,opacity,dryness])=>edge(id,path,width,opacity,dryness));

  const fissure=group('bone-hanging-wood-fissures','mark','hanging-wood/pale');
  [
    ['crown-hollow',[[1114,711,.2],[1159,672,.65],[1201,677,.85],[1231,712,.7],[1241,754,0]],8,.78,.49],
    ['crown-underlip',[[1240,754,.25],[1280,773,.75],[1342,757,.5],[1402,741,0]],8,.74,.55],
    ['shoulder-hollow',[[1080,833,.2],[1103,814,.6],[1120,825,.75],[1134,852,0]],7,.62,.64],
    ['middle-hollow',[[1104,997,.2],[1124,987,.65],[1141,1009,0]],6,.55,.67],
    ['lower-hollow',[[1166,1246,.2],[1194,1225,.65],[1213,1237,.5],[1217,1255,0]],7,.59,.62],
    ['neck-grain',[[1190,1425,.2],[1205,1470,.5],[1215,1501,0]],5,.5,.67],
    ['lower-broken-hook',[[1252,1768,.2],[1276,1749,.7],[1297,1760,.45],[1304,1774,0]],7,.65,.61],
    ['lower-end-grain',[[1350,1960,.2],[1376,1993,.5],[1390,2031,0]],5,.52,.68],
  ].forEach(([id,path,width,opacity,dryness])=>fissure(id,path,width,opacity,dryness));

  const dots=group('bone-hanging-wood-dot-cun','mark','hanging-wood/pale');
  // Local concentrations follow observed cavities and torn bark. The narrow
  // dark side has larger dabs; open front faces receive only a few pale chips.
  const clusters=[
    [1088,692,12,60,35,-.18],[1078,834,12,43,86,.3],
    [1122,1154,13,53,104,.2],[1188,1400,6,41,48,.46],
    [1290,1770,11,55,77,.4],[1360,1965,5,34,37,.42],
    [1370,863,2,24,26,-.45],[1298,1070,2,26,29,-.2],
  ];
  for(const [index,[cx,cy,count,sx,sy,lean]] of clusters.entries()){
    const random=createRandom(821734+index*199);
    for(let i=0;i<count;i++){
      const primary=i%5===0,dx=i===0?0:(random()+random()-1)*sx;
      const dy=i===0?0:(random()+random()-1)*sy;
      const x=cx+dx,y=cy+dy,w=(primary?30:14)+random()*(primary?24:18);
      const reach=9+random()*20,angle=lean+(random()-.5)*2.4;
      const tx=Math.cos(angle),ty=Math.sin(angle),bend=(random()-.5)*8;
      dots(`knot-${index}-${i}`,[[x-tx*reach*.3,y-ty*reach*.3,.3],[x,y,.64+random()*.33],
        [x+tx*reach*.45-ty*bend,y+ty*reach*.45+tx*bend,.64],
        [x+tx*reach*.7,y+ty*reach*.7,.15],[x+tx*reach*.8,y+ty*reach*.8,0]],w,
        primary?.61+random()*.25:.3+random()*.35,primary?.38+random()*.22:.54+random()*.23,
        {axis:'center',texture:.55,ink:primary?'#262f25':'#4d5448'});
    }
  }
  // A handful of short torn lips connect dot groups to the direction of wood.
  const lips=group('bone-hanging-wood-knot-lips','mark','hanging-wood/pale');
  [
    [1074,847,35,-5],[1130,1167,48,-7],[1301,1786,39,9],
  ].forEach(([x,y,reach,rise],i)=>lips('lip-'+i,[[x-reach*.45,y,.15],[x,y+rise,.85],
    [x+reach*.6,y+rise*.6,.5],[x+reach,y+rise,0]],13,.7,.56,{axis:'side',texture:.6}));
  return groups;
}
