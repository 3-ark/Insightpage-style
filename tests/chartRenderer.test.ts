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
      MarkdownRenderChild: class {
        el: any;
        containerEl: any;
        constructor(el: any) {
          this.el = el;
          this.containerEl = el;
        }
      },
      parseYaml: (str: string) => {
        const result: any = {};
        const lines = str.split('\n');
        let currentSeries: any = null;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          if (trimmed.startsWith('type:')) {
            result.type = trimmed.replace('type:', '').trim();
          } else if (trimmed.startsWith('bestFit:')) {
            result.bestFit = trimmed.replace('bestFit:', '').trim() === 'true';
          } else if (trimmed.startsWith('bestFitTitle:')) {
            result.bestFitTitle = trimmed.replace('bestFitTitle:', '').trim();
          } else if (trimmed.startsWith('labels:')) {
            const raw = trimmed.replace('labels:', '').trim();
            result.labels = JSON.parse(raw);
          } else if (trimmed.startsWith('series:')) {
            result.series = [];
          } else if (trimmed.startsWith('- title:')) {
            currentSeries = { title: trimmed.replace('- title:', '').trim(), data: [] };
            result.series.push(currentSeries);
          } else if (trimmed.startsWith('data:')) {
            const raw = trimmed.replace('data:', '').trim();
            if (currentSeries) {
              try {
                currentSeries.data = JSON.parse(raw);
              } catch {
                currentSeries.data = raw;
              }
            } else {
              try {
                result.data = JSON.parse(raw);
              } catch {
                result.data = raw;
              }
            }
          }
        }
        return result;
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

test('donut chart (type: donut) renders as doughnut SVG chart and not bar chart', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444', '#10b981'],
      themeable: false,
    },
    app: mockApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const donutYaml = {
    type: 'donut',
    labels: ['Apples', 'Oranges', 'Bananas'],
    series: [
      {
        title: 'Sales',
        data: [10, 20, 30],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(donutYaml, container);
  assert.equal(prepared.plotOptions, null, 'Donut chart should use customElement and not plotOptions');
  assert.ok(prepared.customElement instanceof HTMLElement);

  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement);

  const svg = container.querySelector('svg');
  assert.notEqual(svg, null, 'SVG element should be rendered');

  const paths = container.querySelectorAll('path');
  assert.equal(paths.length, 3, 'Should render 3 arc paths for 3 labels');

  const firstPathD = paths[0].getAttribute('d') || '';
  assert.ok(firstPathD.includes('A'), 'Path d attribute should contain arc commands');
});

test('pie/donut, radar, and sankey paths create and display Plot-style tooltip on mouseenter', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444', '#10b981'],
      themeable: false,
    },
    app: mockApp,
  };

  const renderer = new Renderer(mockPlugin);

  // 1. Test Donut tooltip
  const donutContainer = document.createElement('div');
  const donutYaml = {
    type: 'donut',
    labels: ['Apples', 'Bananas'],
    series: [{ title: 'Fruit', data: [15, 25] }],
  };
  const donutPrep = await renderer.datasetPrep(donutYaml, donutContainer);
  await renderer.renderRaw(donutPrep, donutContainer);

  const path = donutContainer.querySelector('path') as SVGPathElement;
  assert.notEqual(path, null);

  const enterEvent = new dom.window.MouseEvent('mouseenter', { clientX: 50, clientY: 50 });
  path.dispatchEvent(enterEvent);

  const tooltip = donutContainer.querySelector('.chart-plot-tooltip') as HTMLElement;
  assert.notEqual(tooltip, null, 'Tooltip div should be created');
  assert.equal(tooltip.style.display, 'block');
  assert.ok(tooltip.textContent?.includes('Apples: 15'));

  const leaveEvent = new dom.window.MouseEvent('mouseleave');
  path.dispatchEvent(leaveEvent);
  assert.equal(tooltip.style.display, 'none');

  // 2. Test Radar tooltip
  const radarContainer = document.createElement('div');
  const radarYaml = {
    type: 'radar',
    labels: ['Speed', 'Power', 'Agility'],
    series: [{ title: 'Stats', data: [80, 90, 70] }],
  };
  const radarPrep = await renderer.datasetPrep(radarYaml, radarContainer);
  await renderer.renderRaw(radarPrep, radarContainer);

  const radarPath = radarContainer.querySelector('path') as SVGPathElement;
  assert.notEqual(radarPath, null);

  radarPath.dispatchEvent(enterEvent);
  const radarTooltip = radarContainer.querySelector('.chart-plot-tooltip') as HTMLElement;
  assert.notEqual(radarTooltip, null);
  assert.ok(radarTooltip.textContent?.includes('Stats'));
  assert.ok(radarTooltip.textContent?.includes('Speed: 80'));

  // 3. Test Sankey tooltip
  const sankeyContainer = document.createElement('div');
  const sankeyYaml = {
    type: 'sankey',
    series: [{ data: [{ from: 'A', to: 'B', flow: 100 }] }],
  };
  const sankeyPrep = await renderer.datasetPrep(sankeyYaml, sankeyContainer);
  await renderer.renderRaw(sankeyPrep, sankeyContainer);

  const flowPath = sankeyContainer.querySelector('path') as SVGPathElement;
  assert.notEqual(flowPath, null);

  flowPath.dispatchEvent(enterEvent);
  const sankeyTooltip = sankeyContainer.querySelector('.chart-plot-tooltip') as HTMLElement;
  assert.notEqual(sankeyTooltip, null);
  assert.ok(sankeyTooltip.textContent?.includes('A ➔ B'));
  assert.ok(sankeyTooltip.textContent?.includes('Flow: 100'));
});

