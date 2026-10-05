import {
  AgeGroup,
  COMMUNITY_MIN_AGE,
  ageFromDob,
  ageGroupForAge,
} from '../../common/utils/age';

/**
 * Athlete Community rules (athlete <-> athlete peer mode only; recruiting and
 * the coach / agent / team / parent communities are not affected).
 *
 * Community lets athletes Draft each other, which means minors can reach
 * minors, and adults could reach minors. So an athlete only ever sees and
 * matches athletes who:
 *   - play the same sport (athlete_profiles.sport, trimmed, case-insensitive),
 *   - are in the same age group: 13-17 'youth' or 18+ 'adult', from the date
 *     of birth. Under 13 has no Community at all, and no date of birth means
 *     no Community -- there is no age group to put the athlete in,
 *   - are active (a minor's guardian has been approved; adults are active by
 *     default).
 * The server enforces this on the feed, the globe, the swipe and the "who
 * drafted you" list. The app only mirrors it.
 */

export type CommunityReason =
  | 'under_13'
  | 'missing_dob'
  | 'missing_sport'
  | 'pending_guardian'
  | 'disabled';

/** Returned to the app as `community` on GET /discover/feed?mode=peer. */
export interface CommunityStatus {
  eligible: boolean;
  reason: CommunityReason | null;
  /** The viewer's own sport (trimmed) -- the only sport their Community shows. */
  sport: string | null;
  ageGroup: AgeGroup | null;
}

/** What coaches, agents, teams and parents get: their Community has no extra gate. */
export function openCommunity(): CommunityStatus {
  return { eligible: true, reason: null, sport: null, ageGroup: null };
}

/** The columns the rules read, as Prisma selects them (see COMMUNITY_SELECT). */
export interface CommunityFacts {
  activation_status?: string | null;
  athlete_profiles?: {
    sport?: string | null;
    date_of_birth?: Date | string | null;
  } | null;
}

/** Prisma select that fetches exactly the CommunityFacts of a user. */
export const COMMUNITY_SELECT = {
  activation_status: true,
  athlete_profiles: { select: { sport: true, date_of_birth: true } },
} as const;

/**
 * PEER_ATHLETES_ENABLED switches athlete <-> athlete Community off without a
 * rebuild (store review, or the client changing their mind). Default ON.
 * Read at call time so a test, or a process that sets it late, sees the value
 * actually in the environment. "false", "0", "off" and "no" all mean off, in
 * any case and with surrounding spaces -- the old strict `!== 'false'` let
 * PEER_ATHLETES_ENABLED=False or =0 leave it switched on.
 */
export function peerAthletesEnabled(
  raw: string | undefined = process.env.PEER_ATHLETES_ENABLED,
): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(value);
}

/** Trimmed sport, or null when there is none. */
function cleanSport(sport: string | null | undefined): string | null {
  const s = (sport ?? '').trim();
  return s.length > 0 ? s : null;
}

/** Same sport: trimmed, case-insensitive equality. Two missing sports never match. */
export function sameSport(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = cleanSport(a);
  const y = cleanSport(b);
  return x !== null && y !== null && x.toLowerCase() === y.toLowerCase();
}

/**
 * Escape LIKE wildcards. Prisma runs `equals` with mode 'insensitive' as an
 * ILIKE on Postgres, so a sport saved as "%" would otherwise match every
 * sport. Escaped, the ILIKE is an exact case-insensitive comparison.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Where an athlete stands with Community. The first failing rule is the
 * reason, in the order the athlete can do something about it: switched off
 * (nothing to do), no date of birth (add it), under 13 (wait), awaiting a
 * guardian (get approved), no sport (pick one).
 */
export function athleteCommunityStatus(
  facts: CommunityFacts | null | undefined,
  opts: { enabled: boolean; now?: Date },
): CommunityStatus {
  const now = opts.now ?? new Date();
  const sport = cleanSport(facts?.athlete_profiles?.sport);
  const age = ageFromDob(facts?.athlete_profiles?.date_of_birth, now);
  const group = ageGroupForAge(age);

  let reason: CommunityReason | null = null;
  if (!opts.enabled) reason = 'disabled';
  else if (age === null) reason = 'missing_dob';
  else if (age < COMMUNITY_MIN_AGE) reason = 'under_13';
  else if (facts?.activation_status !== 'active') reason = 'pending_guardian';
  else if (!sport) reason = 'missing_sport';

  return { eligible: reason === null, reason, sport, ageGroup: group };
}

/**
 * True when `candidate` belongs in the Community of an (eligible) `viewer`:
 * the candidate is eligible in their own right, in the same age group and
 * playing the same sport. Symmetric for two eligible athletes.
 */
export function isCommunityPeer(
  viewer: CommunityStatus,
  candidate: CommunityFacts | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!viewer.eligible || viewer.ageGroup === null) return false;
  const them = athleteCommunityStatus(candidate, { enabled: true, now });
  return (
    them.eligible &&
    them.ageGroup === viewer.ageGroup &&
    sameSport(them.sport, viewer.sport)
  );
}

/** 403 messages for a viewer who is not eligible, by reason. */
export const COMMUNITY_BLOCKED_MESSAGES: Record<CommunityReason, string> = {
  disabled: 'Community for athletes is turned off right now.',
  missing_dob: 'Add your date of birth to your profile to use Community.',
  under_13: 'Community is for athletes 13 and older.',
  pending_guardian:
    'Community opens once a guardian has approved your account.',
  missing_sport: 'Add your sport to your profile to use Community.',
};

/**
 * 403 message when the TARGET is the problem. One message for every case on
 * purpose: telling a stranger that someone is under 13, or still waiting on a
 * guardian, would leak exactly what these rules protect.
 */
export const COMMUNITY_MISMATCH_MESSAGE =
  'Community connects athletes of the same sport and age group.';
