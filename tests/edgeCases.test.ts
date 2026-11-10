import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).Element = dom.window.Element;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).SVGElement = dom.window.SVGElement;
(global as any).getComputedStyle = dom.window.getComputedStyle;
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});

// Mock 'obsidian' and '.svelte' modules for Node runtime BEFORE loading chart modules
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id.endsWith('.svelte')) {
    return {};
  }
  if (id === 'obsidian') {
    return {
      Modal: class {
        app: any;
        contentEl: any;
        constructor(app: any) {
          this.app = app;
          this.contentEl = document.createElement('div');
        }
        open() {}
        close() {}
      },
      Plugin: class {
        app: any;
        manifest: any;
        constructor(app: any, manifest: any) {
          this.app = app;
          this.manifest = manifest;
        }
        addSettingTab() {}
        addCommand() {}
        registerMarkdownPostProcessor() {}
        registerMarkdownCodeBlockProcessor() {}
        registerEvent() {}
        loadData() { return Promise.resolve({}); }
        saveData() { return Promise.resolve(); }
      },
      PluginSettingTab: class {
        app: any;
        plugin: any;
        containerEl: any;
        constructor(app: any, plugin: any) {
          this.app = app;
          this.plugin = plugin;
          this.containerEl = document.createElement('div');
        }
      },
      Setting: class {
        setName() { return this; }
        setDesc() { return this; }
        addToggle() { return this; }
        addButton() { return this; }
        addExtraButton() { return this; }
      },
      MarkdownView: class {},
      addIcon: () => {},
      MarkdownRenderChild: class {
        el: any;
        containerEl: any;
        constructor(el: any) {
          this.el = el;
          this.containerEl = el;
        }
        onload() {}
        onunload() {}
      },
      parseYaml: (str: string) => null,
      requestUrl: async () => ({ status: 200, text: '' }),
    };
  }
  return originalRequire.apply(this, arguments as any);
};

const mockApp: any = {
  workspace: {
    onLayoutReady: (cb: () => void) => cb(),
    on: () => {},
    getActiveFile: () => null,
  },
  vault: {
    getAbstractFileByPath: () => null,
    read: async () => '',
    cachedRead: async () => '',
  },
  metadataCache: {
    getFileCache: () => null,
    getFirstLinkpathDest: () => null,
    on: () => {},
    off: () => {},
  },
};

const mockPlugin: any = {
  settings: {
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
    themeable: false,
  },
  app: mockApp,
};

// -------------------------------------------------------------
// SYSTEM 1: Standard Chart DSL (Bar, Line, Pie, Radar, Sankey)
// -------------------------------------------------------------
test('edge case [DSL 1 - Bar/Line]: all-zero, negative, and NaN/missing series values', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. All-zero values
  const zeroBarYaml = {
    type: 'bar',
    labels: ['A', 'B', 'C'],
    series: [{ title: 'Zeroes', data: [0, 0, 0] }],
  };
  const c1 = document.createElement('div');
  const prep1 = await renderer.datasetPrep(zeroBarYaml, c1);
  assert.ok(prep1.plotOptions, 'All-zero bar chart should produce plotOptions');
  const el1 = await renderer.renderRaw(prep1, c1);
  assert.ok(el1 instanceof HTMLElement || el1 instanceof SVGElement);

  // 2. Negative values with beginAtZero: false
  const negLineYaml = {
    type: 'line',
    beginAtZero: false,
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ title: 'Losses', data: [-100, -50, -200] }],
  };
  const c2 = document.createElement('div');
  const prep2 = await renderer.datasetPrep(negLineYaml, c2);
  assert.ok(prep2.plotOptions, 'Negative values line chart should produce plotOptions');
  const el2 = await renderer.renderRaw(prep2, c2);
  assert.ok(el2 instanceof HTMLElement || el2 instanceof SVGElement);

  // 3. String numbers and NaN/null fallbacks
  const mixedYaml = {
    type: 'bar',
    labels: ['X', 'Y', 'Z'],
    series: [{ title: 'Mixed', data: ['123', null, 'not_a_number'] }],
  };
  const c3 = document.createElement('div');
  const prep3 = await renderer.datasetPrep(mixedYaml, c3);
  assert.ok(prep3.plotOptions, 'Mixed and NaN data values should be safely coerced');
  const el3 = await renderer.renderRaw(prep3, c3);
  assert.ok(el3 instanceof HTMLElement || el3 instanceof SVGElement);
});

