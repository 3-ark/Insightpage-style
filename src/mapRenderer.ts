import { renderError } from './util';

let _leaflet: any = null;

export function getLeaflet(): any {
  if (!_leaflet) {
    const loaded = require('leaflet');
    _leaflet = loaded.default ?? loaded;
  }
  return _leaflet;
}

export function setLeaflet(val: any): void {
  _leaflet = val;
}

function parseMapYaml(source: string): any {
  const obsidian = require('obsidian');
  if (obsidian && typeof obsidian.parseYaml === 'function') {
    return obsidian.parseYaml(source);
  }
  return JSON.parse(source);
}

const DEFAULT_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path fill="#2563eb" stroke="#ffffff" stroke-width="1.5" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12zm0 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>`;

function createSvgIcon(L: any, color?: string): any {
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

function parseLatLng(val: any): [number, number] | null {
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
  if (typeof val === 'object') {
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

export function renderMapBlock(source: string, container: HTMLElement): void {
  const L = getLeaflet();

  let config: any = {};
  if (source && source.trim().length > 0) {
    try {
      config = parseMapYaml(source.replace(/\t/g, '    '));
      if (typeof config !== 'object' || config === null) {
        config = {};
      }
    } catch (err) {
      try {
        config = JSON.parse(source);
      } catch {
        renderError(`Map Config Error: ${err}`, container);
        return;
      }
    }
  }

  // Determine container dimensions
  const height = config.height ? (typeof config.height === 'number' ? `${config.height}px` : String(config.height)) : '400px';
  const width = config.width ? (typeof config.width === 'number' ? `${config.width}px` : String(config.width)) : '100%';

  const mapDiv = document.createElement('div');
  mapDiv.className = 'leaflet-map-wrapper';
  mapDiv.style.height = height;
  mapDiv.style.width = width;
  mapDiv.style.position = 'relative';
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

  const zoom = Number(config.zoom ?? config.defaultZoom ?? (centerCoords ? 13 : 2));
  const minZoom = Number(config.minZoom ?? 1);
  const maxZoom = Number(config.maxZoom ?? 19);

  // Fallback center if none provided
  const initialCenter = centerCoords || [0, 0];

  const supportsCanvas = typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    !!document.createElement('canvas').getContext?.('2d');

  let map: any;
  try {
    map = L.map(mapDiv, {
      center: initialCenter,
      zoom,
      minZoom,
      maxZoom,
      preferCanvas: supportsCanvas,
    });
  } catch (err) {
    renderError(`Leaflet Map Initialization Error: ${err}`, container);
    return;
  }

  // Tile layer configuration
  const tileUrl = config.tileServer ?? config.url ?? config.tile ?? config.tiles ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = config.attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const subdomains = config.subdomains ?? 'abc';

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
  const markerList: any[] = Array.isArray(rawMarkers) ? rawMarkers : rawMarkers ? [rawMarkers] : [];

  markerList.forEach((m) => {
    let coords: [number, number] | null = null;
    let popupText: string | undefined = undefined;
    let titleText: string | undefined = undefined;
    let tooltipText: string | undefined = undefined;
    let color: string | undefined = undefined;

    if (Array.isArray(m)) {
      coords = parseLatLng([m[0], m[1]]);
      popupText = m[2];
      titleText = m[3];
    } else if (typeof m === 'object' && m !== null) {
      coords = parseLatLng(m);
      popupText = m.popup;
      titleText = m.title;
      tooltipText = m.tooltip;
      color = m.color;
    }

    if (coords) {
      updateBounds(coords);
      const icon = createSvgIcon(L, color);
      const markerOpts: any = { icon };
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
  const linesList: any[] = Array.isArray(rawLines) ? rawLines : rawLines ? [rawLines] : [];

  linesList.forEach((line) => {
    let pts: [number, number][] = [];
    let color = '#2563eb';
    let weight = 3;
    let popupText: string | undefined = undefined;

    // Performance optimization: Single-pass coordinate parsing and bounds accumulation.
    // Eliminates intermediate map/filter array object allocations per line feature.
    let rawPts: any[] = [];
    if (Array.isArray(line)) {
      rawPts = line;
    } else if (typeof line === 'object' && line !== null) {
      rawPts = line.points ?? line.coordinates ?? line.path;
      if (!Array.isArray(rawPts)) rawPts = [];
      color = line.color ?? color;
      weight = Number(line.weight ?? weight);
      popupText = line.popup;
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
  const polygonsList: any[] = Array.isArray(rawPolygons) ? rawPolygons : rawPolygons ? [rawPolygons] : [];

  polygonsList.forEach((poly) => {
    let pts: [number, number][] = [];
    let color = '#2563eb';
    let fillColor = '#3b82f6';
    let fillOpacity = 0.4;
    let popupText: string | undefined = undefined;

    // Performance optimization: Single-pass coordinate parsing and bounds accumulation.
    // Eliminates intermediate map/filter array object allocations per polygon feature.
    let rawPts: any[] = [];
    if (Array.isArray(poly)) {
      rawPts = poly;
    } else if (typeof poly === 'object' && poly !== null) {
      rawPts = poly.points ?? poly.coordinates ?? poly.path;
      if (!Array.isArray(rawPts)) rawPts = [];
      color = poly.color ?? color;
      fillColor = poly.fillColor ?? fillColor;
      fillOpacity = Number(poly.fillOpacity ?? fillOpacity);
      popupText = poly.popup;
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
  const circlesList: any[] = Array.isArray(rawCircles) ? rawCircles : rawCircles ? [rawCircles] : [];

  circlesList.forEach((c) => {
    let coords: [number, number] | null = null;
    let radius = 100;
    let color = '#2563eb';
    let fillColor = '#3b82f6';
    let fillOpacity = 0.4;
    let popupText: string | undefined = undefined;

    if (Array.isArray(c)) {
      coords = parseLatLng([c[0], c[1]]);
      radius = Number(c[2] ?? radius);
      popupText = c[3];
    } else if (typeof c === 'object' && c !== null) {
      coords = parseLatLng(c);
      radius = Number(c.radius ?? radius);
      color = c.color ?? color;
      fillColor = c.fillColor ?? fillColor;
      fillOpacity = Number(c.fillOpacity ?? fillOpacity);
      popupText = c.popup;
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
      const geoObj = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
      const geoLayer = L.geoJSON(geoObj, {
        onEachFeature: (feature: any, layer: any) => {
          if (feature?.properties) {
            const popup = feature.properties.popup ?? feature.properties.name ?? feature.properties.title;
            if (popup) layer.bindPopup(String(popup));
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

  // Ensure Leaflet correctly calculates map container bounds and loads visible tiles immediately
  const triggerInvalidate = () => {
    if (map && typeof map.invalidateSize === 'function') {
      map.invalidateSize();
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(triggerInvalidate);
  } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(triggerInvalidate);
  } else {
    setTimeout(triggerInvalidate, 0);
  }

  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      if (!mapDiv.isConnected) {
        resizeObserver.disconnect();
        return;
      }
      if (map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    });
    resizeObserver.observe(mapDiv);
  }
}
