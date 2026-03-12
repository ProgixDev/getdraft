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
import { useAppDispatch } from '@/store/hooks';
import { login } from '@/store/slices/authSlice';
import { EmailVerificationScreen } from './EmailVerificationScreen';
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

type AuthMode = 'login' | 'signup';
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

    const handleLocationSelected = (city: string, country: string) => {
        setLocation({ city, country });
        setSignupStep('profile');
    };

    const handleProfilePayment = () => {
        setSignupStep('payment');
    };

    const handlePaymentComplete = () => {
        setSignupStep('tutorial');
    };

    const handleTutorialComplete = () => {
        dispatch(login({
            user: {
                id: 'simulated-user-id',
                email: email,
                role: role,
            }
        }));
        onLogin?.();
    };

    const handleSubmit = () => {
        if (isLoading) return;

        // Basic validation
        if (!email) {
            Alert.alert('Error', 'Please enter your email address.');
            return;
        }

        if (mode === 'login' && !password) {
            Alert.alert('Error', 'Please enter your password.');
            return;
        }

        setIsLoading(true);

        if (mode === 'signup') {
            // Move to email verification step
            setTimeout(() => {
                setIsLoading(false);
                setSignupStep('verify');
            }, 1500);
        } else {
            // Login - check mock users first
            const mockUser = MOCK_USERS.find(
                (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
            );

            setTimeout(() => {
                setIsLoading(false);

                if (mockUser) {
                    dispatch(login({
                        user: {
                            id: mockUser.email,
                            email: mockUser.email,
                            role: mockUser.role,
                            name: mockUser.name,
                        }
                    }));
                    onLogin?.();
                } else {
                    // Fallback for any other login (e.g. from signup flow)
                    dispatch(login({
                        user: {
                            id: email,
                            email: email,
                            role: role,
                        }
                    }));
                    onLogin?.();
                }
            }, 800);
        }
    };

    if (!fontsLoaded) return null;

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

                            {/* Password Input (Login Only) */}
                            {mode === 'login' && (
                                <>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons
                                            name="lock-closed-outline"
                                            size={20}
                                            color={neutral.gray400}
                                            style={styles.inputIcon}
                                        />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Password"
                                            placeholderTextColor={neutral.gray400}
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={!isPasswordVisible}
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

                                    <Pressable style={styles.forgotPassword}>
                                        <Text style={styles.forgotPasswordText}>
                                            Forgot password?
                                        </Text>
                                    </Pressable>


                                </>
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
        paddingTop: 32,
        paddingBottom: 40,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Poppins_800ExtraBold',
        color: brand.primary,
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
        textAlign: 'center',
        marginBottom: 12,
        lineHeight: 20,
    },
    planInfo: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        color: brand.primary,
        textAlign: 'center',
        marginBottom: 24,
    },
    rolesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 28,
    },
    roleCard: {
        width: (width - 60) / 2,
        backgroundColor: neutral.gray50,
        borderRadius: 16,
        padding: 16,
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
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: brand.white,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    roleIconContainerActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    roleLabel: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        color: brand.primary,
        marginBottom: 4,
    },
    roleLabelActive: {
        color: brand.white,
    },
    roleDescription: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        color: neutral.gray600,
        textAlign: 'center',
        marginBottom: 8,
    },
    rolePrice: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
    },
    rolePriceActive: {
        color: brand.white,
    },
    formContainer: {
        gap: 14,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
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
        height: 54,
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 8,
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
