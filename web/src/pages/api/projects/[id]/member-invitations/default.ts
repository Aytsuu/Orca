import type { APIRoute } from 'astro';

import { jsonResponse, proxyApiRequest } from '../../../../../lib/api/server';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/member-invitations/default`);
};
