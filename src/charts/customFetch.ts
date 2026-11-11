import { TFile } from 'obsidian';

export function toTFile(item: unknown): TFile | null {
  if (typeof TFile === 'function' && item instanceof TFile) return item;
  if (item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string' && !('children' in item)) {
    return item as any;
  }
  return null;
}

export function createCustomFetch(app: any, obsidianModule: any, sourcePath: string = '') {
  return async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    if (/^https?:\/\//i.test(urlString)) {
      if (obsidianModule && typeof obsidianModule.requestUrl === 'function') {
        try {
          const reqOptions: any = { url: urlString };
          if (init) {
            if (init.method) reqOptions.method = init.method;
            if (init.headers) reqOptions.headers = init.headers;
            if (init.body) reqOptions.body = init.body;
          }
          const res = await obsidianModule.requestUrl(reqOptions);
          return new Response(res.arrayBuffer || res.text, {
            status: res.status,
            headers: res.headers,
          });
        } catch {
          // Fallback if requestUrl fails
        }
      }
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        return window.fetch(input, init);
      }
    }

    // Local vault relative path (normalize Windows backslashes and leading dots/slashes)
    const normalizedPath = urlString.replace(/\\/g, '/').replace(/^\.?\//, '');
    let file: TFile | null = null;

    if (app?.vault) {
      if (typeof app.vault.getAbstractFileByPath === 'function') {
        file = toTFile(app.vault.getAbstractFileByPath(normalizedPath));
      }
      if (!file && app.metadataCache && typeof app.metadataCache.getFirstLinkpathDest === 'function') {
        file = toTFile(app.metadataCache.getFirstLinkpathDest(normalizedPath, sourcePath));
      }

      if (file) {
        if (typeof app.vault.readBinary === 'function') {
          const buffer = await app.vault.readBinary(file);
          return new Response(buffer, { status: 200, statusText: 'OK' });
        }
        if (typeof app.vault.read === 'function') {
          const text = await app.vault.read(file);
          return new Response(text, { status: 200, statusText: 'OK' });
        }
      }

      if (app.vault.adapter) {
        try {
          if (typeof app.vault.adapter.readBinary === 'function') {
            const buffer = await app.vault.adapter.readBinary(normalizedPath);
            return new Response(buffer, { status: 200, statusText: 'OK' });
          }
          if (typeof app.vault.adapter.read === 'function') {
            const text = await app.vault.adapter.read(normalizedPath);
            return new Response(text, { status: 200, statusText: 'OK' });
          }
        } catch {
          // Adapter read failed
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return window.fetch(input, init);
    }

    throw new TypeError(`Failed to fetch local vault file: ${urlString}`);
  };
}
