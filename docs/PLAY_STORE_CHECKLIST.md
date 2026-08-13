# Play Store deployment — step by step

Package `com.getdraft.app` · Version `1.0.0`
Console account: **Patrick's** (the listing belongs to whoever owns the account — it cannot be moved later without a transfer)

---

## Before you start

| Thing | Status |
|---|---|
| Backend | ✅ live and verified |
| Security fixes | ✅ applied to the database |
| Onboarding | ✅ completes on a real device |
| Privacy policy URL | ✅ live |
| Signed AAB | ⬜ build it (step 1) |
| Reviewer account | ⬜ **most common rejection — do not skip** |
| Store assets | ⬜ graphics + text |
| Prelude credit | ⬜ no real phone can receive a code without it |

---

## 1 · Build the AAB

The store needs an **AAB**, not an APK. An APK is for sideloading and cannot be
uploaded.

```bash
cd "c:/Users/Omen/Documents/projects/moblie app"
npx eas build --platform android --profile production
```

Takes 20–40 minutes. When it finishes, download the `.aab` from the link the
CLI prints.

Check first that `git status` is clean and you are on the commit you intend to
ship — the build uploads your working directory, not the last commit.

---

## 2 · Create the app in Play Console

**All apps → Create app**

| Field | Value |
|---|---|
| App name | `GetDraft` |
| Default language | English (or French — match the store copy) |
| App or game | App |
| Free or paid | **Free** (subscriptions are in-app) |

Confirm the declarations, then create. The package name is fixed by the build:
`com.getdraft.app`.

---

## 3 · App access — the step that gets apps rejected

GetDraft shows **nothing** until you sign in. A reviewer who cannot get in
marks the app broken and rejects it. This field exists precisely for that.

**App content → App access → All or some functionality is restricted**

Add an instruction set:

```
Name:     Recruiter demo account
Username: +213558780131
Password: 123456
```

And in the notes field, paste this verbatim:

```
Sign in with the phone number above. The verification code is
always 123456 — this is a sandboxed test number, no SMS is sent
and no code is required from your side.

This account is already set up, so signing in takes you straight
into the app. It is a recruiter account: the Discover deck shows
athlete profiles, which you can Draft (swipe right) or Pass
(swipe left).
```

**The account is deliberately pre-onboarded.** Left as a fresh signup it
would land the reviewer in onboarding, which requires a date of birth and
then third-party identity verification (Didit) — a reviewer will not upload
a real passport, so they would reach "Finish later — log out" and never see
the app. That is the single most likely rejection for this product, and it
is avoided by the account already being complete.

**It is a recruiter, not an athlete, on purpose.** An athlete's Discover deck
shows recruiters, and there are none in the database yet, so an athlete
reviewer would see an empty app. A recruiter sees the real athlete profiles
that do exist.

Verified against production: sign-in returns `onboarded: true`,
`activation: active`, and the Discover feed and talent map both return a real
athlete profile with photos.

---

## 4 · Store listing

**Grow → Store presence → Main store listing**

| Asset | Requirement |
|---|---|
| App icon | 512 × 512 PNG, 32-bit |
| Feature graphic | 1024 × 500 |
| Phone screenshots | 2–8, min 320 px on the short side |
| Short description | ≤ 80 characters |
| Full description | ≤ 4000 characters |

Keep the product vocabulary consistent with the app: **Draft** and **Pass**,
not Like and X. "Draft Board". "It's a Draft!". CEGEP before U SPORTS in any
Canadian pathway copy.

Screenshots: take them from a real device on the current build. Discover,
a profile, the Draft Board, rankings.

---

## 5 · Data safety — must match what the app actually does

**App content → Data safety.** Google checks this against real behaviour and
inaccuracy is a common rejection.

Declare **collected and linked to the user**:

| Category | Items |
|---|---|
| Personal info | Name, email, phone, date of birth |
| Location | Approximate **and precise** |
| Photos & videos | Profile media, posts, guardian consent recordings |
| Messages | Direct messages between users |
| Financial info | Purchase history (processed by Stripe) |
| App activity | In-app interactions |
| Identifiers | User ID, push token |

