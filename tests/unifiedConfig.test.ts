import { setupDomPolyfills } from "./setupDom";
setupDomPolyfills();
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

// Mock 'obsidian' and '.svelte' modules for Node runtime
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id.endsWith('.svelte')) {
    return {};
  }
  if (id === 'obsidian') {
    return {
      Modal: class {},
      Plugin: class {},
      PluginSettingTab: class {},
      Setting: class {},
      MarkdownView: class {},
      MarkdownRenderChild: class {
        el: any;
        containerEl: any;
        constructor(el: any) {
          this.el = el;
          this.containerEl = el;
        }
      },
      parseYaml: (str: string) => {
        try {
          return JSON.parse(str);
        } catch {
          return {};
        }
      },
    };
  }
  return originalRequire.apply(this, arguments as any);
};

// Setup JSDOM globals
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'https://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.DocumentFragment = dom.window.DocumentFragment;
global.Image = dom.window.Image;
global.getComputedStyle = dom.window.getComputedStyle;
global.XMLSerializer = dom.window.XMLSerializer;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};

const mockApp = {
  workspace: {
    onLayoutReady: (cb: () => void) => cb(),
    on: () => {},
    getActiveFile: () => null,
  },
  settings: {
    colors: ['#3b82f6', '#ef4444', '#10b981'],
    themeable: false,
  },
};

const mockPlugin: any = {
  settings: {
    colors: ['#3b82f6', '#ef4444', '#10b981'],
    themeable: false,
  },
  app: mockApp,
};

test('unified chart DSL: line and bar charts support markLines', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Line chart with markLine
  const lineYaml = {
    type: 'line',
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ title: 'Revenue', data: [100, 200, 150] }],
    markLines: [
      {
        y: 120,
        label: 'Break-even',
        color: '#f59e0b',
        style: 'dashed',
      },
      {
        x: 'Feb',
        label: 'Milestone',
        color: '#10b981',
      },
    ],
  };

  const lineContainer = document.createElement('div');
  const linePrep = await renderer.datasetPrep(lineYaml, lineContainer);
  assert.notEqual(linePrep.plotOptions, null);

  const lineEl = await renderer.renderRaw(linePrep, lineContainer);
  assert.ok(lineEl instanceof HTMLElement || lineEl instanceof SVGElement);

  const lineTexts = Array.from(lineContainer.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(lineTexts.some((t) => t.includes('Break-even')), 'Line chart should render markLine label Break-even');
  assert.ok(lineTexts.some((t) => t.includes('Milestone')), 'Line chart should render markLine label Milestone');

  // 2. Bar chart with markLine
  const barYaml = {
    type: 'bar',
    labels: ['Q1', 'Q2', 'Q3'],
    series: [{ title: 'Sales', data: [40, 80, 60] }],
    markLine: {
      y: 50,
      label: 'Target',
      color: '#ef4444',
      style: 'dotted',
    },
  };

  const barContainer = document.createElement('div');
  const barPrep = await renderer.datasetPrep(barYaml, barContainer);
  const barEl = await renderer.renderRaw(barPrep, barContainer);
  assert.ok(barEl instanceof HTMLElement || barEl instanceof SVGElement);

  const barTexts = Array.from(barContainer.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(barTexts.some((t) => t.includes('Target')), 'Bar chart should render markLine label Target');
});

test('unified chart DSL: line and bar charts support log scales across DSL options', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Line chart with yLog: true
  const lineYaml = {
    type: 'line',
    yLog: true,
    labels: [1, 2, 3],
    series: [{ title: 'Growth', data: [10, 100, 1000] }],
  };

  const lineContainer = document.createElement('div');
  const linePrep = await renderer.datasetPrep(lineYaml, lineContainer);
  assert.equal((linePrep.plotOptions?.y as any)?.type, 'log', 'Line chart y-scale should be log');

  // 2. Horizontal bar chart with xScale: 'log'
  const barYaml = {
    type: 'bar',
    indexAxis: 'y',
    xScale: 'log',
    labels: ['A', 'B'],
    series: [{ title: 'Metric', data: [100, 10000] }],
  };

  const barContainer = document.createElement('div');
  const barPrep = await renderer.datasetPrep(barYaml, barContainer);
  assert.equal((barPrep.plotOptions?.x as any)?.type, 'log', 'Horizontal bar x-scale should be log');

  // 3. Nested scales.y.type: 'logarithmic'
  const nestedYaml = {
    type: 'line',
    scales: {
      y: { type: 'logarithmic' },
    },
    labels: ['X', 'Y'],
    series: [{ title: 'Val', data: [5, 500] }],
  };
  const nestedContainer = document.createElement('div');
  const nestedPrep = await renderer.datasetPrep(nestedYaml, nestedContainer);
  assert.equal((nestedPrep.plotOptions?.y as any)?.type, 'log');
});

