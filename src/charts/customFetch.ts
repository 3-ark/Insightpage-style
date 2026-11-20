import {
  TFile,
  type App,
  type RequestUrlParam,
  type RequestUrlResponse,
} from 'obsidian';

interface ObsidianRequestModule {
  requestUrl: (request: RequestUrlParam | string) => Promise<RequestUrlResponse>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTFileLike(item: unknown): item is TFile {
  if (!isRecord(item)) return false;
  return typeof item.path === 'string';
}

function getObsidianRequestModule(value: unknown): ObsidianRequestModule | null {
  if (!isRecord(value) || typeof value.requestUrl !== 'function') return null;
  return {
    requestUrl: value.requestUrl as ObsidianRequestModule['requestUrl'],
  };
}

function getRequestHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function getRequestBody(body: BodyInit | null | undefined): string | ArrayBuffer | undefined {
  if (typeof body === 'string' || body instanceof ArrayBuffer) return body;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return undefined;
  return undefined;
}

export function toTFile(item: unknown): TFile | null {
  if (typeof TFile === 'function' && item instanceof TFile) return item;
  if (isTFileLike(item)) return item;
  return null;
}

export function createCustomFetch(app: App | undefined, obsidianModule: unknown, sourcePath: string = '') {
  return async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    if (/^https?:\/\//i.test(urlString)) {
      const requestModule = getObsidianRequestModule(obsidianModule);
      if (requestModule) {
        try {
          const reqOptions: RequestUrlParam = { url: urlString };
          if (init) {
            if (init.method) reqOptions.method = init.method;
            const headers = getRequestHeaders(init.headers);
            if (headers) reqOptions.headers = headers;
            const body = getRequestBody(init.body);
            if (body) reqOptions.body = body;
          }
          const res = await requestModule.requestUrl(reqOptions);
          return new Response(res.arrayBuffer ?? res.text, {
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
