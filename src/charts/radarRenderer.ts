import { bindPlotStyleTooltip } from './tooltip';
import type { ChartDataPoint } from './pieRenderer';

export function renderRadarChart(
  yaml: any,
  dataPoints: ChartDataPoint[],
  labels: any[],
  baseColors: string[],
  innerColors: string[],
  gridColor: string,
  textColor: string,
  widthStr: string,
  getD3: () => typeof import('d3')
) {
  const type = String(yaml.type ?? 'bar').trim().toLowerCase();
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.width = '100%';

  const svgNs = 'http://www.w3.org/2000/svg';
  const size = 320;
  const center = size / 2;
  const maxRadius = size / 2 - 40;

  const categoryLabels = labels.length ? labels : Array.from(new Set(dataPoints.map((d) => d.x)));
  const numCategories = Math.max(1, categoryLabels.length);

  // Performance optimization: Single-pass linear evaluation of min and max Y domain values.
  let minYVal = 0;
  let maxYVal = yaml.rMax ?? 1;
  if (dataPoints.length > 0) {
    if (!yaml.beginAtZero) minYVal = Math.min(0, dataPoints[0].y);
    for (let idx = 0; idx < dataPoints.length; idx++) {
      const y = dataPoints[idx].y;
      if (y > maxYVal) maxYVal = y;
      if (!yaml.beginAtZero && y < minYVal) minYVal = y;
    }
  }
  maxYVal = Math.max(maxYVal, 1);
  const effectiveMaxY = maxYVal === minYVal ? minYVal + 1 : maxYVal;

  const d3Inst = getD3();
  const rScale = d3Inst.scaleLinear().domain([minYVal, effectiveMaxY]).range([0, maxRadius]);

  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size}`);
  svg.style.maxWidth = '100%';

  const g = document.createElementNS(svgNs, 'g');
  g.setAttribute('transform', `translate(${center}, ${center})`);

  // Draw Grid Rings
  const numRings = 4;
  for (let rIdx = 1; rIdx <= numRings; rIdx++) {
    const ringRadius = (maxRadius / numRings) * rIdx;
    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('r', `${ringRadius}`);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', gridColor);
    circle.setAttribute('stroke-dasharray', '2 2');
    g.appendChild(circle);
  }

  // Draw Axis Lines and Labels
  categoryLabels.forEach((label, idx) => {
    const angle = (2 * Math.PI * idx) / numCategories - Math.PI / 2;
    const x2 = maxRadius * Math.cos(angle);
    const y2 = maxRadius * Math.sin(angle);

    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', `${x2}`);
    line.setAttribute('y2', `${y2}`);
    line.setAttribute('stroke', gridColor);
    g.appendChild(line);

    const labelX = (maxRadius + 18) * Math.cos(angle);
    const labelY = (maxRadius + 18) * Math.sin(angle);
    const text = document.createElementNS(svgNs, 'text');
    text.setAttribute('x', `${labelX}`);
    text.setAttribute('y', `${labelY}`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', textColor);
    text.setAttribute('font-size', '10px');
    text.textContent = String(label);
    g.appendChild(text);
  });

  // Group series
  const seriesMap = new Map<string, typeof dataPoints>();
  dataPoints.forEach((pt) => {
    if (!seriesMap.has(pt.series)) seriesMap.set(pt.series, []);
    seriesMap.get(pt.series)!.push(pt);
  });

  let sIdx = 0;
  seriesMap.forEach((pts, seriesName) => {
    const color = baseColors[sIdx % baseColors.length];
    const innerColor = innerColors[sIdx % innerColors.length];

    const ptMap = new Map<string, (typeof pts)[0]>();
    pts.forEach((pt) => ptMap.set(String(pt.x), pt));

    if (type === 'radar') {
      const polyPoints: Array<[number, number]> = categoryLabels.map((catLabel, cIdx) => {
        const angle = (2 * Math.PI * cIdx) / numCategories - Math.PI / 2;
        const pt = ptMap.get(String(catLabel)) || { y: 0 };
        const r = rScale(pt.y);
        return [r * Math.cos(angle), r * Math.sin(angle)];
      });

      const pathD = polyPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`)
        .join(' ') + ' Z';

      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('fill', innerColor);
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '2');
      path.style.cursor = 'pointer';
      path.style.transition = 'opacity 0.2s';
      path.addEventListener('mouseenter', () => (path.style.opacity = '0.7'));
      path.addEventListener('mouseleave', () => (path.style.opacity = '1'));

      const tooltipText = `${seriesName}\n${pts.map((p) => `${p.x}: ${p.y}`).join('\n')}`;
      bindPlotStyleTooltip(path, container, () => tooltipText);

      g.appendChild(path);

      // Render interactive dots on vertices for specific point tooltips
      polyPoints.forEach((p, cIdx) => {
        const catLabel = categoryLabels[cIdx];
        const pt = ptMap.get(String(catLabel)) || { y: 0 };
        const dot = document.createElementNS(svgNs, 'circle');
        dot.setAttribute('cx', `${p[0]}`);
        dot.setAttribute('cy', `${p[1]}`);
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', color);
        dot.style.cursor = 'pointer';
        bindPlotStyleTooltip(dot, container, () => `${seriesName}\n${catLabel}: ${pt.y}`);
        g.appendChild(dot);
      });
    } else {
      // Polar Area
      categoryLabels.forEach((catLabel, cIdx) => {
        const startAngle = (2 * Math.PI * cIdx) / numCategories - Math.PI / 2;
        const endAngle = (2 * Math.PI * (cIdx + 1)) / numCategories - Math.PI / 2;
        const pt = ptMap.get(String(catLabel)) || { y: 0 };
        const r = rScale(pt.y);

        const arcGen = d3Inst
          .arc<any>()
          .innerRadius(0)
          .outerRadius(r)
          .startAngle(startAngle + Math.PI / 2)
          .endAngle(endAngle + Math.PI / 2);

        const pathD = arcGen({} as any);
        if (pathD) {
          const path = document.createElementNS(svgNs, 'path');
          path.setAttribute('d', pathD);
          path.setAttribute('fill', innerColor);
          path.setAttribute('stroke', color);
          path.setAttribute('stroke-width', '1');
          path.style.cursor = 'pointer';
          path.style.transition = 'opacity 0.2s';
          path.addEventListener('mouseenter', () => (path.style.opacity = '0.7'));
          path.addEventListener('mouseleave', () => (path.style.opacity = '1'));

          bindPlotStyleTooltip(path, container, () => `${seriesName}\n${catLabel}: ${pt.y}`);
          g.appendChild(path);
        }
      });
    }
    sIdx++;
  });

  svg.appendChild(g);
  container.appendChild(svg);

  // Legend
  if (yaml.legend !== false && seriesMap.size > 0) {
    const legendDiv = document.createElement('div');
    legendDiv.style.display = 'flex';
    legendDiv.style.flexWrap = 'wrap';
    legendDiv.style.justifyContent = 'center';
    legendDiv.style.gap = '12px';
    legendDiv.style.marginTop = '8px';
    legendDiv.style.fontSize = '12px';
    legendDiv.style.color = textColor;

    let lIdx = 0;
    seriesMap.forEach((_, name) => {
      const itemDiv = document.createElement('div');
      itemDiv.style.display = 'flex';
      itemDiv.style.alignItems = 'center';
      itemDiv.style.gap = '4px';

      const swatch = document.createElement('span');
      swatch.style.width = '12px';
      swatch.style.height = '12px';
      swatch.style.borderRadius = '2px';
      swatch.style.backgroundColor = baseColors[lIdx % baseColors.length];

      const textSpan = document.createElement('span');
      textSpan.textContent = name;

      itemDiv.appendChild(swatch);
      itemDiv.appendChild(textSpan);
      legendDiv.appendChild(itemDiv);
      lIdx++;
    });
    container.appendChild(legendDiv);
  }

  return { plotOptions: null, customElement: container, width: widthStr };
}
