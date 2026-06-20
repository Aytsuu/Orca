import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../../../lib/api/server';

export const prerender = false;

const UploadedFileCreateSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(255),
  storage_path: z.string().trim().min(1).max(1024),
  size_bytes: z.number().int().positive(),
  purpose: z.enum(['chat', 'source']).default('source'),
});

export const GET: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/files`);
};

export const POST: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  const body = await context.request.json().catch(() => null);
  const parsed = UploadedFileCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: 'Invalid input',
        issues: parsed.error.flatten(),
      },
      400
    );
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });
};
