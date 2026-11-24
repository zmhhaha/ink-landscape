import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCanvas } from '../dist/canvas.js';
import { createBrushDocument } from '../dist/brush-document.js';

const stroke = {
  kind: 'stroke', id: 'stroke-1', ink: '#171b18', opacity: 0.8,
  width: 9, dryness: 0.6, nib: 'flat', tipAngle: 0.6, seed: 37,
  points: [{ x: 10, y: 10, pressure: 0.2 }, { x: 40, y: 23, pressure: 1 }, { x: 76, y: 58, pressure: 0.1 }],
  start: 1, duration: 2,
};
const wash = {
  kind: 'wash', id: 'wash-1', ink: '#171b18', opacity: 0.2,
  seed: 83, start: 0, duration: 0, roughness: 0.3, passes: 3,
  outline: [{ x: 10, y: 5 }, { x: 80, y: 10 }, { x: 65, y: 72 }, { x: 5, y: 50 }],
};
const scene = { version: 1, width: 100, height: 80, seed: 12, background: '#eee9dc', marks: [wash, stroke] };

function context() {
  const calls = [];
  const stack = [];
  const state = {
    fillStyle: '#aabbcc', globalAlpha: 0.4, globalCompositeOperation: 'multiply',
    shadowBlur: 7, shadowOffsetX: 2, shadowOffsetY: 3, filter: 'blur(2px)',
    transform: [1, 0, 0, 1, 11, 13],
  };
  const initial = structuredClone(state);
  const target = { canvas: { width: 200, height: 160 }, calls, state, initial };
  const ctx = new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (property in state) return state[property];
      if (property === 'save') return () => { stack.push(structuredClone(state)); calls.push(['save']); };
      if (property === 'restore') return () => {
        assert.ok(stack.length, 'balanced Canvas save/restore');
        Object.assign(state, stack.pop());
        calls.push(['restore']);
      };
      if (property === 'setTransform') return (...args) => { state.transform = args; calls.push(['setTransform', ...args]); };
      return (...args) => {
        if (object.failOn === property) throw new Error('simulated Canvas failure');
        for (const argument of args) if (typeof argument === 'number') assert.ok(Number.isFinite(argument));
        calls.push([property, ...args]);
      };
    },
    set(object, property, value) {
      if (property in state) state[property] = value;
      else object[property] = value;
      calls.push(['set', property, value]);
      return true;
    },
  });
  return ctx;
}

test('absolute timing shows instant marks at their start and hides unrevealed paths', () => {
  assert.deepEqual(renderCanvas(context(), scene, { time: -1, paperTexture: 0 }), {
    visibleMarks: 0, strokeCount: 0, washCount: 0,
  });
  assert.deepEqual(renderCanvas(context(), scene, { time: 0, paperTexture: 0 }), {
    visibleMarks: 1, strokeCount: 0, washCount: 1,
  });
  assert.equal(renderCanvas(context(), scene, { time: 1, paperTexture: 0 }).strokeCount, 0);
  assert.equal(renderCanvas(context(), scene, { time: 1.001, paperTexture: 0 }).strokeCount, 1);
  assert.equal(renderCanvas(context(), scene).visibleMarks, 2);
});

test('seeking backwards reproduces the same drawing commands and leaves scene data unchanged', () => {
  for (const smoothing of ['linear', 'catmull-rom']) {
    const input = { ...scene, marks: [wash, { ...stroke, smoothing }] };
    const before = structuredClone(input);
    const ctx = context();
    renderCanvas(ctx, input, { time: 1.5 });
    const first = [...ctx.calls];
    ctx.calls.length = 0;
    renderCanvas(ctx, input, { time: 3 });
    ctx.calls.length = 0;
    renderCanvas(ctx, JSON.parse(JSON.stringify(input)), { time: 1.5 });
    assert.deepEqual(ctx.calls, first, smoothing);
    assert.deepEqual(input, before);
    assert.deepEqual(ctx.state, ctx.initial);
  }
});

