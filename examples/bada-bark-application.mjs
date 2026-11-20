import { createStrokeGroupDocument } from '../dist/stroke-group-document.js';
import { createBadaDocument } from './bada-composition.mjs';
import { BARK_APPLICATION_CASES, createBadaBarkDocument } from './bark-study-fixtures.mjs';

/** Replace only the two studied bark regions; keep the remaining authored painting. */
export function createBadaBarkApplication({ width = 540, seed = 821730 } = {}) {
  const original = createBadaDocument({ width, seed });
  const removed = new Map();
  for (const item of BARK_APPLICATION_CASES) for (const selection of item.baselineSelection) {
    const ids = removed.get(selection.groupId) ?? new Set();
    selection.strokeIds.forEach(id => ids.add(id));
    removed.set(selection.groupId, ids);
  }
  const retained = original.recipe.groups.map(group => ({ ...group,
    strokes: group.strokes.filter(stroke => !removed.get(group.id)?.has(stroke.id)),
  })).filter(group => group.strokes.length);
  const scale = width / 1381;
  const move = point => ({ ...point, x: (point.x - 73) * scale, y: (point.y - 78) * scale });
  const generated = BARK_APPLICATION_CASES.flatMap(item => {
    const source = createBadaBarkDocument(item.id, { seed });
    // The existing composition routes structure and accents by this explicit prefix.
    const id = value => 'bone-bark/' + value;
    return source.groups.map(group => ({ ...group, id: id(group.id),
      ...(group.parentId ? { parentId: id(group.parentId) } : {}),
      strokes: group.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(move),
        options: { ...stroke.options, width: stroke.options.width * scale,
          ...(stroke.options.clip ? { clip: stroke.options.clip.map(move) } : {}),
        },
      })),
    }));
  });
  return createStrokeGroupDocument([...retained, ...generated], original.recipe.options);
}
