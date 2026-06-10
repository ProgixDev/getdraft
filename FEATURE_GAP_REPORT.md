# Feature Gap Report — porting `feat/onboarding-billing-updates` into this project

**Date:** 2026-06-10 · **Analyst:** Claude Code · **Status:** Phase 1 complete, awaiting approval (Phase 2)

## Executive summary

- **Branch 2 (`feat/discover-pinterest-redesign`) requires NO porting.** This workspace *is* that branch — `HEAD` (e5fba6a/587934f) equals `origin/feat/discover-pinterest-redesign` on the same remote. Pinterest Discover, social layer, DMs, ErrorBoundary, build fixes: all already here.
- **Branch 1 (`feat/onboarding-billing-updates`, 48 commits, 102 files, ~13.8k insertions) is the real gap.** Roughly: 60% missing, 25% partial, 15% already done or superseded by newer local work.
- **Ground rules confirmed with owner:** local version always wins (merge additively); the **guardian/parent side — parent declaration video + QR-code linking — is a must-keep priority**.
- **Reality checks vs the mission brief:** this project deploys to **Render** (render.yaml; "Railway stale"), not Railway; the backend is **supabase-js for all modules except Discover (Prisma 6)**; SQL files in `backend/src/database/migrations/` + `backend/MIGRATIONS_TO_RUN.sql` are the DDL source of truth. Adaptations below follow that reality.
- **Migration numbering collision:** workspace owns 001–012 (009 = athlete_demographics, 010 = posts_reels, 011 = comment_likes, 012 = conversations). Reference migrations must be renumbered: 009_user_preferences→**013**, 010_signup_otps→**014**, 011_users_phone→**015**, 013_kyc→**016**, 014_swipe_packs→**017**, 015_guardian_links→**018**.

---

## Feature matrix

