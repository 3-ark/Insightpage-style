const SVG_NS = 'http://www.w3.org/2000/svg';

export function createTlSvgIcon(
  attrs: Record<string, string>,
  children: Array<{ tag: string; attrs: Record<string, string> }>
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  for (const [k, v] of Object.entries(attrs)) {
    svg.setAttribute(k, v);
  }
  for (const child of children) {
    const el = document.createElementNS(SVG_NS, child.tag);
    for (const [k, v] of Object.entries(child.attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

export function createTlCopyIcon(): SVGSVGElement {
  return createTlSvgIcon(
    { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [
      { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
      { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } },
    ]
  );
}

export function createTlCheckIcon(): SVGSVGElement {
  return createTlSvgIcon(
    { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [{ tag: 'polyline', attrs: { points: '20 6 9 17 4 12' } }]
  );
}

export function createTlDownloadIcon(): SVGSVGElement {
  return createTlSvgIcon(
    { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [
      { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
      { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
      { tag: 'line', attrs: { x1: '12', x2: '12', y1: '15', y2: '3' } },
    ]
  );
}

export function setTlButtonIcon(btn: HTMLElement, iconEl: Node): void {
  btn.replaceChildren(iconEl);
}
