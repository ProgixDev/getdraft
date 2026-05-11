/**
 * Phone countries — ISO code + dial code + display name.
 *
 * Flag emojis are derived at render time from the ISO code (regional
 * indicator code points), so this data stays compact and we don't
 * have to hand-type the emoji for every entry.
 */

export interface PhoneCountry {
  iso: string;      // ISO 3166-1 alpha-2 (e.g. 'US')
  name: string;
  dialCode: string; // No leading '+', so '1', '44', '212'…
}

/** Convert ISO-2 to a flag emoji using regional indicator code points. */
export function flagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) return '🌐';
  return iso
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

/**
 * Curated list covering the major GetDraft markets. Sorted A→Z by
 * country name. Add more here as we expand — the picker handles
 * however many you put in.
 */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'AF', name: 'Afghanistan', dialCode: '93' },
  { iso: 'AL', name: 'Albania', dialCode: '355' },
  { iso: 'DZ', name: 'Algeria', dialCode: '213' },
  { iso: 'AR', name: 'Argentina', dialCode: '54' },
  { iso: 'AM', name: 'Armenia', dialCode: '374' },
  { iso: 'AU', name: 'Australia', dialCode: '61' },
  { iso: 'AT', name: 'Austria', dialCode: '43' },
  { iso: 'AZ', name: 'Azerbaijan', dialCode: '994' },
  { iso: 'BH', name: 'Bahrain', dialCode: '973' },
  { iso: 'BD', name: 'Bangladesh', dialCode: '880' },
  { iso: 'BY', name: 'Belarus', dialCode: '375' },
  { iso: 'BE', name: 'Belgium', dialCode: '32' },
  { iso: 'BO', name: 'Bolivia', dialCode: '591' },
  { iso: 'BA', name: 'Bosnia and Herzegovina', dialCode: '387' },
  { iso: 'BR', name: 'Brazil', dialCode: '55' },
  { iso: 'BG', name: 'Bulgaria', dialCode: '359' },
  { iso: 'KH', name: 'Cambodia', dialCode: '855' },
  { iso: 'CM', name: 'Cameroon', dialCode: '237' },
  { iso: 'CA', name: 'Canada', dialCode: '1' },
  { iso: 'CL', name: 'Chile', dialCode: '56' },
  { iso: 'CN', name: 'China', dialCode: '86' },
  { iso: 'CO', name: 'Colombia', dialCode: '57' },
  { iso: 'CR', name: 'Costa Rica', dialCode: '506' },
  { iso: 'HR', name: 'Croatia', dialCode: '385' },
  { iso: 'CY', name: 'Cyprus', dialCode: '357' },
  { iso: 'CZ', name: 'Czech Republic', dialCode: '420' },
  { iso: 'DK', name: 'Denmark', dialCode: '45' },
  { iso: 'DO', name: 'Dominican Republic', dialCode: '1' },
  { iso: 'EC', name: 'Ecuador', dialCode: '593' },
  { iso: 'EG', name: 'Egypt', dialCode: '20' },
  { iso: 'EE', name: 'Estonia', dialCode: '372' },
  { iso: 'ET', name: 'Ethiopia', dialCode: '251' },
  { iso: 'FI', name: 'Finland', dialCode: '358' },
  { iso: 'FR', name: 'France', dialCode: '33' },
  { iso: 'GE', name: 'Georgia', dialCode: '995' },
  { iso: 'DE', name: 'Germany', dialCode: '49' },
  { iso: 'GH', name: 'Ghana', dialCode: '233' },
  { iso: 'GR', name: 'Greece', dialCode: '30' },
  { iso: 'GT', name: 'Guatemala', dialCode: '502' },
  { iso: 'HK', name: 'Hong Kong', dialCode: '852' },
  { iso: 'HU', name: 'Hungary', dialCode: '36' },
  { iso: 'IS', name: 'Iceland', dialCode: '354' },
  { iso: 'IN', name: 'India', dialCode: '91' },
  { iso: 'ID', name: 'Indonesia', dialCode: '62' },
  { iso: 'IR', name: 'Iran', dialCode: '98' },
  { iso: 'IQ', name: 'Iraq', dialCode: '964' },
  { iso: 'IE', name: 'Ireland', dialCode: '353' },
  { iso: 'IT', name: 'Italy', dialCode: '39' },
  { iso: 'JM', name: 'Jamaica', dialCode: '1' },
  { iso: 'JP', name: 'Japan', dialCode: '81' },
  { iso: 'JO', name: 'Jordan', dialCode: '962' },
  { iso: 'KZ', name: 'Kazakhstan', dialCode: '7' },
  { iso: 'KE', name: 'Kenya', dialCode: '254' },
  { iso: 'KW', name: 'Kuwait', dialCode: '965' },
  { iso: 'LV', name: 'Latvia', dialCode: '371' },
  { iso: 'LB', name: 'Lebanon', dialCode: '961' },
  { iso: 'LY', name: 'Libya', dialCode: '218' },
  { iso: 'LT', name: 'Lithuania', dialCode: '370' },
  { iso: 'LU', name: 'Luxembourg', dialCode: '352' },
  { iso: 'MY', name: 'Malaysia', dialCode: '60' },
  { iso: 'MT', name: 'Malta', dialCode: '356' },
  { iso: 'MX', name: 'Mexico', dialCode: '52' },
  { iso: 'MD', name: 'Moldova', dialCode: '373' },
  { iso: 'MA', name: 'Morocco', dialCode: '212' },
  { iso: 'MM', name: 'Myanmar', dialCode: '95' },
  { iso: 'NL', name: 'Netherlands', dialCode: '31' },
  { iso: 'NZ', name: 'New Zealand', dialCode: '64' },
  { iso: 'NG', name: 'Nigeria', dialCode: '234' },
  { iso: 'NO', name: 'Norway', dialCode: '47' },
  { iso: 'OM', name: 'Oman', dialCode: '968' },
  { iso: 'PK', name: 'Pakistan', dialCode: '92' },
  { iso: 'PA', name: 'Panama', dialCode: '507' },
  { iso: 'PY', name: 'Paraguay', dialCode: '595' },
  { iso: 'PE', name: 'Peru', dialCode: '51' },
  { iso: 'PH', name: 'Philippines', dialCode: '63' },
  { iso: 'PL', name: 'Poland', dialCode: '48' },
  { iso: 'PT', name: 'Portugal', dialCode: '351' },
  { iso: 'PR', name: 'Puerto Rico', dialCode: '1' },
  { iso: 'QA', name: 'Qatar', dialCode: '974' },
  { iso: 'RO', name: 'Romania', dialCode: '40' },
  { iso: 'RU', name: 'Russia', dialCode: '7' },
  { iso: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { iso: 'SN', name: 'Senegal', dialCode: '221' },
  { iso: 'RS', name: 'Serbia', dialCode: '381' },
  { iso: 'SG', name: 'Singapore', dialCode: '65' },
  { iso: 'SK', name: 'Slovakia', dialCode: '421' },
  { iso: 'SI', name: 'Slovenia', dialCode: '386' },
  { iso: 'ZA', name: 'South Africa', dialCode: '27' },
  { iso: 'KR', name: 'South Korea', dialCode: '82' },
  { iso: 'ES', name: 'Spain', dialCode: '34' },
  { iso: 'LK', name: 'Sri Lanka', dialCode: '94' },
  { iso: 'SE', name: 'Sweden', dialCode: '46' },
  { iso: 'CH', name: 'Switzerland', dialCode: '41' },
  { iso: 'TW', name: 'Taiwan', dialCode: '886' },
  { iso: 'TZ', name: 'Tanzania', dialCode: '255' },
  { iso: 'TH', name: 'Thailand', dialCode: '66' },
  { iso: 'TN', name: 'Tunisia', dialCode: '216' },
  { iso: 'TR', name: 'Turkey', dialCode: '90' },
  { iso: 'UG', name: 'Uganda', dialCode: '256' },
  { iso: 'UA', name: 'Ukraine', dialCode: '380' },
  { iso: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { iso: 'GB', name: 'United Kingdom', dialCode: '44' },
  { iso: 'US', name: 'United States', dialCode: '1' },
  { iso: 'UY', name: 'Uruguay', dialCode: '598' },
  { iso: 'UZ', name: 'Uzbekistan', dialCode: '998' },
  { iso: 'VE', name: 'Venezuela', dialCode: '58' },
  { iso: 'VN', name: 'Vietnam', dialCode: '84' },
  { iso: 'YE', name: 'Yemen', dialCode: '967' },
  { iso: 'ZM', name: 'Zambia', dialCode: '260' },
  { iso: 'ZW', name: 'Zimbabwe', dialCode: '263' },
];

export const DEFAULT_PHONE_COUNTRY: PhoneCountry =
  PHONE_COUNTRIES.find((c) => c.iso === 'US') ?? PHONE_COUNTRIES[0];

export function findCountryByIso(iso: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((c) => c.iso === iso);
}
