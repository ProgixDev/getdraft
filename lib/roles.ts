/**
 * The label to show for another person's role, from whatever an API sent:
 * a users.role value (athlete, coach, recruiter, parent, admin) or a
 * recruiter profile's role_type (agent, coach).
 *
 * One mapping for every header and list. Screens used to print the raw
 * value ("recruiter", lowercase) or fall back to "Agent"/"Coach" for any
 * role they did not expect, which labelled a Community athlete as an agent.
 * `recruiter` is shown as Agent, the product's name for that role.
 *
 * Returns null for an empty value so the caller can hide the label; an
 * unknown value is shown capitalised rather than guessed at.
 */
export function roleDisplayLabel(
  role: string | null | undefined,
): string | null {
  const value = (role ?? "").trim();
  if (!value) return null;
  switch (value.toLowerCase()) {
    case "athlete":
      return "Athlete";
    case "coach":
      return "Coach";
    case "agent":
    case "recruiter":
      return "Agent";
    case "parent":
      return "Parent";
    case "admin":
      return "Admin";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
