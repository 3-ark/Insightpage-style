import { MarkdownRenderChild, parseYaml } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { renderError } from './util';

let _leaflet: typeof import('leaflet') | null = null;

export function getLeaflet(): typeof import('leaflet') {
  if (!_leaflet) {
    const loaded = require('leaflet') as typeof import('leaflet') & { default?: typeof import('leaflet') };
    _leaflet = loaded.default ?? loaded;
  }
  return _leaflet;
}

export function setLeaflet(val: typeof import('leaflet')): void {
  _leaflet = val;
}

type MapConfig = Record<string, unknown>;

function isRecord(value: unknown): value is MapConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMapYaml(source: string): MapConfig {
  const parsed = parseYaml(source) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toColor(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

const DEFAULT_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path fill="#2563eb" stroke="#ffffff" stroke-width="1.5" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12zm0 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>`;

function createSvgIcon(L: typeof import('leaflet'), color?: string): import('leaflet').DivIcon {
  let svg = DEFAULT_MARKER_SVG;
  if (color) {
    svg = svg.replace('#2563eb', color);
  }
  return L.divIcon({
    className: 'leaflet-custom-marker-icon',
    html: svg,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -32],
    tooltipAnchor: [12, -18],
  });
}

function parseLatLng(val: unknown): [number, number] | null {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= 2) {
    const lat = typeof val[0] === 'number' ? val[0] : Number(val[0]);
    const lng = typeof val[1] === 'number' ? val[1] : Number(val[1]);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  if (typeof val === 'string') {
    // Performance optimization: Avoid split(',').map() temporary array allocations by slicing at comma indices
    const commaIdx = val.indexOf(',');
    if (commaIdx !== -1) {
      const nextComma = val.indexOf(',', commaIdx + 1);
      const lat = Number(val.slice(0, commaIdx).trim());
      const lngStr = nextComma === -1 ? val.slice(commaIdx + 1) : val.slice(commaIdx + 1, nextComma);
      const lng = Number(lngStr.trim());
      if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
  }
  if (isRecord(val)) {
    const rawLat = val.lat ?? val.latitude;
    const rawLng = val.lng ?? val.long ?? val.longitude ?? val.lon;
    if (rawLat !== undefined && rawLng !== undefined) {
      const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
      const lng = typeof rawLng === 'number' ? rawLng : Number(rawLng);
      if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
  }
  return null;
}

export function renderMapBlock(
  source: string,
  container: HTMLElement,
  ctx?: MarkdownPostProcessorContext,
): void {
  const L = getLeaflet();

  let config: MapConfig = {};
  if (source && source.trim().length > 0) {
    try {
      config = parseMapYaml(source.replace(/\t/g, '    '));
    } catch (err) {
      try {
        const parsed = JSON.parse(source) as unknown;
        config = isRecord(parsed) ? parsed : {};
      } catch {
        renderError(`Map Config Error: ${String(err)}`, container);
        return;
      }
    }
  }

  // Determine container dimensions
  const heightValue = config.height;
  const widthValue = config.width;
  const height = typeof heightValue === 'number'
    ? `${heightValue}px`
    : typeof heightValue === 'string'
    ? heightValue
    : '400px';
  const width = typeof widthValue === 'number'
    ? `${widthValue}px`
    : typeof widthValue === 'string'
    ? widthValue
    : '100%';

  const mapDiv = createDiv();
  mapDiv.className = 'leaflet-map-wrapper';
  mapDiv.style.height = height;
  mapDiv.style.width = width;
  container.appendChild(mapDiv);

  // Extract center & zoom
  let centerCoords = parseLatLng(config.center);
  if (!centerCoords) {
    const lat = config.lat ?? config.latitude;
    const lng = config.lng ?? config.long ?? config.longitude ?? config.lon;
    if (lat !== undefined && lng !== undefined) {
      centerCoords = parseLatLng([lat, lng]);
    }
  }

  const zoom = toNumber(config.zoom ?? config.defaultZoom, centerCoords ? 13 : 2);
  const minZoom = toNumber(config.minZoom, 1);
  const maxZoom = toNumber(config.maxZoom, 19);

  // Fallback center if none provided
  const initialCenter = centerCoords || [0, 0];

  const supportsCanvas = typeof document !== 'undefined' &&
    (typeof createEl === 'function'
      ? !!createEl('canvas')?.getContext?.('2d')
      : typeof mapDiv.createEl === 'function'
      ? !!mapDiv.createEl('canvas')?.getContext?.('2d')
      : !!createEl('canvas')?.getContext?.('2d'));

  let map: import('leaflet').Map;
  try {
    map = L.map(mapDiv, {
      center: initialCenter,
      zoom,
      minZoom,
      maxZoom,
      preferCanvas: supportsCanvas,
    });
  } catch (err) {
    renderError(`Leaflet Map Initialization Error: ${String(err)}`, container);
    return;
  }

  // Tile layer configuration
  const tileUrl = typeof (config.tileServer ?? config.url ?? config.tile ?? config.tiles) === 'string'
    ? String(config.tileServer ?? config.url ?? config.tile ?? config.tiles)
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = typeof config.attribution === 'string'
    ? config.attribution
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const subdomains = typeof config.subdomains === 'string' ? config.subdomains : 'abc';

  L.tileLayer(tileUrl, {
    attribution,
    subdomains,
    maxZoom,
    minZoom,
    crossOrigin: true,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 2,
  }).addTo(map);

  // Performance optimization: Compute bounding box extents in O(1) space with scalar min/max accumulators
  // rather than accumulating thousands of coordinate tuple arrays in an allCoords heap array, and pass
  // only the 2 corner points to L.latLngBounds.
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let hasCoords = false;

  const updateBounds = (p: [number, number]) => {
    const lat = p[0];
    const lng = p[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    hasCoords = true;
  };

  if (centerCoords) {
    updateBounds(centerCoords);
  }

  // Handle Markers
  const rawMarkers = config.markers ?? config.marker;
  const markerList: unknown[] = toArray(rawMarkers);

  markerList.forEach((m) => {
    let coords: [number, number] | null = null;
    let popupText: string | undefined = undefined;
    let titleText: string | undefined = undefined;
    let tooltipText: string | undefined = undefined;
    let color: string | undefined = undefined;

    if (Array.isArray(m)) {
      coords = parseLatLng([m[0], m[1]]);
      popupText = m[2] === undefined ? undefined : String(m[2]);
      titleText = m[3] === undefined ? undefined : String(m[3]);
    } else if (isRecord(m)) {
      coords = parseLatLng(m);
      popupText = toText(m.popup);
      titleText = toText(m.title);
      tooltipText = toText(m.tooltip);
      color = typeof m.color === 'string' ? m.color : undefined;
    }

    if (coords) {
      updateBounds(coords);
      const icon = createSvgIcon(L, color);
      const markerOpts: import('leaflet').MarkerOptions = { icon };
      if (titleText) markerOpts.title = titleText;

      const marker = L.marker(coords, markerOpts).addTo(map);

      if (popupText) {
        marker.bindPopup(String(popupText));
      }
      if (tooltipText) {
        marker.bindTooltip(String(tooltipText));
      }
    }
  });

  // Handle Lines / Polylines
  const rawLines = config.lines ?? config.polylines ?? config.line;
  const linesList: unknown[] = toArray(rawLines);

  linesList.forEach((line) => {
    const pts: [number, number][] = [];
    let color = '#2563eb';
    let weight = 3;
    let popupText: string | undefined = undefined;

    // Performance optimization: Single-pass coordinate parsing and bounds accumulation.
    // Eliminates intermediate map/filter array object allocations per line feature.
    let rawPts: unknown[] = [];
    if (Array.isArray(line)) {
      rawPts = line;
    } else if (isRecord(line)) {
      rawPts = toArray(line.points ?? line.coordinates ?? line.path);
      color = toColor(line.color, color);
      weight = toNumber(line.weight, weight);
      popupText = toText(line.popup);
    }

    for (let i = 0; i < rawPts.length; i++) {
      const pt = parseLatLng(rawPts[i]);
      if (pt) {
        pts.push(pt);
        updateBounds(pt);
      }
    }

    if (pts.length > 0) {
      const polyline = L.polyline(pts, { color, weight }).addTo(map);
      if (popupText) {
        polyline.bindPopup(String(popupText));
      }
    }
  });

  // Handle Polygons
  const rawPolygons = config.polygons ?? config.polygon;
  const polygonsList: unknown[] = toArray(rawPolygons);

  polygonsList.forEach((poly) => {
    const pts: [number, number][] = [];
    let color = '#2563eb';
    let fillColor = '#3b82f6';
    let fillOpacity = 0.4;
    let popupText: string | undefined = undefined;

    // Performance optimization: Single-pass coordinate parsing and bounds accumulation.
    // Eliminates intermediate map/filter array object allocations per polygon feature.
    let rawPts: unknown[] = [];
    if (Array.isArray(poly)) {
      rawPts = poly;
    } else if (isRecord(poly)) {
      rawPts = toArray(poly.points ?? poly.coordinates ?? poly.path);
      color = toColor(poly.color, color);
      fillColor = toColor(poly.fillColor, fillColor);
      fillOpacity = toNumber(poly.fillOpacity, fillOpacity);
      popupText = toText(poly.popup);
    }

    for (let i = 0; i < rawPts.length; i++) {
      const pt = parseLatLng(rawPts[i]);
      if (pt) {
        pts.push(pt);
        updateBounds(pt);
      }
    }

    if (pts.length > 0) {
      const polygon = L.polygon(pts, { color, fillColor, fillOpacity }).addTo(map);
      if (popupText) {
        polygon.bindPopup(String(popupText));
      }
    }
  });

  // Handle Circles
  const rawCircles = config.circles ?? config.circle;
  const circlesList: unknown[] = toArray(rawCircles);

  circlesList.forEach((c) => {
    let coords: [number, number] | null = null;
    let radius = 100;
    let color = '#2563eb';
    let fillColor = '#3b82f6';
    let fillOpacity = 0.4;
    let popupText: string | undefined = undefined;

    if (Array.isArray(c)) {
      coords = parseLatLng([c[0], c[1]]);
      radius = toNumber(c[2], radius);
      popupText = c[3] === undefined ? undefined : String(c[3]);
    } else if (isRecord(c)) {
      coords = parseLatLng(c);
      radius = toNumber(c.radius, radius);
      color = toColor(c.color, color);
      fillColor = toColor(c.fillColor, fillColor);
      fillOpacity = toNumber(c.fillOpacity, fillOpacity);
      popupText = toText(c.popup);
    }

    if (coords) {
      updateBounds(coords);
      const circle = L.circle(coords, { radius, color, fillColor, fillOpacity }).addTo(map);
      if (popupText) {
        circle.bindPopup(String(popupText));
      }
    }
  });

  // Handle GeoJSON
  const geojson = config.geojson ?? config.geoJson;
  if (geojson) {
    try {
      const parsedGeo = typeof geojson === 'string'
        ? JSON.parse(geojson) as unknown
        : geojson;
      const geoObj = parsedGeo as Parameters<typeof L.geoJSON>[0];
      const geoLayer = L.geoJSON(geoObj, {
        onEachFeature: (feature, layer) => {
          if (isRecord(feature.properties)) {
            const properties = feature.properties;
            const popup = toText(properties.popup ?? properties.name ?? properties.title);
            if (popup) layer.bindPopup(popup);
          }
        },
      }).addTo(map);

      try {
        const bounds = geoLayer.getBounds();
        if (bounds && bounds.isValid && bounds.isValid()) {
          updateBounds([bounds.getSouth(), bounds.getWest()]);
          updateBounds([bounds.getNorth(), bounds.getEast()]);
        }
      } catch {
        // ignore bounds invalid check if mock/empty
      }
    } catch (err) {
      console.warn('GeoJSON parsing failed:', err);
    }
  }

  // Auto fit bounds if fitBounds is true, or if center wasn't explicitly provided but markers/elements exist
  if (config.fitBounds === true || (!centerCoords && config.center === undefined && hasCoords)) {
    if (hasCoords) {
      const bounds = L.latLngBounds([[minLat, minLng], [maxLat, maxLng]]);
      if (bounds && bounds.isValid ? bounds.isValid() : true) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }

  // Multi-stage invalidation to ensure Leaflet calculates correct dimensions and loads visible tiles
  let isCleanedUp = false;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  const timeoutIds: number[] = [];

  const triggerInvalidate = () => {
    if (isCleanedUp || !map || typeof map.invalidateSize !== 'function') return;
    map.invalidateSize({ debounceMoveend: true });
  };

  // Immediate and staggered frame/timeout passes to adapt as container is inserted and styled
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(triggerInvalidate);
  }

  // Staggered timeouts help catch layout transitions in Obsidian reading view
  [0, 50, 150, 300, 600].forEach((delay) => {
    const tid = window.setTimeout(triggerInvalidate, delay);
    timeoutIds.push(tid);
  });

  // Track size changes without prematurely disconnecting when mapDiv is temporarily unattached during initial render
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      if (isCleanedUp) return;
      for (const entry of entries) {
        if (entry.contentRect && (entry.contentRect.width > 0 || entry.contentRect.height > 0)) {
          triggerInvalidate();
        }
      }
    });
    resizeObserver.observe(mapDiv);
  }

  // Detect when map becomes visible in Obsidian reading view viewport
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver((entries) => {
      if (isCleanedUp) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          triggerInvalidate();
        }
      }
    });
    intersectionObserver.observe(mapDiv);
  }

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    timeoutIds.forEach((id) => window.clearTimeout(id));
    timeoutIds.length = 0;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    try {
      if (map && typeof map.remove === 'function') {
        map.remove();
      }
    } catch {
      // ignore
    }
  };

  if (ctx && typeof ctx.addChild === 'function') {
    const child = new MarkdownRenderChild(container);
    child.onload = () => {
      triggerInvalidate();
      // Delay check in case layout settling occurs right after onload
      window.setTimeout(triggerInvalidate, 100);
    };
    child.onunload = cleanup;
    ctx.addChild(child);
  }
}
