# iOS handoff — GetDraft

Same codebase as Android. Expo SDK 54 / React Native 0.81 / expo-router 6.
There is no separate iOS project: `npx eas build --platform ios` builds from
this repo.

---

## What you need from us

| # | Item | Notes |
|---|---|---|
| 1 | **Repo access** | branch `master` |
| 2 | **EAS access** | project `getdraft` under the `getdraft2` org. Ask to be added, or use the owner account |
| 3 | **Apple Developer account** | the client's. Team ID `89884BGNZR` is already in `eas.json` |
| 4 | **App Store Connect access** | to create the app record and the listing |
| 5 | **`.env` files** | `backend/.env` is gitignored. You do **not** need it — see below |

**You almost certainly don't need backend access.** The API is live at
`https://api.getdraft.net/api` and is shared with Android. Nothing
server-side has to change for iOS.

**Reviewer test account** (same one Google uses):
`+213558780131` / code `123456` — pre-onboarded recruiter, `pro` plan.

---

## What is already done

Don't redo these:

- **`ios.bundleIdentifier`** — `com.getdraft.app`
- **All Info.plist usage strings** — photo library (read + add), camera,
  microphone, location-when-in-use
- **`ITSAppUsesNonExemptEncryption`** declared (skips the export-compliance
  prompt on every upload)
- **`privacyManifests`** — required by Apple since 2024
- **`supportsTablet: true`**
- **`appleTeamId`** in `eas.json` submit config
- **No Android-only dependencies.** Nothing in `package.json` needs an iOS
  substitute
- **12 files branch on `Platform.OS`**, 9 with explicit iOS paths — the
  platform differences that were known have been handled

---

## What is NOT done

### 1. In-app purchases are switched OFF on iOS

`constants/purchases.ts` gates `PURCHASES_ENABLED` to false on iOS.

This is deliberate. Subscriptions and Draft packs are digital goods sold
through **Stripe's PaymentSheet** — a full third-party purchase flow inside
the app. Apple enforces StoreKit for digital goods far more strictly than
Google enforces Play Billing, and rejection on a first submission is likely.

So the first iOS build ships with purchases hidden. **An approved iOS app
with no purchases beats no iOS app at all.**

If the client wants payments on iOS, that means **implementing StoreKit /
`expo-in-app-purchases` and wiring it to the existing subscription backend**.
That is the single biggest piece of iOS-only work. The backend already models
plans (`basic` / `starter` / `pro`) and swipe packs (10 / 50 / 100), so the
work is the client side plus a receipt-validation endpoint.

Read the comment block at the top of `constants/purchases.ts` before changing
the flag — it records why the risk was taken on Android and not on iOS.

### 2. Push notifications need APNs

Android uses FCM via `google-services.json`. iOS needs an **APNs key** (`.p8`)
uploaded to EAS. `expo-notifications` is already installed and wired
(`hooks/use-push-notifications.ts`); only the credential is missing.

### 3. No iOS build has ever been made

There is no `ios.buildNumber` in `app.json` and no iOS build in EAS history.
The first `eas build --platform ios` will surface anything that has only ever
been exercised on Android.

### 4. App Store listing is separate from Play

None of the Play Console work carries over. You need a new listing, new
screenshots at Apple's sizes, and Apple's own privacy questionnaire. The
answers are the same as the Play Data safety form — see
`docs/PLAY_STORE_CHECKLIST.md` §5, and `docs/STORE_LISTING.md` for copy.

---

## Things that will bite you

**The Globe is a WebView.** `app/(tabs)/globe.tsx` renders Mapbox GL JS inside
a WebView rather than a native SDK. It works on iOS but is worth testing
early — WebView behaviour differs, especially around gestures and the
`display:none` rules that hide the Mapbox wordmark.

**Sign in with Apple is probably not required.** Apple mandates it only when
you offer *third-party* sign-in (Google, Facebook). This app has email +
password and phone + OTP, no OAuth. If OAuth is ever added, Sign in with Apple
becomes mandatory.

**Media is served through signed URLs.** Photo and video buckets are private;
a global interceptor rewrites outbound URLs to signed ones with a 7-day TTL,
and strips tokens from inbound bodies before storage. If images fail to load
on iOS, check the URL is signed before suspecting the client.

**Minors are in scope.** The audience is 13+, which brings Apple's Kids /
age-rating rules into play much as it did on Play. The guardian-linking flow
(`app/guardian-link.tsx`) matters for that story.

**Reporting and blocking both exist** and Apple asks about them for UGC apps,
same as Google. `POST /reports` plus `components/ReportSheet.tsx`, surfaced on
profiles, posts and chat.

---

## Quick reference

```
Repo branch        master
API                https://api.getdraft.net/api
Bundle ID          com.getdraft.app
Apple Team ID      89884BGNZR
EAS project        getdraft  (org: getdraft2)
Build              npx eas build --platform ios --profile production
Reviewer login     +213558780131 / 123456
Android status     1.0.0 (39) in review on Google Play
```

Useful docs in this repo:

- `docs/PLAY_STORE_CHECKLIST.md` — data-safety answers, reviewer notes
- `docs/STORE_LISTING.md` — descriptions and screenshot order
- `docs/DEVICE_TEST_PLAN.md` — end-to-end test path
