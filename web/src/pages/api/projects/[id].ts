import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../../lib/api/server';

export const prerender = false;

const ProjectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(4000).optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'At least one field is required.',
  });

export const GET: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }
  return proxyApiRequest(context, `/api/v1/projects/${projectId}`);
};

export const PATCH: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  const body = await context.request.json().catch(() => null);
  const parsed = ProjectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: 'Invalid input',
        issues: parsed.error.flatten(),
      },
      400,
    );
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });
};

export const DELETE: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }
  return proxyApiRequest(context, `/api/v1/projects/${projectId}`, {
    method: 'DELETE',
  });
};
