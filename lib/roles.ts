import type { Ionicons } from "@expo/vector-icons";

/**
 * The role registry: every account type the app knows, with its labels, icon
 * and tabs in ONE place. Screens used to carry their own role unions and
 * `role === "coach" ? ... : ...` ladders, so a new account type had to be
 * added in dozens of files, and any role a screen did not expect quietly fell
 * through to the athlete (or coach) branch.
 *
 * Rules the helpers below keep:
 *  - `recruiter` is shown as Agent, the product's name for that role.
 *  - `team` (a club, school or academy account) is recruiter-side: wherever a
 *    coach is allowed, a team is too. See isRecruiterRole().
 *  - A role this build does not know is never treated as an athlete. It gets
 *    the recruiter tab set, the label "User" and a neutral icon.
 *
 * No runtime imports here on purpose: the store, the services and the screens
 * all read this file, so it must not read any of them back.
 */

/** users.role, as the server stores it. */
export type UserRole =
  | "athlete"
  | "parent"
  | "coach"
  | "recruiter"
  | "team"
  | "admin";

/** recruiter_profiles.role_type. The server derives it from users.role. */
export type RecruiterType = "agent" | "coach" | "team";

type IconName = keyof typeof Ionicons.glyphMap;

interface RoleInfo {
  /** Shown everywhere a role is named: "Team", "Agent"... */
  label: string;
  /** The role badge on a profile and on the More tab. */
  badgeLabel: string;
  /** The card on the signup role step. */
  signupLabel: string;
  /** Lower-case plural for copy: "Connect with other teams". */
  plural: string;
  /** Placeholder / list glyph when the account has no photo. */
  icon: IconName;
  /** Bare tab names of app/(tabs) this role sees in the tab bar. */
  tabs: readonly string[];
  /** Tabs.initialRouteName, and where a wrong-role screen sends them back. */
  initialTab: string;
}

// Coaches, agents and teams scout athletes: Discover, Draft Board, Globe and
// More. No Feed (center "+"): posting reels is the athlete's side.
const RECRUITER_TABS = ["index", "matches", "globe", "more"] as const;

const ROLES: Record<UserRole, RoleInfo> = {
  athlete: {
    label: "Athlete",
    badgeLabel: "Athlete",
    signupLabel: "Player",
    plural: "athletes",
    icon: "person",
    // Reference experience — original 5 tabs.
    tabs: ["index", "matches", "feed", "globe", "more"],
    initialTab: "index",
  },
  coach: {
    label: "Coach",
    badgeLabel: "Coach",
    signupLabel: "Coach",
    plural: "coaches",
    icon: "school",
    tabs: RECRUITER_TABS,
    initialTab: "index",
  },
  recruiter: {
    label: "Agent",
    badgeLabel: "Agent / Recruiter",
    signupLabel: "Agent",
    plural: "agents",
    icon: "briefcase",
    tabs: RECRUITER_TABS,
    initialTab: "index",
  },
  team: {
    label: "Team",
    badgeLabel: "Team",
    signupLabel: "Team / Club",
    plural: "teams",
    icon: "shield",
    tabs: RECRUITER_TABS,
    initialTab: "index",
  },
  parent: {
    label: "Parent",
    badgeLabel: "Parent",
    signupLabel: "Parent",
    plural: "parents",
    icon: "people",
    // Guardian dashboard + Discover + inbox + more. Discover is in because a
    // parent drafts coaches/agents ON BEHALF of their linked athlete (the
    // server proxies the swipe to that athlete). No Feed/Globe: parents don't
    // post, and the globe maps athletes — not who a parent is looking for.
    tabs: ["home", "index", "matches", "more"],
    initialTab: "home",
  },
  admin: {
    label: "Admin",
    badgeLabel: "Admin",
    signupLabel: "Admin",
    plural: "admins",
    icon: "person",
    // Internal console — never sees the player surface.
    tabs: ["dashboard", "reviews", "users", "more"],
    initialTab: "dashboard",
  },
};

/**
 * What a role this build has never heard of gets (a newer server, a later
 * account type). The recruiter tab set rather than the athlete's: it has no
 * Feed "+" to post from, and every screen in it handles an empty deck.
 */
const UNKNOWN_ROLE: RoleInfo = {
  label: "User",
  badgeLabel: "User",
  signupLabel: "User",
  plural: "people",
  icon: "person",
  tabs: RECRUITER_TABS,
  initialTab: "index",
};

/**
 * Everyone who drafts for themselves and owns a plan: athletes and the
 * recruiter side. The allow-list for the Globe, Who Drafted You, the
 * subscription screen and Draft packs. Parents draft for their athlete, on
 * the athlete's plan, and admins have no deck.
 */
export const DRAFTING_ROLES: UserRole[] = [
  "athlete",
  "coach",
  "recruiter",
  "team",
];

/** Every role with a profile and a Discover deck: all but admin. */
export const MEMBER_ROLES: UserRole[] = [...DRAFTING_ROLES, "parent"];

function normalize(role: string | null | undefined): string {
  return (role ?? "").trim().toLowerCase();
}

export function isKnownRole(role: string | null | undefined): role is UserRole {
  return Object.prototype.hasOwnProperty.call(ROLES, role ?? "");
}

/** Registry entry for a users.role or a role_type (`agent` = recruiter). */
function infoFor(role: string | null | undefined): RoleInfo {
  const value = normalize(role);
  const key = value === "agent" ? "recruiter" : value;
  return isKnownRole(key) ? ROLES[key] : UNKNOWN_ROLE;
}

