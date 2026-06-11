# Code Review — onboarding-billing port + verification session

**Date:** 2026-06-11 · **Scope:** `git diff a75156d~1..HEAD` (24 commits, ~14k lines) · **Method:** 7 finder angles → independent verification (each finding CONFIRMED against the actual code unless noted).

Ranked most severe first. Fix P0/P1 **before** the Render production deploy.

---

## P0 — Money / safety / security (fix before any production deploy)

### 1. ✅ FIXED `c5f866f` — Free paid plan: `customer.subscription.created` activates on `incomplete` ⚠️ MONEY
`subscriptions.service.ts` ~611. The created/updated handler maps any non-`past_due` status (including `incomplete`) to `active` and writes `plan_id` + upgraded `daily_swipe_limit` immediately. Stripe fires `customer.subscription.created` the instant `createPaymentSheet` creates the `default_incomplete` subscription — **before the card is charged**. A user opens the plan screen, dismisses the Payment Sheet, and keeps Pro + 70 swipes/day for free. Contradicts the code's own comment ("webhook does the final update once Stripe confirms the charge").
**Fix:** only write the paid plan on `invoice.paid`/`payment_succeeded` (or gate the created/updated handler on `status === 'active' || 'trialing'`); on `incomplete`, leave the user on Basic.

### 2. ✅ FIXED `c5f866f` — Unsigned webhooks accepted when `STRIPE_WEBHOOK_SECRET` unset ⚠️ SECURITY
`stripe-webhook.controller.ts` 36-41. If the secret is missing in an env, the controller logs a warning and processes the body **with no signature check**. The route is `@Public()`, so anyone can POST a forged `payment_intent.succeeded`/`subscription.created` with arbitrary `metadata.user_id`/`plan_id` → free Pro + bonus swipes for any account. Easy to hit: the secret is a manual Render env var.
**Fix:** if the secret is unset, reject (500/401) — never process unsigned. Fail closed.

### 3. ✅ FIXED `7dbc889` — Guardian admin endpoints have NO role guard ⚠️ SAFETY (minors) + PII
`guardian-links.controller.ts` ~78 (comment admits "accept any authenticated user"); `guardian-links.service.ts` `adminList`/`adminDecide` also unguarded. Any logged-in user can `POST /api/guardian-links/admin/<id>/approve` to **self-approve their own guardian link**, bypassing the human review that protects minors — and `GET /api/guardian-links/admin` leaks every family's names, emails, questionnaires, and 1-hour signed **declaration-video URLs**.
**Fix:** add the `@Roles('admin')` guard (or equivalent) to all three admin endpoints + a server-side role check in the service.

### 4. ✅ FIXED `5a33877` — `TEST_PHONES` purge is NOT gated to non-production ⚠️ DATA LOSS
`auth.service.ts` 298-300. `completeSignup`'s purge branch (`purgeAuthUsersByPhone` → deletes matching `auth.users`, CASCADE wipes profile/matches/messages) has **no `NODE_ENV !== 'production'` check** — unlike the `000000` OTP bypass, which does. `TEST_PHONES` is in `.env.example` and the Render checklist. If it's ever set in production, completing a signup with that number **deletes the existing account**.
**Fix:** gate the purge with the same `NODE_ENV !== 'production'` check; and the Render checklist must hard-require `TEST_PHONES` empty (already noted — make it a blocking step).

### 5. ✅ FIXED `c117a8b` — Parents can skip the mandatory guardian video via one API call ⚠️ SAFETY
`AuthScreen.tsx` ~258 trusts `me.preferences.dev.guardianSkipped` to mark the guardian step done. `preferences` is a free-form client-writable blob (`update-user.dto.ts` `@IsObject()`, no shape validation; `users.service.ts` writes it verbatim). A parent (or any client) sends `PUT /api/users/me {"preferences":{"dev":{"guardianSkipped":true}}}`, reopens → `finishOnboarding()` with **no QR scan and no declaration video**. The in-app skip button is `__DEV__`-gated but the server isn't.
**Fix:** the guardian-done decision must come from the server (the `guardian_links` row status), never from a client-writable preference. Drop the `guardianSkipped` trust in production logic.

---

## P1 — Broken core features (fix before test day / demo)

