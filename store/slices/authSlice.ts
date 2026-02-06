import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type UserRole = 'athlete' | 'parent' | 'coach' | 'recruiter' | 'admin';

interface User {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isOnboarded: boolean;
}

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isOnboarded: false,
};

export const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        login: (state, action: PayloadAction<{ user: User }>) => {
            state.user = action.payload.user;
            state.isAuthenticated = true;
            // For now, assume not onboarded upon login if it's a new signup simulation
            state.isOnboarded = false;
        },
        logout: (state) => {
            state.user = null;
            state.isAuthenticated = false;
            state.isOnboarded = false;
        },
        completeOnboarding: (state) => {
            state.isOnboarded = true;
        },
    },
});

export const { login, logout, completeOnboarding } = authSlice.actions;

export default authSlice.reducer;
