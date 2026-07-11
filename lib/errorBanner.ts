// Tiny pub/sub store for the global error banner (NWE-105). The QueryCache feeds
// it (see queryClient.ts): a network/5xx failure shows the banner; a later
// success or a manual dismiss clears it. Kept framework-free so it's unit-testable.
import { ApiClientError } from '@/lib/api';

export interface BannerState {
  message: string;
  retry?: () => void;
  dismiss: () => void;
}

type Listener = (state: BannerState | null) => void;

const listeners = new Set<Listener>();
let current: BannerState | null = null;

export function subscribeBanner(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  for (const fn of listeners) fn(current);
}

export function showBanner(message: string, retry?: () => void): void {
  current = { message, retry, dismiss: hideBanner };
  emit();
}

export function hideBanner(): void {
  if (!current) return;
  current = null;
  emit();
}

/**
 * Decide whether an error warrants the banner (transient/server issues), and its
 * copy. 4xx envelope errors are surfaced by the calling screen, NOT the banner.
 * Returns null when the error should not raise the banner.
 */
export function bannerMessageFor(error: unknown): string | null {
  if (error instanceof ApiClientError) {
    if (error.code === 'UPSTREAM_ERROR' || error.code === 'INTERNAL' || error.code === 'RATE_LIMITED') {
      return "Something went wrong on our end. We'll keep trying.";
    }
    return null; // 4xx: the screen handles it inline
  }
  // Non-envelope errors are network failures (fetch threw).
  return 'No connection. Check your network and try again.';
}
