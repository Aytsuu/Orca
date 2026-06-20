import type { APIRoute } from 'astro';
import { z } from 'zod';

import { jsonResponse, proxyApiRequest } from '../../../../lib/api/server';

export const prerender = false;

const MemberInvitationCreateSchema = z.object({
  invitee_name: z.string().trim().min(1).max(200),
  invitee_email: z.string().trim().email().max(320),
  role: z.enum(['approver', 'member']),
  can_approve: z.boolean().optional(),
  can_edit: z.boolean().optional(),
});

export const POST: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  const body = await context.request.json().catch(() => null);
  const parsed = MemberInvitationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: 'Invalid input',
        issues: parsed.error.flatten(),
      },
      400,
    );
  }

  return proxyApiRequest(context, `/api/v1/projects/${projectId}/member-invitations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });
};
