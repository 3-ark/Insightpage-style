---
source: ""
description: InsightPage extended Markdown syntax rules, DSL specifications, and examples tailored for AI assistants and LLMs.
title: Skills for AI
tags:
  - skills
  - ai
  - markdown
  - syntax
  - prompt
createdat: 1794280589329
lastupdatedat: 1794280589329
pinned: false
---

# InsightPage Markdown Syntax

Use these extensions in addition to standard Markdown and Mermaid.

Use different fence lengths for nested code fences.

## Tabs

Use `tabs` for switchable sections. Start each tab with `--- <Tab Title>`.

````markdown
```tabs
--- Overview
Summary...
--- Details
Specifications...
```
````

## Map

InsightPage supports interactive maps rendered using **Leaflet.js** via ```map``` or ```leaflet``` code blocks.

### 1. Interactive Map Example

````markdown
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
````
### 2. Configuration Reference

Use YAML or JSON inside a `map` block:

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

## Timeline Charts

Use `timeline` code blocks for zoomable, interactive timelines with adaptive time axes, horizontal panning, collection tags, and automatic categorical color discovery.

### Supported Syntaxes & Formats
* **Standard YAML/JSON array of events**: `[{start, end, title, ...}]` or list `- start: ...`
* **Loose Double-Brace Object**: `{{start: 2020-01-01, title: Project Alpha, end: 2021-06-01}}`
* **External Dataset Files & Schema Mapping**: `data: path/to/file.csv` with `schemas: { title, start, end, collection, categories }` (requires granting a local folder as FS Vault, or using absolute `http(s)://` / `data:` URLs)
* **Markdown Table Sourcing**: `table: "#table-id"` or `id: my-table` linking directly to note tables (works directly without file system permissions)

### Event Fields & Configuration
* `start`: ISO date string (`YYYY-MM-DD`), timestamp, or BC/negative year number (e.g. `-3000-08-01`, `3000 BC`, `-2400`).
* `end`: End date or year (optional; omitted or `Date.now()` extends to present day). Using `Date.now()` renders the vertical "Today" indicator line.
* `title`: Event title label displayed above or on the event bar. Supports wikilinks (`[[Note Title]]`).
* `collection`: Array of related project or publication tags (`[Tag1, Tag2]`). Collapses into `+N` badges on tight zoom.
* `[customCategory]`: Any custom key (e.g., `type`, `institution`, `category`, `region`) is automatically discovered, colored, and mapped to interactive category selection controls.

````markdown
```timeline
- start: 2020-01-01
  end: 2021-06-30
  title: Research Phase
  category: R&D
  collection: [Survey, Paper]

- start: 2021-07-01
  end: Date.now()
  title: Product Rollout
  category: Operations
  collection: [V1, V2]
```
````

## Charts (Chart DSL)

Use `chart` with YAML configuration for interactive charts rendered via Observable Plot and D3.

### Unified Chart Configuration Reference

All Chart DSL charts share a consistent set of configuration keys:

