import { setupDomPolyfills } from "./setupDom";
setupDomPolyfills();
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
  url: 'https://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;

import { extractEmojiAndContent, extractEmojiAndTitle, processCommentCallouts, transformCommentHtml } from '../src/commentCallout';

void test('extractEmojiAndContent correctly extracts emoji and content', () => {
  const result1 = extractEmojiAndContent('💡 Secret Comment');
  assert.equal(result1.emoji, '💡');
  assert.equal(result1.content, 'Secret Comment');

  const result2 = extractEmojiAndContent('😂 comment');
  assert.equal(result2.emoji, '😂');
  assert.equal(result2.content, 'comment');

  const result3 = extractEmojiAndContent('Plain Comment Content');
  assert.equal(result3.emoji, '💬');
  assert.equal(result3.content, 'Plain Comment Content');

  const result4 = extractEmojiAndContent('');
  assert.equal(result4.emoji, '💬');
  assert.equal(result4.content, '');

  const result5 = extractEmojiAndTitle('📌 Important Note');
  assert.equal(result5.emoji, '📌');
  assert.equal(result5.title, 'Important Note');
});

void test('processCommentCallouts transforms ::cmt[😂 comment] syntax and toggles title-less popover on click', async () => {
  const container = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Here is an inline comment ::cmt[😂 comment] in a sentence.';
  container.append(paragraph);
  document.body.appendChild(container);

  processCommentCallouts(container);

  // Check screen trigger button
  const triggerBtn = container.querySelector('button.comment-callout-trigger');
  assert.ok(triggerBtn, 'Trigger button should exist');
  assert.equal(triggerBtn?.querySelector('svg'), null, 'Hat icon SVG should be deleted');
  assert.ok(triggerBtn?.textContent?.includes('😂'), 'Trigger button should contain emoji');

  // Click trigger button to open popover
  triggerBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  // Popover should be added to body
  const popover = document.body.querySelector('.comment-callout-popover');
  assert.ok(popover, 'Popover should be rendered in body on click');
  assert.equal(popover?.querySelector('.comment-callout-popover-title'), null, 'Popover title should not exist');
  assert.equal(popover?.querySelector('.comment-callout-divider'), null, 'Popover divider should not exist');
  assert.ok(popover?.querySelector('.comment-callout-popover-body')?.textContent?.includes('comment'), 'Popover body should contain comment text');

  // Click trigger again to close popover
  triggerBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(document.body.querySelector('.comment-callout-popover'), null, 'Popover should be closed on second click');

  document.body.removeChild(container);
});

void test('processCommentCallouts transforms legacy block callouts inline as well', () => {
  const container = document.createElement('div');
  const callout = document.createElement('div');
  callout.className = 'callout';
  callout.dataset.callout = 'comment';
  const title = document.createElement('div');
  title.className = 'callout-title';
  const titleInner = document.createElement('div');
  titleInner.className = 'callout-title-inner';
  titleInner.textContent = '💡 My Title';
  title.append(titleInner);
  const content = document.createElement('div');
  content.className = 'callout-content';
  const body = document.createElement('p');
  body.textContent = 'Body text';
  content.append(body);
  callout.append(title, content);
  container.append(callout);
  document.body.appendChild(container);

  processCommentCallouts(container);

  const triggerBtn = container.querySelector('button.comment-callout-trigger');
  assert.ok(triggerBtn);
  assert.ok(triggerBtn.textContent?.includes('💡'));

  triggerBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const popover = document.body.querySelector('.comment-callout-popover');
  assert.ok(popover);
  assert.ok(popover.querySelector('.comment-callout-popover-body')?.textContent?.includes('Body text'));

  triggerBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  document.body.removeChild(container);
});

void test('transformCommentHtml protects code blocks from comment transformation', () => {
  const html = '<p>Code sample: <code>::cmt[😂 comment]</code> and text ::cmt[😂 real comment]</p>';
  const transformed = transformCommentHtml(html);

  assert.ok(transformed.includes('<code>::cmt[😂 comment]</code>'), 'Code block content should be untouched');
  assert.ok(transformed.includes('real comment'), 'Text comment should be transformed');
});

void test('processCommentCallouts handles inline comment with nested brackets', () => {
  const container = document.createElement('div');
  const blockquote = document.createElement('blockquote');
  const quote = document.createElement('p');
  quote.textContent = '"The important thing is not to stop questioning. Curiosity has its own reason for existence."';
  const comment = document.createElement('p');
  comment.textContent = '– Albert Einstein::cmt[Who knows. This is for your information, I am not sure if Einstein[^1] had said that or not.]';
  blockquote.append(quote, comment);
  container.append(blockquote);
  document.body.appendChild(container);

  processCommentCallouts(container);

  const triggerBtn = container.querySelector('button.comment-callout-trigger');
  assert.ok(triggerBtn, 'Trigger button should exist');

  triggerBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const popover = document.body.querySelector('.comment-callout-popover');
  assert.ok(popover, 'Popover should exist');
  assert.ok(
    popover?.querySelector('.comment-callout-popover-body')?.textContent?.includes('Einstein[^1] had said that or not.'),
    'Comment content should contain full text including nested brackets'
  );

  triggerBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  document.body.removeChild(container);
});

void test('processCommentCallouts handles all syntax variants ::cmt [...], ::cmt{...}, and ::cmt {...}', () => {
  const container = document.createElement('div');
  for (const text of [
    'Space before bracket: ::cmt [Comment 1]',
    'Braces without space: ::cmt{Comment 2}',
    'Braces with space: ::cmt {Comment 3}',
  ]) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    container.append(paragraph);
  }
  document.body.appendChild(container);

  processCommentCallouts(container);

  const triggerBtns = container.querySelectorAll('button.comment-callout-trigger');
  assert.equal(triggerBtns.length, 3, 'Should create 3 comment triggers for all syntax variants');

  const printBodies = container.querySelectorAll('.comment-callout-print-body');
  assert.ok(printBodies[0]?.textContent?.includes('Comment 1'));
  assert.ok(printBodies[1]?.textContent?.includes('Comment 2'));
  assert.ok(printBodies[2]?.textContent?.includes('Comment 3'));

  document.body.removeChild(container);
});

void test('processCommentCallouts handles inline comment with formatted HTML elements', () => {
  const container = document.createElement('div');
  const callout = document.createElement('div');
  callout.className = 'callout';
  callout.dataset.callout = 'quote';
  const content = document.createElement('div');
  content.className = 'callout-content';
  const paragraph = document.createElement('p');
  const emphasis = document.createElement('b');
  emphasis.textContent = 'example';
  paragraph.append('::cmt[💡 ', emphasis, '. This is a comment.]');
  content.append(paragraph);
  callout.append(content);
  container.append(callout);
  document.body.appendChild(container);

  processCommentCallouts(container);

  const triggerBtn = container.querySelector('button.comment-callout-trigger');
  assert.ok(triggerBtn, 'Trigger button should exist in callout content');

  const printBody = container.querySelector('.comment-callout-print-body');
  assert.ok(printBody, 'Print body should exist');
  assert.ok(printBody?.querySelector('b'), 'Formatted <b> tag should be preserved in print body');

  triggerBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const popover = document.body.querySelector('.comment-callout-popover');
  assert.ok(popover, 'Popover should exist');

  triggerBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  document.body.removeChild(container);
});
