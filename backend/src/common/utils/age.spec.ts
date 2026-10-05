import {
  ADULT_AGE,
  COMMUNITY_MIN_AGE,
  ageFromDob,
  ageGroup,
  ageGroupForAge,
  dobBoundsForAgeGroup,
  isMinor,
  latestDobForAge,
} from './age';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('age helpers', () => {
  // A fixed "now" in the middle of a UTC day: 2026-09-30 15:00Z.
  const now = new Date(Date.UTC(2026, 8, 30, 15, 0, 0));

  describe('ageFromDob', () => {
    it('counts the birthday from the day itself', () => {
      expect(ageFromDob('2008-09-30', now)).toBe(18); // 18th birthday today
      expect(ageFromDob('2008-10-01', now)).toBe(17); // tomorrow
      expect(ageFromDob('2008-09-29', now)).toBe(18); // yesterday
    });

    it('reads a string DOB by its calendar date, like Postgres DATE', () => {
      // new Date() would turn this into 2008-10-01 04:00Z (the 1st) and make
      // the athlete 17; the stored DATE is the 30th.
      expect(ageFromDob('2008-09-30T23:00:00-05:00', now)).toBe(18);
      // A Date (Prisma @db.Date) is read in UTC.
      expect(ageFromDob(utc(2008, 9, 30), now)).toBe(18);
      expect(ageFromDob(utc(2008, 10, 1), now)).toBe(17);
    });

    it('does not depend on the time of day of `now`', () => {
      const startOfDay = new Date(Date.UTC(2026, 8, 30, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(2026, 8, 30, 23, 59, 59));
      expect(ageFromDob('2013-09-30', startOfDay)).toBe(13);
      expect(ageFromDob('2013-09-30', endOfDay)).toBe(13);
    });

    it('handles a 29 February birthday in a non-leap year (turns on 1 March)', () => {
      expect(ageFromDob('2008-02-29', utc(2026, 2, 28))).toBe(17);
      expect(ageFromDob('2008-02-29', utc(2026, 3, 1))).toBe(18);
      expect(ageFromDob('2008-02-29', utc(2028, 2, 29))).toBe(20);
    });

    it('returns null for a missing or unparseable DOB', () => {
      expect(ageFromDob(null, now)).toBeNull();
      expect(ageFromDob(undefined, now)).toBeNull();
      expect(ageFromDob('', now)).toBeNull();
      expect(ageFromDob('not a date', now)).toBeNull();
      expect(ageFromDob('2008-02-31', now)).toBeNull();
    });

    it('returns a negative age for a DOB in the future', () => {
      expect(ageFromDob('2030-01-01', now)).toBeLessThan(0);
    });
  });

  describe('isMinor (guardian gate) keeps its behaviour', () => {
    const years = (n: number, extraDays = 0) => {
      const d = new Date();
      return iso(
        new Date(
          Date.UTC(
            d.getUTCFullYear() - n,
            d.getUTCMonth(),
            d.getUTCDate() - extraDays,
          ),
        ),
      );
    };

    // isMinor reads the real clock; the exact birthday line is covered with a
    // fixed `now` in ageFromDob above.
    it('under 18 is a minor, 18 is not', () => {
      expect(isMinor(years(17, 30))).toBe(true);
      expect(isMinor(years(18, 1))).toBe(false);
      expect(isMinor(years(30))).toBe(false);
    });

    it('a missing DOB is treated as an adult; a future DOB as a minor', () => {
      expect(isMinor(null)).toBe(false);
      expect(isMinor('garbage')).toBe(false);
      expect(isMinor('2999-01-01')).toBe(true);
    });
  });

  describe('ageGroup', () => {
    it('12 has no group, 13-17 youth, 18+ adult', () => {
      expect(ageGroup('2013-10-01', now)).toBeNull(); // 12, 13 tomorrow
      expect(ageGroup('2013-09-30', now)).toBe('youth'); // 13 today
      expect(ageGroup('2008-10-01', now)).toBe('youth'); // 17, 18 tomorrow
      expect(ageGroup('2008-09-30', now)).toBe('adult'); // 18 today
      expect(ageGroup('1990-01-01', now)).toBe('adult');
    });

    it('no DOB or a future DOB has no group', () => {
      expect(ageGroup(null, now)).toBeNull();
      expect(ageGroup('2030-01-01', now)).toBeNull();
    });

    it('ageGroupForAge draws the same lines', () => {
      expect(ageGroupForAge(null)).toBeNull();
      expect(ageGroupForAge(COMMUNITY_MIN_AGE - 1)).toBeNull();
      expect(ageGroupForAge(COMMUNITY_MIN_AGE)).toBe('youth');
      expect(ageGroupForAge(ADULT_AGE - 1)).toBe('youth');
      expect(ageGroupForAge(ADULT_AGE)).toBe('adult');
    });
  });

  describe('dobBoundsForAgeGroup', () => {
    const inBounds = (dob: Date, b: { lte: Date; gt?: Date }) =>
      dob.getTime() <= b.lte.getTime() &&
      (b.gt === undefined || dob.getTime() > b.gt.getTime());

    it('returns UTC-midnight bounds', () => {
      const youth = dobBoundsForAgeGroup('youth', now);
      expect(iso(youth.lte)).toBe('2013-09-30');
      expect(iso(youth.gt!)).toBe('2008-09-30');
      expect(youth.lte.getUTCHours()).toBe(0);
      const adult = dobBoundsForAgeGroup('adult', now);
      expect(iso(adult.lte)).toBe('2008-09-30');
      expect(adult.gt).toBeUndefined();
    });

    // The database filter and the in-code rule must never disagree, so check
    // them against each other day by day across both boundaries, for a
    // normal day and for the leap-day edge cases.
    const nows = [
      now,
      utc(2028, 2, 29), // leap day; 13 and 18 years earlier have no 29th
      utc(2027, 2, 28),
      utc(2027, 3, 1),
      utc(2026, 1, 1),
      utc(2026, 12, 31),
    ];
    it.each(nows.map((n) => [iso(n), n]))(
      'agrees with ageGroup() for every DOB around the lines (now = %s)',
      (_label, when) => {
        const w = when as Date;
        const youth = dobBoundsForAgeGroup('youth', w);
        const adult = dobBoundsForAgeGroup('adult', w);
        for (const years of [COMMUNITY_MIN_AGE, ADULT_AGE]) {
          for (let offset = -400; offset <= 400; offset += 1) {
            const dob = new Date(
              Date.UTC(
                w.getUTCFullYear() - years,
                w.getUTCMonth(),
                w.getUTCDate() + offset,
              ),
            );
            const group = ageGroup(dob, w);
            expect({ dob: iso(dob), youth: inBounds(dob, youth) }).toEqual({
              dob: iso(dob),
              youth: group === 'youth',
            });
            expect({ dob: iso(dob), adult: inBounds(dob, adult) }).toEqual({
              dob: iso(dob),
              adult: group === 'adult',
            });
          }
        }
      },
    );

    it('latestDobForAge uses the 28th when the anniversary year has no 29 February', () => {
      expect(iso(latestDobForAge(18, utc(2028, 2, 29)))).toBe('2010-02-28');
      expect(iso(latestDobForAge(16, utc(2028, 2, 29)))).toBe('2012-02-29');
    });
  });
});
