# Auth email setup — Emailit SMTP on the hosted project

Transactional auth emails (signup confirmation + password reset) for the **hosted**
project (`tcezjkncjfaammuxagfi`) are sent via **Emailit SMTP**, from the domain
**`omupra.com`**, to the app deep-link **`nutriworkoutexpert://`**.

Two things are separate and both required:
- **Sender domain** (`omupra.com`) — who the email is *from*; governs deliverability (SPF/DKIM).
- **Redirect URL** (`nutriworkoutexpert://`) — where tapping the email link *goes* (into the app).

Everything below is **dashboard + DNS work** (Emailit, your DNS host, Supabase console).
The repo side is already done: `config.toml` documents the SMTP block, `.env` points the
app at the hosted project.

---

## 1. Emailit — confirm omupra.com is a verified sending domain

Already set up in the Emailit account. Just confirm `omupra.com` shows **Verified**
(SPF/DKIM published). The `From` address must be on this verified domain.

## 2. Emailit — SMTP credentials

Emailit's SMTP uses your **API key as the password**; the username is the literal `emailit`.
No separate credential to create.

| SMTP setting | Value |
|---|---|
| Host | `smtp.emailit.com` |
| Port | `587` (TLS / STARTTLS) |
| Username | `emailit` (literal) |
| Password | your **Emailit API key** |
| From | `PGC Creations <no-reply@omupra.com>` (must be on the verified domain) |

## 3. Supabase dashboard — custom SMTP

Project → **Authentication → Emails → SMTP Settings → Enable Custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `no-reply@omupra.com` |
| Sender name | `PGC Creations` |
| Host | `smtp.emailit.com` |
| Port | `587` |
| Username | `emailit` |
| Password | your **Emailit API key** |

## 4. Supabase dashboard — enable confirmations

Project → **Authentication → Providers → Email** → enable **Confirm email**.
(Local `config.toml` intentionally keeps `enable_confirmations = false` so integration
tests aren't gated on email — the hosted setting is independent.)

## 5. Supabase dashboard — redirect URLs

Project → **Authentication → URL Configuration**:

| Field | Value |
|---|---|
| Site URL | `nutriworkoutexpert://` |
| Redirect URLs (allow-list) | `nutriworkoutexpert://*` |

The wildcard covers both deep links the app builds via `Linking.createURL()`:
- signup confirmation → `nutriworkoutexpert:///` (`app/(auth)/sign-in.tsx` `emailRedirectTo`)
- password reset → `nutriworkoutexpert:///reset-password` (`resetPasswordForEmail`)

## 6. Verify on a real device (do NOT skip)

1. Build a dev build pointed at hosted (`.env` already switched; run `npx expo start --clear`).
2. **Sign up** with a real address → confirmation email arrives from `no-reply@omupra.com`
   (check inbox, not spam) → tap link → lands in the app → sign in.
3. **Forgot password** → reset email arrives → tap link → `reset-password` screen → set new
   password → sign in with it.

If mail lands in spam, re-check that omupra.com's SPF/DKIM (and ideally a DMARC record) are
valid — that's the usual cause.
