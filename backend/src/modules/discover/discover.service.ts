import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import {
  CurrentUserPayload,
  UserRole,
  SwipeDirection,
  PlanId,
  PLAN_SWIPE_LIMITS,
} from '../../common/types';
import { NotificationsService } from '../notifications/notifications.service';

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

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getFeed(user: CurrentUserPayload, query: DiscoverQueryDto) {
    const offset = ((query.page || 1) - 1) * (query.limit || 20);
    const limit = query.limit || 20;

    // Parents browse on behalf of their linked athlete (guardian proxy): the
    // feed excludes what the ATHLETE already acted on and reflects the
    // athlete's Draft allowance. Non-parents act as themselves.
    const actorId = await this.resolveActorId(user, false);
    const swipesRemaining = await this.getSwipesRemaining(actorId);

    // Role-targeted feed (client matrix): athletes — and parents on their
    // athlete's behalf — see coaches/agents; coaches and agents see athletes.
    return this.getEveryoneFeed(
      actorId,
      user.role,
      query,
      offset,
      limit,
      swipesRemaining,
    );
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

  private async getEveryoneFeed(
    userId: string,
    viewerRole: UserRole,
    query: DiscoverQueryDto,
    offset: number,
    limit: number,
    swipesRemaining: number,
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

    // Role matrix (client): athletes — and parents acting for their athlete —
    // see coaches/agents; coaches and agents see athletes only. Anything else
    // (e.g. admin tooling) falls back to the full set.
    const seesRecruiters =
      viewerRole === UserRole.ATHLETE || viewerRole === UserRole.PARENT;
    const seesAthletes =
      viewerRole === UserRole.COACH || viewerRole === UserRole.RECRUITER;
    if (seesRecruiters && !seesAthletes) where.OR = [recruiterBranch];
    else if (seesAthletes && !seesRecruiters) where.OR = [athleteBranch];
    else where.OR = [athleteBranch, recruiterBranch];

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
        // Feeds the card's verified checkmark (athletes: KYC-approved).
        kyc_status: true,
        // Settings toggles: profileVisible (hidden from feed) and
        // showDistance (location hidden on the card).
        preferences: true,
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

    const cards = users
      // Settings → Privacy → "Profile Visible": explicit false means the
      // user opted out of discovery. Filtered here (not in SQL) because a
      // JSONB path comparison silently drops rows with no preferences at
      // all — absence must default to visible.
      .filter((u) => (u.preferences as any)?.profileVisible !== false)
      .map((u) => {
        if (u.role === 'athlete' && u.athlete_profiles) {
          return this.athleteCardFromUser(u);
        }
        if ((u.role === 'coach' || u.role === 'recruiter') && u.recruiter_profiles) {
          return this.recruiterCardFromUser(u);
        }
        return null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Cursor for the next page = created_at of the LAST row we returned.
    // null when the page didn't fill (hasMore=false), so the client knows
    // to stop. ISO string so it survives JSON + the DTO's IsString check.
    const last = users[users.length - 1];
    const nextCursor =
      users.length === limit && last?.created_at
        ? last.created_at.toISOString()
        : null;

    return {
      cards,
      hasMore: users.length === limit,
      swipesRemaining,
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

    const excluded = await this.excludedUserIds(user.id);

    // The map mirrors the Discover feed's role matrix: an athlete sees
    // coaches/agents, a coach/agent sees athletes. Without this the map showed
    // athletes to EVERYONE, so an athlete tapping a pin hit the swipe() role
    // guard and got a 403 on a profile they were never allowed to draft.
    const targetsRecruiters = user.role === UserRole.ATHLETE;

    const where: Prisma.public_usersWhereInput = {
      is_banned: false,
      id: { notIn: [...excluded, user.id] },
      ...(targetsRecruiters
        ? { role: { in: ['coach', 'recruiter'] } }
        : // Same COPPA gate as the feed — unapproved minors stay off the map.
          { role: 'athlete', activation_status: 'active' }),
    };
    if (query.country && !query.includeInternational) where.country = query.country;
    // Same free-text city match the feed uses (see getEveryoneFeed).
    const cityFilter = (query.city ?? '').trim();
    if (cityFilter.length > 0) {
      where.location = { contains: cityFilter, mode: 'insensitive' };
    }

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
        athlete_profiles: {
          select: {
            sport: true,
            position: true,
            level: true,
            class_year: true,
            height: true,
            gpa: true,
            photos: true,
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
          lat,
          lng,
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
   * The client's role-matching matrix, in one place. Athletes match with
   * coaches/agents; coaches and agents match with athletes only. (Parent
   * matching is handled on its own path and is intentionally not covered
   * here yet.) Symmetric: canMatch(a,b) === canMatch(b,a).
   */
  private canMatch(roleA: UserRole, roleB: UserRole): boolean {
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
    // Parents draft on behalf of their linked minor: everything below runs as
    // that athlete (`actor`), so a parent's Draft on a coach produces a real
    // athlete↔coach match. Non-parents act as themselves.
    const actor: CurrentUserPayload =
      user.role === UserRole.PARENT
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

    // Mirror the feed filter: a banned target must never accept a swipe,
    // otherwise a banned user can still be "matched" via a deep-linked id
    // and end up in the swiper's matches/messages.
    const target = await this.prisma.public_users.findUnique({
      where: { id: dto.targetUserId },
      select: { is_banned: true, role: true },
    });
    if (!target || target.is_banned) {
      throw new NotFoundException('User not found');
    }

    // Role-pair guard (client matrix). Belt-and-braces on top of the feed
    // filter: a deep-linked / hand-crafted targetUserId must not be able to
    // create an illegal match (athlete↔athlete, coach↔agent, etc.).
    if (!this.canMatch(actor.role, target.role as UserRole)) {
      throw new ForbiddenException('You cannot match with this user');
    }

    // Passes are always free; only Drafts (right-swipes) consume the monthly
    // allowance. Block a Draft only when its quota is exhausted — the 429 lets
    // the client show the upgrade CTA (distinct from the 403 role/block paths).
    if (dto.direction === SwipeDirection.DRAFT) {
      const remaining = await this.getSwipesRemaining(actor.id);
      if (remaining === 0) {
        throw new HttpException(
          'Monthly Draft limit reached. Upgrade for unlimited Drafts.',
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
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Already swiped on this user');
      }
      throw new BadRequestException((e as Error).message);
    }

    // Only Drafts consume the monthly allowance (passes are free). Spend the
    // plan quota first; if exhausted, dip into bonus_swipes (from swipe-packs).
    // swipes_used_today is reused as the month-to-date Draft counter.
    if (dto.direction === SwipeDirection.DRAFT) {
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
      await this.prisma.$executeRawUnsafe(
        'select public.increment_likes_received($1::uuid)',
        dto.targetUserId,
      );

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
            data: { user_1_id: user1, user_2_id: user2 },
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
    }

    const swipesRemaining = await this.getSwipesRemaining(actor.id);
    return { matched, matchId, swipesRemaining };
  }

  async myDrafts(user: CurrentUserPayload) {
    // A guardian drafts on behalf of their linked athlete, so their draft list
    // IS that athlete's. Without this a parent could Draft but never see (or
    // withdraw) what they'd sent.
    const userId = await this.resolveActorId(user, false);

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

    return outgoing.map((r) => ({
      swiped_id: r.swiped_id,
      created_at: r.created_at,
      swiped: r.users_swipes_swiped_idTousers,
      matched: matchedSet.has(r.swiped_id),
    }));
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

    const rows = await this.prisma.swipes.findMany({
      where: {
        swiped_id: userId,
        direction: SwipeDirection.DRAFT,
        swiper_id: { notIn: excludeSwiperIds },
        // A banned swiper must not appear in the "who drafted me" list —
        // mirrors the feed/match ban filters so a suspended account can't
        // influence the recipient's discover funnel.
        users_swipes_swiper_idTousers: { is_banned: false },
      },
      select: {
        swiped_id: true,
        created_at: true,
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
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return rows.map((r) => ({
      swiped_id: r.swiped_id,
      created_at: r.created_at,
      swiper: r.users_swipes_swiper_idTousers,
    }));
  }

  // Remaining DRAFTS this month. Passes are free; the monthly allowance comes
  // from the plan (PLAN_SWIPE_LIMITS) and resets on the 1st. -1 = unlimited.
  // swipes_used_today/swipes_reset_at are reused as the month-to-date counter.
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

    // Monthly reset: compare YYYY-MM.
    const now = new Date();
    const monthKey = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const resetMonth = sub.swipes_reset_at ? monthKey(sub.swipes_reset_at) : null;

    if (resetMonth !== monthKey(now)) {
      const firstOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      await this.prisma.subscriptions.update({
        where: { user_id: userId },
        data: { swipes_used_today: 0, swipes_reset_at: firstOfMonth },
      });
      return (limit === -1 ? UNLIMITED : limit) + bonus;
    }

    if (limit === -1) return UNLIMITED + bonus;
    return Math.max(0, limit - (sub.swipes_used_today ?? 0)) + bonus;
  }
}
