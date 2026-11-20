import { jitterPath } from '../dist/perturbation.js';

// Authored brush study after the visible right-hand forms in the official
// 1533 × 2851 reference. Coordinates are source space, never sampled pixels.
// Groups remain ordinary editable stroke sources; the caller supplies its
// document seed. Stable group/stroke IDs retain independent material seeds.
const hash = value => {
  let n = 2166136261;
  for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
};
const plain = Object.freeze({ gestureModel: 'local-v1', entry: 'preserve', finish: 'preserve',
  pressureProfile: 'preserve', turn: 'preserve', rhythm: 'continuous', drag: 'forward',
  start: 0, duration: 0, ink: '#34372f' });
const capClip = [[1019, 649], [1110, 611], [1268, 584], [1342, 602], [1386, 645],
  [1416, 708], [1454, 748], [1396, 762], [1334, 802], [1252, 787], [1173, 750], [1080, 730], [1013, 703]];
const bodyClip = [[1031, 672], [1113, 675], [1162, 722], [1189, 802], [1192, 903], [1163, 1001],
  [1198, 1120], [1266, 1193], [1247, 1306], [1235, 1429], [1248, 1559], [1219, 1609],
  [1174, 1560], [1127, 1461], [1092, 1390], [1062, 1271], [1029, 1153], [1014, 1020], [1034, 904], [1021, 805]];
const lowerClip = [[1222, 1576], [1267, 1610], [1301, 1672], [1365, 1727], [1360, 1806],
  [1356, 1874], [1385, 1944], [1411, 2001], [1453, 2124], [1423, 2089], [1370, 2024],
  [1320, 1965], [1257, 1911], [1214, 1829], [1197, 1738], [1200, 1666]];