test('line chart best fit handles string labels without NaN values', async () => {
  const PluginModule = await import('../src/main');
  const ChartPlugin = PluginModule.default;

  const plugin = new ChartPlugin(mockApp as any, {} as any);
  plugin.renderer = {
    renderFromYaml: async (_data: any) => {},
  } as any;

  const container = document.createElement('div');
  const yamlString = `
type: line
bestFit: true
bestFitTitle: Best Fit
labels: ["Jan", "Feb", "Mar", "Apr"]
series:
  - title: Revenue
    data: [100, 200, 300, 400]
`;

  let processedData: any = null;
  plugin.renderer.renderFromYaml = async (data: any) => {
    processedData = data;
  };

  await plugin.postprocessor(yamlString, container, {} as any);

  assert.notEqual(processedData, null);
  assert.equal(processedData.series.length, 2, 'Should add best fit series');

  const bestFitSeries = processedData.series[1];
  assert.equal(bestFitSeries.title, 'Best Fit');
  assert.equal(bestFitSeries.data.length, 4);
  assert.ok(!bestFitSeries.data.some((v: any) => Number.isNaN(v)), 'Best fit data should not contain NaN');
  assert.deepEqual(bestFitSeries.data, [100, 200, 300, 400]);
});

test('generateTableData correctly parses markdown tables with block IDs (^table)', async () => {
  const { generateTableData } = await import('../src/chartFromTable');

  const tableMarkdown = `|       | Test1 | Test2 | Test3 |
| ----- | ----- | ----- | ----- |
| Data1 | 1     | 2     | 3.33  |
| Data2 | 3     | 2     | 1     |
| Data3 | 6.7   | 4     | 2     |
^table`;

  const rowsData = generateTableData(tableMarkdown, 'rows');
  assert.deepEqual(rowsData.labels, ['Test1', 'Test2', 'Test3']);
  assert.equal(rowsData.dataFields.length, 3);
  assert.equal(rowsData.dataFields[0].dataTitle, 'Data1');
  assert.deepEqual(rowsData.dataFields[0].data, ['1', '2', '3.33']);

  const colsData = generateTableData(tableMarkdown, 'columns');
  assert.deepEqual(colsData.labels, ['Data1', 'Data2', 'Data3']);
  assert.equal(colsData.dataFields.length, 3);
  assert.equal(colsData.dataFields[0].dataTitle, 'Test1');
  assert.deepEqual(colsData.dataFields[0].data, ['1', '3', '6.7']);

  // Table with kebab-case block ID inline on last row
  const tableWithKebab = `| Location | Density |
| --- | --- |
| Monaco | 19428 | ^table-countries`;
  const kebabData = generateTableData(tableWithKebab, 'rows');
  assert.deepEqual(kebabData.labels, ['Density']);
  assert.equal(kebabData.dataFields[0].dataTitle, 'Monaco');
  assert.deepEqual(kebabData.dataFields[0].data, ['19428']);
});

test('ChartRenderChild resolves table from block ID (^table) in fileCache.blocks', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const noteContent = `
|       | Test1 | Test2 | Test3 |
| ----- | ----- | ----- | ----- |
| Data1 | 1     | 2     | 3.33  |
| Data2 | 3     | 2     | 1     |
| Data3 | 6.7   | 4     | 2     |
^table
`;

  const mockFile = { path: 'test.md', basename: 'test' };
  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => mockFile,
    },
    vault: {
      getAbstractFileByPath: () => mockFile,
      cachedRead: async () => noteContent,
    },
    metadataCache: {
      getFileCache: () => ({
        blocks: {
          table: {
            id: 'table',
            position: {
              start: { offset: 0, line: 0, col: 0 },
              end: { offset: noteContent.length, line: 8, col: 0 },
            },
          },
        },
      }),
      getFirstLinkpathDest: () => null,
      on: () => {},
      off: () => {},
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
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    type: 'bar',
    id: 'table',
    layout: 'rows',
    width: '80%',
    beginAtZero: true,
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'test.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  assert.notEqual(renderedChild.chartEl, null, 'Chart element should be rendered from block ID table reference');
});

