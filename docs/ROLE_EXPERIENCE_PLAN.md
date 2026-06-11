# Role-based experience plan

**Status:** Phase 0 — proposal awaiting approval. No code changed yet.
**Owner role lives at:** `state.auth.user.role` (`athlete` | `coach` | `recruiter` | `parent` | `admin`).
**Tab system:** `app/(tabs)/_layout.tsx` — single expo-router `Tabs`, already role-conditional via `href: null` for parents on the Discover tab and a relabel `Draft Board → Inbox`.

## 1 · How the app currently behaves per role

What the code actually does today (verified by reading `app/(tabs)/_layout.tsx`, `index.tsx`, `matches.tsx`, `more.tsx`, `profile.tsx`, `feed.tsx`, `globe.tsx`):

| Role | Tab bar today | Home (index) | Feed center button | Globe | Profile editor | Notes / known gaps |
|---|---|---|---|---|---|---|
| Athlete | Discover · Draft Board · Feed · Globe · More | Discover swipe (recruiter cards) | Posts + Reels w/ "+" create | Yes | Athlete profile | This is the reference; basically right. |
| Coach / Recruiter | same as athlete | Discover swipe (athlete cards — role-aware via backend) | Posts + Reels (can create) | Yes | Recruiter profile (org / role_type / sport) | Globe is a vanity tab — out of role. Feed "+" lets a recruiter post highlight reels as if they were an athlete. Draft Board uses the same "Received/Sent/Matches/Messages" terminology that fits athletes; the recruiter sees their *own outgoing* drafts but the framing reads athlete-first. |
| Parent | Inbox(matches relabeled) · Feed · Globe · More (Discover hidden via `href:null`) | Redirects from index → `/(tabs)/matches` (extra paint) | Feed is visible (they can post reels) | Visible | Parent profile EDITOR exposed (`profile.tsx` has parent branch but no real read-only view) | The plan said "parent oversees their athlete" — the current parent UI is **half-gated**: Discover is hidden but Feed + Globe still sit on the bar; there's no guardian dashboard at all; "Recruiter Outreach" lives inside Draft Board as a sub-view. The current parent UX reads as "athlete with Discover removed". |
| Admin | same as athlete (no gating whatsoever) | Discover swipe | Feed | Globe | Athlete or recruiter editor depending on what we shoved in their seed | Truly broken: an admin signing in sees the player flow. `app/admin-guardian-links.tsx` exists but is a hidden route, not promoted to a tab. |

### Other role-coupled call sites (the redirect/gate surface)

- `app/(tabs)/index.tsx:599-602` — `if (isParent) router.replace('/(tabs)/matches')` (parent never sees Discover even via deep link).
- `app/(tabs)/matches.tsx` — branches on `isParent` for fetcher (outreach vs matches), title (`Recruiter Outreach` vs `Draft Board`), tab pills, and the empty/hero state.
- `app/(tabs)/profile.tsx` — branches on `isAthlete | isRecruiter | isParent`. There is **no** admin branch.
- `app/(tabs)/more.tsx` — adds a "Verify your guardian link" item for parents only. No admin-specific items.
- `app/settings.tsx`, `app/preferences.tsx`, `app/edit-profile.tsx`, `app/new-message.tsx`, `app/user/[userId].tsx` — all read `user.role`. None gate admin.

### Backend surface already in place

- **Admin (admin-only @Roles(ADMIN))**: `GET /admin/users` (paginated, filter by role), `PUT /admin/users/:id/verify`, `PUT /admin/users/:id/ban`, `GET /admin/stats` (totalUsers / totalMatches / totalMessages).
- **Guardian reviews (admin-only after the security fix earlier today)**: `GET /guardian-links/admin?status=`, `POST admin/:id/approve|decline`.
- **Parent inbox**: `GET /outreach` (role-aware — parents see incoming outreach), `GET /outreach/:id`, `PUT /outreach/:id/status`, `GET /outreach/:id/messages`, `POST :id/messages`.
- **Guardian/athlete linkage from the parent side**: `guardianLinksService.getMyLink()` already returns the linked athlete (id, name, avatar) when status is `approved`/`pending_admin` — that's the foundation for the guardian dashboard.
- **Globe stats**: `GET /stats/globe`, `/stats/welcome`, `/stats/profile/:userId` — reusable for the admin dashboard cards.

## 2 · Target matrix (proposed)

