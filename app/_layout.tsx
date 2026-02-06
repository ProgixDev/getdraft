import { useCallback, useState, useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { store } from '@/store';
import { RootState } from '@/store';
import { SplashScreen, WelcomeScreen, AuthScreen } from '@/components';
import { loadAuth, saveAuth, clearAuth } from '@/store/authStorage';
import { login, logout } from '@/store/slices/authSlice';

export const unstable_settings = {
  anchor: '(tabs)',
};

type AppState = 'loading' | 'splash' | 'welcome' | 'auth' | 'app';

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const user = useSelector((state: RootState) => state.auth.user);

  const [appState, setAppState] = useState<AppState>('loading');

  // Restore auth on app start
  useEffect(() => {
    loadAuth().then((persisted) => {
      if (persisted?.user) {
        dispatch(login({ user: persisted.user }));
        setAppState('app');
      } else {
        setAppState('splash');
      }
    });
  }, [dispatch]);

  // Persist auth when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      saveAuth({ user }).catch(() => {});
    }
  }, [isAuthenticated, user]);

  // When user logs out from app, go back to auth screen
  useEffect(() => {
    if (appState === 'app' && !isAuthenticated) {
      clearAuth().catch(() => {});
      setAppState('auth');
    }
  }, [appState, isAuthenticated]);

  const handleSplashComplete = useCallback(() => {
    setAppState('welcome');
  }, []);

  const handleWelcomeComplete = useCallback(() => {
    setAppState('auth');
  }, []);

  const handleAuthComplete = useCallback(() => {
    setAppState('app');
  }, []);

  // Show loading while checking persisted auth
  if (appState === 'loading') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#121212" />
      </View>
    );
  }

  // Show splash screen on initial load
  if (appState === 'splash') {
    return (
      <SplashScreen
        onAnimationComplete={handleSplashComplete}
        fadeInDuration={800}
        animationDelay={200}
        displayDuration={2500}
      />
    );
  }

  // Show welcome/onboarding screens
  if (appState === 'welcome') {
    return (
      <>
        <StatusBar style="dark" />
        <WelcomeScreen onComplete={handleWelcomeComplete} />
      </>
    );
  }

  // Show auth/login screens
  if (appState === 'auth') {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen onLogin={handleAuthComplete} />
      </>
    );
  }

  // Main app
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <GestureHandlerRootView style={styles.container}>
        <RootLayoutContent />
      </GestureHandlerRootView>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