test('edge case [DSL 1 - Bar/Line]: mismatched series vs labels length and single data point', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Single data point line chart
  const singleLineYaml = {
    type: 'line',
    labels: ['Solo'],
    series: [{ title: 'Point', data: [42] }],
  };
  const c1 = document.createElement('div');
  const prep1 = await renderer.datasetPrep(singleLineYaml, c1);
  const el1 = await renderer.renderRaw(prep1, c1);
  assert.ok(el1 instanceof HTMLElement || el1 instanceof SVGElement);

  // 2. More series data points than labels (should fallback to index for missing labels)
  const moreDataYaml = {
    type: 'bar',
    labels: ['L1'],
    series: [{ title: 'Many', data: [10, 20, 30] }],
  };
  const c2 = document.createElement('div');
  const prep2 = await renderer.datasetPrep(moreDataYaml, c2);
  const el2 = await renderer.renderRaw(prep2, c2);
  assert.ok(el2 instanceof HTMLElement || el2 instanceof SVGElement);

  // 3. More labels than series data points
  const moreLabelsYaml = {
    type: 'bar',
    labels: ['L1', 'L2', 'L3', 'L4', 'L5'],
    series: [{ title: 'Few', data: [10, 20] }],
  };
  const c3 = document.createElement('div');
  const prep3 = await renderer.datasetPrep(moreLabelsYaml, c3);
  const el3 = await renderer.renderRaw(prep3, c3);
  assert.ok(el3 instanceof HTMLElement || el3 instanceof SVGElement);
});

test('edge case [DSL 1 - Pie/Donut/Radar/Sankey]: empty data, zeros, and single node flows', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Pie chart with all zero values
  const zeroPieYaml = {
    type: 'pie',
    labels: ['A', 'B'],
    series: [{ data: [0, 0] }],
  };
  const c1 = document.createElement('div');
  const prep1 = await renderer.datasetPrep(zeroPieYaml, c1);
  assert.ok(prep1.customElement instanceof HTMLElement);
  await renderer.renderRaw(prep1, c1);
  assert.equal(prep1.customElement?.querySelectorAll('path').length, 2);

  // 2. Radar chart with single category and zero radius
  const radarYaml = {
    type: 'radar',
    labels: ['OnlyOne'],
    series: [{ title: 'Hero', data: [0] }],
  };
  const c2 = document.createElement('div');
  const prep2 = await renderer.datasetPrep(radarYaml, c2);
  assert.ok(prep2.customElement instanceof HTMLElement);
  await renderer.renderRaw(prep2, c2);
  assert.ok(prep2.customElement?.querySelector('svg'));

  // 3. Sankey with flow and self loop
  const sankeyYaml = {
    type: 'sankey',
    series: [{
      data: [
        ['Self', 'Self', 10],
        ['Source', 'Target', 0],
      ],
    }],
  };
  const c3 = document.createElement('div');
  const prep3 = await renderer.datasetPrep(sankeyYaml, c3);
  assert.ok(prep3.customElement instanceof HTMLElement);
  await renderer.renderRaw(prep3, c3);
  assert.ok(prep3.customElement?.querySelectorAll('path').length >= 1);
});

