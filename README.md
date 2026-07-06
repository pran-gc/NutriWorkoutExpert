# NutriWorkoutExpert 🥗💪

A mobile app that tracks your nutrition, workouts, weight and health goals — and uses that data to propose improvements.

Built with **Expo (React Native + TypeScript)** and **Supabase** (Postgres + auth, free tier).

## Features (MVP — phase 1)

- **Accounts & sync** — email/password auth via Supabase; all data lives in Postgres with row-level security, so it syncs across devices.
- **Today dashboard** — calories consumed vs. target, protein/carbs/fat progress bars, latest weight vs. goal, today's workouts.
- **Food logging** — search the free [Open Food Facts](https://world.openfoodfacts.org) database (no API key needed), pick an amount in grams and a meal, or add foods manually. Long-press an entry to delete.
- **Workout logging** — sessions with named exercises, sets, reps and weight; 14-day history.
- **Goals & targets** — enter sex, birth year, height, activity level and goal; the app computes daily calorie and macro targets (Mifflin-St Jeor BMR × activity, ±deficit/surplus for your goal) and recalculates them from your latest logged weight.

Phase 2 (planned): AI insights powered by a free-tier LLM (e.g. Gemini) via Supabase Edge Functions — weekly reviews, plan adjustments, and a coach chat grounded in your tracked data.

## Setup

### 1. Create the Supabase project (once, ~5 minutes)

1. Go to [supabase.com](https://supabase.com), sign up (free) and create a new project.
2. In the dashboard open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates all tables, row-level-security policies, and a trigger that auto-creates a profile on signup.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. (Optional) Under **Authentication → Providers → Email**, disable "Confirm email" for frictionless signup during development.

### 2. Configure and run the app

```bash
# copy the env template and paste your Supabase URL + anon key into it
cp .env.example .env

npm install
npm start
```

Then press `a` for Android emulator, or scan the QR code with the **Expo Go** app on your phone (Android/iOS). `npm run web` also works for quick testing in a browser.

> After editing `.env`, restart the dev server — Expo inlines `EXPO_PUBLIC_*` variables at build time.

## Documentation

- [TASKS.md](TASKS.md) — backlog of record (delegation-ready stories)
- [docs/architecture.md](docs/architecture.md) — system architecture, security model, environments
- [docs/ui-flows.md](docs/ui-flows.md) — screen map + user flows
- [docs/api.md](docs/api.md) — API conventions + endpoint catalog
- [docs/data-model.md](docs/data-model.md) — schema, RLS, migrations workflow
- [docs/testing.md](docs/testing.md) — test pyramid + TDD rules
- [docs/ai.md](docs/ai.md) — AI pipeline + privacy constraints
- [AGENTS.md](AGENTS.md) — guide for agent sessions (folder-level CLAUDE.md files add local rules)

## Project structure

```
app/
  _layout.tsx          # root layout: session provider + auth redirect guard
  (auth)/sign-in.tsx   # sign in / sign up screen
  (tabs)/
    index.tsx          # Today dashboard
    food.tsx           # food search + logging
    workouts.tsx       # workout logging + history
    profile.tsx        # body stats, goals, weight log, sign out
components/
  SessionProvider.tsx  # Supabase session + profile context
  ui.tsx               # Card, ProgressBar, SectionTitle
lib/
  supabase.ts          # Supabase client (reads EXPO_PUBLIC_* env vars)
  types.ts             # shared TypeScript models
  nutrition.ts         # BMR/TDEE/macro-target math, date helpers
  food-api.ts          # Open Food Facts search client
supabase/
  schema.sql           # full database schema — run in Supabase SQL Editor
```

## Roadmap

- [ ] Phase 2 — AI insights: Supabase Edge Function calling a free-tier LLM (Gemini) with weekly aggregates; insights feed + coach chat tab
- [ ] Weight & calorie trend charts
- [ ] Barcode scanning (`expo-camera`) → Open Food Facts lookup
- [ ] Exercise library with per-exercise progress tracking
- [ ] Reminders / streaks
- [ ] Wearable sync (HealthKit / Health Connect)