test('unified chart DSL: unified fill and fillOpacity support for line and bar charts', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // Line chart with custom area fill and opacity
  const lineYaml = {
    type: 'line',
    fill: true,
    transparency: 0.4,
    labels: ['Jan', 'Feb'],
    series: [{ title: 'Trend', data: [10, 20] }],
  };

  const lineContainer = document.createElement('div');
  const linePrep = await renderer.datasetPrep(lineYaml, lineContainer);
  assert.ok(linePrep.plotOptions?.marks);

  const renderedLine = await renderer.renderRaw(linePrep, lineContainer);
  assert.ok(renderedLine instanceof HTMLElement || renderedLine instanceof SVGElement);

  // Area path should exist
  const paths = lineContainer.querySelectorAll('path');
  assert.ok(paths.length >= 2, 'Should render both area fill and line stroke paths');
});

test('unified chart DSL: dataLabels and showLabels support on bar and line charts', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // Bar chart with showLabels: true
  const barYaml = {
    type: 'bar',
    labels: ['Alpha', 'Beta'],
    series: [{ title: 'Count', data: [42, 99] }],
    showLabels: true,
  };

  const barContainer = document.createElement('div');
  const barPrep = await renderer.datasetPrep(barYaml, barContainer);
  await renderer.renderRaw(barPrep, barContainer);

  const texts = Array.from(barContainer.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(texts.includes('42'), 'Should render data label 42 on bar chart');
  assert.ok(texts.includes('99'), 'Should render data label 99 on bar chart');
});

test('unified chart DSL: pie, radar, and sankey support title, subtitle, and caption', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Pie chart with title, subtitle, caption
  const pieYaml = {
    type: 'pie',
    title: 'Market Share',
    subtitle: 'Q3 Overview',
    caption: 'Source: Internal Analytics',
    labels: ['A', 'B'],
    series: [{ data: [60, 40] }],
  };
  const pieContainer = document.createElement('div');
  const piePrep = await renderer.datasetPrep(pieYaml, pieContainer);
  await renderer.renderRaw(piePrep, pieContainer);

  assert.equal(piePrep.customElement?.querySelector('h2')?.textContent, 'Market Share');
  assert.equal(piePrep.customElement?.querySelector('h3')?.textContent, 'Q3 Overview');
  assert.ok(piePrep.customElement?.textContent?.includes('Source: Internal Analytics'));

  // 2. Radar chart with title and caption
  const radarYaml = {
    type: 'radar',
    title: 'Skill Matrix',
    caption: 'Evaluated by manager',
    labels: ['Coding', 'Design'],
    series: [{ title: 'Engineer', data: [90, 75] }],
  };
  const radarContainer = document.createElement('div');
  const radarPrep = await renderer.datasetPrep(radarYaml, radarContainer);
  await renderer.renderRaw(radarPrep, radarContainer);

  assert.equal(radarPrep.customElement?.querySelector('h2')?.textContent, 'Skill Matrix');
  assert.ok(radarPrep.customElement?.textContent?.includes('Evaluated by manager'));

  // 3. Sankey chart with title and subtitle
  const sankeyYaml = {
    type: 'sankey',
    title: 'Energy Flow',
    subtitle: '2026 Projections',
    series: [{ data: [{ from: 'Coal', to: 'Grid', flow: 50 }] }],
  };
  const sankeyContainer = document.createElement('div');
  const sankeyPrep = await renderer.datasetPrep(sankeyYaml, sankeyContainer);
  await renderer.renderRaw(sankeyPrep, sankeyContainer);

  assert.equal(sankeyPrep.customElement?.querySelector('h2')?.textContent, 'Energy Flow');
  assert.equal(sankeyPrep.customElement?.querySelector('h3')?.textContent, '2026 Projections');
});

