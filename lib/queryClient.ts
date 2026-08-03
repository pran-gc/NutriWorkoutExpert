// TanStack Query client. Retry policy per NWE-105: network / 5xx errors retry
// (max 2, exponential backoff); 4xx envelope errors surface immediately to the
// calling screen (retrying a validation/not-found error is pointless).
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiClientError } from '@/lib/api';
import { bannerMessageFor, hideBanner, showBanner } from '@/lib/errorBanner';

/** 4xx client errors that should NOT be retried. */
const NON_RETRYABLE = new Set(['VALIDATION_ERROR', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT']);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError && NON_RETRYABLE.has(error.code)) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  // Global error mapping (NWE-105): after retries are exhausted, a network/5xx
  // failure raises the banner; any subsequent success clears it.
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = bannerMessageFor(error);
      if (message) showBanner(message, () => query.fetch());
    },
    onSuccess: () => hideBanner(),
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = bannerMessageFor(error);
      if (message) showBanner(message);
    },
    onSuccess: () => hideBanner(),
  }),
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      staleTime: 30_000,
    },
    mutations: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});
