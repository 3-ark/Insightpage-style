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

// Mock Obsidian App
const mockApp = {
  workspace: {
    onLayoutReady: (cb: () => void) => cb(),
    on: () => {},
    getActiveFile: () => null,
  },
  settings: {
    colors: ['#3b82f6', '#ef4444'],
    themeable: false,
  },
};

const userCodeSnippetWithoutReturn = `
const sst = await fetch("https://climatereanalyzer.org/clim/sst_daily/json_2clim/oisst2.1_nino3.4_sst_day.json")
  .then((response) => response.json());

const yearly = sst.slice(0, -2);
const means = sst.filter((d) => d.name === "1991-2020")[0].data.slice(0, -1);
const stdev = d3
  .transpose(
    yearly
      .filter((d) => "1991" <= d.name && d.name <= "2020")
      .map((d) => d.data.slice(0, -1))
  )
  .map((d) => d3.deviation(d));

const means2 = d3.blur([...means], 15);
const stdev2 = d3.blur([...stdev], 15);

const data = yearly.flatMap((series) =>
  series.data
    .map((t, day) => {
      if (t === null || t === undefined) return null;
      return {
        day: day,
        name: series.name,
        year: series.name === "Preliminary" ? 2026 : +series.name,
        preliminary: series.name === "Preliminary",
        temperature: t,
        anomaly: t - means[day],
        deviation: stdev[day] ? (t - means[day]) / stdev[day] : null
      };
    })
    .filter(Boolean)
);

const last2026 = data.findLastIndex((d) => d.name === "2026");
if (last2026 !== -1) {
  data.splice(last2026 + 1, 0, {...data[last2026], name: "Preliminary", preliminary: true});
}

const point2026 = data.findLast((d) => d.name === "2026");

const date = day => new Date(Date.UTC(2000, 0, 1 + day));

Plot.plot({
  width: 900,
  height: 540,
  marginRight: 40,
  x: {
    label: null,
    tickFormat: "%b",
    ticks: 12
  },
  y: {
    nice: 20
  },
  color: {
    scheme: "blues",
    unknown: "red"
  },
  marks: [
    d3.range(-3.5, 4.5, 0.5).map((d) =>
      Plot.line(stdev2, {
        x: (dev, i) => date(i),
        y: (dev, i) => means2[i] + dev * d,
        strokeWidth: d % 1 ? 0.25 : 0.5
      })
    ),
    Plot.line(data, {
      filter: (d) => d.name !== "Preliminary",
      x: (d) => date(d.day),
      y: "temperature",
      z: "name",
      stroke: (d) => (d.year === 2026 ? NaN : d.year),
      strokeWidth: (d) => (d.year === 2026 ? 2 : 0.5)
    }),
    Plot.line(data, {
      filter: (d) => d.name !== "Preliminary",
      x: (d) => date(d.day),
      y: "temperature",
      z: "name",
      stroke: NaN,
      strokeWidth: 2,
      strokeDasharray: [2, 4]
    }),
    Plot.line(means, {
      x: (_, i) => date(i),
      y: Plot.identity,
      stroke: "orange",
      strokeWidth: 2
    }),
    Plot.axisY({tickSize: 15, dx: -5}),
    Plot.axisY([-3, -2, -1, 0, 1, 2, 3, 4], {
      y: (d) => means2[364] + d * stdev2[364],
      anchor: "right",
      tickSize: 0,
      tickFormat: (d) =>
        d === 0 ? "mean" : d === 1 ? \`σ\` : d === -1 ? \`-σ\` : \`\${d}σ\`,
      label: "deviation"
    }),

    Plot.text(["2026"], {
      x: date(point2026.day),
      y: point2026.temperature,
      dx: 8,
      fill: "red",
      stroke: "white",
      strokeWidth: 2,
      fontWeight: "bold",
      textAnchor: "start"
    }),
    Plot.tip(
      data,
      Plot.pointer({
        x: (d) => date(d.day),
        y: "temperature",
        channels: {
          series: "name",
          date: (d) => date(d.day),
          temperature: "temperature",
          anomaly: "anomaly",
          deviation: "deviation"
        },
        format: {
          series: true,
          date: "%d %B",
          temperature: (d) => \`\${d}°C\`,
          anomaly: (d) =>
            d < 0 ? \`\${d.toFixed(2)}°C\` : \`+\${d.toFixed(2)}°C\`,
          deviation: (d) =>
            d < 0 ? \`\${d.toFixed(2)}σ\` : \`+\${d.toFixed(2)}σ\`,
          x: false,
          y: false
        }
      })
    )
  ]
})
`;

test('renders standalone Plot.rectY mark codeblock from user issue query', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
    app: {
      ...mockApp,
      vault: {
        read: async () => '[]',
      },
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const rectYCode = `Plot.rectY(
  [2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 9, 10, 12, 15],
  Plot.binX(
    { y: "count" },
    { x: (d) => d, fill: "#3b82f6", tip: true, rx: 3 }
  )
)`;

  const rendered = await renderer.renderRaw(rectYCode, container);

  assert.notEqual(rendered, null, 'Rendered chart should not be null');
  assert.equal(container.children.length, 1, 'Container should have 1 child element');
  assert.equal(rendered?.tagName.toLowerCase(), 'svg', 'Rendered element should be an SVG');
});

