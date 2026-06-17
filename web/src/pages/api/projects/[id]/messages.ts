import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../../../lib/api/server';

export const prerender = false;

const MessageCreateSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export const GET: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/messages`);
};

export const POST: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  const body = await context.request.json().catch(() => null);
  const parsed = MessageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: 'Invalid input',
        issues: parsed.error.flatten(),
      },
      400
    );
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });
};
