import api, { saveTokens, clearTokens } from "./api";
import type { UserRole } from "@/store/slices/authSlice";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
  };
  isOnboarded: boolean;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  async signup(
    email: string,
    password: string,
    role: UserRole,
    name?: string,
  ): Promise<AuthResponse> {
    const { data } = await api.post("/auth/signup", {
      email,
      password,
      role,
      name,
    });
    const result: AuthResponse = data.data;
    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post("/auth/login", { email, password });
    const result: AuthResponse = data.data;
    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  },

  async verifyEmail(email: string, token: string): Promise<AuthResponse> {
    const { data } = await api.post("/auth/verify-email", { email, token });
    const result: AuthResponse = data.data;
    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  },

  async resendOtp(email: string): Promise<void> {
    await api.post("/auth/resend-otp", { email });
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post("/auth/forgot-password", { email });
  },

  // --- OTP-driven signup (backend owns email + creates Supabase user only on completion) ---

  async requestEmailOtp(email: string): Promise<void> {
    await api.post("/auth/email/request-otp", { email });
  },

  async verifyEmailOtp(
    email: string,
    code: string,
  ): Promise<{ verificationToken: string }> {
    const { data } = await api.post("/auth/email/verify-otp", { email, code });
    return data.data;
  },

  async completeSignup(args: {
    verificationToken: string;
    password: string;
    role: UserRole;
    name?: string;
  }): Promise<AuthResponse> {
    const { data } = await api.post("/auth/complete-signup", args);
    const result: AuthResponse = data.data;
    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  },

  async requestPhoneOtp(
    phone: string,
    channel: "sms" | "whatsapp",
  ): Promise<void> {
    await api.post("/auth/phone/request-otp", { phone, channel });
  },

  async verifyPhoneOtp(
    phone: string,
    code: string,
  ): Promise<{ verificationToken: string }> {
    const { data } = await api.post("/auth/phone/verify-otp", { phone, code });
    return data.data;
  },

  // --- OAuth via Supabase (Apple, Google) ---

  /**
   * Opens an in-app browser, runs the Supabase OAuth flow for the given
   * provider, and on success persists the resulting tokens to AsyncStorage
   * so the existing Axios layer can use them. Returns null on user cancel.
   */
  async signInWithProvider(
    provider: "apple" | "google",
  ): Promise<AuthResponse | null> {
    const redirectTo = Linking.createURL("auth/callback");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      throw new Error(error?.message ?? `Could not start ${provider} sign-in.`);
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) return null;

    // PKCE: Supabase appends ?code=... to the redirect URL.
    const parsed = Linking.parse(result.url);
    const code = (parsed.queryParams?.code as string | undefined) ?? null;
    if (!code) throw new Error("OAuth response did not include an auth code.");

    const { data: exchange, error: exchangeErr } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeErr || !exchange.session) {
      throw new Error(exchangeErr?.message ?? "OAuth exchange failed.");
    }

    await saveTokens({
      accessToken: exchange.session.access_token,
      refreshToken: exchange.session.refresh_token,
    });

    // Fetch the public.users row to discover role + onboarding state.
    const { data: meRow } = await api.get("/users/me");
    const me = meRow?.data ?? {};
    const u = exchange.session.user;

    return {
      user: {
        id: u.id,
        email: u.email ?? me.email ?? "",
        role: (me.role as UserRole) ?? "athlete",
        name: me.name ?? (u.user_metadata?.full_name as string | undefined),
      },
      isOnboarded: !!me.is_onboarded,
      accessToken: exchange.session.access_token,
      refreshToken: exchange.session.refresh_token,
    };
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      await clearTokens();
    }
  },
};
