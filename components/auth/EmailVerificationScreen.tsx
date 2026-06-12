import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, neutral } from "@/config/colors";
import { authService } from "@/services/auth";

interface EmailVerificationScreenProps {
  email: string;
  /** Called with the signed verification token returned by /auth/email/verify-otp. */
  onVerified: (verificationToken: string) => void;
  onBack: () => void;
}

export const EmailVerificationScreen: React.FC<
  EmailVerificationScreenProps
> = ({ email, onVerified, onBack }) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [timer, setTimer] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const handleCodeChange = (value: string, index: number) => {
    if (value.length > 1) {
      value = value[value.length - 1];
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setInfoMsg(null);
    const enteredCode = code.join("");
    if (enteredCode.length !== 6) {
      setErrorMsg("Please enter the complete 6-digit code.");
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);

    try {
      const { verificationToken } = await authService.verifyEmailOtp(
        email,
        enteredCode,
      );
      setIsLoading(false);
      onVerified(verificationToken);
    } catch (err: any) {
      setIsLoading(false);
      const message =
        err?.response?.data?.message ||
        "Invalid or expired code. Try again or resend.";
      setErrorMsg(Array.isArray(message) ? message.join(", ") : String(message));
    }
  };

  const handleResend = async () => {
    if (timer > 0 || isResending) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsResending(true);
    try {
      // The backend-owned flow re-issues by upserting a fresh OTP —
      // /auth/resend-otp only covers the legacy Supabase-mailer path.
      await authService.requestEmailOtp(email);
      setInfoMsg("A new code has been sent.");
      setTimer(60);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        "Could not resend the code. Try again in a moment.";
      setErrorMsg(Array.isArray(message) ? message.join(", ") : String(message));
    } finally {
      setIsResending(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={brand.white} />
        </Pressable>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail-outline" size={48} color={brand.primary} />
          </View>
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit verification code to{"\n"}
            <Text style={styles.email}>{email}</Text>
          </Text>
        </Animated.View>

        {/* Code Input */}
        <Animated.View
          entering={FadeInDown.duration(800).delay(200)}
          style={styles.card}
        >
          <Text style={styles.label}>Enter Verification Code</Text>

          <View style={styles.codeContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[styles.codeInput, digit && styles.codeInputFilled]}
                value={digit}
                onChangeText={(value) => handleCodeChange(value, index)}
                onKeyPress={({ nativeEvent: { key } }) =>
                  handleKeyPress(key, index)
                }
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            ))}
          </View>

          {errorMsg && <Text style={styles.errorMsg}>{errorMsg}</Text>}
          {infoMsg && <Text style={styles.infoMsg}>{infoMsg}</Text>}

          {/* Verify Button */}
          <Pressable
            style={({ pressed }) => [
              styles.verifyButton,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[brand.primary, "#0a4d8f"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              {isLoading ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <Text style={styles.buttonText}>Verify Email</Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* Resend */}
          <View style={styles.resendContainer}>
            <Text style={styles.resendText}>Didn't receive the code? </Text>
            <Pressable onPress={handleResend} disabled={timer > 0 || isResending}>
              <Text
                style={[
                  styles.resendLink,
                  (timer > 0 || isResending) && styles.resendLinkDisabled,
                ]}
              >
                {isResending
                  ? "Sending…"
                  : timer > 0
                    ? `Resend in ${timer}s`
                    : "Resend Code"}
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
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    lineHeight: 20,
  },
  email: {
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  card: {
    backgroundColor: brand.white,
    borderRadius: 24,
    padding: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
    marginBottom: 16,
    textAlign: "center",
  },
  codeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: neutral.gray300,
    borderRadius: 12,
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
    textAlign: "center",
    backgroundColor: neutral.gray50,
  },
  codeInputFilled: {
    borderColor: brand.primary,
    backgroundColor: brand.white,
  },
  verifyButton: {
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  buttonGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: brand.white,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  resendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  resendText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
  },
  resendLink: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
  },
  resendLinkDisabled: {
    color: neutral.gray400,
  },
  errorMsg: {
    color: "#E74C3C",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
    marginBottom: 12,
  },
  infoMsg: {
    color: "#00B894",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
    marginBottom: 12,
  },
});
