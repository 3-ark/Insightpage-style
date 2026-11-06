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

test('renders text mark with dynamic frameAnchor, dx, and dy channel accessors', async () => {
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

  const cornerBadgeCode = `
Plot.plot({
  marks: [
    Plot.text([
      { text: "↖ High Density / Small Land", frameAnchor: "top-left", dx: 10, dy: 10 },
      { text: "↗ Large States (High Pop & Land)", frameAnchor: "top-right", dx: -10, dy: 10 },
      { text: "↙ Microstates & Territories", frameAnchor: "bottom-left", dx: 10, dy: -10 },
      { text: "↘ Large Land / Low Pop", frameAnchor: "bottom-right", dx: -10, dy: -10 }
    ], {
      frameAnchor: "frameAnchor",
      text: "text",
      fill: "#888",
      fontSize: 10,
      fontStyle: "italic",
      dx: "dx",
      dy: "dy"
    })
  ]
})
`;

  const rendered = await renderer.renderRaw(cornerBadgeCode, container);
  assert.notEqual(rendered, null, 'Rendered plot with corner badges should not be null');

  const textNodes = Array.from(container.querySelectorAll('text'));
  assert.equal(textNodes.length, 4, 'Should render 4 text badge nodes');

  const renderedTexts = textNodes.map((n) => n.textContent);
  assert.ok(renderedTexts.includes('↖ High Density / Small Land'));
  assert.ok(renderedTexts.includes('↗ Large States (High Pop & Land)'));
  assert.ok(renderedTexts.includes('↙ Microstates & Territories'));
  assert.ok(renderedTexts.includes('↘ Large Land / Low Pop'));
});

