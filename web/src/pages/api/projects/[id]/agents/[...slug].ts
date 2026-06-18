import type { APIRoute } from 'astro';

import { jsonResponse, proxyApiRequest } from '../../../../../lib/api/server';

async function proxyAgentRequest(
  context: Parameters<APIRoute>[0],
  method: 'GET' | 'POST'
) {
  const projectId = context.params.id;
  const slug = context.params.slug;

  if (!projectId || !slug) {
    return jsonResponse({ error: 'Project agent path is required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/agents/${slug}${context.url.search}`, {
    method,
    body: method === 'GET' ? undefined : await context.request.text(),
  });
}

export const GET: APIRoute = async (context) => proxyAgentRequest(context, 'GET');
export const POST: APIRoute = async (context) => proxyAgentRequest(context, 'POST');