| Dimension | **Athlete** (reference, unchanged) | **Coach / Recruiter** | **Parent / Guardian** | **Admin** |
|---|---|---|---|---|
| **Tab bar set (L → R)** | Discover · Draft Board · Feed · Globe · More | Discover · Draft Board · Feed · More | Home · Messages · More | Dashboard · Reviews · Users · More |
| **Tab labels** | Discover, Draft Board, (centered play icon), Globe, More | Discover, Draft Board, (centered play icon), More | Home, Messages, More | Dashboard, Reviews, Users, More |
| **Initial tab** | `index` (Discover) | `index` (Discover) | `dashboard` (new) | `dashboard` (new) |
| **Home screen** | Discover swipe (existing) | Discover swipe (existing — already filters athletes) | **NEW** `dashboard.tsx`: linked athlete card (credential), guardian verification status, "Who's scouting your child" feed, recent activity, quick links (replay declaration video / link another athlete) | **NEW** `dashboard.tsx`: platform stats cards (athletes/coaches/recruiters/parents/total), pending guardian reviews count, KYC queue count, link to Reviews and Users. Reuses `/admin/stats` + extra counts from new endpoint. |
| **Center "+" / Feed** | Yes (athlete posts) | **NO** (drop Feed tab; recruiters can browse feed via `/feed?` deep link if we want — not in v1) | **NO** | **NO** |
| **Globe** | Yes | **NO** (drop — vanity tab, the data shows up in the admin dashboard instead) | **NO** | **NO** (the data lives in Dashboard cards) |
| **Profile screen** | `profile.tsx` athlete branch (existing) | `profile.tsx` recruiter branch (existing); also drop the *photo grid/highlight* sections in the recruiter rendering since they're posing as athlete media | **NEW** read-only parent profile view: name, relationship label, verification status (KYC ✓ + guardian-link ✓), linked athlete(s), "edit" only opens basic info (no sport/position) | Profile route shows a minimal admin profile (name, role badge ADMIN, KYC ignored) — explicitly no athlete/recruiter editor; "edit-profile" deep link redirects to More. |
| **Hidden features** | — | Feed (center button), Globe, post-create | Discover, Feed, Globe, post-create, Subscription, Buy-swipes | Discover, Feed, Globe, post-create, Subscription, Buy-swipes, edit-profile, drafts-received, guardian-link, link-guardian |
| **More-menu items** | My Profile · Who Drafted You · Settings · Subscription · Help · Invite · About | My Profile · Settings · Subscription · Help · Invite · About | My Profile · **Verify your guardian link** · **Linked athletes** · Settings · Help · About (no Subscription — billing is athlete-side) | My Profile · Settings · Help · About (drop billing, drop drafts-received, drop invite) |
| **Route guards (deep-link / stale nav)** | none needed | redirect `/buy-swipes`, `/drafts-received` → home | redirect `/(tabs)/index`, `/(tabs)/feed`, `/(tabs)/globe`, `/post-create`, `/subscription`, `/buy-swipes`, `/drafts-received` → `/(tabs)/dashboard` | redirect any of the player routes (Discover/Feed/Globe/profile-edit/subscription/buy-swipes/drafts-received/post-create/guardian-link) → `/(tabs)/dashboard` |
| **NEW screens needed** | none | minor reframe of Draft Board copy (Phase 3); strip the Feed "+" affordance | `app/(tabs)/dashboard.tsx` (Guardian Home); `app/(tabs)/messages.tsx` (thin wrapper over the existing parent-outreach inbox + DMs) | `app/(tabs)/dashboard.tsx`; `app/(tabs)/reviews.tsx` (wraps current `app/admin-guardian-links.tsx` content as a tab); `app/(tabs)/users.tsx` (read-only list w/ search + role filter, calls `/admin/users`) |
| **NEW backend endpoints** | none | none | **`GET /outreach/by-child`** (or extend existing `GET /outreach`): for a parent, list recruiters who reached out to each of their athletes ("who's scouting my child"). The current `GET /outreach` already returns this — verify; only add a derived "scouting summary" if the UI needs counts grouped by athlete. **No new endpoint required** — `getOutreachList` already returns `recruiterName/childName/sentAt/status/unreadCount`. | **`GET /admin/queue-counts`**: returns `{ pendingGuardianReviews, kycPending, kycDeclined, bannedToday }` — single call so the dashboard doesn't fan out. Maybe also **`GET /admin/users` already exists** — keep it. KYC sessions are queryable via supabase-js; cheap to add. |

## 3 · Implementation order (Phase 1+)

Highest impact first per the user's instruction:

1. **Phase 1 — Admin (most broken + most impressive to demo)**
   - New `app/(tabs)/dashboard.tsx` (admin), `app/(tabs)/reviews.tsx`, `app/(tabs)/users.tsx`.
   - Layout: drive tab set from `user.role` in `_layout.tsx` (single layout, conditional `href`).
   - Backend: add `GET /admin/queue-counts`.
   - Route guards added at the top of `index/feed/globe/profile/edit-profile/subscription/buy-swipes/drafts-received/post-create/guardian-link` — redirect admin to `/(tabs)/dashboard`.
   - **One commit:** `feat(roles): admin console`.

