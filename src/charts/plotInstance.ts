let _Plot: typeof import('@observablehq/plot') | null = null;
let _d3: typeof import('d3') | null = null;

type PlotModule = typeof import('@observablehq/plot');
type D3Module = typeof import('d3');
type UnknownFunction = (...args: unknown[]) => unknown;

type PlotRecord = Record<PropertyKey, unknown>;

function isRecord(value: unknown): value is PlotRecord {
  return typeof value === 'object' && value !== null;
}

function asFunction(value: unknown): UnknownFunction | null {
  return typeof value === 'function' ? value as UnknownFunction : null;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return isRecord(value) && typeof value[Symbol.iterator] === 'function';
}

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
export function wrapPlotInstance(originalPlot: PlotModule): PlotModule {
  if (!originalPlot || (originalPlot as unknown as PlotRecord).__isWrapped) {
    return originalPlot;
  }

  const handler: ProxyHandler<PlotModule> = {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver) as unknown;

      if (prop === 'lineY' && typeof orig === 'function') {
        const origLineY = orig as UnknownFunction;
        return function (data: unknown, options: Record<string, unknown> = {}) {
          if (options.tip && options.stroke !== undefined) {
            const line = origLineY.call(target, data, { ...options, tip: false });
            // A hidden fill-coded point mark gives the tooltip the line's categorical color channel.
            const dotOptions: Record<string, unknown> = {
              ...(options.x !== undefined ? { x: options.x } : {}),
              ...(options.y !== undefined ? { y: options.y } : {}),
              fill: options.stroke,
              r: 0,
              stroke: 'none',
              tip: options.tip,
            };
            if (options.title !== undefined) dotOptions.title = options.title;
            const dotFn = asFunction((target as unknown as PlotRecord).dot);
            const marksFn = asFunction((target as unknown as PlotRecord).marks);
            if (!dotFn || !marksFn) return origLineY.call(target, data, options);
            const tooltipDots = dotFn.call(target, data, dotOptions);
            return marksFn.call(target, [line, tooltipDots]);
          }
          return origLineY.call(target, data, options);
        };
      }

      if (typeof prop === 'string' && FRAME_ANCHOR_MARKS.has(prop) && typeof orig === 'function') {
        const origMarkFn = orig as UnknownFunction;
        return function (data: unknown, options: Record<string, unknown> = {}) {
          if (options.frameAnchor !== undefined && (
            typeof options.frameAnchor === 'function' ||
            (typeof options.frameAnchor === 'string' && !VALID_FRAME_ANCHORS.has(options.frameAnchor))
          )) {
            const dataArr = Array.isArray(data)
              ? data
              : isIterable(data)
              ? Array.from(data)
              : null;

            if (dataArr && dataArr.length > 0) {
              const anchorGetter =
                typeof options.frameAnchor === 'function'
                  ? (options.frameAnchor as (d: unknown) => unknown)
                  : typeof options.frameAnchor === 'string'
                  ? (d: unknown) => isRecord(d) ? d[options.frameAnchor as string] : undefined
                  : null;

              const dxGetter =
                typeof options.dx === 'function'
                  ? (options.dx as (d: unknown) => unknown)
                  : typeof options.dx === 'string' && isNaN(Number(options.dx))
                  ? (d: unknown) => isRecord(d) ? d[options.dx as string] : undefined
                  : null;

              const dyGetter =
                typeof options.dy === 'function'
                  ? (options.dy as (d: unknown) => unknown)
                  : typeof options.dy === 'string' && isNaN(Number(options.dy))
                  ? (d: unknown) => isRecord(d) ? d[options.dy as string] : undefined
                  : null;

              // Group items by resolved (anchor, dx, dy)
              const groups = new Map<string, { anchor: string; dx: unknown; dy: unknown; items: unknown[] }>();

              for (const d of dataArr) {
                const anchorVal = anchorGetter ? anchorGetter(d) : undefined;
                if (typeof anchorVal === 'string' && VALID_FRAME_ANCHORS.has(anchorVal)) {
                  const resolvedDx = dxGetter ? dxGetter(d) : options.dx;
                  const resolvedDy = dyGetter ? dyGetter(d) : options.dy;
                  const dxKey = typeof resolvedDx === 'string' || typeof resolvedDx === 'number' || typeof resolvedDx === 'boolean'
                    ? String(resolvedDx)
                    : '';
                  const dyKey = typeof resolvedDy === 'string' || typeof resolvedDy === 'number' || typeof resolvedDy === 'boolean'
                    ? String(resolvedDy)
                    : '';
                  const groupKey = `${anchorVal}___${dxKey}___${dyKey}`;

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
                const markList: unknown[] = [];
                for (const { anchor, dx, dy, items } of groups.values()) {
                  const subOptions: Record<string, unknown> = { ...options, frameAnchor: anchor };
                  if (dx !== undefined) subOptions.dx = dx;
                  if (dy !== undefined) subOptions.dy = dy;
                  markList.push(origMarkFn.call(target, items, subOptions));
                }
                const marksFn = asFunction((target as unknown as PlotRecord).marks);
                return marksFn ? marksFn.call(target, markList) : markList;
              }
            }
          }

          return origMarkFn.call(target, data, options);
        };
      }

      return orig;
    },
  };

  const proxy = new Proxy(originalPlot, handler);
  Object.defineProperty(proxy, '__isWrapped', { value: true });
  return proxy;
}

export function getPlot(): PlotModule {
  if (!_Plot) {
    const loaded = require('@observablehq/plot') as unknown;
    const module = isRecord(loaded) && 'default' in loaded
      ? loaded.default
      : loaded;
    _Plot = wrapPlotInstance(module as PlotModule);
  }
  return _Plot;
}

export function setPlot(val: PlotModule): void {
  _Plot = wrapPlotInstance(val);
}

export function getD3(): D3Module {
  if (!_d3) {
    const loaded = require('d3') as unknown;
    const module = isRecord(loaded) && 'default' in loaded
      ? loaded.default
      : loaded;
    _d3 = module as D3Module;
  }
  return _d3;
}

export function setD3(val: D3Module): void {
  _d3 = val;
}
