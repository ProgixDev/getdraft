import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import {
  CurrentUserPayload,
  UserRole,
  SwipeDirection,
  DiscoverMode,
  PlanId,
  PLAN_SWIPE_LIMITS,
  SUPER_DRAFT_LIMITS,
  planFeatures,
} from '../../common/types';
import { dobBoundsForAgeGroup } from '../../common/utils/age';
import { NotificationsService } from '../notifications/notifications.service';
// Athlete ↔ athlete Community rules (same sport, same age group, active,
// PEER_ATHLETES_ENABLED switch) live in community.ts; this service applies
// them to the feed, the globe, the swipe and "who drafted you".
import {
  COMMUNITY_BLOCKED_MESSAGES,
  COMMUNITY_MISMATCH_MESSAGE,
  COMMUNITY_SELECT,
  CommunityStatus,
  athleteCommunityStatus,
  escapeLikePattern,
  isCommunityPeer,
  openCommunity,
  peerAthletesEnabled,
} from './community';

/**
 * Globe pins are rounded to 2 decimals (~1 km). Signup stores the precise
 * coordinates Mapbox returns for the address typed in, which for most people
 * is their home; a pin must show the area, never the house.
 */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Globe placement ────────────────────────────────────────────────
// CA/US division mapping for the rankings view + anywhere else that
// asks "is this user in the CA or US ranking pool?" Intentionally narrow
// — adding countries here would silently widen the rankings divisions.
// Globe placement uses the much broader COUNTRY_CENTROIDS map below.
// (Currently unreferenced inside this file after placeByCountry switched
// to COUNTRY_CENTROIDS; kept for parity with the rankings view and for
// future TS callers that need the CA/US/OTHER classification.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function normalizeCountryToKey(country: string | null): string | null {
  const c = (country ?? '').trim().toLowerCase();
  if (['canada', 'ca', 'can'].includes(c)) return 'CA';
  if (
    [
      'usa',
      'us',
      'united states',
      'united states of america',
      'u.s.a.',
      'u.s.',
      'america',
    ].includes(c)
  ) {
    return 'US';
  }
  return null;
}

