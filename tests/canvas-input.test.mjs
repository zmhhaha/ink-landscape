import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCanvas } from '../dist/canvas.js';

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
  const before = structuredClone(scene);
  const ctx = context();
  renderCanvas(ctx, scene, { time: 1.5 });
  const first = [...ctx.calls];
  ctx.calls.length = 0;
  renderCanvas(ctx, scene, { time: 3 });
  ctx.calls.length = 0;
  renderCanvas(ctx, scene, { time: 1.5 });
  assert.deepEqual(ctx.calls, first);
  assert.deepEqual(scene, before);
  assert.deepEqual(ctx.state, ctx.initial);
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
});

test('zero-pressure and repeated path vertices never produce non-finite Canvas coordinates', () => {
  const ctx = context();
  const repeated = {
    ...stroke, points: [{ x: 20, y: 20, pressure: 0 }, { x: 20, y: 20, pressure: 0 }, { x: 40, y: 40, pressure: 0.7 }],
  };
  assert.equal(renderCanvas(ctx, { ...scene, marks: [repeated] }).strokeCount, 1);
  assert.deepEqual(ctx.state, ctx.initial);
});
