// Editable stroke study after Bada Shanren's Dead Tree and Crows.
// All coordinates use the complete 1533 × 2851 reference canvas. These are
// individually authored ink contacts, not image stamps or a repeated bird icon.
const INK = '#20251e';
const PAPER = '#f5f2e9';

function stroke(id, points, width, options = {}) {
  return { id, points: points.map(([x, y, pressure = 1]) => ({ x, y, pressure })), options: {
    width, ink: INK, opacity: .83, dryness: .18, axis: 'center', smoothing: 'catmull-rom',
    gestureModel: 'local-v1', entry: 'preserve', finish: 'preserve', turn: 'preserve',
    pressureProfile: 'preserve', rhythm: 'continuous', drag: 'forward', start: 0, duration: 0,
    ...options,
  } };
}
const feather = (id, points, width, options = {}) => stroke(id, points, width,
  { ink: '#34392f', opacity: .79, dryness: .47, ...options });
const wet = (id, points, width, options = {}) => {
  const body = !/head|crown|cheek|nape|throat/.test(id);
  return stroke(body ? `soft-${id}` : id, points, width,
    { ink: body ? '#74776e' : '#30352c', opacity: body ? .85 : 1,
      dryness: body ? .2 : .015, ...options });
};
const line = (id, points, width = 2.5, options = {}) => stroke(id, points, width,
  { ink: '#10190e', opacity: .84, dryness: .52, ...options });
const soft = (id, points, width, options = {}) => stroke(`soft-${id}`, points, width,
  { ink: '#9fa397', opacity: .42, dryness: .18, ...options });
const eyeWhite = (id, points, width) => stroke(id,
  [[points[0][0], points[0][1], .25],
    [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2, 1],
    [points[1][0], points[1][1], .25]], width,
  { ink: PAPER, opacity: 1, dryness: 0 });