test('legacy sampling reuses deeply frozen paths while validation and time seeking remain live', () => {
  for (const smoothing of ['linear', 'catmull-rom']) {
    let reads = 0;
    const points = stroke.points.map(point => Object.freeze({
      get x() { reads++; return point.x; }, y: point.y, pressure: point.pressure,
    }));
    const mark = Object.freeze({ ...stroke, smoothing, points: Object.freeze(points) });
    const input = { ...scene, marks: [mark] };
    const draw = time => {
      const ctx = context();
      renderCanvas(ctx, input, { time, paperTexture: 0 });
      assert.deepEqual(ctx.state, ctx.initial);
      return ctx.calls;
    };
    // Invisible marks still validate their source coordinates. This is the
    // baseline read count, independent of the sampler's internal read count.
    draw(0); const validationReads = reads; reads = 0;
    assert.ok(validationReads > 0);
    const first = draw(1.7), firstReads = reads; reads = 0;
    assert.ok(firstReads > validationReads, 'the initial visible render samples its source');
    draw(3);
    assert.equal(reads, validationReads, 'the frozen full render only rereads the source for validation');
    reads = 0;
    assert.deepEqual(draw(1.7), first, 'seeking backwards uses the same complete sample geometry');
    assert.equal(reads, validationReads, 'a different time does not resample a frozen path');
    const plain = JSON.parse(JSON.stringify(mark)), expected = context();
    renderCanvas(expected, { ...scene, marks: [plain] }, { time: 1.7, paperTexture: 0 });
    assert.deepEqual(first, expected.calls, 'a cached stroke matches an uncached JSON source');
    assert.deepEqual(Object.keys(mark), Object.keys({ ...stroke, smoothing, points }), 'caching adds no input fields');
  }
});

test('mutable legacy JSON observes point, pressure, width and smoothing edits without acquiring freezes', () => {
  const mark = JSON.parse(JSON.stringify({ ...stroke, smoothing: 'catmull-rom' }));
  const draw = () => {
    const ctx = context();
    renderCanvas(ctx, { ...scene, marks: [mark] }, { time: 2.2, paperTexture: 0 });
    assert.equal(Object.isFrozen(mark), false);
    assert.equal(Object.isFrozen(mark.points), false);
    assert.ok(mark.points.every(point => !Object.isFrozen(point)));
    return ctx.calls;
  };
  const first = draw();
  mark.points[1].x += 16;
  assert.notDeepEqual(draw(), first);
  mark.points[1].x -= 16;
  assert.deepEqual(draw(), first);
  const pressure = mark.points[1].pressure;
  mark.points[1].pressure = .12;
  assert.notDeepEqual(draw(), first);
  mark.points[1].pressure = pressure;
  assert.deepEqual(draw(), first);
  mark.width *= .5;
  assert.notDeepEqual(draw(), first);
  mark.width *= 2;
  assert.deepEqual(draw(), first);
  mark.smoothing = 'linear';
  assert.notDeepEqual(draw(), first);
  mark.smoothing = 'catmull-rom';
  assert.deepEqual(draw(), first);
});

test('shallow freezes do not make mutable legacy path data eligible for caching', () => {
  for (const freezeArray of [false, true]) {
    const points = JSON.parse(JSON.stringify(stroke.points));
    const mark = Object.freeze({ ...stroke, smoothing: 'catmull-rom', points: freezeArray ? Object.freeze(points) : points });
    const draw = () => {
      const ctx = context();
      renderCanvas(ctx, { ...scene, marks: [mark] }, { time: 2.2, paperTexture: 0 });
      assert.equal(Object.isFrozen(points), freezeArray);
      assert.ok(points.every(point => !Object.isFrozen(point)), 'rendering does not freeze caller-owned children');
      return ctx.calls;
    };
    const original = draw();
    points[1].x += 13;
    assert.notDeepEqual(draw(), original, `live point edit with frozen array=${freezeArray}`);
    points[1].x -= 13;
    const pressure = points[1].pressure;
    points[1].pressure = .15;
    assert.notDeepEqual(draw(), original);
    points[1].pressure = pressure;
    assert.deepEqual(draw(), original);
    if (!freezeArray) {
      const old = points[1];
      points[1] = { ...old, y: old.y + 12 };
      assert.notDeepEqual(draw(), original, 'a frozen mark can still have a mutable path array');
      points[1] = old;
      assert.deepEqual(draw(), original);
    }
  }
});

