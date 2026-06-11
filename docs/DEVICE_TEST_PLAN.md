# Device test plan — consolidated test day

Everything deferred from the 2026-06-10/11 session, as tap-by-tap checks.
Run top to bottom — later sections reuse accounts and state from earlier ones.

**Test accounts** (live DB):
| Account | Role | Login |
|---|---|---|
| Akram Telili — `akram@getdraft.app` | athlete, **Starter** plan | email+password (reset earlier) or phone OTP (TEST_PHONES number, code `000000`) |
| Parent (Moncef) — `ichou…@gmail.com` | parent, guardian-linked + approved | email + password |
| `admin@getdraft.app` | admin | email + password |

**Before you start:** backend `npm --prefix backend run start:dev` (port 3000),
Metro `npx expo start --dev-client`, phone on the same network
(ProtonVPN off or split-tunneled; manual URL `exp://<PC-LAN-IP>:8081`).

---

## 0. Stripe CLI webhook forwarding (required for §6–§8)

The plan flip happens in the webhook handler; Stripe can't reach a LAN PC,
so forward events locally:

1. Install (PowerShell): `winget install --id Stripe.StripeCLI -e`
   (or `scoop install stripe`). Open a **new** terminal after install.
2. `stripe login` → browser confirms pairing.
3. `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   → note the printed `whsec_…`.
4. In `backend/.env`: comment the current `STRIPE_WEBHOOK_SECRET` line
   (keep it!) and add the CLI secret under the same name. Restart the
   backend.
5. Sanity check: `stripe trigger payment_intent.succeeded` → backend log
   shows `Stripe webhook: payment_intent.succeeded` (signature valid).
6. **After the test day:** restore the original `STRIPE_WEBHOOK_SECRET`.

---

## 1. Phone login (new feature)

- [ ] **1a — Existing onboarded user logs straight in.**
  Welcome → *Sign in with Phone Number* → your TEST_PHONES number → code
  `000000`. **Expected:** lands directly in the main app as Akram
  (Starter), NO role/password step, NO new account. Backend log shows
  `[phone-login] … existing user … signed in`.
- [ ] **1b — Force-kill + reopen** stays logged in (session persisted).
- [ ] **1c — Unknown number → signup unchanged.** Use a second TEST_PHONES
  number with no account → after `000000`, the role + name + password step
  appears (signup handoff).
- [ ] **1d — Mid-onboarding resume.** Create an account with the second
  number but stop after KYC; force-kill; log in again by phone.
  **Expected:** OTP logs you in and the flow resumes at the step you left
  (not from scratch). Known cosmetic: the email login form may flash
  briefly before the resume jump.

**TEST_PHONES nuances (decisions made, FYI):**
- Login now wins over re-signup: the same test phone can NO longer mint a
  fresh account from the UI. To force a fresh signup on a used test
  number, delete the user in Supabase Auth first (the old purge now only
  runs on the signup path, never on login).
- `000000` works only when `NODE_ENV !== production` AND the number is in
  `TEST_PHONES`. Real numbers always go through Twilio.
- Orphan auth rows (auth user without a profile row) fall back to the
  signup path automatically.

## 2. X-to-skip regression + KYC gate (fresh signup)

- [ ] **2a** — Fresh signup (second test number or email), role **Athlete**
  → location → profile. **Expected:** profile's only exit goes to **KYC**
  (no way to reach plans before KYC — the bypass prop was deleted).
- [ ] **2b** — KYC: use dev-approve → questionnaire → tutorial → plan screen.
- [ ] **2c** — Tap the **X (top-right)** on the plan screen. **Expected:**
  onboarding completes, you land in the app on **Basic / 10 swipes**
  (verify: More → Subscription).

## 3. Settings persistence (A3)

- [ ] More → Settings → flip **Match alerts OFF** and **Profile visible OFF**.
- [ ] Force-kill the app (recents → swipe away) → reopen → More → Settings.
- [ ] **Expected:** both toggles still OFF (hydrated from
  `users.preferences` via GET /users/me — not local-only state).

## 4. Profile media + video route (A4)

- [ ] Profile tab → **+ Add** → pick 2 photos from the gallery →
  **Expected:** both appear in the grid (uploaded, survive app restart).
- [ ] **Long-press** a photo → confirm dialog → delete → **Expected:** gone,
  stays gone after pull-to-refresh.
- [ ] Add or open a **video** → tap it → **Expected:** opens the
  full-screen `/video` player route with native controls; back returns to
  profile.

## 5. Guardian declined path

- [ ] Athlete (Akram): Settings → *Link a guardian* → QR shows.
- [ ] Parent account: scan QR → questionnaire → record + submit declaration
  video.
- [ ] `admin@getdraft.app` → Admin guardian links → **Decline** with a note
  (e.g. "video unclear — please retake").
- [ ] Parent: reopen guardian screen. **Expected:** red **"Link declined"**
  state showing the admin's note verbatim + **Start over** button.
- [ ] Tap **Start over** → **Expected:** clean reset to the QR scan step.
- [ ] While pending (before decline): **pull down** on "Submitted for
  review" → green refresh spinner ("Pull down to check again" hint shows).

## 6. Billing live — upgrade with real webhook (needs §0 running)

- [ ] More → Subscription (as the §2 Basic account) → pick **Pro ($15)** →
  Payment Sheet opens **and stays open** (keep-awake fix) → card
  `4242 4242 4242 4242`, any future expiry, CVC `123` → Pay.
- [ ] **Expected:** within seconds the backend log shows
  `Stripe webhook: invoice.paid` (or `customer.subscription.created`) and
  `user … → plan pro`; the subscription screen shows **Pro / 70 swipes**
  WITHOUT any manual reconciliation.
- [ ] **Zombie-sub regression:** open the Payment Sheet, **dismiss it**,
  open it again, pay. **Expected:** backend log shows
  `[payment-sheet] cancelled stale incomplete sub …`; Stripe dashboard
  shows exactly **one** active subscription for the customer.

## 7. Cancel / resume

- [ ] Subscription screen → **Cancel** → **Expected:** state shows
  "cancels on {period end}" (cancel_at_period_end, not immediate).
- [ ] **Resume** → **Expected:** back to active, no new charge.

## 8. Swipe pack

- [ ] Burn the day's swipes or go directly to **buy-swipes** → pick a pack
  → Payment Sheet → 4242 → Pay.
- [ ] **Expected:** backend log `payment_intent.succeeded` + swipe-pack
  credit line; bonus swipes appear immediately in Discover; the
  `swipe_pack_purchases` row flips pending → succeeded (duplicate webhook
  fires must NOT double-credit).

## 9. Chat real-time (A5 — two devices ideal, or device + second account)

- [ ] Athlete (Akram) ↔ coach/recruiter account with a match or DM.
- [ ] **Typing:** type without sending on A → **Expected:** B sees the
  typing indicator; stop → it clears. Repeat B→A.
- [ ] **Read receipts:** send from A while B has the thread open →
  **Expected:** A's message marks read (not just delivered).
- [ ] **Reconnect:** background the app on A (home button) ≥30 s → reopen →
  B sends a message → **Expected:** it arrives without manual refresh
  (AppState reconnect re-established the socket).

## 10. Push notification + deep-link (A6)

- [ ] Physical device, app **backgrounded** (not force-killed), logged in
  as Akram.
- [ ] From the other account, send Akram a chat message.
- [ ] **Expected:** system notification appears; **tapping it opens the app
  directly on that conversation thread** (not the home tab).
- [ ] Repeat with the app **force-killed** — note result (cold-start
  deep-link is the harder path).

---

## Known gaps / deliberate decisions (don't file as bugs)

- **Apple/Google sign-in** will fail until Supabase OAuth providers +
  `getdraft://auth/callback` redirect are configured (see
  RENDER_DEPLOY_CHECKLIST.md §4).
- **Webhooks on LAN** only work through the Stripe CLI (§0); production
  uses the Render-pointed dashboard endpoint.
- Phone login of a mid-onboarding account may **flash the email login
  form** briefly before resuming — cosmetic, known.
- The June-10 $7 Starter purchase was reconciled manually (webhook gap);
  Akram's account is the result — that's expected state, not drift.
- Old May/early-June test subscriptions in Stripe were left untouched;
  only this session's duplicates were cleaned up.
