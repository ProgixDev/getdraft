# GetDraft — handover to the incoming project lead

Written 2026-09-08. This is the access map. It contains **no secrets** — it
says what exists, who owns it, and what has to be requested from whom.

The actual keys arrive separately, in one encrypted file called
`GetDraft-ALL-CREDENTIALS.env`. Read §1 before opening it.

---

## 1. What you are being sent

| | |
|---|---|
| **File** | `GetDraft-ALL-CREDENTIALS.env` |
| **Contains** | every environment variable the app and the API need, for local development *and* production |
| **Does NOT contain** | account access — Apple, Play Console, Supabase, Stripe, EAS, Railway, GitHub, DNS. None of that is a value you can paste; it is an invitation someone has to send you. That is §3. |
| **How it should reach you** | encrypted — Signal, 1Password, or a password-protected zip with the password sent through a *different* channel |

Two of the values in it are dangerous, and you should know which before you
put the file anywhere:

- **`STRIPE_SECRET_KEY` is a live key.** Charges made with it are real money
  against the client's account.
- **`SUPABASE_SERVICE_ROLE_KEY` bypasses every row-level security policy** on
  the production database. There is no staging environment — that key edits
  real users' data.

Split the file as its header says: `EXPO_PUBLIC_*` into `.env` at the repo
root, everything else into `backend/.env`. Never move a value from the second
group into the first — Expo inlines `EXPO_PUBLIC_*` into the shipped bundle,
where anyone who unzips the IPA can read it.

### Rotate these on day one

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` were sent in an earlier
transfer over an unencrypted channel. They should be rotated before you rely
on this handover as the only copy:

```
Supabase dashboard -> Settings -> API -> rotate service_role
then update the value on Railway and redeploy
```

`SUPABASE_JWT_SECRET` is read by nothing in the backend (`grep` it — zero
hits). It can be deleted rather than rotated.

---

## 2. What is live right now

| Thing | State |
|---|---|
| **Android** | **live on Google Play**, 1.0.0 (39), package `com.getdraft.app` |
| **iOS** | submitted, came back **Guideline 2.1 — Information Needed**. See `docs/APPSTORE_REVIEW_REPLY.pdf` for the prepared answers |
| **API** | `https://api.getdraft.net/api` on Railway, service `getdraft-api` |
| **Website** | `https://getdraft.net` on Vercel |
| **Database** | Supabase project `icczjnsevyczfllsiamu`, ~26 real users |
| **Payments** | Stripe **live** on web. StoreKit + Play Billing are **written and merged** but switched off (`EXPO_PUBLIC_IAP_ENABLED` unset) because the store products do not exist yet |

**The build currently sitting in Apple review is out of date.** It still
contains the signup-flow bug where the plan step could open Stripe's payment
sheet on iOS — Guideline 3.1.1, an automatic rejection. That was fixed in
`c5807ba`. **Rebuild from `master` before replying to Apple.**

---

## 3. Accounts you need — and who has to grant each

Nothing in this section can be handed over as a password. Ask the owner named
in the last column.

| # | Account | What it is used for | Ask for | Owner |
|---|---|---|---|---|
| 1 | **GitHub** — `ProgixDev/getdraft` | the code, branch `master` | Write, or Admin if you will manage CI | Progix (agency) |
| 2 | **EAS / Expo** — org `getdraft2`, project `getdraft` | every build and submission, **and the Android signing keystore** | Admin on the org | Progix |
| 3 | **Apple Developer** | certificates, provisioning, App Store Connect | Admin or App Manager | client (Patrick) |
| 4 | **Google Play Console** | the live Android listing, and the service account for purchase validation | Admin | client |
| 5 | **Supabase** | database, auth, storage | Owner or Developer on project `icczjnsevyczfllsiamu` | client |
| 6 | **Stripe** | live payments on web | Developer (needs API-key access) | client |
| 7 | **Railway** | the backend host, project `practical-alignment` | member of the project | client |
| 8 | **Resend** | transactional email | member | client |
| 9 | **Prelude** | phone OTP | member | client |
| 10 | **Didit** | identity verification (KYC) | member | client |
| 11 | **Mapbox** | the Globe tab and all location search | member | client |
| 12 | **Vercel** | the landing site | member | Progix |
| 13 | **GoDaddy** (DNS for `getdraft.net`) | the domain, and any future mail records | account access | client |
| 14 | **Google Workspace** (`getdraft.net` mail) | `support@getdraft.net` | admin | client |

