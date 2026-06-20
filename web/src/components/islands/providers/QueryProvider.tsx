import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { getQueryClient } from '../../../lib/query/client';

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
