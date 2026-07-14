import { useCallback, useState, useEffect } from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Provider, useSelector } from "react-redux";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
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

import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { theme } from "@/config/colors";
import { store, RootState } from "@/store";
import { useAppDispatch } from "@/store/hooks";
import { SplashScreen, WelcomeScreen } from "@/components";
import { AuthLanding, PendingActivationScreen } from "@/components/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loadAuth, saveAuth, clearAuth } from "@/store/authStorage";
import {
  login,
  logout,
  logoutAsync,
  setActivationStatus,
  updateUser,
} from "@/store/slices/authSlice";
import { usersService } from "@/services/users";
import { chatService } from "@/services/chat";
import { API_ORIGIN, setOnSessionExpired } from "@/services/api";

export const unstable_settings = {
  anchor: "(tabs)",
};

type AppState = "loading" | "splash" | "welcome" | "auth" | "app";

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const dispatch = useAppDispatch();
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );
  const isOnboarded = useSelector((state: RootState) => state.auth.isOnboarded);
  const user = useSelector((state: RootState) => state.auth.user);

  const [appState, setAppState] = useState<AppState>("loading");

  // Register the Expo push token + handle notification taps once the
  // user is authenticated. Physical device required.
  usePushNotifications(isAuthenticated && !!user, appState === "app");

  // Prewarm the backend the moment the app launches. Render's free tier
  // sleeps after ~15 min; this fire-and-forget ping wakes it during splash /
  // welcome / auth so the first real request lands on a warm dyno instead
  // of timing out on a 45-55s cold start.
  useEffect(() => {
    fetch(`${API_ORIGIN}/api/health`).catch(() => {});
  }, []);

  // Bridge api.ts's 401-after-refresh-failure into Redux so the existing
  // `appState === "app" && !isAuthenticated` effect below kicks the user
  // back to the auth screen. The callback is registered for the lifetime
  // of this layout, cleared on unmount in case of fast refresh / HMR.
  useEffect(() => {
    setOnSessionExpired(() => {
      try {
        chatService.disconnectSocket();
      } catch {
        // ignore socket teardown errors
      }
      dispatch(logout());
    });
    return () => setOnSessionExpired(null);
  }, [dispatch]);

  // Restore auth on app start. Users who haven't finished onboarding
  // (location / profile / KYC / guardian-link / questions / plan) MUST
  // drop back into the auth flow — otherwise a reload mid-signup would
  // skip straight to home and leave them unverified.
  useEffect(() => {
    loadAuth().then((persisted) => {
      // Restore any saved session into Redux, but ALWAYS open on the
      // splash intro (logo → globe + live stats). Where we land AFTER the
      // intro is decided in handleSplashComplete from the restored auth
      // state — so a returning user still gets the branded cold-launch
      // intro (logo-only fast path) instead of a blank jump into the app.
      if (persisted?.user) {
        dispatch(
          login({ user: persisted.user, isOnboarded: persisted.isOnboarded }),
        );
      }
      setAppState("splash");
    });
  }, [dispatch]);

  // Persist auth when user logs in or onboarding state changes
  useEffect(() => {
    if (isAuthenticated && user) {
      saveAuth({ user, isOnboarded }).catch(() => {});
    }
  }, [isAuthenticated, user, isOnboarded]);

  // Sync the minor-activation gate from the server whenever we land in the
  // app. Covers the just-finished-signup case (the signup response can't
  // know the post-onboarding activation status) and re-checks on every cold
  // launch. The pending-activation screen below also polls while shown.
  useEffect(() => {
    if (appState !== "app" || !isAuthenticated || !isOnboarded) return;
    let cancelled = false;
    usersService
      .getMe()
      .then((me) => {
        if (cancelled) return;
        const status =
          me?.activation_status === "pending_guardian"
            ? "pending_guardian"
            : "active";
        dispatch(setActivationStatus(status));
        // Refresh the real name from the server so Discover etc. show the
        // actual name, not the email-derived placeholder seeded at signup.
        if (me?.name) dispatch(updateUser({ name: me.name }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appState, isAuthenticated, isOnboarded, dispatch]);

  // When user logs out from app, go back to auth screen
  useEffect(() => {
    if (appState === "app" && !isAuthenticated) {
      clearAuth().catch(() => {});
      setAppState("auth");
    }
  }, [appState, isAuthenticated]);

  const handleSplashComplete = useCallback(() => {
    // Returning users (signed in + onboarded) skip the welcome carousel
    // entirely — logo/globe beat → straight into the app. Everyone else
    // (new, logged out, or mid-signup) continues to the welcome intro.
    setAppState(isAuthenticated && isOnboarded ? "app" : "welcome");
  }, [isAuthenticated, isOnboarded]);

  const handleWelcomeComplete = useCallback(() => {
    // After the intro: a fully-onboarded signed-in user goes straight into
    // the app; everyone else (logged out, or mid-signup) lands on the auth
    // flow, which resumes their step if they were mid-signup.
    setAppState(isAuthenticated && isOnboarded ? "app" : "auth");
  }, [isAuthenticated, isOnboarded]);

  const handleAuthComplete = useCallback(() => {
    setAppState("app");
  }, []);

  // Show loading while checking persisted auth
  if (appState === "loading") {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // Show the splash intro on cold launch. Returning (signed-in + onboarded)
  // users get the logo-only fast path (~2.6s, no globe/stats); new and
  // logged-out users see the full globe + live-stats intro.
  if (appState === "splash") {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen
          onAnimationComplete={handleSplashComplete}
          short={isAuthenticated && isOnboarded}
        />
      </>
    );
  }

  // Show welcome/onboarding screens
  if (appState === "welcome") {
    return (
      <View style={{ flex: 1 }}>
        {/* Welcome slides are light-background — dark status icons */}
        <StatusBar style="dark" />
        <WelcomeScreen onComplete={handleWelcomeComplete} />
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

  // Under-18 athletes who haven't been guardian-validated are blocked from
  // the entire app — they only ever see the pending-activation screen until
  // an admin approves their guardian link (then the gate clears and the tabs
  // render). Server-side guards back this up so the API refuses them too.
  if (user?.activationStatus === "pending_guardian") {
    return (
      <>
        <StatusBar style="light" />
        <PendingActivationScreen
          onActivated={() => dispatch(setActivationStatus("active"))}
          onLogout={() => dispatch(logoutAsync())}
        />
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
            <KeyboardProvider>
              <RootLayoutContent />
            </KeyboardProvider>
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
});