| # | Feature | Status here | Risk |
|---|---------|-------------|------|
| F1 | Foundations: deps, app.json plugins/merchantIdentifier, main.ts `rawBody`, .env.example | partial | low |
| F2 | Mail module (nodemailer + SMTP, replaces Resend) | missing | med |
| F3 | Backend-owned email OTP signup (request-otp → verify-otp → complete-signup) | missing (local has own simpler flow — merge) | high |
| F4 | Resend email verification | done differently (local `POST /auth/resend-otp` exists) | low |
| F5 | Phone OTP via Twilio Verify (SMS + WhatsApp) + TEST_PHONES + synthetic email | missing | med |
| F6 | Apple + Google sign-in (Supabase OAuth, PKCE) | missing | med |
| F7 | Welcome landing w/ 4 sign-in options (AuthLanding) + GrainyGradient | missing | med |
| F8 | Forgot-password UI | partial (backend endpoint exists; "Forgot password?" button in local AuthScreen is dead) | low |
| F9 | Stripe native Payment Sheet (+merchantIdentifier, confirmation_secret fix) | missing | med |
| F10 | In-app subscription upgrade + cancel/resume | missing | med |
| F11 | One-off swipe-pack purchases (`bonus_swipes`) | missing | high |
| F12 | Plan restructure: 3 plans, $0/$7/$15, 10/30/70 swipes | done differently (local keeps old 4-plan $0/$3/$7/$15) | **decision needed** |
| F13 | Didit KYC step (OCR+liveness+face match) + HMAC webhook | missing | high |
| F14 | **Guardian linking: athlete QR → parent scan → questionnaire → declaration video → admin review** | missing — **owner priority** | high |
| F15 | Per-role onboarding questionnaire (feeds matching algo, stored in `preferences.onboarding`) | missing | med |
| F16 | Signup flow restructure (role→verify→location→profile→kyc→guardian-link→questions→tutorial→plan) | done differently (local AuthScreen diverged ±1433 lines) | high |
| F17 | Settings persistence via `users.preferences` JSONB | partial (local toggles don't persist; DTO lacks `preferences`) | low |
| F18 | Push notification loop (hook + backend triggers + tap deep-link) | partial (backend module exists, `sendPushToUser` never called; no client hook) | med |
| F19 | Chat typing indicators, read receipts, reconnection | partial (local gateway already emits `user_typing`; frontend lacks indicator/markRead/AppState reconnect) | low |
| F20 | Public profile screen + block (`app/user/[userId].tsx`) | missing (local has blocks schema in migration 006) | med |
| F21 | "Who Drafted You" w/ Pro/Premium gate | **superseded** — local free version (`drafts-received.tsx` + `/discover/who-drafted-me`) wins | n/a |
| F22 | Profile long-press delete photos/videos + `services/media.ts` | missing (no `onLongPress`/delete in local profile.tsx) | low |
| F23 | `profile-edit.tsx` | superseded — local `app/edit-profile.tsx` wins; review for missing capabilities only | low |
| F24 | Stats wiring (welcome counter, globe tab, profile dashboard) | partial — globe **already done** (statsService wired); splash welcome counter missing | low |
| F25 | Full-screen video player route (`app/video.tsx`) | missing | low |
| F26 | More-tab entry points (Who Drafted You, parent "Verify your guardian link") | partial — adapt to `/drafts-received`; add guardian entry with F14 | low |
| F27 | Chores: `.mcp.json.example` (Twilio/Didit MCP), docs, gitignore | missing | low |

---

## Feature detail

### F1 — Foundations (deps/config)
- **Frontend deps to add:** `@stripe/stripe-react-native@0.50.3`, `@supabase/supabase-js`, `react-native-url-polyfill`, `expo-camera`, `expo-notifications`, `expo-device`, `expo-file-system`, `react-native-qrcode-svg`. Already present locally: `expo-video`, `expo-image-picker`, `expo-web-browser`, `expo-clipboard`, `socket.io-client`. **Do NOT re-add `react-native-maps`** (deliberately removed here in b24c300, still in reference package.json).
- **Backend deps to add:** `twilio`, `nodemailer`, `bcrypt`, `jsonwebtoken` + `@types/*`.
- **app.json:** add plugins (expo-camera, expo-notifications, `@stripe/stripe-react-native` with `merchantIdentifier`), `extra.supabaseUrl/supabaseAnonKey`. ⚠️ scheme/bundle-id decision below.
- **backend/src/main.ts:** add `{ rawBody: true }` (required for Stripe + Didit HMAC verification).
- **Conflicts:** local app.json diverged (±16); merge, don't replace.

### F2 — Mail module
- Reference: `backend/src/modules/mail/{mail.module,mail.service}.ts` (+133). Local sends email via Supabase (`supabase.auth.resend`). Port module as-is; wire into auth module. Env: `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`.

### F3/F4 — Email OTP signup
- Reference endpoints: `POST /auth/email/request-otp`, `/auth/email/verify-otp` (returns signed verification JWT), `/auth/complete-signup` (verified contact + password + role). New services `signup-otp.service.ts` (bcrypt-hashed codes, 10-min TTL, 5 attempts) and `verification-token.service.ts` (JWT, `AUTH_VERIFICATION_SECRET`). Migration: `signup_otps` table (→ **014**).
- Local already has `verify-email`, `resend-otp`, `forgot-password` endpoints (own flow). **Merge**: add the three new endpoints alongside; do not remove local ones until AuthScreen flow is switched. Risk: high (security-critical token flow; local auth.service diverged ±44).

### F5 — Phone OTP (Twilio)
- Backend: `twilio.service.ts` (+110, Twilio Verify, SMS/WhatsApp channel), endpoints `POST /auth/phone/request-otp` + `/auth/phone/verify-otp`, TEST_PHONES allowlist (purges prior holder from `auth.users` — supabase-js admin API, stays as-is), synthetic email (`phone@phone.getdraft.app`-style) created then stripped on signup.
- Migration `users_phone` (→ **015**): email nullable, `phone` column + unique partial index, `users_email_or_phone` CHECK. ⚠️ It **redefines `handle_new_user()` trigger** — must be merged against the workspace's current trigger definition (it also inserts default subscription), not copied blindly.
- Frontend: `PhoneInputScreen` (+408), `PhoneVerificationScreen` (+322), `CountryPickerModal` (+239), `constants/phoneCountries.ts` (+148, ISO-code chips, Israel removed). All net-new files locally.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` (or `TWILIO_AUTH_TOKEN`), `TWILIO_VERIFY_SERVICE_SID`, `TEST_PHONES`.

### F6 — Apple + Google OAuth
- `services/supabase.ts` (new, PKCE client + AsyncStorage), `signInWithProvider()` in services/auth.ts, deep-link callback `<scheme>://auth/callback`, in-app browser session (expo-web-browser, already installed). Backend syncs via `/users/me`.
- ⚠️ Depends on scheme/bundle-id decision; Apple Sign-In needs Apple Developer config, Google OAuth client must list the bundle id.

### F7 — Welcome landing
- `AuthLanding.tsx` (+377, entry state machine: phone / email / Apple / Google), `GrainyGradient.tsx` (+105, native-safe dot pattern), updated welcome assets. Local `WelcomeScreen.tsx` diverged ±949 — keep local carousel; mount AuthLanding as the post-carousel entry instead of current direct AuthScreen.

### F9–F11 — Billing
- Backend new endpoints: `POST /subscriptions/payment-sheet` (returns customer + ephemeral key + intent secret; `confirmation_secret` fix for API dahlia), `POST /cancel`, `POST /resume`, `GET /swipe-packs`, `POST /swipe-pack`. Webhook controller hardened (rawBody, logging, idempotent `payment_intent.id`).
- Migration `swipe_packs` (→ **017**): `subscriptions.bonus_swipes INT DEFAULT 0` + `swipe_pack_purchases` audit table.
- ⚠️ **Prisma adaptation (high risk):** reference decrements `bonus_swipes` inside `discover.service.ts` swipe logic — but the local Discover module was ported to **Prisma**. That logic must be rewritten as Prisma queries and `bonus_swipes` added to `schema.prisma` (`subscriptions` model).
- Frontend: PaymentScreen rework to native Payment Sheet (local diverged ±489 — merge), `app/subscription.tsx` upgrade/cancel/resume UI (local diverged ±146 — merge), `app/buy-swipes.tsx` (new +375).
- Env: `STRIPE_PRICE_STARTER/PRO/PREMIUM` (price IDs from Stripe dashboard).

### F13 — Didit KYC
- Backend module `kyc/`: `POST /kyc/start`, `GET /kyc/status`, `POST /kyc/dev-approve`, public `POST /kyc/webhooks/didit` (HMAC-SHA256 over rawBody, `x-signature` header), public `GET /kyc/callback` (redirects to app deep link so in-app browser auto-closes). `didit.service.ts` calls Didit API.
- Migration `kyc` (→ **016**): `users.kyc_status` + `kyc_completed_at`, `kyc_sessions` table. Add to Prisma schema (users model is read by Discover).
- Frontend: `KycVerificationScreen.tsx` (+426), `services/kyc.ts`.
- Env: `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `PUBLIC_BACKEND_URL`. Webhook needs a public URL (Render) or ngrok in dev.

### F14 — Guardian linking ⭐ owner priority
- **Flow:** athlete generates HMAC-signed QR token (`POST /guardian-links/qr`, expiry) → parent scans with expo-camera → relationship questionnaire (relationship enum, lives-with, consent) → watches bundled example video (`assets/example-parent.mp4`, expo-video) → **records ≤20s declaration video with teleprompter overlay** (expo-camera `recordAsync`) → uploads via Supabase Storage signed URL to `guardian-videos` bucket → `POST /guardian-links/submit-video` → status `pending_admin` → admin approves/declines with notes.
- Backend module `guardian-links/` (+489): endpoints `qr`, `my-athlete-links`, `scan`, `video-upload-url`, `submit-video`, `me`, `DELETE /:id`, `admin` list (1h signed video URLs) + `admin/:id/approve|decline`. HMAC secret: `GUARDIAN_QR_SECRET` (falls back to `JWT_SECRET`).
- Migration `guardian_links` (→ **018**): enums `guardian_relationship`, `guardian_link_status` (pending_video/pending_admin/approved/declined/expired), `guardian_links` table, `guardian-videos` storage bucket (created idempotently in code).
- Frontend: `GuardianLinkScreen.tsx` (+1134, steps scan→questions→video-explain→video-example→video-record→submitted, dev-stub escape hatch), `app/link-guardian.tsx` (+390, athlete QR display via react-native-qrcode-svg), `app/guardian-link.tsx` (route wrapper), `app/admin-guardian-links.tsx` (+354, review queue with video playback), `services/guardianLinks.ts` (+97), more-tab parent entry "Verify your guardian link".
- Local conflicts: none (all net-new) — fits local roles (parents don't swipe; this gives parents a verified athlete link). Needs **expo-camera dev build** — won't run in Expo Go.

### F15/F16 — Questionnaire + signup flow restructure
- `OnboardingQuestionsScreen.tsx` (+399): per-role questions, answers stored in `users.preferences.onboarding` (JSONB, `answeredAt` flag — depends on F17 migration).
- Reference step order: `role → (phone-role | oauth-role) → verify → location → profile → kyc → guardian-link (parent only) → questions → tutorial → plan (last; pay via Stripe or X = stay Basic)`.
- ⚠️ Highest-risk merge of the whole port: local AuthScreen diverged ±1433 lines and ProfileSetupScreen ±2361. Strategy: keep local visuals/components, adopt reference step machine, insert new steps as self-contained components.

### F17 — Settings persistence
- Migration `user_preferences` (→ **013**): `users.preferences JSONB NOT NULL DEFAULT '{}'`. Add `preferences`/`role` to local `update-user.dto.ts` (currently missing → PUT silently 400s). Merge hydration + delta-persist into local `app/settings.tsx` (local diverged ±165; also reconcile with local `app/preferences.tsx`). Add column to Prisma users model.

### F18 — Push loop
- New `hooks/use-push-notifications.ts` (+125): permissions, `getExpoPushTokenAsync(projectId)`, register on auth, tap deep-link routing (cold + warm). Backend: local notifications module already has `register-token` + `sendPushToUser` — wire triggers into chat.gateway (message), discover.service (match — **Prisma side here!**), outreach.service; import NotificationsModule in those modules. Env: `EXPO_ACCESS_TOKEN`. Physical device required.

### F19 — Chat polish
- Local gateway already emits `user_typing`; port frontend-only: typing indicator state + debounce, `markRead()` on open/new message (local `services/chat.ts` already has it), AppState reconnection, `socket.off` cleanup → into local `app/chat/[threadId].tsx` (diverged ±406 — merge carefully). DM system (`app/dm/`) untouched by reference; extending it is optional follow-up.

### F20 — Public profile + block
- `app/user/[userId].tsx` (+653) with block action + entry points (chat header etc.). Local has blocks schema (migration 006) and its own newer entry surfaces (feed, DMs) — port screen, then wire entry points from local surfaces (Discover cards, DM header, posts).

### F22/F23/F24/F25/F26 — Profile/media/stats/video/more
- Long-press delete photos/videos + `services/media.ts` + uploads.ts delta: port into local profile.tsx (diverged ±694 — merge).
- `profile-edit.tsx`: skip; diff-review against local `edit-profile.tsx` for any missing field only.
- Stats: globe already wired locally ✅; port splash welcome-counter wiring (statsService into SplashExperience — local splash diverged, keep local JS-setInterval animation pattern per project guardrail).
- `app/video.tsx` (+100): small net-new route; check overlap with local feed/reel player when porting.
- more.tsx: point "Who Drafted You" entry to local `/drafts-received`; add parent guardian entry.

---

## Decision points (need your call in Phase 2)

1. **Plan pricing (F12):** reference = 3 plans $0/$7/$15 (10/30/70 swipes/day, Starter popular, "See who drafted you" as Pro bullet). Local = old 4 plans $0/$3/$7/$15. Recommend **adopting reference pricing** (it's the newer client-driven change) but **dropping the "See who drafted you" bullet** since that's free here by your decision.
2. **App scheme / bundle id:** local = `myroster` / `com.achrefdev.myroster`; reference renamed to `getdraft` / `com.achrefdev.getdraft`. OAuth callbacks, Didit redirect, and push deep links all hang off this. Recommend **renaming to getdraft** (matches brand + reference OAuth config) — but it invalidates existing installed builds, so it's your call.
3. **KYC universality:** reference forces every signup through Didit KYC between profile and payment. Keep universal, or make it skippable in dev/for some roles?
4. **Plan gate on who-drafted-you:** confirmed superseded (stays free) — listed only for the record.

## Proposed porting order (one commit per step, tsc green both sides each time)

1. **F1+F27 Foundations** — deps, app.json plugins, main.ts rawBody, `.env.example`, `.mcp.json.example`
2. **Migrations 013–018** + `MIGRATIONS_TO_RUN.sql` + Prisma schema additions (no behavior change)
3. **F2 Mail module** → **F3/F4 email OTP backend**
4. **F5 Phone OTP backend** (Twilio + TEST_PHONES)
5. **F14 Guardian linking — full stack** ⭐ (backend module → athlete QR screen → parent scan/questionnaire/video → admin screen → more-tab entry)
6. **F13 KYC — full stack**
7. **F9 Payment Sheet → F10 upgrades/cancel/resume → F11 swipe packs** (incl. Prisma rewrite of bonus_swipes in Discover)
8. **F7 AuthLanding/welcome + F5-frontend phone screens + F6 OAuth + F8 forgot-password UI**
9. **F15 questionnaire + F16 flow restructure** (the big AuthScreen merge — last among auth work, everything it mounts already exists)
10. **F17 settings, F18 push loop, F19 chat polish, F20 public profile, F22 media delete, F24 splash counter, F25 video route, F26 more entries**
11. **Final review** — re-run gap analysis, update this report, list Render env vars + manual dashboard steps

## New environment variables (set in Render + backend/.env; templates go in backend/.env.example)

| Var | Feature |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | F2 |
| `AUTH_VERIFICATION_SECRET` (openssl rand -base64 48) | F3 |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, (`TWILIO_AUTH_TOKEN` alt), `TWILIO_VERIFY_SERVICE_SID`, `TEST_PHONES` (dev only) | F5 |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `PUBLIC_BACKEND_URL` | F13 |
| `GUARDIAN_QR_SECRET` | F14 |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM` | F9–F11 |
| `EXPO_ACCESS_TOKEN` | F18 |
| `FRONTEND_URL` (app scheme) | F6/F13 |
| app.json `extra.supabaseUrl` / `extra.supabaseAnonKey` (frontend) | F6 |

## Manual steps you'll own (Phase 4 checklist preview)

- Stripe dashboard: create 2–3 recurring prices + swipe-pack one-off prices; webhook endpoint → Render URL; Apple Pay merchant id.
- Twilio: Verify service ("GetDraft Verify"), API key, WhatsApp sender (optional).
- Didit: workflow id, webhook URL + shared secret.
- Supabase: enable Apple + Google OAuth providers (client ids/secrets, redirect URL), create `guardian-videos` bucket happens automatically in code.
- Gmail/SMTP: app password for dev.
- Device testing: phone OTP, OAuth (real bundle id), Payment Sheet, camera QR scan + video record (dev build, not Expo Go), push notifications (physical device).
