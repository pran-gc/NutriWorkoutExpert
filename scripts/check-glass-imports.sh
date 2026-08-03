#!/usr/bin/env bash
# CI guard: expo-glass-effect must only be imported by lib/glass.tsx (the Surface
# capability/accessibility boundary). Uses portable grep (not rg) so it runs in any
# runner/dev environment — matching scripts/check-no-supabase-from.sh.
set -euo pipefail

TARGETS=(app components lib)

matches=$(grep -rn --include='*.ts' --include='*.tsx' "from ['\"]expo-glass-effect['\"]" "${TARGETS[@]}" 2>/dev/null \
  | grep -v '^lib/glass\.tsx:' || true)

if [[ -n "$matches" ]]; then
  echo "❌ Direct expo-glass-effect imports are forbidden; use Surface from lib/glass.tsx."
  echo "$matches"
  exit 1
fi

echo "✅ Glass import boundary OK"