test('ChartRenderChild resolves table with kebab-case block ID (^table-countries) via fallback note text search', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const noteContent = `
| Country | Density |
| ------- | ------- |
| Monaco  | 19428   |
^table-countries
`;

  const mockFile = { path: 'countries.md', basename: 'countries' };
  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => mockFile,
    },
    vault: {
      getAbstractFileByPath: () => mockFile,
      cachedRead: async () => noteContent,
    },
    metadataCache: {
      getFileCache: () => null, // Test fallback when cache is null/missing
      getFirstLinkpathDest: () => null,
      on: () => {},
      off: () => {},
    },
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
  };

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    type: 'bar',
    id: 'table-countries',
    layout: 'rows',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'countries.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  assert.notEqual(renderedChild.chartEl, null, 'Chart should render from kebab-case block ID fallback search');
});

test('ChartRenderChild with id only invokes datasetPrep once during onload()', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const noteContent = `
| header1 | header2 |
| ------- | ------- |
| 10      | 20      |
^table
`;

  const mockFile = { path: 'test.md', basename: 'test' };
  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => mockFile,
    },
    vault: {
      getAbstractFileByPath: () => mockFile,
      cachedRead: async () => noteContent,
    },
    metadataCache: {
      getFileCache: () => ({
        blocks: {
          table: {
            id: 'table',
            position: {
              start: { offset: 0, line: 0, col: 0 },
              end: { offset: noteContent.length, line: 5, col: 0 },
            },
          },
        },
      }),
      getFirstLinkpathDest: () => null,
      on: () => {},
      off: () => {},
    },
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
  };

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  let datasetPrepCallCount = 0;
  const originalDatasetPrep = renderer.datasetPrep.bind(renderer);
  renderer.datasetPrep = async (...args) => {
    datasetPrepCallCount++;
    return originalDatasetPrep(...args);
  };

  const container = document.createElement('div');
  const chartData = {
    type: 'bar',
    id: 'table',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'test.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.equal(datasetPrepCallCount, 1, 'datasetPrep should be called exactly once for table-linked charts');
});

test('custom chart containers (pie, donut, radar, sankey) have position: relative explicitly set upon datasetPrep', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444', '#10b981'],
      themeable: false,
    },
    app: mockApp,
  };

  const renderer = new Renderer(mockPlugin);
  const el = document.createElement('div');

  const chartTypes = [
    { type: 'pie', labels: ['A'], series: [{ data: [10] }] },
    { type: 'donut', labels: ['A'], series: [{ data: [10] }] },
    { type: 'radar', labels: ['A'], series: [{ data: [10] }] },
    { type: 'sankey', series: [{ data: [{ from: 'A', to: 'B', flow: 5 }] }] },
  ];

  for (const chartConfig of chartTypes) {
    const prep = await renderer.datasetPrep(chartConfig, el);
    assert.ok(prep.customElement instanceof HTMLElement);
    assert.equal(
      prep.customElement.style.position,
      'relative',
      `Container for ${chartConfig.type} must have position: relative set on datasetPrep`
    );
  }
});

test('Radar and Polar Area charts correctly resolve category data using O(1) ptMap lookups', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
    app: mockApp,
  };

  const renderer = new Renderer(mockPlugin);

  // 1. Radar Chart with multiple series and categories
  const radarContainer = document.createElement('div');
  const radarYaml = {
    type: 'radar',
    labels: ['Attack', 'Defense', 'Speed', 'Stamina'],
    series: [
      { title: 'Hero A', data: [90, 70, 85, 60] },
      { title: 'Hero B', data: [65, 95, 50, 80] },
    ],
  };

  const radarPrep = await renderer.datasetPrep(radarYaml, radarContainer);
  await renderer.renderRaw(radarPrep, radarContainer);

  const radarSvg = radarContainer.querySelector('svg');
  assert.notEqual(radarSvg, null, 'Radar SVG should be rendered');

  const radarPaths = radarContainer.querySelectorAll('path');
  assert.equal(radarPaths.length, 2, 'Radar chart should render 2 polygon paths for 2 series');

  const radarDots = radarContainer.querySelectorAll('circle');
  // 4 categories * 2 series = 8 vertex dots (excluding grid ring circles)
  const vertexDots = Array.from(radarDots).filter((c) => c.getAttribute('r') === '4');
  assert.equal(vertexDots.length, 8, 'Should render 8 interactive vertex dots');

  // 2. Polar Area Chart with multiple categories
  const polarContainer = document.createElement('div');
  const polarYaml = {
    type: 'polararea',
    labels: ['North', 'East', 'South', 'West'],
    series: [{ title: 'Wind', data: [12, 25, 18, 30] }],
  };

  const polarPrep = await renderer.datasetPrep(polarYaml, polarContainer);
  await renderer.renderRaw(polarPrep, polarContainer);

  const polarSvg = polarContainer.querySelector('svg');
  assert.notEqual(polarSvg, null, 'Polar Area SVG should be rendered');

  const polarPaths = polarContainer.querySelectorAll('path');
  assert.equal(polarPaths.length, 4, 'Polar Area chart should render 4 arc paths for 4 categories');
});

