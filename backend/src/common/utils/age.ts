/**
 * True when `dateOfBirth` indicates an age strictly under 18.
 *
 * A missing / unparseable DOB returns false (treated as an adult) so the
 * minor-activation gate is never applied to accounts whose age we can't
 * actually verify — this keeps every existing account and every
 * non-athlete role (which don't collect DOB) on the normal path.
 */
export function isMinor(
  dateOfBirth: string | Date | null | undefined,
): boolean {
  if (!dateOfBirth) return false;
  const dob =
    dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age < 18;
}
