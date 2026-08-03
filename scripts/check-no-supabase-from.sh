#!/usr/bin/env bash
# CI guard (NWE-114 AC#3): the app must NEVER query the database directly.
# All data goes through the Hono API; supabase-js in the app is auth-only.
# Fails the build if `supabase.from(` appears anywhere in app-side code.
set -euo pipefail

# App-side directories that must stay DB-free. The API (supabase/functions) and
# node_modules are exempt.
TARGETS=(app components lib)

# Match real calls, not comments/strings mentioning the pattern. Exclude lines
# whose first non-space character starts a comment.
matches=$(grep -rn --include='*.ts' --include='*.tsx' 'supabase\.from(' "${TARGETS[@]}" 2>/dev/null \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*)' || true)

if [[ -n "$matches" ]]; then
  echo "❌ Direct database access found in app code (use the API via lib/api.ts instead):"
  echo "$matches"
  exit 1
fi

echo "✅ No supabase.from( in app code — all data goes through the API."
