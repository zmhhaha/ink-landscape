// Authoring aid, not a core material preset. Roles belong to these rock studies;
// all resolved options, order and times are saved as ordinary editable sources.
const phase = { wash: 0, body: 1, accent: 2 };
function variation(key) {
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

export function authoredInkLayers(strokes, roles) {
  const ordinals = [0, 0, 0];
  return strokes.map(stroke => {
    const role = roles[stroke.id];
    if (!(role in phase)) throw new RangeError(`Missing ink role for ${stroke.id}`);
    const layer = phase[role], ordinal = ordinals[layer]++, v = variation(stroke.id);
    const opacity = role === 'wash' ? .18 + v * .10 : role === 'body' ? .45 + v * .14 : .82 + v * .12;
    return { layer, ordinal, source: { ...stroke, options: { ...stroke.options,
      opacity, ...(role === 'wash' ? { dryness: .79 + v * .08 } : {}),
      start: layer * 2.1 + ordinal * .05, duration: .56,
    } } };
  }).sort((a, b) => a.layer - b.layer || a.ordinal - b.ordinal).map(entry => entry.source);
}
