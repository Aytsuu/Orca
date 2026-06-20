import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../../../../../lib/api/server';

export const prerender = false;

const MemberPermissionsUpdateSchema = z
  .object({
    can_approve: z.boolean().optional(),
    can_edit: z.boolean().optional(),
  })
  .refine((value) => value.can_approve !== undefined || value.can_edit !== undefined, {
    message: 'At least one field is required.',
  });

export const PATCH: APIRoute = async (context) => {
  const projectId = context.params.id;
  const memberSessionId = context.params.sessionId;

  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  if (!memberSessionId) {
    return jsonResponse({ error: 'Member session id is required.' }, 400);
  }

  const body = await context.request.json().catch(() => null);
  const parsed = MemberPermissionsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: 'Invalid input',
        issues: parsed.error.flatten(),
      },
      400,
    );
  }

  return proxyApiRequest(
    context,
    `/api/v1/projects/${projectId}/members/${memberSessionId}/permissions`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parsed.data),
    }
  );
};