/**
 * The scouting side of recruiting: coaches, agents and teams. They see
 * athletes in Discover, keep a Scout Board, can contact a minor's guardian
 * and share the recruiter profile. Also accepts a recruiter profile's
 * role_type (`agent`), since both spellings reach the app.
 */
export function isRecruiterRole(role: string | null | undefined): boolean {
  const value = normalize(role);
  return (
    value === "coach" ||
    value === "recruiter" ||
    value === "agent" ||
    value === "team"
  );
}

/**
 * The recruiter_profiles.role_type that goes with a users.role, or null for
 * a role that has no recruiter profile. Display only: the server derives the
 * stored value itself and ignores what the app sends.
 */
export function recruiterTypeForRole(
  role: string | null | undefined,
): RecruiterType | null {
  switch (normalize(role)) {
    case "coach":
      return "coach";
    case "recruiter":
    case "agent":
      return "agent";
    case "team":
      return "team";
    default:
      return null;
  }
}

/**
 * The label to show for another person's role, from whatever an API sent:
 * a users.role value (athlete, coach, recruiter, team, parent, admin) or a
 * recruiter profile's role_type (agent, coach, team).
 *
 * One mapping for every header and list. Screens used to print the raw
 * value ("recruiter", lowercase) or fall back to "Agent"/"Coach" for any
 * role they did not expect, which labelled a Community athlete as an agent.
 *
 * Returns null for an empty value so the caller can hide the label; an
 * unknown value is shown capitalised rather than guessed at.
 */
export function roleDisplayLabel(
  role: string | null | undefined,
): string | null {
  const value = (role ?? "").trim();
  if (!value) return null;
  const key = value.toLowerCase();
  if (key === "agent") return ROLES.recruiter.label;
  if (isKnownRole(key)) return ROLES[key].label;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * roleDisplayLabel for places that always print something: "User" when the
 * role is missing, never a guessed "Coach" or "Agent".
 */
export function roleLabelOrUser(role: string | null | undefined): string {
  return roleDisplayLabel(role) ?? UNKNOWN_ROLE.label;
}

/** The viewer's own role badge (Profile, More, a public profile header). */
export function roleBadgeLabel(role: string | null | undefined): string {
  return infoFor(role).badgeLabel;
}

/** The name of a role on the signup role step ("Team / Club"). */
export function roleSignupLabel(role: string | null | undefined): string {
  return infoFor(role).signupLabel;
}

/**
 * Lower-case plural of a role, for copy such as "Connect with other teams".
 * "people" when the role is unknown.
 */
export function rolePlural(role: string | null | undefined): string {
  return infoFor(role).plural;
}

/** Ionicons glyph for an account with no photo. Accepts role_type too. */
export function roleIcon(role: string | null | undefined): IconName {
  return infoFor(role).icon;
}

/**
 * The role to use for navigation: the user's own when this build knows it,
 * otherwise `coach`, so an unknown role is routed like the recruiter set it
 * is shown (see UNKNOWN_ROLE) instead of bouncing between screens that each
 * refuse it. Labels and icons do NOT go through this: an unknown role is
 * still called "User".
 */
export function navRoleFor(role: string): UserRole {
  return isKnownRole(role) ? role : "coach";
}

/**
 * Bare tab name (e.g. "dashboard"), used as Tabs.initialRouteName in
 * app/(tabs)/_layout.tsx and by the focus redirects in lib/roleRoutes.
 */
export function initialTabForRole(role: string | null | undefined): string {
  return infoFor(role).initialTab;
}

/**
 * Whether `tab` is in the tab bar for `role`. With no role yet (signed out,
 * or the store still loading) the four role-specific home tabs stay hidden.
 */
export function tabVisibleForRole(
  tab: string,
  role: string | null | undefined,
): boolean {
  if (!role) {
    return (
      tab !== "dashboard" && tab !== "reviews" && tab !== "users" && tab !== "home"
    );
  }
  return infoFor(role).tabs.includes(tab);
}

// ── Organisation type (team accounts) ───────────────────────────────
// recruiter_profiles.org_type. The values are the database CHECK list
// (migration 047); the labels are what the pickers and cards show.

export const ORG_TYPE_OPTIONS = [
  { value: "club", label: "Club" },
  { value: "school", label: "School" },
  { value: "college", label: "College" },
  { value: "academy", label: "Academy" },
  { value: "pro", label: "Pro" },
  { value: "other", label: "Other" },
] as const;

export type OrgType = (typeof ORG_TYPE_OPTIONS)[number]["value"];

/** "Club", "Academy"... or null when unset or not a value this build knows. */
export function orgTypeLabel(orgType: string | null | undefined): string | null {
  const key = normalize(orgType);
  return ORG_TYPE_OPTIONS.find((o) => o.value === key)?.label ?? null;
}

// A plain web address: optional http(s)://, a host with at least one dot,
// an optional port, then any path. No user@host, no other scheme.
const WEB_ADDRESS =
  /^(?:https?:\/\/)?[^\s/?#@:.]+(?:\.[^\s/?#@:.]+)+(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/**
 * A team's website as a link the app may open, or null. Whatever a team typed
 * is someone else's text by the time another user taps it, so only plain web
 * addresses pass: http(s) only (never tel:, sms: or an app deep link), and a
 * bare "club.com" gets https:// in front.
 */
export function websiteHref(website: string | null | undefined): string | null {
  const value = (website ?? "").trim();
  if (!WEB_ADDRESS.test(value)) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** The website without its scheme and trailing slash, for display. */
export function websiteLabel(website: string | null | undefined): string {
  return (website ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}
