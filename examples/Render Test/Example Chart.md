---
source: ""
description: Interactive examples and guidelines for Chart.js and Observable Plot data visualizations in InsightPage.
title: Example Chart
tags:
  - example
  - chart
  - plot
  - visualization
createdat: 1794277233929
lastupdatedat: 1794277233929
pinned: false
---

# Example Chart

InsightPage supports rich interactive charts and data visualizations using **Chart.js-style YAML syntaxes** (`chart`) and **Observable Plot** (`plot` / `observableplot`).

---

## Chart.js Style YAML Charts

Render interactive charts using unified YAML configurations across **Bar**, **Line**, **Scatter**, **Pie / Donut / PolarArea**, **Radar**, and **Sankey** charts.

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
| **Adaptive Axis Ticks** | `ticks: 6` / `x: { ticks: 8, tickRotate: -45 }` <br> `y: { ticks: 5, tickFormat: "~s" }` <br> `tickRotate: -30` / `tickSpacing: 40` | Automatically adapts tick density, stepping, and rotation to prevent label overlapping on dense or narrow axes. Supports explicit tick counts, custom rotation, spacing, and formatting. | Bar, Line, Scatter |

---

### 1. Bar Chart Example (with Mark Lines, Axis Labels & Value Labels)

|  | Test1 | Test2 | Test3 |
| --- | --- | --- | --- |
| Data1 | 1 | 2 | 3.33 |
| Data2 | 3 | 2 | 1 |
| Data3 | 4.5 | 4 | 2 |
^table

```chart
type: bar
id: table
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

### 2. Line Chart Example (with Mark Lines, Log Scale & Custom Palette)

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

### 2b. Shaded Area Chart Example (with Area Fill, Opacity, BeginAtZero & Selective Labels)

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

### 3. Pie, Donut & Polar Area Chart Examples

#### Standard Pie Chart
```chart
type: pie
labels: ["Markdown Notes", "Web Clips", "PDF Extracts", "Code Snippets"]
colorScheme: "tableau10"
series:
  - title: "Category Share"
    data: [45, 25, 18, 12]
width: 320px
```

#### Donut Chart
```chart
type: donut
labels: ["Markdown Notes", "Web Clips", "PDF Extracts", "Code Snippets"]
colorScheme: "set2"
series:
  - title: "Category Share"
    data: [45, 25, 18, 12]
width: 320px
```

#### Polar Area Chart
```chart
type: polararea
labels: ["Research", "Engineering", "Design", "Testing", "Documentation"]
colorScheme: "accent"
series:
  - title: "Hours Allocated"
    data: [40, 55, 30, 25, 20]
width: 340px
```

### 4. Sankey Flow Diagram Example

InsightPage supports multiple Sankey data formats, including 3-element tuple arrays `[source, value, target]` and object flows `{ from, to, flow }`. You can customize node positioning with `priority:` and link/node colors with `colorFrom:` and `colorTo:`:

```chart
type: sankey
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

### 5. Radar Chart Example

Radar charts visualize multidimensional attributes across concentric web rings:

```chart
type: radar
labels: ["Speed", "Reliability", "Comfort", "Safety", "Efficiency"]
series:
  - title: "Model Alpha"
    data: [80, 90, 70, 85, 60]
  - title: "Model Beta"
    data: [60, 70, 90, 95, 80]
width: 450px
```

### 6. Scatter Chart Example

Render scatter point plots with trending regression lines, custom-styled mark lines, legends, and linear or logarithmic axes:

```chart
type: scatter
trending: true
markLines:
  - y: 80
    label: "Target Score"
    style: dashed
    color: "#10b981"
  - x: 40
    label: "Midpoint Threshold"
    style: dotted
    color: "#f59e0b"
x:
  label: "Study Hours"
y:
  label: "Exam Score"
series:
  - title: "Cohort A"
    data:
      - [10, 35]
      - [18, 48]
      - [25, 62]
      - [32, 70]
      - [45, 88]
      - [50, 95]
  - title: "Cohort B"
    data:
      - [12, 28]
      - [20, 42]
      - [28, 55]
      - [38, 74]
      - [48, 82]
      - [55, 91]
width: 600px
```

### 7. External CSV / JSON Dataset Loading

