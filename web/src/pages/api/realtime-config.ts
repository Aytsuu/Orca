import type { APIRoute } from 'astro';

import { jsonResponse } from '../../lib/api/server';

export const prerender = false;

export const GET: APIRoute = async () => {
  const url =
    import.meta.env.PUBLIC_SUPABASE_URL?.trim() ||
    import.meta.env.SUPABASE_URL?.trim();
  const publishableKey =
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !publishableKey) {
    return jsonResponse(
      {
        error: {
          code: 'SUPABASE_REALTIME_NOT_CONFIGURED',
          message: 'Supabase realtime is not configured for the frontend.',
        },
      },
      503
    );
  }

  return jsonResponse({
    data: {
      url,
      publishableKey,
    },
  });
};
