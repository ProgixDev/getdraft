import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { authService, type AuthResponse } from "@/services/auth";
import { usersService } from "@/services/users";
import { chatService } from "@/services/chat";
import { saveAuth, clearAuth } from "../authStorage";

export type UserRole = "athlete" | "parent" | "coach" | "recruiter" | "admin";

export type ActivationStatus = "active" | "pending_guardian";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  /**
   * Under-18 athletes are 'pending_guardian' until a guardian validates
   * them and an admin approves the link; the root layout then blocks the
   * whole app behind the pending-activation screen. Absent/undefined is
   * treated as 'active' (every adult / non-athlete / pre-existing account).
   */
  activationStatus?: ActivationStatus;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isOnboarded: false,
  isLoading: false,
  error: null,
};

// --- Async Thunks ---

function describeError(err: any, fallback: string): string {
  if (err?.response?.data?.message) return String(err.response.data.message);
  if (err?.message === "Network Error" || err?.code === "ERR_NETWORK") {
    return "Cannot reach the server. Make sure the backend is running and your device is on the same network.";
  }
  if (err?.code === "ECONNABORTED")
    return "Request timed out. Is the backend responding?";
  if (err?.message) return String(err.message);
  return fallback;
}

export const loginAsync = createAsyncThunk<
  AuthResponse,
  { email: string; password: string },
  { rejectValue: string }
>("auth/loginAsync", async ({ email, password }, { rejectWithValue }) => {
  try {
    return await authService.login(email, password);
  } catch (err: any) {
    return rejectWithValue(
      describeError(err, "Login failed. Please check your credentials."),
    );
  }
});

export const signupAsync = createAsyncThunk<
  AuthResponse,
  { email: string; password: string; role: UserRole; name?: string },
  { rejectValue: string }
>(
  "auth/signupAsync",
  async ({ email, password, role, name }, { rejectWithValue }) => {
    try {
      return await authService.signup(email, password, role, name);
    } catch (err: any) {
      return rejectWithValue(
        describeError(err, "Signup failed. Please try again."),
      );
    }
  },
);

export const logoutAsync = createAsyncThunk("auth/logoutAsync", async () => {
  // Revoke the server session + clear tokens, drop the authenticated realtime
  // socket (otherwise it stays connected as the previous user and is reused
  // after the next login), then wipe persisted auth.
  await authService.logout();
  try {
    chatService.disconnectSocket();
  } catch {
    // never let a socket teardown error block logout
  }
  await clearAuth();
});

export const completeOnboardingAsync = createAsyncThunk<
  { activationStatus: ActivationStatus },
  void,
  { rejectValue: string }
>("auth/completeOnboardingAsync", async (_, { rejectWithValue }) => {
  try {
    const res = await usersService.completeOnboarding();
    const activationStatus: ActivationStatus =
      res?.activation_status === "pending_guardian"
        ? "pending_guardian"
        : "active";
    return { activationStatus };
  } catch (err: any) {
    return rejectWithValue(
      err.response?.data?.message || "Failed to complete onboarding",
    );
  }
});

// --- Slice ---

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    // Synchronous login (for restoring from storage or mock)
    login: (
      state,
      action: PayloadAction<{ user: User; isOnboarded?: boolean }>,
    ) => {
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.isOnboarded = action.payload.isOnboarded ?? false;
      state.error = null;
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isOnboarded = false;
      state.error = null;
    },
    completeOnboarding: (state) => {
      state.isOnboarded = true;
      if (state.user) {
        saveAuth({ user: state.user, isOnboarded: true }).catch(() => {});
      }
    },
    // Sync the minor-activation gate. Set from GET /users/me on app entry,
    // and flipped to 'active' by the pending-activation screen once the
    // guardian link is approved (or via the __DEV__ bypass).
    setActivationStatus: (state, action: PayloadAction<ActivationStatus>) => {
      if (state.user) {
        state.user.activationStatus = action.payload;
        saveAuth({ user: state.user, isOnboarded: state.isOnboarded }).catch(
          () => {},
        );
      }
    },
    // Merge fields into the current user + persist. Used to push the real
    // name (collected in profile setup, or read from /users/me) into the
    // store so screens like Discover show the actual first name instead of
    // the email-derived placeholder seeded at signup.
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        saveAuth({ user: state.user, isOnboarded: state.isOnboarded }).catch(
          () => {},
        );
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isOnboarded = action.payload.isOnboarded;
        saveAuth({
          user: action.payload.user,
          isOnboarded: action.payload.isOnboarded,
        });
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Login failed";
      });

    // Signup
    builder
      .addCase(signupAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signupAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isOnboarded = false;
        saveAuth({ user: action.payload.user, isOnboarded: false });
      })
      .addCase(signupAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? "Signup failed";
      });

    // Logout
    builder.addCase(logoutAsync.fulfilled, (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isOnboarded = false;
    });

    // Complete onboarding — also carry the server's activation status so an
    // under-18 athlete is gated on the first app frame (no tab-bar flash).
    builder.addCase(completeOnboardingAsync.fulfilled, (state, action) => {
      state.isOnboarded = true;
      if (state.user) {
        state.user.activationStatus = action.payload.activationStatus;
        saveAuth({ user: state.user, isOnboarded: true }).catch(() => {});
      }
    });
  },
});

export const {
  login,
  logout,
  completeOnboarding,
  setActivationStatus,
  updateUser,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;
