// Test helper that polyfills Obsidian DOM helpers on global and DOM prototypes
// matching what Obsidian provides in runtime environments.

function getActiveDocument(): Document {
  return (globalThis as any).document || (globalThis as any).window?.document;
}

export function setupDomPolyfills(win?: any) {
  (globalThis as any).createEl = (tag: string, o?: any, cb?: (el: any) => void) => {
    const doc = getActiveDocument();
    const el = doc.createElement(tag);
    if (typeof o === 'string') {
      el.className = o;
    } else if (o && typeof o === 'object') {
      if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
      if (o.text) el.textContent = o.text;
      if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) {
          el.setAttribute(k, String(v));
        }
      }
      if (o.href) el.setAttribute('href', o.href);
      if (o.title) el.setAttribute('title', o.title);
    }
    if (cb) cb(el);
    return el;
  };

  (globalThis as any).createDiv = (o?: any, cb?: (el: any) => void) => {
    return (globalThis as any).createEl('div', o, cb);
  };

  (globalThis as any).createSpan = (o?: any, cb?: (el: any) => void) => {
    return (globalThis as any).createEl('span', o, cb);
  };

  (globalThis as any).createSvg = (tag: string, o?: any, cb?: (el: any) => void) => {
    const doc = getActiveDocument();
    const el = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    if (typeof o === 'string') {
      el.setAttribute('class', o);
    } else if (o && typeof o === 'object') {
      if (o.cls) el.setAttribute('class', Array.isArray(o.cls) ? o.cls.join(' ') : o.cls);
      if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) {
          el.setAttribute(k, String(v));
        }
      }
    }
    if (cb) cb(el);
    return el;
  };

  (globalThis as any).createFragment = (cb?: (frag: DocumentFragment) => void) => {
    const doc = getActiveDocument();
    const frag = doc.createDocumentFragment();
    if (cb) cb(frag);
    return frag;
  };

  const attachPrototypes = (w: any) => {
    if (!w) return;
    const nodeProto = w.Node?.prototype;
    const elProto = w.Element?.prototype;
    for (const proto of [nodeProto, elProto]) {
      if (proto && !proto.createEl) {
        proto.createEl = function (tag: string, o?: any, cb?: (el: any) => void) {
          const el = (globalThis as any).createEl(tag, o, cb);
          this.appendChild(el);
          return el;
        };
        proto.createDiv = function (o?: any, cb?: (el: any) => void) {
          return this.createEl('div', o, cb);
        };
        proto.createSpan = function (o?: any, cb?: (el: any) => void) {
          return this.createEl('span', o, cb);
        };
        proto.createSvg = function (tag: string, o?: any, cb?: (el: any) => void) {
          const el = (globalThis as any).createSvg(tag, o, cb);
          this.appendChild(el);
          return el;
        };
        proto.empty = function () {
          while (this.firstChild) {
            this.removeChild(this.firstChild);
          }
        };
      }
    }

    if (w.DocumentFragment?.prototype) {
      if (!w.DocumentFragment.prototype.createEl) {
        w.DocumentFragment.prototype.createEl = function (tag: string, o?: any, cb?: (el: any) => void) {
          const el = (globalThis as any).createEl(tag, o, cb);
          this.appendChild(el);
          return el;
        };
      }
      if (!w.DocumentFragment.prototype.createDiv) {
        w.DocumentFragment.prototype.createDiv = function (o?: any, cb?: (el: any) => void) {
          return this.createEl('div', o, cb);
        };
      }
      if (!w.DocumentFragment.prototype.createSpan) {
        w.DocumentFragment.prototype.createSpan = function (o?: any, cb?: (el: any) => void) {
          return this.createEl('span', o, cb);
        };
      }
      if (!w.DocumentFragment.prototype.appendText) {
        w.DocumentFragment.prototype.appendText = function (text: string) {
          this.appendChild((w.document || getActiveDocument()).createTextNode(text));
          return this;
        };
      }
    }
  };

  if (win) attachPrototypes(win);
  if ((globalThis as any).window) attachPrototypes((globalThis as any).window);
}

setupDomPolyfills();
