#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# expo run:ios prebuilds automatically only when ios/ is absent. Prebuild first
# in that case so the notification plugin cannot add APNs after our safeguard.
if [[ ! -d ios ]]; then
  npx expo prebuild --platform ios
fi

bash scripts/disable-ios-push.sh
exec npx expo run:ios "$@"

