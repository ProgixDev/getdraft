# App Store — reply to Guideline 2.1 (Information Needed)

Paste items 2–7 into **App Store Connect → App Review Information → Notes**.
Item 1 (screen recording) must be attached in the reply.

---

## 1. Screen recording

**You must record this.** Capture on a physical iPhone, latest iOS, starting
from launching the app. Cover, in this order:

1. **Launch** the app from the home screen
2. **Registration** — create a new account with an email address
3. **Login** — sign out, then sign back in with the demo account below
4. **Permission prompts** — show the location prompt during onboarding, and the
   camera / photo library prompts when adding a profile photo
5. **Core flow** — the Discover deck: swipe right to Draft, left to Pass, tap a
   card to open a full profile
6. **A match** — draft an athlete who has already drafted you, so the
   "It's a Draft!" screen appears, then open the chat and send a message
7. **User-generated content** — open the Feed, then demonstrate **reporting**
   (profile menu → Report, and the ⋯ on a post) and **blocking**
   (profile menu → Block)
8. **Account deletion** — More → Settings → Delete Account, and show both
   confirmation prompts

> **There are no purchases to record.** In-app purchases are disabled on iOS in
> this build (`PURCHASES_ENABLED = Platform.OS !== 'ios'`). No subscription,
> paywall or purchase flow is reachable anywhere in the iOS app.

---

## 2. Devices and operating systems tested

> **Fill this in with what you actually tested on.** Do not guess — Apple may
> ask follow-up questions.

```
iPhone [model], iOS [version]
iPhone [model], iOS [version]
```

If it has only been tested in the simulator, say so honestly and test on a
physical device first — Apple reviews on real hardware and states so in this
very message.

---

## 3. App functions and target audience

```
GetDraft is a sports recruiting platform that connects athletes with
coaches, recruiters and agents.

THE PROBLEM

Talented athletes go unrecruited because they have no direct line to the
coaches who are looking for them, and recruiters cannot efficiently find
prospects outside their existing networks. Recruiting today depends on
personal connections, expensive showcase events, and geography.

HOW IT WORKS

Athletes build a profile with their sport, position, level, class year,
photos and highlight video. Coaches, recruiters and agents browse athlete
profiles filtered by sport, position, level and location.

Either side can express interest by "Drafting" the other (swipe right) or
passing (swipe left). When both sides Draft each other it becomes a match,
and only then does messaging open. Nobody can be contacted without having
first expressed interest in the person contacting them.

Additional features: a world ranking board per sport based on profile
strength and interest received, and a map view showing where athletes and
recruiters are located.

TARGET AUDIENCE

- Athletes aged 13 and over, from high school through to professional level
- Coaches, recruiters and agents at schools, colleges, clubs and agencies

Athletes under 18 must link a parent or guardian, who is notified of
recruiter interest and whose approval activates the account.
```

---

## 4. Setup and access instructions

```
DEMO ACCOUNT (recruiter)

Phone:  +213558780131
Code:   123456

Sign in with the phone number above. The verification code is always
123456. This is a sandboxed test number, so no SMS is sent and no code
is required from your side.

The account is already fully set up, so signing in goes straight into
the app. It is a recruiter account, so the Discover deck shows athlete
profiles.

Please use this account rather than creating a new one. New sign-ups go
through third-party identity verification requiring a real passport or
ID document, so a newly created account cannot get past that step.

REACHING EACH FEATURE

Discover      opens on launch. Swipe right to Draft, left to Pass,
              tap a card for the full profile.
Draft Board   second tab. Received / Sent / Matches / Messages.
Globe         third tab. World map of athletes and recruiters.
Rankings      More tab → Rankings. Opens on the World board.
Report        profile screen → ⋯ menu → Report; also the ⋯ on any post,
              and the ⋯ in a chat header.
Block         profile screen → ⋯ menu → Block.
Delete account  More → Settings → Delete Account.

No sample files are required.
```

---

## 5. External services used

```
Supabase    database, authentication and file storage for profiles,
            photos, video and messages
Prelude     SMS one-time codes for phone sign-in
Resend      transactional email (verification, password reset)
Didit       third-party identity verification (KYC) for adult users
Mapbox      map rendering and geocoding for the location features
Expo        push notifications and over-the-air JavaScript updates
Railway     backend API hosting (https://api.getdraft.net)

Stripe is present in the codebase for the Android and web versions but is
NOT active on iOS. Purchases are disabled on this platform, so no payment
processing occurs in the iOS app.

No AI services, advertising SDKs or analytics SDKs are used.
```

---

## 6. Regional differences

```
The app functions identically in all regions. There are no
region-specific features, content or restrictions.

Content is not geo-filtered: users may browse athletes and recruiters
worldwide, and the ranking board covers every country.

The interface is English only.
```

---

## 7. Regulated industry / protected material

```
GetDraft does not operate in a regulated industry and contains no
protected third-party material. There are no team logos, league marks,
broadcast footage or licensed sports data in the app. All profile photos
and video are uploaded by the users themselves.

Identity verification is provided by Didit, a third-party KYC provider
with whom we hold a commercial account. We do not process or store
identity documents ourselves; they are handled by Didit and only the
verification result is returned to us.

Regarding minors: the app is rated 13+ and athletes under 18 must link a
parent or guardian, who is notified of recruiter interest and whose
approval is required to activate the account. Messaging is only possible
after both parties have expressed mutual interest, so no adult can
initiate contact with a minor unsolicited.
```