InsightPage Chart DSL can load external dataset files directly without complex data-processing grammar, just like Timeline charts:

```chart
type: scatter
data: 5-Data/datasets/countries.csv
fill: Density
xScale: log
yScale: log
labels: [Singapore]
r: 5 
x:
  label: "Land Area (km²)"
y:
  label: "Population"
trending: true
```

---

## Observable Plot Data Visualizations

Render rich data visualizations using [Observable Plot](https://github.com/observablehq/plot) (`plot` or `observableplot`). For further information: https://observablehq.github.io/plot/features/plots

````markdown
```plot
Plot.plot({
  title: "For charts, an informative title",
  subtitle: "Subtitle to follow with additional context",
  caption: "Figure 1. A chart with a title, subtitle, and caption.",
  marks: [
    Plot.frame(),
    Plot.text(["Titles, subtitles, captions, and annotations assist interpretation by telling the reader what’s interesting. Don’t make the reader work to find what you already know."], {lineWidth: 30, frameAnchor: "middle"})
  ]
})
```
````

```plot
Plot.plot({
  title: "For charts, an informative title",
  subtitle: "Subtitle to follow with additional context",
  caption: "Figure 1. A chart with a title, subtitle, and caption.",
  marks: [
    Plot.frame(),
    Plot.text(["Titles, subtitles, captions, and annotations assist interpretation by telling the reader what’s interesting. Don’t make the reader work to find what you already know."], {lineWidth: 30, frameAnchor: "middle"})
  ]
})
```

### 1. Reading Time Frequency Histogram

```plot
Plot.rectY(
  [2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 9, 10, 12, 15],
  Plot.binX(
    { y: "count" },
    { x: (d) => d, fill: "#3b82f6", tip: true, rx: 3 }
  )
)
```

### 2. 2026 Super El Niño (Godzilla El Niño)

Totally NOAA style! From data processing to the example, you can find the original one from https://observablehq.com/@fil/godzilla-el-nino

```plot
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
  title: "Godzilla El Niño",
  subtitle: "The current Niño 3.4 sea-surface temperature anomaly based on the 1991-2020 baseline",
  caption: "Figure 1. A good example of how Plot works.",
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
      filter: (d) => d.name === "Preliminary",
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
        d === 0 ? "mean" : d === 1 ? `σ` : d === -1 ? `-σ` : `${d}σ`,
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
          temperature: (d) => `${d}°C`,
          anomaly: (d) =>
            d < 0 ? `${d.toFixed(2)}°C` : `+${d.toFixed(2)}°C`,
          deviation: (d) =>
            d < 0 ? `${d.toFixed(2)}σ` : `+${d.toFixed(2)}σ`,
          x: false,
          y: false
        }
      })
    )
  ]
})
```

### 3. Rendering from Markdown Tables in the Same Note

You can use any Markdown table in the same note as the data source for Observable Plot or Chart DSL! Simply refer to `id: #my-table-id` or `id: my-table-id`:

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

#### Using Chart DSL (`chart`)

You can render a scatter chart referencing the table using our YAML-based Chart DSL:

```chart
type: scatter
id: table-countries 
xScale: log 
yScale: log 
trending: true
fill: GDP
r: Density
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

##### Table-to-Data Column Resolution

When referencing a table, columns are resolved automatically:
1. **X and Y Dimensions**: Matched first by matching your `x` and `y` labels, keys, or columns against table headers (with fuzzy matching for superscripts such as `km²` vs `km2`).
2. **Color Legend & Fill**: Chosen from the remaining numeric columns in table order (`numericCols.find((k) => k !== xCol && k !== yCol)`). In the table above, `Density` appears before `GDP`, so points are colored by `Density` and the legend shows `Density`.
3. **Custom Fill Column**: You can explicitly specify `fill:` or `color:` to pick any column (e.g. `fill: GDP`) for point colors and legend.
4. **4D Bubble Chart (Size Mapping)**: Map another numeric dimension to point radius using `r:` or `size:` (e.g. `r: GDP` or `r: Density`):

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

#### Using Observable Plot (`plot`)

In Observable Plot code blocks, tables with hyphenated IDs (e.g. `table-countries` or `^table-countries`) are preprocessed into accessible JavaScript identifiers (`table_countries` or `table-countries` directly):

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
      r: "GDP",
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
