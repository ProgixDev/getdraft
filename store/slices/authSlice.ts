import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { authService, type AuthResponse } from "@/services/auth";
import { usersService } from "@/services/users";
import { saveAuth, clearAuth } from "../authStorage";

export type UserRole = "athlete" | "parent" | "coach" | "recruiter" | "admin";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
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
  await authService.logout();
  await clearAuth();
});

export const completeOnboardingAsync = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>("auth/completeOnboardingAsync", async (_, { rejectWithValue }) => {
  try {
    await usersService.completeOnboarding();
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

    // Complete onboarding
    builder.addCase(completeOnboardingAsync.fulfilled, (state) => {
      state.isOnboarded = true;
    });
  },
});

export const { login, logout, completeOnboarding, clearError } =
  authSlice.actions;

export default authSlice.reducer;
