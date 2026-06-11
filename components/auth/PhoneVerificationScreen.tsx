import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from 'react-native';
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
import { authService, AuthResponse } from '@/services/auth';

interface PhoneVerificationScreenProps {
  phone: string;
  channel: 'sms' | 'whatsapp';
  /** New phone — called with the signup verification token. */
  onVerified: (verificationToken: string) => void;
  /** Existing account — called with the freshly minted session (login). */
  onExistingUser: (result: AuthResponse) => void;
  onBack: () => void;
}

export const PhoneVerificationScreen: React.FC<PhoneVerificationScreenProps> = ({
  phone,
  channel,
  onVerified,
  onExistingUser,
  onBack,
}) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timer, setTimer] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  const handleChange = (val: string, i: number) => {
    if (val.length > 1) {
      // Paste support: split into individual cells
      const digits = val.replace(/\D/g, '').slice(0, 6).split('');
      const next = ['', '', '', '', '', ''];
      digits.forEach((d, idx) => { next[idx] = d; });
      setCode(next);
      const focusIdx = Math.min(digits.length, 5);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...code];
    next[i] = val.replace(/\D/g, '');
    setCode(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyPress = (e: any, i: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const entered = code.join('');
    if (entered.length !== 6) {
      Alert.alert('Error', 'Please enter the complete 6-digit code.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await authService.verifyPhoneOtp(phone, entered);
      setIsLoading(false);
      if (result.existingUser) {
        onExistingUser(result);
      } else {
        onVerified(result.verificationToken);
      }
    } catch (err: any) {
      setIsLoading(false);
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Incorrect or expired code.';
      Alert.alert('Verification failed', String(message));
    }
  };

  const handleResend = async () => {
    if (timer > 0 || isResending) return;
    setIsResending(true);
    try {
      await authService.requestPhoneOtp(phone, channel);
      setTimer(60);
      Alert.alert('Code sent', `A new code is on its way via ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Could not resend the code.';
      Alert.alert('Resend failed', String(message));
    } finally {
      setIsResending(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[brand.primary, '#0a4d8f', brand.primary]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
                name={channel === 'whatsapp' ? 'logo-whatsapp' : 'chatbox-ellipses-outline'}
                size={36}
                color={brand.white}
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.card}>
            <Text style={styles.title}>Enter your code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{' '}
              <Text style={styles.phone}>{phone}</Text>{' '}
              via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.
            </Text>

            <View style={styles.codeRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { inputRefs.current[i] = ref; }}
                  style={[styles.codeCell, digit && styles.codeCellFilled]}
                  value={digit}
                  onChangeText={(v) => handleChange(v, i)}
                  onKeyPress={(e) => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus={i === 0}
                  editable={!isLoading}
                  selectTextOnFocus
                />
              ))}
            </View>

            <Pressable
              style={[styles.verifyButton, isLoading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <Text style={styles.verifyButtonText}>Verify</Text>
              )}
            </Pressable>

            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              <Pressable onPress={handleResend} disabled={timer > 0 || isResending}>
                <Text style={[styles.resendLink, timer > 0 && styles.resendLinkDisabled]}>
                  {timer > 0 ? `Resend in ${timer}s` : 'Resend'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  iconWrap: { alignItems: 'center', marginTop: 12, marginBottom: 24 },
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
    fontSize: 22,
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
  phone: {
    fontFamily: 'Poppins_600SemiBold',
    color: neutral.gray900,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 8,
  },
  codeCell: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: neutral.gray100,
    borderWidth: 1.5,
    borderColor: neutral.gray200,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: neutral.gray900,
  },
  codeCellFilled: {
    borderColor: brand.primary,
    backgroundColor: brand.white,
  },
  verifyButton: {
    marginTop: 22,
    backgroundColor: brand.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.65 },
  verifyButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  resendText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray600,
  },
  resendLink: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.primary,
  },
  resendLinkDisabled: {
    color: neutral.gray400,
  },
});
