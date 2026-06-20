import { QueryClient } from '@tanstack/react-query';

let queryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false,
          staleTime: 10_000,
        },
      },
    });
  }

  return queryClient;
}