test('mutable legacy style remains live with a deeply frozen path and frozen strokes do not alias by id', () => {
  const points = Object.freeze(stroke.points.map(point => Object.freeze({ ...point })));
  const mark = { ...stroke, smoothing: 'catmull-rom', points };
  const draw = current => {
    const ctx = context();
    renderCanvas(ctx, { ...scene, marks: [current] }, { time: 2.2, paperTexture: 0 });
    return ctx.calls;
  };
  const first = draw(mark);
  mark.width *= .5;
  assert.notDeepEqual(draw(mark), first);
  mark.width *= 2;
  mark.smoothing = 'linear';
  assert.notDeepEqual(draw(mark), first);
  mark.smoothing = 'catmull-rom';
  assert.deepEqual(draw(mark), first);
  assert.equal(Object.isFrozen(mark), false);
  const frozen = Object.freeze({ ...mark });
  const other = Object.freeze({ ...mark, points: Object.freeze(points.map(point => Object.freeze({ ...point, x: point.x + 9 }))) });
  assert.equal(other.id, frozen.id);
  assert.notDeepEqual(draw(other), draw(frozen), 'only the same immutable mark object can reuse its cached geometry');
  assert.deepEqual(draw(frozen), first);
});

test('rendering restores caller state, including when the Canvas implementation throws', () => {
  const ctx = context();
  ctx.failOn = 'fill';
  assert.throws(() => renderCanvas(ctx, scene), /simulated Canvas failure/);
  assert.deepEqual(ctx.state, ctx.initial);
});

test('overlay mode preserves the backing pixels and applies polygon clips', () => {
  const ctx = context();
  const clipped = { ...stroke, clip: wash.outline };
  renderCanvas(ctx, { ...scene, marks: [clipped] }, { clear: false });
  assert.equal(ctx.calls.some(call => call[0] === 'clearRect'), false);
  assert.equal(ctx.calls.some(call => call[0] === 'clip'), true);
  assert.deepEqual(ctx.state, ctx.initial);
});

test('invalid render inputs fail before drawing', () => {
  for (const time of [Infinity, -Infinity, NaN]) {
    const ctx = context();
    assert.throws(() => renderCanvas(ctx, scene, { time }), /time must be finite/);
    assert.equal(ctx.calls.length, 0);
  }
  assert.throws(() => renderCanvas(context(), scene, { paperTexture: 1.1 }), /paperTexture/);
  assert.throws(() => renderCanvas(context(), { ...scene, width: 0 }), /dimensions/);
  assert.throws(() => renderCanvas(context(), { ...scene, version: 2 }), /version/);
  assert.throws(() => renderCanvas(context(), { ...scene, marks: [{ ...stroke, dryness: -0.1 }] }), /dryness/);
  assert.throws(() => renderCanvas(context(), { ...scene, marks: [{ ...wash, passes: 0 }] }), /passes/);
  const ctx = context();
  assert.throws(() => renderCanvas(ctx, { ...scene, marks: [{ ...stroke, smoothing: 'bezier' }] }), /smoothing/);
  assert.equal(ctx.calls.length, 0);
});

