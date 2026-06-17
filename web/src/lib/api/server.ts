import type { APIContext } from 'astro';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

export function getApiBaseUrl(): string {
  return (import.meta.env.PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

function buildUrl(path: string): string {
  return `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export function getSessionId(context: APIContext): string | null {
  return context.request.headers.get('x-session-id');
}

export async function proxyApiRequest(
  context: APIContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const requestHeaders = context.request.headers;
  const sessionId = requestHeaders.get('x-session-id');

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (sessionId && !headers.has('X-Session-Id')) {
    headers.set('X-Session-Id', sessionId);
  }

  try {
    const response = await fetch(buildUrl(path), {
      method: init.method || context.request.method,
      headers,
      body: init.body,
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error: any) {
    console.error(`[API Proxy Error] Failed to fetch path: ${path}`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        error: {
          message: `Backend connection offline (${errorMessage})`,
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}