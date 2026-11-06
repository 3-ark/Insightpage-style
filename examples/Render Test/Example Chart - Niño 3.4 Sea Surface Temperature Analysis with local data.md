---
title: "[Local DATA] Niño 3.4 Sea Surface Temperature Analysis"
createdat: 1789451569115
lastupdatedat: 1789610298594
tags: []
source: ""
description: Complex Observable HQ style showcase examples from local data
pinned: false
---

> [!info] 2026 Super El Nino
> Totally NOAA style! From data processing to the example, you can find the original one from https://observablehq.com/@fil/godzilla-el-nino 

## Plot with Distribution Bands

```plot
const sst = await fetch("5-Data/datasets/oisst2.1_nino3.4_sst_day.json")
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
## Data Process
### Sea Surface Temperature

To render it, change the `observable-plot` to `plot`

```observable-plot
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
    grid: true,
    ticks: 12,
    nice: true
  },
  color: {
    scheme: "blues",
    range: [0.2, 1],
    unknown: "red"
  },
  marks: [
    Plot.line(data, {
      filter: (d) => d.name !== "Preliminary",
      x: (d) => date(d.day),
      y: "temperature",
      z: "name",
      stroke: (d) => (d.year === 2026 ? NaN : d.year),
      strokeWidth: (d) => (d.year === 2026 ? 2 : 0.5)
    }),
    Plot.line(means, {
      x: (_, i) => date(i),
      y: Plot.identity,
      stroke: "orange",
      strokeWidth: 2
    }),
    Plot.line(data, {
      filter: (d) => d.name === "Preliminary",
      x: (d) => date(d.day),
      y: "temperature",
      stroke: NaN,
      strokeDasharray: [2, 4],
      strokeWidth: 2
    }),

    Plot.text(["2026"], {
      x: date(point2026.day),
      y: point2026.temperature,
      dx: 4,
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
          anomaly: false,
          deviation: false,
          x: false,
          y: false
        }
      })
    )
  ]
})
```

### Anomaly

```observable-plot
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
    grid: true,
    ticks: 12,
    nice: true
  },
  color: {
    scheme: "blues",
    range: [0.2, 1],
    unknown: "red"
  },
  marks: [
    Plot.line(data, {
      filter: (d) => d.name !== "Preliminary",
      x: (d) => date(d.day),
      y: "anomaly",
      z: "name",
      stroke: (d) => (d.year === 2026 ? NaN : d.year),
      strokeWidth: (d) => (d.year === 2026 ? 2 : 0.5)
    }),
    Plot.line(means, {
      x: (_, i) => date(i),
      y: 0,
      stroke: "orange",
      strokeWidth: 2
    }),
    Plot.line(data, {
      filter: (d) => d.name === "Preliminary",
      x: (d) => date(d.day),
      y: "anomaly",
      stroke: NaN,
      strokeDasharray: [2, 4],
      strokeWidth: 2
    }),
    Plot.text(["2026"], {
      x: date(data.at(-1).day),
      y: data.at(-1).anomaly,
      dx: 4,
      fill: "red",
      stroke: "white",
      fontWeight: "bold",
      textAnchor: "start"
    }),
    Plot.tip(
      data,
      Plot.pointer({
        x: (d) => date(d.day),
        y: "anomaly",
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
          anomaly: (d) => (d < 0 ? `${d.toFixed(2)}°C` : `+${d.toFixed(2)}°C`),
          deviation: false,
          x: false,
          y: false
        }
      })
    )
  ]
})
```

### Deviation (σ)

```observable-plot
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
    grid: true,
    ticks: 12,
    nice: true
  },
  color: {
    scheme: "blues",
    range: [0.2, 1],
    unknown: "red"
  },
  marks: [
    Plot.line(data, {
      filter: (d) => d.name !== "Preliminary",
      x: (d) => date(d.day),
      y: "deviation",
      z: "name",
      stroke: (d) => (d.year === 2026 ? NaN : d.year),
      strokeWidth: (d) => (d.year === 2026 ? 2 : 0.5)
    }),
    Plot.line(means, {
      x: (_, i) => date(i),
      y: 0,
      stroke: "orange",
      strokeWidth: 2
    }),
    Plot.line(data, {
      filter: (d) => d.name === "Preliminary",
      x: (d) => date(d.day),
      y: "deviation",
      stroke: NaN,
      strokeDasharray: [2, 4],
      strokeWidth: 2
    }),
    Plot.text(["2026"], {
      x: date(data.at(-1).day),
      y: data.at(-1).deviation,
      dx: 4,
      fill: "red",
      stroke: "white",
      fontWeight: "bold",
      textAnchor: "start"
    }),
    Plot.tip(
      data,
      Plot.pointer({
        x: (d) => date(d.day),
        y: "deviation",
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
          anomaly: (d) => (d < 0 ? `${d.toFixed(2)}°C` : `+${d.toFixed(2)}°C`),
          deviation: (d) => (d < 0 ? `${d.toFixed(2)}σ` : `+${d.toFixed(2)}σ`),
          x: false,
          y: false
        }
      })
    )
  ]
})
```

This is done.