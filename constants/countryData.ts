export interface CountryOption {
  name: string;
  code: string;
  lat: number;
  lng: number;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { name: 'United States', code: 'US', lat: 39.8283, lng: -98.5795 },
  { name: 'Canada', code: 'CA', lat: 56.1304, lng: -106.3468 },
  { name: 'Mexico', code: 'MX', lat: 23.6345, lng: -102.5528 },
  { name: 'Brazil', code: 'BR', lat: -14.235, lng: -51.9253 },
  { name: 'Argentina', code: 'AR', lat: -38.4161, lng: -63.6167 },
  { name: 'United Kingdom', code: 'GB', lat: 55.3781, lng: -3.436 },
  { name: 'France', code: 'FR', lat: 46.2276, lng: 2.2137 },
  { name: 'Germany', code: 'DE', lat: 51.1657, lng: 10.4515 },
  { name: 'Spain', code: 'ES', lat: 40.4637, lng: -3.7492 },
  { name: 'Italy', code: 'IT', lat: 41.8719, lng: 12.5674 },
  { name: 'Netherlands', code: 'NL', lat: 52.1326, lng: 5.2913 },
  { name: 'Sweden', code: 'SE', lat: 60.1282, lng: 18.6435 },
  { name: 'Norway', code: 'NO', lat: 60.472, lng: 8.4689 },
  { name: 'Poland', code: 'PL', lat: 51.9194, lng: 19.1451 },
  { name: 'Turkey', code: 'TR', lat: 38.9637, lng: 35.2433 },
  { name: 'Morocco', code: 'MA', lat: 31.7917, lng: -7.0926 },
  { name: 'Egypt', code: 'EG', lat: 26.8206, lng: 30.8025 },
  { name: 'South Africa', code: 'ZA', lat: -30.5595, lng: 22.9375 },
  { name: 'Nigeria', code: 'NG', lat: 9.082, lng: 8.6753 },
  { name: 'India', code: 'IN', lat: 20.5937, lng: 78.9629 },
  { name: 'Pakistan', code: 'PK', lat: 30.3753, lng: 69.3451 },
  { name: 'China', code: 'CN', lat: 35.8617, lng: 104.1954 },
  { name: 'Japan', code: 'JP', lat: 36.2048, lng: 138.2529 },
  { name: 'South Korea', code: 'KR', lat: 35.9078, lng: 127.7669 },
  { name: 'Thailand', code: 'TH', lat: 15.87, lng: 100.9925 },
  { name: 'Vietnam', code: 'VN', lat: 14.0583, lng: 108.2772 },
  { name: 'Philippines', code: 'PH', lat: 12.8797, lng: 121.774 },
  { name: 'Australia', code: 'AU', lat: -25.2744, lng: 133.7751 },
  { name: 'New Zealand', code: 'NZ', lat: -40.9006, lng: 174.886 },
  { name: 'United Arab Emirates', code: 'AE', lat: 23.4241, lng: 53.8478 },
  { name: 'Saudi Arabia', code: 'SA', lat: 23.8859, lng: 45.0792 },
];

export const findCountryByName = (name: string): CountryOption | undefined =>
  COUNTRY_OPTIONS.find((country) => country.name === name);