2. **Phase 2 — Parent guardian dashboard**
   - New `app/(tabs)/dashboard.tsx` for parents (the file is shared with admin via role-branch *inside* the file, or separate `dashboard-admin.tsx` if cleaner — I'll decide at implement time; my current preference is **two separate files** — `dashboard.tsx` for admin, `home.tsx` for parent — keeps each file focused and lets the typed-routes layer naturally distinguish them).
   - Promote the existing parent-outreach + DM inbox into its own tab `(tabs)/messages.tsx` (thin wrapper of the existing matches/messages code path).
   - Hide Discover/Feed/Globe via `href:null` for parent.
   - Profile branch in `profile.tsx`: read-only guardian view with credential card.
   - Guards for parent on `index/feed/globe/post-create/subscription/buy-swipes/drafts-received`.
   - **One commit:** `feat(roles): guardian experience`.

3. **Phase 3 — Coach / Recruiter polish**
   - Hide Feed center button + Globe for coach/recruiter via `href:null`.
   - In `matches.tsx`, relabel the recruiter-side Draft Board tabs ("Received" = athletes who drafted *me back*, "Sent" = athletes I drafted, "Matches" = mutual, "Messages") — the data is already correct; the framing was athlete-first.
   - In `profile.tsx`, hide the highlight-video upload affordance for recruiters (kept as org-photo only).
   - Guards on `/post-create` for recruiter/coach.
   - **One commit:** `feat(roles): coach/recruiter experience`.

4. **Phase 4 — Athlete regression check + test-plan update**
   - Verify the athlete tab set is byte-identical to today by re-rendering the layout under athlete role.
   - Update `docs/DEVICE_TEST_PLAN.md` with a per-role walkthrough.
   - **One commit:** `docs(test-plan): per-role walkthroughs`.

## 4 · Decisions / corrections / risks (flagged for approval)

- **Layout strategy**: ONE `app/(tabs)/_layout.tsx` that switches the tab set on `user.role` (already half-done). I'll add new tab screens (`dashboard.tsx`, `reviews.tsx`, `users.tsx`, `messages.tsx`, optionally `home.tsx` for parent) registered for all roles via `Tabs.Screen` but with `href: null` per role. The user said "prefer one layout that switches by role" — confirmed.
- **Two `dashboard` screens (admin vs parent)**: my preference is **separate files** (`dashboard.tsx` for admin, `home.tsx` for parent) over a shared file with a role-branch — they're different products. Going to do that unless you push back.
- **Re-using existing screens**: parent `Messages` tab reuses the current `parent-outreach` and DM-inbox code paths verbatim (just rehoused). Admin `Reviews` rehouses `app/admin-guardian-links.tsx` content; the standalone route stays for backwards-compat.
- **Subscription / billing for parents**: the seed plan says "Subscription lives on the athlete account". Confirmed in code: `handleGuardianLinkComplete` is the parents' last onboarding step and they never see the plan picker. Removing the "My Subscription" entry from parent's More menu accordingly.
- **Admin profile**: minimal — there's no admin profile schema. I'll just render their name + role badge "ADMIN" and a logout. No edit, no avatar upload.
- **Globe tab drop for everyone except athletes**: the audit target says "drop Globe or keep — your call" for recruiters. **Decision: drop**. Globe is talent-discovery flavor for athletes browsing; recruiters get the same stats in the discover header anyway. For admins/parents it's irrelevant. This means in `_layout.tsx`, Globe's `href` is `null` for everyone except `athlete`.
- **Center "+" / Feed for recruiters**: per user's brief — "no highlight-reel posting as if they were an athlete". **Decision: drop the Feed tab entirely for recruiters too** (not just the "+"). Feed is athlete social and reads weird as a recruiter. If feedback says recruiters *want* to read the feed, I'll restore via `href: '/feed'` flat and remove the "+" only.
- **Where does a recruiter discover the parent of an athlete to send outreach?**: the current product flow goes via the athlete's profile → parent link. The audit doesn't change that. Outreach **creation** stays where it is.
- **Risks**:
  - Re-keying initial route from `index` to a new route name (`dashboard`/`home`) per role is a known expo-router quirk — `initialRouteName` swaps must match a registered `Tabs.Screen`. I'll register all candidates for all roles and key `initialRouteName` off `user.role`.
  - The new typed routes (`/(tabs)/dashboard`, `/(tabs)/reviews`, `/(tabs)/users`, `/(tabs)/messages`) need `router.d.ts` regenerated — I'll run a brief `expo start` before each tsc per the project rule.
  - Hiding tabs via `href:null` still registers the screen — but if a different role can deep-link into it via `router.push('/(tabs)/dashboard')`, that screen must role-gate too. Each new file gets a top-of-component role guard.
  - Two-line risk on `app/(tabs)/index.tsx`: today it `router.replace`s parents to `/matches`. After Phase 2 it should redirect parents to `/dashboard` (the new guardian home). I'll update that redirect when Phase 2 lands.

## 5 · STOP for approval

Please confirm the matrix above (or call out which cells to change), then I'll execute Phase 1 → Phase 4 in order with one conventional commit per phase. Specifically I'd like a yes/no on:

1. **Drop Feed center button + Globe for everyone except athletes?** (Currently visible for recruiters today.)
2. **Two separate dashboard files (`dashboard.tsx` admin, `home.tsx` parent)** vs one shared file?
3. **Initial tab per role**: athlete=`index`, coach/recruiter=`index`, parent=`home`, admin=`dashboard` — OK?
4. **Parents lose the Subscription menu item** (since billing is athlete-side)?
5. **Admin user list = read-only in v1** (no inline approve/ban) — fine?
