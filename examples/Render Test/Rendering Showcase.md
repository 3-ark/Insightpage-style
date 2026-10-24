---
source: ""
description: A showcase of the rich text rendering capabilities of the note vault.
title: Rendering Showcase
tags:
  - example
  - rendering
  - markdown
  - katex
createdat: 1790759208074
lastupdatedat: 1790916001826
pinned: false
fileextension: .md
fileExtension: .md
---


### Subscripts and superscripts

H~2~O X^2^=3



### Charts & Data Visualizations

InsightPage renders interactive charts via Chart.js-style YAML configurations (`chart`) and declarative JavaScript data visualizations via Observable Plot (`plot`).

To explore interactive bar charts, line charts, pie charts, histograms, and multi-series plots without CPU overhead in this document, see:
👉 **[[Example Chart]]**

### ABC Sheet Music Notes

Render interactive sheet music with `abc` code blocks:

````
```abc
X: 1
T: Ode to Joy
M: 4/4
L: 1/4
K: C
E E F G | G F E D | C C D E | E3/2 D/ D2 |
```
````

**Rendered Sheet Music:**

```abc
X: 1
T: Ode to Joy
M: 4/4
L: 1/4
K: C
E E F G | G F E D | C C D E | E3/2 D/ D2 |
```

### Inline Comment

Here is an example of an interactive comment callout:
::cmt[💡 example. This is a comment.]
::cmt [💡 example. This is a comment.]
::cmt{💡 example. This is a comment.}
::cmt {💡 example. This is a comment.}

Use `::cmt[]` for interactive comments/popovers.

```markdown
::cmt[💡 example. This is a comment.]
```

## Maps
InsightPage supports interactive maps rendered using **Leaflet.js** via ```map``` code blocks.

### Interactive Map Example

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

### Configuration Reference

Use YAML or JSON inside a ```map``` block:

- **`lat` / `lng`**: Latitude and longitude center coordinates.
- **`zoom`**: Initial zoom level (1 to 19).
- **`height` / `width`**: Map container dimensions (e.g. `380px`, `100%`).
- **`markers`**: List of marker objects or `[lat, lng, popup]` tuples.
  - `lat`, `lng`: Marker coordinates.
  - `popup`: HTML / text displayed on click.
  - `color`: Marker pin color (e.g., `#ef4444`, `#3b82f6`).
- **`lines` / `polylines`**: Array of lines with coordinates and color options.
- **`polygons`**: Polygon shapes with `fillColor` and `color`.
- **`circles`**: Circle overlays with `lat`, `lng`, `radius` (in meters), and `popup`.
- **`geojson`**: Raw GeoJSON object or string to plot vector layers.

## Skills for AI

`````Markdown

## Charts

Use `chart` with YAML configuration. Note: While this is not real Chart.js, you can use Chart.js-style syntaxes which most Chart.js wrappers use (powered by Observable Plot).

Supported fields:

* `type`: `bar`, `line`, `pie`, etc.
* `labels`: category labels
* `series`: list of `title` and `data`
* `width`: optional

````markdown
```chart
type: bar
labels: ["Q1", "Q2", "Q3", "Q4"]
series:
  - title: "Revenue"
    data: [120, 150, 180, 220]
width: 500px
```
````

## Observable Plot

Use `plot` or `cosyobservableplot` for data visualizations using Observable Plot. You can write JavaScript expressions or declarative configuration options.

````markdown
```plot
Plot.rectY(
  [2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 9, 10, 12, 15],
  Plot.binX(
    { y: "count" },
    { x: (d) => d, fill: "#3b82f6", tip: true, rx: 3 }
  )
)
```
````

## Inline Comment

Use `::cmt[]` for interactive comments/popovers.

```markdown
::cmt[💡 example. This is a comment.]
```
`````