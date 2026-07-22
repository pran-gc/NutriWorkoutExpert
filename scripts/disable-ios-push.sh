#!/usr/bin/env bash
# Free Apple development teams cannot provision APNs. Keep push opt-in until the
# paid Apple capability and regenerated provisioning profile are ready.
set -euo pipefail

if [[ "${EXPO_ENABLE_PUSH:-0}" == "1" ]]; then
  echo "▸ Push entitlement enabled by EXPO_ENABLE_PUSH=1."
  exit 0
fi

ENT=$(find ios -name "*.entitlements" -not -path "*/Pods/*" | head -1)
if [[ -n "$ENT" ]] && /usr/bin/plutil -extract aps-environment raw "$ENT" >/dev/null 2>&1; then
  /usr/bin/plutil -remove aps-environment "$ENT"
  echo "▸ Removed push entitlement for local/free-team signing."
fi

