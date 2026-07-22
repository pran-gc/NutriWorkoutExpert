#!/usr/bin/env bash
set -euo pipefail

matches=$(rg -n --glob '*.ts' --glob '*.tsx' "from ['\"]expo-glass-effect['\"]" app components lib \
  | rg -v '^lib/glass\.tsx:' || true)

if [[ -n "$matches" ]]; then
  echo "Direct expo-glass-effect imports are forbidden; use Surface from lib/glass.tsx."
  echo "$matches"
  exit 1
fi

echo "Glass import boundary OK"
