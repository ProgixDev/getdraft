import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Image,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { useAppDispatch } from '@/store/hooks';
import { login } from '@/store/slices/authSlice';
import { brand } from '@/config/colors';
import { images } from '@/config/assets';
import { GrainyGradient } from '@/components/welcome';
import { authService, AuthResponse } from '@/services/auth';
import { AuthScreen } from './AuthScreen';
import { PhoneInputScreen } from './PhoneInputScreen';
import { PhoneVerificationScreen } from './PhoneVerificationScreen';

interface AuthLandingProps {
  onLogin?: () => void;
}

type LandingState =
  | 'landing'
  | 'email'
  | 'phone-input'
  | 'phone-verify'
  | 'phone-onboarding'
  | 'oauth-onboarding';

type OAuthProvider = 'apple' | 'google';

/**
 * Post-welcome auth entry. User picks how to continue: phone (primary),
 * or Apple / Google / Email (secondary). Owns the state machine until
 * we hand off to AuthScreen with either no token (email path) or a
 * phoneVerificationToken (phone path).
 */
export const AuthLanding: React.FC<AuthLandingProps> = ({ onLogin }) => {
  const dispatch = useAppDispatch();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const [state, setState] = useState<LandingState>('landing');
  const [phone, setPhone] = useState<string>('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [phoneVerificationToken, setPhoneVerificationToken] = useState<string>('');
  const [oauthInitial, setOauthInitial] = useState<{ name?: string; email?: string }>({});
  const [pendingOauth, setPendingOauth] = useState<OAuthProvider | null>(null);

  const handleCodeSent = useCallback((p: string, c: 'sms' | 'whatsapp') => {
    setPhone(p);
    setChannel(c);
    setState('phone-verify');
  }, []);

  const handlePhoneVerified = useCallback((token: string) => {
    setPhoneVerificationToken(token);
    setState('phone-onboarding');
  }, []);

  // Existing account verified by phone OTP — same shape as the OAuth
  // returning-user path. Onboarded users go straight into the app;
  // mid-onboarding users land on AuthScreen, whose resume logic routes
  // them to the exact signup step they left off at.
  const handlePhoneExistingUser = useCallback(
    (result: AuthResponse) => {
      dispatch(login({ user: result.user, isOnboarded: result.isOnboarded }));
      if (result.isOnboarded) {
        onLogin?.();
      } else {
        setState('email');
      }
    },
    [dispatch, onLogin],
  );

  const handleOAuth = useCallback(
    async (provider: OAuthProvider) => {
      if (pendingOauth) return;
      setPendingOauth(provider);
      try {
        const result = await authService.signInWithProvider(provider);
        if (!result) return; // user canceled the in-app browser
        if (result.isOnboarded) {
          // Returning user — log straight in.
          dispatch(login({ user: result.user, isOnboarded: true }));
          onLogin?.();
        } else {
          // New user — route through the OAuth role-picker step.
          setOauthInitial({ name: result.user.name, email: result.user.email });
          setState('oauth-onboarding');
        }
      } catch (err: any) {
        const message =
          err?.message ?? `Could not sign in with ${provider}. Please try again.`;
        Alert.alert(`${provider === 'apple' ? 'Apple' : 'Google'} sign-in failed`, String(message));
      } finally {
        setPendingOauth(null);
      }
    },
    [pendingOauth, dispatch, onLogin],
  );

  if (!fontsLoaded) return null;

  // Email path delegates entirely to existing AuthScreen.
  if (state === 'email') {
    return <AuthScreen onLogin={onLogin} />;
  }

  // Phone-input → phone-verify → phone-onboarding (AuthScreen w/ phone token).
  if (state === 'phone-input') {
    return (
      <PhoneInputScreen
        initialPhone={phone || '+1'}
        onCodeSent={handleCodeSent}
        onBack={() => setState('landing')}
      />
    );
  }
  if (state === 'phone-verify') {
    return (
      <PhoneVerificationScreen
        phone={phone}
        channel={channel}
        onVerified={handlePhoneVerified}
        onExistingUser={handlePhoneExistingUser}
        onBack={() => setState('phone-input')}
      />
    );
  }
  if (state === 'phone-onboarding') {
    return (
      <AuthScreen
        onLogin={onLogin}
        phoneVerificationToken={phoneVerificationToken}
        initialPhone={phone}
      />
    );
  }
  if (state === 'oauth-onboarding') {
    return (
      <AuthScreen
        onLogin={onLogin}
        oauthMode={{ initialName: oauthInitial.name, initialEmail: oauthInitial.email }}
      />
    );
  }

  // Landing — four-button entry.
  return (
    <View style={styles.container}>
      <GrainyGradient />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)} style={styles.headerWrap}>
          <Image source={images.logoWhite} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Welcome to GetDraft</Text>
          <Text style={styles.subtitle}>Pick how you want to continue.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(120)} style={styles.actions}>
          {/* PRIMARY — phone */}
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={() => setState('phone-input')}
          >
            <Ionicons name="call" size={20} color={brand.white} />
            <Text style={styles.primaryButtonText}>Sign in with Phone Number</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* SECONDARIES */}
          <Pressable
            style={({ pressed }) => [
              styles.appleButton,
              pressed && styles.pressed,
              pendingOauth && styles.buttonDisabled,
            ]}
            onPress={() => handleOAuth('apple')}
            disabled={pendingOauth !== null}
          >
            {pendingOauth === 'apple' ? (
              <ActivityIndicator color={brand.white} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color={brand.white} />
                <Text style={styles.appleButtonText}>Apple</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.pressed,
              pendingOauth && styles.buttonDisabled,
            ]}
            onPress={() => handleOAuth('google')}
            disabled={pendingOauth !== null}
          >
            {pendingOauth === 'google' ? (
              <ActivityIndicator color="#1f1f1f" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#1f1f1f" />
                <Text style={styles.googleButtonText}>Google</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.emailButton, pressed && styles.pressed]}
            onPress={() => setState('email')}
            disabled={pendingOauth !== null}
          >
            <Ionicons name="mail-outline" size={20} color={brand.white} />
            <Text style={styles.emailButtonText}>Email</Text>
          </Pressable>
        </Animated.View>

        <Animated.Text entering={FadeIn.duration(500).delay(400)} style={styles.legal}>
          By continuing you agree to the Terms of Service and Privacy Policy.
        </Animated.Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.select({ ios: 80, default: 60 }),
    paddingBottom: 40,
  },
  headerWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    width: 120,
    height: 32,
    marginBottom: 22,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Poppins_800ExtraBold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: brand.primary,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryButtonText: {
    color: brand.white,
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dividerText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  appleButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
  },
  googleButtonText: {
    color: '#1f1f1f',
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  emailButton: {
    backgroundColor: 'transparent',
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  emailButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  pressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  legal: {
    marginTop: 28,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 18,
  },
});

export default AuthLanding;