Also declare: encrypted in transit · users can request deletion · identity
verification performed by a third party (Didit).

### The storage question — closed

User media is **no longer publicly readable**. Verified on the live project:

| Bucket | Public? | |
|---|---|---|
| `avatars`, `photos`, `videos`, `posts` | **No** | signed URLs only |
| `guardian-videos` | No | was already private |
| `sports` | Yes | product icons, not user data |

Every response now carries a signed URL instead of a public one, issued by a
global interceptor so no endpoint can be missed. Confirmed end to end:

- The old public URL of a real photo → **400**. The leak is closed.
- The same photo through the API → signed URL, **200**, image loads.
- A signed URL submitted back on save → **token stripped**, canonical URL
  stored. Without that, the app would have persisted an expiring token and
  the photo would have vanished a week later.

Deletion was fixed alongside it: storage does not cascade, so removing an
account previously left every file in place and a deleted user's photos
stayed downloadable indefinitely. `purgeUserMedia` now clears all five
buckets.

**Kill switch:** set `MEDIA_SIGNING=off` in Railway to fall back to public
URLs instantly, without a deploy. The buckets would need flipping back to
public as well.

Answer Data Safety accordingly — **encrypted in transit: yes** (HTTPS
throughout), **users can request deletion: yes**, and media is access
controlled rather than open to anyone holding a link.

---

## 6 · Content rating

**App content → Content rating.** Complete the IARC questionnaire honestly.

Declare **user-generated content** and **person-to-person messaging** — the app
has both. Undeclared chat commonly triggers a re-rating after launch.

---

## 7 · Target audience

**App content → Target audience and content.**

This app is used by high-school athletes, so minors are in scope. Selecting any
under-18 bracket brings the Play **Families policy** into play: stricter rules
on data collection and ads.

- **Ads:** none — declare no ads.
- Expect closer scrutiny of `ACCESS_FINE_LOCATION`, `CAMERA` and
  `RECORD_AUDIO` alongside a minor audience.

---

## 8 · Remaining declarations

- **Privacy policy** → `https://getdraft-api-production.up.railway.app/api/privacy`
- **Ads** → No
- **Government apps** → No
- **Financial features** → No (subscriptions are not a financial product)
- **Health** → No

---

## 9 · Internal testing first

**Testing → Internal testing → Create new release**

Upload the AAB, add testers by email, publish. Available in **minutes** with no
review wait. Install from the Play link and confirm it works before touching
production — this is the same artifact users will get, which sideloading an APK
does not prove.

> **Check which account type Patrick has.** A **personal** developer account
> created after November 2023 must run a **closed test with 12 testers for 14
> days** before production access is granted. **Organisation** accounts are
> exempt. This changes your timeline by two weeks, so find out early.

---

## 10 · Production release

**Production → Create new release** → upload the AAB → release notes → review
and roll out.

First review usually takes a few days; apps with a minor audience often take
longer.

---

## Known risks going in

1. **In-app purchases.** The app sells subscriptions through Stripe's native
   payment sheet rather than Google Play Billing. This was a deliberate,
   informed decision. If it is rejected on Payments policy, the switch is one
   line — set `PURCHASES_ENABLED` in `constants/purchases.ts` to
   `Platform.OS === 'web'`, rebuild, resubmit. The gating is already written and
   tested.
2. **Supabase free plan.** No backups, 1 GB of storage total (~65 videos across
   all users), and the project suspends itself when idle — which has already
   caused one full outage. Upgrade before real users create data you cannot
   recreate.
3. **Prelude has no credit.** Phone signup fails for every real number. Email
   signup works. Top up before launch.

---

## Quick reference

```
Package        com.getdraft.app
Version        1.0.0
API            https://getdraft-api-production.up.railway.app/api
Privacy        https://getdraft-api-production.up.railway.app/api/privacy
Terms          https://getdraft-api-production.up.railway.app/api/terms
Reviewer login +213558780131  /  123456   (recruiter, pre-onboarded)
Build          npx eas build --platform android --profile production
OTA (JS only)  npx eas update --branch production --platform android
```
