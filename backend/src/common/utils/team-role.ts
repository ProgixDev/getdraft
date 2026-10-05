import { BadRequestException } from '@nestjs/common';
import { UserRole } from '../types';

/**
 * TEAM_ROLE_ENABLED opens signup for Team accounts (users.role 'team').
 * DEFAULT OFF: only "true", "1", "on" and "yes" switch it on, in any case and
 * with surrounding spaces. Read at call time, like peerAthletesEnabled(), so
 * a test or a late-set variable sees the value actually in the environment.
 *
 * Why a switch at all: the backend deploys itself on every push, while
 * migration 047 (the 'team' value in the users.role CHECK, the signup
 * trigger and the new recruiter_profiles columns) is run by hand. With the
 * switch off nobody can become a team, so no request can reach a database
 * that does not know the role yet, and the deploy may land first. Turn it on
 * only after 047 has been applied.
 *
 * It gates becoming a team, nothing else: the matching, profile and label
 * code for teams is always present and simply has no team to act on.
 */
export function teamRoleEnabled(
  raw: string | undefined = process.env.TEAM_ROLE_ENABLED,
): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  return ['true', '1', 'on', 'yes'].includes(value);
}

export const TEAM_ROLE_DISABLED_MESSAGE = 'Team accounts are not available yet.';

/** 400 when `role` is 'team' while the switch is off. Other roles pass. */
export function assertTeamRoleAvailable(role: unknown): void {
  if (role === UserRole.TEAM && !teamRoleEnabled()) {
    throw new BadRequestException(TEAM_ROLE_DISABLED_MESSAGE);
  }
}