test('Polar Area chart with a single top category renders distinct colors for second level categories and legend', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
      themeable: false,
    },
    app: {
      workspace: { onLayoutReady: (cb: () => void) => cb(), on: () => {} },
      vault: { getAbstractFileByPath: () => null, read: async () => '' },
      metadataCache: { getFileCache: () => null, on: () => {} },
    },
  };

  const renderer = new Renderer(mockPlugin);

  // 1. Single top category (1 series)
  const singleSeriesContainer = document.createElement('div');
  const singleSeriesYaml = {
    type: 'polarArea',
    labels: ['North', 'East', 'South', 'West'],
    series: [{ title: 'Wind', data: [12, 25, 18, 30] }],
  };

  const singlePrep = await renderer.datasetPrep(singleSeriesYaml, singleSeriesContainer);
  await renderer.renderRaw(singlePrep, singleSeriesContainer);

  const singlePaths = Array.from(singleSeriesContainer.querySelectorAll('path'));
  assert.equal(singlePaths.length, 4, 'Should have 4 sector paths');

  // Verify that each arc path has a distinct stroke/fill color corresponding to its category index
  const strokes = singlePaths.map((p) => p.getAttribute('stroke'));
  assert.deepEqual(strokes, ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'], 'Sectors should have distinct category colors');

  // Verify legend has 4 category items instead of single mono series title
  const legendSpans = Array.from(singleSeriesContainer.querySelectorAll('div > span:last-child')).map((s) => s.textContent);
  assert.deepEqual(legendSpans, ['North', 'East', 'South', 'West'], 'Legend should list category labels');

  // 2. Multiple top categories (multiple series) preserves series-based coloring
  const multiSeriesContainer = document.createElement('div');
  const multiSeriesYaml = {
    type: 'polararea',
    labels: ['North', 'East', 'South', 'West'],
    series: [
      { title: 'Series A', data: [10, 20, 15, 25] },
      { title: 'Series B', data: [15, 10, 20, 10] },
    ],
  };

  const multiPrep = await renderer.datasetPrep(multiSeriesYaml, multiSeriesContainer);
  await renderer.renderRaw(multiPrep, multiSeriesContainer);

  const multiPaths = Array.from(multiSeriesContainer.querySelectorAll('path'));
  assert.equal(multiPaths.length, 8, 'Should have 8 sector paths (4 per series)');

  // First series paths should all use Series A color (#3b82f6)
  const seriesAStrokes = multiPaths.slice(0, 4).map((p) => p.getAttribute('stroke'));
  assert.ok(seriesAStrokes.every((s) => s === '#3b82f6'), 'Series A sectors should all share series color');

  // Second series paths should all use Series B color (#10b981)
  const seriesBStrokes = multiPaths.slice(4, 8).map((p) => p.getAttribute('stroke'));
  assert.ok(seriesBStrokes.every((s) => s === '#10b981'), 'Series B sectors should all share series color');

  const multiLegendSpans = Array.from(multiSeriesContainer.querySelectorAll('div > span:last-child')).map((s) => s.textContent);
  assert.deepEqual(multiLegendSpans, ['Series A', 'Series B'], 'Multi-series legend should list series names');
});

test('ChartRenderChild safely handles missing fileCache or early changeHandler events without error', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockFile = { path: 'test.md', basename: 'test' };
  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => mockFile,
    },
    vault: {
      getAbstractFileByPath: () => mockFile,
      cachedRead: async () => '',
    },
    metadataCache: {
      getFileCache: () => undefined, // Returns undefined during early cache scanning
      getFirstLinkpathDest: () => null,
      on: () => {},
      off: () => {},
    },
    settings: {
      colors: ['#3b82f6'],
      themeable: false,
    },
  };

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    type: 'bar',
    id: 'nonexistent-table',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'test.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  // changeHandler should safely handle empty/undefined file param without error
  assert.doesNotThrow(() => {
    renderedChild.changeHandler(undefined);
  });
});

