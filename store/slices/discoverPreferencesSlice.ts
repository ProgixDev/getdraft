import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DiscoverPreferences {
  distanceKm: number | null;
  includeInternational: boolean;
  country: string;
  city: string;
  sport: string;
  recruiterType: 'all' | 'agent' | 'coach';
  athletePosition: string;
  athleteLevel: string;
  verifiedRecruitersOnly: boolean;
}

export const defaultDiscoverPreferences: DiscoverPreferences = {
  distanceKm: 160,
  includeInternational: false,
  country: 'United States',
  city: '',
  sport: 'all',
  recruiterType: 'all',
  athletePosition: 'all',
  athleteLevel: 'all',
  verifiedRecruitersOnly: false,
};

const discoverPreferencesSlice = createSlice({
  name: 'discoverPreferences',
  initialState: defaultDiscoverPreferences,
  reducers: {
    setDiscoverPreferences: (_state, action: PayloadAction<DiscoverPreferences>) => ({
      ...action.payload,
    }),
    resetDiscoverPreferences: () => ({
      ...defaultDiscoverPreferences,
    }),
  },
});

export const { setDiscoverPreferences, resetDiscoverPreferences } = discoverPreferencesSlice.actions;

export default discoverPreferencesSlice.reducer;
