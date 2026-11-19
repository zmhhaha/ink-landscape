import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkProcessDocument, renderInkProcess } from '../dist/index.js';

function document() {
  return createInkProcessDocument([{ id: 'one', at: 0, concentration: .5, water: .8,
    strokes: [{ points: [{ x: 10, y: 36, pressure: 0 }, { x: 35, y: 36, pressure: 1 }, { x: 80, y: 36, pressure: 0 }],
      options: { id: 'line', seed: 7, width: 24, dryness: .1 } }] }],
  { width: 96, height: 72, background: '#f5f2e9', ink: '#20251f', seed: 11 });
}

function context() {
  const calls = [], stack = [];
  const state = { globalAlpha: .3, globalCompositeOperation: 'multiply', shadowBlur: 4,
    shadowOffsetX: 2, shadowOffsetY: 3, filter: 'blur(2px)', imageSmoothingEnabled: false,
    transform: [1, 0, 0, 1, 6, 9] };
  const initial = structuredClone(state);
  const target = { calls, state, initial, canvas: { width: 192, height: 144, ownerDocument: {
    createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = { width: 0, height: 0, pixels: undefined };
      canvas.getContext = () => ({ createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: image => { canvas.pixels = new Uint8ClampedArray(image.data); } });
      return canvas;
    },
  } } };
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      if (key in state) return state[key];
      if (key === 'save') return () => { stack.push(structuredClone(state)); calls.push(['save']); };
      if (key === 'restore') return () => { Object.assign(state, stack.pop()); calls.push(['restore']); };
      if (key === 'setTransform') return (...args) => { state.transform = args; calls.push(['transform', ...args]); };
      if (key === 'drawImage') return canvas => {
        calls.push(['drawImage']);
        if (object.fail) throw new Error('Canvas draw failed');
        object.pixels = new Uint8ClampedArray(canvas.pixels);
      };
      return (...args) => { calls.push([key, ...args]); };
    },
    set(object, key, value) { if (key in state) state[key] = value; else object[key] = value; return true; },
  });
}

test('ink Canvas renderer paints opaque paper, seeks deterministically and restores caller state', () => {
  const doc = document(), ctx = context();
  const stats = renderInkProcess(ctx, doc.result, { time: 0, cellSize: 1 });
  assert.equal(stats.activeLayers, 1);
  const ink = ctx.pixels;
  assert.ok(ink.some((value, index) => index % 4 === 0 && value < 200));
  assert.ok(ink.every((value, index) => index % 4 !== 3 || value === 255));
  renderInkProcess(ctx, doc.result, { time: -1, cellSize: 1 });
  const paper = ctx.pixels;
  assert.ok(paper.every((value, index) => value === [245, 242, 233, 255][index % 4]));
  renderInkProcess(ctx, doc.result, { time: 2, cellSize: 1 });
  assert.deepEqual(ctx.pixels, ink);
  renderInkProcess(ctx, doc.result, { time: -1, cellSize: 1 });
  assert.deepEqual(ctx.pixels, paper);
  assert.deepEqual(ctx.state, ctx.initial);
});

test('ink Canvas playback observes mutable JSON edits and balances state after draw failures', () => {
  const process = JSON.parse(JSON.stringify(document().result)), ctx = context();
  renderInkProcess(ctx, process);
  const first = ctx.pixels;
  process.layers[0].concentration = .9;
  renderInkProcess(ctx, process);
  assert.notDeepEqual(ctx.pixels, first);
  ctx.fail = true;
  assert.throws(() => renderInkProcess(ctx, process), /Canvas draw failed/);
  assert.deepEqual(ctx.state, ctx.initial);
});

test('invalid ink programs and renderer options fail before target painting', () => {
  const ctx = context(), process = document().result;
  for (const options of [{ time: Infinity }, { time: NaN }, { cellSize: 0 }, { cellSize: Infinity }, { unknown: 1 }]) {
    assert.throws(() => renderInkProcess(ctx, process, options));
    assert.equal(ctx.calls.length, 0);
  }
  assert.throws(() => renderInkProcess(ctx, { ...process, version: 99 }));
  assert.equal(ctx.calls.length, 0);
});
