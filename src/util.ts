import chroma from 'chroma-js';

let _chroma: typeof chroma | null = null;
function getChroma(): typeof chroma {
  if (!_chroma) {
    const loaded = require('chroma-js') as typeof chroma & { default?: typeof chroma };
    _chroma = loaded.default ?? loaded;
  }
  return _chroma;
}

// Performance optimization: Cache chroma color alpha conversions in an O(1) Map
// to avoid redundant chroma parsing, color space conversions, and string allocations
// on repeated chart renderings and theme updates.
const innerColorCache = new Map<string, string>();

export function generateInnerColors(colors: string[], alpha = 0.25) {
    if (typeof alpha !== 'number') throw new TypeError('Provided alpha value is not a number');
    return colors.map((color: string) => {
        const trimmed = color.trim();
        const cacheKey = `${trimmed}_${alpha}`;
        let cached = innerColorCache.get(cacheKey);
        if (!cached) {
            cached = getChroma()(trimmed).alpha(alpha).hex();
            if (cached) innerColorCache.set(cacheKey, cached);
        }
        return cached ?? trimmed;
    });
}

export function renderError(error: unknown, el: HTMLElement) {
    console.error("Chart Rendering Error:", error);
    const errObj = error as { stack?: string; toString?: () => string } | null | undefined;
    const errText = errObj?.stack ?? (typeof errObj?.toString === 'function' ? errObj.toString() : String(error));

    if (typeof el.createDiv === 'function') {
        const errorEl = el.createDiv({ cls: "chart-error" });
        errorEl.createEl("b", { text: "Couldn't render Chart:" });
        errorEl.createEl("pre").createEl("code", { text: errText });
        errorEl.createEl("hr");
        const span = errorEl.createSpan();
        span.appendText("You might also want to look for further Errors in the Console: Press ");
        span.createEl("kbd", { text: "CTRL" });
        span.appendText(" + ");
        span.createEl("kbd", { text: "SHIFT" });
        span.appendText(" + ");
        span.createEl("kbd", { text: "I" });
        span.appendText(" to open it.");
    } else {
        const errorEl = createDiv();
        errorEl.className = "chart-error";
        const b = createEl("b");
        b.textContent = "Couldn't render Chart:";
        errorEl.appendChild(b);
        const pre = createEl("pre");
        const code = createEl("code");
        code.textContent = errText;
        pre.appendChild(code);
        errorEl.appendChild(pre);
        el.appendChild(errorEl);
    }
}