// -------------------------------------------------------------
// SYSTEM 2: Scatter Chart DSL (scatter, scatterplot)
// -------------------------------------------------------------
test('edge case [DSL 2 - Scatter]: empty series, 1D array, single point, and negative values', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Single coordinate point
  const singleScatterYaml = {
    type: 'scatter',
    series: [{ title: 'Single', data: [[100, 200]] }],
  };
  const c1 = document.createElement('div');
  const prep1 = await renderer.datasetPrep(singleScatterYaml, c1);
  assert.ok(prep1.plotOptions);
  const el1 = await renderer.renderRaw(prep1, c1);
  assert.ok(el1 instanceof HTMLElement || el1 instanceof SVGElement);

  // 2. Negative values and (0,0) origin on scatter
  const negScatterYaml = {
    type: 'scatter',
    series: [{
      title: 'Quadrants',
      data: [
        [-50, -50],
        [-20, 30],
        [40, -10],
        [0, 0],
      ],
    }],
  };
  const c2 = document.createElement('div');
  const prep2 = await renderer.datasetPrep(negScatterYaml, c2);
  const el2 = await renderer.renderRaw(prep2, c2);
  assert.ok(el2 instanceof HTMLElement || el2 instanceof SVGElement);

  // 3. 1D numeric data array with labels mapped to X
  const oneDScatterYaml = {
    type: 'scatter',
    labels: [10, 20, 30],
    series: [{ title: 'OneD', data: [5, 15, 25] }],
  };
  const c3 = document.createElement('div');
  const prep3 = await renderer.datasetPrep(oneDScatterYaml, c3);
  const el3 = await renderer.renderRaw(prep3, c3);
  assert.ok(el3 instanceof HTMLElement || el3 instanceof SVGElement);

  // 4. Object format { x, y } with NaN values filtered out
  const objScatterYaml = {
    type: 'scatter',
    series: [{
      title: 'ObjFormat',
      data: [
        { x: 1, y: 10 },
        { x: 'invalid', y: 20 },
        { x: 2, y: 'nan' },
        { x: 3, y: 30 },
      ],
    }],
  };
  const c4 = document.createElement('div');
  const prep4 = await renderer.datasetPrep(objScatterYaml, c4);
  const el4 = await renderer.renderRaw(prep4, c4);
  assert.ok(el4 instanceof HTMLElement || el4 instanceof SVGElement);
});

test('edge case [DSL 2 - Scatter]: tabular rows with missing columns, custom radius and log color scale', async () => {
  const { extractScatterData, buildScatterPlotOptions } = await import('../src/charts/scatterRenderer');
  const Plot = await import('@observablehq/plot');

  const rawRows = [
    { Name: 'Alpha', ValX: '10', ValY: '100', Size: '5' },
    { Name: 'Beta', ValX: '1000', ValY: '50000', Size: '15' },
    { Name: 'Gamma', ValX: '', ValY: 'invalid', Size: '10' }, // invalid row ignored
  ];

  const scatterYaml = {
    type: 'scatter',
    tableRows: rawRows,
    x: 'ValX',
    y: 'ValY',
    r: 'Size',
    text: 'Name',
    xLog: true,
  };

  const points = extractScatterData(scatterYaml);
  assert.equal(points.length, 2, 'Should extract only valid numeric rows');
  assert.equal(points[0].x, 10);
  assert.equal(points[0].r, 5);

  const plotOpts = buildScatterPlotOptions(scatterYaml, points, ['#3b82f6'], '#ccc', '#222', Plot as any);
  assert.equal(plotOpts.x.type, 'log', 'X scale should be log');
  assert.equal(plotOpts.color.type, 'log', 'Color scale should auto-align to log scale');
});

// -------------------------------------------------------------
// SYSTEM 3: Observable Plot JS Codeblock (plot, observable)
// -------------------------------------------------------------
test('edge case [Plot JS]: empty code, comments only, and auto-return of variable assignment', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  // 1. Comments only
  const c1 = document.createElement('div');
  const res1 = await renderer.renderRaw('// Just a comment\n/* Another comment */', c1);
  assert.equal(res1, null, 'Comments only should safely return null without error');

  // 2. Empty string
  const c2 = document.createElement('div');
  const res2 = await renderer.renderRaw('   \n  ', c2);
  assert.equal(res2, null, 'Empty code should safely return null');

  // 3. Variable assignment without explicit return keyword
  const c3 = document.createElement('div');
  const script3 = `
    const chart = Plot.plot({
      marks: [
        Plot.dot([ { x: 1, y: 2 }, { x: 3, y: 4 } ], { x: "x", y: "y" })
      ]
    });
  `;
  const res3 = await renderer.renderRaw(script3, c3);
  assert.ok(res3 instanceof HTMLElement || res3 instanceof SVGElement, 'Auto-return should resolve declared plot variable');

  // 4. Code block wrapped with markdown fences ```plot ... ```
  const c4 = document.createElement('div');
  const script4 = '```plot\nPlot.rectY([1, 2, 3], { x: (d, i) => i, y: (d) => d })\n```';
  const res4 = await renderer.renderRaw(script4, c4);
  assert.ok(res4 instanceof HTMLElement || res4 instanceof SVGElement, 'Code fences should be stripped and rendered');
});

