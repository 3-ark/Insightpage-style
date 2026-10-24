let _chroma: any = null;
function getChroma(): any {
  if (!_chroma) {
    const loaded = require('chroma-js');
    _chroma = loaded.default ?? loaded;
  }
  return _chroma;
}

// Performance optimization: Cache chroma color alpha conversions in an O(1) Map
// to avoid redundant chroma parsing, color space conversions, and string allocations
// on repeated chart renderings and theme updates.
const innerColorCache = new Map<string, string>();

export function generateInnerColors(colors: string[], alpha = 0.25) {
    if (typeof alpha !== 'number') throw "Provided alpha value is not a number";
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

export function renderError(error: any, el: HTMLElement) {
    console.error("Chart Rendering Error:", error);
    if (typeof (el as any).createDiv === 'function') {
        const errorEl = (el as any).createDiv({ cls: "chart-error" });
        errorEl.createEl("b", { text: "Couldn't render Chart:" });
        errorEl.createEl("pre").createEl("code", { text: error?.stack ?? error?.toString?.() ?? error });
        errorEl.createEl("hr");
        errorEl.createEl("span").innerHTML = "You might also want to look for further Errors in the Console: Press <kbd>CTRL</kbd> + <kbd>SHIFT</kbd> + <kbd>I</kbd> to open it.";
    } else {
        const errorEl = document.createElement("div");
        errorEl.className = "chart-error";
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = String(error?.stack ?? error?.toString?.() ?? error);
        pre.appendChild(code);
        errorEl.innerHTML = "<b>Couldn't render Chart:</b>";
        errorEl.appendChild(pre);
        el.appendChild(errorEl);
    }
}
