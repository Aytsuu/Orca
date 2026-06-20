import type { APIRoute } from 'astro';

import { jsonResponse, proxyApiRequest } from '../../../../../lib/api/server';

async function proxyPlanRequest(context: Parameters<APIRoute>[0], method: 'GET' | 'POST' | 'PATCH' | 'DELETE') {
  const projectId = context.params.id;
  const slug = context.params.slug;

  if (!projectId || !slug) {
    return jsonResponse({ error: 'Project plan path is required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/plan/${slug}${context.url.search}`, {
    method,
    body: method === 'GET' || method === 'DELETE' ? undefined : await context.request.text(),
  });
}

export const GET: APIRoute = async (context) => proxyPlanRequest(context, 'GET');
export const POST: APIRoute = async (context) => proxyPlanRequest(context, 'POST');
export const PATCH: APIRoute = async (context) => proxyPlanRequest(context, 'PATCH');
export const DELETE: APIRoute = async (context) => proxyPlanRequest(context, 'DELETE');
