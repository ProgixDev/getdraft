import { useCallback, useState, useEffect } from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Provider, useSelector, useDispatch } from "react-redux";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { theme } from "@/config/colors";
import { store, RootState } from "@/store";
import { SplashScreen, WelcomeScreen, AuthScreen } from "@/components";
import { loadAuth, saveAuth, clearAuth } from "@/store/authStorage";
import { login } from "@/store/slices/authSlice";

export const unstable_settings = {
  anchor: "(tabs)",
};

type AppState = "loading" | "splash" | "welcome" | "auth" | "app";

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );
  const isOnboarded = useSelector((state: RootState) => state.auth.isOnboarded);
  const user = useSelector((state: RootState) => state.auth.user);

  const [appState, setAppState] = useState<AppState>("loading");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionOpacity = useSharedValue(1);

  // Restore auth on app start
  useEffect(() => {
    loadAuth().then((persisted) => {
      if (persisted?.user) {
        dispatch(
          login({ user: persisted.user, isOnboarded: persisted.isOnboarded }),
        );
        setAppState("app");
      } else {
        setAppState("splash");
      }
    });
  }, [dispatch]);

  // Persist auth when user logs in or onboarding state changes
  useEffect(() => {
    if (isAuthenticated && user) {
      saveAuth({ user, isOnboarded }).catch(() => {});
    }
  }, [isAuthenticated, user, isOnboarded]);

  // When user logs out from app, go back to auth screen
  useEffect(() => {
    if (appState === "app" && !isAuthenticated) {
      clearAuth().catch(() => {});
      setAppState("auth");
    }
  }, [appState, isAuthenticated]);

  const handleSplashComplete = useCallback(() => {
    transitionOpacity.value = 1;
    setIsTransitioning(true);
    setAppState("welcome");
    setTimeout(() => {
      transitionOpacity.value = withTiming(0, { duration: 800 });
    }, 50);
    setTimeout(() => {
      setIsTransitioning(false);
    }, 900);
  }, []);

  const handleWelcomeComplete = useCallback(() => {
    setAppState("auth");
  }, []);

  const handleAuthComplete = useCallback(() => {
    setAppState("app");
  }, []);

  const transitionStyle = useAnimatedStyle(() => ({
    opacity: transitionOpacity.value,
  }));

  // Show loading while checking persisted auth
  if (appState === "loading") {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // Show splash screen on initial load
  if (appState === "splash") {
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
  if (appState === "welcome") {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <WelcomeScreen onComplete={handleWelcomeComplete} />
        {isTransitioning && (
          <Animated.View
            style={[styles.transitionOverlay, transitionStyle]}
            pointerEvents="none"
          />
        )}
      </View>
    );
  }

  // Show auth/login screens
  if (appState === "auth") {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen onLogin={handleAuthComplete} />
      </>
    );
  }

  // Main app
  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="preferences" options={{ headerShown: false }} />
        <Stack.Screen
          name="preferences-country"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="chat/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="help-center" options={{ headerShown: false }} />
        <Stack.Screen name="invite-friends" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="light" />
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0A0A",
  },
  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0A0A0A",
  },
});