test('coerceTableRow provides case-insensitive access with get, in (has), and getOwnPropertyDescriptor', async () => {
  const { coerceTableRow, parseCellValue } = await import('../src/chartFromTable');

  assert.equal(parseCellValue(' 1,234,567 '), 1234567);
  assert.equal(parseCellValue('-42.5'), -42.5);
  assert.equal(parseCellValue('true'), true);
  assert.equal(parseCellValue('FALSE'), false);
  assert.equal(parseCellValue('null'), null);
  assert.equal(parseCellValue(''), '');
  assert.equal(parseCellValue('2024-05-18') instanceof Date, true);

  const rawRow = {
    Location: 'Tokyo',
    'Land Area (km2)': '2,194',
    Population: '37,400,000',
    IsCapital: 'true',
  };

  const row = coerceTableRow(rawRow);

  // 1. Direct property access (exact case)
  assert.equal(row.Location, 'Tokyo');
  assert.equal(row['Land Area (km2)'], 2194);
  assert.equal(row.Population, 37400000);
  assert.equal(row.IsCapital, true);

  // 2. Case-insensitive access via get trap
  assert.equal(row.location, 'Tokyo');
  assert.equal(row.LOCATION, 'Tokyo');
  assert.equal(row['land area (km2)'], 2194);
  assert.equal(row['LAND AREA (KM2)'], 2194);
  assert.equal(row.population, 37400000);
  assert.equal(row.POPULATION, 37400000);
  assert.equal(row.iscapital, true);

  // 3. 'in' operator via has trap
  assert.equal('location' in row, true);
  assert.equal('LOCATION' in row, true);
  assert.equal('Location' in row, true);
  assert.equal('land area (km2)' in row, true);
  assert.equal('population' in row, true);
  assert.equal('POPULATION' in row, true);
  assert.equal('nonexistent' in row, false);

  // 4. Object.getOwnPropertyDescriptor reflection
  const descLower = Object.getOwnPropertyDescriptor(row, 'population');
  assert.notEqual(descLower, undefined);
  assert.equal(descLower?.value, 37400000);

  const descExact = Object.getOwnPropertyDescriptor(row, 'Population');
  assert.notEqual(descExact, undefined);
  assert.equal(descExact?.value, 37400000);

  const descMissing = Object.getOwnPropertyDescriptor(row, 'missing');
  assert.equal(descMissing, undefined);
});

test('ChartRenderChild loads external CSV data file directly in chart DSL', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const csvContent = `Month,Sales,Expenses
Jan,100,60
Feb,150,80
Mar,200,90`;

  const mockFile = { path: 'data/sales.csv', basename: 'sales', name: 'sales.csv' };
  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => ({ path: 'report.md' }),
    },
    vault: {
      getAbstractFileByPath: (p: string) => (p === 'data/sales.csv' ? mockFile : null),
      read: async (f: any) => (f.path === 'data/sales.csv' ? csvContent : ''),
    },
    metadataCache: {
      getFirstLinkpathDest: (p: string) => (p.includes('sales.csv') || p === 'sales' ? mockFile : null),
      getFileCache: () => null,
      on: () => {},
      off: () => {},
    },
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
  };

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6', '#ef4444'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    type: 'bar',
    data: 'data/sales.csv',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'report.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  assert.notEqual(renderedChild.chartEl, null, 'Chart element should be rendered from external CSV file');
});