| Category | Options & Syntax | Description | Supported Chart Types |
| --- | --- | --- | --- |
| **Chart Types** | `type: bar` \| `line` \| `pie` \| `donut` (`doughnut`) \| `polararea` \| `radar` \| `sankey` \| `scatter` (`point`, `scatterplot`) | Specify the visualization type to render. | All Chart Types |
| **Data Sourcing** | `id: table-id` / `table: "#table-id"` <br> `data: path/to/file.csv` <br> `source:` / `file:` / `dataset:` | Bind directly to markdown tables (with or without `#` / `^` prefixes) or external CSV / TSV / JSON data files. | All Chart Types |
| **Mark Lines** | `markLines:` / `markLine:` / `marks:` <br> `- { y: 80, label: "Target", style: dashed, color: "#10b981", strokeWidth: 1.5 }` <br> `- { x: 50, label: "Threshold", style: dotted }` <br> `- { x: "Q3", label: "Milestone" }` | Add horizontal (`y:`) or vertical (`x:`) reference threshold lines with labels and custom styling (`solid`, `dashed`, `dotted`). Supports both numeric and categorical coordinates. | Bar, Line, Scatter |
| **Scales & Log Scales** | `xScale: log` / `yScale: log` <br> `xLog: true` / `yLog: true` <br> `scales: { x: { type: log }, y: { type: log } }` | Switch axis scale to logarithmic. Automatically suppresses 0-baseline collision on log scales. | Bar, Line, Scatter |
| **Domain & Min/Max** | `xMin: 0` / `xMax: 100` <br> `yMin: 0` / `yMax: 500` <br> `xDomain: [0, 50]` / `yDomain: [100, 1000]` | Pin explicit bounds and intervals for X or Y axes. | Bar, Line, Scatter |
| **Axis Inversion & Visibility** | `xReverse: true` / `yReverse: true` <br> `xDisplay: false` / `yDisplay: false` | Invert axis direction (e.g. rankings, depth) or toggle axis visibility for clean sparklines. | Bar, Line, Scatter |
| **Zero Baseline** | `beginAtZero: true` | Ensure linear quantitative axes start at 0, preventing truncated baselines. | Bar, Line, Scatter |
| **Grid Controls** | `grid: false` <br> `xGrid: true` / `yGrid: false` | Granularly enable or disable grid lines globally or independently per axis. | Bar, Line, Scatter |
| **Area Shading & Fill Opacity** | `area: true` / `fill: true` <br> `fillOpacity: 0.35` / `transparency: 0.2` | Turn line charts into shaded area charts with customizable fill opacity. | Line |
| **Data Values & Filtering** | `showLabels: true` / `dataLabels: true` <br> `labelFilter: ["Target", "Peak"]` <br> `fontSize: 11` | Display direct numeric values, with support for selective label filtering and custom text size. | Bar, Line, Scatter |
| **Colors & Fills** | `color:` / `fill: "#3b82f6"` <br> `colors: [...]` / `palette: [...]` <br> `colorScheme:` / `scheme: "tableau10"` / `"accent"` / `"set2"` / `"turbo"` | Customize palette with hex colors, array lists, or standard D3 categorical schemes. | All Chart Types |
| **Legend** | `legend: true` / `legend: false` | Toggle legend display (automatically defaults based on series count or categorical/continuous color channel). | All Chart Types |
| **Title, Subtitle & Caption** | `title: "Chart Title"` <br> `subtitle: "Additional context"` <br> `caption: "Figure 1. Source reference"` | Add informative chart titles, subtitles, and explanatory captions. | All Chart Types |
| **Container Width** | `width: 80%` / `width: 600px` / `width: 500` | Sets maximum container width for responsive presentation. | All Chart Types |
| **Scatter Trendlines** | `trending: true` <br> `trendline: { stroke: "#6366f1", strokeWidth: 2, strokeDasharray: "4,4", grouped: true }` | Add linear regression trendlines. Supports log-space regression on logarithmic axes, custom styles, and per-series grouping (`grouped: true` / `bySeries: true`). | Scatter |
| **Scatter Fill & Bubble Size** | `fill: <column>` / `color: <column>` <br> `r: <column|number>` / `size: <column|number>` <br> `colorScale: log` / `colorLog: true` | Map columns to point fill colors (continuous ramp or discrete swatches) and bubble radii for 4D scatter bubble charts. | Scatter |
| **Sankey Links & Flows** | `links:` / `flows:` / `series: [{ data: [...] }]` <br> Tuple: `[source, value, target]` or `[source, target, value]` <br> Object: `{ source, target, value }` | Configure multi-stage flow networks. Nodes are automatically derived or defined via `nodes: [{ name }]`. Supports custom node/link colors via `colorFrom:`, `colorTo:`, `colors:`, `colorMode:`, and custom vertical ordering via `priority:`. | Sankey |
| **Schema Mappings** | `schemas:` / `schema:` / `mapping:` <br> `{ x, y, labels, series, fill, r }` | Map specific table or dataset columns to chart visual dimensions. | All Chart Types |
| **Transposition** | `layout: rows` / `transpose: true` | Transpose markdown table rows into series and column headers into X-axis categories. | Bar, Line |
| **Adaptive Axis Ticks** | `ticks: 6` / `x: { ticks: 8, tickRotate: -45 }` <br> `y: { ticks: 5, tickFormat: "~s" }` <br> `tickRotate: -30` / `tickSpacing: 40` | Automatically adapts tick density, stepping, and rotation to prevent label overlapping on dense or narrow axes. Supports explicit tick counts, custom rotation, spacing, and formatting. | Bar, Line, Scatter |

### Examples

#### 1. Bar Chart (with Markdown Table Binding, Transposition & Mark Line)

````markdown
|  | Test1 | Test2 | Test3 |
| --- | --- | --- | --- |
| Data1 | 1 | 2 | 3.33 |
| Data2 | 3 | 2 | 1 |
| Data3 | 4.5 | 4 | 2 |
^table-metrics

```chart
type: bar
id: table-metrics
layout: rows
x: "Metrics"
y: "Score"
showLabels: true
markLines:
  - y: 3.0
    label: "Target Benchmark"
    style: dashed
    color: "#f59e0b"
width: 80%
```
````

#### 2. Line Chart (with Log Scale, Mark Lines & Custom Palette)

````markdown
```chart
type: line
x: "Quarter"
y: "Revenue ($K)"
yScale: log
showLabels: true
labels: ["Q1", "Q2", "Q3", "Q4"]
colorScheme: "tableau10"
series:
  - title: "2024 Revenue"
    data: [120, 190, 300, 500]
  - title: "2025 Target"
    data: [150, 230, 340, 580]
markLines:
  - y: 250
    label: "Break-even Milestone"
    style: dotted
    color: "#10b981"
width: 550px
```
````

