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
              currentSeries.data = JSON.parse(raw);
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
