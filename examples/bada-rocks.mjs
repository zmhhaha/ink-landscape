import { authoredPathTexture } from './authored-study-path.mjs';

// The right-hand hanging forms use selected angular ridges and diagonal grain.
// These authored paths are a visual study, not a stack of rounded solids.
export function createBadaRockGroups() {
  const groups=[];
  function group(id,parentId,role='mark'){
    const value={id,role,...(parentId?{parentId}:{}),strokes:[]};groups.push(value);
    return (name,points,width,opacity=.5,dryness=.65,options={})=>{
      const {smooth=false,texture=1.1,...rest}=options;
      value.strokes.push({id:name,
        points:authoredPathTexture(points,id+'/'+name,{step:7,amplitude:texture,smooth})
          .map(([x,y,pressure=1])=>({x,y,pressure})),
        options:{width,opacity,dryness,ink:'#3b4438',axis:'side',gestureModel:'local-v1',
          smoothing:smooth?'catmull-rom':'linear',duration:0,...rest}});
    };
  }

  // Connected wet shadow masses support the broken facets below. Their long
  // irregular contacts follow the left-facing structure; the right face stays
  // open rather than receiving an evenly spaced row of loaded dabs.
  const wet=group('bada-rock-wet-core');
  wet('shoulder-core',[[1057,700,.28],[1093,783,.84],[1082,889,.97],[1109,1016,.82],[1131,1118,.4],[1147,1159,0]],169,.94,.24,{smooth:true,texture:2.3});
  wet('descending-core',[[1082,1000,.24],[1107,1122,.83],[1148,1221,.94],[1168,1353,.72],[1189,1469,.48],[1232,1579,0]],157,.92,.31,{smooth:true,texture:2.1});
  wet('cap-shadow',[[1048,701,.25],[1114,728,.9],[1173,703,.8],[1227,743,.66],[1260,766,0]],108,.9,.27,{smooth:true,texture:1.8});
  wet('lower-core',[[1224,1652,.17],[1248,1743,.75],[1286,1832,.93],[1327,1929,.78],[1390,2021,.4],[1444,2128,0]],131,.89,.3,{smooth:true,texture:2.2});

  // Sparse long dilute deposits unite the faces. Most of the right plane
  // remains paper, instead of carrying one rounded contact at every height.
  const pale=group('bada-rock-pale-planes');
  pale('cap-left-plane',[[1042,675,.2],[1123,636,.73],[1235,613,.6],[1310,630,0]],108,0.594,0.140);
  pale('cap-right-plane',[[1268,621,.2],[1336,639,.58],[1383,691,.5],[1424,739,0]],99,0.462,0.163);
  pale('shoulder-plane',[[1052,703,.2],[1094,770,.7],[1096,882,.6],[1071,968,0]],119,0.582,0.153);
  pale('main-left-plane',[[1064,925,.2],[1071,1042,.68],[1101,1145,.75],[1160,1248,.56],[1203,1352,0]],112,0.570,0.170);
  pale('main-tip-plane',[[1144,1304,.2],[1167,1403,.65],[1201,1490,.57],[1232,1583,0]],92,0.522,0.178);
  pale('upper-return-face',[[1148,690,.17],[1198,702,.62],[1250,754,.5],[1339,747,0]],82,0.474,0.178);
  pale('detached-long-face',[[1230,1647,.2],[1250,1751,.65],[1284,1842,.66],[1357,1952,.5],[1441,2124,0]],77,0.510,0.185);
  pale('detached-fold-face',[[1282,1715,.2],[1335,1763,.64],[1337,1864,.4],[1352,1937,0]],68,0.450,0.203);

  const cap=group('bada-rock-cap-facets','bada-rock-pale-planes');
  cap('cap-left-rake',[[1034,675,.18],[1088,647,.8],[1143,635,.58],[1176,634,0]],47,0.765,0.350);
  cap('cap-underturn',[[1047,697,.2],[1085,734,.76],[1153,735,.56],[1197,710,0]],57,0.690,0.380);
  cap('cap-deep-recess',[[1123,714,.2],[1177,698,.8],[1222,721,.65],[1244,764,0]],43,0.765,0.365);
  cap('cap-far-recess',[[1250,756,.22],[1301,773,.73],[1365,750,.5],[1405,739,0]],42,0.645,0.390);

  const facets=group('bada-rock-body-facets','bada-rock-pale-planes');
  facets('shoulder-dark',[[1040,740,.2],[1089,773,.74],[1126,812,.45],[1133,837,0]],55,0.780,0.360);
  facets('upper-diagonal-grain',[[1059,833,.2],[1088,881,.74],[1125,916,.5],[1151,943,0]],40,0.675,0.390);
  facets('main-plane-fold',[[1044,943,.2],[1060,1006,.77],[1101,1055,.58],[1126,1116,0]],54,0.690,0.375);
  facets('deep-diagonal-shadow',[[1078,1088,.2],[1112,1158,.8],[1162,1204,.6],[1196,1243,0]],43,0.750,0.370);
  facets('lower-plane-grain',[[1135,1234,.2],[1180,1284,.7],[1200,1360,.55],[1211,1415,0]],39,0.630,0.405);
  facets('tip-left-shadow',[[1136,1394,.2],[1171,1466,.78],[1215,1524,.43],[1232,1579,0]],38,0.705,0.390);

  const fine=group('bada-rock-dry-scars','bada-rock-pale-planes');
  [
    [[1084,674,.15],[1137,658,.72],[1189,661,0]],
    [[1110,715,.15],[1150,689,.7],[1183,694,0]],
    [[1083,799,.15],[1113,828,.7],[1127,871,0]],
    [[1052,882,.15],[1076,939,.7],[1099,955,0]],
    [[1096,931,.15],[1123,977,.7],[1135,1033,0]],
    [[1056,1020,.15],[1085,1073,.74],[1102,1091,0]],
    [[1092,1128,.15],[1131,1158,.7],[1140,1191,0]],
    [[1163,1190,.15],[1199,1216,.7],[1228,1207,0]],
    [[1140,1280,.15],[1166,1320,.7],[1174,1364,0]],
    [[1188,1416,.15],[1208,1470,.7],[1230,1506,0]],
    [[1260,1701,.15],[1291,1741,.7],[1324,1753,0]],
    [[1266,1800,.15],[1299,1847,.7],[1321,1887,0]],
    [[1323,1923,.15],[1362,1970,.7],[1391,2015,0]],
  ].forEach((p,i)=>fine('grain-'+i,p,9+i%3*3,.36+i%4*.035,.79,{axis:'center'}));

  const face=group('bada-rock-open-face-scars','bada-rock-pale-planes');
  face('right-high-grain',[[1371,826,.15],[1351,858,.65],[1341,896,0]],9,.3,.8);
  face('right-fold-grain',[[1321,951,.15],[1304,987,.66],[1297,1022,0]],8,.3,.82);
  face('right-low-grain',[[1261,1118,.15],[1243,1140,.7],[1236,1175,0]],11,.34,.8);

  const lower=group('bada-rock-detached-facets','bada-rock-pale-planes');
  lower('detached-left-fold',[[1220,1654,.2],[1227,1739,.72],[1259,1827,.63],[1302,1871,0]],34,0.675,0.390);
  lower('detached-mid-fold',[[1272,1764,.2],[1300,1808,.74],[1331,1830,.63],[1343,1886,0]],33,0.630,0.405);
  lower('detached-bottom-face',[[1288,1872,.2],[1327,1938,.75],[1379,2011,.46],[1418,2081,0]],36,0.600,0.400);

  const contour=group('bada-rock-edge-fragments','bada-rock-pale-planes');
  [
    ['cap-top-left-edge',[[1037,650,.2],[1099,622,.7],[1183,606,.64],[1269,590,0]],8,.53,.66],
    ['cap-top-right-edge',[[1299,596,.18],[1341,608,.7],[1368,646,.65],[1384,687,0]],6,.46,.72],
    ['cap-right-broken-edge',[[1381,666,.2],[1401,698,.75],[1414,723,.6],[1450,748,0]],7,.51,.69],
    ['cap-turn-crease',[[1190,663,.18],[1220,675,.72],[1249,725,.65],[1253,764,0]],6,.57,.67],
    ['body-left-edge-upper',[[1031,704,.18],[1019,748,.7],[1027,796,.58],[1044,827,0]],7,.47,.75],
    ['body-left-edge-middle',[[1045,929,.18],[1033,982,.75],[1057,1054,.58],[1068,1082,0]],7,.5,.76],
    ['pale-face-right-contour',[[1326,965,.18],[1308,1013,.7],[1295,1079,.63],[1275,1139,0]],5,.44,.8],
    ['body-lower-left-round',[[1087,1349,.2],[1100,1395,.75],[1127,1436,.53],[1144,1451,0]],6,.5,.78],
    ['detached-left-edge',[[1209,1664,.18],[1208,1725,.7],[1221,1791,.6],[1242,1836,0]],6,.46,.8],
    ['detached-final-edge-fragment',[[1380,2008,.18],[1407,2055,.68],[1451,2134,0]],4,.37,.84],
  ].forEach(([id,p,w,o,d])=>contour(id,p,w,o,d,{axis:'center',smooth:true,texture:.8}));

  const bones=group('bone-rock-ridges','bada-rock-pale-planes','structure');
  bones('top-broken-ridge',[[1040,652,.2],[1080,633,.75],[1134,623,.52],[1164,615,0]],9,.78,.53,{axis:'center',ink:'#1c281f'});
  bones('cap-recess-hook',[[1189,664,.2],[1221,680,.8],[1238,706,.55],[1246,731,0]],8,.74,.57,{axis:'center',ink:'#1c281f'});
  bones('left-plane-fracture',[[1039,835,.18],[1051,879,.8],[1077,909,.55],[1092,917,0]],7,.73,.79,{axis:'center',ink:'#1c281f'});
  bones('middle-plane-fracture',[[1052,1026,.18],[1080,1065,.78],[1111,1085,.5],[1125,1110,0]],7,.7,.58,{axis:'center',ink:'#1c281f'});
  bones('lower-plane-fracture',[[1152,1213,.18],[1188,1236,.76],[1224,1219,.5],[1243,1206,0]],8,.71,.79,{axis:'center',ink:'#1c281f'});
  bones('detached-fold-crack',[[1266,1781,.2],[1284,1819,.75],[1319,1845,.47],[1335,1871,0]],6,.65,.83,{axis:'center',ink:'#1c281f'});
  bones('narrow-connecting-neck',[[1212,1534,.25],[1224,1582,.72],[1215,1631,.55],[1229,1693,0]],16,.7,.59,{axis:'center',ink:'#263026',smooth:true});

  // Unequal small clusters sit on selected ridges/crevices, with large unmarked
  // intervals. Every moss point remains an ordinary pressure-shaped dot stroke.
  const moss=group('bone-rock-moss','bada-rock-pale-planes');
  const dots=[
    [1068,641,12,-5,9],[1083,634,9,-3,6],[1102,628,7,-2,5],
    [1191,668,10,2,8],[1205,676,8,3,5],
    [1046,841,10,2,8],[1056,861,7,2,5],
    [1169,1224,12,4,7],[1184,1232,8,3,6],
  ];
  dots.forEach(([x,y,w,dx,dy],i)=>moss('ridge-dot-'+i,[[x,y,.18],[x+dx*.4,y-dy*.45,.95],[x+dx,y-dy,0]],w*1.5,.95-i%3*.05,.38+i%3*.08,{ink:'#151e16',texture:.55}));
  return groups;
}
