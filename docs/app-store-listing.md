# App Store listing & review package (NWE-803)

Draft copy + the exact answers to fill into **App Store Connect**. Review with the user before
submission; everything here is truthful to the app as built. Screenshots and the final marketing
name are the two things still to produce.

---

## Basics

- **Name (App Store):** NutriWorkoutExpert  *(placeholder — confirm marketing name + check availability in ASC)*
- **Subtitle (30 chars max):** `Food, workouts & AI coaching`
- **Bundle ID:** `com.prangc.nutriworkoutexpert`
- **Primary category:** Health & Fitness
- **Secondary category:** Food & Drink
- **Age rating:** 4+ (no objectionable content). See "Age rating questionnaire" below.
- **Price:** Free
- **Privacy Policy URL:** host `docs/privacy-policy.html` and put the public URL here (required).
- **Support URL / Marketing URL:** a simple page or the privacy-policy URL is acceptable for support.

## Keywords (100 chars, comma-separated, no spaces after commas)

```
nutrition,calorie,macro,food diary,workout,gym,weight,fitness,tracker,AI coach,protein,water,habits
```

## Description

> NutriWorkoutExpert helps you track what you eat, how you train, and how your body is changing —
> then turns that into clear, encouraging guidance.
>
> **Log in seconds.** Search foods, snap a meal photo to estimate it, save recipes and favorites,
> and see your day as Apple-Health-style macro rings. Track water, weight, and workouts with real
> exercise progress charts.
>
> **AI coaching that works from day one.** A weekly review summarizes your week honestly. Generate
> a training program from a short setup. As you log, coaches suggest adjustments — and nothing
> changes your targets or program without your explicit approval.
>
> **Your photos stay on your device.** Meal and progress photos are never stored on our servers.
> AI photo features are strictly opt-in and analyze images only in the moment.
>
> **Built to respect you.** Streaks and badges celebrate real logged actions — never guilt.
> Notifications are fully under your control. Export or delete all your data anytime.
>
> Metric units. iPhone.

## "What's New" (first release)

```
First release. Track food, workouts, water and weight; snap-to-log meals; weekly AI reviews and
coach plans; progress charts; streaks and badges. Your photos stay on your device.
```

---

## App Privacy "nutrition labels" (App Store Connect → App Privacy)

Answer truthfully. Based on the built app:

**Data collected and linked to the user's identity:**
- **Contact Info → Email Address** — App Functionality (account/auth). Not used for tracking.
- **Health & Fitness** — App Functionality. (Food/nutrition, workouts, weight, water, goals.)
- **User Content → Other User Content** — App Functionality. (Recipes, notes, AI text feedback.)
- **Identifiers → User ID** — App Functionality. (Account id.)
- **Diagnostics** — only if you later add crash reporting; **currently none** → do not declare.

**Data explicitly NOT collected:**
- **Photos/Videos → NOT collected.** Photos are stored on-device only and are never uploaded to
  our servers. (The opt-in AI features send a photo to Google Gemini for ephemeral analysis and do
  not store it; declare this in the app description + privacy policy, but per Apple's definition we
  do not "collect" photos because we never receive or retain them.)
- No location, no advertising data, no browsing history, no contacts.

**Tracking:** No. The app does not track users across apps/websites. (No ATT prompt needed.)

> Note: because an opt-in feature transmits a photo to a third party (Google) for processing, be
> ready to explain in App Review notes that (a) it's opt-in with explicit consent, (b) the photo is
> not stored by us, (c) the free-tier processing caveat is disclosed in-app and in the policy.

---

## Age rating questionnaire (answers)

All content questions → **None**. Result: **4+**. The app has no violence, mature themes, gambling,
or user-generated content shared between users. (AI generates body-neutral wellness text only.)

---

## App Review notes (paste into "Notes for Review")

```
Demo account (please use this to review all features):
  Email: <CREATE A DEMO ACCOUNT AND PUT CREDENTIALS HERE>
  Password: <...>
The demo account has sample food/workout/weight data so analytics and AI reviews are populated.

Privacy:
- Meal/progress photos are stored ONLY on the device; they are never uploaded to our servers.
- Two opt-in features (snap-to-log, physique compare) send a photo to Google's Gemini API for
  in-the-moment analysis; the photo is not stored server-side, only the text result. This is
  disclosed to the user with an explicit consent sheet including the free-tier processing caveat,
  and is revocable in Profile.
- Account deletion and full data export are available in-app under Profile → Account (reachable
  within 2 taps), satisfying Apple's account-deletion requirement.

AI content disclosure:
- AI-generated text (weekly reviews, coach plans) is clearly presented as coaching/estimates, is
  body-neutral, and makes no medical claims. No numeric target or program change is applied without
  explicit user approval.
```

---

## Screenshots (still to produce — 803.3)

Required sizes: **6.7" (iPhone 15/16 Pro Max)** and **6.1"** (or the current ASC-required set).
Capture from the simulator (`Cmd+S`) or a device. Suggested 5–6 shots:
1. Today dashboard with macro rings + water
2. Food tab: search + snap-to-log candidate sheet
3. Workouts: routine + exercise progress chart
4. Insights: weekly AI review / coach plan
5. Badges / streaks
6. Physique compare (with the "never stored" reassurance visible)

---

## Pre-submission checklist (803.4)

- [ ] Marketing name decided + availability confirmed in ASC
- [ ] Privacy policy hosted; URL in ASC
- [ ] Demo account created + credentials in Review notes
- [ ] Screenshots uploaded (6.7" + 6.1")
- [ ] Privacy labels filled per above
- [ ] Account deletion reachable in ≤2 taps (verified — Profile → Delete account)
- [ ] Push notifications working in the TestFlight build (APNs via EAS)
- [ ] No broken links (privacy/support URLs resolve)
- [ ] Build uploaded via `eas submit` and selected in ASC