test('renders array of marks returned from codeblock', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
    app: mockApp,
  };

  const mockObsidianModule = {
    requestUrl: async (options: any) => {
      return {
        status: 200,
        text: JSON.stringify(mockSstData),
        arrayBuffer: Buffer.from(JSON.stringify(mockSstData)),
      };
    },
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const arrayMarksCode = `[
  Plot.rectY(
    [2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 9, 10, 12, 15],
    Plot.binX({ y: "count" }, { x: (d) => d, fill: "#3b82f6" })
  )
]`;

  const rendered = await renderer.renderRaw(arrayMarksCode, container);

  assert.notEqual(rendered, null, 'Rendered chart should not be null');
  assert.equal(container.children.length, 1, 'Container should have 1 child element');
  assert.equal(rendered?.tagName.toLowerCase(), 'svg', 'Rendered element should be an SVG');
});

test('custom fetch resolves relative vault dataset file path', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  const datasetPath = '5-Data/datasets/oisst2.1_nino3.4_sst_day.json';
  const datasetContent = JSON.stringify([
    { name: '1991', data: [20, 21, 22, 23, 24] },
    { name: '1992', data: [20, 21, 22, 23, 24] },
    { name: '2020', data: [20, 21, 22, 23, 24] },
    { name: '2026', data: [21, 22, 23, 24, 25] },
    { name: '1991-2020', data: [20, 21, 22, 23, 24, 25] },
    { name: 'Preliminary', data: [21, 22, 23, 24, 25] },
  ]);

  const appWithVault = {
    ...mockApp,
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (path === datasetPath) {
          return { path: datasetPath, name: 'oisst2.1_nino3.4_sst_day.json' };
        }
        return null;
      },
      read: async (file: any) => {
        if (file.path === datasetPath) {
          return datasetContent;
        }
        throw new Error('File not found');
      },
    },
  };

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
    app: appWithVault,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const relativeFetchCode = `
const sst = await fetch("${datasetPath}").then((res) => res.json());
Plot.rectY([sst.length], Plot.binX({ y: "count" }, { x: (d) => d }));
`;

  const rendered = await renderer.renderRaw(relativeFetchCode, container);

  assert.notEqual(rendered, null, 'Rendered chart should not be null when fetching local vault file');
  assert.equal(container.children.length, 1);
  assert.ok(container.innerHTML.includes('svg'));
});

test('renders exact user plot codeblock without explicit return keyword', async () => {
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

  const mockSstData = [
    { name: '1991', data: [20, 21, 22, 23, 24] },
    { name: '1992', data: [20, 21, 22, 23, 24] },
    { name: '2020', data: [20, 21, 22, 23, 24] },
    { name: '2026', data: [21, 22, 23, 24, 25] },
    { name: '1991-2020', data: [20, 21, 22, 23, 24, 25] },
    { name: 'Preliminary', data: [21, 22, 23, 24, 25] },
  ];

  const mockObsidian = {
    requestUrl: async (opts: any) => ({
      status: 200,
      text: JSON.stringify(mockSstData),
      arrayBuffer: Buffer.from(JSON.stringify(mockSstData)),
    }),
  };

  // Re-register require for obsidian in this test
  const origReq = Module.prototype.require;
  Module.prototype.require = function (id: string) {
    if (id === 'obsidian') {
      return mockObsidian;
    }
    return origReq.apply(this, arguments as any);
  };

  global.fetch = (async (url: string) => {
    return new Response(JSON.stringify(mockSstData), { status: 200 });
  }) as any;

  const rendered = await renderer.renderRaw(userCodeSnippetWithoutReturn, container);
  Module.prototype.require = origReq;

  assert.notEqual(rendered, null, 'Rendered chart should not be null');
  assert.equal(container.children.length, 1, 'Container should have 1 child element');
  assert.ok(
    container.innerHTML.includes('svg') || container.innerHTML.includes('figure'),
    'Container should contain svg or figure element'
  );
});

test('renders Observable Plot tooltip mark with correct tip group element and styles', async () => {
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

  const plotWithTipCode = `
Plot.plot({
  marks: [
    Plot.dot([{x: 1, y: 10}], {x: "x", y: "y", tip: true})
  ]
})
`;

  const rendered = await renderer.renderRaw(plotWithTipCode, container);
  assert.notEqual(rendered, null, 'Rendered plot with tip should not be null');

  const tipGroup = container.querySelector('g[aria-label="tip"]');
  assert.notEqual(tipGroup, null, 'Plot SVG should contain g[aria-label="tip"] element');
  assert.equal(tipGroup?.getAttribute('fill'), 'var(--plot-background)', 'Tip group fill should be var(--plot-background)');
});
