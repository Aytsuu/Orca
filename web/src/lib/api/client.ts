const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

function getApiBaseUrl(): string {
  return (import.meta.env.PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) {
    return path;
  }

  // Browser clients should go through Astro's same-origin /api proxy routes.
  return path.startsWith('/') ? path : `/${path}`;
}

export async function apiFetch<T>(
  path: string,
  sessionId?: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (sessionId) {
    headers.set('X-Session-Id', sessionId);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return null as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      payload?.message ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
