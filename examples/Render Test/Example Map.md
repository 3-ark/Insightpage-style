---
title: Example Map
description: Interactive Leaflet map rendering examples and configuration guide in InsightPage.
tags:
  - example
  - map
  - leaflet
  - visualization
createdat: 1794105987579
lastupdatedat: 1794105987579
---

# Example Map

InsightPage supports interactive maps rendered using **Leaflet.js** via ```map``` or ```leaflet``` code blocks.

---

## 1. Interactive Map Example

```map
center:
  lat: 51.505
  lng: -0.09
zoom: 13
height: 380px
markers:
  - lat: 51.505
    lng: -0.09
    title: "Central London"
    popup: "<b>Central London</b><br>Heart of the city."
    color: "#ef4444"
  - lat: 51.515
    lng: -0.1
    title: "British Museum"
    popup: "<b>British Museum</b><br>World-famous history and culture museum."
    color: "#3b82f6"
  - lat: 51.5007
    lng: -0.1246
    title: "Big Ben"
    popup: "<b>Big Ben & Houses of Parliament</b>"
    color: "#10b981"
lines:
  - coordinates:
      - [51.505, -0.09]
      - [51.515, -0.1]
      - [51.5007, -0.1246]
      - [51.505, -0.09]
    color: "#8b5cf6"
```

---

## 2. Configuration Reference

Use YAML or JSON inside a ```map``` block:

* **`center`**: Map center coordinates as `{ lat, lng }` or `[lat, lng]`.
* **`zoom`**: Initial zoom level (integer from 1 to 19, default 13).
* **`height` / `width`**: Map container dimensions (e.g., `380px`, `100%`).
* **`markers`**: List of marker objects or `[lat, lng, popup]` tuples.
  * `lat`, `lng`: Coordinates.
  * `title`: Tooltip text.
  * `popup`: HTML / text displayed on click.
  * `color`: Pin accent color (e.g., `#ef4444`, `#3b82f6`).
* **`lines` / `polylines`**: Array of lines with coordinates and color options.
* **`polygons`**: Polygon shapes with `coordinates`, `fillColor`, and stroke `color`.
* **`circles`**: Circle overlays with `lat`, `lng`, `radius` (in meters), and `popup`.
* **`geojson`**: Raw GeoJSON object or string to plot vector geographic layers.
