import { ApiClientError } from '@/lib/api';
import { bannerMessageFor, hideBanner, showBanner, subscribeBanner } from '@/lib/errorBanner';

describe('errorBanner store', () => {
  afterEach(() => hideBanner());

  it('notifies subscribers on show and clears on hide', () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeBanner((s) => seen.push(s?.message ?? null));
    showBanner('boom');
    hideBanner();
    unsub();
    expect(seen).toEqual([null, 'boom', null]); // initial null, then show, then hide
  });
});

describe('bannerMessageFor', () => {
  it('shows a banner for network (non-envelope) errors', () => {
    expect(bannerMessageFor(new Error('Network request failed'))).toMatch(/connection/i);
  });

  it('shows a banner for 5xx / rate-limit envelope errors', () => {
    expect(bannerMessageFor(new ApiClientError({ code: 'INTERNAL', message: 'x' }))).toBeTruthy();
    expect(bannerMessageFor(new ApiClientError({ code: 'UPSTREAM_ERROR', message: 'x' }))).toBeTruthy();
    expect(bannerMessageFor(new ApiClientError({ code: 'RATE_LIMITED', message: 'x' }))).toBeTruthy();
  });

  it('does NOT show a banner for 4xx client errors (screen handles inline)', () => {
    expect(bannerMessageFor(new ApiClientError({ code: 'VALIDATION_ERROR', message: 'x' }))).toBeNull();
    expect(bannerMessageFor(new ApiClientError({ code: 'NOT_FOUND', message: 'x' }))).toBeNull();
  });
});
