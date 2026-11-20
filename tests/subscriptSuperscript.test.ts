import { setupDomPolyfills } from "./setupDom";
setupDomPolyfills();
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
  url: 'https://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.MutationObserver = dom.window.MutationObserver;
dom.window.requestAnimationFrame = () => 1;
dom.window.cancelAnimationFrame = () => {};

import {
  findSubscriptSuperscriptRanges,
  transformSubscriptSuperscriptHtml,
  processSubscriptSuperscript,
  subscriptSuperscriptEditorExtension,
} from '../src/subscriptSuperscript';

void test('findSubscriptSuperscriptRanges identifies script content and ignores code', () => {
  const source = 'H^2^O and ~down~ and `^literal^`.\n```md\n~literal~\n```';

  assert.deepEqual(
    findSubscriptSuperscriptRanges(source).map(({ from, to, tagName }) => ({
      text: source.slice(from, to),
      tagName,
    })),
    [
      { text: '2', tagName: 'sup' },
      { text: 'down', tagName: 'sub' },
    ]
  );
});

void test('subscript renders as a styled span in live preview', () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: '~~strike~~ ~down~ text',
      selection: EditorSelection.cursor(22),
      extensions: [subscriptSuperscriptEditorExtension],
    }),
    parent: document.createElement('div'),
  });

  const subscript = view.dom.querySelector('.cm-ip-subscript');
  assert.ok(subscript);
  assert.equal(subscript.tagName, 'SPAN');
  assert.equal(subscript.textContent, 'down');
  assert.equal(
    subscript.getAttribute('style'),
    'vertical-align: -0.25em; font-size: 0.75em; line-height: 0;'
  );
  assert.equal(view.dom.textContent, '~~strike~~ down text');
  view.destroy();
});

test('transformSubscriptSuperscriptHtml correctly converts superscript and subscript syntax', () => {
  const input = 'This ^**note**^ *demonstrates* ~the~ various ==***"Markdown"***== rendering capabilities of InsightPage ~~***"笔记"***~~.';
  const output = transformSubscriptSuperscriptHtml(input);

  assert.equal(
    output,
    'This <sup>**note**</sup> *demonstrates* <sub>the</sub> various ==***"Markdown"***== rendering capabilities of InsightPage ~~***"笔记"***~~.'
  );
});

test('transformSubscriptSuperscriptHtml preserves strikethrough (~~) without converting to subscript', () => {
  const input = 'This is ~~strikethrough~~ text and ~subscript~ text.';
  const output = transformSubscriptSuperscriptHtml(input);

  assert.equal(
    output,
    'This is ~~strikethrough~~ text and <sub>subscript</sub> text.'
  );
});

test('transformSubscriptSuperscriptHtml does not convert text inside code blocks', () => {
  const input = 'Text with ^super^ and <code>^code^ and ~sub~</code> inside code.';
  const output = transformSubscriptSuperscriptHtml(input);

  assert.equal(
    output,
    'Text with <sup>super</sup> and <code>^code^ and ~sub~</code> inside code.'
  );
});

test('processSubscriptSuperscript updates container DOM element', () => {
  const container = document.createElement('div');
  container.innerHTML = '<p>This ^**note**^ ~the~ end.</p>';

  processSubscriptSuperscript(container);

  assert.equal(
    container.innerHTML,
    '<p>This <sup>**note**</sup> <sub>the</sub> end.</p>'
  );
});

test('processSubscriptSuperscript preserves markdown emphasis inside scripts', () => {
  const container = document.createElement('div');
  container.innerHTML = '<p>^<strong>up</strong>^ ~<strong>down</strong>~</p>';

  processSubscriptSuperscript(container);

  assert.equal(
    container.innerHTML,
    '<p><sup><strong>up</strong></sup> <sub><strong>down</strong></sub></p>'
  );
});
