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

// Mock canvas getContext for color scheme legend ramp rendering in JSDOM
(dom.window.HTMLCanvasElement.prototype as any).getContext = () => ({
  fillStyle: '',
  fillRect: () => {},
  getImageData: () => ({ data: [] }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {},
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

test('renders basic scatter chart with tuple pairs [x, y] in series data', async () => {
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

  const scatterYaml = {
    type: 'scatter',
    series: [
      {
        title: 'Measurement A',
        data: [
          [1, 10],
          [2, 25],
          [3, 30],
        ],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  assert.notEqual(prepared.plotOptions, null);
  assert.ok(prepared.plotOptions?.marks);

  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  const svg = container.querySelector('svg');
  assert.notEqual(svg, null, 'SVG should be rendered');

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 3, 'Should render 3 scatter points');
});

test('renders scatter chart with object format {x, y} and multiple series', async () => {
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

  const scatterYaml = {
    type: 'scatterplot',
    series: [
      {
        title: 'Group 1',
        data: [
          { x: 10, y: 100 },
          { x: 20, y: 200 },
        ],
      },
      {
        title: 'Group 2',
        data: [
          { x: 15, y: 150 },
          { x: 25, y: 250 },
        ],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 4, 'Should render 4 scatter points across 2 groups');
});

test('renders scatter chart with direct data array format and custom series field', async () => {
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

  const scatterYaml = {
    type: 'point',
    data: [
      { x: 1, y: 2, series: 'Alpha' },
      { x: 2, y: 4, series: 'Alpha' },
      { x: 3, y: 9, series: 'Beta' },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 3, 'Should render 3 scatter points from direct data array');
});

test('renders scatter chart with numeric data and labels mapped to x coordinates', async () => {
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

  const scatterYaml = {
    type: 'scatter',
    labels: [100, 200, 300],
    series: [
      {
        title: 'Sample',
        data: [5, 15, 25],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 3, 'Should render 3 scatter points mapped from labels');
});

test('supports log scales on x and y axes', async () => {
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
  const container = document.createElement('div');

  const scatterYaml = {
    type: 'scatter',
    xScale: 'log',
    yLog: true,
    series: [
      {
        data: [
          [10, 100],
          [100, 1000],
        ],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  assert.equal((prepared.plotOptions?.x as any)?.type, 'log');
  assert.equal((prepared.plotOptions?.y as any)?.type, 'log');
});

test('supports trendline (linear regression) with custom stroke and ci', async () => {
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
  const container = document.createElement('div');

  const scatterYaml = {
    type: 'scatter',
    trendline: {
      stroke: '#ff0000',
      strokeWidth: 3,
      strokeDasharray: '6,6',
      ci: true,
    },
    series: [
      {
        data: [
          [1, 2],
          [2, 3],
          [3, 5],
          [4, 4],
          [5, 6],
        ],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  // Observable Plot linear regression mark creates regression line path and confidence band
  const paths = container.querySelectorAll('path');
  assert.ok(paths.length > 0, 'Should render linear regression path');
});

test('supports markLine / markLines with custom value, axis, and labels', async () => {
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
  const container = document.createElement('div');

  const scatterYaml = {
    type: 'scatter',
    markLines: [
      {
        axis: 'x',
        value: 50,
        label: 'Target X',
        color: '#10b981',
        style: 'dashed',
      },
      {
        axis: 'y',
        value: 120,
        label: 'Threshold Y',
        color: '#f59e0b',
        style: 'dotted',
      },
    ],
    series: [
      {
        data: [
          [20, 80],
          [60, 140],
        ],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
  assert.ok(texts.includes('Target X'), 'Should render Target X markLine label');
  assert.ok(texts.includes('Threshold Y'), 'Should render Threshold Y markLine label');
});

test('ChartPlugin postprocessor processes scatter chart with series data', async () => {
  const PluginModule = await import('../src/main');
  const ChartPlugin = PluginModule.default;

  const plugin = new ChartPlugin(mockApp as any, {} as any);
  let renderedYaml: any = null;
  plugin.renderer = {
    renderFromYaml: async (data: any) => {
      renderedYaml = data;
    },
  } as any;

  const container = document.createElement('div');
  const yamlContent = JSON.stringify({
    type: 'scatter',
    series: [
      {
        title: 'Points',
        data: [[1, 2], [3, 4]],
      },
    ],
  });

  await plugin.postprocessor(yamlContent, container, {} as any);

  assert.notEqual(renderedYaml, null);
  assert.equal(renderedYaml.type, 'scatter');
  assert.equal(renderedYaml.series.length, 1);
});

test('renders scatter chart DSL referencing a markdown table with log scales, labels, fill, trendline, and markLines', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const noteContent = `
### 3. Rendering from Markdown Tables in the Same Note

| Location | Density | Population | Land area (km2) |
| --- | --- | --- | --- |
| Monaco | 19428 | 38857 | 2 |
| Singapore | 8290 | 6110200 | 737 |
| Gibraltar (UK) | 5800 | 39329 | 6.8 |
| Vatican City | 2205 | 882 | 0.44 |
| Bahrain | 2034 | 1607049 | 790 |
| Maldives | 1759 | 527799 | 298 |
| Malta | 1686 | 539607 | 320 |
| Bangladesh | 1333 | 173562364 | 130170 |
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
      getFileCache: () => null,
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

  const chartYaml = {
    type: 'scatter',
    id: 'table-countries',
    xScale: 'log',
    yScale: 'log',
    trending: true,
    x: {
      label: 'Land Area (km²)',
    },
    y: {
      label: 'Population',
    },
    markLines: [
      {
        y: 10000000,
        label: '10M Population Threshold',
        style: 'dashed',
        color: '#f59e0b',
      },
      {
        x: 1000,
        label: '1,000 km² Threshold',
        style: 'dotted',
        color: '#10b981',
      },
    ],
    width: '700px',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartYaml, container, {
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
  assert.notEqual(renderedChild.chartEl, null, 'Chart element should be rendered from table ID reference');

  const svg = container.querySelector('svg');
  assert.notEqual(svg, null, 'SVG element must be present');

  // Verify dots (8 countries = 8 circles)
  const circles = container.querySelectorAll('circle');
  assert.equal(circles.length, 8, 'Should render 8 scatter dots corresponding to the 8 table rows');

  // Verify labels (Location values rendered as text marks above dots)
  const allTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(allTexts.some((t) => t.includes('Monaco')), 'Should render Monaco label');
  assert.ok(allTexts.some((t) => t.includes('Singapore')), 'Should render Singapore label');
  assert.ok(allTexts.some((t) => t.includes('Bangladesh')), 'Should render Bangladesh label');

  // Verify markLine labels
  assert.ok(allTexts.some((t) => t.includes('10M Population Threshold')), 'Should render markLine Y label');
  assert.ok(allTexts.some((t) => t.includes('1,000 km² Threshold')), 'Should render markLine X label');

  // Verify trendline linear regression path
  const paths = container.querySelectorAll('path');
  assert.ok(paths.length > 0, 'Should render linear regression trendline path');
});

test('renders scatter chart DSL with explicit x and y column mappings and custom fill', async () => {
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

  const scatterYaml = {
    type: 'scatter',
    x: 'Area',
    y: 'Pop',
    fill: 'City',
    tableRows: [
      { City: 'Tokyo', Area: 2194, Pop: 37400000 },
      { City: 'Delhi', Area: 1484, Pop: 30290000 },
      { City: 'Shanghai', Area: 6340, Pop: 27050000 },
    ],
  };

  const prepared = await renderer.datasetPrep(scatterYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 3, 'Should render 3 dots from explicit Area/Pop columns');

  const allTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(allTexts.some((t) => t.includes('Tokyo')), 'Should render Tokyo text label');
  assert.ok(allTexts.some((t) => t.includes('Delhi')), 'Should render Delhi text label');
});

test('renders scatter chart DSL loading external CSV data file', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const csvContent = `City,Area,Pop
Tokyo,2194,37400000
Delhi,1484,30290000
Shanghai,6340,27050000`;

  const mockFile = { path: 'data/cities.csv', basename: 'cities', name: 'cities.csv' };
  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => ({ path: 'cities.md' }),
    },
    vault: {
      getAbstractFileByPath: (p: string) => (p === 'data/cities.csv' ? mockFile : null),
      read: async () => csvContent,
    },
    metadataCache: {
      getFirstLinkpathDest: (p: string) => (p.includes('cities.csv') ? mockFile : null),
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
    settings: { colors: ['#3b82f6'], themeable: false },
    app: mockPluginApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const chartData = {
    type: 'scatter',
    data: 'data/cities.csv',
    x: 'Area',
    y: 'Pop',
    fill: 'City',
  };

  let renderedChild: any = null;
  let onloadPromise: Promise<void> | null = null;

  await renderer.renderFromYaml(chartData, container, {
    sourcePath: 'cities.md',
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

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 3, 'Should render 3 dots from external CSV');
});

test('renders scatter chart DSL loading external countries.csv with named labels, trending, and r/fill matching', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const csvContent = `Country,Land area (km2),Population,Density
China,9596960,1411750000,147
India,3287263,1380004385,420
USA,9833517,331893745,34
Indonesia,1904569,273523615,144`;

  const mockFile = { path: '5-Data/datasets/countries.csv', basename: 'countries', name: 'countries.csv' };

  const mockPluginApp = {
    workspace: {
      onLayoutReady: (cb: () => void) => cb(),
      on: () => {},
      getActiveFile: () => ({ path: 'report.md' }),
    },
    vault: {
      getAbstractFileByPath: (p: string) => (p === '5-Data/datasets/countries.csv' ? mockFile : null),
      read: async () => csvContent,
    },
    metadataCache: {
      getFirstLinkpathDest: (p: string) => (p.includes('countries.csv') ? mockFile : null),
      getFileCache: () => null,
      on: () => {},
      off: () => {},
    },
    settings: {
      colors: ['#3b82f6', '#ef4444', '#10b981'],
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
    title: 'Countries Population vs Land Area',
    type: 'scatter',
    data: '5-Data/datasets/countries.csv',
    x: {
      label: 'Land area (km2)',
    },
    y: {
      label: 'Population',
    },
    fill: 'Density',
    r: 'Density',
    trending: true,
    width: '650px',
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
  assert.notEqual(renderedChild.chartEl, null);

  const titleEl = renderedChild.chartEl.querySelector('h2');
  assert.notEqual(titleEl, null, 'Scatter chart should render title element');
  assert.equal(titleEl.textContent, 'Countries Population vs Land Area');

  const dots = container.querySelectorAll('circle');
  assert.equal(dots.length, 4, 'Should render 4 country dots from external CSV');

  // Verify that trending linear regression mark exists
  const regressionGroup = container.querySelector('g[aria-label="linear-regression"]');
  assert.notEqual(regressionGroup, null, 'Trendline group should be rendered');
  const regressionPath = regressionGroup?.querySelector('path');
  assert.notEqual(regressionPath, null, 'Trendline path should be rendered');
});

test('auto-aligns color ruler scale to log when x or y is log, and supports label filtering', async () => {
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

  const tableRows = [
    { Country: 'Monaco', Density: 19428, Population: 38857, Area: 2 },
    { Country: 'Singapore', Density: 8290, Population: 6110200, Area: 737 },
    { Country: 'Hong Kong', Density: 7062, Population: 7414910, Area: 1050 },
    { Country: 'Maldives', Density: 1759, Population: 527799, Area: 298 },
  ];

  // 1. With xScale: 'log', color scale should automatically be 'log'
  const logChartYaml = {
    type: 'scatter',
    xScale: 'log',
    yScale: 'log',
    x: 'Area',
    y: 'Population',
    fill: 'Density',
    labels: ['Singapore', 'Monaco'], // only show these two labels
    tableRows,
  };

  const prepared = await renderer.datasetPrep(logChartYaml, container);
  assert.equal(prepared.plotOptions?.color?.type, 'log', 'Color scale should align to log when axis is log');

  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement || rendered instanceof SVGElement);

  // Check that only Monaco and Singapore are in the rendered text labels
  const allTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(allTexts.some((t) => t.includes('Monaco')), 'Should render Monaco label');
  assert.ok(allTexts.some((t) => t.includes('Singapore')), 'Should render Singapore label');
  assert.ok(!allTexts.some((t) => t.includes('Hong Kong')), 'Should NOT render Hong Kong label');
  assert.ok(!allTexts.some((t) => t.includes('Maldives')), 'Should NOT render Maldives label');

  // 2. Test hiding all labels with labels: false
  const noLabelsYaml = {
    type: 'scatter',
    x: 'Area',
    y: 'Population',
    fill: 'Density',
    labels: false,
    tableRows,
  };

  const container2 = document.createElement('div');
  const prep2 = await renderer.datasetPrep(noLabelsYaml, container2);
  await renderer.renderRaw(prep2, container2);
  const texts2 = Array.from(container2.querySelectorAll('text')).map((t) => t.textContent || '');
  assert.ok(!texts2.some((t) => t.includes('Monaco')), 'Should not render any point labels when labels: false');

  // 3. Test explicit color scale override
  const linearOverrideYaml = {
    type: 'scatter',
    xScale: 'log',
    colorScale: 'linear',
    x: 'Area',
    y: 'Population',
    fill: 'Density',
    tableRows,
  };
  const container3 = document.createElement('div');
  const prep3 = await renderer.datasetPrep(linearOverrideYaml, container3);
  assert.equal(prep3.plotOptions?.color?.type, 'linear', 'Explicit colorScale should override auto-log alignment');
});
