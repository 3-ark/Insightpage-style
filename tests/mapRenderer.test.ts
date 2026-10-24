import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

// Mock 'obsidian' module for Node runtime before requiring project files
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'obsidian') {
    return {
      parseYaml: (str: string) => {
        const result: any = {};
        const lines = str.split('\n');
        let currentArrayKey: string | null = null;
        let currentItem: any = null;

        for (const rawLine of lines) {
          const line = rawLine.replace(/\t/g, '    ');
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          if (line.startsWith('fitBounds:')) {
            result.fitBounds = line.replace('fitBounds:', '').trim() === 'true';
            currentArrayKey = null;
          } else if (line.startsWith('lat:')) {
            result.lat = Number(line.replace('lat:', '').trim());
            currentArrayKey = null;
          } else if (line.startsWith('long:')) {
            result.long = Number(line.replace('long:', '').trim());
            currentArrayKey = null;
          } else if (line.startsWith('zoom:')) {
            result.zoom = Number(line.replace('zoom:', '').trim());
            currentArrayKey = null;
          } else if (line.startsWith('height:')) {
            result.height = line.replace('height:', '').trim();
            currentArrayKey = null;
          } else if (line.startsWith('width:')) {
            result.width = line.replace('width:', '').trim();
            currentArrayKey = null;
          } else if (line.startsWith('tileServer:')) {
            result.tileServer = line.replace('tileServer:', '').trim().replace(/^['"]|['"]$/g, '');
            currentArrayKey = null;
          } else if (line.startsWith('center:')) {
            const raw = line.replace('center:', '').trim();
            result.center = JSON.parse(raw);
            currentArrayKey = null;
          } else if (line.startsWith('geojson:')) {
            result.geojson = str.substring(str.indexOf('geojson:') + 8).trim();
            break;
          } else if (line.startsWith('markers:')) {
            result.markers = [];
            currentArrayKey = 'markers';
          } else if (line.startsWith('lines:')) {
            result.lines = [];
            currentArrayKey = 'lines';
          } else if (line.startsWith('polygons:')) {
            result.polygons = [];
            currentArrayKey = 'polygons';
          } else if (line.startsWith('circles:')) {
            result.circles = [];
            currentArrayKey = 'circles';
          } else if (currentArrayKey && trimmed.startsWith('-')) {
            const val = trimmed.replace(/^-/, '').trim();
            if (val.startsWith('[')) {
              result[currentArrayKey].push(JSON.parse(val));
              currentItem = null;
            } else if (val.includes(':')) {
              currentItem = {};
              result[currentArrayKey].push(currentItem);
              const [k, v] = val.split(':').map((s) => s.trim());
              currentItem[k] = v.startsWith('[') || v.startsWith('{') ? JSON.parse(v) : (v.startsWith('"') ? JSON.parse(v) : v);
            }
          } else if (currentArrayKey && currentItem && trimmed.includes(':')) {
            const [k, v] = trimmed.split(':').map((s) => s.trim());
            currentItem[k] = v.startsWith('[') || v.startsWith('{') ? JSON.parse(v) : (v.startsWith('"') ? JSON.parse(v) : v);
          }
        }
        return result;
      },
    };
  }
  return originalRequire.apply(this, arguments as any);
};

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
    url: 'http://localhost',
  });
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
  (global as any).HTMLElement = dom.window.HTMLElement;
  (global as any).SVGElement = dom.window.SVGElement;
  (global as any).Element = dom.window.Element;
  (global as any).Node = dom.window.Node;
  return dom;
}

test('renderMapBlock initializes Leaflet map container and tile layer with YAML options', async () => {
  const { renderMapBlock } = await import('../src/mapRenderer');
  const dom = setupDom();

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const mapYaml = `lat: 51.505
long: -0.09
zoom: 13
height: 450px
width: 100%
tileServer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'`;

  renderMapBlock(mapYaml, container);

  const wrapper = container.querySelector('.leaflet-map-wrapper') as HTMLElement;
  assert.ok(wrapper, 'Leaflet map wrapper should be present');
  assert.strictEqual(wrapper.style.height, '450px');
  assert.strictEqual(wrapper.style.width, '100%');

  const leafletContainer = container.querySelector('.leaflet-container');
  assert.ok(leafletContainer, 'Leaflet container element should be present');

  const tilePane = container.querySelector('.leaflet-tile-pane');
  assert.ok(tilePane, 'Tile pane layer should be present');
});

test('renderMapBlock supports markers with popups, tooltips, and custom colors', async () => {
  const { renderMapBlock } = await import('../src/mapRenderer');
  const dom = setupDom();

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const yamlSource = `center: [40.7128, -74.0060]
zoom: 12
markers:
  - lat: 40.7128
    lng: -74.0060
    popup: "New York City"
    title: "NYC Marker"
    color: "#ef4444"
  - [40.73061, -73.935242, "Queens", "Queens Title"]`;

  renderMapBlock(yamlSource, container);

  const markerPane = container.querySelector('.leaflet-marker-pane');
  assert.ok(markerPane, 'Marker pane should be present');

  const markerIcons = markerPane.querySelectorAll('.leaflet-custom-marker-icon');
  assert.strictEqual(markerIcons.length, 2, 'Should create 2 custom SVG markers');

  // Check color customization
  const svgContent = markerIcons[0].innerHTML;
  assert.ok(svgContent.includes('#ef4444'), 'Marker SVG should contain custom color');
});

test('renderMapBlock supports polylines, polygons, circles, and GeoJSON features', async () => {
  const { renderMapBlock } = await import('../src/mapRenderer');
  const dom = setupDom();

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const yamlSource = `fitBounds: true
lines:
  - points: [[51.5, -0.09], [51.51, -0.1]]
    color: "#10b981"
    popup: "Route 1"
polygons:
  - points: [[51.509, -0.08], [51.503, -0.06], [51.51, -0.047]]
    color: "#8b5cf6"
    popup: "Area A"
circles:
  - lat: 51.505
    lng: -0.09
    radius: 500
    popup: "Circle Zone"
geojson: {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-0.09,51.505]},"properties":{"name":"GeoJSON Point"}}]}
`;

  renderMapBlock(yamlSource, container);

  const overlayPane = container.querySelector('.leaflet-overlay-pane');
  assert.ok(overlayPane, 'Overlay pane should be present for lines, polygons, circles, geojson');

  const svgPaths = overlayPane.querySelectorAll('path');
  assert.ok(svgPaths.length >= 3, 'Should render SVG vector paths for polyline, polygon, circle');
});

test('getLeaflet returns Leaflet instance', async () => {
  const { getLeaflet } = await import('../src/mapRenderer');
  const L = getLeaflet();
  assert.ok(L, 'Leaflet object should exist');
  assert.strictEqual(typeof L.map, 'function', 'L.map should be a function');
  assert.strictEqual(typeof L.marker, 'function', 'L.marker should be a function');
});

test('window.L property setter allows setting window.L without throwing TypeError', async () => {
  const { getLeaflet, setLeaflet } = await import('../src/mapRenderer');
  const dom = setupDom();

  Object.defineProperty(dom.window, 'L', {
    configurable: true,
    enumerable: true,
    get: () => getLeaflet(),
    set: (v) => setLeaflet(v),
  });

  assert.doesNotThrow(() => {
    (dom.window as any).L = { test: true };
  }, 'Assigning to window.L should not throw TypeError');

  assert.strictEqual((dom.window as any).L.test, true, 'window.L getter should return updated instance');
});
