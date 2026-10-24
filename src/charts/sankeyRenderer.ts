import { bindPlotStyleTooltip } from './tooltip';

let sankeyGradCounter = 0;

export function renderSankeyChart(
  yaml: any,
  rawSeries: any[],
  baseColors: string[],
  textColor: string,
  widthStr: string
) {
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.width = '100%';

  const explicitLabels: string[] = Array.isArray(yaml.labels) ? yaml.labels.map(String) : [];

  const explicitLabelsSet = new Set(explicitLabels);
  const normalizedLabelMap = new Map<string, string>();
  for (const l of explicitLabels) {
    const lower = l.toLowerCase();
    if (!normalizedLabelMap.has(lower)) normalizedLabelMap.set(lower, l);
    if (lower.endsWith('s')) {
      const sing = lower.slice(0, -1);
      if (!normalizedLabelMap.has(sing)) normalizedLabelMap.set(sing, l);
    }
    if (lower.endsWith('es')) {
      const sing = lower.slice(0, -2);
      if (!normalizedLabelMap.has(sing)) normalizedLabelMap.set(sing, l);
    }
  }

  const resolveNodeName = (rawName: string): string => {
    if (!rawName) return '';
    const trimmed = String(rawName).trim();

    if (explicitLabelsSet.has(trimmed)) return trimmed;

    const lower = trimmed.toLowerCase();
    const directMatch = normalizedLabelMap.get(lower);
    if (directMatch) return directMatch;

    if (lower.endsWith('s')) {
      const singMatch = normalizedLabelMap.get(lower.slice(0, -1));
      if (singMatch) return singMatch;
    }
    if (lower.endsWith('es')) {
      const esMatch = normalizedLabelMap.get(lower.slice(0, -2));
      if (esMatch) return esMatch;
    }

    return trimmed;
  };

  const sankeyFlows: Array<{ from: string; to: string; flow: number }> = [];
  const rawPriorityMap: Record<string, number> = { ...(yaml.priority ?? {}) };
  const rawColorFromMap: Record<string, string> = { ...(yaml.colorFrom ?? {}) };
  const rawColorToMap: Record<string, string> = { ...(yaml.colorTo ?? {}) };

  rawSeries.forEach((s: any) => {
    if (s.priority && typeof s.priority === 'object') {
      Object.assign(rawPriorityMap, s.priority);
    }
    if (s.colorFrom && typeof s.colorFrom === 'object') {
      Object.assign(rawColorFromMap, s.colorFrom);
    }
    if (s.colorTo && typeof s.colorTo === 'object') {
      Object.assign(rawColorToMap, s.colorTo);
    }

    const sData = s.data ?? [];
    sData.forEach((item: any) => {
      if (Array.isArray(item)) {
        if (item.length >= 3) {
          const val1IsNum = typeof item[1] === 'number' || (!isNaN(Number(item[1])) && isNaN(Number(item[2])));
          if (val1IsNum) {
            const from = resolveNodeName(item[0]);
            const flow = Number(item[1]) || 0;
            const to = resolveNodeName(item[2]);
            sankeyFlows.push({ from, to, flow });
          } else {
            const from = resolveNodeName(item[0]);
            const to = resolveNodeName(item[1]);
            const flow = Number(item[2]) || 0;
            sankeyFlows.push({ from, to, flow });
          }
        }
      } else if (item && typeof item === 'object') {
        const from = resolveNodeName(item.from ?? item.source ?? '');
        const to = resolveNodeName(item.to ?? item.target ?? '');
        const flow = Number(item.flow ?? item.value ?? 0) || 0;
        if (from && to) {
          sankeyFlows.push({ from, to, flow });
        }
      }
    });
  });

  const priorityMap: Record<string, number> = {};
  Object.entries(rawPriorityMap).forEach(([k, v]) => {
    priorityMap[resolveNodeName(k)] = v;
  });

  const colorFromMap: Record<string, string> = {};
  Object.entries(rawColorFromMap).forEach(([k, v]) => {
    colorFromMap[resolveNodeName(k)] = v;
  });

  const colorToMap: Record<string, string> = {};
  Object.entries(rawColorToMap).forEach(([k, v]) => {
    colorToMap[resolveNodeName(k)] = v;
  });

  const nodesSet = new Set<string>();
  explicitLabels.forEach((l) => nodesSet.add(l));
  sankeyFlows.forEach((f) => {
    nodesSet.add(f.from);
    nodesSet.add(f.to);
  });
  const nodes = Array.from(nodesSet).filter(Boolean);

  const nodeDepths: Record<string, number> = {};
  nodes.forEach((n) => (nodeDepths[n] = 0));

  for (let i = 0; i < nodes.length; i++) {
    let updated = false;
    sankeyFlows.forEach((f) => {
      if (nodeDepths[f.to] <= nodeDepths[f.from]) {
        nodeDepths[f.to] = nodeDepths[f.from] + 1;
        updated = true;
      }
    });
    if (!updated) break;
  }

  let maxDepth = 1;
  for (let i = 0; i < nodes.length; i++) {
    const d = nodeDepths[nodes[i]];
    if (d > maxDepth) maxDepth = d;
  }
  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => []);

  nodes.forEach((n) => {
    const depth = nodeDepths[n];
    layers[depth].push(n);
  });

  const nodeIndexMap = new Map<string, number>();
  nodes.forEach((n, idx) => nodeIndexMap.set(n, idx));

  layers.forEach((layer) => {
    layer.sort((a, b) => {
      const prioA = priorityMap[a] ?? Number.MAX_SAFE_INTEGER;
      const prioB = priorityMap[b] ?? Number.MAX_SAFE_INTEGER;
      if (prioA !== prioB) return prioA - prioB;
      return (nodeIndexMap.get(a) ?? 0) - (nodeIndexMap.get(b) ?? 0);
    });
  });

  const nodeOutFlow: Record<string, number> = {};
  const nodeInFlow: Record<string, number> = {};
  nodes.forEach((n) => {
    nodeOutFlow[n] = 0;
    nodeInFlow[n] = 0;
  });

  sankeyFlows.forEach((f) => {
    nodeOutFlow[f.from] += f.flow;
    nodeInFlow[f.to] += f.flow;
  });

  const nodeValues: Record<string, number> = {};
  nodes.forEach((n) => {
    nodeValues[n] = Math.max(nodeOutFlow[n], nodeInFlow[n], 1);
  });

  const svgNs = 'http://www.w3.org/2000/svg';
  const width = 700;
  const height = 400;
  const padX = 100;
  const padY = 30;
  const nodeWidth = 16;
  const nodeMarginY = 24;

  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;

  let scale = Number.POSITIVE_INFINITY;
  for (let lIdx = 0; lIdx < layers.length; lIdx++) {
    const layer = layers[lIdx];
    if (layer.length === 0) continue;
    let totalVal = 0;
    for (let nIdx = 0; nIdx < layer.length; nIdx++) {
      totalVal += nodeValues[layer[nIdx]];
    }
    const availH = usableHeight - (layer.length - 1) * nodeMarginY;
    const layerScale = availH / Math.max(totalVal, 1);
    if (layerScale < scale) scale = layerScale;
  }
  if (!isFinite(scale) || scale <= 0) scale = 1;

  const nodeCoords: Record<string, { x: number; y: number; height: number }> = {};
  const layerXStep = maxDepth > 0 ? usableWidth / maxDepth : 0;

  for (let depthIdx = 0; depthIdx < layers.length; depthIdx++) {
    const layer = layers[depthIdx];
    if (layer.length === 0) continue;

    const x = padX + depthIdx * layerXStep;
    let sumHeights = 0;
    for (let nIdx = 0; nIdx < layer.length; nIdx++) {
      sumHeights += Math.max(12, nodeValues[layer[nIdx]] * scale);
    }

    const totalLayerH = sumHeights + (layer.length - 1) * nodeMarginY;
    let currY = padY + (usableHeight - totalLayerH) / 2;

    for (let nIdx = 0; nIdx < layer.length; nIdx++) {
      const n = layer[nIdx];
      const h = Math.max(12, nodeValues[n] * scale);
      nodeCoords[n] = { x, y: currY, height: h };
      currY += h + nodeMarginY;
    }
  }

  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', `${height}`);

  const defs = document.createElementNS(svgNs, 'defs');
  svg.appendChild(defs);

  const currentOutY: Record<string, number> = {};
  const currentInY: Record<string, number> = {};
  nodes.forEach((n) => {
    const coord = nodeCoords[n];
    if (!coord) return;
    const totalOutH = nodeOutFlow[n] * scale;
    const totalInH = nodeInFlow[n] * scale;
    currentOutY[n] = coord.y + (coord.height - totalOutH) / 2;
    currentInY[n] = coord.y + (coord.height - totalInH) / 2;
  });

  const gradientPrefix = `sankey-grad-${++sankeyGradCounter}`;

  const sortedFlows = [...sankeyFlows].sort((a, b) => {
    const depthAFrom = nodeDepths[a.from];
    const depthBFrom = nodeDepths[b.from];
    if (depthAFrom !== depthBFrom) return depthAFrom - depthBFrom;

    const yAFrom = nodeCoords[a.from]?.y ?? 0;
    const yBFrom = nodeCoords[b.from]?.y ?? 0;
    if (yAFrom !== yBFrom) return yAFrom - yBFrom;

    const yATo = nodeCoords[a.to]?.y ?? 0;
    const yBTo = nodeCoords[b.to]?.y ?? 0;
    return yATo - yBTo;
  });

  sortedFlows.forEach((flow, idx) => {
    const srcCoord = nodeCoords[flow.from];
    const tgtCoord = nodeCoords[flow.to];
    if (!srcCoord || !tgtCoord) return;

    const linkStrokeWidth = Math.max(2, flow.flow * scale);

    const srcX = srcCoord.x + nodeWidth;
    const srcY = currentOutY[flow.from] + linkStrokeWidth / 2;
    currentOutY[flow.from] += linkStrokeWidth;

    const tgtX = tgtCoord.x;
    const tgtY = currentInY[flow.to] + linkStrokeWidth / 2;
    currentInY[flow.to] += linkStrokeWidth;

    const cFrom = colorFromMap[flow.from];
    const cTo = colorToMap[flow.to];
    let strokeColor = baseColors[idx % baseColors.length];

    if (cFrom && cTo) {
      const gradId = `${gradientPrefix}-${idx}`;
      const grad = document.createElementNS(svgNs, 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', `${srcX}`);
      grad.setAttribute('y1', `${srcY}`);
      grad.setAttribute('x2', `${tgtX}`);
      grad.setAttribute('y2', `${tgtY}`);

      const stop1 = document.createElementNS(svgNs, 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', cFrom);

      const stop2 = document.createElementNS(svgNs, 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', cTo);

      grad.appendChild(stop1);
      grad.appendChild(stop2);
      defs.appendChild(grad);

      strokeColor = `url(#${gradId})`;
    } else if (cFrom) {
      strokeColor = cFrom;
    } else if (cTo) {
      strokeColor = cTo;
    }

    const dx = (tgtX - srcX) * 0.5;
    const dStr = `M ${srcX} ${srcY} C ${srcX + dx} ${srcY}, ${tgtX - dx} ${tgtY}, ${tgtX} ${tgtY}`;

    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', dStr);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', `${linkStrokeWidth}`);
    path.setAttribute('stroke-opacity', '0.5');
    path.style.cursor = 'pointer';
    path.style.transition = 'stroke-opacity 0.2s';
    path.addEventListener('mouseenter', () => path.setAttribute('stroke-opacity', '0.85'));
    path.addEventListener('mouseleave', () => path.setAttribute('stroke-opacity', '0.5'));

    bindPlotStyleTooltip(path, container, () => `${flow.from} ➔ ${flow.to}\nFlow: ${flow.flow}`);
    svg.appendChild(path);
  });

  nodes.forEach((n, idx) => {
    const coord = nodeCoords[n];
    if (!coord) return;

    const nodeColor = colorFromMap[n] || colorToMap[n] || baseColors[idx % baseColors.length];

    const rect = document.createElementNS(svgNs, 'rect');
    rect.setAttribute('x', `${coord.x}`);
    rect.setAttribute('y', `${coord.y}`);
    rect.setAttribute('width', `${nodeWidth}`);
    rect.setAttribute('height', `${coord.height}`);
    rect.setAttribute('fill', nodeColor);
    rect.setAttribute('rx', '2');
    rect.style.cursor = 'pointer';

    bindPlotStyleTooltip(rect, container, () => `${n}\nTotal Flow: ${nodeValues[n]}`);
    svg.appendChild(rect);

    const text = document.createElementNS(svgNs, 'text');
    const depth = nodeDepths[n];

    if (depth === 0) {
      text.setAttribute('x', `${coord.x - 8}`);
      text.setAttribute('text-anchor', 'end');
    } else {
      text.setAttribute('x', `${coord.x + nodeWidth + 8}`);
      text.setAttribute('text-anchor', 'start');
    }

    text.setAttribute('y', `${coord.y + coord.height / 2}`);
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', textColor);
    text.setAttribute('font-size', '12px');
    text.setAttribute('font-weight', '500');
    text.textContent = n;
    svg.appendChild(text);
  });

  container.appendChild(svg);
  return { plotOptions: null, customElement: container, width: widthStr };
}
