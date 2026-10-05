/**
 * Age rules, in one place, so the guardian gate (isMinor), the Community age
 * groups and the public "age" on a profile can never disagree about how old
 * somebody is.
 *
 * Everything is computed on UTC calendar dates. A date of birth is a calendar
 * date with no time zone: Postgres stores it as DATE, supabase-js returns it
 * as 'YYYY-MM-DD' and Prisma as a Date at UTC midnight. Reading it with local
 * getters (which isMinor used to do) shifts it by a day on any server that is
 * not running in UTC, and would let the minor gate and the age groups
 * disagree on a birthday. Production runs in UTC, so this changes nothing
 * there; it only removes the dependency on the server's clock setting.
 */

/** Community is closed below this age. */
export const COMMUNITY_MIN_AGE = 13;
/** From this age a person is an adult: no guardian gate, 'adult' group. */
export const ADULT_AGE = 18;

/** Community age group: 13-17 are 'youth', 18+ are 'adult'. */
export type AgeGroup = 'youth' | 'adult';

type DobInput = string | Date | null | undefined;

/**
 * The UTC calendar date (year, month 0-11, day) of a date of birth, or null
 * when it is missing or unparseable. A string is read by its leading
 * YYYY-MM-DD, exactly as Postgres reads a DATE, so '2008-03-14T23:00-05:00'
 * is the 14th here too (new Date() would make it the 15th).
 */
function dobParts(
  dateOfBirth: DobInput,
): { y: number; m: number; d: number } | null {
  if (!dateOfBirth) return null;
  if (typeof dateOfBirth === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth.trim());
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]) - 1;
      const d = Number(match[3]);
      // Reject impossible dates ('2008-02-31') instead of letting Date roll
      // them over into the next month.
      const probe = new Date(Date.UTC(y, m, d));
      if (
        probe.getUTCFullYear() !== y ||
        probe.getUTCMonth() !== m ||
        probe.getUTCDate() !== d
      ) {
        return null;
      }
      return { y, m, d };
    }
  }
  const date =
    dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
  };
}

/**
 * Whole years between `dateOfBirth` and `now`: a birthday counts from the day
 * itself, and someone born on 29 February turns a year older on 1 March in a
 * non-leap year (the same rule as Postgres' age()).
 *
 * Returns null when the date of birth is missing or unparseable. A date in the
 * future gives a NEGATIVE number rather than null on purpose: isMinor() must
 * keep treating it as a minor (fail closed), and Community treats it as under
 * 13. Callers that display an age must hide negatives themselves.
 */
export function ageFromDob(
  dateOfBirth: DobInput,
  now: Date = new Date(),
): number | null {
  const dob = dobParts(dateOfBirth);
  if (!dob) return null;
  let age = now.getUTCFullYear() - dob.y;
  const monthDelta = now.getUTCMonth() - dob.m;
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.d)) {
    age -= 1;
  }
  return age;
}

/**
 * True when `dateOfBirth` indicates an age strictly under 18.
 *
 * A missing / unparseable DOB returns false (treated as an adult) so the
 * minor-activation gate is never applied to accounts whose age we can't
 * actually verify — this keeps every existing account and every
 * non-athlete role (which don't collect DOB) on the normal path.
 */
export function isMinor(dateOfBirth: DobInput): boolean {
  const age = ageFromDob(dateOfBirth);
  return age !== null && age < ADULT_AGE;
}

/**
 * The Community age group for a date of birth: 'youth' (13-17) or 'adult'
 * (18+). null when the DOB is missing or unparseable, or when the person is
 * under 13 -- they have no group because Community is closed to them.
 */
export function ageGroup(
  dateOfBirth: DobInput,
  now: Date = new Date(),
): AgeGroup | null {
  return ageGroupForAge(ageFromDob(dateOfBirth, now));
}

/** ageGroup() for an age that is already computed. */
export function ageGroupForAge(age: number | null): AgeGroup | null {
  if (age === null || age < COMMUNITY_MIN_AGE) return null;
  return age < ADULT_AGE ? 'youth' : 'adult';
}

/**
 * The latest calendar date on which somebody born then is at least `years`
 * old on `now` (UTC midnight): age >= years  <=>  dob <= this date.
 *
 * On 29 February, `years` earlier may be a year without a 29th. Nobody can be
 * born on a day that did not exist, so the bound is the 28th: born on 1 March
 * of that year, you are still `years - 1` today, exactly as ageFromDob says.
 */
export function latestDobForAge(years: number, now: Date = new Date()): Date {
  const y = now.getUTCFullYear() - years;
  const m = now.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(now.getUTCDate(), lastDayOfMonth)));
}

/**
 * Date-of-birth bounds for an age group, for a database filter:
 *   youth  13 <= age < 18   <=>  dob <= latestDobForAge(13) AND dob > latestDobForAge(18)
 *   adult  age >= 18        <=>  dob <= latestDobForAge(18)
 * Both bounds are UTC midnights, so they compare cleanly against a DATE
 * column. Unit-tested against ageGroup() day by day across the boundaries.
 */
export function dobBoundsForAgeGroup(
  group: AgeGroup,
  now: Date = new Date(),
): { lte: Date; gt?: Date } {
  if (group === 'youth') {
    return {
      lte: latestDobForAge(COMMUNITY_MIN_AGE, now),
      gt: latestDobForAge(ADULT_AGE, now),
    };
  }
  return { lte: latestDobForAge(ADULT_AGE, now) };
}
