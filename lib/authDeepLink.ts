// Handle Supabase auth deep links on native (email confirmation, password reset,
// magic links). supabase-js's detectSessionInUrl is web-only, so on iOS/Android we
// must catch the incoming URL ourselves and establish the session from it.
//
// Supabase emails open the app at the configured redirect (e.g.
// nutriworkoutexpert://reset-password) with the tokens either as a URL fragment
// (#access_token=...&refresh_token=...&type=recovery) or, with PKCE, as ?code=...
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

export type AuthLinkResult =
  | { handled: false }
  | { handled: true; type: string | null };

/** Parse a URL and, if it carries auth tokens, set the Supabase session. */
export async function handleAuthUrl(url: string | null): Promise<AuthLinkResult> {
  if (!url) return { handled: false };

  const parsed = Linking.parse(url);
  // Fragment params live after '#'; query params after '?'. expo-linking puts
  // query params in `queryParams`, but the tokens usually come as a fragment,
  // so parse both.
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const frag = new URLSearchParams(fragment);
  const q = (parsed.queryParams ?? {}) as Record<string, string>;

  const access_token = frag.get('access_token') ?? q.access_token;
  const refresh_token = frag.get('refresh_token') ?? q.refresh_token;
  const type = frag.get('type') ?? q.type ?? null;
  const code = q.code as string | undefined;

  // Token-hash flow (default for recovery / email confirm).
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) return { handled: false };
    return { handled: true, type };
  }

  // PKCE flow (?code=...).
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { handled: false };
    return { handled: true, type };
  }

  return { handled: false };
}

/**
 * Wire up auth deep-link handling: process the URL the app was cold-opened with,
 * and listen for links while running. Returns an unsubscribe fn.
 * `onRecovery` fires when the link is a password-recovery link so the UI can route
 * to the set-new-password screen.
 */
export function initAuthDeepLinks(onRecovery: () => void): () => void {
  Linking.getInitialURL().then(async (url) => {
    const res = await handleAuthUrl(url);
    if (res.handled && res.type === 'recovery') onRecovery();
  });

  const sub = Linking.addEventListener('url', async ({ url }) => {
    const res = await handleAuthUrl(url);
    if (res.handled && res.type === 'recovery') onRecovery();
  });

  return () => sub.remove();
}