test('zero-pressure and repeated path vertices never produce non-finite Canvas coordinates', () => {
  const ctx = context();
  const repeated = {
    ...stroke, points: [{ x: 20, y: 20, pressure: 0 }, { x: 20, y: 20, pressure: 0 }, { x: 40, y: 40, pressure: 0.7 }],
  };
  assert.equal(renderCanvas(ctx, { ...scene, marks: [repeated] }).strokeCount, 1);
  assert.deepEqual(ctx.state, ctx.initial);
});

test('controlled contact rendering seeks deterministically and rejects invalid JSON before painting', () => {
  const document = createBrushDocument(stroke.points, { seed: 37, start: 1, duration: 2, controls: [
    { at: 0, dryness: .1, side: 0 }, { at: .5, pressure: .4 }, { at: 1, dryness: .95, side: 1 },
  ] });
  const input = { ...scene, marks: [document.result] };
  const ctx = context();
  renderCanvas(ctx, input, { time: 2 });
  const first = [...ctx.calls];
  renderCanvas(ctx, input, { time: 3 }); ctx.calls.length = 0;
  renderCanvas(ctx, JSON.parse(JSON.stringify(input)), { time: 2 });
  assert.deepEqual(ctx.calls, first);
  assert.deepEqual(ctx.state, ctx.initial);
  const invalid = context();
  assert.throws(() => renderCanvas(invalid, { ...scene, marks: [{ ...document.result, brush: { version: 8, controls: [] } }] }), /brush version/);
  assert.equal(invalid.calls.length, 0);
  const broken = context(); broken.failOn = 'fill';
  assert.throws(() => renderCanvas(broken, input), /simulated Canvas failure/);
  assert.deepEqual(broken.state, broken.initial);
});

test('contact material follows stroke identity without mutating paths or caching mutable JSON', () => {
  const document = createBrushDocument([{ x: 20, y: 40, pressure: .35 },
    { x: 80, y: 40, pressure: 1 }], { seed: 87, width: 18, dryness: .55, axis: 'side' });
  const original = structuredClone(document);
  const draw = mark => {
    const ctx = context();
    renderCanvas(ctx, { ...scene, marks: [mark] }, { paperTexture: 0 });
    assert.deepEqual(ctx.state, ctx.initial);
    return ctx.calls;
  };
  const frozen = draw(document.result);
  const mutable = JSON.parse(JSON.stringify(document.result));
  assert.deepEqual(draw(mutable), frozen);
  mutable.seed += 1;
  assert.notDeepEqual(draw(mutable), frozen, 'a changed material seed is evaluated anew');
  mutable.seed -= 1;
  assert.deepEqual(draw(mutable), frozen, 'restoring a seed restores the same deposits');
  mutable.width *= .5;
  assert.notDeepEqual(draw(mutable), frozen, 'mutable imported width cannot reuse a stale deposit plan');
  assert.deepEqual(document, original);
});

test('contact material adds no ink at zero pressure or zero local ink load', () => {
  for (const dry of [0, .45, 1]) for (const axis of ['center', 'side']) {
    for (const lifted of [true, false]) {
      const document = createBrushDocument([{ x: 20, y: 40, pressure: lifted ? 0 : 1 },
        { x: 80, y: 40, pressure: lifted ? 0 : 1 }], { seed: 123, width: 18, dryness: dry, axis,
        ...(lifted ? {} : { controls: [{ at: 0, inkLoad: 0 }, { at: 1, inkLoad: 0 }] }) });
      const ctx = context();
      renderCanvas(ctx, { ...scene, marks: [document.result] }, { paperTexture: 0 });
      assert.equal(ctx.calls.some(call => call[0] === 'fill'), false,
        `no pigment at dryness=${dry}, axis=${axis}, lifted=${lifted}`);
    }
  }
});