#### 2b. Shaded Area Chart (with Area Fill, Opacity & Selective Labels)

````markdown
```chart
type: line
title: "Monthly Bandwidth Usage"
subtitle: "Network Ingress (GB)"
area: true
fillOpacity: 0.3
beginAtZero: true
dataLabels: ["May", "Jul"]
labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"]
series:
  - title: "Ingress"
    data: [120, 150, 180, 220, 310, 290, 420]
markLines:
  - x: "May"
    label: "Capacity Upgrade"
    style: dashed
    color: "#6366f1"
width: 550px
```
````

#### 3. Pie, Donut & Polar Area Charts

````markdown
```chart
type: donut
title: "Document Categories"
labels: ["Markdown Notes", "Web Clips", "PDF Extracts", "Code Snippets"]
colorScheme: "set2"
series:
  - title: "Share"
    data: [45, 25, 18, 12]
width: 320px
```
````

#### 4. Sankey Flow Diagram (Tuples, Custom Node Colors & Priority)

````markdown
```chart
type: sankey
title: "Energy Source Distribution"
labels: ["Oil", "Natural Gas", "Coal", "Fossil Fuels", "Electricity", "Energy"]
series:
  - data:
      - ["Oil", 15, "Fossil Fuels"]
      - ["Natural Gas", 20, "Fossil Fuels"]
      - ["Coal", 25, "Fossil Fuels"]
      - ["Coal", 25, "Electricity"]
      - ["Fossil Fuels", 60, "Energy"]
      - ["Electricity", 25, "Energy"]
priority:
  Oil: 1
  Natural Gas: 2
  Coal: 3
  Fossil Fuels: 1
  Electricity: 2
  Energy: 1
colorFrom:
  Oil: "black"
  Coal: "gray"
  "Fossil Fuels": "slategray"
  Electricity: "blue"
  Energy: "orange"
colorTo:
  Oil: "black"
  Coal: "gray"
  "Fossil Fuels": "slategray"
  Electricity: "blue"
  Energy: "orange"
width: 650px
```
````

#### 5. Radar Chart

````markdown
```chart
type: radar
title: "Model Comparison"
labels: ["Speed", "Reliability", "Comfort", "Safety", "Efficiency"]
series:
  - title: "Model Alpha"
    data: [80, 90, 70, 85, 60]
  - title: "Model Beta"
    data: [60, 70, 90, 95, 80]
width: 450px
```
````

#### 6. Scatter Chart (Table Binding, Trending Line & 4D Bubble Size)

````markdown
| Location | Density | Population | Land area (km2) | GDP |
| --- | --- | --- | --- | --- |
| Monaco | 19428 | 38857 | 2 | 7180 |
| Singapore | 8290 | 6110200 | 737 | 397000 |
| Gibraltar (UK) | 5800 | 39329 | 6.8 | 2400 |
| Vatican City | 2205 | 882 | 0.44 | 21 |
| Bahrain | 2034 | 1607049 | 790 | 44000 |
| Maldives | 1759 | 527799 | 298 | 5400 |
| Malta | 1686 | 539607 | 320 | 17800 |
| Bangladesh | 1333 | 173562364 | 130170 | 460000 |
^table-countries

```chart
type: scatter
id: table-countries
xScale: log
yScale: log
trending: true
fill: Density
r: GDP
x:
  label: "Land Area (km²)"
y:
  label: "Population"
markLines:
  - y: 10000000
    label: "10M Population Threshold"
    style: dashed
    color: "#f59e0b"
  - x: 1000
    label: "1,000 km² Threshold"
    style: dotted
    color: "#10b981"
width: 700px
```
````

#### 7. External CSV / JSON Dataset Loading

````markdown
```chart
type: bar
data: 5-Data/datasets/sales_summary.csv
x: "Product Category"
y: "Units Sold"
width: 500px
```
````

## Observable Plot

Use `plot` or `observableplot` for rich data visualizations using Observable Plot. You can write JavaScript expressions or declarative configuration options. Markdown tables with IDs (e.g. `^table-countries`) are preprocessed into accessible JavaScript identifiers (`table_countries`):

````markdown
```plot
Plot.plot({
  title: "Population vs. Land Area from Note Table",
  width: 700,
  height: 380,
  grid: true,
  x: { type: "log", label: "Land Area (km²) →" },
  y: { type: "log", label: "↑ Population" },
  marks: [
    Plot.dot(table_countries, {
      x: "Land area (km2)",
      y: "Population",
      fill: "Density",
      r: 6,
      tip: true
    }),
    Plot.text(table_countries, {
      x: "Land area (km2)",
      y: "Population",
      text: "Location",
      dy: -10,
      fontSize: 10
    })
  ]
})
```
````

## Inline Comment

Use `::cmt[]` for interactive comments/popovers.

```markdown
::cmt[💡 example. This is a comment.]
```
