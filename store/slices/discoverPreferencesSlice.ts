import { createSlice, PayloadAction } from "@reduxjs/toolkit";

/**
 * Which pool Discover (and the Globe) shows.
 *   recruit  athletes ↔ coaches/agents -- the original product
 *   peer     your own role -- the Community layer, for advice and tips
 * Lives in preferences rather than screen state so the feed effect, the
 * carousel reset and the Globe all follow it without extra wiring. It is the
 * one preference that survives a relaunch: useDiscoverModePersistence (mounted
 * in the root layout) saves it per user and restores it on sign-in, starting
 * from recruit the first time. The filters themselves are not persisted.
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
    // Resets the FILTERS. The Recruiting | Community choice is not a filter
    // and has its own switch on Discover, so Reset keeps it: tapping Reset in
    // Community used to drop you back into Recruiting without a word.
    resetDiscoverPreferences: (state) => ({
      ...defaultDiscoverPreferences,
      mode: state.mode,
    }),
    setDiscoverMode: (state, action: PayloadAction<DiscoverMode>) => {
      state.mode = action.payload;
    },
  },
  // Signing out returns Discover to Recruiting. The saved choice is per user
  // and is restored at sign-in, so without this the next person to sign in on
  // the same phone opened on the previous one's Community tab. Matched by
  // action type so this slice does not import the auth slice.
  extraReducers: (builder) => {
    builder.addMatcher(
      (action) =>
        action.type === "auth/logout" ||
        action.type === "auth/logoutAsync/fulfilled" ||
        action.type === "auth/logoutAsync/rejected",
      (state) => {
        state.mode = "recruit";
      },
    );
  },
});

export const {
  setDiscoverPreferences,
  resetDiscoverPreferences,
  setDiscoverMode,
} = discoverPreferencesSlice.actions;

export default discoverPreferencesSlice.reducer;
