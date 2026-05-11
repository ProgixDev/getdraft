import React, { useState } from 'react';
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
import { authService } from '@/services/auth';

const WHATSAPP_GREEN = '#25D366';

type Channel = 'sms' | 'whatsapp';

interface PhoneInputScreenProps {
  /** Pre-fill if returning to this step. */
  initialPhone?: string;
  /** Called once the OTP has been dispatched. */
  onCodeSent: (phone: string, channel: Channel) => void;
  onBack?: () => void;
}

/** Loose E.164 check: leading +, then 8–15 digits. */
const E164 = /^\+[1-9]\d{7,14}$/;

export const PhoneInputScreen: React.FC<PhoneInputScreenProps> = ({
  initialPhone = '+1',
  onCodeSent,
  onBack,
}) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [phone, setPhone] = useState(initialPhone);
  const [pending, setPending] = useState<null | Channel>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (channel: Channel) => {
    if (pending) return;
    setError(null);

    const normalized = phone.replace(/[\s()\-.]/g, '');
    if (!E164.test(normalized)) {
      setError('Enter your number in international format, e.g. +15551234567');
      return;
    }

    setPending(channel);
    try {
      await authService.requestPhoneOtp(normalized, channel);
      onCodeSent(normalized, channel);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Could not send the code. Try again.';
      setError(String(message));
    } finally {
      setPending(null);
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
          {onBack && (
            <View style={styles.headerRow}>
              <Pressable style={styles.backButton} onPress={onBack}>
                <Ionicons name="chevron-back" size={22} color={brand.white} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>
            </View>
          )}

          <Animated.View entering={FadeIn.duration(500)} style={styles.iconWrap}>
            <View style={styles.iconCircle}>
              <Ionicons name="call-outline" size={36} color={brand.white} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(150)} style={styles.card}>
            <Text style={styles.title}>What's your number?</Text>
            <Text style={styles.subtitle}>
              We'll text or message you a 6-digit code to confirm it's you.
            </Text>

            <View style={styles.fieldWrap}>
              <Ionicons name="globe-outline" size={20} color={neutral.gray400} style={styles.fieldIcon} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (error) setError(null);
                }}
                placeholder="+15551234567"
                placeholderTextColor={neutral.gray500}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={pending === null}
                maxLength={20}
              />
            </View>
            <Text style={styles.hint}>
              Include the country code (e.g. +1 for US/CA, +33 for France).
            </Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[
                styles.smsButton,
                pending !== null && styles.buttonDisabled,
              ]}
              onPress={() => handleSend('sms')}
              disabled={pending !== null}
            >
              {pending === 'sms' ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <>
                  <Ionicons name="chatbox-ellipses" size={18} color={brand.white} />
                  <Text style={styles.smsButtonText}>Send code via SMS</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.whatsappButton,
                pending !== null && styles.buttonDisabled,
              ]}
              onPress={() => handleSend('whatsapp')}
              disabled={pending !== null}
            >
              {pending === 'whatsapp' ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <>
                  <Ionicons name="logo-whatsapp" size={20} color={brand.white} />
                  <Text style={styles.whatsappButtonText}>Send code via WhatsApp</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.legal}>
              Standard messaging rates may apply. By continuing you agree to our
              Terms and Privacy Policy.
            </Text>
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
  fieldWrap: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: neutral.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  fieldIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray900,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray500,
    marginTop: 8,
  },
  errorText: {
    color: '#D14',
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    marginTop: 10,
    textAlign: 'center',
  },
  smsButton: {
    marginTop: 22,
    backgroundColor: brand.primary,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
  },
  smsButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  whatsappButton: {
    marginTop: 12,
    backgroundColor: WHATSAPP_GREEN,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
  },
  whatsappButtonText: {
    color: brand.white,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  buttonDisabled: { opacity: 0.65 },
  legal: {
    marginTop: 18,
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray500,
    textAlign: 'center',
    lineHeight: 16,
  },
});