function releaseDeposits(ctx) {
  const result = [];
  let alpha = 1, path = [];
  for (const call of ctx.calls) {
    if (call[0] === 'set' && call[1] === 'globalAlpha') alpha = call[2];
    if (call[0] === 'beginPath') path = [];
    if (['moveTo', 'lineTo', 'quadraticCurveTo'].includes(call[0])) {
      for (let i = 1; i < call.length; i += 2) path.push([call[i], call[i + 1]]);
    }
    if (call[0] === 'fill' && alpha > 0 && alpha <= .12) result.push({ alpha, path });
  }
  return result;
}

test('a lifted forward tail reveals only sparse bounded pale filaments at the end', () => {
  const document = createBrushDocument([{ x: 20, y: 40, pressure: 1 },
    { x: 65, y: 40, pressure: .8 }, { x: 100, y: 40, pressure: 0 }], {
    width: 12, opacity: .9, dryness: .18, seed: 19, duration: 2, smoothing: 'linear',
    clip: [{ x: 0, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 80 }, { x: 0, y: 80 }],
  });
  const original = structuredClone(document);
  const draw = (time, mark = document.result) => {
    const ctx = context();
    renderCanvas(ctx, { ...scene, marks: [mark] }, { time, paperTexture: 0 });
    assert.deepEqual(ctx.state, ctx.initial);
    assert.ok(ctx.calls.some(call => call[0] === 'clip'));
    return { calls: ctx.calls, deposits: releaseDeposits(ctx) };
  };
  assert.equal(draw(1.9).deposits.length, 0, 'no complete tail appears before terminal release');
  const partial = draw(1.98), complete = draw(2);
  assert.ok(complete.deposits.length >= 1 && complete.deposits.length <= 2);
  assert.equal(partial.deposits.length, complete.deposits.length);
  const maxX = deposits => Math.max(...deposits.flatMap(deposit => deposit.path.map(point => point[0])));
  assert.ok(maxX(partial.deposits) < maxX(complete.deposits), 'the tail grows with the last progress prefix');
  assert.ok(maxX(complete.deposits) > 100 && maxX(complete.deposits) <= 107.22);
  assert.ok(complete.deposits.every(deposit => deposit.alpha <= .10
    && deposit.path.every(([x, y]) => x >= 97 && Math.abs(y - 40) <= 1.87)));
  assert.deepEqual(draw(1.98, JSON.parse(JSON.stringify(document.result))).calls, partial.calls);
  assert.deepEqual(document, original);
});

test('flat finishes, returning tails and absent pigment do not acquire release filaments', () => {
  const forward = [{ x: 20, y: 40, pressure: 1 }, { x: 65, y: 40, pressure: .8 }, { x: 100, y: 40, pressure: 0 }];
  const options = { width: 12, opacity: .9, dryness: .18, seed: 19, duration: 2, smoothing: 'linear' };
  const cases = [
    createBrushDocument(forward.map(point => ({ ...point, pressure: .7 })), options),
    createBrushDocument(forward.map(point => ({ ...point, pressure: .04 })), options),
    createBrushDocument(forward.map(point => ({ ...point, pressure: 0 })), options),
    createBrushDocument(forward, { ...options, controls: [{ at: 0, inkLoad: 0 }, { at: 1, inkLoad: 0 }] }),
    createBrushDocument(forward, { ...options, controls: [{ at: 0, inkLoad: 1 }, { at: .98, inkLoad: 0 }, { at: 1, inkLoad: 0 }] }),
    createBrushDocument(forward.map(point => ({ ...point, pressure: 1 })), {
      ...options, gestureModel: 'local-v1', finish: 'return', strength: 1,
    }),
    createBrushDocument(forward, { ...options, width: 2 }),
    createBrushDocument(forward, { ...options, width: 24 }),
  ];
  for (const document of cases) {
    const ctx = context();
    renderCanvas(ctx, { ...scene, marks: [document.result] }, { time: 2, paperTexture: 0 });
    assert.equal(releaseDeposits(ctx).length, 0);
  }
});
