import {
  athleteCommunityStatus,
  escapeLikePattern,
  isCommunityPeer,
  peerAthletesEnabled,
  sameSport,
} from './community';

// Fixed clock: 2026-09-30.
const now = new Date(Date.UTC(2026, 8, 30, 12));
const facts = (
  sport: string | null,
  dob: string | null,
  activation = 'active',
) => ({
  activation_status: activation,
  athlete_profiles: { sport, date_of_birth: dob },
});

describe('Community rules', () => {
  describe('peerAthletesEnabled', () => {
    it.each(['false', 'FALSE', 'False', '0', 'off', 'OFF', 'no', ' No '])(
      '%p switches athlete Community off',
      (raw) => expect(peerAthletesEnabled(raw)).toBe(false),
    );
    it.each([undefined, '', 'true', '1', 'on', 'yes'])(
      '%p leaves it on (default ON)',
      (raw) => expect(peerAthletesEnabled(raw)).toBe(true),
    );
  });

  describe('athleteCommunityStatus', () => {
    const on = { enabled: true, now };

    it('eligible: youth and adult, with the trimmed sport', () => {
      expect(athleteCommunityStatus(facts(' Soccer ', '2011-03-01'), on)).toEqual({
        eligible: true,
        reason: null,
        sport: 'Soccer',
        ageGroup: 'youth',
      });
      expect(athleteCommunityStatus(facts('Soccer', '2000-03-01'), on)).toEqual({
        eligible: true,
        reason: null,
        sport: 'Soccer',
        ageGroup: 'adult',
      });
    });

    it('reasons, in order', () => {
      expect(
        athleteCommunityStatus(facts('Soccer', '2011-03-01'), {
          enabled: false,
          now,
        }).reason,
      ).toBe('disabled');
      expect(athleteCommunityStatus(facts('Soccer', null), on).reason).toBe(
        'missing_dob',
      );
      expect(athleteCommunityStatus(null, on).reason).toBe('missing_dob');
      expect(athleteCommunityStatus(facts('Soccer', '2014-01-01'), on)).toEqual({
        eligible: false,
        reason: 'under_13',
        sport: 'Soccer',
        ageGroup: null,
      });
      // A DOB in the future is not an adult: under 13.
      expect(athleteCommunityStatus(facts('Soccer', '2030-01-01'), on).reason).toBe(
        'under_13',
      );
      expect(
        athleteCommunityStatus(facts('Soccer', '2011-03-01', 'pending_guardian'), on)
          .reason,
      ).toBe('pending_guardian');
      expect(athleteCommunityStatus(facts('   ', '2011-03-01'), on)).toEqual({
        eligible: false,
        reason: 'missing_sport',
        sport: null,
        ageGroup: 'youth',
      });
    });
  });

  describe('isCommunityPeer', () => {
    const viewer = athleteCommunityStatus(facts('Soccer', '2011-03-01'), {
      enabled: true,
      now,
    });

    it('same sport (any case / spaces) and same age group', () => {
      expect(isCommunityPeer(viewer, facts('  soccer', '2010-06-15'), now)).toBe(true);
    });

    it('rejects another sport, another age group, an ineligible candidate', () => {
      expect(isCommunityPeer(viewer, facts('Basketball', '2010-06-15'), now)).toBe(false);
      expect(isCommunityPeer(viewer, facts('Soccer', '1999-06-15'), now)).toBe(false);
      expect(isCommunityPeer(viewer, facts('Soccer', '2015-06-15'), now)).toBe(false);
      expect(isCommunityPeer(viewer, facts('Soccer', null), now)).toBe(false);
      expect(
        isCommunityPeer(viewer, facts('Soccer', '2010-06-15', 'pending_guardian'), now),
      ).toBe(false);
      expect(isCommunityPeer(viewer, null, now)).toBe(false);
    });

    it('an ineligible viewer has no peers at all', () => {
      const noDob = athleteCommunityStatus(facts('Soccer', null), {
        enabled: true,
        now,
      });
      expect(isCommunityPeer(noDob, facts('Soccer', '2010-06-15'), now)).toBe(false);
    });

    it('the 18th birthday moves an athlete from youth to adult that day', () => {
      // viewer is youth; someone turning 18 today is already an adult.
      expect(isCommunityPeer(viewer, facts('Soccer', '2008-09-30'), now)).toBe(false);
      expect(isCommunityPeer(viewer, facts('Soccer', '2008-10-01'), now)).toBe(true);
    });
  });

  it('sameSport never matches two missing sports', () => {
    expect(sameSport(null, null)).toBe(false);
    expect(sameSport('', '  ')).toBe(false);
    expect(sameSport('Track & Field', ' track & field ')).toBe(true);
  });

  it('escapeLikePattern neutralises LIKE wildcards', () => {
    expect(escapeLikePattern('Soccer')).toBe('Soccer');
    expect(escapeLikePattern('100%_\\')).toBe('100\\%\\_\\\\');
  });
});