/** Fresh raw groups for createStrokeGroupDocument; every contact is editable. */
export function createBadaCrowGroups() {
  const left = {
    id: 'crow-left-upright', role: 'mark', strokes: [
      // Long down-left tail is painted before the folded wing.
      feather('tail-main', [[265, 1214, .53], [235, 1254, .9], [188, 1303, .72], [139, 1338, .015]], 39, { opacity: .85, dryness: .48 }),
      feather('tail-inner', [[258, 1225, .39], [222, 1274, .78], [174, 1326, .02]], 19, { opacity: .64, dryness: .64 }),
      wet('scapular-cap', [[273, 1114, .51], [307, 1099, .94], [353, 1110, .58]], 64),
      soft('nape-to-back', [[366,1091,.42],[349,1107,.88],[314,1111,.84],[283,1121,.2]],42,{opacity:.88,dryness:.2}),
      soft('wing-down', [[274, 1123, .45], [271, 1167, .89], [250, 1203, .13]], 51),
      wet('upper-wing-fold', [[275, 1127, .49], [306, 1113, .88], [340, 1118, .35]], 38, { opacity:.78 }),
      feather('wing-base-mass', [[262, 1128, .49], [245, 1162, .92], [226, 1207, .07]], 37, { ink:'#454b3e', dryness:.58 }),
      feather('tail-wing-bridge', [[251, 1187, .31], [244, 1211, .78], [224, 1240, .03]], 30, { dryness:.62 }),
      feather('covert-01', [[257, 1128, .24], [243, 1137, .95], [231, 1146, .05]], 23),
      feather('covert-02', [[282, 1128, .22], [269, 1139, .96], [258, 1148, .05]], 22),
      feather('covert-03', [[308, 1127, .28], [296, 1136, .88], [284, 1142, .04]], 19),
      feather('covert-04', [[329, 1125, .2], [321, 1132, .83], [312, 1136, .04]], 17),
      feather('flight-01', [[245, 1154, .22], [234, 1166, .95], [220, 1177, .04]], 24),
      feather('flight-02', [[270, 1154, .23], [256, 1165, .9], [242, 1175, .05]], 24),
      feather('flight-03', [[291, 1151, .2], [282, 1159, .84], [272, 1166, .03]], 18),
      feather('flight-04', [[235, 1180, .17], [224, 1193, .94], [212, 1207, .04]], 24),
      feather('flight-05', [[257, 1177, .18], [247, 1191, .88], [233, 1204, .03]], 23),
      feather('primary-tip', [[241, 1199, .28], [222, 1221, .93], [199, 1244, .03]], 23, { dryness: .37 }),
      // The breast is the untouched paper between neck, wing and these hints.
      wet('head-and-neck', [[368, 1048, .55], [360, 1075, .98], [377, 1103, .87], [390, 1118, .2]], 57),
      wet('crown', [[349, 1055, .27], [365, 1035, .96], [383, 1033, .38]], 33),
      wet('throat', [[385, 1086, .48], [395, 1108, .97], [386, 1125, .25]], 32),
      wet('neck-shoulder-bridge', [[337, 1103, .3], [359, 1101, .88], [381, 1115, .4]], 32),
      feather('back-dark-rake', [[278,1105,.32],[307,1092,.9],[338,1102,.1]], 24, {ink:'#1c2518',opacity:.89,dryness:.55}),
      soft('breast-side-shadow', [[393,1120,.2],[398,1142,.65],[382,1171,.03]], 19),
      feather('right-shoulder-tip', [[410, 1110, .4], [416, 1121, .91], [410, 1144, .015]], 20, {ink:'#263420',opacity:.88,dryness:.61}),
      line('breast-hint-high', [[410, 1134, .13], [405, 1150, .55], [400, 1159, .04]], 2.3, { opacity: .48, dryness: .62 }),
      line('breast-hint-low', [[393, 1170, .12], [385, 1182, .48], [378, 1188, .04]], 2.2, { opacity: .44, dryness: .66 }),
      line('belly-tuft-01', [[330, 1196, .12], [335, 1201, .7], [339, 1204, .03]], 3.6),
      line('belly-tuft-02', [[345, 1196, .13], [351, 1203, .7], [356, 1205, .03]], 3.2),
      line('belly-tuft-03', [[360, 1196, .12], [368, 1201, .63], [373, 1204, .02]], 2.8),
      stroke('upper-beak', [[380, 1044, .52], [394, 1025, .79], [408, 1009, .025]], 11, { dryness: .13 }),
      line('lower-beak', [[390, 1061, .6], [403, 1045, .85], [415, 1036, .025]], 5.4, { dryness: .13 }),
      line('jaw-root', [[390, 1062, .6], [386, 1073, .38], [382, 1080, .02]], 2.2),
      eyeWhite('eye-white', [[375, 1043, .7], [365, 1055, 1]], 13.5),
      stroke('eye-pupil', [[371, 1043, .9], [369, 1047, .85]], 5.5, { ink:'#0d160b', opacity: 1, dryness: .55 }),
      line('eye-upper-rim', [[365, 1044, .2], [371, 1039, .9], [379, 1040, .08]], 1.9, { opacity: .85, dryness: .1 }),
      line('foot-inner', [[319, 1198, .18], [325, 1211, .85], [336, 1221, .04]], 2.8),
      line('foot-middle', [[331, 1201, .22], [340, 1213, .88], [350, 1221, .04]], 2.8),
      line('foot-outer', [[350, 1201, .2], [359, 1212, .82], [371, 1220, .03]], 2.6),
    ],
  };

  const rear = {
    id: 'crow-center-rear', role: 'mark', strokes: [
      // Narrow hidden rump, broad right shoulder, compact left folded wing.
      feather('rump-hint', [[813, 1347, .3], [828, 1369, .55], [824, 1391, .03]], 7, { opacity: .46, dryness: .49 }),
      soft('breast-side-wash', [[819,1315,.28],[825,1342,.7],[806,1382,.035]], 24),
      wet('right-shoulder', [[783, 1287, .52], [812, 1302, .98], [802, 1325, .23]], 77),
      wet('left-folded-wing', [[742, 1299, .56], [710, 1318, .99], [690, 1337, .22]], 78),
      soft('nape-to-back', [[745,1282,.28],[756,1298,.9],[788,1305,.84],[815,1310,.2]],40,{opacity:.87,dryness:.2}),
      wet('nape-left-bridge', [[738, 1266, .4], [741, 1288, .9], [729, 1304, .4]], 34),
      wet('nape-right-bridge', [[777, 1268, .35], [784, 1284, .9], [806, 1301, .4]], 31),
      soft('breast-upper-shadow', [[742, 1304, .25], [765, 1312, .74], [791, 1314, .23]], 24),
      feather('wing-lower-fill', [[695, 1327, .35], [681, 1345, .88], [687, 1358, .12]], 32, {ink:'#283922',dryness:.55}),
      feather('wing-shoulder-rake', [[731,1303,.35],[710,1314,.8],[693,1335,.02]], 18, {opacity:.87,dryness:.66}),
      feather('covert-01', [[674, 1353, .2], [667, 1362, .87], [660, 1368, .04]], 16),
      feather('covert-02', [[692, 1357, .18], [686, 1367, .9], [680, 1372, .03]], 13),
      feather('covert-03', [[707, 1357, .17], [701, 1366, .88], [696, 1371, .03]], 13),
      feather('covert-04', [[722, 1354, .19], [717, 1363, .84], [711, 1368, .03]], 13),
      feather('covert-05', [[735, 1348, .18], [732, 1356, .79], [725, 1363, .03]], 12),
      line('wing-fine-end', [[731, 1368, .13], [720, 1376, .55], [710, 1379, .02]], 3.3),
      wet('crown-cap', [[728, 1266, .3], [749, 1253, .98], [775, 1257, .87], [788, 1266, .22]], 41),
      wet('head-cheek', [[744, 1269, .4], [758, 1271, .94], [780, 1268, .45]], 27),
      line('neck-shadow', [[758, 1294, .18], [772, 1297, .72], [787, 1290, .03]], 9, { opacity: .52 }),
      eyeWhite('eye-white-left', [[741, 1277, .8], [746, 1281, 1]], 8.4),
      eyeWhite('eye-white-right', [[766, 1273, .9], [772, 1275, .85]], 7.8),
      stroke('eye-pupil-left', [[742, 1275, .9], [744, 1277, .8]], 4.1, {ink:'#0c150a',opacity:1,dryness:.55}),
      stroke('eye-pupil-right', [[768, 1271, .8], [769, 1273, .9]], 3.8, {ink:'#0c150a',opacity:1,dryness:.55}),
      line('turned-beak', [[751, 1284, .2], [759, 1291, .9], [768, 1289, .7], [779, 1279, .03]], 3.5, { opacity: .83, dryness: .18 }),
      line('throat-edge', [[774, 1303, .08], [783, 1313, .55], [791, 1314, .03]], 2.7, { opacity: .42 }),
      // These open, separated strokes delimit the breast without filling it.
      line('breast-right-high', [[839, 1310, .1], [844, 1324, .5], [842, 1337, .04]], 2.9, { opacity: .42, dryness: .62 }),
      line('breast-right-low', [[837, 1353, .1], [833, 1368, .48], [826, 1376, .025]], 2.5, { opacity: .43, dryness: .63 }),
      line('belly-edge', [[819, 1388, .13], [806, 1397, .49], [795, 1401, .02]], 2.6, { opacity: .42, dryness: .59 }),
      line('support-leg', [[803,1398,.15],[813,1411,.81],[822,1421,.48]],3.6),
      line('toe-inner', [[818,1417,.26],[825,1424,.89],[838,1422,.02]],3.4),
      line('toe-outer', [[825,1418,.24],[833,1420,.84],[844,1415,.02]],2.8),
    ],
  };

  const front = {
    id: 'crow-center-front', role: 'mark', strokes: [
      feather('tail-main', [[720, 1490, .48], [772, 1523, .94], [826, 1540, .81], [860, 1550, .035]], 43, {opacity:.88,dryness:.48}),
      feather('tail-lower', [[725, 1503, .23], [784, 1535, .75], [850, 1554, .02]], 17, {opacity:.67,dryness:.67}),
      feather('tail-upper', [[746, 1504, .18], [797, 1520, .78], [849, 1542, .025]], 17, { opacity: .58, dryness: .39 }),
      wet('back-and-shoulder', [[578, 1405, .61], [617, 1407, .99], [666, 1424, .52]], 100),
      soft('nape-to-back', [[571,1394,.35],[596,1407,.93],[632,1412,.86],[666,1425,.22]],53,{opacity:.9,dryness:.2}),
      soft('belly-low-shadow', [[571,1454,.16],[601,1475,.7],[638,1480,.05]],25),
      wet('head-crown', [[548, 1404, .35], [563, 1386, .97], [586, 1380, .96], [610, 1388, .35]], 36),
      wet('cheek', [[555, 1405, .6], [552, 1422, .95], [569, 1436, .4]], 37),
      wet('throat-lobe', [[551, 1434, .35], [553, 1452, .95], [570, 1464, .2]], 27),
      feather('folded-wing-base', [[665,1418,.38],[690,1439,.94],[715,1472,.13]],43,{ink:'#454c3e',dryness:.6}),
      feather('tail-base-bridge', [[707,1464,.28],[724,1486,.91],[749,1508,.13]],32,{dryness:.53}),
      feather('back-dark-rake', [[573,1387,.33],[611,1388,.94],[651,1405,.04]],33,{ink:'#1d2718',opacity:.9,dryness:.55}),
      feather('scapular-fray', [[599,1428,.21],[635,1427,.78],[662,1441,.03]],13,{ink:'#343d2d',opacity:.75,dryness:.72}),
      feather('wing-cover-01', [[682, 1402, .18], [690, 1408, .89], [700, 1411, .04]], 20),
      feather('wing-cover-02', [[697, 1419, .16], [709, 1425, .94], [723, 1430, .04]], 24),
      feather('wing-cover-03', [[709, 1435, .15], [724, 1444, .94], [739, 1449, .04]], 25),
      feather('wing-cover-04', [[679, 1427, .2], [687, 1436, .82], [697, 1440, .04]], 18),
      feather('wing-cover-05', [[696, 1444, .18], [708, 1452, .9], [720, 1457, .03]], 22),
      feather('wing-cover-06', [[718, 1459, .18], [731, 1467, .94], [746, 1472, .04]], 24),
      feather('low-covert-01', [[611, 1455, .2], [619, 1459, .8], [628, 1461, .04]], 9),
      feather('low-covert-02', [[634, 1460, .17], [644, 1464, .89], [653, 1465, .03]], 11),
      feather('low-covert-03', [[656, 1458, .16], [668, 1465, .92], [678, 1466, .04]], 13),
      feather('low-covert-04', [[679, 1466, .17], [690, 1471, .89], [702, 1474, .04]], 16),
      feather('primary-top', [[711, 1475, .2], [735, 1485, .91], [759, 1489, .03]], 18),
      feather('primary-bottom', [[719, 1488, .16], [747, 1499, .9], [776, 1502, .03]], 16),
      line('breast-left-hint', [[570, 1465, .1], [579, 1473, .5], [588, 1475, .02]], 2.9, { opacity: .38, dryness: .55 }),
      line('belly-open-hint', [[599, 1481, .1], [611, 1483, .45], [620, 1483, .02]], 2.3, { opacity: .35, dryness: .59 }),
      stroke('upper-beak', [[550, 1406, .55], [538, 1416, .77], [526, 1429, .025]], 8.2, { opacity: .86, dryness: .14 }),
      line('lower-beak', [[551, 1414, .65], [543, 1418, .75], [536, 1423, .03]], 3.3, { dryness: .18 }),
      eyeWhite('eye-white', [[561, 1387, .7], [555, 1395, 1]], 10),
      stroke('eye-pupil', [[558, 1386, .85], [556, 1389, .9]], 4.7, {ink:'#0b1409',opacity:1,dryness:.55}),
      line('eye-rim', [[552, 1389, .14], [556, 1384, .88], [564, 1383, .1]], 2, { opacity: .85, dryness: .10 }),
      line('leg', [[647,1480,.18],[643,1491,.86],[633,1498,.37]],3.8),
      line('toe-left', [[634,1495,.28],[646,1501,.9],[658,1502,.01]],3.2),
      line('toe-right', [[647,1496,.22],[657,1503,.83],[670,1500,.01]],2.9),
    ],
  };

  const upper = {
    id: 'crow-upper-looking-down', role: 'mark', strokes: [
      feather('tail-main', [[1113,477,.46],[1168,436,.94],[1226,398,.88],[1273,375,.025]],37,{opacity:.88,dryness:.49}),
      feather('tail-inner', [[1129,484,.3],[1188,441,.86],[1260,388,.02]],19,{opacity:.67,dryness:.65}),
      feather('raised-primary-left', [[1089, 456, .28], [1093, 426, .94], [1104, 402, .04]], 24, { opacity: .85 }),
      feather('raised-primary-right', [[1111, 473, .3], [1131, 445, .93], [1150, 417, .04]], 23, { opacity: .84 }),
      wet('wing-root', [[1088, 493, .5], [1103, 474, .96], [1117, 460, .4]], 46),
      wet('wing-outer-mass', [[1094,478,.6],[1108,515,.97],[1106,548,.4]],69),
      wet('wing-tail-junction', [[1100, 458, .4], [1118, 472, .95], [1140, 463, .4]], 33),
      wet('raised-primary-junction', [[1093, 433, .4], [1090, 458, .93], [1108, 485, .4]], 28),
      wet('black-shoulder', [[1027,480,.63],[1019,513,.99],[995,538,.5]],100),
      soft('nape-to-shoulder', [[974,546,.5],[995,534,.92],[1016,510,.94],[1032,486,.25]],64,{opacity:.92,dryness:.2}),
      soft('back-to-wing-root', [[1017,489,.25],[1041,479,.83],[1071,478,.86],[1095,492,.28]],34,{opacity:.84,dryness:.2}),
      feather('shoulder-dark-rake', [[1017,475,.27],[1034,491,.86],[1014,526,.02]],29,{ink:'#1f2919',opacity:.9,dryness:.57}),
      feather('outer-wing-rake', [[1101,491,.35],[1119,520,.89],[1114,553,.025]],25,{opacity:.87,dryness:.6}),
      wet('head-shoulder-bridge', [[995, 525, .35], [990, 541, .95], [974, 550, .45]], 33),
      wet('lowered-head', [[986, 534, .42], [965, 541, .98], [948, 557, .94], [948, 569, .3]], 42),
      feather('inner-covert-01', [[1062, 472, .18], [1066, 478, .88], [1069, 483, .03]], 12),
      feather('inner-covert-02', [[1069, 489, .17], [1073, 495, .93], [1076, 499, .03]], 12),
      feather('inner-covert-03', [[1074, 506, .17], [1078, 512, .91], [1079, 516, .03]], 12),
      feather('inner-covert-04', [[1075, 524, .18], [1077, 529, .89], [1074, 534, .03]], 12),
      feather('inner-covert-05', [[1070, 542, .17], [1070, 548, .87], [1067, 552, .03]], 11),
      feather('inner-covert-06', [[1064, 556, .17], [1061, 563, .84], [1055, 567, .03]], 10),
      feather('outer-covert-01', [[1095, 482, .17], [1100, 487, .9], [1104, 493, .03]], 17, { opacity: .76 }),
      feather('outer-covert-02', [[1101, 501, .17], [1105, 507, .91], [1108, 513, .03]], 17, { opacity: .78 }),
      feather('outer-covert-03', [[1107, 520, .16], [1110, 526, .88], [1112, 533, .03]], 16, { opacity: .78 }),
      feather('outer-covert-04', [[1111, 539, .18], [1112, 545, .91], [1108, 551, .03]], 16, { opacity: .78 }),
      feather('outer-flank', [[1124, 513, .19], [1127, 535, .87], [1121, 555, .26], [1101, 563, .03]], 19, { opacity: .60, dryness: .37 }),
      line('throat-under', [[963, 571, .13], [988, 576, .6], [1018, 575, .32], [1041, 578, .025]], 6.6, { opacity: .45, dryness: .49 }),
      line('belly-tail-hint', [[1070, 574, .17], [1093, 568, .54], [1114, 564, .03]], 3.2, { opacity: .46, dryness: .56 }),
      stroke('upper-beak', [[950, 561, .56], [937, 578, .85], [922, 596, .025]], 9.6, { opacity: .88, dryness: .16 }),
      line('lower-beak', [[966, 567, .45], [960, 579, .82], [953, 590, .025]], 5.6, { opacity: .82, dryness: .22 }),
      eyeWhite('eye-white', [[959, 549, .8], [950, 556, 1]], 12.5),
      stroke('eye-pupil', [[956,546,.88],[953,550,.9]],5.7,{ink:'#0b1409',opacity:1,dryness:.55}),
      line('eye-upper-rim', [[951, 547, .17], [959, 543, .83], [967, 548, .1]], 2.1, { opacity: .88, dryness: .14 }),
      line('support-leg', [[1123, 568, .28], [1110, 589, .89], [1090, 616, .5]], 4.3, { opacity: .86, dryness: .28 }),
      line('toe-left', [[1091, 612, .23], [1083, 620, .84], [1071, 624, .02]], 3.1),
      line('toe-right', [[1090, 616, .3], [1107, 620, .88], [1128, 613, .02]], 3.2),
    ],
  };
  // Rear bird precedes the overlapping horizontal front bird. No breast uses
  // a paper-colour fill: the surrounding tree must leave those regions open.
  return [left, rear, front, upper];
}
