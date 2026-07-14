import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Image,
  Text,
  TextInput,
  Pressable,
  LayoutAnimation,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import KeyboardAwareScreen from "@/components/KeyboardAwareScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { useStripe } from "@stripe/stripe-react-native";
import { images } from "@/config/assets";
import { brand, neutral } from "@/config/colors";
import { MOCK_USERS } from "@/constants/mockUsers";
import { plans as PLAN_CATALOG } from "@/constants/plansData";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  login,
  loginAsync,
  completeOnboarding,
  completeOnboardingAsync,
  setActivationStatus,
  clearError,
  logout,
} from "@/store/slices/authSlice";
import { authService } from "@/services/auth";
import { usersService } from "@/services/users";
import { subscriptionsService } from "@/services/subscriptions";
import { kycService } from "@/services/kyc";
import { guardianLinksService } from "@/services/guardianLinks";
import { EmailVerificationScreen } from "./EmailVerificationScreen";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { PlanSelectionScreen } from "./PlanSelectionScreen";
import { LocationSelectionScreen } from "./LocationSelectionScreen";
import { ProfileSetupScreen } from "./ProfileSetupScreen";
import { MediaUploadScreen } from "./MediaUploadScreen";
import { TutorialScreen } from "./TutorialScreen";
import { KycVerificationScreen } from "./KycVerificationScreen";
import { OnboardingQuestionsScreen } from "./OnboardingQuestionsScreen";
import { GuardianLinkScreen } from "./GuardianLinkScreen";

const { width } = Dimensions.get("window");

interface AuthScreenProps {
  onLogin?: () => void;
  onSignup?: () => void;
  /**
   * Return to the previous screen (the AuthLanding method choices —
   * email vs phone). Rendered as a back chevron on the login/signup
   * card when provided.
   */
  onBack?: () => void;
  /**
   * Bail out of the phone/OAuth role step back to the AuthLanding
   * choices. A step-back isn't possible there (the phone verification
   * token is single-use and the OAuth user already exists), so this
   * renders as a "Cancel" row instead of "Back".
   */
  onCancel?: () => void;
  /**
   * Set when the user arrived via the phone signup path. We skip the
   * email/OTP steps and just collect role + name + password, then call
   * completeSignup with this token.
   */
  phoneVerificationToken?: string;
  /** Display-only: shown on the phone-signup welcome line. */
  initialPhone?: string;
  /**
   * Set when the user arrived via OAuth (Apple, Google) and is brand
   * new. The Supabase user already exists with the trigger-default
   * 'athlete' role; we just need to ask them which role they actually
   * want and update the row before continuing onboarding.
   */
  oauthMode?: { initialName?: string; initialEmail?: string };
}

type AuthMode = "login" | "signup" | "forgot";
type SignupStep =
  | "role"
  | "phone-role" // role + name + password (no email) for phone signups
  | "oauth-role" // role + name (no email, no password) for OAuth signups
  | "verify"
  | "location"
  | "profile"
  | "media" // Athlete-only — upload 4+ photos/videos before KYC
  | "kyc" // Didit identity verification
  | "guardian-link" // Parent-only — scan athlete QR, answer questions, record video
  | "questions" // Per-role onboarding questionnaire — feeds the matching algorithm
  | "tutorial"
  | "plan"; // Subscription pick — LAST step; tap pays via Stripe, X skips (stay on Basic)
type UserRole = "athlete" | "parent" | "coach" | "recruiter";

interface RoleOption {
  id: UserRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  price: string;
  description: string;
}

