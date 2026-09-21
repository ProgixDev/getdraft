import { createSlice, PayloadAction } from "@reduxjs/toolkit";

/**
 * Which pool Discover (and the Globe) shows.
 *   recruit  athletes ↔ coaches/agents -- the original product
 *   peer     your own role -- the Community layer, for advice and tips
 * Lives in preferences rather than screen state so the feed effect, the
 * carousel reset and the Globe all follow it without extra wiring, and so it
 * resets to recruit on every launch (preferences are not persisted).
 */
export type DiscoverMode = "recruit" | "peer";

export interface DiscoverPreferences {
  mode: DiscoverMode;
  distanceKm: number | null;
  includeInternational: boolean;
  country: string;
  /** Wilaya / state / province. Narrows within `country`; "" means no filter. */
  region: string;
  city: string;
  sport: string;
  recruiterType: "all" | "agent" | "coach";
  athletePosition: string;
  athleteLevel: string;
  verifiedRecruitersOnly: boolean;
}

export const defaultDiscoverPreferences: DiscoverPreferences = {
  mode: "recruit",
  distanceKm: 160,
  // Default: show EVERYONE (no country filter). Filtering is opt-in — the user
  // turns "Include international" off and/or picks a country in Preferences.
  includeInternational: true,
  country: "",
  region: "",
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
    setDiscoverMode: (state, action: PayloadAction<DiscoverMode>) => {
      state.mode = action.payload;
    },
  },
});

export const {
  setDiscoverPreferences,
  resetDiscoverPreferences,
  setDiscoverMode,
} = discoverPreferencesSlice.actions;

export default discoverPreferencesSlice.reducer;
