---
source: ""
description: Interactive examples and guidelines for Chart.js and Observable Plot data visualizations in InsightPage.
title: Example Chart
tags:
  - example
  - chart
  - plot
  - visualization
createdat: 1790759208076
lastupdatedat: 1792396384299
pinned: false
fileextension: .md
fileExtension: .md
---

InsightPage supports rich interactive charts and data visualizations using **Chart.js-style YAML syntaxes** (`chart`) and **Observable Plot** (`plot`).

---

## Chart.js Style YAML Charts

Render interactive charts using simple YAML configuration.

### 1. Bar Chart Example

```chart
type: bar
labels: ["Jan", "Feb", "Mar", "Apr"]
series:
  - title: "Notes Created"
    data: [12, 25, 18, 30]
width: 500px
```

### 2. Line Chart Example

```chart
type: line
labels: ["Q1", "Q2", "Q3", "Q4"]
series:
  - title: "2024 Revenue"
    data: [120, 190, 300, 500]
  - title: "2025 Target"
    data: [150, 230, 340, 580]
```

### 3. Pie & Donut Chart Example

```chart
type: pie
labels: ["Markdown Notes", "Web Clips", "PDF Extracts", "Code Snippets"]
series:
  - title: "Category Share"
    data: [45, 25, 18, 12]
```

```chart
type: donut
labels: ["Markdown Notes", "Web Clips", "PDF Extracts", "Code Snippets"]
series:
  - title: "Category Share"
    data: [45, 25, 18, 12]
width: 320px
```

### 4. Sankey Example

```chart
type: sankey
labels: [Oil, "Natural Gas", Coal, "Fossil Fuel", Electricity, Energy]
series:
		- data:
			- [Oil, 15, "Fossil Fuels"]
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
```

### 5. Radar Chart Example

```chart
type: radar
labels: ["Speed", "Reliability", "Comfort", "Safety", "Efficiency"]
series:
  - title: "Model Alpha"
    data: [80, 90, 70, 85, 60]
  - title: "Model Beta"
    data: [60, 70, 90, 95, 80]
```

### 6. chart for a table

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
width: 80%
beginAtZero: true
```

---

## Observable Plot Data Visualizations

Render rich data visualizations using [Observable Plot](https://github.com/observablehq/plot) (`plot`). For further infomation: https://observablehq.github.io/plot/features/plots

```
Plot.plot({
  title: "For charts, an informative title",
  subtitle: "Subtitle to follow with additional context",
  caption: "Figure 1. A chart with a title, subtitle, and caption.",
  marks: [
    Plot.frame(),
    Plot.text(["Titles, subtitles, captions, and annotations assist inter­pretation by telling the reader what’s interesting. Don’t make the reader work to find what you already know."], {lineWidth: 30, frameAnchor: "middle"})
  ]
})
```

```plot
Plot.plot({
  title: "For charts, an informative title",
  subtitle: "Subtitle to follow with additional context",
  caption: "Figure 1. A chart with a title, subtitle, and caption.",
  marks: [
    Plot.frame(),
    Plot.text(["Titles, subtitles, captions, and annotations assist inter­pretation by telling the reader what’s interesting. Don’t make the reader work to find what you already know."], {lineWidth: 30, frameAnchor: "middle"})
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

### 2. 2026 Super El Nino (Godzilla El Nino)

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