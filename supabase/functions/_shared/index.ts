// Deno-side entry to the cross-runtime domain package.
//
// The Hono API imports domain code from here (`../_shared/index.ts`) instead of
// reaching across the repo directly, so there is ONE place the relative hop into
// packages/shared lives. Supabase's edge bundler follows this relative import when
// serving locally and when deploying. (NWE-110 cross-runtime mechanism, Deno half.)
export * from '../../../packages/shared/src/index.ts';