// Country -> approximate centroid for globe placement. Used ONLY by
// placeByCountry when a user has a country but no precise lat/lng (signup now
// stores real coords from Mapbox, so this is the legacy/fallback path).
//
// Generated from the mledoze/countries dataset — every ISO 3166-1 country and
// territory (250). Previously ~86 hand-listed countries, which meant an athlete
// from anywhere else with no coords was silently dropped from the map
// ("dropped N athlete(s) with no coords and an unsupported country").
//
// Keys are the lowercased common name; legacy/alternate spellings resolve via
// COUNTRY_ALIASES below. Adding a country here only plots its athletes near the
// centroid — it does NOT affect the CA/US division logic above.
const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "afghanistan": { lat: 33.0, lng: 65.0 },
  "albania": { lat: 41.0, lng: 20.0 },
  "algeria": { lat: 28.0, lng: 3.0 },
  "american samoa": { lat: -14.33, lng: -170.0 },
  "andorra": { lat: 42.5, lng: 1.5 },
  "angola": { lat: -12.5, lng: 18.5 },
  "anguilla": { lat: 18.25, lng: -63.17 },
  "antarctica": { lat: -90.0, lng: 0.0 },
  "antigua and barbuda": { lat: 17.05, lng: -61.8 },
  "argentina": { lat: -34.0, lng: -64.0 },
  "armenia": { lat: 40.0, lng: 45.0 },
  "aruba": { lat: 12.5, lng: -69.97 },
  "australia": { lat: -27.0, lng: 133.0 },
  "austria": { lat: 47.33, lng: 13.33 },
  "azerbaijan": { lat: 40.5, lng: 47.5 },
  "bahamas": { lat: 24.25, lng: -76.0 },
  "bahrain": { lat: 26.0, lng: 50.55 },
  "bangladesh": { lat: 24.0, lng: 90.0 },
  "barbados": { lat: 13.17, lng: -59.53 },
  "belarus": { lat: 53.0, lng: 28.0 },
  "belgium": { lat: 50.83, lng: 4.0 },
  "belize": { lat: 17.25, lng: -88.75 },
  "benin": { lat: 9.5, lng: 2.25 },
  "bermuda": { lat: 32.33, lng: -64.75 },
  "bhutan": { lat: 27.5, lng: 90.5 },
  "bolivia": { lat: -17.0, lng: -65.0 },
  "bosnia and herzegovina": { lat: 44.0, lng: 18.0 },
  "botswana": { lat: -22.0, lng: 24.0 },
  "bouvet island": { lat: -54.43, lng: 3.4 },
  "brazil": { lat: -10.0, lng: -55.0 },
  "british indian ocean territory": { lat: -6.0, lng: 71.5 },
  "british virgin islands": { lat: 18.43, lng: -64.62 },
  "brunei": { lat: 4.5, lng: 114.67 },
  "bulgaria": { lat: 43.0, lng: 25.0 },
  "burkina faso": { lat: 13.0, lng: -2.0 },
  "burundi": { lat: -3.5, lng: 30.0 },
  "cambodia": { lat: 13.0, lng: 105.0 },
  "cameroon": { lat: 6.0, lng: 12.0 },
  "canada": { lat: 60.0, lng: -95.0 },
  "cape verde": { lat: 16.0, lng: -24.0 },
  "caribbean netherlands": { lat: 12.18, lng: -68.25 },
  "cayman islands": { lat: 19.5, lng: -80.5 },
  "central african republic": { lat: 7.0, lng: 21.0 },
  "chad": { lat: 15.0, lng: 19.0 },
  "chile": { lat: -30.0, lng: -71.0 },
  "china": { lat: 35.0, lng: 105.0 },
  "christmas island": { lat: -10.5, lng: 105.67 },
  "cocos (keeling) islands": { lat: -12.5, lng: 96.83 },
  "colombia": { lat: 4.0, lng: -72.0 },
  "comoros": { lat: -12.17, lng: 44.25 },
  "congo": { lat: -1.0, lng: 15.0 },
  "cook islands": { lat: -21.23, lng: -159.77 },
  "costa rica": { lat: 10.0, lng: -84.0 },
  "croatia": { lat: 45.17, lng: 15.5 },
  "cuba": { lat: 21.5, lng: -80.0 },
  "curaçao": { lat: 12.12, lng: -68.93 },
  "cyprus": { lat: 35.0, lng: 33.0 },
  "czechia": { lat: 49.75, lng: 15.5 },
  "denmark": { lat: 56.0, lng: 10.0 },
  "djibouti": { lat: 11.5, lng: 43.0 },
  "dominica": { lat: 15.42, lng: -61.33 },
  "dominican republic": { lat: 19.0, lng: -70.67 },
  "dr congo": { lat: 0.0, lng: 25.0 },
  "ecuador": { lat: -2.0, lng: -77.5 },
  "egypt": { lat: 27.0, lng: 30.0 },
  "el salvador": { lat: 13.83, lng: -88.92 },
  "equatorial guinea": { lat: 2.0, lng: 10.0 },
  "eritrea": { lat: 15.0, lng: 39.0 },
  "estonia": { lat: 59.0, lng: 26.0 },
  "eswatini": { lat: -26.5, lng: 31.5 },
  "ethiopia": { lat: 8.0, lng: 38.0 },
  "falkland islands": { lat: -51.75, lng: -59.0 },
  "faroe islands": { lat: 62.0, lng: -7.0 },
  "fiji": { lat: -18.0, lng: 175.0 },
  "finland": { lat: 64.0, lng: 26.0 },
  "france": { lat: 46.0, lng: 2.0 },
  "french guiana": { lat: 4.0, lng: -53.0 },
  "french polynesia": { lat: -15.0, lng: -140.0 },
  "french southern and antarctic lands": { lat: -49.25, lng: 69.17 },
  "gabon": { lat: -1.0, lng: 11.75 },
  "gambia": { lat: 13.47, lng: -16.57 },
  "georgia": { lat: 42.0, lng: 43.5 },
  "germany": { lat: 51.0, lng: 9.0 },
  "ghana": { lat: 8.0, lng: -2.0 },
  "gibraltar": { lat: 36.13, lng: -5.35 },
  "greece": { lat: 39.0, lng: 22.0 },
  "greenland": { lat: 72.0, lng: -40.0 },
  "grenada": { lat: 12.12, lng: -61.67 },
  "guadeloupe": { lat: 16.25, lng: -61.58 },
  "guam": { lat: 13.47, lng: 144.78 },
  "guatemala": { lat: 15.5, lng: -90.25 },
  "guernsey": { lat: 49.47, lng: -2.58 },
  "guinea": { lat: 11.0, lng: -10.0 },
  "guinea-bissau": { lat: 12.0, lng: -15.0 },
  "guyana": { lat: 5.0, lng: -59.0 },
  "haiti": { lat: 19.0, lng: -72.42 },
  "heard island and mcdonald islands": { lat: -53.1, lng: 72.52 },
  "honduras": { lat: 15.0, lng: -86.5 },
  "hong kong": { lat: 22.27, lng: 114.19 },
  "hungary": { lat: 47.0, lng: 20.0 },
  "iceland": { lat: 65.0, lng: -18.0 },
  "india": { lat: 20.0, lng: 77.0 },
  "indonesia": { lat: -5.0, lng: 120.0 },
  "iran": { lat: 32.0, lng: 53.0 },
  "iraq": { lat: 33.0, lng: 44.0 },
  "ireland": { lat: 53.0, lng: -8.0 },
  "isle of man": { lat: 54.25, lng: -4.5 },
  "israel": { lat: 31.47, lng: 35.13 },
  "italy": { lat: 42.83, lng: 12.83 },
  "ivory coast": { lat: 8.0, lng: -5.0 },
  "jamaica": { lat: 18.25, lng: -77.5 },
  "japan": { lat: 36.0, lng: 138.0 },
  "jersey": { lat: 49.25, lng: -2.17 },
  "jordan": { lat: 31.0, lng: 36.0 },
  "kazakhstan": { lat: 48.0, lng: 68.0 },
  "kenya": { lat: 1.0, lng: 38.0 },
  "kiribati": { lat: 1.42, lng: 173.0 },
  "kosovo": { lat: 42.67, lng: 21.17 },
  "kuwait": { lat: 29.5, lng: 45.75 },
  "kyrgyzstan": { lat: 41.0, lng: 75.0 },
  "laos": { lat: 18.0, lng: 105.0 },
  "latvia": { lat: 57.0, lng: 25.0 },
  "lebanon": { lat: 33.83, lng: 35.83 },
  "lesotho": { lat: -29.5, lng: 28.5 },
  "liberia": { lat: 6.5, lng: -9.5 },
  "libya": { lat: 25.0, lng: 17.0 },
  "liechtenstein": { lat: 47.27, lng: 9.53 },
  "lithuania": { lat: 56.0, lng: 24.0 },
  "luxembourg": { lat: 49.75, lng: 6.17 },
  "macau": { lat: 22.17, lng: 113.55 },
  "madagascar": { lat: -20.0, lng: 47.0 },
  "malawi": { lat: -13.5, lng: 34.0 },
  "malaysia": { lat: 2.5, lng: 112.5 },
  "maldives": { lat: 3.25, lng: 73.0 },
  "mali": { lat: 17.0, lng: -4.0 },
  "malta": { lat: 35.83, lng: 14.58 },
  "marshall islands": { lat: 9.0, lng: 168.0 },
  "martinique": { lat: 14.67, lng: -61.0 },
  "mauritania": { lat: 20.0, lng: -12.0 },
  "mauritius": { lat: -20.28, lng: 57.55 },
  "mayotte": { lat: -12.83, lng: 45.17 },
  "mexico": { lat: 23.0, lng: -102.0 },
  "micronesia": { lat: 6.92, lng: 158.25 },
  "moldova": { lat: 47.0, lng: 29.0 },
  "monaco": { lat: 43.73, lng: 7.4 },
  "mongolia": { lat: 46.0, lng: 105.0 },
  "montenegro": { lat: 42.5, lng: 19.3 },
  "montserrat": { lat: 16.75, lng: -62.2 },
  "morocco": { lat: 32.0, lng: -5.0 },
  "mozambique": { lat: -18.25, lng: 35.0 },
  "myanmar": { lat: 22.0, lng: 98.0 },
  "namibia": { lat: -22.0, lng: 17.0 },
  "nauru": { lat: -0.53, lng: 166.92 },
  "nepal": { lat: 28.0, lng: 84.0 },
  "netherlands": { lat: 52.5, lng: 5.75 },
  "new caledonia": { lat: -21.5, lng: 165.5 },
  "new zealand": { lat: -41.0, lng: 174.0 },
  "nicaragua": { lat: 13.0, lng: -85.0 },
  "niger": { lat: 16.0, lng: 8.0 },
  "nigeria": { lat: 10.0, lng: 8.0 },
  "niue": { lat: -19.03, lng: -169.87 },
  "norfolk island": { lat: -29.03, lng: 167.95 },
  "north korea": { lat: 40.0, lng: 127.0 },
  "north macedonia": { lat: 41.83, lng: 22.0 },
  "northern mariana islands": { lat: 15.2, lng: 145.75 },
  "norway": { lat: 62.0, lng: 10.0 },
  "oman": { lat: 21.0, lng: 57.0 },
  "pakistan": { lat: 30.0, lng: 70.0 },
  "palau": { lat: 7.5, lng: 134.5 },
  "palestine": { lat: 31.9, lng: 35.2 },
  "panama": { lat: 9.0, lng: -80.0 },
  "papua new guinea": { lat: -6.0, lng: 147.0 },
  "paraguay": { lat: -23.0, lng: -58.0 },
  "peru": { lat: -10.0, lng: -76.0 },
  "philippines": { lat: 13.0, lng: 122.0 },
  "pitcairn islands": { lat: -25.07, lng: -130.1 },
  "poland": { lat: 52.0, lng: 20.0 },
  "portugal": { lat: 39.5, lng: -8.0 },
  "puerto rico": { lat: 18.25, lng: -66.5 },
  "qatar": { lat: 25.5, lng: 51.25 },
  "romania": { lat: 46.0, lng: 25.0 },
  "russia": { lat: 60.0, lng: 100.0 },
  "rwanda": { lat: -2.0, lng: 30.0 },
  "réunion": { lat: -21.15, lng: 55.5 },
  "saint barthélemy": { lat: 18.5, lng: -63.42 },
  "saint helena, ascension and tristan da cunha": { lat: -15.95, lng: -5.72 },
  "saint kitts and nevis": { lat: 17.33, lng: -62.75 },
  "saint lucia": { lat: 13.88, lng: -60.97 },
  "saint martin": { lat: 18.08, lng: -63.95 },
  "saint pierre and miquelon": { lat: 46.83, lng: -56.33 },
  "saint vincent and the grenadines": { lat: 13.25, lng: -61.2 },
  "samoa": { lat: -13.58, lng: -172.33 },
  "san marino": { lat: 43.77, lng: 12.42 },
  "saudi arabia": { lat: 25.0, lng: 45.0 },
  "senegal": { lat: 14.0, lng: -14.0 },
  "serbia": { lat: 44.0, lng: 21.0 },
  "seychelles": { lat: -4.58, lng: 55.67 },
  "sierra leone": { lat: 8.5, lng: -11.5 },
  "singapore": { lat: 1.37, lng: 103.8 },
  "sint maarten": { lat: 18.03, lng: -63.05 },
  "slovakia": { lat: 48.67, lng: 19.5 },
  "slovenia": { lat: 46.12, lng: 14.82 },
  "solomon islands": { lat: -8.0, lng: 159.0 },
  "somalia": { lat: 10.0, lng: 49.0 },
  "south africa": { lat: -29.0, lng: 24.0 },
  "south georgia": { lat: -54.5, lng: -37.0 },
  "south korea": { lat: 37.0, lng: 127.5 },
  "south sudan": { lat: 7.0, lng: 30.0 },
  "spain": { lat: 40.0, lng: -4.0 },
  "sri lanka": { lat: 7.0, lng: 81.0 },
  "sudan": { lat: 15.0, lng: 30.0 },
  "suriname": { lat: 4.0, lng: -56.0 },
  "svalbard and jan mayen": { lat: 78.0, lng: 20.0 },
  "sweden": { lat: 62.0, lng: 15.0 },
  "switzerland": { lat: 47.0, lng: 8.0 },
  "syria": { lat: 35.0, lng: 38.0 },
  "são tomé and príncipe": { lat: 1.0, lng: 7.0 },
  "taiwan": { lat: 23.5, lng: 121.0 },
  "tajikistan": { lat: 39.0, lng: 71.0 },
  "tanzania": { lat: -6.0, lng: 35.0 },
  "thailand": { lat: 15.0, lng: 100.0 },
  "timor-leste": { lat: -8.83, lng: 125.92 },
  "togo": { lat: 8.0, lng: 1.17 },
  "tokelau": { lat: -9.0, lng: -172.0 },
  "tonga": { lat: -20.0, lng: -175.0 },
  "trinidad and tobago": { lat: 11.0, lng: -61.0 },
  "tunisia": { lat: 34.0, lng: 9.0 },
  "turkmenistan": { lat: 40.0, lng: 60.0 },
  "turks and caicos islands": { lat: 21.75, lng: -71.58 },
  "tuvalu": { lat: -8.0, lng: 178.0 },
  "türkiye": { lat: 39.0, lng: 35.0 },
  "uganda": { lat: 1.0, lng: 32.0 },
  "ukraine": { lat: 49.0, lng: 32.0 },
  "united arab emirates": { lat: 24.0, lng: 54.0 },
  "united kingdom": { lat: 54.0, lng: -2.0 },
  "united states": { lat: 38.0, lng: -97.0 },
  "united states minor outlying islands": { lat: 19.3, lng: 166.63 },
  "united states virgin islands": { lat: 18.35, lng: -64.93 },
  "uruguay": { lat: -33.0, lng: -56.0 },
  "uzbekistan": { lat: 41.0, lng: 64.0 },
  "vanuatu": { lat: -16.0, lng: 167.0 },
  "vatican city": { lat: 41.9, lng: 12.45 },
  "venezuela": { lat: 8.0, lng: -66.0 },
  "vietnam": { lat: 16.17, lng: 107.83 },
  "wallis and futuna": { lat: -13.3, lng: -176.2 },
  "western sahara": { lat: 24.5, lng: -13.0 },
  "yemen": { lat: 15.0, lng: 48.0 },
  "zambia": { lat: -15.0, lng: 30.0 },
  "zimbabwe": { lat: -20.0, lng: 30.0 },
  "åland islands": { lat: 60.12, lng: 19.9 },
};