test('auto-adaptive ticks adjust based on chart width and support custom ticks override', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6', '#10b981'], themeable: false },
    app: {
      workspace: { onLayoutReady: (cb: () => void) => cb(), on: () => {} },
      vault: { getAbstractFileByPath: () => null, read: async () => '' },
      metadataCache: { getFileCache: () => null, on: () => {} },
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  // 1. Narrow width line chart (300px)
  const narrowYaml = {
    type: 'line',
    width: '300px',
    labels: Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`),
    series: [{ title: 'Metrics', data: Array.from({ length: 30 }, (_, i) => i * 2) }],
  };
  const narrowPrep = await renderer.datasetPrep(narrowYaml, container);
  assert.ok(Array.isArray(narrowPrep.plotOptions?.x?.ticks));
  assert.ok(narrowPrep.plotOptions!.x!.ticks!.length <= 6, 'Ticks should adaptively downsample on narrow width');

  // 2. Wide width line chart (800px)
  const wideYaml = {
    type: 'line',
    width: '800px',
    labels: Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`),
    series: [{ title: 'Metrics', data: Array.from({ length: 30 }, (_, i) => i * 2) }],
  };
  const widePrep = await renderer.datasetPrep(wideYaml, container);
  assert.ok(Array.isArray(widePrep.plotOptions?.x?.ticks));
  assert.ok(widePrep.plotOptions!.x!.ticks!.length >= narrowPrep.plotOptions!.x!.ticks!.length);

  // 3. User explicit ticks override
  const overrideYaml = {
    type: 'line',
    ticks: 4,
    labels: Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`),
    series: [{ title: 'Metrics', data: Array.from({ length: 30 }, (_, i) => i * 2) }],
  };
  const overridePrep = await renderer.datasetPrep(overrideYaml, container);
  assert.equal(overridePrep.plotOptions?.x?.ticks, 4, 'Explicit ticks option should be preserved');

  // 4. Horizontal bar chart preserves numeric tick density on x-scale (does not downsample string labels into x)
  const horizontalBarYaml = {
    type: 'bar',
    indexAxis: 'y',
    width: '640px',
    labels: Array.from({ length: 25 }, (_, i) => `Category ${i + 1}`),
    series: [{ title: 'Quantity', data: Array.from({ length: 25 }, (_, i) => (i + 1) * 10) }],
  };
  const horizontalPrep = await renderer.datasetPrep(horizontalBarYaml, container);
  assert.equal(typeof horizontalPrep.plotOptions?.x?.ticks, 'number', 'Horizontal bar x-axis should use numeric tick count, not downsampled category strings');
});

test('horizontal bar charts with unordered string labels preserve label order on y axis', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  const horizontalYaml = {
    type: 'bar',
    indexAxis: 'y',
    labels: ['Delta', 'Beta', 'Alpha', 'Gamma'],
    series: [{ title: 'Score', data: [10, 20, 30, 40] }],
  };

  const container = document.createElement('div');
  const prep = await renderer.datasetPrep(horizontalYaml, container);
  assert.deepEqual(prep.plotOptions?.y?.domain, ['Delta', 'Beta', 'Alpha', 'Gamma']);

  await renderer.renderRaw(prep, container);
  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');

  const deltaIdx = texts.indexOf('Delta');
  const betaIdx = texts.indexOf('Beta');
  const alphaIdx = texts.indexOf('Alpha');
  const gammaIdx = texts.indexOf('Gamma');

  assert.ok(deltaIdx !== -1 && betaIdx !== -1 && alphaIdx !== -1 && gammaIdx !== -1);
  assert.ok(deltaIdx < betaIdx);
  assert.ok(betaIdx < alphaIdx);
  assert.ok(alphaIdx < gammaIdx);
});
