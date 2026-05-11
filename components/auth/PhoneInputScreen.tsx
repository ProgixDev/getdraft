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
import {
  PhoneCountry,
  PHONE_COUNTRIES,
  DEFAULT_PHONE_COUNTRY,
  flagEmoji,
} from '@/constants/phoneCountries';
import { CountryPickerModal } from './CountryPickerModal';

const WHATSAPP_GREEN = '#25D366';

type Channel = 'sms' | 'whatsapp';

interface PhoneInputScreenProps {
  /** Pre-fill if returning to this step. E.164 string like `+15551234567`. */
  initialPhone?: string;
  /** Called once the OTP has been dispatched. */
  onCodeSent: (phone: string, channel: Channel) => void;
  onBack?: () => void;
}

/** Loose E.164 check: leading +, then 8–15 digits. */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Best-effort split: given an E.164 string, find the country whose dial
 * code matches the longest prefix. Returns the country + the rest.
 */
function splitInitial(phone: string): { country: PhoneCountry; local: string } {
  if (!phone || !phone.startsWith('+')) {
    return { country: DEFAULT_PHONE_COUNTRY, local: '' };
  }
  const digits = phone.slice(1).replace(/\D/g, '');
  // Sort by dial-code length DESC so longer codes match first (e.g. +1xxx
  // for Dominican Republic before +1 for the US).
  const sorted = [...PHONE_COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );
  for (const c of sorted) {
    if (digits.startsWith(c.dialCode)) {
      return { country: c, local: digits.slice(c.dialCode.length) };
    }
  }
  return { country: DEFAULT_PHONE_COUNTRY, local: digits };
}

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

  const initial = splitInitial(initialPhone ?? '');
  const [country, setCountry] = useState<PhoneCountry>(initial.country);
  const [localNumber, setLocalNumber] = useState<string>(initial.local);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<null | Channel>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (channel: Channel) => {
    if (pending) return;
    setError(null);

    const digits = localNumber.replace(/\D/g, '');
    const normalized = `+${country.dialCode}${digits}`;
    if (!E164.test(normalized)) {
      setError('Enter a valid phone number for the selected country.');
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

            <View style={styles.fieldRow}>
              <Pressable
                style={({ pressed }) => [styles.countryPill, pressed && { opacity: 0.7 }]}
                onPress={() => setPickerOpen(true)}
                disabled={pending !== null}
              >
                <Text style={styles.countryFlag}>{flagEmoji(country.iso)}</Text>
                <Text style={styles.countryDial}>+{country.dialCode}</Text>
                <Ionicons name="chevron-down" size={14} color={neutral.gray500} />
              </Pressable>

              <View style={styles.numberWrap}>
                <TextInput
                  style={styles.input}
                  value={localNumber}
                  onChangeText={(v) => {
                    // Strip everything but digits/spaces/dashes for visual cleanliness.
                    setLocalNumber(v.replace(/[^\d\s\-().]/g, ''));
                    if (error) setError(null);
                  }}
                  placeholder="555 123 4567"
                  placeholderTextColor={neutral.gray500}
                  keyboardType="phone-pad"
                  autoComplete="tel-national"
                  editable={pending === null}
                  maxLength={18}
                />
              </View>
            </View>
            <Text style={styles.hint}>
              Tap the country code to change it.
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

      <CountryPickerModal
        visible={pickerOpen}
        selectedIso={country.iso}
        onSelect={(c) => setCountry(c)}
        onClose={() => setPickerOpen(false)}
      />
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
  fieldRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: neutral.gray100,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
  },
  countryFlag: {
    fontSize: 22,
    lineHeight: 26,
  },
  countryDial: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: neutral.gray900,
  },
  numberWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: neutral.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
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