// Aliases (variants of the same country) → canonical lowercase key in
// COUNTRY_CENTROIDS. Avoids duplicating centroid coordinates.
const COUNTRY_ALIASES: Record<string, string> = {
  ca: 'canada',
  can: 'canada',
  us: 'united states',
  usa: 'united states',
  'u.s.': 'united states',
  'u.s.a.': 'united states',
  'united states of america': 'united states',
  america: 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  uae: 'united arab emirates',
  emirates: 'united arab emirates',
  korea: 'south korea',
  'republic of korea': 'south korea',
  rsa: 'south africa',
  'hong kong sar': 'hong kong',
  hk: 'hong kong',
  nz: 'new zealand',
  holland: 'netherlands',
  'russian federation': 'russia',
  // Renamed countries: profiles saved under the old name must still resolve,
  // otherwise those athletes silently vanish from the globe.
  turkey: 'türkiye',
  turkiye: 'türkiye',
  'republic of turkey': 'türkiye',
  'czech republic': 'czechia',
  swaziland: 'eswatini',
  burma: 'myanmar',
  macedonia: 'north macedonia',
  "cote d'ivoire": 'ivory coast',
  "côte d'ivoire": 'ivory coast',
  'cabo verde': 'cape verde',
  'democratic republic of the congo': 'dr congo',
  'republic of the congo': 'congo',
};

function normalizeCountryForCentroid(country: string | null): string | null {
  const raw = (country ?? '').trim().toLowerCase();
  if (!raw) return null;
  // Centroid hit (or alias hit) wins; otherwise null.
  if (COUNTRY_CENTROIDS[raw]) return raw;
  const aliased = COUNTRY_ALIASES[raw];
  if (aliased && COUNTRY_CENTROIDS[aliased]) return aliased;
  return null;
}

// Stable per-user hash so the country offset is deterministic (same spread
// every reload, and two same-country athletes don't stack on one point).
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Narrows a feed to one wilaya / state / province. Shared by the card feed and
 * the globe so the two can never disagree about what a filter means.
 *
 * Exact match rather than the `contains` the city filter uses, because both
 * sides of this comparison come from the same source: the value stored at
 * signup and the value picked in the filter are both a Mapbox `region.name`,
 * so they are the same string. Case-insensitive only because geocoding results
 * are not guaranteed to be capitalised identically across calls.
 *
 * Exactness is also what makes it indexable — migration 039 indexes
 * `lower(region)`, which an ILIKE '%x%' could not use.
 *
 * Deliberately independent of `includeInternational`: that toggle answers
 * "outside my country?", and a region is already narrower than a country, so
 * gating one on the other would make picking a wilaya silently do nothing.
 */
function applyRegionFilter(
  where: Prisma.public_usersWhereInput,
  region: string | undefined,
) {
  const value = (region ?? '').trim();
  if (value.length === 0) return;
  where.region = { equals: value, mode: 'insensitive' };
}

function placeByCountry(
  country: string | null,
  userId: string,
): { lat: number; lng: number } | null {
  const key = normalizeCountryForCentroid(country);
  if (!key) return null;
  const base = COUNTRY_CENTROIDS[key];
  const h = hashString(userId);
  // Mask to non-negative 10-bit slices so the offsets stay bounded — a raw
  // `h % 1000` can be negative (h is a signed 32-bit int) and would fling a
  // US athlete down to the Caribbean.
  const latOff = ((h & 0x3ff) / 1024 - 0.5) * 12; // ±6°, bits 0-9
  const lngOff = (((h >> 10) & 0x3ff) / 1024 - 0.5) * 18; // ±9°, bits 10-19
  return { lat: base.lat + latOff, lng: base.lng + lngOff };
}

/**
 * Closes athlete Community matches that break the sport / age-group rules.
 * The same statement as migration 046 -- keep the two in step.
 */
const CLOSE_STALE_COMMUNITY_MATCHES_SQL = `
WITH athlete_peer_matches AS (
  SELECT
    m.id,
    ap1.date_of_birth       AS dob_1,
    ap2.date_of_birth       AS dob_2,
    lower(btrim(ap1.sport)) AS sport_1,
    lower(btrim(ap2.sport)) AS sport_2
  FROM public.matches m
  JOIN public.users u1
    ON u1.id = m.user_1_id AND u1.role = 'athlete'
  JOIN public.users u2
    ON u2.id = m.user_2_id AND u2.role = 'athlete'
  LEFT JOIN public.athlete_profiles ap1 ON ap1.user_id = m.user_1_id
  LEFT JOIN public.athlete_profiles ap2 ON ap2.user_id = m.user_2_id
  WHERE m.kind = 'peer'
    AND m.is_active IS DISTINCT FROM FALSE
),
breaking_the_rules AS (
  SELECT id
  FROM athlete_peer_matches
  WHERE dob_1 IS NULL
     OR dob_2 IS NULL
     OR date_part('year', age(CURRENT_DATE, dob_1)) < 13
     OR date_part('year', age(CURRENT_DATE, dob_2)) < 13
     OR (date_part('year', age(CURRENT_DATE, dob_1)) >= 18)
        <> (date_part('year', age(CURRENT_DATE, dob_2)) >= 18)
     OR coalesce(sport_1, '') = ''
     OR coalesce(sport_2, '') = ''
     OR sport_1 <> sport_2
)
UPDATE public.matches AS m
SET is_active = FALSE
FROM breaking_the_rules b
WHERE m.id = b.id`;

/** How often the sweep above runs. */
const COMMUNITY_SWEEP_MS = 60 * 60 * 1000;

