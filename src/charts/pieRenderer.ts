import { bindPlotStyleTooltip } from './tooltip';

export interface ChartDataPoint {
  x: any;
  y: number;
  series: string;
  index: number;
  seriesIndex: number;
}

export function renderPieChart(
  yaml: any,
  dataPoints: ChartDataPoint[],
  labels: any[],
  baseColors: string[],
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
  const size = 300;
  const radius = size / 2 - 20;
  const isDoughnut = type === 'doughnut' || type === 'donut';

  const pieData = dataPoints.length
    ? dataPoints
    : labels.map((l, i) => ({
        x: l,
        y: 1,
        series: 'Series 1',
        index: i,
        seriesIndex: 0,
      }));

  const d3Inst = getD3();
  const pie = d3Inst.pie<ChartDataPoint>()
    .value((d) => Math.max(0, d.y))
    .sort(null);

  const arcs = pie(pieData as any);
  const arcGen = d3Inst
    .arc<any>()
    .innerRadius(isDoughnut ? radius * 0.5 : 0)
    .outerRadius(radius);

  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size}`);
  svg.style.maxWidth = '100%';

  const g = document.createElementNS(svgNs, 'g');
  g.setAttribute('transform', `translate(${size / 2}, ${size / 2})`);

  arcs.forEach((slice, idx) => {
    const path = document.createElementNS(svgNs, 'path');
    const dStr = arcGen(slice);
    if (dStr) path.setAttribute('d', dStr);
    const color = baseColors[idx % baseColors.length];
    path.setAttribute('fill', color);
    path.setAttribute('stroke', gridColor);
    path.setAttribute('stroke-width', '1');
    path.style.cursor = 'pointer';
    path.style.transition = 'opacity 0.2s, transform 0.2s';

    path.addEventListener('mouseenter', () => {
      path.style.opacity = '0.8';
    });
    path.addEventListener('mouseleave', () => {
      path.style.opacity = '1';
    });

    const tooltipText = slice.data.series && slice.data.series !== 'Series 1'
      ? `${slice.data.series}\n${slice.data.x}: ${slice.data.y}`
      : `${slice.data.x}: ${slice.data.y}`;

    bindPlotStyleTooltip(path, container, () => tooltipText);
    g.appendChild(path);
  });

  svg.appendChild(g);
  container.appendChild(svg);

  // Legend
  if (yaml.legend !== false) {
    const legendDiv = document.createElement('div');
    legendDiv.style.display = 'flex';
    legendDiv.style.flexWrap = 'wrap';
    legendDiv.style.justifyContent = 'center';
    legendDiv.style.gap = '12px';
    legendDiv.style.marginTop = '8px';
    legendDiv.style.fontSize = '12px';
    legendDiv.style.color = textColor;

    const legendItems = dataPoints.length ? dataPoints : labels.map((l) => ({ x: l, series: '' }));
    const hasMultipleSeries = dataPoints.some((d) => d.seriesIndex > 0);

    legendItems.forEach((item, idx) => {
      const itemDiv = document.createElement('div');
      itemDiv.style.display = 'flex';
      itemDiv.style.alignItems = 'center';
      itemDiv.style.gap = '4px';

      const swatch = document.createElement('span');
      swatch.style.width = '12px';
      swatch.style.height = '12px';
      swatch.style.borderRadius = '2px';
      swatch.style.backgroundColor = baseColors[idx % baseColors.length];

      const textSpan = document.createElement('span');
      textSpan.textContent = hasMultipleSeries && item.series ? `${item.x} (${item.series})` : String(item.x);

      itemDiv.appendChild(swatch);
      itemDiv.appendChild(textSpan);
      legendDiv.appendChild(itemDiv);
    });
    container.appendChild(legendDiv);
  }

  return { plotOptions: null, customElement: container, width: widthStr };
}
