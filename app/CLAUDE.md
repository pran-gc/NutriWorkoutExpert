# app/ — screens (expo-router)

File-based routing: this folder IS the navigation tree. Root conventions in ../AGENTS.md;
flows and screen specs in ../docs/ui-flows.md.

## Structure

- `_layout.tsx` — root layout: wraps everything in `SessionProvider`, applies the auth
  redirect guard (no session → `(auth)/sign-in`; session on an auth route → `(tabs)`).
  NWE-104 extends the guard: session + incomplete profile → `(onboarding)`.
- `(auth)/` — sign-in / sign-up. Unauthenticated only.
- `(tabs)/` — the app: `index` (Today), `food`, `workouts`, `profile`; NWE-503 adds
  `insights`. Tab registration + icons in `(tabs)/_layout.tsx` (SymbolView with per-platform
  names: ios SF Symbol / android + web Material name).
- `(onboarding)/` — (NWE-104) first-launch wizard.

## Screen rules

- Safe areas are enforced centrally by the root Stack for custom/headerless routes. Add new
  headerless routes to `headerlessSafeAreaRoutes` in `_layout.tsx`; do not add manual status-bar
  padding inside the screen. Native Stack headers and tab navigators already manage their own
  insets and must not be wrapped again. `AppScreen` also applies the root route's single keyboard
  avoidance boundary; do not nest another `KeyboardAvoidingView`. Standalone React Native modals
  use `AppScreen modal`. Tab screens own keyboard handling inside their nested navigator.
- Data loading: `useFocusEffect(useCallback(...))` so tabs refresh on focus. Target state
  (post NWE-114): TanStack Query hooks over the typed client in `lib/api.ts` — **never**
  `supabase.from()` in new code; existing direct queries are legacy until NWE-114 migrates
  them.
- Every screen: empty state, loading state (no flash of wrong content), error banner on API
  failure (NWE-105) — never a silent blank screen.
- Destructive actions confirm via `Alert`; delete affordance = long-press (documented in the
  screen's empty-state hint).
- Forms: keyboard-safe (`KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"`),
  numeric fields `keyboardType="numeric"`, parse with shared Zod schemas before submit.
- Dates: day-scoped writes use `todayISO()` (device-local) — never `toISOString().slice()`.
- Component tests (jest-expo + RNTL) colocated as `*.test.tsx`; test behavior (what the user
  sees/does), not implementation details.
