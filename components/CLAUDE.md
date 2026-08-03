# components/ — shared UI + session context

- `Themed.tsx` — `Text`/`View` with automatic light/dark colors. **Always use these instead of
  raw react-native `Text`/`View`** in screens; pass `lightColor`/`darkColor` for surfaces.
  Inside a themed parent, child `View`s often need `backgroundColor: 'transparent'`.
- `ui.tsx` — design primitives: `Card`, `ProgressBar` (value/max/color), `SectionTitle`.
  Add new shared primitives here (e.g. Chip, Button, Banner — NWE-101 extracts the ones
  currently duplicated across screens) instead of restyling per screen.
- `lib/glass.tsx` owns the Liquid Glass capability/accessibility gate and `<Surface>`. Shared
  primitives and floating surfaces import `<Surface>`; **never import `expo-glass-effect`
  directly** outside that file. Reduce Transparency and unsupported platforms intentionally use
  the opaque themed fallback.
- `AppScreen.tsx` — safe-area and keyboard-avoidance boundary for root screens. Root navigation
  applies it to route screens; use `modal` only for standalone/native modal roots and never nest
  a second `KeyboardAvoidingView`.
- `KeyboardSafeView.tsx` — the shared cross-platform keyboard boundary (`padding` on iOS,
  `height` on Android). Tab form screens use this because their navigator is nested.
- `SessionProvider.tsx` — Supabase **auth** session + profile context. `useSession()` returns
  `{ session, profile, loading, refreshProfile }`. This is the only place `supabase.auth`
  state is subscribed. Do not add data-fetching here — data belongs to TanStack Query hooks.
- `useColorScheme` / `useClientOnlyValue` — template helpers for theme + web hydration.

## Rules

- Components take an explicit props contract; no reaching into global state except
  `useSession()`.
- Style constants: accent `#16a34a`, destructive `#dc2626`, macro colors — protein `#dc2626`,
  carbs `#b45309`, fat `#3b82f6`. If you need them in more than one file, lift them into
  `constants/Colors.ts` rather than copy-pasting.
- Text inputs must be readable in both themes (NWE-101 fixes the current hardcoded `#888`) —
  derive input text color from the theme.
- Behavior-level tests with RNTL, colocated `*.test.tsx`.
