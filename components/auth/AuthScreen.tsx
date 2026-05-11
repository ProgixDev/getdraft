import React, { useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    Dimensions,
    Image,
    Text,
    KeyboardAvoidingView,
    Platform,
    TextInput,
    Pressable,
    ScrollView,
    LayoutAnimation,
    ActivityIndicator,
    Alert,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withDelay,
    withSpring,
    FadeIn,
    FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
    useFonts,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { images } from '@/config/assets';
import { brand, neutral } from '@/config/colors';
import { MOCK_USERS } from '@/constants/mockUsers';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { login, loginAsync, signupAsync, completeOnboarding, completeOnboardingAsync, clearError } from '@/store/slices/authSlice';
import { usersService } from '@/services/users';
import { EmailVerificationScreen } from './EmailVerificationScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { PlanSelectionScreen } from './PlanSelectionScreen';
import { LocationSelectionScreen } from './LocationSelectionScreen';
import { ProfileSetupScreen } from './ProfileSetupScreen';
import { PaymentScreen } from './PaymentScreen';
import { TutorialScreen } from './TutorialScreen';

const { width, height } = Dimensions.get('window');

interface AuthScreenProps {
    onLogin?: () => void;
    onSignup?: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot';
type SignupStep = 'role' | 'verify' | 'plan' | 'location' | 'profile' | 'payment' | 'tutorial';
type UserRole = 'athlete' | 'parent' | 'coach' | 'recruiter';

interface RoleOption {
    id: UserRole;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    price: string;
    description: string;
}

const roleOptions: RoleOption[] = [
    {
        id: 'athlete',
        label: 'Player',
        icon: 'trophy',
        price: 'Athlete',
        description: 'Showcase your talent',
    },
    {
        id: 'parent',
        label: 'Parent',
        icon: 'people',
        price: 'Guardian',
        description: 'Manage athlete journey',
    },
    {
        id: 'coach',
        label: 'Coach',
        icon: 'clipboard',
        price: 'Team Staff',
        description: 'Scout for talent',
    },
    {
        id: 'recruiter',
        label: 'Agent',
        icon: 'business',
        price: 'Professional',
        description: 'Discover athletes',
    },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
    const dispatch = useAppDispatch();

    // Fonts
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_600SemiBold,
        Poppins_700Bold,
        Poppins_800ExtraBold,
    });

    // State
    const [mode, setMode] = useState<AuthMode>('login');
    const [signupStep, setSignupStep] = useState<SignupStep>('role');
    const [role, setRole] = useState<UserRole>('athlete');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState('basic');
    const [location, setLocation] = useState({ city: '', country: '' });

    // Animation values
    const contentOpacity = useSharedValue(0);

    useEffect(() => {
        contentOpacity.value = withDelay(300, withTiming(1, { duration: 600 }));
    }, []);

    const animatedContentStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    const handleToggleMode = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMode(mode === 'login' ? 'signup' : 'login');
        setSignupStep('role');
        setEmail('');
        setPassword('');
    };

    const handleBackToRoleSelection = () => {
        setSignupStep('role');
    };

    const handleEmailVerified = () => {
        setSignupStep('plan');
    };

    const handlePlanSelected = (planId: string) => {
        setSelectedPlan(planId);
        setSignupStep('location');
    };

    const handleLocationSelected = async (city: string, country: string) => {
        setLocation({ city, country });
        // Persist to backend so the user's discover feed can geo-filter
        try {
            await usersService.updateMe({
                location: city ? `${city}${country ? `, ${country}` : ''}` : undefined,
                country: country || undefined,
            });
        } catch (err: any) {
            console.warn('[AuthScreen] updateMe(location) failed:', err?.response?.data || err?.message);
            // Non-blocking — user can update later from profile
        }
        setSignupStep('profile');
    };

    const handleProfilePayment = () => {
        setSignupStep('payment');
    };

    const handlePaymentComplete = () => {
        setSignupStep('tutorial');
    };

    const handleTutorialComplete = async () => {
        // Persist is_onboarded=true to backend (and update Redux + AsyncStorage)
        try {
            await dispatch(completeOnboardingAsync()).unwrap();
        } catch (err: any) {
            console.warn('[AuthScreen] completeOnboardingAsync failed:', err);
            // Fall back to local state-only update so the user isn't stuck
            dispatch(completeOnboarding());
        }
        onLogin?.();
    };

    const handleSubmit = async () => {
        if (isLoading) return;
        dispatch(clearError());

        // Basic validation
        if (!email) {
            Alert.alert('Error', 'Please enter your email address.');
            return;
        }

        if (!password) {
            Alert.alert('Error', 'Please enter your password.');
            return;
        }

        if (mode === 'signup' && password.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters.');
            return;
        }

        setIsLoading(true);

        if (mode === 'signup') {
            try {
                const result = await dispatch(
                    signupAsync({ email, password, role, name: email.split('@')[0] })
                ).unwrap();
                setIsLoading(false);

                // If accessToken is null, Supabase requires email confirmation
                if (!result.accessToken) {
                    Alert.alert(
                        'Verify Your Email',
                        `We sent a confirmation link to ${email}. Please click it, then sign in to continue.`,
                        [{ text: 'OK', onPress: () => setMode('login') }]
                    );
                    return;
                }

                // Account created and authenticated — skip OTP, go straight to plan selection
                setSignupStep('plan');
            } catch (err: any) {
                setIsLoading(false);
                Alert.alert('Sign-up failed', err?.toString?.() || 'Could not create your account. Please try again.');
            }
        } else {
            // Login
            try {
                const result = await dispatch(loginAsync({ email, password })).unwrap();
                setIsLoading(false);
                if (result.isOnboarded) {
                    onLogin?.();
                } else {
                    // Resume onboarding for an existing user that never finished
                    setMode('signup');
                    setSignupStep('plan');
                }
            } catch (err: any) {
                // Fallback to mock users only if backend is unreachable (network error, no response)
                const isNetworkError = !err?.response;
                if (isNetworkError) {
                    const mockUser = MOCK_USERS.find(
                        (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
                    );
                    setIsLoading(false);
                    if (mockUser) {
                        dispatch(login({
                            user: {
                                id: mockUser.email,
                                email: mockUser.email,
                                role: mockUser.role,
                                name: mockUser.name,
                            },
                            isOnboarded: true,
                        }));
                        onLogin?.();
                        return;
                    }
                }
                setIsLoading(false);
                Alert.alert('Sign-in failed', err?.toString?.() || 'Invalid email or password.');
            }
        }
    };

    if (!fontsLoaded) return null;

    // Forgot password flow
    if (mode === 'forgot') {
        return (
            <ForgotPasswordScreen
                initialEmail={email}
                onBack={() => setMode('login')}
            />
        );
    }

    // Render signup flow screens
    if (mode === 'signup' && signupStep !== 'role') {
        switch (signupStep) {
            case 'verify':
                return (
                    <EmailVerificationScreen
                        email={email}
                        onVerified={handleEmailVerified}
                        onBack={handleBackToRoleSelection}
                    />
                );
            case 'plan':
                return (
                    <PlanSelectionScreen
                        onPlanSelected={handlePlanSelected}
                        onBack={handleBackToRoleSelection}
                    />
                );
            case 'location':
                return (
                    <LocationSelectionScreen
                        onLocationSelected={handleLocationSelected}
                        onBack={() => setSignupStep('plan')}
                    />
                );
            case 'profile':
                return (
                    <ProfileSetupScreen
                        role={role}
                        onComplete={handleTutorialComplete}
                        onPayment={handleProfilePayment}
                        onBack={() => setSignupStep('location')}
                    />
                );
            case 'payment':
                return (
                    <PaymentScreen
                        selectedPlanId={selectedPlan}
                        onPaymentComplete={handlePaymentComplete}
                        onBack={() => setSignupStep('profile')}
                    />
                );
            case 'tutorial':
                return (
                    <TutorialScreen
                        onComplete={handleTutorialComplete}
                    />
                );
        }
    }

    // Render login or initial signup screen
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
                    {/* Header with Logo */}
                    <Animated.View
                        entering={FadeIn.duration(800)}
                        style={styles.header}
                    >
                        <Image
                            source={images.logoWhite}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.tagline}>
                            Where Talent Meets Opportunity
                        </Text>
                    </Animated.View>

                    {/* Main Content Card */}
                    <Animated.View
                        entering={FadeInDown.duration(800).delay(200)}
                        style={styles.card}
                    >
                        {/* Title */}
                        <Text style={styles.title}>
                            {mode === 'login' ? 'Welcome Back' : 'Choose Your Role'}
                        </Text>
                        <Text style={styles.subtitle}>
                            {mode === 'login'
                                ? 'Sign in to continue your journey'
                                : 'Select your role to get started'}
                        </Text>
                        {mode === 'signup' && (
                            <Text style={styles.planInfo}>
                                Plans start from $0/month • Choose after sign up
                            </Text>
                        )}

                        {/* Role Selector Grid (Signup Only) */}
                        {mode === 'signup' && (
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
                                        <View style={[
                                            styles.roleIconContainer,
                                            role === roleOption.id && styles.roleIconContainerActive,
                                        ]}>
                                            <Ionicons
                                                name={roleOption.icon}
                                                size={24}
                                                color={role === roleOption.id ? brand.white : brand.primary}
                                            />
                                        </View>
                                        <Text style={[
                                            styles.roleLabel,
                                            role === roleOption.id && styles.roleLabelActive,
                                        ]}>
                                            {roleOption.label}
                                        </Text>
                                        <Text style={styles.roleDescription}>
                                            {roleOption.description}
                                        </Text>
                                        <Text style={[
                                            styles.rolePrice,
                                            role === roleOption.id && styles.rolePriceActive,
                                        ]}>
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
                                    placeholder={mode === 'signup' ? 'Password (min. 6 characters)' : 'Password'}
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
                                        name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                                        size={20}
                                        color={neutral.gray400}
                                    />
                                </Pressable>
                            </View>

                            {mode === 'login' && (
                                <Pressable
                                    style={styles.forgotPassword}
                                    onPress={() => setMode('forgot')}
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
                                    colors={[brand.primary, '#0a4d8f']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.submitButtonGradient}
                                >
                                    {isLoading ? (
                                        <ActivityIndicator color={brand.white} />
                                    ) : (
                                        <Text style={styles.submitButtonText}>
                                            {mode === 'login' ? 'Sign In' : 'Continue to Plans'}
                                        </Text>
                                    )}
                                </LinearGradient>
                            </Pressable>
                        </View>

                        {/* Toggle Mode */}
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>
                                {mode === 'login'
                                    ? "Don't have an account? "
                                    : 'Already have an account? '}
                            </Text>
                            <Pressable onPress={handleToggleMode}>
                                <Text style={styles.footerLink}>
                                    {mode === 'login' ? 'Get Started' : 'Sign In'}
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
    scrollContainer: {
        flexGrow: 1,
    },
    header: {
        alignItems: 'center',
        paddingTop: 44,
        paddingBottom: 20,
    },
    logo: {
        width: 120,
        height: 32,
        marginBottom: 8,
    },
    tagline: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255, 255, 255, 0.9)',
        letterSpacing: 0.3,
    },
    card: {
        flex: 1,
        backgroundColor: brand.white,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 22,
        paddingBottom: 28,
    },
    title: {
        fontSize: 24,
        fontFamily: 'Poppins_800ExtraBold',
        color: brand.primary,
        marginBottom: 4,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
        textAlign: 'center',
        marginBottom: 6,
        lineHeight: 18,
    },
    planInfo: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        color: brand.primary,
        textAlign: 'center',
        marginBottom: 14,
    },
    rolesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 14,
    },
    roleCard: {
        width: (width - 58) / 2,
        backgroundColor: neutral.gray50,
        borderRadius: 14,
        padding: 12,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
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
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: brand.white,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    roleIconContainerActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    roleLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: brand.primary,
        marginBottom: 2,
    },
    roleLabelActive: {
        color: brand.white,
    },
    roleDescription: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
        textAlign: 'center',
        marginBottom: 4,
    },
    rolePrice: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
    },
    rolePriceActive: {
        color: brand.white,
    },
    formContainer: {
        gap: 10,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: neutral.gray50,
        borderRadius: 12,
        height: 48,
        paddingHorizontal: 16,
        borderWidth: 1.5,
        borderColor: neutral.gray200,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: '100%',
        fontSize: 15,
        color: brand.primary,
        fontFamily: 'Poppins_400Regular',
        paddingTop: 2,
    },
    eyeIcon: {
        padding: 8,
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginTop: -6,
    },
    forgotPasswordText: {
        color: brand.primary,
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    demoCard: {
        marginTop: 2,
        borderRadius: 12,
        padding: 12,
        backgroundColor: neutral.gray50,
        borderWidth: 1,
        borderColor: neutral.gray200,
    },
    demoTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        color: brand.primary,
        marginBottom: 4,
    },
    demoLine: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
        lineHeight: 18,
    },
    submitButton: {
        height: 50,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 6,
    },
    submitButtonGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: brand.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonText: {
        color: brand.white,
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.3,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
        alignItems: 'center',
    },
    footerText: {
        color: neutral.gray600,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    footerLink: {
        color: brand.primary,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
});