### 6. ✅ FIXED `7fda142` — OAuth users are always role `athlete` to the backend
`AuthScreen.tsx` `handleOauthRoleSubmit` writes `public.users.role` via `PUT /users/me` but never updates Supabase `auth.users.user_metadata.role`. `jwt-auth.guard.ts:51` derives role from `user_metadata?.role || 'athlete'`. So an OAuth recruiter gets **403 on `/outreach`**, and an OAuth parent is **not blocked from swiping** (violates parents-don't-swipe). **Fix:** backend must `auth.admin.updateUserById(id, { user_metadata: { role } })` when role is chosen.

### 7. ✅ FIXED `2fe36e8` — Settings toggles destroy onboarding/questionnaire data (and vice-versa)
`settings.tsx` `persist()` sends `preferences` as only the 5 toggle keys; `users.service.ts` `updateMe` does a plain column `.update()` — **no JSONB merge**. `OnboardingQuestionsScreen` (`preferences.onboarding`, "feeds the matching algorithm") and `GuardianLinkScreen` (`preferences.dev`) share the same blob. Flipping any toggle **wipes the questionnaire answers**; completing the questionnaire wipes the toggles. **Fix:** merge server-side (read-modify-write or jsonb `||`), or namespace each writer to merge.

### 8. ✅ FIXED `1aa46e2` — Notification preference toggles control nothing
`notifications.service.ts` `sendPushToUser` reads only `push_tokens` — never consults `preferences.matchAlerts/messageNotifications`. A user turns notifications OFF in Settings (which appears to save) and still gets every push. **Fix:** check the recipient's preference flags before sending each push type.

### 9. ✅ FIXED `a59a858` — KYC: a late webhook can de-verify an approved user
`kyc.service.ts` `applyDecision` mirrors a session's status onto `users.kyc_status` with only per-session idempotency — it never checks the user's current status or whether this is their latest session. A delayed `Abandoned`/`Expired`/`Declined` webhook for an **old** session sets an already-`approved` user back to `none`/`declined`, locking them out. **Fix:** never regress `approved`; only apply if the session is the user's most recent (or guard `if current === 'approved' return`).

### 10. ✅ FIXED `8ddb661` — Chat: messages stop arriving after background→foreground
`app/chat/[threadId].tsx` AppState reconnect calls `chatService.connectSocket()`, which (`services/chat.ts:34`) **creates a new socket instance** when the old one is disconnected — but the effect only re-`joinThread`, never re-binds `new_message`/`user_typing`. After a background cycle, incoming messages and typing silently stop until the screen remounts (and the user *appears* in-thread, so the server also suppresses the push). **Fix:** re-attach listeners after reconnect (extract a `bindSocket(s)` and call it from both mount and reconnect).

### 11. ✅ FIXED `27f5deb` — Returning mid-signup users land on the wrong step
`AuthScreen.tsx:602` login of a non-onboarded user hardcodes `setSignupStep('location')` "for the resume effect to fix" — but the resume effect bails on `signupStep !== 'role'` and isn't keyed on `signupStep`, so it never corrects it. A parent who quit at KYC logs back in and lands on **Location** (a step parents skip). **Fix:** set `'role'` (let resume run) or compute the resume step inline before navigating.

---

## P2 — Real but lower-impact (fix opportunistically)

### 12. ✅ FIXED `adf91ac` — `signup_otps.verify()` doesn't enforce single-use
`signup-otp.service.ts` selects `verified` but never checks it; the same email code can be re-verified within its 10-min TTL (bounded by `MAX_ATTEMPTS=5`) to mint multiple verification tokens. **Fix:** reject if `verified` already true.

### 13. ✅ FIXED `c5f866f` — Webhook swallows handler exceptions → no Stripe retry
`stripe-webhook.controller.ts:52` catches handler errors and returns `{received:true}`, so a transient DB failure on `invoice.paid` means the user paid but is never upgraded, with no redelivery. **Fix:** return non-2xx on handler failure so Stripe retries (keep signature-verify failures as 200-with-error to avoid retry storms on forged bodies).

### 14. ✅ FIXED `6979bd3` — `findAuthUserByPhone` / purge scan only `listUsers` page 1 (perPage 1000)
`auth.service.ts` ~487/53. Past 1000 auth users, a returning phone user beyond page 1 isn't found → login falls through to signup → "phone already exists" → **lockout**. Also O(N) full-directory fetch per login. **Fix:** query `public.users` by the `phone` column (migration 015 added it) instead of scanning the auth directory.

### 15. ✅ FIXED `13f5dcc` — Stripe `invoice.subscription` may be undefined on the pinned API version *(PLAUSIBLE)*
`subscriptions.service.ts` 566/582 read `invoice.subscription`. The code references API `2026-04-22.dahlia`; on 2025+ versions `Invoice.subscription` moved to `invoice.parent.subscription_details.subscription`. If the dashboard endpoint uses a new API version, `subId` is undefined → `payment_failed` never writes `past_due` (unpaid users keep full limits). Depends on the endpoint's configured API version. **Fix:** read the subscription id defensively from both locations; verify the webhook endpoint's API version.

### 16. ✅ FIXED `56325b4` — Legacy `premium` rows render as "Basic/Free" on the subscription screen
`plansData.ts` dropped `premium`; `subscription.tsx:208` does `plans.find(...) ?? plans[0]`. A legacy $15 Premium subscriber sees "Basic / Free / 10 swipes" with manage controls still active → may "upgrade" to Pro on top of Premium. Also `PLAN_SWIPE_LIMITS[premium]` changed `-1`(unlimited)→`70`, so any webhook write silently caps them at 70. **Fix:** keep a display entry for `premium`, or migrate legacy rows to `pro`.

### 17. ✅ FIXED `9209ac0` — Guardian video: `fetch(file://)`→blob→PUT, hardcoded mp4
`GuardianLinkScreen.tsx` ~270. Uploads via `fetch` of a `file://` URI (unreliable on Android — the project's own `uploadsService.uploadFromUri` exists for this reason) and loads the whole 20s video into JS memory; also labels an iOS `.mov` recording as `.mp4`/`video/mp4`. **Fix:** use `FileSystem.uploadAsync`/`uploadsService.uploadFromUri`; derive extension/content-type from the recording.

### 18. ✅ FIXED `84f35f0` — Profile media: files uploaded before the profile-exists check → orphaned storage
`profile.tsx` `handleAddMedia` calls `pickAndUploadMedia` (uploads all files) *then* bails with "Set up your profile first" if `sport`/`organization` missing, leaving the uploads orphaned (no cleanup). **Fix:** validate the profile before uploading.

### 19. ✅ FIXED `37e3666` — Account deletion / orphan auth row on failed phone signup *(from finders, not separately re-verified)*
Normal (non-TEST) phone `completeSignup` checks duplicates against `public.users` only, but `createUser` collides on `auth.users`; an orphan auth row from a prior partial signup blocks the user permanently with no recovery (the purge that would fix it is TEST-only). **Fix:** detect the orphan-auth case and recover, or check `auth.users` in the duplicate path.

---

## Cleanup (no failure, but flagged for maintainability — optional)
- **PaymentSheet init duplicated 4×** (PaymentScreen / AuthScreen / subscription / buy-swipes) — already drifted (`allowsDelayedPaymentMethods` only in one). Extract `presentStripeSheet()`.
- **"ensure Stripe customer" block copy-pasted 3×** — `createCheckout` already missing `metadata.user_id`. Extract.
- **`renderOauthRoleStep`/`renderPhoneRoleStep` ~250 dup lines** in AuthScreen; role-card map rendered 3×. Extract a `RoleStep`.
- **Dead code:** `verificationToken` state set-but-never-read in AuthScreen; legacy `authService.verifyEmail`/`resendOtp` + `/auth/signup`,`/auth/verify-email`,`/auth/resend-otp` endpoints orphaned by the new OTP flow but still publicly reachable (the old `/auth/signup` bypasses the new gate).
- **Guardian relationship→label map hand-copied in 4 files**; **admin signed-URLs generated one-per-row** instead of batch `createSignedUrls`.
- **3 ad-hoc dev backdoors** (TEST_PHONES, KYC dev-approve, guardian dev-stub) with 3 different gating conventions — consider one dev-mode concept.

---

*All P0/P1 and P2 #12–14, #16–18 were independently verified against the code (CONFIRMED). #15 is PLAUSIBLE (depends on the Stripe endpoint's API version). #19 came from the finder pass.*
