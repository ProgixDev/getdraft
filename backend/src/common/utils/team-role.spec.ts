import { BadRequestException } from '@nestjs/common';
import {
  RECRUITER_ROLES,
  RecruiterRoleType,
  UserRole,
  isRecruiterRole,
  recruiterRoleTypeFor,
} from '../types';
import {
  TEAM_ROLE_DISABLED_MESSAGE,
  assertTeamRoleAvailable,
  teamRoleEnabled,
} from './team-role';

describe('teamRoleEnabled', () => {
  const original = process.env.TEAM_ROLE_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.TEAM_ROLE_ENABLED;
    else process.env.TEAM_ROLE_ENABLED = original;
  });

  it('is OFF by default', () => {
    delete process.env.TEAM_ROLE_ENABLED;
    expect(teamRoleEnabled()).toBe(false);
    expect(teamRoleEnabled(undefined)).toBe(false);
    expect(teamRoleEnabled('')).toBe(false);
  });

  it.each(['true', '1', 'on', 'yes', 'TRUE', 'On', ' yes ', 'Yes\n'])(
    '%p switches it on',
    (value) => {
      expect(teamRoleEnabled(value)).toBe(true);
    },
  );

  it.each(['false', '0', 'off', 'no', 'enabled', 'y', 't', '2', 'null'])(
    '%p leaves it off',
    (value) => {
      expect(teamRoleEnabled(value)).toBe(false);
    },
  );

  it('reads the environment at call time, not at import', () => {
    process.env.TEAM_ROLE_ENABLED = 'true';
    expect(teamRoleEnabled()).toBe(true);
    process.env.TEAM_ROLE_ENABLED = 'false';
    expect(teamRoleEnabled()).toBe(false);
  });

  it('assertTeamRoleAvailable refuses only a team, and only while off', () => {
    delete process.env.TEAM_ROLE_ENABLED;
    expect(() => assertTeamRoleAvailable(UserRole.TEAM)).toThrow(
      new BadRequestException(TEAM_ROLE_DISABLED_MESSAGE),
    );
    for (const role of [
      UserRole.ATHLETE,
      UserRole.PARENT,
      UserRole.COACH,
      UserRole.RECRUITER,
    ]) {
      expect(() => assertTeamRoleAvailable(role)).not.toThrow();
    }
    process.env.TEAM_ROLE_ENABLED = '1';
    expect(() => assertTeamRoleAvailable(UserRole.TEAM)).not.toThrow();
  });
});

describe('recruiter roles', () => {
  it('coach, agent and team are the recruiting side; nobody else is', () => {
    expect([...RECRUITER_ROLES]).toEqual(['coach', 'recruiter', 'team']);
    for (const role of ['coach', 'recruiter', 'team']) {
      expect(isRecruiterRole(role)).toBe(true);
    }
    for (const role of ['athlete', 'parent', 'admin', '', null, undefined]) {
      expect(isRecruiterRole(role)).toBe(false);
    }
  });

  it('role_type follows the account type', () => {
    expect(recruiterRoleTypeFor('coach')).toBe(RecruiterRoleType.COACH);
    expect(recruiterRoleTypeFor('recruiter')).toBe(RecruiterRoleType.AGENT);
    expect(recruiterRoleTypeFor('team')).toBe(RecruiterRoleType.TEAM);
    for (const role of ['athlete', 'parent', 'admin', 'agent', undefined]) {
      expect(recruiterRoleTypeFor(role)).toBeNull();
    }
  });
});
