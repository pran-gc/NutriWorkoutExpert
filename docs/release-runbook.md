# Release runbook — secrets, deploy, and go-live (NWE-802/803/115)

Everything needed to take v1.0 from local to TestFlight → App Store. Steps marked **[you]** need
your interactive login/credentials; steps marked **[agent-ok]** can be run by the assistant once
you're logged in.

---

## 1. Hosted Supabase project

### 1a. Link + push schema **[you: login, then agent-ok]**
```bash
supabase login                        # [you] opens browser / pastes token
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push                      # applies migrations 0001 + 0002 to the hosted DB
supabase functions deploy api         # deploys the Hono API
supabase functions deploy proof       # (optional) the cross-runtime demo fn
```

### 1b. Edge Function secrets **[you]** (never commit these)
```bash
supabase secrets set \
  GEMINI_API_KEY=<your Google AI Studio key> \
  USDA_FDC_API_KEY=<your FoodData Central key> \
  CRON_SECRET=<a long random string> \
  ENVIRONMENT=production
```
- `GEMINI_API_KEY` — required for real AI (without it the API uses the deterministic local fallback).
- `USDA_FDC_API_KEY` — free from https://fdc.nal.usda.gov/api-key-signup.html; enables the snap-to-log resolver.
- `CRON_SECRET` — **required.** The weekly-review cron endpoint now fails closed without it (it runs
  under service-role over all users). Generate with `openssl rand -hex 32`.
- `ENVIRONMENT=production` — disables the dev-only `POST /notifications/test` endpoint.

The `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
into deployed functions — do NOT set them manually.

### 1c. Schedule the weekly cron **[you]**
In the Supabase dashboard (Database → Cron, or pg_cron), schedule a Monday 07:00 UTC job that POSTs
`https://<ref>.functions.supabase.co/api/cron/weekly-review` with header `x-cron-secret: <CRON_SECRET>`.

---

## 2. GitHub Actions deploy + backup secrets **[you]**

The `deploy.yml` / `backup.yml` workflows need these repo secrets
(Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase login` → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | dashboard URL / `supabase projects list` |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database |
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string (URI) — for `backup.yml` |

---

## 3. The app's connection to the hosted backend **[you or agent-ok]**

The app reads `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` at **build time**. For
EAS builds these must be set as EAS environment variables (they are public — the anon/publishable
key is safe to embed):

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <publishable/anon key> --environment production
```
(Repeat for the `preview` environment if you want internal builds pointed at the hosted project.)

---

## 4. iOS build → TestFlight

### Option A — LOCAL build (recommended; you're on a Mac) **[you, in Xcode GUI]**
No cloud queue, free, fast. The hosted backend is baked in via `.env.production`.
```bash
bash scripts/ios-release.sh
```
This re-prebuilds `ios/` from `app.json` and opens the Xcode workspace. Then in Xcode:
`Any iOS Device` → **Product → Archive** → **Distribute → App Store Connect → Upload**
(let Xcode "Automatically manage signing" with your Apple team). Xcode handles the Apple ID
sign-in + 2FA in its GUI. Build shows up in App Store Connect → TestFlight in minutes.

Requires: Xcode signed into your Apple Developer account (Xcode → Settings → Accounts).

### Option B — EAS cloud build (fallback / CI) **[you: login, then agent-ok]**
```bash
eas login
eas build --platform ios --profile production   # cloud build; ~15-25 min
eas submit --platform ios --profile production   # uploads to App Store Connect
```
Env vars for EAS builds are already set (`eas env:list --environment production`). First `eas build`
prompts for Apple auth interactively; after that it's non-interactive. `eas.json` submit fields
(appleId/ascAppId/appleTeamId) get filled once the ASC app record exists.

After either path: add yourself as a TestFlight tester and verify on-device — **especially push
notifications**.

---

## 5. App Store submission **[you]**

Follow `docs/app-store-listing.md`:
- Host `docs/privacy-policy.html`, put the URL in ASC.
- Fill privacy labels, keywords, description, age rating.
- Create a demo account with sample data; put credentials in Review notes.
- Upload 6.7" + 6.1" screenshots.
- Select the TestFlight build → Submit for Review.

---

## Rollback (NWE-115)
- **App:** revert to the previous TestFlight/App Store build.
- **Migrations:** forward-only. To undo a schema change, add a NEW migration that reverses it and
  `supabase db push` — never edit an applied migration.
- **Functions:** re-deploy the previous commit's functions (`supabase functions deploy api`).

## Free-tier ops
- Supabase free projects pause after 7 idle days — resume from the dashboard (data retained).
- The weekly `backup.yml` `pg_dump` runs Sundays and keeps a 30-day artifact (free tier has no
  automated backups).
