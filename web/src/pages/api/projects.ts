import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../lib/api/server';

export const prerender = false;

const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).default(''),
});

export const GET: APIRoute = async (context) => {
  return proxyApiRequest(context, '/api/v1/projects');
};

export const POST: APIRoute = async (context) => {
  const body = await context.request.json().catch(() => null);
  const parsed = ProjectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: 'Invalid input',
        issues: parsed.error.flatten(),
      },
      400,
    );
  }

  return proxyApiRequest(context, '/api/v1/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });
};
