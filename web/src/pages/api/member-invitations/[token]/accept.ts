import type { APIRoute } from 'astro';

import { jsonResponse, proxyApiRequest } from '../../../../lib/api/server';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const token = context.params.token;
  if (!token) {
    return jsonResponse({ error: 'Invitation token is required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/member-invitations/${token}/accept`, {
    method: 'POST',
  });
};