const roleOptions: RoleOption[] = [
  {
    id: "athlete",
    label: "Player",
    icon: "trophy",
    price: "Athlete",
    description: "Showcase your talent",
  },
  {
    id: "parent",
    label: "Parent",
    icon: "people",
    price: "Guardian",
    description: "Manage athlete journey",
  },
  {
    id: "coach",
    label: "Coach",
    icon: "clipboard",
    price: "Team Staff",
    description: "Scout for talent",
  },
  {
    id: "recruiter",
    label: "Agent",
    icon: "business",
    price: "Professional",
    description: "Discover athletes",
  },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLogin,
  onBack,
  onCancel,
  phoneVerificationToken,
  initialPhone,
  oauthMode,
}) => {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const isPhoneSignup = !!phoneVerificationToken;
  const isOauthSignup = !!oauthMode;

  // Fonts
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // State — when arriving with a phoneVerificationToken we jump straight
  // into the role + name + password step. OAuth arrivals jump to the
  // oauth-role step (role + name, no password).
  const [mode, setMode] = useState<AuthMode>(
    isPhoneSignup || isOauthSignup ? "signup" : "login",
  );
  const [signupStep, setSignupStep] = useState<SignupStep>(
    isPhoneSignup ? "phone-role" : isOauthSignup ? "oauth-role" : "role",
  );
  const [role, setRole] = useState<UserRole>("athlete");
  const [email, setEmail] = useState(oauthMode?.initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(oauthMode?.initialName ?? "");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("basic");
  const [location, setLocation] = useState({ city: "", country: "" });
  /** Set after the OTP is verified; carried into completeSignup. */
  const [verificationToken, setVerificationToken] = useState<string | null>(
    null,
  );

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const isOnboarded = useAppSelector((s) => s.auth.isOnboarded);
  const user = useAppSelector((s) => s.auth.user);

  // Animation values
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    contentOpacity.value = withDelay(300, withTiming(1, { duration: 600 }));
  }, []);

  /**
   * Android hardware/gesture back mirrors the on-screen Back buttons:
   * every step returns to the previous one instead of exiting the app.
   * Returns false only at the flow root so the parent (AuthLanding)
   * or the OS default can take over.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isLoading) return true; // ignore back while a request is in flight
      if (mode === "forgot") {
        setMode("login");
        return true;
      }
      if (mode === "signup" && signupStep !== "role") {
        const roleStep: SignupStep = isPhoneSignup
          ? "phone-role"
          : isOauthSignup
            ? "oauth-role"
            : "role";
        switch (signupStep) {
          case "verify":
          case "location":
            setSignupStep(roleStep);
            return true;
          case "profile":
            if (role === "parent") setSignupStep(roleStep);
            else setSignupStep("location");
            return true;
          case "media":
            setSignupStep("profile");
            return true;
          case "kyc":
            setSignupStep(role === "athlete" ? "media" : "profile");
            return true;
          case "guardian-link":
            setSignupStep("kyc");
            return true;
          case "questions":
            setSignupStep(role === "parent" ? "guardian-link" : "kyc");
            return true;
          case "tutorial":
            setSignupStep("questions");
            return true;
          case "plan":
            setSignupStep("tutorial");
            return true;
          case "phone-role":
          case "oauth-role":
            if (onCancel) {
              onCancel();
              return true;
            }
            return false;
        }
      }
      // Root login/signup card — back out to the sign-in method choices.
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    mode,
    signupStep,
    role,
    isLoading,
    isPhoneSignup,
    isOauthSignup,
    onBack,
    onCancel,
  ]);

  /**
   * Resume signup at the right step when the user is logged in but
   * not onboarded (e.g. they reloaded mid-signup). We ask the backend
   * what's been completed already and drop them at the earliest
   * unfinished step, instead of bouncing them back to "Choose your role".
   */
  useEffect(() => {
    if (!isAuthenticated || isOnboarded) return;
    // A phone/OAuth handoff means the user is creating a NEW account right
    // now — any authenticated session at this point is a stale leftover
    // from a previous (test) signup and must not yank them off the
    // role+name+password step before they can type into it.
    if (isPhoneSignup || isOauthSignup) return;
    // Only auto-resume out of the initial role step — once the user has
    // clicked into a later step we trust their in-progress local state.
    if (signupStep !== "role") return;
    let cancelled = false;
    (async () => {
      // First confirm the session is actually valid. If /users/me
      // returns 401, the persisted user is dead (e.g. AsyncStorage
      // was wiped by a prebuild --clean) — we must NOT drop the
      // user into mid-flow steps without a token. Instead clear
      // Redux + persisted auth so they re-authenticate cleanly.
      let me: any = null;
      let authBroken = false;
      try {
        me = await usersService.getMe();
      } catch (err: any) {
        if (err?.response?.status === 401) authBroken = true;
      }
      if (cancelled) return;
      if (authBroken) {
        dispatch(logout());
        return;
      }

      try {
        const [kyc, guardianLink] = await Promise.all([
          kycService.getStatus().catch(() => null),
          guardianLinksService.getMyLink().catch(() => null),
        ]);
        if (cancelled) return;
        const meRole = (me?.role ?? role) as UserRole;
        // Sync local role state with the authoritative DB role —
        // otherwise after a reload the `role` state defaults to
        // 'athlete' and downstream upserts hit the wrong table.
        if (me?.role && me.role !== role) setRole(me.role as UserRole);
        // Also push the corrected user into Redux so the UI
        // (More tab, profile, tab gating) doesn't lag.
        if (user && me?.role && me.role !== user.role) {
          dispatch(
            login({
              user: {
                ...user,
                role: me.role as UserRole,
                name: me.name ?? user.name,
              },
              isOnboarded,
            }),
          );
        }
        const hasLocation = !!me?.location;
        // Profile step is done when the role-specific profile row exists (the
        // server computes `profileCompleted`). Fall back to the old avatar
        // heuristic only for API responses that predate the flag.
        const hasProfileBio =
          (me as { profileCompleted?: boolean })?.profileCompleted ??
          (!!me?.bio || !!me?.avatar_url);
        const kycApproved = kyc?.kycStatus === "approved";
        // guardian-done MUST come from the server (the guardian_links row),
        // not from a client-writable preference — preferences is free-form
        // JSONB and must never gate past the QR + declaration video.
        const guardianDone =
          meRole !== "parent" ||
          (guardianLink &&
            (guardianLink.status === "pending_admin" ||
              guardianLink.status === "approved"));
        // Parent flow skips location / questions / tutorial /
        // plan — see handleGuardianLinkComplete. So once their
        // guardian-link is in, onboarding is effectively done
        // and they should land in the app rather than re-enter
        // the auth flow on reload.
        const answeredQuestions =
          meRole === "parent" || !!me?.preferences?.onboarding?.answeredAt;
        let resumeAt: SignupStep = "plan";
        if (meRole === "parent") {
          if (!hasProfileBio) resumeAt = "profile";
          else if (!kycApproved) resumeAt = "kyc";
          else if (!guardianDone) resumeAt = "guardian-link";
          else {
            // Everything done — mark onboarded so the
            // layout sends the parent into the main app.
            finishOnboarding().catch(() => {});
            return;
          }
        } else if (!hasLocation) resumeAt = "location";
        else if (!hasProfileBio) resumeAt = "profile";
        else if (!kycApproved) resumeAt = "kyc";
        else if (!guardianDone) resumeAt = "guardian-link";
        else if (!answeredQuestions) resumeAt = "questions";
        else resumeAt = "plan";
        setMode("signup");
        setSignupStep(resumeAt);
      } catch {
        // Non-auth failure — keep them at the role picker rather
        // than guessing a step we can't verify.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnboarded]);

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleToggleMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(mode === "login" ? "signup" : "login");
    setSignupStep("role");
    setEmail("");
    setPassword("");
  };

  const handleBackToRoleSelection = () => {
    setSignupStep(
      isPhoneSignup ? "phone-role" : isOauthSignup ? "oauth-role" : "role",
    );
  };

  /**
   * OAuth signup: Supabase user is already created. We just need to
   * record the chosen role + name on public.users, then drop into the
   * onboarding flow.
   */
  const handleOauthRoleSubmit = async () => {
    if (isLoading) return;
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your name.");
      return;
    }
    setIsLoading(true);
    try {
      await usersService.updateMe({ role, name: name.trim() });
      // Refresh Redux user with the new role + name so downstream screens see it.
      const me = await usersService.getMe().catch(() => null);
      dispatch(
        login({
          user: {
            id: me?.id ?? oauthMode?.initialEmail ?? "",
            email: me?.email ?? oauthMode?.initialEmail ?? "",
            role,
            name: name.trim(),
          },
          isOnboarded: false,
        }),
      );
      setIsLoading(false);
      // Parents skip location (no discover feed of their own) —
      // jump straight to the profile basics.
      setSignupStep(role === "parent" ? "profile" : "location");
    } catch (err: any) {
      setIsLoading(false);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Could not save your role. Please try again.";
      Alert.alert("Error", String(message));
    }
  };

  /**
   * Phone signup: role + name + password are already collected. Call
   * completeSignup with the phoneVerificationToken so the Supabase user
   * is created NOW (first time the user exists in Supabase). Then drop
   * into the onboarding flow.
   */
  const handlePhoneRoleSubmit = async () => {
    if (isLoading) return;
    if (!phoneVerificationToken) return;

    if (!name.trim()) {
      Alert.alert("Error", "Please enter your name.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.completeSignup({
        verificationToken: phoneVerificationToken,
        password,
        role,
        name: name.trim(),
      });
      dispatch(login({ user: result.user, isOnboarded: result.isOnboarded }));
      setIsLoading(false);
      setSignupStep(role === "parent" ? "profile" : "location");
    } catch (err: any) {
      setIsLoading(false);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Could not finish creating your account. Please try again.";
      Alert.alert("Sign-up failed", String(message));
    }
  };

  /**
   * The OTP screen hands us a signed verification token. We immediately
   * call /auth/complete-signup which creates the Supabase user (the
   * FIRST time the user exists in Supabase), saves session tokens, and
   * flips the app into authenticated state. The remaining steps
   * (location / profile / kyc / questions / plan) then run as normal
   * authenticated API calls.
   */
  const handleEmailVerified = async (token: string) => {
    setVerificationToken(token);
    try {
      const result = await authService.completeSignup({
        verificationToken: token,
        password,
        // Don't seed a display name from the email local-part — it leaks into
        // Discover etc. The real name is collected in the profile step
        // (ProfileSetupScreen) and pushed to the store there.
        role,
        name: undefined,
      });
      dispatch(login({ user: result.user, isOnboarded: result.isOnboarded }));
      setSignupStep(role === "parent" ? "profile" : "location");
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Could not finish creating your account. Please try again.";
      Alert.alert("Sign-up failed", String(message));
      // Bounce back to OTP so the user can try a fresh code if it
      // was a timing issue.
      setSignupStep("verify");
    }
  };

  /**
   * Final step in signup. Free plan = finish onboarding. Paid plan =
   * open Stripe Payment Sheet; on success finish onboarding, on
   * cancellation throw so PlanSelectionScreen clears its spinner.
   */
  const handlePlanSelected = async (planId: string) => {
    setSelectedPlan(planId);
    const plan = PLAN_CATALOG.find((p) => p.id === planId);
    if (!plan || plan.price === 0) {
      await finishOnboarding();
      return;
    }
    try {
      const params = await subscriptionsService.createPaymentSheet(planId);
      if (!params?.paymentIntentClientSecret) {
        throw new Error("Stripe did not return a payment session.");
      }
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: "GetDraft",
        customerId: params.customerId,
        customerEphemeralKeySecret: params.ephemeralKeySecret,
        paymentIntentClientSecret: params.paymentIntentClientSecret,
        returnURL: "getdraft://stripe-redirect",
        defaultBillingDetails: { address: { country: "CA" } },
        appearance: {
          primaryButton: {
            colors: { background: brand.primary, text: brand.white },
          },
        },
      });
      if (initErr)
        throw new Error(initErr.message || "Could not prepare checkout.");
      const { error: payErr } = await presentPaymentSheet();
      if (payErr) {
        if (payErr.code === "Canceled") {
          throw new Error("Canceled");
        }
        throw new Error(payErr.message || "Payment failed.");
      }
      await finishOnboarding();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? "Payment failed.";
      if (msg !== "Canceled") {
        Alert.alert("Could not complete payment", String(msg));
      }
      // Re-throw so the per-card spinner on PlanSelectionScreen resets.
      throw err;
    }
  };

  /** X-to-skip: skip plan selection, stay on Basic, finish onboarding. */
  const handleSkipPlan = async () => {
    setSelectedPlan("basic");
    await finishOnboarding();
  };

  const handleLocationSelected = async (
    city: string,
    country: string,
    lat?: number,
    lng?: number,
  ) => {
    setLocation({ city, country });
    // Persist to backend so the user's discover feed can geo-filter AND
    // the talent globe can plot the athlete at their real city (the green
    // pin path) instead of falling back to the country center.
    try {
      await usersService.updateMe({
        location: city ? `${city}${country ? `, ${country}` : ""}` : undefined,
        country: country || undefined,
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
      });
    } catch (err: any) {
      console.warn(
        "[AuthScreen] updateMe(location) failed:",
        err?.response?.data || err?.message,
      );
      // Non-blocking — user can update later from profile
    }
    setSignupStep("profile");
  };

  const handleProfilePayment = () => {
    // Athletes upload their media (4+ photos/videos) before KYC so the
    // profiles scouts browse are never empty. Coaches/agents skip straight
    // to KYC. The KYC gate sits before Payment so we don't collect money
    // from users who'd fail verification.
    setSignupStep(role === "athlete" ? "media" : "kyc");
  };

  const handleMediaComplete = () => {
    setSignupStep("kyc");
  };

  /**
   * After KYC: parents go through guardian-link first (scan + video),
   * everyone else goes straight to the onboarding questionnaire.
   */
  const handleKycComplete = () => {
    setSignupStep(role === "parent" ? "guardian-link" : "questions");
  };

  /**
   * Guardian-link is the LAST signup step for parents. They don't go
   * through the questionnaire (covered by guardian-link + the linked
   * athlete's own preferences), the swipe tutorial (they don't
   * swipe), or the plan picker (subscription lives on the athlete
   * account). Finish onboarding directly.
   */
  const handleGuardianLinkComplete = async () => {
    await finishOnboarding();
  };

  const handleQuestionsComplete = () => {
    setSignupStep("tutorial");
  };

  /** Tutorial → plan (the new last step). */
  const handleTutorialComplete = () => {
    setSignupStep("plan");
  };

  /**
   * Mark onboarding complete on the backend + Redux + AsyncStorage,
   * then drop the user into the main app. Called from both the
   * plan-paid success path and the X-to-skip path.
   */
  const finishOnboarding = async () => {
    try {
      // Success path: the thunk also stores the server's activation_status,
      // so an under-18 athlete is gated on the first app frame.
      await dispatch(completeOnboardingAsync()).unwrap();
      onLogin?.();
      return;
    } catch (err: any) {
      console.warn("[AuthScreen] completeOnboardingAsync failed:", err);
    }

    // Failure path: do NOT blindly flip isOnboarded locally — for a minor
    // that would skip the guardian-activation gate the server never set.
    // Ask the server for the truth before entering the app.
    try {
      const me = await usersService.getMe();
      if (me?.activation_status === "pending_guardian") {
        dispatch(setActivationStatus("pending_guardian"));
      }
      if (me?.is_onboarded) {
        dispatch(completeOnboarding());
        onLogin?.();
        return;
      }
    } catch {
      // Server unreachable — fall through to the retry prompt below.
    }

    Alert.alert(
      "Almost there",
      "We couldn't finish setting up your account. Please check your connection and try again.",
    );
  };

  const handleSubmit = async () => {
    if (isLoading) return;
    dispatch(clearError());

    // Basic validation
    if (!email) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }

    if (!password) {
      Alert.alert("Error", "Please enter your password.");
      return;
    }

    if (mode === "signup" && password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    if (mode === "signup") {
      try {
        // Backend OWNS the verification: it sends a 6-digit OTP via
        // SMTP, and won't create a Supabase user until /auth/complete-signup.
        await authService.requestEmailOtp(email);
        setIsLoading(false);
        setSignupStep("verify");
      } catch (err: any) {
        setIsLoading(false);
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Could not send the verification code. Please try again.";
        Alert.alert("Sign-up failed", String(message));
      }
    } else {
      // Login
      try {
        const result = await dispatch(loginAsync({ email, password })).unwrap();
        setIsLoading(false);
        if (result.isOnboarded) {
          onLogin?.();
        } else {
          // Resume onboarding for an existing user that never finished.
          // MUST set "role" — the resume effect bails on
          // signupStep !== "role" (and isn't keyed on signupStep), so
          // starting on "location" leaves a parent on a step they don't
          // even have in the flow. Going to "role" lets the effect read
          // the user's current state and pick the correct step.
          setMode("signup");
          setSignupStep("role");
        }
      } catch (err: any) {
        // Fallback to mock users only in DEV when the backend is unreachable.
        // In production this must never authenticate against hardcoded creds —
        // a transient network blip would let someone in with demo creds and no
        // real JWT, so every later API call 401s.
        const isNetworkError = !err?.response;
        if (__DEV__ && isNetworkError) {
          const mockUser = MOCK_USERS.find(
            (u) =>
              u.email.toLowerCase() === email.toLowerCase() &&
              u.password === password,
          );
          setIsLoading(false);
          if (mockUser) {
            dispatch(
              login({
                user: {
                  id: mockUser.email,
                  email: mockUser.email,
                  role: mockUser.role,
                  name: mockUser.name,
                },
                isOnboarded: true,
              }),
            );
            onLogin?.();
            return;
          }
        }
        setIsLoading(false);
        Alert.alert(
          "Sign-in failed",
          err?.toString?.() || "Invalid email or password.",
        );
      }
    }
  };

  if (!fontsLoaded) return null;

  // Forgot password flow
  if (mode === "forgot") {
    return (
      <ForgotPasswordScreen
        initialEmail={email}
        onBack={() => setMode("login")}
      />
    );
  }

  // Render signup flow screens
  if (mode === "signup" && signupStep !== "role") {
    switch (signupStep) {
      case "verify":
        return (
          <EmailVerificationScreen
            email={email}
            onVerified={handleEmailVerified}
            onBack={handleBackToRoleSelection}
          />
        );
      case "location":
        return (
          <LocationSelectionScreen
            onLocationSelected={handleLocationSelected}
            onBack={handleBackToRoleSelection}
          />
        );
      case "profile":
        return (
          <ProfileSetupScreen
            role={role}
            onPayment={handleProfilePayment}
            onBack={() =>
              // Parents skipped location, so "back" from
              // their profile step goes to the role picker.
              role === "parent"
                ? handleBackToRoleSelection()
                : setSignupStep("location")
            }
          />
        );
      case "media":
        return (
          <MediaUploadScreen
            onComplete={handleMediaComplete}
            onBack={() => setSignupStep("profile")}
          />
        );
      case "kyc":
        return (
          <KycVerificationScreen
            onComplete={handleKycComplete}
            onBack={() =>
              setSignupStep(role === "athlete" ? "media" : "profile")
            }
          />
        );
      case "guardian-link":
        return (
          <GuardianLinkScreen
            onComplete={handleGuardianLinkComplete}
            onBack={() => setSignupStep("kyc")}
          />
        );
      case "questions":
        return (
          <OnboardingQuestionsScreen
            role={role}
            onComplete={handleQuestionsComplete}
            onBack={() =>
              setSignupStep(role === "parent" ? "guardian-link" : "kyc")
            }
          />
        );
      case "tutorial":
        return (
          <TutorialScreen
            onComplete={handleTutorialComplete}
            onBack={() => setSignupStep("questions")}
          />
        );
      case "plan":
        return (
          <PlanSelectionScreen
            onPlanSelected={handlePlanSelected}
            onSkip={handleSkipPlan}
            onBack={() => setSignupStep("tutorial")}
          />
        );
      case "phone-role":
        return renderPhoneRoleStep();
      case "oauth-role":
        return renderOauthRoleStep();
    }
  }

  function renderOauthRoleStep() {
    return (
      <LinearGradient
        colors={[brand.primary, "#0a4d8f", brand.primary]}
        style={styles.container}
      >
        <KeyboardAwareScreen
          style={styles.container}
          contentContainerStyle={styles.scrollContainer}
        >
            {/* Cancel back to the sign-in method choices */}
            {onCancel && (
              <Pressable
                style={[styles.landingBackButton, { marginTop: insets.top + 4 }]}
                onPress={onCancel}
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={22} color={brand.white} />
                <Text style={styles.landingBackText}>Cancel</Text>
              </Pressable>
            )}

            <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
              <Image
                source={images.logoWhite}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.tagline}>Welcome to GetDraft</Text>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(600).delay(150)}
              style={styles.card}
            >
              <Text style={styles.title}>Choose Your Role</Text>
              <Text style={styles.subtitle}>
                Tell us how you'll use GetDraft.
              </Text>

              <View style={styles.rolesGrid}>
                {roleOptions.map((roleOption) => {
                  const isActive = role === roleOption.id;
                  return (
                    <Pressable
                      key={roleOption.id}
                      style={[styles.roleCard, isActive && styles.roleCardActive]}
                      onPress={() => setRole(roleOption.id)}
                    >
                      <View
                        style={[
                          styles.roleIconContainer,
                          isActive && styles.roleIconContainerActive,
                        ]}
                      >
                        <Ionicons
                          name={roleOption.icon}
                          size={24}
                          color={isActive ? brand.white : brand.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.roleLabel,
                          isActive && styles.roleLabelActive,
                        ]}
                      >
                        {roleOption.label}
                      </Text>
                      <Text
                        style={[
                          styles.roleDescription,
                          isActive && { color: "rgba(255,255,255,0.85)" },
                        ]}
                      >
                        {roleOption.description}
                      </Text>
                      <Text
                        style={[
                          styles.rolePrice,
                          isActive && styles.rolePriceActive,
                        ]}
                      >
                        {roleOption.price}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.formContainer}>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={neutral.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={neutral.gray500}
                    autoCapitalize="words"
                    editable={!isLoading}
                    autoComplete="name"
                  />
                </View>

                <Pressable
                  style={[styles.submitButton, isLoading && { opacity: 0.7 }]}
                  onPress={handleOauthRoleSubmit}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={[brand.primary, "#0a4d8f"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitButtonGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={brand.white} />
                    ) : (
                      <Text style={styles.submitButtonText}>Continue</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
        </KeyboardAwareScreen>
      </LinearGradient>
    );
  }

  function renderPhoneRoleStep() {
    return (
      <LinearGradient
        colors={[brand.primary, "#0a4d8f", brand.primary]}
        style={styles.container}
      >
        <KeyboardAwareScreen
          style={styles.container}
          contentContainerStyle={styles.scrollContainer}
        >
            {/* Cancel back to the sign-in method choices */}
            {onCancel && (
              <Pressable
                style={[styles.landingBackButton, { marginTop: insets.top + 4 }]}
                onPress={onCancel}
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={22} color={brand.white} />
                <Text style={styles.landingBackText}>Cancel</Text>
              </Pressable>
            )}

            <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
              <Image
                source={images.logoWhite}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.tagline}>One last step</Text>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(600).delay(150)}
              style={styles.card}
            >
              <Text style={styles.title}>Choose Your Role</Text>
              <Text style={styles.subtitle}>
                Signing up as {initialPhone ?? "your phone"}
              </Text>

              <View style={styles.rolesGrid}>
                {roleOptions.map((roleOption) => {
                  const isActive = role === roleOption.id;
                  return (
                    <Pressable
                      key={roleOption.id}
                      style={[styles.roleCard, isActive && styles.roleCardActive]}
                      onPress={() => setRole(roleOption.id)}
                    >
                      <View
                        style={[
                          styles.roleIconContainer,
                          isActive && styles.roleIconContainerActive,
                        ]}
                      >
                        <Ionicons
                          name={roleOption.icon}
                          size={24}
                          color={isActive ? brand.white : brand.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.roleLabel,
                          isActive && styles.roleLabelActive,
                        ]}
                      >
                        {roleOption.label}
                      </Text>
                      <Text
                        style={[
                          styles.roleDescription,
                          isActive && { color: "rgba(255,255,255,0.85)" },
                        ]}
                      >
                        {roleOption.description}
                      </Text>
                      <Text
                        style={[
                          styles.rolePrice,
                          isActive && styles.rolePriceActive,
                        ]}
                      >
                        {roleOption.price}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.formContainer}>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={neutral.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={neutral.gray500}
                    autoCapitalize="words"
                    editable={!isLoading}
                    autoComplete="name"
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={neutral.gray400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password (min. 6 characters)"
                    placeholderTextColor={neutral.gray500}
                    secureTextEntry={!isPasswordVisible}
                    editable={!isLoading}
                    autoComplete="new-password"
                  />
                  <Pressable
                    onPress={() => setIsPasswordVisible((v) => !v)}
                    style={styles.eyeIcon}
                  >
                    <Ionicons
                      name={isPasswordVisible ? "eye" : "eye-off"}
                      size={20}
                      color={neutral.gray400}
                    />
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.submitButton, isLoading && { opacity: 0.7 }]}
                  onPress={handlePhoneRoleSubmit}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={[brand.primary, "#0a4d8f"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitButtonGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={brand.white} />
                    ) : (
                      <Text style={styles.submitButtonText}>Continue</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
        </KeyboardAwareScreen>
      </LinearGradient>
    );
  }

  // Render login or initial signup screen
  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <KeyboardAwareScreen
        style={styles.container}
        contentContainerStyle={styles.scrollContainer}
      >
          {/* Back to the sign-in method choices (email / phone) */}
          {onBack && (
            <Pressable
              style={[styles.landingBackButton, { marginTop: insets.top + 4 }]}
              onPress={onBack}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={22} color={brand.white} />
              <Text style={styles.landingBackText}>Back</Text>
            </Pressable>
          )}

          {/* Header with Logo */}
          <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
            <Image
              source={images.logoWhite}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Where Talent Meets Opportunity</Text>
          </Animated.View>

          {/* Main Content Card */}
          <Animated.View
            entering={FadeInDown.duration(800).delay(200)}
            style={styles.card}
          >
            {/* Title */}
            <Text style={styles.title}>
              {mode === "login" ? "Welcome Back" : "Choose Your Role"}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "login"
                ? "Sign in to continue your journey"
                : "Select your role to get started"}
            </Text>
            {mode === "signup" && (
              <Text style={styles.planInfo}>
                Plans start from $0/month • Choose after sign up
              </Text>
            )}

            {/* Role Selector Grid (Signup Only) */}
            {mode === "signup" && (
              <View style={styles.rolesGrid}>
                {roleOptions.map((roleOption, index) => (
                  <Pressable
                    key={roleOption.id}
                    style={[
                      styles.roleCard,
                      role === roleOption.id && styles.roleCardActive,
                    ]}
                    onPress={() => setRole(roleOption.id)}
                  >
                    <View
                      style={[
                        styles.roleIconContainer,
                        role === roleOption.id &&
                          styles.roleIconContainerActive,
                      ]}
                    >
                      <Ionicons
                        name={roleOption.icon}
                        size={24}
                        color={
                          role === roleOption.id ? brand.white : brand.primary
                        }
                      />
                    </View>
                    <Text
                      style={[
                        styles.roleLabel,
                        role === roleOption.id && styles.roleLabelActive,
                      ]}
                    >
                      {roleOption.label}
                    </Text>
                    <Text style={styles.roleDescription}>
                      {roleOption.description}
                    </Text>
                    <Text
                      style={[
                        styles.rolePrice,
                        role === roleOption.id && styles.rolePriceActive,
                      ]}
                    >
                      {roleOption.price}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Form Inputs */}
            <View style={styles.formContainer}>
              {/* Email Input */}
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={neutral.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={neutral.gray400}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password Input */}
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={neutral.gray400}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={
                    mode === "signup"
                      ? "Password (min. 6 characters)"
                      : "Password"
                  }
                  placeholderTextColor={neutral.gray400}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={neutral.gray400}
                  />
                </Pressable>
              </View>

              {mode === "login" && (
                <Pressable
                  style={styles.forgotPassword}
                  onPress={() => setMode("forgot")}
                >
                  <Text style={styles.forgotPasswordText}>
                    Forgot password?
                  </Text>
                </Pressable>
              )}

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleSubmit}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={[brand.primary, "#0a4d8f"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitButtonGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color={brand.white} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {mode === "login" ? "Sign In" : "Continue"}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            {/* Toggle Mode */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {mode === "login"
                  ? "Don't have an account? "
                  : "Already have an account? "}
              </Text>
              <Pressable onPress={handleToggleMode}>
                <Text style={styles.footerLink}>
                  {mode === "login" ? "Get Started" : "Sign In"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
      </KeyboardAwareScreen>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
  },
  logo: {
    width: 140,
    height: 40,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255, 255, 255, 0.9)",
    letterSpacing: 0.3,
  },
  landingBackButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  landingBackText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    marginLeft: 2,
  },
  card: {
    flex: 1,
    backgroundColor: brand.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 20,
  },
  planInfo: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: brand.primary,
    textAlign: "center",
    marginBottom: 24,
  },
  rolesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  roleCard: {
    width: (width - 60) / 2,
    backgroundColor: neutral.gray50,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  roleCardActive: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  roleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  roleIconContainerActive: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  roleLabel: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
    marginBottom: 4,
  },
  roleLabelActive: {
    color: brand.white,
  },
  roleDescription: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
    textAlign: "center",
    marginBottom: 8,
  },
  rolePrice: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
  rolePriceActive: {
    color: brand.white,
  },
  formContainer: {
    gap: 14,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: neutral.gray50,
    borderRadius: 12,
    height: 54,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: neutral.gray200,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    color: brand.primary,
    fontFamily: "Poppins_400Regular",
    paddingTop: 2,
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginTop: -6,
  },
  forgotPasswordText: {
    color: brand.primary,
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  submitButton: {
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 8,
  },
  submitButtonGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: brand.white,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    color: neutral.gray600,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  footerLink: {
    color: brand.primary,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
});
