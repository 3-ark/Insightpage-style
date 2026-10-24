import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

// Mock 'obsidian' module for Node runtime
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'obsidian') {
    return {
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

// Setup JSDOM globals before importing modules
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

test('renders multi-stage Sankey diagram with user exact rendering case and label mismatch normalization', async () => {
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

  // User spec has "Fossil Fuel" in labels and "Fossil Fuels" in series/priority/color maps
  const sankeyYaml = {
    type: 'sankey',
    labels: ['Oil', 'Natural Gas', 'Coal', 'Fossil Fuel', 'Electricity', 'Energy'],
    series: [
      {
        data: [
          ['Oil', 15, 'Fossil Fuels'],
          ['Natural Gas', 20, 'Fossil Fuels'],
          ['Coal', 25, 'Fossil Fuels'],
          ['Coal', 25, 'Electricity'],
          ['Fossil Fuels', 60, 'Energy'],
          ['Electricity', 25, 'Energy'],
        ],
      },
    ],
    priority: {
      Oil: 1,
      'Natural Gas': 2,
      Coal: 3,
      'Fossil Fuels': 1,
      Electricity: 2,
      Energy: 1,
    },
    colorFrom: {
      Oil: 'black',
      Coal: 'gray',
      'Fossil Fuels': 'slategray',
      Electricity: 'blue',
      Energy: 'orange',
    },
    colorTo: {
      Oil: 'black',
      Coal: 'gray',
      'Fossil Fuels': 'slategray',
      Electricity: 'blue',
      Energy: 'orange',
    },
  };

  const prepared = await renderer.datasetPrep(sankeyYaml, container);
  assert.equal(prepared.plotOptions, null);
  assert.ok(prepared.customElement instanceof HTMLElement);

  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement);

  const svg = container.querySelector('svg');
  assert.notEqual(svg, null, 'SVG element should be rendered');

  const rects = container.querySelectorAll('rect');
  assert.equal(rects.length, 6, 'Should render 6 node rects despite Fossil Fuel / Fossil Fuels mismatch');

  const paths = container.querySelectorAll('path');
  assert.equal(paths.length, 6, 'Should render 6 flow paths');

  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
  assert.ok(texts.includes('Fossil Fuel'), 'Labels should contain Fossil Fuel');

  const defs = container.querySelector('defs');
  assert.notEqual(defs, null);
  const gradients = defs!.querySelectorAll('linearGradient');
  assert.ok(gradients.length > 0, 'Linear gradients should be generated for colorFrom/colorTo links');
});

test('handles varied flow array formats and object flow definitions', async () => {
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

  const sankeyYaml = {
    type: 'sankey',
    series: [
      {
        data: [
          { from: 'A', to: 'B', flow: 10 },
          ['B', 'C', 10], // [from, to, flow] format
        ],
      },
    ],
  };

  const prepared = await renderer.datasetPrep(sankeyYaml, container);
  const rendered = await renderer.renderRaw(prepared, container);
  assert.ok(rendered instanceof HTMLElement);

  const rects = container.querySelectorAll('rect');
  assert.equal(rects.length, 3, 'Should render 3 node rects (A, B, C)');

  const paths = container.querySelectorAll('path');
  assert.equal(paths.length, 2, 'Should render 2 flow paths');
});
