import type { APIRoute } from 'astro';

import { jsonResponse, proxyApiRequest } from '../../../../../../lib/api/server';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const projectId = context.params.id;
  const fileId = context.params.fileId;
  if (!projectId || !fileId) {
    return jsonResponse({ error: 'Project id and file id are required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/files/${fileId}/access-url`);
};
