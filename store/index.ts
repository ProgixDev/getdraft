import { configureStore } from '@reduxjs/toolkit';

// Import slices here
import authReducer from './slices/authSlice';
import discoverPreferencesReducer from './slices/discoverPreferencesSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        discoverPreferences: discoverPreferencesReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // Ignore non-serializable values in specific paths if needed
                ignoredActions: [],
                ignoredPaths: [],
            },
        }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
