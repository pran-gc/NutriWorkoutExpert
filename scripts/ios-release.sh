#!/usr/bin/env bash
# Local iOS release build → TestFlight, no EAS cloud (you're on a Mac with Xcode).
# Bakes in the HOSTED backend via .env.production and opens Xcode to archive.
#
# Prereqs (one-time):
#   • Xcode installed + signed into your Apple Developer account
#     (Xcode → Settings → Accounts → add your Apple ID)
#   • .env.production present (points at the hosted Supabase project)
#
# Usage:  bash scripts/ios-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "❌ .env.production missing — it must contain the HOSTED EXPO_PUBLIC_SUPABASE_URL + anon key."
  exit 1
fi

echo "▸ Regenerating the native iOS project from app.json (bundle id, permissions)…"
npx expo prebuild --platform ios --clean

# Free-tier Apple teams can't provision Push Notifications, which blocks signing.
# Strip the push entitlement unless EXPO_ENABLE_PUSH=1 (set that once you enroll in
# the paid Apple Developer Program — then push works normally).
if [[ "${EXPO_ENABLE_PUSH:-0}" != "1" ]]; then
  ENT=$(find ios -name "*.entitlements" -not -path "*/Pods/*" | head -1)
  if [[ -n "$ENT" ]] && /usr/bin/plutil -extract aps-environment raw "$ENT" >/dev/null 2>&1; then
    /usr/bin/plutil -remove aps-environment "$ENT"
    echo "▸ Removed push entitlement (free-tier build). Set EXPO_ENABLE_PUSH=1 after enrolling to keep it."
  fi
fi

echo "▸ Confirming the production backend is wired in .env.production:"
grep EXPO_PUBLIC_SUPABASE_URL .env.production

cat <<'NEXT'

▸ Native project is ready. Now archive from Xcode (handles Apple sign-in + 2FA cleanly):

  1. open ios/NutriWorkoutExpert.xcworkspace
  2. Top bar: select "Any iOS Device (arm64)" as the run destination
  3. Menu: Product → Archive   (Release config bakes in .env.production)
  4. When the Organizer opens: Distribute App → App Store Connect → Upload
  5. Signing: let Xcode "Automatically manage signing" with your team

The build appears in App Store Connect → TestFlight in a few minutes.

Tip: to verify the archive points at the hosted API, after upload open the app on a
TestFlight device and check the dashboard loads real data (not a spinner).
NEXT

# Open the workspace for you.
open ios/NutriWorkoutExpert.xcworkspace
