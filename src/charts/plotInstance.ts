let _Plot: typeof import('@observablehq/plot') | null = null;
let _d3: typeof import('d3') | null = null;

const VALID_FRAME_ANCHORS = new Set([
  'middle',
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
]);

const FRAME_ANCHOR_MARKS = new Set([
  'text',
  'textX',
  'textY',
  'dot',
  'dotX',
  'dotY',
  'tip',
  'vector',
  'image',
]);

/**
 * Wraps an Observable Plot instance so marks supporting frameAnchor can accept
 * frameAnchor (as well as dx and dy) as channel accessors (strings or functions)
 * across collections of data items, automatically grouping and emitting composite
 * marks without throwing "invalid frameAnchor" errors.
 */
export function wrapPlotInstance(originalPlot: any): any {
  if (!originalPlot || originalPlot.__isWrapped) {
    return originalPlot;
  }

  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);

      if (typeof prop === 'string' && FRAME_ANCHOR_MARKS.has(prop) && typeof orig === 'function') {
        return function (data: any, options: any = {}) {
          if (options && options.frameAnchor !== undefined && !VALID_FRAME_ANCHORS.has(options.frameAnchor)) {
            const dataArr = Array.isArray(data)
              ? data
              : data && typeof data[Symbol.iterator] === 'function'
              ? Array.from(data)
              : null;

            if (dataArr && dataArr.length > 0) {
              const anchorGetter =
                typeof options.frameAnchor === 'function'
                  ? options.frameAnchor
                  : (d: any) => d?.[options.frameAnchor];

              const dxGetter =
                typeof options.dx === 'function'
                  ? options.dx
                  : typeof options.dx === 'string' && isNaN(Number(options.dx))
                  ? (d: any) => d?.[options.dx]
                  : null;

              const dyGetter =
                typeof options.dy === 'function'
                  ? options.dy
                  : typeof options.dy === 'string' && isNaN(Number(options.dy))
                  ? (d: any) => d?.[options.dy]
                  : null;

              // Group items by resolved (anchor, dx, dy)
              const groups = new Map<string, { anchor: string; dx: any; dy: any; items: any[] }>();

              for (const d of dataArr) {
                const anchorVal = anchorGetter(d);
                if (VALID_FRAME_ANCHORS.has(anchorVal)) {
                  const resolvedDx = dxGetter ? dxGetter(d) : options.dx;
                  const resolvedDy = dyGetter ? dyGetter(d) : options.dy;
                  const groupKey = `${anchorVal}___${resolvedDx}___${resolvedDy}`;

                  if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                      anchor: anchorVal,
                      dx: resolvedDx,
                      dy: resolvedDy,
                      items: [],
                    });
                  }
                  groups.get(groupKey)!.items.push(d);
                }
              }

              if (groups.size > 0) {
                const markList: any[] = [];
                for (const { anchor, dx, dy, items } of groups.values()) {
                  const subOptions = { ...options, frameAnchor: anchor };
                  if (dx !== undefined) subOptions.dx = dx;
                  if (dy !== undefined) subOptions.dy = dy;
                  markList.push(orig.call(target, items, subOptions));
                }
                return typeof target.marks === 'function' ? target.marks(markList) : markList;
              }
            }
          }

          return orig.call(target, data, options);
        };
      }

      return orig;
    },
  };

  const proxy = new Proxy(originalPlot, handler);
  proxy.__isWrapped = true;
  return proxy;
}

export function getPlot(): typeof import('@observablehq/plot') {
  if (!_Plot) {
    const loaded = require('@observablehq/plot');
    _Plot = wrapPlotInstance(loaded.default ?? loaded);
  }
  return _Plot!;
}

export function setPlot(val: any): void {
  _Plot = wrapPlotInstance(val);
}

export function getD3(): typeof import('d3') {
  if (!_d3) {
    const loaded = require('d3');
    _d3 = loaded.default ?? loaded;
  }
  return _d3!;
}

export function setD3(val: any): void {
  _d3 = val;
}