test('ChartRenderChild loads external JSON data file and reloads on metadataCache change', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  let currentJson = JSON.stringify([
    { Product: 'Widget A', Q1: 50, Q2: 70 },
    { Product: 'Widget B', Q1: 80, Q2: 95 },
  ]);

  const mockFile = { path: 'data/products.json', basename: 'products', name: 'products.json' };
  let metadataListener: ((file: any) => void) | null = null;

  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => ({ path: 'note.md' }),
    },
    vault: {
      getAbstractFileByPath: (p: string) => (p === 'data/products.json' ? mockFile : null),
      read: async () => currentJson,
    },
    metadataCache: {
      getFirstLinkpathDest: (p: string) => (p.includes('products.json') ? mockFile : null),
      getFileCache: () => null,
      on: (evt: string, cb: any) => {
        if (evt === 'changed') metadataListener = cb;
      },
      off: () => {},
    },
    settings: {
      colors: ['#10b981', '#f59e0b'],
      themeable: false,
    },
  };

  const mockPlugin: any = {
    settings: { colors: ['#10b981', '#f59e0b'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    type: 'line',
    data: 'data/products.json',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'note.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  assert.notEqual(renderedChild.chartEl, null);

  // Test reload on file change
  assert.notEqual(metadataListener, null);
  let reloadCalled = false;
  renderedChild.reload = () => {
    reloadCalled = true;
  };

  (metadataListener as any)(mockFile);
  assert.equal(reloadCalled, true, 'Chart should reload when external data file changes in metadataCache');
});

test('ChartPlugin postprocessor accepts chart DSL with external data file without error', async () => {
  const PluginModule = await import('../src/main');
  const ChartPlugin = PluginModule.default;

  const plugin = new ChartPlugin(mockApp as any, {} as any);
  let passedData: any = null;
  plugin.renderer = {
    renderFromYaml: async (data: any) => {
      passedData = data;
    },
  } as any;

  const container = document.createElement('div');
  const yamlString = `
type: bar
data: 5-Data/datasets/sales.csv
`;

  await plugin.postprocessor(yamlString, container, {} as any);
  assert.notEqual(passedData, null);
  assert.equal(passedData.type, 'bar');
  assert.equal(passedData.data, '5-Data/datasets/sales.csv');
  assert.equal(container.querySelector('.chart-error'), null, 'No error should be rendered for valid external data DSL');
});

test('ChartRenderChild renders 2-column CSV with Windows backslash path and displays title', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const csvChina = `Year,Trade Policy Uncertainty
2000,105.2
2001,112.5
2002,98.4`;

  const mockFile = {
    path: '5-Data/chinaEPU/China_Trade_policy_uncertainty_2000_2026.csv',
    basename: 'China_Trade_policy_uncertainty_2000_2026',
    name: 'China_Trade_policy_uncertainty_2000_2026.csv',
  };

  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => ({ path: 'note.md' }),
    },
    vault: {
      getAbstractFileByPath: (p: string) =>
        p === '5-Data/chinaEPU/China_Trade_policy_uncertainty_2000_2026.csv' ? mockFile : null,
      read: async () => csvChina,
    },
    metadataCache: {
      getFirstLinkpathDest: (p: string) =>
        p.includes('China_Trade_policy_uncertainty_2000_2026') ? mockFile : null,
      getFileCache: () => null,
      on: () => {},
      off: () => {},
    },
    settings: {
      colors: ['#3b82f6'],
      themeable: false,
    },
  };

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    title: 'China Trade policy uncertainty',
    type: 'line',
    data: '5-Data\\chinaEPU\\China_Trade_policy_uncertainty_2000_2026.csv',
    width: '500px',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'note.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  assert.notEqual(renderedChild.chartEl, null);

  const titleEl = renderedChild.chartEl.querySelector('h2');
  assert.notEqual(titleEl, null, 'Chart title element <h2> should be rendered');
  assert.equal(titleEl.textContent, 'China Trade policy uncertainty');

  // Verify that only 1 data series (Trade Policy Uncertainty) was plotted instead of 2 criss-crossing lines
  assert.equal(renderedChild.data.series.length, 1);
  assert.equal(renderedChild.data.series[0].title, 'Trade Policy Uncertainty');
  assert.deepEqual(renderedChild.data.labels, ['2000', '2001', '2002']);
});

test('line chart sorts timeseries data points monotonically and applies thin white border to dots', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6'], themeable: false },
    app: {
      workspace: { onLayoutReady: (cb: () => void) => cb(), on: () => {} },
      vault: { getAbstractFileByPath: () => null, read: async () => '' },
      metadataCache: { getFileCache: () => null, on: () => {} },
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  // Provide unordered dates in labels
  const lineYaml = {
    type: 'line',
    labels: ['2024-05-01', '2024-01-01', '2024-03-01'],
    series: [
      {
        title: 'Monthly Index',
        data: [50, 10, 30],
      },
    ],
  };

  const prep = await renderer.datasetPrep(lineYaml, container);
  assert.ok(prep.plotOptions?.marks);

  // Render to DOM
  const rendered = await renderer.renderRaw(prep, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  // Check dots have thin white border (either on circle or its parent g)
  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 3);
  dots.forEach((dot) => {
    const stroke = dot.getAttribute('stroke') || dot.parentElement?.getAttribute('stroke');
    const strokeWidth = dot.getAttribute('stroke-width') || dot.parentElement?.getAttribute('stroke-width');
    assert.equal(stroke, 'white');
    assert.equal(strokeWidth, '0.75');
  });
});

