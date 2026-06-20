import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../../../lib/api/server';

export const prerender = false;

const MessageAttachmentSchema = z.object({
  uploaded_file_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(255),
  storage_path: z.string().trim().min(1).max(1024),
  size_bytes: z.number().int().nonnegative(),
});

const MessageCreateSchema = z
  .object({
    content: z.string().max(4000).default(''),
    attachments: z.array(MessageAttachmentSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.content.trim() && value.attachments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message content or attachments are required.',
        path: ['content'],
      });
    }
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
