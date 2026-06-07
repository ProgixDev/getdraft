import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface DiscoverPreferences {
  distanceKm: number | null;
  includeInternational: boolean;
  country: string;
  city: string;
  sport: string;
  recruiterType: "all" | "agent" | "coach";
  athletePosition: string;
  athleteLevel: string;
  verifiedRecruitersOnly: boolean;
}

export const defaultDiscoverPreferences: DiscoverPreferences = {
  distanceKm: 160,
  // Default: show EVERYONE (no country filter). Filtering is opt-in — the user
  // turns "Include international" off and/or picks a country in Preferences.
  includeInternational: true,
  country: "",
  city: "",
  sport: "all",
  recruiterType: "all",
  athletePosition: "all",
  athleteLevel: "all",
  verifiedRecruitersOnly: false,
};

const discoverPreferencesSlice = createSlice({
  name: "discoverPreferences",
  initialState: defaultDiscoverPreferences,
  reducers: {
    setDiscoverPreferences: (
      _state,
      action: PayloadAction<DiscoverPreferences>,
    ) => ({
      ...action.payload,
    }),
    resetDiscoverPreferences: () => ({
      ...defaultDiscoverPreferences,
    }),
  },
});

export const { setDiscoverPreferences, resetDiscoverPreferences } =
  discoverPreferencesSlice.actions;

export default discoverPreferencesSlice.reducer;