/** Right upper hanging mass and the separate lower face, without tree or birds. */
export function createBadaRockGroups({ seed = 261120 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  const mark = (id, values, width, opacity, dryness = .5, extra = {}) => {
    const { clip, texture = 1.7, axis = 'side', smoothing = 'linear', ...rest } = extra;
    const points = jitterPath(values.map(([x, y, pressure = .8]) => ({ x, y, pressure })), texture,
      { seed: (seed ^ hash(id)) >>> 0, wavelength: 18, tangentRatio: .12, preserveEndpoints: true });
    return { id, points, options: { ...plain, width, opacity, dryness, axis, smoothing,
      ...(clip ? { clip: clip.map(([x, y]) => ({ x, y })) } : {}), ...rest } };
  };
  const group = (id, strokes, parentId) => ({ id, role: 'mark', ...(parentId ? { parentId } : {}), strokes });

  // Broad contacts put a pale plane under the short dark facets. Their final
  // wet gray material below prevents repeated transparent bristles from making
  // nested bowls. The middle/right face remains largely unpainted.
  const washes = [
    mark('cap-pale-left', [[1037, 667, .25], [1110, 639, .88], [1204, 623, .65], [1282, 627, .2]], 96, .13, .34, { clip: capClip, smoothing: 'catmull-rom' }),
    mark('cap-pale-right', [[1235, 627, .25], [1301, 633, .72], [1353, 659, .67], [1395, 708, .2]], 108, .095, .39, { clip: capClip, smoothing: 'catmull-rom' }),
    mark('cap-under-plane', [[1081, 701, .2], [1160, 714, .85], [1233, 738, .68], [1320, 756, .15]], 90, .13, .46, { clip: capClip }),
    mark('shoulder-wash', [[1068, 673, .24], [1084, 732, .9], [1112, 794, .76], [1128, 846, .2]], 137, .16, .42, { clip: bodyClip, smoothing: 'catmull-rom' }),
    mark('upper-left-wash', [[1067, 805, .2], [1078, 876, .88], [1086, 945, .78], [1095, 1009, .25]], 131, .14, .43, { clip: bodyClip, smoothing: 'catmull-rom' }),
    mark('middle-left-wash', [[1062, 979, .25], [1081, 1053, .9], [1108, 1123, .72], [1141, 1170, .2]], 125, .13, .44, { clip: bodyClip }),
    mark('turning-face-wash', [[1112, 1120, .24], [1149, 1185, .91], [1193, 1241, .8], [1210, 1309, .15]], 115, .12, .47, { clip: bodyClip, smoothing: 'catmull-rom' }),
    mark('lower-main-wash', [[1149, 1313, .18], [1167, 1394, .86], [1203, 1486, .77], [1227, 1569, .13]], 99, .11, .49, { clip: bodyClip, smoothing: 'catmull-rom' }),
    mark('inner-face-soft-turn', [[1121, 854, .13], [1158, 888, .75], [1154, 944, .4]], 74, .085, .56, { clip: bodyClip }),
    mark('middle-face-pale', [[1135, 1044, .2], [1151, 1097, .67], [1196, 1159, .25]], 80, .075, .58, { clip: bodyClip }),
    mark('lower-face-pale', [[1150, 1381, .17], [1178, 1439, .73], [1213, 1493, .22]], 72, .075, .59, { clip: bodyClip }),
    mark('detached-face-upper-wash', [[1237, 1647, .13], [1267, 1704, .79], [1308, 1743, .62], [1330, 1780, .2]], 89, .105, .52, { clip: lowerClip }),
    mark('detached-face-mid-wash', [[1239, 1742, .19], [1270, 1802, .77], [1304, 1831, .62], [1329, 1854, .12]], 103, .11, .57, { clip: lowerClip }),
    mark('detached-face-lower-wash', [[1281, 1878, .15], [1326, 1925, .81], [1357, 1968, .56], [1383, 2010, .12]], 83, .1, .59, { clip: lowerClip }),
    mark('detached-face-tip-wash', [[1362, 1985, .15], [1395, 2036, .7], [1439, 2110, .1]], 46, .07, .66, { clip: lowerClip }),
  ];

  const capPlanes = [
    mark('cap-left-rake', [[1048, 674, .25], [1083, 655, .94], [1146, 649, .66], [1188, 641, .16]], 70, .29, .57, { clip: capClip }),
    mark('cap-left-heel', [[1046, 694, .21], [1058, 730, .9], [1084, 759, .17]], 72, .31, .53, { clip: bodyClip }),
    mark('cap-broken-shelf', [[1100, 685, .22], [1149, 674, .94], [1183, 659, .45]], 54, .28, .61),
    mark('cap-inner-fold', [[1180, 661, .22], [1220, 679, .85], [1248, 718, .79], [1259, 766, .2]], 32, .27, .57),
    mark('cap-recess', [[1164, 740, .18], [1206, 755, .91], [1241, 772, .72], [1284, 759, .14]], 66, .29, .6),
    mark('cap-right-chamfer', [[1326, 618, .17], [1354, 646, .8], [1375, 694, .7], [1403, 723, .12]], 40, .2, .68, { clip: capClip }),
    mark('cap-far-rim', [[1352, 720, .18], [1393, 738, .84], [1435, 749, .16]], 44, .21, .65, { clip: capClip }),
    mark('cap-under-broken-rake', [[1260, 768, .16], [1303, 763, .84], [1358, 746, .19]], 49, .24, .67),
  ];

  const bodyFacets = [
    ['shoulder-dark', [[1047, 722, .62], [1092, 745, .96], [1144, 724, .7]], 96, .28, .16],
    ['upper-recess', [[1052, 797, .71], [1102, 811, .94], [1140, 835, .64]], 98, .32, .19],
    ['upper-right-fold', [[1121, 775, .64], [1157, 818, .92], [1148, 857, .69]], 64, .27, .21],
    ['upper-plane-step', [[1038, 870, .65], [1098, 893, .98], [1133, 923, .66]], 101, .29, .2],
    ['middle-ledged-a', [[1043, 943, .72], [1107, 934, .94]], 101, .28, .17],
    ['middle-ledged-b', [[1053, 987, .68], [1110, 1030, .95], [1135, 1067, .62]], 103, .31, .18],
    ['middle-notch-left', [[1071, 1080, .68], [1135, 1089, .96]], 82, .28, .22],
    ['middle-diagonal-facet', [[1088, 1123, .66], [1118, 1166, .96], [1183, 1186, .7]], 88, .3, .2],
    ['body-right-shadow-step', [[1157, 1185, .67], [1218, 1204, .96], [1245, 1181, .66]], 78, .31, .23],
    ['body-low-shelf', [[1134, 1244, .69], [1195, 1281, .95]], 85, .29, .18],
    ['body-low-right-bend', [[1203, 1268, .7], [1220, 1324, .96]], 69, .28, .24],
    ['body-low-left-plane', [[1130, 1345, .63], [1168, 1418, .95]], 70, .27, .19],
    ['body-tip-shelf-a', [[1168, 1451, .68], [1225, 1468, .94]], 64, .29, .23],
    ['body-tip-termination', [[1195, 1513, .66], [1232, 1557, .92]], 47, .3, .2],
  ].map(([id, points, width, opacity, dryness]) => mark(id, points, width, opacity, dryness, { clip: bodyClip }));

  // Sparse separated marks on the pale right face. Do not join these into an
  // outline or fill the open, almost paper-coloured central plane.
  const paleFace = [
    ['right-face-small-scar-a', [[1341, 837, .62], [1365, 847, .83]], 30, .17],
    ['right-face-sloping-crease', [[1306, 915, .58], [1335, 930, .86]], 32, .19],
    ['right-face-center-dash', [[1267, 973, .61], [1282, 1002, .86]], 29, .2],
    ['right-face-small-scar-d', [[1231, 1098, .58], [1265, 1115, .83]], 28, .15],
    ['right-face-small-scar-e', [[1208, 1156, .6], [1249, 1172, .91]], 37, .22],
  ].map(([id, points, width, opacity]) => mark(id, points, width, opacity, .28));

  const detachedFacets = [
    ['detached-first-dash', [[1271, 1588, .58], [1302, 1601, .84]], 22, .21],
    ['detached-crest-dash', [[1285, 1630, .64], [1313, 1651, .86]], 32, .22],
    ['detached-upper-fold', [[1248, 1679, .69], [1291, 1715, .95], [1326, 1727, .62]], 65, .27],
    ['detached-face-top', [[1261, 1745, .7], [1312, 1766, .96], [1355, 1760, .66]], 77, .3],
    ['detached-face-mid-a', [[1267, 1814, .7], [1323, 1841, .93]], 78, .3],
    ['detached-face-bottom-step', [[1292, 1884, .68], [1347, 1881, .94]], 68, .29],
    ['detached-lower-fold', [[1319, 1924, .67], [1364, 1968, .91]], 53, .27],
    ['detached-tip-rake', [[1370, 2008, .59], [1407, 2055, .86]], 31, .2],
  ].map(([id, points, width, opacity]) => mark(id, points, width, opacity, .23, { clip: lowerClip }));

  const dryScars = [
    ['cap-inner-dry-a', [[1090, 688, .1], [1141, 696, .89], [1164, 684, .12]], 16, .32],
    ['cap-inner-dry-b', [[1161, 658, .13], [1201, 651, .85], [1238, 637, .1]], 15, .26],
    ['cap-front-split', [[1244, 715, .14], [1258, 745, .91], [1250, 777, .12]], 21, .34],
    ['body-dry-turn-a', [[1080, 808, .16], [1123, 817, .91], [1151, 799, .13]], 24, .34],
    ['body-dry-turn-b', [[1086, 892, .12], [1117, 908, .88], [1148, 891, .14]], 22, .31],
    ['body-dry-step-a', [[1051, 951, .13], [1080, 966, .88], [1114, 950, .11]], 21, .29],
    ['body-dry-step-b', [[1058, 1059, .12], [1095, 1080, .9], [1131, 1069, .14]], 22, .3],
    ['body-dry-step-c', [[1110, 1152, .14], [1140, 1176, .91], [1174, 1176, .13]], 23, .3],
    ['body-dry-corner', [[1192, 1211, .13], [1226, 1221, .89], [1249, 1204, .14]], 20, .33],
    ['body-dry-step-d', [[1170, 1312, .12], [1195, 1333, .84], [1228, 1323, .1]], 22, .32],
    ['body-dry-step-e', [[1181, 1432, .1], [1204, 1456, .9], [1234, 1447, .11]], 18, .33],
    ['body-tip-dry-drag', [[1211, 1502, .12], [1228, 1532, .85], [1232, 1579, .1]], 17, .3],
    ['detached-dry-rake-a', [[1291, 1732, .12], [1321, 1745, .9], [1356, 1738, .11]], 20, .32],
    ['detached-dry-rake-b', [[1280, 1822, .14], [1319, 1841, .91], [1351, 1831, .1]], 20, .31],
    ['detached-dry-rake-c', [[1306, 1897, .12], [1338, 1914, .87], [1367, 1926, .1]], 18, .29],
    ['detached-dry-tip', [[1374, 2007, .13], [1403, 2038, .86], [1432, 2089, .08]], 12, .22],
  ].filter(([id]) => ['cap-front-split', 'body-dry-corner', 'body-tip-dry-drag', 'detached-dry-tip'].includes(id))
    .map(([id, points, width, opacity]) => mark(id, points, width, opacity * .7, .58, { texture: 2.3 }));

  const edges = [
    ['cap-top-left-edge', [[1037, 649, .2], [1101, 622, .86], [1185, 605, .74], [1269, 590, .1]], 7.2, .46],
    ['cap-top-right-edge', [[1299, 595, .14], [1340, 609, .85], [1367, 645, .67], [1383, 685, .12]], 5.5, .32],
    ['cap-right-broken-edge', [[1380, 665, .16], [1400, 697, .86], [1413, 723, .1]], 8.1, .37],
    ['cap-turn-crease', [[1205, 666, .16], [1231, 685, .86], [1250, 727, .63], [1252, 763, .13]], 5.3, .38],
    ['body-left-edge-upper', [[1027, 709, .12], [1015, 751, .77], [1028, 792, .15]], 6.6, .26],
    ['body-inner-round-crease', [[1098, 841, .12], [1121, 826, .73], [1144, 847, .88], [1155, 879, .12]], 5.2, .31],
    ['pale-face-right-contour', [[1325, 966, .12], [1306, 1010, .8], [1295, 1080, .68], [1273, 1140, .14]], 5.1, .31],
    ['body-lower-left-round', [[1085, 1352, .1], [1097, 1392, .74], [1126, 1437, .64], [1143, 1451, .12]], 4.4, .23],
    ['body-tip-inside-rake', [[1142, 1440, .13], [1172, 1485, .78], [1205, 1544, .12]], 4.8, .25],
    ['separation-thread', [[1239, 1573, .1], [1228, 1615, .69], [1218, 1672, .13]], 4, .16],
    ['detached-left-edge', [[1208, 1662, .1], [1207, 1722, .74], [1219, 1790, .67], [1240, 1835, .13]], 5.3, .23],
    ['detached-inner-lower-crease', [[1249, 1842, .13], [1275, 1892, .78], [1322, 1946, .13]], 4.9, .22],
    ['detached-final-edge-fragment', [[1380, 2009, .1], [1407, 2054, .73], [1452, 2135, .08]], 3.4, .18],
  ].filter(([id]) => ['cap-top-left-edge', 'cap-right-broken-edge', 'cap-turn-crease', 'pale-face-right-contour',
    'body-lower-left-round', 'separation-thread', 'detached-left-edge', 'detached-final-edge-fragment'].includes(id))
    .map(([id, points, width, opacity]) => mark(id, points, width, opacity, .35, { axis: 'center', texture: .8, smoothing: 'catmull-rom' }));

  // A near-opaque pale pigment is a source material choice for this Canvas
  // contact backend: multiple bristles retain almost the same gray instead of
  // accumulating visibly darker parallel rims. No raster fill or filter is used.
  const wetGray = (strokes, { ink, dryness = .1, opacity = .94, widthScale = 1 } = {}) => strokes.map(stroke => ({
    ...stroke, options: { ...stroke.options, ink, dryness, opacity, width: stroke.options.width * widthScale },
  }));
  const quietWashes = wetGray(washes, { ink: '#c8cbbf', dryness: .065, opacity: .98, widthScale: 1.18 });
  const capBlocks = wetGray(capPlanes, { ink: '#a5a99b', dryness: .095, opacity: .96, widthScale: 1.1 });
  const irregularBlocks = bodyFacets.map((stroke, index) => ({ ...stroke, options: { ...stroke.options,
    ink: ['#a2a697', '#969c8d', '#adb0a1', '#9da392'][index % 4], dryness: .11 + index % 3 * .035, opacity: .95,
  } }));
  const detachedBlocks = wetGray(detachedFacets, { ink: '#a4aa9a', dryness: .12, opacity: .94 });
  const quietFace = wetGray(paleFace, { ink: '#b3b9aa', dryness: .12, opacity: .91 });

  return [
    group('bada-rock-pale-planes', quietWashes),
    group('bada-rock-cap-facets', capBlocks, 'bada-rock-pale-planes'),
    group('bada-rock-body-facets', irregularBlocks, 'bada-rock-pale-planes'),
    group('bada-rock-open-face-scars', quietFace, 'bada-rock-pale-planes'),
    group('bada-rock-detached-facets', detachedBlocks, 'bada-rock-pale-planes'),
    group('bada-rock-dry-scars', dryScars, 'bada-rock-pale-planes'),
    group('bada-rock-edge-fragments', edges, 'bada-rock-pale-planes'),
  ];
}