### #2 is the one that actually matters

**The Android upload keystore lives in EAS under the `getdraft2` org.** Google
Play will only accept an update signed with that exact key. If access to that
org is lost, the published Android app can never be updated again — the only
remedy is asking Google to reset the upload key, which takes days and is not
guaranteed.

Before anything else, get on that org and take a backup:

```bash
npx eas credentials          # select Android -> production -> download keystore
```

Store the `.jks` and its passwords in the client's password manager, not on a
laptop.

### #7 is awkward and you should know why

Railway belongs to the client and is currently **unpaid** — the last deploy
failed and the service is running on an old build. The CLI works from this
machine through a cached session logged in as the client's account. There is
no seat for the agency. Two consequences:

- `railway up` from a developer machine is the only deploy path that exists
  today, and it has been failing on this office connection (uploads, not
  Railway — a 1 MB upload to a neutral host failed the same way).
- `.github/workflows/deploy-backend.yml` was added to deploy from GitHub's
  runners instead. It needs one secret, `RAILWAY_TOKEN`, which nobody has
  created yet because it requires a paid Railway project.

### #11 — the Mapbox token is NOT in the repo, and that has bitten twice

`EXPO_PUBLIC_MAPBOX_TOKEN` lives in the EAS-hosted environment of project
`@getdraft2/getdraft` (all three environments: production, preview,
development — set 2026-09-20 from the client's own Mapbox account). `.env` is
gitignored, and EAS uses `.gitignore` to decide what to upload, so a cloud
build gets the token **only** from that EAS project.

**A build made from any other EAS project, or a local build, ships with no
token.** The app then shows *"Map unavailable"* on the Globe tab, permanently,
and every country / region / school search returns nothing. No crash, no
error. This is exactly what happened to the iOS 1.0 in the App Store: it was
built outside `getdraft2` — `eas build:list --platform ios` there shows
nothing — so every iPhone user sees a dead map until it is rebuilt.

Before building anywhere other than `getdraft2`, confirm:

```bash
npx eas env:list production      # must show EXPO_PUBLIC_MAPBOX_TOKEN
```

or add it to that project first:

```bash
npx eas env:create production \
  --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk.… --visibility plaintext
```

The token is public by design — it ships inside the bundle. **Do not add a
URL restriction to it in the Mapbox dashboard.** The Globe renders Mapbox
inside a WebView from inline HTML, which sends no website origin, so a
URL-restricted token rejects every tile request and the map dies the same way.
Use the account's default public token as-is; if abuse ever becomes a
problem, rotate it rather than restrict it.

---

## 4. Verify your access actually works

Run these in order. Each one fails loudly if the corresponding access is
missing.

```bash
git clone https://github.com/ProgixDev/getdraft.git && cd getdraft
pnpm install

npx eas whoami                    # must list getdraft2
npx eas env:list production       # must show EXPO_PUBLIC_MAPBOX_TOKEN

curl -s https://api.getdraft.net/api/health          # 200
curl -s -o /dev/null -w '%{http_code}\n' \
  https://api.getdraft.net/api/billing/validate      # 404 today -> see §5

cd backend && pnpm install && pnpm start:dev         # needs backend/.env
```

**Reviewer / test login**, works with no SMS credit (the Prelude balance is
EUR 0.00, so real numbers get `insufficient_balance`):

```
+213558780131   code 123456
```

---

## 5. What is outstanding

Roughly in the order they block something.

1. **Deploy the backend.** `POST /api/billing/validate` returns 404 in
   production — the store-billing module is merged but has never been
   deployed. Until it is, no in-app purchase can be validated on either
   platform. `railway up --service getdraft-api --detach` from `backend/`,
   or set `RAILWAY_TOKEN` and run the GitHub Action.
2. **Railway is unpaid.** The live app depends on it. Client action.
3. **Rebuild and resubmit iOS** from `master`, then answer Apple's 2.1
   questions — the prepared replies are in `docs/APPSTORE_REVIEW_REPLY.pdf`,
   and questions 3–7 need a screen recording plus the list of devices tested.
4. **Create the five store products**, identical IDs on both stores, per
   `docs/BILLING_PRODUCTS_SPEC.md`. Then set `EXPO_PUBLIC_IAP_ENABLED=1` and
   rebuild both apps.
5. **Google Play service account JSON** → `GOOGLE_SERVICE_ACCOUNT_JSON` and
   `ANDROID_PACKAGE_NAME` on Railway. Android purchase validation fails
   *closed* without it: the server refuses to grant rather than trust a
   claim from a device.
6. ~~`support@getdraft.net` is dead~~ **Resolved 2026-09-22**: the mail
   server accepts it (250) and test mail is delivered. It is configured as a
   catch-all — any address @getdraft.net lands in the same mailbox.
7. **Rotate the Supabase keys** (§1).
8. **Stripe and Didit webhooks still point at the old Railway hostname**,
   `getdraft-api-production.up.railway.app`. It still resolves, so nothing is
   broken today, but they should move to `api.getdraft.net`.
9. **`app.json` inconsistency**: `extra.eas.projectId` is
   `2ee1f35a-7930-4c9d-8d7e-71e34b553478` but `updates.url` points at
   `u.expo.dev/5caaadb2-…`, a different project. Builds are fine; OTA updates
   would go to the wrong place. Worth reconciling before anyone tries
   `eas update`.

### Post-launch, not blocking

- **Enable R8 for Android release builds before Feb 2027.** Play's release
  dashboard flags "DEX code optimization below threshold (obfuscation 2%)"
  with a Feb 2027 deadline. Expo leaves R8 off; turn it on with the
  `expo-build-properties` plugin (`android.enableProguardInReleaseBuilds`,
  `enableShrinkResourcesInReleaseBuilds`) and test every native library on a
  device afterwards -- Stripe, react-native-iap / nitro-modules, Reanimated
  and the WebView are the usual R8 casualties and need keep rules. Do it in a
  build of its own, not alongside a feature release.

- **Reports land in a table nobody can read.** `POST /reports` works and is
  surfaced on profiles, posts and chat, but there is no moderation view. Both
  stores expect UGC reports to be *actioned*, so this needs a screen or at
  least a saved SQL query.
- **Push notifications are unfinished** on both platforms. Registration
  works; delivery is not configured. iOS additionally needs an APNs `.p8`
  uploaded to EAS.
- 13 high-severity transitive CVEs in the dependency tree.
- 21 leftover `@getdraft.app` demo users to delete.
- `drafts_100` is priced at $7, the same as the Starter subscription, which
  gives *unlimited* Drafts. Nobody buys the pack at that price — raise it
  with the client before the products go live.

---

## 6. Where things are in the repo

```
app/                      Expo Router screens
  (tabs)/globe.tsx        the Globe — Mapbox GL JS inside a WebView
services/billing.ts       StoreKit / Play Billing client
constants/purchases.ts    the flags that decide what is sellable where
backend/src/modules/
  store-billing/          receipt verification + entitlement
  reports/                UGC reporting
backend/src/database/migrations/    SQL is the source of truth for DDL
```

Docs worth reading before you touch anything:

- `docs/IOS_HANDOFF.md` — iOS specifics, and what is already done
- `docs/BILLING_PRODUCTS_SPEC.md` — the five products, exactly as they must
  be created
- `docs/PLAY_STORE_CHECKLIST.md` — data-safety answers, reviewer notes
- `docs/DEVICE_TEST_PLAN.md` — the end-to-end path

Two conventions that will save you time: every API response is wrapped as
`{ statusCode, data }`, and media buckets are private — a global interceptor
rewrites outbound URLs into signed ones with a 7-day TTL. If an image fails to
load, check the URL is signed before suspecting the client.