test('renders user issue query code with dynamic frameAnchor and table parsing', async () => {
  const RendererModule = await import('../src/chartRenderer');
  const Renderer = RendererModule.default;

  // Mock canvas getContext for color scheme legend ramp rendering
  (dom.window.HTMLCanvasElement.prototype as any).getContext = () => ({
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => ({ data: [] }),
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
  });
  (dom.window.HTMLCanvasElement.prototype as any).toDataURL = () => 'data:image/png;base64,mock';

  // Inject a mock table into DOM as in the user query
  const existingTable = dom.window.document.querySelector('table');
  if (existingTable) existingTable.remove();

  const tableEl = dom.window.document.createElement('table');
  tableEl.innerHTML = `
    <thead><tr><th>Land area</th><th>Density</th><th>Population</th><th>Area</th></tr></thead>
    <tbody>
      <tr><td>China</td><td>145</td><td>1,400,000,000</td><td>9,600,000</td></tr>
      <tr><td>India</td><td>418</td><td>1,380,000,000</td><td>3,300,000</td></tr>
      <tr><td>Singapore</td><td>8,000</td><td>5,700,000</td><td>728</td></tr>
      <tr><td>Monaco</td><td>19,000</td><td>39,000</td><td>2.1</td></tr>
    </tbody>
  `;
  dom.window.document.body.appendChild(tableEl);

  const mockPlugin: any = {
    settings: {
      colors: ['#3b82f6', '#ef4444'],
      themeable: false,
    },
    app: mockApp,
  };

  const renderer = new Renderer(mockPlugin);
  const container = document.createElement('div');

  const userQueryCode = `
// 1. Read and parse data dynamically from the table
const table = Array.from(document.querySelectorAll("table")).find(t =>
  t.textContent.includes("Land area") && t.textContent.includes("Population")
);

const data = Array.from(table ? table.querySelectorAll("tbody tr") : []).map(tr => {
  const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
  return {
    location: cells[0],
    density: parseFloat(cells[1].replace(/,/g, "")),
    population: parseFloat(cells[2].replace(/,/g, "")),
    area: parseFloat(cells[3].replace(/,/g, ""))
  };
}).filter(d => d.location && d.location !== "World" && !isNaN(d.population) && !isNaN(d.area) && d.area > 0 && d.population > 0);

// 2. Standard Thresholds (10M Population, 100k km² Area)
const POP_THRESHOLD = 10_000_000;
const AREA_THRESHOLD = 100_000;

// 3. Log-Log Linear Regression (Trend Line)
const n = data.length;
const lx = data.map(d => Math.log10(d.area));
const ly = data.map(d => Math.log10(d.population));
const meanX = lx.reduce((a, b) => a + b, 0) / n;
const meanY = ly.reduce((a, b) => a + b, 0) / n;
const num = lx.reduce((acc, x, i) => acc + (x - meanX) * (ly[i] - meanY), 0);
const den = lx.reduce((acc, x) => acc + Math.pow(x - meanX, 2), 0);
const slope = num / den;
const intercept = meanY - slope * meanX;

const trend = [
  { area: 0.3, population: Math.pow(10, intercept + slope * Math.log10(0.3)) },
  { area: 20_000_000, population: Math.pow(10, intercept + slope * Math.log10(20_000_000)) }
];

// 4. Render
Plot.plot({
  title: "X = Land area (km²), Y = Population, Color = Density",
  subtitle: "Blue line: Regression trend | Yellow cross: Large state thresholds (10M pop / 100k km²)",
  width: 860,
  height: 580,
  grid: true,
  inset: 24,
  x: {
    type: "log",
    label: "Land Area (km²) →",
    tickFormat: "~s"
  },
  y: {
    type: "log",
    label: "↑ Population",
    tickFormat: "~s"
  },
  color: {
    type: "log",
    scheme: "turbo",
    legend: true,
    label: "Density (/km²)"
  },
  marks: [
    // --- Regression Trend Line (Blue) ---
    Plot.line(trend, {
      x: "area",
      y: "population",
      stroke: "#1d63b8",
      strokeWidth: 3.5
    }),

    // --- Threshold Crosshair (Yellow) ---
    Plot.ruleX([AREA_THRESHOLD], {
      stroke: "#f59e0b",
      strokeWidth: 2
    }),
    Plot.ruleY([POP_THRESHOLD], {
      stroke: "#f59e0b",
      strokeWidth: 2
    }),

    // --- Quadrant Corner Badges (Placed out of the way) ---
    Plot.text([
      { text: "↖ High Density / Small Land", frameAnchor: "top-left", dx: 10, dy: 10 },
      { text: "↗ Large States (High Pop & Land)", frameAnchor: "top-right", dx: -10, dy: 10 },
      { text: "↙ Microstates & Territories", frameAnchor: "bottom-left", dx: 10, dy: -10 },
      { text: "↘ Large Land / Low Pop", frameAnchor: "bottom-right", dx: -10, dy: -10 }
    ], {
      frameAnchor: "frameAnchor",
      text: "text",
      fill: "#888",
      fontSize: 10,
      fontStyle: "italic",
      dx: "dx",
      dy: "dy"
    }),

    // --- Country Dots ---
    Plot.dot(data, {
      x: "area",
      y: "population",
      fill: "density",
      r: 5.5,
      stroke: "#222",
      strokeWidth: 0.5,
      tip: true,
      title: d => \`\${d.location}\\nArea: \${d.area.toLocaleString()} km²\\nPopulation: \${d.population.toLocaleString()}\\nDensity: \${d.density.toLocaleString()} /km²\`
    }),

    // --- Key Country Labels (Always rendered on top with clear text) ---
    Plot.text(
      data.filter(d => ["China", "India", "Bangladesh", "Taiwan", "Singapore", "Monaco", "Vatican City"].includes(d.location)),
      {
        x: "area",
        y: "population",
        text: "location",
        dy: -12,
        fontSize: 11,
        fontWeight: "bold",
        fill: "#111",
        stroke: "#fff",
        strokeWidth: 2,
        paintOrder: "stroke"
      }
    )
  ]
})
`;

  const rendered = await renderer.renderRaw(userQueryCode, container);
  assert.notEqual(rendered, null, 'User query plot should render successfully');
  assert.ok(
    container.innerHTML.includes('High Density / Small Land'),
    'Container should render corner badge labels'
  );
});

test('handles frameAnchor accessor function and dot/tip marks', async () => {
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

  const accessorFnCode = `
Plot.plot({
  marks: [
    Plot.text([
      { label: "Top Note", pos: "top" },
      { label: "Bottom Note", pos: "bottom" }
    ], {
      frameAnchor: d => d.pos,
      text: "label"
    }),
    Plot.dot([
      { anchor: "top-left" },
      { anchor: "bottom-right" }
    ], {
      frameAnchor: "anchor"
    })
  ]
})
`;

  const rendered = await renderer.renderRaw(accessorFnCode, container);
  assert.notEqual(rendered, null, 'Rendered plot with accessor function and dot mark should not be null');

  const textNodes = Array.from(container.querySelectorAll('text'));
  const renderedTexts = textNodes.map((n) => n.textContent);
  assert.ok(renderedTexts.includes('Top Note'));
  assert.ok(renderedTexts.includes('Bottom Note'));
});
