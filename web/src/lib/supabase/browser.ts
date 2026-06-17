import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface RealtimeConfigEnvelope {
  data: {
    url: string;
    publishableKey: string;
  };
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

async function fetchRealtimeConfig(): Promise<RealtimeConfigEnvelope['data'] | null> {
  const response = await fetch('/api/realtime-config');
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as RealtimeConfigEnvelope;
  return body.data;
}

export function getSupabaseBrowserClient(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = fetchRealtimeConfig()
      .then((config) => {
        if (!config) {
          return null;
        }

        return createClient(config.url, config.publishableKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });
      })
      .catch(() => null);
  }

  return clientPromise;
}