@Injectable()
export class DiscoverService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoverService.name);
  private communitySweep: ReturnType<typeof setInterval> | null = null;

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * The Community rules are checked when two athletes Draft each other, but
   * they can stop holding afterwards: one of two 17-year-olds turns 18, or
   * someone changes sport. An active match is what keeps chat and DMs open,
   * so the pair is re-checked when the server starts and then every hour, and
   * a match that no longer fits is closed the way an unmatch closes it.
   * Running at boot also applies migration 046 to matches made before the
   * rules existed, so nobody has to run that file by hand.
   */
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    void this.closeStaleCommunityMatches();
    this.communitySweep = setInterval(
      () => void this.closeStaleCommunityMatches(),
      COMMUNITY_SWEEP_MS,
    );
    // Housekeeping must never keep the process alive on shutdown.
    this.communitySweep.unref?.();
  }

  onModuleDestroy() {
    if (this.communitySweep) clearInterval(this.communitySweep);
  }

  /** How many matches were closed. Never throws: it is housekeeping. */
  async closeStaleCommunityMatches(): Promise<number> {
    try {
      const closed = await this.prisma.$executeRawUnsafe(
        CLOSE_STALE_COMMUNITY_MATCHES_SQL,
      );
      if (closed > 0) {
        this.logger.warn(
          `[community] closed ${closed} athlete match(es) that no longer meet the sport / age-group rules`,
        );
      }
      return closed;
    } catch (err: any) {
      this.logger.error(
        `[community] stale-match sweep failed: ${err?.message ?? err}`,
      );
      return 0;
    }
  }

  async getFeed(user: CurrentUserPayload, query: DiscoverQueryDto) {
    const offset = ((query.page || 1) - 1) * (query.limit || 20);
    const limit = query.limit || 20;
    const mode = query.mode ?? DiscoverMode.RECRUIT;
    const now = new Date();

    // Parents browse on behalf of their linked athlete (guardian proxy): the
    // feed excludes what the ATHLETE already acted on and reflects the
    // athlete's Draft allowance. Non-parents act as themselves.
    //
    // Peer mode is the exception: a parent looking for other parents is
    // acting as a parent, not as their child, so no proxy and their own
    // allowance.
    const actorId =
      mode === DiscoverMode.PEER
        ? user.id
        : await this.resolveActorId(user, false);
    const swipesRemaining = await this.getSwipesRemaining(actorId);
    const superDraftsRemaining = await this.getSuperDraftsRemaining(actorId);

    // Community status, reported on every peer-mode page so the app can say
    // WHY an athlete's Community is empty (no date of birth, under 13, ...).
    // Athletes have their own gate (community.ts); every other role's
    // Community is open. Recruiting has no such rules: undefined there, which
    // JSON drops from the response.
    const community: CommunityStatus | undefined =
      mode === DiscoverMode.PEER
        ? user.role === UserRole.ATHLETE
          ? await this.communityStatusOf(user.id, now)
          : openCommunity()
        : undefined;
    if (community && !community.eligible) {
      return {
        cards: [],
        hasMore: false,
        swipesRemaining,
        superDraftsRemaining,
        nextCursor: null,
        community,
      };
    }

    // Advanced filters are a paid feature. Enforced here, not only in the
    // app: the filters are plain query params, and a free user with a
    // hand-crafted request must get the same feed as one using the UI.
    const plan = await this.getPlanId(actorId);
    const effectiveQuery: DiscoverQueryDto = planFeatures(plan).advancedFilters
      ? query
      : {
          ...query,
          athletePosition: undefined,
          athleteLevel: undefined,
          verifiedRecruitersOnly: undefined,
        };

    // Role-targeted feed (client matrix): athletes — and parents on their
    // athlete's behalf — see coaches/agents; coaches and agents see athletes.
    // In peer mode everyone sees their own role.
    const page = await this.getEveryoneFeed(
      actorId,
      user.role,
      effectiveQuery,
      offset,
      limit,
      swipesRemaining,
      superDraftsRemaining,
      mode,
      community,
      now,
    );
    return { ...page, community };
  }

  /** The user's plan id, defaulting to the free tier when there is no row. */
  private async getPlanId(userId: string): Promise<string> {
    const sub = await this.prisma.subscriptions.findUnique({
      where: { user_id: userId },
      select: { plan_id: true },
    });
    return String(sub?.plan_id ?? PlanId.BASIC);
  }

  /**
   * Parse the optional client-supplied cursor (ISO timestamp). Bad strings
   * are treated as "no cursor" — never as "epoch 0" which would silently
   * empty the feed. Kept private so the same parser is used by every
   * cursor-aware list.
   */
  private parseCursor(raw: string | undefined): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private athleteCardFromUser(u: any) {
    const p = u.athlete_profiles;
    // Settings → Privacy → "Show Location": off hides the city/country
    // line from the card (the map excludes them separately).
    const hideLocation = u.preferences?.showDistance === false;
    return {
      cardType: 'athlete' as const,
      id: u.id,
      name: u.name,
      // KYC-approved athletes get the verified checkmark (mirrors the
      // map-points logic; adult athletes only — minors are KYC-waived).
      verified: u.kyc_status === 'approved',
      sport: p.sport,
      position: p.position,
      level: p.level,
      location: hideLocation ? null : u.location,
      country: hideLocation ? null : u.country,
      distanceKm: 0,
      classYear: p.class_year,
      gpa: p.gpa,
      height: p.height,
      weight: p.weight,
      photos: p.photos || [],
      videos: p.videos || [],
      bio: p.bio,
      fortyYardDash: p.forty_yard_dash,
      awards: p.awards || [],
    };
  }

  private recruiterCardFromUser(u: any) {
    const p = u.recruiter_profiles;
    const hideLocation = u.preferences?.showDistance === false;
    return {
      cardType: 'recruiter' as const,
      id: u.id,
      name: u.name,
      role: p.role_type,
      organization: p.organization,
      location: hideLocation ? null : u.location,
      country: hideLocation ? null : u.country,
      distanceKm: 0,
      sport: p.sport,
      verified: p.verified,
      tags: p.tags || [],
      bio: p.bio,
      photos: p.photos || [],
      videos: p.videos || [],
      imageUrl: u.avatar_url || (p.photos?.[0] ?? null),
    };
  }

  /**
   * Community card for a parent. Parents have no profile table, so this is
   * shaped like the recruiter card (name, avatar, one line of context) and
   * the app renders it with the same component. The context line is the
   * linked athlete's sport -- "Parent of a Soccer athlete" -- because that is
   * what one parent wants to know about another before asking for advice.
   */
  private parentCardFromUser(u: any, athleteSport: string | null) {
    const hideLocation = u.preferences?.showDistance === false;
    return {
      cardType: 'parent' as const,
      id: u.id,
      name: u.name,
      role: 'parent' as const,
      organization: athleteSport
        ? `Parent of a ${athleteSport} athlete`
        : 'Parent',
      location: hideLocation ? null : u.location,
      country: hideLocation ? null : u.country,
      distanceKm: 0,
      sport: athleteSport,
      verified: u.kyc_status === 'approved',
      tags: [] as string[],
      bio: null as string | null,
      photos: [] as string[],
      videos: [] as string[],
      imageUrl: u.avatar_url ?? null,
    };
  }

  /** The athlete Community status of `userId` (rules in community.ts). */
  private async communityStatusOf(
    userId: string,
    now: Date,
  ): Promise<CommunityStatus> {
    const facts = await this.prisma.public_users.findUnique({
      where: { id: userId },
      select: COMMUNITY_SELECT,
    });
    return athleteCommunityStatus(facts, {
      enabled: peerAthletesEnabled(),
      now,
    });
  }

  /**
   * The athletes an eligible athlete may see in Community: active accounts
   * (guardian-approved when minors -- the same COPPA gate as the recruit
   * feed) with a date of birth in the viewer's age group, playing the
   * viewer's sport. The requested sport filter is ignored: an athlete's
   * Community is always their own sport. Position / level still narrow it.
   *
   * Callers re-check every row in code with isCommunityPeer(), so the rules
   * hold even where this SQL is approximate (a sport saved with stray spaces
   * simply does not match here; it never matches wrongly).
   *
   * null when the viewer is not eligible: no Community, not a wider one.
   */
  private athletePeerWhere(
    community: CommunityStatus,
    athleteProfileFilter: Record<string, unknown>,
    now: Date,
  ): Prisma.public_usersWhereInput | null {
    if (!community.eligible || !community.sport || !community.ageGroup) {
      return null;
    }
    const narrowing = { ...athleteProfileFilter };
    delete narrowing.sport;
    return {
      role: 'athlete',
      activation_status: 'active',
      athlete_profiles: {
        is: {
          ...narrowing,
          sport: {
            equals: escapeLikePattern(community.sport),
            mode: 'insensitive',
          },
          date_of_birth: {
            not: null,
            ...dobBoundsForAgeGroup(community.ageGroup, now),
          },
        },
      },
    };
  }

  /**
   * The WHERE branch for peer mode: the viewer's own role, with that role's
   * own filters applied. Returns null when the role has no community --
   * admins, or athletes who are not eligible (PEER_ATHLETES_ENABLED off, no
   * date of birth, under 13, awaiting a guardian, no sport) -- so the caller
   * returns an empty page instead of falling through to the recruit matrix.
   */
  private peerBranch(
    viewerRole: UserRole,
    athleteProfileFilter: Record<string, unknown>,
    recruiterProfileFilter: Record<string, unknown>,
    community?: CommunityStatus,
    now: Date = new Date(),
  ): Prisma.public_usersWhereInput | null {
    switch (viewerRole) {
      case UserRole.ATHLETE: {
        if (!community) return null;
        return this.athletePeerWhere(community, athleteProfileFilter, now);
      }
      case UserRole.COACH:
      case UserRole.RECRUITER: {
        const branch: Prisma.public_usersWhereInput = { role: viewerRole };
        // recruiterType is meaningless here (the pool IS one type); the
        // remaining recruiter filters (sport, verified) still apply.
        const { role_type: _ignored, ...rest } = recruiterProfileFilter as any;
        if (Object.keys(rest).length) {
          branch.recruiter_profiles = { is: rest };
        }
        return branch;
      }
      case UserRole.PARENT:
        return { role: 'parent' };
      default:
        return null;
    }
  }

  private async getEveryoneFeed(
    userId: string,
    viewerRole: UserRole,
    query: DiscoverQueryDto,
    offset: number,
    limit: number,
    swipesRemaining: number,
    superDraftsRemaining: number,
    mode: DiscoverMode = DiscoverMode.RECRUIT,
    community?: CommunityStatus,
    now: Date = new Date(),
  ) {
    const excluded = await this.excludedUserIds(userId);

    const where: Prisma.public_usersWhereInput = {
      is_banned: false,
      id: { notIn: excluded },
    };
    if (query.country && !query.includeInternational) where.country = query.country;
    // City is a free-text user input matched against the free-text
    // public_users.location column (e.g. "Boston, MA" or "Montreal, QC").
    // There is no separate city column today — see migration 001. We use
    // case-insensitive contains so "boston" matches "Boston, MA".
    // International toggle stays orthogonal: city narrows within whatever
    // country scope is in effect.
    const cityFilter = (query.city ?? '').trim();
    if (cityFilter.length > 0) {
      where.location = { contains: cityFilter, mode: 'insensitive' };
    }
    applyRegionFilter(where, query.region);

    // Cursor-paging (preferred over offset): on the client we send the
    // created_at of the last card we received. New signups landing between
    // fetches no longer shift the page boundary and make us skip a card.
    // When cursor is set we ignore page (skip:0); when absent we keep the
    // offset path for the first fetch and for any caller not yet migrated.
    const cursorDate = this.parseCursor(query.cursor);
    if (cursorDate) {
      where.created_at = { lt: cursorDate };
    }

    // Normalise "all"/empty sentinels to "no filter".
    const sport =
      query.sport && query.sport !== 'all' ? query.sport : undefined;
    const position =
      query.athletePosition && query.athletePosition !== 'all'
        ? query.athletePosition
        : undefined;
    const level =
      query.athleteLevel && query.athleteLevel !== 'all'
        ? query.athleteLevel
        : undefined;
    const recruiterType =
      query.recruiterType && query.recruiterType !== 'all'
        ? query.recruiterType
        : undefined;
    const verifiedOnly = query.verifiedRecruitersOnly === true;

    // Apply each filter only to the role it belongs to (athlete filters must
    // not exclude recruiters and vice-versa), then OR the two role branches.
    // distanceKm is intentionally NOT applied — viewer coordinates aren't
    // captured at signup, so there's nothing to measure distance against yet.
    const athleteProfileFilter: any = {};
    if (sport) athleteProfileFilter.sport = sport;
    if (position) athleteProfileFilter.position = position;
    if (level) athleteProfileFilter.level = level;

    const recruiterProfileFilter: any = {};
    if (sport) recruiterProfileFilter.sport = sport;
    if (recruiterType) recruiterProfileFilter.role_type = recruiterType;
    if (verifiedOnly) recruiterProfileFilter.verified = true;

    // Minors awaiting guardian approval must not be discoverable (COPPA):
    // they only enter the feed once their activation flips to 'active'.
    const athleteBranch: Prisma.public_usersWhereInput = {
      role: 'athlete',
      activation_status: 'active',
    };
    if (Object.keys(athleteProfileFilter).length) {
      athleteBranch.athlete_profiles = { is: athleteProfileFilter };
    }

    const recruiterBranch: Prisma.public_usersWhereInput = {
      role: { in: ['coach', 'recruiter'] },
    };
    if (Object.keys(recruiterProfileFilter).length) {
      recruiterBranch.recruiter_profiles = { is: recruiterProfileFilter };
    }

    if (mode === DiscoverMode.PEER) {
      // Community: exactly your own role, nobody else. Coaches and agents are
      // kept apart on purpose -- the client asked for "coaches among each
      // other, agents among each other", and the two have different concerns.
      const peerBranch = this.peerBranch(
        viewerRole,
        athleteProfileFilter,
        recruiterProfileFilter,
        community,
        now,
      );
      if (!peerBranch) {
        // Role has no community (admin), or this athlete has none (not
        // eligible, or athlete↔athlete is switched off).
        return {
          cards: [],
          hasMore: false,
          swipesRemaining,
          superDraftsRemaining,
          nextCursor: null,
        };
      }
      where.OR = [peerBranch];
    } else {
      // Role matrix (client): athletes — and parents acting for their
      // athlete — see coaches/agents; coaches and agents see athletes only.
      // Anything else (e.g. admin tooling) falls back to the full set.
      const seesRecruiters =
        viewerRole === UserRole.ATHLETE || viewerRole === UserRole.PARENT;
      const seesAthletes =
        viewerRole === UserRole.COACH || viewerRole === UserRole.RECRUITER;
      if (seesRecruiters && !seesAthletes) where.OR = [recruiterBranch];
      else if (seesAthletes && !seesRecruiters) where.OR = [athleteBranch];
      else where.OR = [athleteBranch, recruiterBranch];
    }

    const users = await this.prisma.public_users.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatar_url: true,
        role: true,
        location: true,
        country: true,
        latitude: true,
        longitude: true,
        created_at: true,
        // Paid tiers sort ahead within the page ("visibility boost").
        plan_id: true,
        // Feeds the card's verified checkmark (athletes: KYC-approved).
        kyc_status: true,
        // Settings toggles: profileVisible (hidden from feed) and
        // showDistance (location hidden on the card).
        preferences: true,
        // Athlete Community re-check (isCommunityPeer below). Never copied
        // onto a card: the card builders pick their fields explicitly.
        activation_status: true,
        athlete_profiles: {
          select: {
            sport: true,
            position: true,
            level: true,
            bio: true,
            class_year: true,
            gpa: true,
            height: true,
            weight: true,
            photos: true,
            videos: true,
            forty_yard_dash: true,
            awards: true,
            date_of_birth: true,
          },
        },
        recruiter_profiles: {
          select: {
            organization: true,
            sport: true,
            role_type: true,
            verified: true,
            tags: true,
            bio: true,
            photos: true,
            videos: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      // When the caller sent a cursor we already filtered by it — paging
      // is "everything < cursor", no offset. Without a cursor we keep the
      // legacy page * limit math so first-fetch clients still work.
      skip: cursorDate ? 0 : offset,
      take: limit,
    });

    // Parents have no profile table of their own. Their card says what a
    // fellow parent actually wants to know -- which sport their kid plays --
    // so look up the approved guardian link's athlete for the parents on this
    // page. One query for the page, not one per card.
    const parentSport = new Map<string, string | null>();
    const parentIds = users.filter((u) => u.role === 'parent').map((u) => u.id);
    if (parentIds.length) {
      const links = await this.prisma.guardian_links.findMany({
        where: { guardian_user_id: { in: parentIds }, status: 'approved' },
        select: {
          guardian_user_id: true,
          users_guardian_links_athlete_user_idTousers: {
            select: { athlete_profiles: { select: { sport: true } } },
          },
        },
      });
      for (const l of links as any[]) {
        if (!parentSport.has(l.guardian_user_id)) {
          parentSport.set(
            l.guardian_user_id,
            l.users_guardian_links_athlete_user_idTousers?.athlete_profiles
              ?.sport ?? null,
          );
        }
      }
    }

    // Visibility boost: Pro and Elite profiles sort ahead WITHIN the page,
    // Elite ahead of Pro, newest-first otherwise. Within the page only, on
    // purpose -- paging is by created_at cursor, and reordering across pages
    // would make the cursor skip or repeat rows. The cursor below is taken
    // from the unsorted list, so it still means "everything older than the
    // last row fetched".
    const last = users[users.length - 1];
    const boosted = [...users].sort((a, b) => {
      const d =
        planFeatures(b.plan_id as string).visibilityBoost -
        planFeatures(a.plan_id as string).visibilityBoost;
      if (d !== 0) return d;
      // Same boost: keep the query's newest-first order.
      return (
        (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0)
      );
    });

    // Athlete Community: every row is re-checked in code against the same
    // rules the WHERE applied (sport, age group, active), so a query that
    // drifts can never put an adult in front of a 15-year-old. Paging is
    // unaffected: hasMore / nextCursor come from the unfiltered rows.
    const athleteCommunity =
      mode === DiscoverMode.PEER && viewerRole === UserRole.ATHLETE;

    const cards = boosted
      // Settings → Privacy → "Profile Visible": explicit false means the
      // user opted out of discovery. Filtered here (not in SQL) because a
      // JSONB path comparison silently drops rows with no preferences at
      // all — absence must default to visible.
      .filter((u) => (u.preferences as any)?.profileVisible !== false)
      .filter(
        (u) =>
          !athleteCommunity ||
          (community !== undefined && isCommunityPeer(community, u, now)),
      )
      .map((u) => {
        if (u.role === 'athlete' && u.athlete_profiles) {
          return this.athleteCardFromUser(u);
        }
        if ((u.role === 'coach' || u.role === 'recruiter') && u.recruiter_profiles) {
          return this.recruiterCardFromUser(u);
        }
        if (u.role === 'parent') {
          return this.parentCardFromUser(u, parentSport.get(u.id) ?? null);
        }
        return null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Cursor for the next page = created_at of the LAST row the QUERY
    // returned (taken above, before the boost re-sort). null when the page
    // didn't fill (hasMore=false), so the client knows to stop. ISO string
    // so it survives JSON + the DTO's IsString check.
    const nextCursor =
      users.length === limit && last?.created_at
        ? last.created_at.toISOString()
        : null;

    return {
      cards,
      hasMore: users.length === limit,
      swipesRemaining,
      superDraftsRemaining,
      nextCursor,
    };
  }

  // Globe = talent map of athletes shown to EVERY viewer (recruiters and
  // coaches do the drafting, athletes browse the field too). Same
  // not-yet-swiped, non-blocked filtering as the feed, narrowed to role
  // 'athlete'. Each athlete is placed by precise lat/lng when set, else by
  // their country center — so real athletes appear even before signup
  // captures coordinates. Parents stay 403 — they don't draft.
  async getMapPoints(user: CurrentUserPayload, query: DiscoverQueryDto = {}) {
    if (user.role === UserRole.PARENT) {
      throw new ForbiddenException('Parents do not have a discover feed');
    }

    const mode = query.mode ?? DiscoverMode.RECRUIT;
    const now = new Date();

    // Athlete Community on the globe follows exactly the feed's rules (same
    // sport, same age group, both active). An athlete who is not eligible
    // gets no pins at all -- the globe is not a way around the feed.
    let community: CommunityStatus | undefined;
    if (mode === DiscoverMode.PEER && user.role === UserRole.ATHLETE) {
      community = await this.communityStatusOf(user.id, now);
      if (!community.eligible) return [];
    }

    const excluded = await this.excludedUserIds(user.id);

    // The map mirrors the Discover feed's role matrix: an athlete sees
    // coaches/agents, a coach/agent sees athletes. Without this the map showed
    // athletes to EVERYONE, so an athlete tapping a pin hit the swipe() role
    // guard and got a 403 on a profile they were never allowed to draft.
    // Peer mode mirrors the same way: your own role, same gates as the feed.
    const targetsRecruiters = user.role === UserRole.ATHLETE;

    let roleWhere: Prisma.public_usersWhereInput;
    if (mode === DiscoverMode.PEER) {
      const branch = this.peerBranch(user.role, {}, {}, community, now);
      if (!branch) return [];
      roleWhere = branch;
    } else if (targetsRecruiters) {
      roleWhere = { role: { in: ['coach', 'recruiter'] } };
    } else {
      // Same COPPA gate as the feed — unapproved minors stay off the map.
      roleWhere = { role: 'athlete', activation_status: 'active' };
    }

    const where: Prisma.public_usersWhereInput = {
      is_banned: false,
      id: { notIn: [...excluded, user.id] },
      ...roleWhere,
    };
    if (query.country && !query.includeInternational) where.country = query.country;
    // Same free-text city match the feed uses (see getEveryoneFeed).
    const cityFilter = (query.city ?? '').trim();
    if (cityFilter.length > 0) {
      where.location = { contains: cityFilter, mode: 'insensitive' };
    }
    applyRegionFilter(where, query.region);

    const users = await this.prisma.public_users.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        avatar_url: true,
        kyc_status: true,
        country: true,
        latitude: true,
        longitude: true,
        // Settings toggles — see getEveryoneFeed for why this is filtered
        // in JS rather than in SQL.
        preferences: true,
        // Athlete Community re-check only; never copied onto a pin.
        activation_status: true,
        athlete_profiles: {
          select: {
            sport: true,
            position: true,
            level: true,
            class_year: true,
            height: true,
            gpa: true,
            photos: true,
            date_of_birth: true,
          },
        },
        recruiter_profiles: {
          select: {
            organization: true,
            sport: true,
            role_type: true,
            verified: true,
            photos: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    let skippedNoCoords = 0;
    const placed = users
      .map((u) => {
        // Athlete pins carry the athlete profile; coach/agent pins the
        // recruiter one. Either way a pin needs a profile to describe it.
        const ap = u.athlete_profiles;
        const rp = u.recruiter_profiles;
        const p = ap ?? rp;
        if (!p) return null;
        // Privacy toggles: opted out of discovery entirely, or asked to
        // keep their location private — a map pin is pure location.
        const prefs = (u.preferences as any) ?? {};
        if (prefs.profileVisible === false || prefs.showDistance === false) {
          return null;
        }
        // Athlete Community: same in-code re-check as the feed.
        if (community && !isCommunityPeer(community, u, now)) return null;
        // Precise coords win; otherwise place by country (+ deterministic
        // per-user offset). Signup saves country only today, so this is what
        // makes REAL athletes show on the globe until lat/lng is captured.
        let lat: number;
        let lng: number;
        if (u.latitude !== null && u.longitude !== null) {
          lat = Number(u.latitude);
          lng = Number(u.longitude);
        } else {
          const fallback = placeByCountry(u.country, u.id);
          if (!fallback) {
            skippedNoCoords += 1;
            return null;
          }
          lat = fallback.lat;
          lng = fallback.lng;
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const photos = Array.isArray(p.photos) ? (p.photos as string[]) : [];
        return {
          id: u.id,
          name: u.name,
          // Every pin, every mode: ~1 km, never a house (see roundCoord).
          lat: roundCoord(lat),
          lng: roundCoord(lng),
          avatar_url: u.avatar_url,
          // Athlete-only fields stay null on a recruiter pin; the globe card
          // renders only the rows it actually has, so it degrades cleanly.
          role: ap ? ('athlete' as const) : ('recruiter' as const),
          sport: p.sport ?? null,
          position: ap?.position ?? null,
          level: ap?.level ?? null,
          class_year: ap?.class_year ?? null,
          height: ap?.height ?? null,
          gpa: ap?.gpa != null ? Number(ap.gpa) : null,
          organization: rp?.organization ?? null,
          // First gallery photo, surfaced so the globe card has something
          // to render when the user hasn't set a separate avatar_url.
          photo: photos[0] ?? null,
          // Athletes are verified via KYC; coaches/agents via the vetted flag
          // on their recruiter profile.
          verified: ap ? u.kyc_status === 'approved' : (rp?.verified ?? false),
          // Seeded/demo accounts are created with @getdraft.app emails;
          // manually-created real users sign up with their own email. The
          // globe paints seeded points orange and real users green so they
          // can be told apart at a glance.
          generated: (u.email ?? '').toLowerCase().endsWith('@getdraft.app'),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // Visibility: how many athletes were dropped because they had neither
    // precise coords NOR a country in COUNTRY_CENTROIDS. If this number
    // grows we'll see it in the backend logs and know to widen the map.
    if (skippedNoCoords > 0) {
      this.logger.warn(
        `getMapPoints: dropped ${skippedNoCoords} athlete(s) with no coords and an unsupported country`,
      );
    }
    return placed;
  }

  private async excludedUserIds(userId: string): Promise<string[]> {
    const [swiped, blocked, blockedBy] = await Promise.all([
      this.prisma.swipes.findMany({
        where: { swiper_id: userId },
        select: { swiped_id: true },
      }),
      this.prisma.blocks.findMany({
        where: { blocker_id: userId },
        select: { blocked_id: true },
      }),
      this.prisma.blocks.findMany({
        where: { blocked_id: userId },
        select: { blocker_id: true },
      }),
    ]);

    return [
      ...swiped.map((s) => s.swiped_id),
      ...blocked.map((b) => b.blocked_id),
      ...blockedBy.map((b) => b.blocker_id),
      userId,
    ];
  }

  /**
   * The client's role-matching matrix, in one place. Symmetric:
   * canMatch(a,b,m) === canMatch(b,a,m).
   *
   *   recruit  athletes ↔ coaches/agents, nothing else
   *   peer     the same role only -- athlete↔athlete (unless switched off,
   *            and then only under the Community rules, see swipe()),
   *            coach↔coach, agent↔agent, parent↔parent
   *
   * The two are checked per mode rather than OR'ed together: a swipe sent
   * from the recruit deck must never create a peer match and vice versa. A
   * swipe with no mode (older clients) is peer for a same-role pair and
   * recruit otherwise -- see swipe().
   */
  private canMatch(
    roleA: UserRole,
    roleB: UserRole,
    mode: DiscoverMode = DiscoverMode.RECRUIT,
  ): boolean {
    if (mode === DiscoverMode.PEER) {
      if (roleA !== roleB) return false;
      switch (roleA) {
        case UserRole.ATHLETE:
          return peerAthletesEnabled();
        case UserRole.COACH:
        case UserRole.RECRUITER:
        case UserRole.PARENT:
          return true;
        default:
          return false;
      }
    }
    const isRecruiter = (r: UserRole) =>
      r === UserRole.COACH || r === UserRole.RECRUITER;
    return (
      (roleA === UserRole.ATHLETE && isRecruiter(roleB)) ||
      (isRecruiter(roleA) && roleB === UserRole.ATHLETE)
    );
  }

  /**
   * Guardian proxy: a parent acts on behalf of their linked minor, so discovery
   * and drafts run AS the athlete (a parent's Draft on a coach produces a real
   * athlete↔coach match). Returns the parent's approved-linked athlete id, or
   * the user's own id for non-parents. `requireLink` throws when a parent has no
   * approved link (used on the write path); the read path passes false so the
   * feed still renders (just without athlete-scoped excludes).
   */
  private async resolveActorId(
    user: CurrentUserPayload,
    requireLink: boolean,
  ): Promise<string> {
    if (user.role !== UserRole.PARENT) return user.id;
    const link = await this.prisma.guardian_links.findFirst({
      where: { guardian_user_id: user.id, status: 'approved' },
      select: { athlete_user_id: true },
    });
    if (!link) {
      if (requireLink) {
        throw new ForbiddenException(
          'Link your athlete before drafting on their behalf.',
        );
      }
      return user.id;
    }
    return link.athlete_user_id;
  }

  async swipe(user: CurrentUserPayload, dto: SwipeDto) {
    const now = new Date();

    // The target is read first because the mode can depend on its role (see
    // below), and the mode decides whether a parent acts as themselves.
    //
    // Mirror the feed filter: a banned target must never accept a swipe,
    // otherwise a banned user can still be "matched" via a deep-linked id
    // and end up in the swiper's matches/messages.
    const target = await this.prisma.public_users.findUnique({
      where: { id: dto.targetUserId },
      select: { is_banned: true, role: true, ...COMMUNITY_SELECT },
    });
    if (!target || target.is_banned) {
      throw new NotFoundException('User not found');
    }
    const targetRole = target.role as UserRole;

    // No mode: a build that predates Community, or a screen that never sends
    // one (the Globe, Draft Board Accept / Refuse, "who drafted you" Draft
    // back). A same-role pair can only ever be a Community connection, so it
    // is peer; any other pair is recruiting, as it always was. This opens no
    // loophole: every rule below is checked for the resolved mode, and an
    // athlete pair meets the full Community rules whichever way it arrives.
    const mode =
      dto.mode ??
      (user.role === targetRole ? DiscoverMode.PEER : DiscoverMode.RECRUIT);

    // Parents draft on behalf of their linked minor: everything below runs as
    // that athlete (`actor`), so a parent's Draft on a coach produces a real
    // athlete↔coach match. Non-parents act as themselves.
    //
    // In peer mode a parent connecting with another parent IS the actor: no
    // proxy, their own allowance, and the match is between the two parents.
    const actor: CurrentUserPayload =
      user.role === UserRole.PARENT && mode !== DiscoverMode.PEER
        ? {
            ...user,
            id: await this.resolveActorId(user, true),
            role: UserRole.ATHLETE,
          }
        : user;
    if (actor.id === dto.targetUserId) {
      throw new BadRequestException('Cannot swipe yourself');
    }

    const existingBlock = await this.prisma.blocks.findFirst({
      where: {
        OR: [
          { blocker_id: actor.id, blocked_id: dto.targetUserId },
          { blocker_id: dto.targetUserId, blocked_id: actor.id },
        ],
      },
      select: { id: true },
    });

    if (existingBlock) {
      throw new ForbiddenException('Cannot swipe a blocked user');
    }

    if (
      mode === DiscoverMode.PEER &&
      actor.role === UserRole.ATHLETE &&
      targetRole === UserRole.ATHLETE
    ) {
      // Athlete Community (community.ts). A Pass is always allowed: it
      // creates nothing, and it is how an athlete refuses a peer Draft --
      // including one sent before these rules existed, or by someone they
      // could no longer match. A Draft needs BOTH athletes eligible (date of
      // birth, 13+, active, a sport), in the same age group and the same
      // sport. The target's own status is never spelled out: one message for
      // every mismatch, so a stranger cannot learn that someone is 12 or
      // still waiting on a guardian.
      if (dto.direction === SwipeDirection.DRAFT) {
        const me = await this.communityStatusOf(actor.id, now);
        if (!me.eligible) {
          throw new ForbiddenException(
            COMMUNITY_BLOCKED_MESSAGES[me.reason ?? 'disabled'],
          );
        }
        if (!isCommunityPeer(me, target, now)) {
          throw new ForbiddenException(COMMUNITY_MISMATCH_MESSAGE);
        }
      }
    } else if (!this.canMatch(actor.role, targetRole, mode)) {
      // Role-pair guard (client matrix). Belt-and-braces on top of the feed
      // filter: a deep-linked / hand-crafted targetUserId must not be able to
      // create an illegal match (coach↔agent, athlete↔athlete from the
      // recruit deck, cross-role from the peer deck, etc.).
      throw new ForbiddenException('You cannot match with this user');
    }

    // A Super Draft is a Draft with isSuper — a standout, always-capped action
    // with its OWN monthly allowance. It never touches the normal Draft quota,
    // so a user out of normal Drafts can still Super Draft (and vice-versa).
    const isSuper =
      dto.direction === SwipeDirection.DRAFT && dto.isSuper === true;

    // Passes are always free; only Drafts (right-swipes) consume an allowance.
    // Block when the relevant quota is exhausted — the 429 lets the client show
    // the upgrade CTA (distinct from the 403 role/block paths). The two messages
    // differ so the client can tell "out of Drafts" from "out of Super Drafts".
    if (isSuper) {
      const superLeft = await this.getSuperDraftsRemaining(actor.id);
      if (superLeft <= 0) {
        throw new HttpException(
          'Out of Super Drafts this month. Upgrade for more Super Drafts.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } else if (dto.direction === SwipeDirection.DRAFT) {
      const remaining = await this.getSwipesRemaining(actor.id);
      if (remaining === 0) {
        throw new HttpException(
          'Out of Drafts for today. Come back tomorrow, or upgrade for unlimited.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    try {
      await this.prisma.swipes.create({
        data: {
          swiper_id: actor.id,
          swiped_id: dto.targetUserId,
          direction: dto.direction,
          is_super: isSuper,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Already swiped on this user');
      }
      throw new BadRequestException((e as Error).message);
    }

    // Only NORMAL Drafts consume the daily allowance (passes are free; Super
    // Drafts are metered separately by SUPER_DRAFT_LIMITS, monthly). Spend the
    // plan quota first; if exhausted, dip into bonus_swipes (from swipe-packs).
    if (dto.direction === SwipeDirection.DRAFT && !isSuper) {
      const subForSpend = await this.prisma.subscriptions.findUnique({
        where: { user_id: actor.id },
        select: {
          plan_id: true,
          swipes_used_today: true,
          bonus_swipes: true,
        },
      });
      const limit = subForSpend
        ? PLAN_SWIPE_LIMITS[String(subForSpend.plan_id) as PlanId] ??
          PLAN_SWIPE_LIMITS[PlanId.BASIC]
        : PLAN_SWIPE_LIMITS[PlanId.BASIC];
      if (limit !== -1) {
        const quotaLeft = Math.max(
          0,
          limit - (subForSpend?.swipes_used_today ?? 0),
        );
        if (quotaLeft > 0) {
          await this.prisma.$executeRawUnsafe(
            'select public.increment_swipes_used($1::uuid)',
            actor.id,
          );
        } else if (subForSpend && subForSpend.bonus_swipes > 0) {
          await this.prisma.subscriptions.update({
            where: { user_id: actor.id },
            data: { bonus_swipes: { decrement: 1 } },
          });
        }
      }
    }

    let matched = false;
    let matchId: string | null = null;

    if (dto.direction === SwipeDirection.DRAFT) {
      // likes_received is shown on the athlete's profile as a talent signal.
      // A peer Draft is a friend request, not a scout's interest -- keep it
      // out, the same way migration 044 keeps peer activity out of the score.
      if (mode !== DiscoverMode.PEER) {
        await this.prisma.$executeRawUnsafe(
          'select public.increment_likes_received($1::uuid)',
          dto.targetUserId,
        );
      }

      const mutualSwipe = await this.prisma.swipes.findFirst({
        where: {
          swiper_id: dto.targetUserId,
          swiped_id: actor.id,
          direction: SwipeDirection.DRAFT,
        },
        select: { id: true },
      });

      if (mutualSwipe) {
        const [user1, user2] =
          actor.id < dto.targetUserId
            ? [actor.id, dto.targetUserId]
            : [dto.targetUserId, actor.id];

        try {
          const match = await this.prisma.matches.create({
            // kind travels with the match so the Draft Board can label a
            // community connection and the ranking view can ignore it.
            data: { user_1_id: user1, user_2_id: user2, kind: mode },
            select: { id: true },
          });
          matched = true;
          matchId = match.id;
        } catch (e) {
          // Unique violation = an active match already exists for this pair
          // (backfill, race between both sides swiping, or a previous successful
          // insert). Fetch the existing row and treat the swipe as matched.
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            const existing = await this.prisma.matches.findFirst({
              where: { user_1_id: user1, user_2_id: user2 },
              select: { id: true, is_active: true },
            });
            if (existing) {
              if (!existing.is_active) {
                await this.prisma.matches.update({
                  where: { id: existing.id },
                  data: { is_active: true },
                });
              }
              matched = true;
              matchId = existing.id;
            }
          } else {
            // Any other failure (check constraint, FK, RLS, connection) is a
            // genuine bug. Surface it loudly so it can't silently regress.
            this.logger.error(
              `matches.create failed for ${user1}/${user2}`,
              (e as Error).stack,
            );
            throw e;
          }
        }
      }

      if (matched && matchId) {
        // Push "Game On!" to both users (best-effort; sendPushToUser
        // swallows its own errors).
        const names = await this.prisma.public_users.findMany({
          where: { id: { in: [actor.id, dto.targetUserId] } },
          select: { id: true, name: true },
        });
        const nameOf = (id: string) =>
          names.find((n) => n.id === id)?.name ?? 'Someone';
        const data = { type: 'new_match', matchId };
        await Promise.all([
          this.notificationsService.sendPushToUser(
            dto.targetUserId,
            'Game On! 🤝',
            `You matched with ${nameOf(actor.id)}`,
            data,
            'matchAlerts',
          ),
          this.notificationsService.sendPushToUser(
            actor.id,
            'Game On! 🤝',
            `You matched with ${nameOf(dto.targetUserId)}`,
            data,
            'matchAlerts',
          ),
        ]);
      }

      // Super Draft that didn't instantly match: tell the recipient it stands
      // out (a match already fires the louder "Game On!" push above, so don't
      // double-notify). Best-effort; sendPushToUser swallows its own errors.
      if (isSuper && !matched) {
        const me = await this.prisma.public_users.findUnique({
          where: { id: actor.id },
          select: { name: true },
        });
        await this.notificationsService.sendPushToUser(
          dto.targetUserId,
          '⭐ Super Draft!',
          `${me?.name ?? 'Someone'} super drafted you`,
          { type: 'super_draft' },
          'recruiterActivity',
        );
      }
    }

    const swipesRemaining = await this.getSwipesRemaining(actor.id);
    const superDraftsRemaining = await this.getSuperDraftsRemaining(actor.id);
    return { matched, matchId, swipesRemaining, superDraftsRemaining };
  }

  async myDrafts(user: CurrentUserPayload) {
    // A guardian drafts on behalf of their linked athlete, so their draft list
    // IS that athlete's. Without this a parent could Draft but never see (or
    // withdraw) what they'd sent.
    const userId = await this.resolveActorId(user, false);

    // An athlete's Sent list (the caller's, or the linked athlete's for a
    // parent) follows the Community rules the way "who drafted you" does:
    // a Draft on another athlete only shows while that athlete is still
    // someone this one could match. That hides peer Drafts sent before the
    // rules existed -- an adult's Draft on a 15-year-old, name and town
    // included. Drafts on coaches and agents are untouched.
    const isAthletesList = user.role === UserRole.ATHLETE || userId !== user.id;
    const now = new Date();
    const me = isAthletesList ? await this.communityStatusOf(userId, now) : null;

    const [outgoing, activeMatches] = await Promise.all([
      this.prisma.swipes.findMany({
        where: {
          swiper_id: userId,
          direction: SwipeDirection.DRAFT,
        },
        select: {
          swiped_id: true,
          created_at: true,
          users_swipes_swiped_idTousers: {
            select: {
              id: true,
              name: true,
              avatar_url: true,
              role: true,
              location: true,
              // For the Community re-check below; never returned.
              ...COMMUNITY_SELECT,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      this.prisma.matches.findMany({
        where: {
          is_active: true,
          OR: [{ user_1_id: userId }, { user_2_id: userId }],
        },
        select: { user_1_id: true, user_2_id: true },
      }),
    ]);

    const matchedSet = new Set<string>(
      activeMatches.map((m) =>
        m.user_1_id === userId ? m.user_2_id : m.user_1_id,
      ),
    );

    return outgoing
      .filter((r) => {
        const target = r.users_swipes_swiped_idTousers;
        if (!me || target?.role !== 'athlete') return true;
        return isCommunityPeer(me, target, now);
      })
      .map((r) => {
        const target = r.users_swipes_swiped_idTousers;
        return {
          swiped_id: r.swiped_id,
          created_at: r.created_at,
          swiped: target
            ? {
                id: target.id,
                name: target.name,
                avatar_url: target.avatar_url,
                role: target.role,
                location: target.location,
              }
            : target,
          matched: matchedSet.has(r.swiped_id),
        };
      });
  }

  async withdrawDraft(user: CurrentUserPayload, targetUserId: string) {
    // Guardian proxy: a parent withdraws the Draft they sent AS their athlete,
    // so the row to remove is the athlete's, not the parent's.
    const userId = await this.resolveActorId(user, true);
    const [u1, u2] =
      userId < targetUserId ? [userId, targetUserId] : [targetUserId, userId];

    const activeMatch = await this.prisma.matches.findFirst({
      where: { user_1_id: u1, user_2_id: u2, is_active: true },
      select: { id: true },
    });
    if (activeMatch) {
      throw new ConflictException('Already matched — cannot withdraw');
    }

    const { count } = await this.prisma.swipes.deleteMany({
      where: {
        swiper_id: userId,
        swiped_id: targetUserId,
        direction: SwipeDirection.DRAFT,
      },
    });
    if (count === 0) {
      throw new NotFoundException('No pending draft to withdraw');
    }

    return { withdrawn: true };
  }

  async whoDraftedMe(user: CurrentUserPayload) {
    // Guardian proxy: a parent sees who drafted THEIR athlete — which is the
    // whole point of the guardian being in the loop.
    const userId = await this.resolveActorId(user, false);
    const [mySwiped, blocked, blockedBy] = await Promise.all([
      this.prisma.swipes.findMany({
        where: { swiper_id: userId },
        select: { swiped_id: true },
      }),
      this.prisma.blocks.findMany({
        where: { blocker_id: userId },
        select: { blocked_id: true },
      }),
      this.prisma.blocks.findMany({
        where: { blocked_id: userId },
        select: { blocker_id: true },
      }),
    ]);

    const excludeSwiperIds = [
      ...mySwiped.map((s) => s.swiped_id),
      ...blocked.map((b) => b.blocked_id),
      ...blockedBy.map((b) => b.blocker_id),
    ];

    // A banned swiper must not appear in the "who drafted me" list —
    // mirrors the feed/match ban filters so a suspended account can't
    // influence the recipient's discover funnel.
    const swiperWhere: Prisma.public_usersWhereInput = { is_banned: false };

    // The list is an athlete's when the caller is one, or is a parent acting
    // for their linked athlete. It shows other athletes' names, faces and
    // towns, so the athlete Community rules apply to it like to the feed:
    // Drafts from athletes only show when that athlete is someone this one
    // could match (same sport, same age group, both active). That also hides
    // peer Drafts sent before the rules existed -- an adult's Draft on a
    // 15-year-old. Drafts from coaches and agents are untouched.
    const isAthletesList = user.role === UserRole.ATHLETE || userId !== user.id;
    if (isAthletesList) {
      const now = new Date();
      const me = await this.communityStatusOf(userId, now);
      const peers = this.athletePeerWhere(me, {}, now);
      const notAnAthlete: Prisma.public_usersWhereInput = {
        role: { not: 'athlete' },
      };
      swiperWhere.OR = peers ? [notAnAthlete, peers] : [notAnAthlete];
    }

    const rows = await this.prisma.swipes.findMany({
      where: {
        swiped_id: userId,
        direction: SwipeDirection.DRAFT,
        swiper_id: { notIn: excludeSwiperIds },
        users_swipes_swiper_idTousers: swiperWhere,
      },
      select: {
        swiped_id: true,
        created_at: true,
        is_super: true,
        users_swipes_swiper_idTousers: {
          select: {
            id: true,
            name: true,
            avatar_url: true,
            role: true,
            location: true,
          },
        },
      },
      // Super Drafts float to the top of the list, then newest first.
      orderBy: [{ is_super: 'desc' }, { created_at: 'desc' }],
      take: 50,
    });

    return rows.map((r) => ({
      swiped_id: r.swiped_id,
      created_at: r.created_at,
      is_super: r.is_super,
      swiper: r.users_swipes_swiper_idTousers,
    }));
  }

  // Remaining DRAFTS today. Passes are free; the daily allowance comes from
  // the plan (PLAN_SWIPE_LIMITS) and resets at UTC midnight. -1 = unlimited.
  // swipes_used_today/swipes_reset_at are the counter and the day it counts.
  private async getSwipesRemaining(userId: string): Promise<number> {
    const sub = await this.prisma.subscriptions.findUnique({
      where: { user_id: userId },
      select: {
        plan_id: true,
        swipes_used_today: true,
        swipes_reset_at: true,
        bonus_swipes: true,
      },
    });

    if (!sub) return PLAN_SWIPE_LIMITS[PlanId.BASIC];

    const limit =
      PLAN_SWIPE_LIMITS[String(sub.plan_id) as PlanId] ??
      PLAN_SWIPE_LIMITS[PlanId.BASIC];
    const bonus = sub.bonus_swipes ?? 0;
    const UNLIMITED = 9999;

    // Daily reset: compare YYYY-MM-DD in UTC. A row whose counter belongs to
    // an earlier day is zeroed on first read, so there is no cron job and no
    // window where yesterday's total still blocks today.
    const now = new Date();
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const resetDay = sub.swipes_reset_at ? dayKey(sub.swipes_reset_at) : null;

    if (resetDay !== dayKey(now)) {
      const today = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      await this.prisma.subscriptions.update({
        where: { user_id: userId },
        data: { swipes_used_today: 0, swipes_reset_at: today },
      });
      return (limit === -1 ? UNLIMITED : limit) + bonus;
    }

    if (limit === -1) return UNLIMITED + bonus;
    return Math.max(0, limit - (sub.swipes_used_today ?? 0)) + bonus;
  }

  // Remaining SUPER DRAFTS this calendar month. Counted straight from the
  // swipes table (is_super = true, created this month), so there's no counter
  // column or reset job to keep in sync. Always capped by SUPER_DRAFT_LIMITS —
  // never unlimited, even on paid plans (scarcity is the point).
  private async getSuperDraftsRemaining(userId: string): Promise<number> {
    const sub = await this.prisma.subscriptions.findUnique({
      where: { user_id: userId },
      select: { plan_id: true },
    });
    const limit =
      SUPER_DRAFT_LIMITS[String(sub?.plan_id) as PlanId] ??
      SUPER_DRAFT_LIMITS[PlanId.BASIC];

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const used = await this.prisma.swipes.count({
      where: {
        swiper_id: userId,
        is_super: true,
        created_at: { gte: monthStart },
      },
    });
    return Math.max(0, limit - used);
  }
}
