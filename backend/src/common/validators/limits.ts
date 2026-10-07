import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Size limits for what people type into a profile. Before these, only the
 * 1 MB body limit applied: a 1 MB bio was served on every Discover card
 * (50 to a page), and a long name pushed "X drafted you" past the push size
 * limit. Generous on purpose: the longest stored values on 2026-10-07 were a
 * 21-character name, a 253-character bio and 6 photos.
 */
export const LIMITS = {
  name: 100,
  /** Team, position, level, agency, organisation, relationship, ... */
  short: 100,
  /** location, country, region */
  place: 200,
  bio: 2000,
  /** awards, tags */
  listItems: 30,
  listItem: 200,
  /** photos, videos */
  media: 30,
  url: 2048,
  /** users.preferences, as JSON text */
  preferencesBytes: 16_384,
} as const;

/** The value, as JSON, is at most `max` characters. */
export function MaxJsonSize(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'maxJsonSize',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: {
        message: `${propertyName} is too large`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          try {
            return JSON.stringify(value).length <= max;
          } catch {
            return false;
          }
        },
      },
    });
}
