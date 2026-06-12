import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import KeyboardAwareScreen from '@/components/KeyboardAwareScreen';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, neutral } from '@/config/colors';
import { authService } from '@/services/auth';

interface ForgotPasswordScreenProps {
  initialEmail?: string;
  onBack: () => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
  initialEmail = '',
  onBack,
}) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('That email address does not look right.');
      return;
    }

    setLoading(true);
    try {
      await authService.forgotPassword(trimmed);
      setSubmitted(true);
    } catch (err: any) {
      // Even on error, prefer the "if exists" success message to avoid
      // leaking which emails are registered. Only surface a hard error
      // if the request itself failed (network).
      if (err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
        setError('Cannot reach the server. Try again in a moment.');
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[brand.primary, '#0a4d8f', brand.primary]}
      style={styles.container}
    >
      <KeyboardAwareScreen
        style={styles.container}
        contentContainerStyle={styles.scrollContainer}
      >
          <View style={styles.headerRow}>
            <Pressable style={styles.backButton} onPress={onBack}>
              <Ionicons name="chevron-back" size={22} color={brand.white} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>

          <Animated.View entering={FadeIn.duration(500)} style={styles.iconWrap}>
            <View style={styles.iconCircle}>
              <Ionicons
                name={submitted ? 'mail-open-outline' : 'lock-closed-outline'}
                size={36}
                color={brand.white}
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.card}>
            {submitted ? (
              <>
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.subtitle}>
                  If an account exists for{' '}
                  <Text style={styles.email}>{email.trim()}</Text>, we’ve sent a
                  link to reset your password. The link expires in 1 hour.
                </Text>
                <Pressable style={styles.primaryButton} onPress={onBack}>
                  <Text style={styles.primaryButtonText}>Back to sign in</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setSubmitted(false);
                    setError(null);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Use a different email</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>Forgot password?</Text>
                <Text style={styles.subtitle}>
                  Enter the email you used to sign up. We’ll send a link to reset
                  your password.
                </Text>

                <View style={styles.fieldWrap}>
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={neutral.gray400}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      if (error) setError(null);
                    }}
                    placeholder="Email address"
                    placeholderTextColor={neutral.gray500}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    editable={!loading}
                    returnKeyType="send"
                    onSubmitEditing={handleSubmit}
                  />
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Pressable
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={brand.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send reset link</Text>
                  )}
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={onBack}>
                  <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
      </KeyboardAwareScreen>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_500Medium',
    marginLeft: 2,
  },
  iconWrap: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: brand.white,
    borderRadius: 24,
    padding: 26,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: neutral.gray900,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray600,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  email: {
    fontFamily: 'Poppins_600SemiBold',
    color: neutral.gray900,
  },
  fieldWrap: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: neutral.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  fieldIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray900,
  },
  errorText: {
    color: '#D14',
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    marginTop: 10,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 22,
    backgroundColor: brand.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  secondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: brand.primary,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
});
