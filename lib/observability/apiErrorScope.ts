import { AsyncLocalStorage } from 'node:async_hooks';

type ApiErrorScope = { reported: boolean; errors: WeakSet<Error> };
const storage = new AsyncLocalStorage<ApiErrorScope>();

/** Nested API/cron wrappers share one request's reporting state, never another request's. */
export function runWithApiErrorScope<T>(fn: () => Promise<T>): Promise<T> {
  return storage.getStore() ? fn() : storage.run({ reported: false, errors: new WeakSet() }, fn);
}

export function markApiErrorReported(error: Error): boolean {
  const scope = storage.getStore();
  if (!scope) return true;
  if (scope.errors.has(error)) return false;
  scope.errors.add(error);
  scope.reported = true;
  return true;
}

export function hasReportedApiError(): boolean {
  return storage.getStore()?.reported ?? false;
}

/** Use route parameter names, never member IDs/emails/query strings, in error tags. */
export async function apiRouteLabel(request: Request, context?: unknown): Promise<string> {
  try {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/api/')) return '/api/[route]';
    const segments = pathname.split('/').map((part) => decodeURIComponent(part));
    const params = context && typeof context === 'object' && 'params' in context
      ? await (context as { params: unknown }).params
      : null;
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
        if (!values.length) continue;
        if (!values.every((part) => typeof part === 'string')) return '/api/[route]';
        const index = segments.findIndex((_, i) => values.every((part, j) => segments[i + j] === part));
        if (index < 0) return '/api/[route]';
        const name = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) ? key : 'param';
        segments.splice(index, values.length, Array.isArray(value) ? `[...${name}]` : `[${name}]`);
      }
    }
    return segments.join('/');
  } catch {
    return '/api/[route]';
  }
}
