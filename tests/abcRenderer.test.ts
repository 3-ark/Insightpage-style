import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderAbcBlock } from '../src/abcRenderer';

test('renderAbcBlock sets up sheet container, playback controls and download button', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const sampleAbc = `
X:1
T:Cooley's
M: 4/4
L: 1/8
R: reel
K: Emin
|:D2|EB{c}BA B2 EB|~B2 AB dBAG|
`;

  renderAbcBlock(sampleAbc, container);

  const wrapper = container.querySelector('.abcjs-wrapper');
  assert.ok(wrapper, 'Wrapper should be present');

  const sheet = wrapper.querySelector('.abcjs-sheet-container');
  assert.ok(sheet, 'Sheet container should be present');

  const controls = wrapper.querySelector('.abcjs-controls-bar');
  assert.ok(controls, 'Controls bar should be present');

  const playBtn = controls.querySelector('.abcjs-play-btn');
  assert.ok(playBtn, 'Play button should be present');

  const stopBtn = controls.querySelector('.abcjs-stop-btn');
  assert.ok(stopBtn, 'Stop button should be present');

  const restartBtn = controls.querySelector('.abcjs-restart-btn');
  assert.ok(restartBtn, 'Restart button should be present');

  const downloadBtn = controls.querySelector('.abcjs-download-btn');
  assert.ok(downloadBtn, 'Download button should be present');

  const copyBtn = controls.querySelector('.abcjs-copy-btn');
  assert.ok(copyBtn, 'Copy button should be present');
});
