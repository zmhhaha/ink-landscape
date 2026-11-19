import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrushDocument, sampleBrushContact, createInkScene } from '../dist/index.js';

const path = [{ x: 20, y: 60, pressure: 1 }, { x: 320, y: 60, pressure: 1 }];
const contact = options => sampleBrushContact(createBrushDocument(path, options).result);

test('local pressure changes contact without moving the authored tip trajectory', () => {
  const samples = contact({ controls: [{ at: 0, pressure: .1 }, { at: .5, pressure: 1 }, { at: 1, pressure: .1 }] });
  assert.ok(samples.every(point => point.y === 60 && point.centerY === 60));
  assert.ok(samples[Math.floor(samples.length / 2)].halfWidth > samples[0].halfWidth * 3);
  assert.deepEqual({ x: samples[0].x, y: samples[0].y }, { x: 20, y: 60 });
  assert.equal(samples.at(-1).x, 320);
});

test('side use changes tip-to-contact relation and rotates with the caller path', () => {
  const center = contact({ axis: 'center' });
  const side = contact({ axis: 'side' });
  assert.equal(center[0].centerY, center[0].y);
  assert.ok(side[0].centerY > side[0].y);
  assert.ok(side[0].halfWidth > center[0].halfWidth);
  const vertical = createBrushDocument([{ x: 60, y: 20 }, { x: 60, y: 320 }], { axis: 'side' });
  const rotated = sampleBrushContact(vertical.result);
  assert.ok(rotated[0].centerX < rotated[0].x);
  assert.equal(rotated[0].centerY, rotated[0].y);
  assert.equal(rotated[0].halfWidth, side[0].halfWidth);
});

test('independent local channels interpolate through sparse unrelated controls', () => {
  const samples = contact({ controls: [{ at: 0, side: 0, dryness: .1 }, { at: .3, pressure: .2 }, { at: 1, side: 1, dryness: .9 }] });
  assert.equal(samples[0].side, 0); assert.equal(samples.at(-1).side, 1);
  assert.equal(samples[0].dryness, .1); assert.equal(samples.at(-1).dryness, .9);
  const middle = samples[Math.floor(samples.length / 2)];
  assert.ok(middle.side > .4 && middle.side < .6);
  assert.ok(middle.dryness > .4 && middle.dryness < .6);
  const blank = createBrushDocument(path.map(point => ({ ...point, pressure: 0 })), { axis: 'side', controls: [{ at: .5, pressure: 1 }] });
  assert.ok(sampleBrushContact(blank.result).every(point => point.halfWidth === 0));
});

test('builder copies contact controls and rejects invalid imported control data', () => {
  const builder = createInkScene({ width: 400, height: 200 });
  const controls = [{ at: 0, side: .2 }, { at: 1, dryness: .8 }];
  const mark = builder.stroke(path, { brush: { version: 1, controls } });
  controls[0].side = 1;
  assert.equal(mark.brush.controls[0].side, .2);
  for (const brush of [{ version: 2, controls: [] }, { version: 1, controls: [{ at: .6 }, { at: .4 }] },
    { version: 1, controls: [{ at: 0, inkLoad: -1 }] }, { version: 1, controls: [{ at: 0, pressure: NaN }] }]) {
    assert.throws(() => createInkScene({ width: 400, height: 200 }).stroke(path, { brush }));
  }
});

test('contact bearing turns continuously around an authored corner without smoothing the tip path', () => {
  const document = createBrushDocument([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], { width: 30, smoothing: 'linear' });
  const samples = sampleBrushContact(document.result);
  assert.ok(samples.every(point => Math.abs(point.y) < 1e-9 || Math.abs(point.x - 100) < 1e-9));
  for (let i = 1; i < samples.length; i++) assert.ok(Math.hypot(samples[i].nx - samples[i - 1].nx, samples[i].ny - samples[i - 1].ny) < .3);
});

test('explicit short lifts survive sampling even between uniformly spaced stations', () => {
  const document = createBrushDocument([{ x: 0, y: 0 }, { x: 10, y: 0 }], { controls: [
    { at: 0, pressure: 1 }, { at: .4499, pressure: 1 }, { at: .45, pressure: 0 },
    { at: .55, pressure: 0 }, { at: .5501, pressure: 1 }, { at: 1, pressure: 1 },
  ] });
  const samples = sampleBrushContact(document.result);
  for (const at of [.45, .55]) {
    const anchor = samples.find(point => Math.abs(point.distance - at * 10) < 1e-10);
    assert.ok(anchor); assert.equal(anchor.pressure, 0); assert.equal(anchor.halfWidth, 0);
  }
  assert.throws(() => sampleBrushContact({ ...document.result, dryness: NaN }), /dryness/);
});
