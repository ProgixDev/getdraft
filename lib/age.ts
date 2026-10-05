/**
 * Whole years of age from a date of birth, or null when it is missing or
 * unreadable. Same rule as the server's isMinor(): a birthday later this
 * year has not happened yet.
 *
 * A "YYYY-MM-DD" string is read as a calendar date, not passed to
 * `new Date()`: that parses it as UTC midnight, which is the previous day
 * anywhere west of Greenwich and makes someone a year younger on their
 * birthday.
 */
export function ageFromDob(
  dob: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dob) return null;
  let year: number;
  let month: number; // 0-based
  let day: number;
  if (dob instanceof Date) {
    if (Number.isNaN(dob.getTime())) return null;
    year = dob.getFullYear();
    month = dob.getMonth();
    day = dob.getDate();
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
    if (!m) return null;
    year = Number(m[1]);
    month = Number(m[2]) - 1;
    day = Number(m[3]);
  }
  let age = now.getFullYear() - year;
  const monthDelta = now.getMonth() - month;
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < day)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
