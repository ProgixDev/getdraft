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
import {
  AppRegistry,
  Platform,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import Constants from "expo-constants";
import { StripeProvider } from "@stripe/stripe-react-native";

// @stripe/stripe-react-native 0.50.3: StripeProvider's effect calls
// NativeStripeSdk.initialise() directly and never runs initStripe(), which
// is the only place the StripeKeepJsAwakeTask headless task is registered.
// Android then logs "No task registered for key StripeKeepJsAwakeTask" when
// the Payment Sheet opens, JS timers pause, and aggressive OEMs (Infinix
// XOS et al.) kill the paused app — it reboots to the welcome screen.
// Register the task ourselves before any sheet can open.
if (Platform.OS === "android") {
  AppRegistry.registerHeadlessTask(
    "StripeKeepJsAwakeTask",
    () => () => new Promise<void>(() => {}),
  );
}
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { theme } from "@/config/colors";
import { store, RootState } from "@/store";
import { SplashScreen, WelcomeScreen } from "@/components";
import { AuthLanding } from "@/components/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadAuth, saveAuth, clearAuth } from "@/store/authStorage";
import { login } from "@/store/slices/authSlice";
import { API_ORIGIN } from "@/services/api";

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

  // Register the Expo push token + handle notification taps once the
  // user is authenticated. Physical device required.
  usePushNotifications(isAuthenticated && !!user);

  // Prewarm the backend the moment the app launches. Render's free tier
  // sleeps after ~15 min; this fire-and-forget ping wakes it during splash /
  // welcome / auth so the first real request lands on a warm dyno instead
  // of timing out on a 45-55s cold start.
  useEffect(() => {
    fetch(`${API_ORIGIN}/api/health`).catch(() => {});
  }, []);

  // Restore auth on app start. Users who haven't finished onboarding
  // (location / profile / KYC / guardian-link / questions / plan) MUST
  // drop back into the auth flow — otherwise a reload mid-signup would
  // skip straight to home and leave them unverified.
  useEffect(() => {
    loadAuth().then((persisted) => {
      if (persisted?.user) {
        dispatch(
          login({ user: persisted.user, isOnboarded: persisted.isOnboarded }),
        );
        setAppState(persisted.isOnboarded ? "app" : "auth");
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
        <AuthLanding onLogin={handleAuthComplete} />
      </>
    );
  }

  // Main app
  return (
    <ThemeProvider value={DarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="preferences" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="post-create" options={{ headerShown: false }} />
        <Stack.Screen
          name="preferences-country"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="chat/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="dm/[conversationId]" options={{ headerShown: false }} />
        <Stack.Screen name="new-message" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="buy-swipes" options={{ headerShown: false }} />
        <Stack.Screen name="help-center" options={{ headerShown: false }} />
        <Stack.Screen name="invite-friends" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ headerShown: false }} />
        <Stack.Screen name="drafts-received" options={{ headerShown: false }} />
        <Stack.Screen name="rankings" options={{ headerShown: false }} />
        <Stack.Screen
          name="video"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen name="user/[userId]" options={{ headerShown: false }} />
        <Stack.Screen name="link-guardian" options={{ headerShown: false }} />
        <Stack.Screen name="guardian-link" options={{ headerShown: false }} />
        <Stack.Screen
          name="admin-guardian-links"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

const stripePublishableKey =
  (Constants.expoConfig?.extra as { stripePublishableKey?: string } | undefined)
    ?.stripePublishableKey ?? "";

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <StripeProvider
          publishableKey={stripePublishableKey}
          // merchantIdentifier intentionally omitted while signing with a
          // free personal Apple team — Apple Pay capability requires a
          // paid Developer Program membership. Add it back when we join.
        >
          <GestureHandlerRootView style={styles.container}>
            <RootLayoutContent />
          </GestureHandlerRootView>
        </StripeProvider>
      </Provider>
    </ErrorBoundary>
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