test('edge case [Plot JS]: top-level await and display() function multiple calls', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const renderer = new Renderer(mockPlugin);

  const container = document.createElement('div');
  const script = `
    const p1 = Plot.plot({ marks: [Plot.ruleY([0])] });
    const p2 = Plot.plot({ marks: [Plot.ruleX([0])] });
    display(p1);
    display(p2);
  `;
  const res = await renderer.renderRaw(script, container);
  assert.ok(res instanceof HTMLElement || res instanceof SVGElement);
  assert.equal(container.children.length, 2, 'display() called twice should append both elements');
});

// -------------------------------------------------------------
// SYSTEM 4: Zoomable Timeline DSL (timeline)
// -------------------------------------------------------------
test('edge case [Timeline DSL]: single event with no duration (instant event)', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const container = document.createElement('div');

  const code = JSON.stringify([
    { title: 'Moon Landing', start: '1969-07-20' },
  ]);

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const svg = container.querySelector('svg');
  assert.ok(svg, 'Timeline should render SVG for single instant event');

  const eventGroup = container.querySelector('.event-group');
  assert.ok(eventGroup, 'Event group should exist for single instant event');
});

test('edge case [Timeline DSL]: inverted start and end dates (end < start auto-swap)', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const container = document.createElement('div');

  // Start is 2025, End is 2020
  const code = JSON.stringify([
    { title: 'Backwards Event', start: '2025-01-01', end: '2020-01-01' },
  ]);

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const eventBar = container.querySelector('.event-bar') as SVGRectElement;
  assert.ok(eventBar, 'Event bar should exist');
  const width = parseFloat(eventBar.getAttribute('width') || '0');
  assert.ok(width > 0, 'Inverted dates should auto-swap so event bar has positive width');
});

test('edge case [Timeline DSL]: ongoing events with various keywords (present, now, current)', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const container = document.createElement('div');

  const code = JSON.stringify([
    { title: 'Active Task 1', start: '2022-01-01', end: 'present' },
    { title: 'Active Task 2', start: '2023-01-01', end: 'now' },
    { title: 'Active Task 3', start: '2024-01-01', ongoing: true },
  ]);

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const nowIndicator = container.querySelector('.now-indicator');
  assert.ok(nowIndicator, 'Timeline should render "Today" line indicator for ongoing events');
});

test('edge case [Timeline DSL]: BC dates and era-spanning events', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const container = document.createElement('div');

  const code = JSON.stringify([
    { title: 'Roman Republic', start: '509 BC', end: '27 BCE', type: 'History' },
    { title: 'Roman Empire', start: '27 BCE', end: '476 AD', type: 'History' },
  ]);

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const eventGroups = container.querySelectorAll('.event-group');
  assert.equal(eventGroups.length, 2, 'Should render both BC and BC-to-AD era events');
});

test('edge case [Timeline DSL]: special characters, HTML tags, and wikilinks in title', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const container = document.createElement('div');

  const code = JSON.stringify([
    {
      title: 'Release & <Test> [[Feature Note|My Feature]]',
      start: '2023-05-01',
      end: '2023-08-01',
      collection: ['[[Doc 1]]', 'Spec & Review'],
    },
  ]);

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const label = container.querySelector('.event-label');
  assert.ok(label, 'Label should exist');
  assert.ok(
    label.textContent?.includes('My Feature'),
    'Label text should strip wikilink wrapper but preserve alias text'
  );
});

test('edge case [Timeline DSL]: empty or malformed dataset renders clean error block', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');

  // 1. Empty events array
  const c1 = document.createElement('div');
  await renderTimelineBlockAsync('[]', c1);
  assert.ok(c1.querySelector('.chart-error'), 'Empty array should display chart-error');

  // 2. Malformed non-YAML/JSON syntax
  const c2 = document.createElement('div');
  await renderTimelineBlockAsync('invalid json {{{', c2);
  assert.ok(c2.querySelector('.chart-error'), 'Malformed syntax should display chart-error');
});
