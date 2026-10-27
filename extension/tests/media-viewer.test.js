import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainView, zoomView } from '../media-viewer.js';

test('viewer zoom keeps the pointed detail in place, clamps panning and resets to a full image', () => {
  const media = { width: 800, height: 600 }, viewport = { width: 800, height: 600 };
  const zoomed = zoomView({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: -80 }, media, viewport);
  assert.deepEqual(zoomed, { scale: 2, x: -100, y: 80 });
  assert.equal((100 - zoomed.x) / zoomed.scale, 100);
  assert.equal((-80 - zoomed.y) / zoomed.scale, -80);
  assert.deepEqual(constrainView({ scale: 2, x: 5000, y: -5000 }, media, viewport), { scale: 2, x: 400, y: -300 });
  assert.deepEqual(zoomView(zoomed, 1, { x: 0, y: 0 }, media, viewport), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(constrainView({ scale: 2, x: 99, y: 99 }, { width: 200, height: 600 }, viewport), { scale: 2, x: 0, y: 99 });
  assert.equal(constrainView({ scale: 100, x: 0, y: 0 }, media, viewport).scale, 6);
});