test('dense line charts (>30 points) auto-omit visible dots, format temporal axes, and support point options', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;
  const { rowsToTableData, coerceTableRow } = await import('../src/chartFromTable');

  // 1. Simulate 2-column CSV data like China Trade policy uncertainty
  // Month: 2000/1/1, Index: 110.123
  const rawRows: any[] = [];
  for (let year = 2000; year <= 2010; year++) {
    for (let month = 1; month <= 12; month++) {
      rawRows.push({
        month: `${year}/${month}/1`,
        index: (100 + Math.sin(month) * 20).toFixed(3),
      });
    }
  }

  const tableRows = rawRows.map(coerceTableRow);
  const tableData = rowsToTableData(tableRows, 'columns');

  // Verify labels are formatted cleanly as ISO strings instead of full Date.toString()
  assert.equal(tableData.labels[0], '2000-01-01');
  assert.equal(tableData.labels[1], '2000-02-01');
  assert.ok(!tableData.labels[0].includes('GMT'));

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6', '#10b981'], themeable: false },
    app: {
      workspace: {
        getActiveFile: () => null,
      },
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const lineYaml = {
    title: 'China Trade policy uncertainty',
    type: 'line',
    labels: tableData.labels,
    series: [
      {
        title: tableData.dataFields[0].dataTitle,
        data: tableData.dataFields[0].data,
      },
    ],
  };

  const prep = await renderer.datasetPrep(lineYaml, container);
  const rendered = await renderer.renderRaw(prep, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  // Check that dots have radius 0 (no giant overlapping blob along the line)
  const dots = container.querySelectorAll('circle');
  assert.ok(dots.length > 30);
  dots.forEach((dot) => {
    assert.equal(dot.getAttribute('r'), '0');
  });

  // Verify x-axis ticks are clean temporal labels (e.g. years 2000, 2002, ...)
  // rather than unreadable giant timezone strings
  const textElements = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(!textElements.some((t) => t.includes('GMT') || t.includes('Coordinated Universal Time')));
  assert.ok(textElements.some((t) => t.includes('2000')));

  // Verify explicit pointRadius override works
  const explicitContainer = document.createElement('div');
  const explicitYaml = {
    ...lineYaml,
    pointRadius: 2,
  };
  const explicitPrep = await renderer.datasetPrep(explicitYaml, explicitContainer);
  await renderer.renderRaw(explicitPrep, explicitContainer);
  const explicitDots = explicitContainer.querySelectorAll('circle');
  assert.equal(explicitDots[0].getAttribute('r'), '2');
});

test('categorical line and bar charts strictly preserve non-alphabetical labels order, markLine, and filtered dataLabels', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: { colors: ['#3b82f6'], themeable: false },
    app: {
      workspace: { onLayoutReady: (cb: () => void) => cb(), on: () => {} },
      vault: { getAbstractFileByPath: () => null, read: async () => '' },
      metadataCache: { getFileCache: () => null, on: () => {} },
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  // Exact configuration reported by user
  const yaml = {
    type: 'line',
    title: 'Monthly Bandwidth Usage',
    subtitle: 'Network Ingress (GB)',
    area: true,
    fillOpacity: 0.3,
    beginAtZero: true,
    dataLabels: ['May', 'Jul'],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
    series: [
      {
        title: 'Ingress',
        data: [120, 150, 180, 220, 310, 290, 420],
      },
    ],
    markLines: [
      {
        x: 'May',
        label: 'Capacity Upgrade',
        style: 'dashed',
        color: '#6366f1',
      },
    ],
    width: '550px',
  };

  const prep = await renderer.datasetPrep(yaml, container);
  assert.ok(prep.plotOptions);

  // Check scale domain matches original labels order exactly and is NOT sorted alphabetically
  assert.deepEqual(prep.plotOptions.x?.domain, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']);

  const rendered = await renderer.renderRaw(prep, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  // Check that rendered tick labels appear in chronological order (Jan, Feb, Mar, Apr, May, Jun, Jul)
  // and NOT alphabetical order (Apr, Feb, Jan, Jul, Jun, Mar, May)
  const renderedTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');

  const janIdx = renderedTexts.indexOf('Jan');
  const febIdx = renderedTexts.indexOf('Feb');
  const marIdx = renderedTexts.indexOf('Mar');
  const aprIdx = renderedTexts.indexOf('Apr');
  const mayIdx = renderedTexts.indexOf('May');
  const junIdx = renderedTexts.indexOf('Jun');
  const julIdx = renderedTexts.indexOf('Jul');

  assert.ok(janIdx !== -1, 'Jan should exist');
  assert.ok(febIdx !== -1, 'Feb should exist');
  assert.ok(marIdx !== -1, 'Mar should exist');
  assert.ok(aprIdx !== -1, 'Apr should exist');
  assert.ok(mayIdx !== -1, 'May should exist');
  assert.ok(junIdx !== -1, 'Jun should exist');
  assert.ok(julIdx !== -1, 'Jul should exist');

  assert.ok(janIdx < febIdx, 'Jan must appear before Feb');
  assert.ok(febIdx < marIdx, 'Feb must appear before Mar');
  assert.ok(marIdx < aprIdx, 'Mar must appear before Apr');
  assert.ok(aprIdx < mayIdx, 'Apr must appear before May');
  assert.ok(mayIdx < junIdx, 'May must appear before Jun');
  assert.ok(junIdx < julIdx, 'Jun must appear before Jul');

  // Verify filtered dataLabels are present for May (310) and Jul (420), but not Jan (120)
  assert.ok(renderedTexts.includes('310'), 'Data label 310 for May must be rendered');
  assert.ok(renderedTexts.includes('420'), 'Data label 420 for Jul must be rendered');
  assert.ok(!renderedTexts.includes('120'), 'Data label 120 for Jan should NOT be rendered when filtered to [May, Jul]');

  // Verify markLine label is rendered
  assert.ok(renderedTexts.includes('Capacity Upgrade'), 'MarkLine label Capacity Upgrade should be rendered');
});

test('grouped bar chart with markdown table, markLine, and string axis titles renders all data bars without data loss', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const markdownContent = `
|  | Test1 | Test2 | Test3 |
| --- | --- | --- | --- |
| Data1 | 1 | 2 | 3.33 |
| Data2 | 3 | 2 | 1 |
| Data3 | 4.5 | 4 | 2 |
^table
`;

  const mockFile = { path: 'test_table.md', basename: 'test_table' };
  const mockPlugin: any = {
    settings: { colors: ['#3b82f6', '#10b981', '#f59e0b'], themeable: false },
    app: {
      workspace: {
        getActiveFile: () => mockFile,
        onLayoutReady: (cb: () => void) => cb(),
        on: () => {},
      },
      vault: {
        getAbstractFileByPath: () => mockFile,
        read: async () => markdownContent,
        cachedRead: async () => markdownContent,
      },
      metadataCache: {
        getFileCache: () => null,
        on: () => {},
        off: () => {},
      },
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartYaml = {
    type: 'bar',
    id: 'table',
    layout: 'rows',
    x: 'Metrics',
    y: 'Score',
    showLabels: true,
    markLines: [
      {
        y: 3.0,
        label: 'Target Benchmark',
        style: 'dashed',
        color: '#f59e0b',
      },
    ],
    width: '80%',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartYaml, container, {
    sourcePath: 'test_table.md',
    addChild: (child: any) => {
      renderedChild = child;
      onloadPromise = child.onload();
    },
  } as any);

  if (onloadPromise) {
    await onloadPromise;
  }

  assert.notEqual(renderedChild, null);
  assert.notEqual(renderedChild.chartEl, null);

  // Grouped bar chart with 3 categories and 3 series = exactly 9 bars
  const barRects = renderedChild.chartEl.querySelectorAll('svg[class*="plot"] rect');
  assert.equal(barRects.length, 9, 'All 9 bars across 3 series and 3 categories should be rendered');

  // Verify markLine is rendered
  const lines = renderedChild.chartEl.querySelectorAll('line');
  assert.ok(lines.length >= 1, 'MarkLine should be rendered');

  // Verify text labels include data labels and mark line label
  const texts = Array.from(renderedChild.chartEl.querySelectorAll('text')).map((t: any) => t.textContent || '');
  assert.ok(texts.includes('Target Benchmark'), 'MarkLine label should be present');
  assert.ok(texts.includes('3.33'), 'Data label 3.33 should be present');
  assert.ok(texts.includes('4.5'), 'Data label 4.5 should be present');

  // Verify category order (Test1, Test2, Test3) is preserved on facet axis fx
  const test1Idx = texts.indexOf('Test1');
  const test2Idx = texts.indexOf('Test2');
  const test3Idx = texts.indexOf('Test3');
  assert.ok(test1Idx !== -1 && test2Idx !== -1 && test3Idx !== -1, 'All category labels must be rendered');
  assert.ok(test1Idx < test2Idx && test2Idx < test3Idx, 'Category labels Test1, Test2, Test3 must preserve column ordering');

  // Verify shorthand axis labels/titles
  assert.equal(renderedChild.prep?.plotOptions?.x?.label, 'Metrics', 'Shorthand x string should set x axis label');
  assert.equal(renderedChild.prep?.plotOptions?.y?.label, 'Score', 'Shorthand y string should set y axis label');
});

test('horizontal grouped bar chart preserves category ordering on fy without discarding bars', async () => {
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

  const horizontalGroupedYaml = {
    type: 'bar',
    indexAxis: 'y',
    labels: ['Delta', 'Beta', 'Alpha'],
    series: [
      { title: 'Series 1', data: [10, 20, 30] },
      { title: 'Series 2', data: [15, 25, 35] },
    ],
  };

  const prep = await renderer.datasetPrep(horizontalGroupedYaml, container);
  assert.deepEqual(prep.plotOptions?.fy?.domain, ['Delta', 'Beta', 'Alpha'], 'Category domain should be assigned to fy');
  assert.equal(prep.plotOptions?.y?.domain, undefined, 'y scale domain should not be overridden by category labels');

  await renderer.renderRaw(prep, container);
  // Plot renders 6 data bars in the chart SVG plus 2 swatches in the legend
  const barRects = container.querySelectorAll('svg[class*="plot"] rect');
  assert.equal(barRects.length, 6, 'All 6 bars in horizontal grouped chart should be rendered');

  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');
  const deltaIdx = texts.indexOf('Delta');
  const betaIdx = texts.indexOf('Beta');
  const alphaIdx = texts.indexOf('Alpha');
  assert.ok(deltaIdx !== -1 && betaIdx !== -1 && alphaIdx !== -1);
  assert.ok(deltaIdx < betaIdx && betaIdx < alphaIdx, 'Category labels must preserve non-alphabetical ordering on fy');
});
