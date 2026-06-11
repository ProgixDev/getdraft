import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    ActivityIndicator,
    Alert,
    TextInput,
    KeyboardAvoidingView,
    Platform,
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
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { brand, neutral } from '@/config/colors';
import { usersService } from '@/services/users';

type Role = 'athlete' | 'parent' | 'coach' | 'recruiter';

interface OnboardingQuestionsScreenProps {
    role: Role;
    onComplete: () => void;
    onBack: () => void;
}

interface QuestionDef {
    id: string;
    prompt: string;
    type: 'choice' | 'multi' | 'text';
    options?: string[];
    placeholder?: string;
}

/**
 * 4 questions per role — answers feed the matching algorithm. Keep
 * the shapes consistent (string for single-choice/text, string[] for
 * multi) so the backend doesn't need per-role parsing.
 */
const QUESTIONS_BY_ROLE: Record<Role, QuestionDef[]> = {
    athlete: [
        {
            id: 'sport',
            prompt: 'What\'s your primary sport?',
            type: 'choice',
            options: ['Football', 'Basketball', 'Soccer', 'Baseball', 'Hockey', 'Track', 'Other'],
        },
        {
            id: 'goal',
            prompt: 'What are you looking for?',
            type: 'choice',
            options: ['D1 scholarship', 'D2 / D3 program', 'Pro pathway', 'Just exposure'],
        },
        {
            id: 'class_year',
            prompt: 'When do you graduate?',
            type: 'choice',
            options: ['2026', '2027', '2028', '2029', 'Later'],
        },
        {
            id: 'travel',
            prompt: 'How far would you go for the right opportunity?',
            type: 'choice',
            options: ['Local', 'In-state', 'Nationwide', 'Anywhere'],
        },
    ],
    parent: [
        {
            id: 'sport',
            prompt: "What's your athlete's primary sport?",
            type: 'choice',
            options: ['Football', 'Basketball', 'Soccer', 'Baseball', 'Hockey', 'Track', 'Other'],
        },
        {
            id: 'goal',
            prompt: 'What opportunities are you seeking?',
            type: 'choice',
            options: ['College scholarship', 'Club / showcase exposure', 'Pro pathway', 'Exploring options'],
        },
        {
            id: 'class_year',
            prompt: 'When does your athlete graduate?',
            type: 'choice',
            options: ['2026', '2027', '2028', '2029', 'Later'],
        },
        {
            id: 'budget',
            prompt: 'How important is scholarship/financial aid?',
            type: 'choice',
            options: ['Critical', 'Important', 'Helpful but not required', 'Not a factor'],
        },
    ],
    coach: [
        {
            id: 'sport',
            prompt: 'What sport do you coach?',
            type: 'choice',
            options: ['Football', 'Basketball', 'Soccer', 'Baseball', 'Hockey', 'Track', 'Other'],
        },
        {
            id: 'level',
            prompt: 'At what level?',
            type: 'choice',
            options: ['High school', 'Club / travel', 'College D1', 'College D2/D3', 'Pro'],
        },
        {
            id: 'recruiting_for',
            prompt: 'What positions are you recruiting for? (comma-separated)',
            type: 'text',
            placeholder: 'e.g. QB, WR, RB',
        },
        {
            id: 'urgency',
            prompt: 'How urgently are you recruiting?',
            type: 'choice',
            options: ['Open class right now', 'Next year', 'Always scouting'],
        },
    ],
    recruiter: [
        {
            id: 'sport',
            prompt: 'What sport do you scout?',
            type: 'choice',
            options: ['Football', 'Basketball', 'Soccer', 'Baseball', 'Hockey', 'Track', 'Other'],
        },
        {
            id: 'tier',
            prompt: 'What tier do you focus on?',
            type: 'choice',
            options: ['D1', 'D2', 'D3', 'JUCO', 'Pro / agency'],
        },
        {
            id: 'region',
            prompt: 'Which region(s) do you cover?',
            type: 'text',
            placeholder: 'e.g. Southeast, Texas, National',
        },
        {
            id: 'volume',
            prompt: 'How many athletes do you actively track?',
            type: 'choice',
            options: ['< 25', '25–100', '100–500', '500+'],
        },
    ],
};

export const OnboardingQuestionsScreen: React.FC<OnboardingQuestionsScreenProps> = ({
    role,
    onComplete,
    onBack,
}) => {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_600SemiBold,
        Poppins_700Bold,
        Poppins_800ExtraBold,
    });

    const questions = useMemo(() => QUESTIONS_BY_ROLE[role] ?? [], [role]);

    // Single-answer or text answers keyed by question id.
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);

    const allAnswered = questions.every((q) => {
        const v = answers[q.id];
        return typeof v === 'string' && v.trim().length > 0;
    });

    const handleContinue = async () => {
        if (isSaving) return;
        if (!allAnswered) {
            Alert.alert('Almost done', 'Please answer every question to continue.');
            return;
        }
        setIsSaving(true);
        try {
            // Store under preferences.onboarding so the matching service
            // has a stable key and other settings keep their namespace.
            await usersService.updateMe({
                preferences: {
                    onboarding: {
                        role,
                        answeredAt: new Date().toISOString(),
                        ...answers,
                    },
                },
            });
            onComplete();
        } catch (err: any) {
            const msg = err?.response?.data?.message ?? err?.message ?? 'Could not save your answers.';
            Alert.alert('Could not save', String(msg));
        } finally {
            setIsSaving(false);
        }
    };

    if (!fontsLoaded) return null;

    return (
        <LinearGradient
            colors={[brand.primary, '#0a4d8f', brand.primary]}
            style={styles.container}
        >
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.topBar}>
                    <Pressable onPress={onBack} style={styles.iconButton} disabled={isSaving}>
                        <Ionicons name="arrow-back" size={22} color={brand.white} />
                    </Pressable>
                    <View style={styles.iconButton} />
                </View>

                <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
                    <Text style={styles.title}>A few quick questions</Text>
                    <Text style={styles.subtitle}>
                        Helps us match you with the right people.
                    </Text>
                </Animated.View>

                {questions.map((q, idx) => (
                    <Animated.View
                        key={q.id}
                        entering={FadeInDown.duration(500).delay(100 * idx)}
                        style={styles.card}
                    >
                        <Text style={styles.questionNumber}>Question {idx + 1} of {questions.length}</Text>
                        <Text style={styles.questionPrompt}>{q.prompt}</Text>

                        {q.type === 'text' ? (
                            <TextInput
                                style={styles.textInput}
                                value={answers[q.id] ?? ''}
                                onChangeText={(t) => setAnswers((p) => ({ ...p, [q.id]: t }))}
                                placeholder={q.placeholder}
                                placeholderTextColor={neutral.gray400}
                                editable={!isSaving}
                            />
                        ) : (
                            <View style={styles.optionsWrap}>
                                {q.options?.map((opt) => {
                                    const selected = answers[q.id] === opt;
                                    return (
                                        <Pressable
                                            key={opt}
                                            style={[styles.option, selected && styles.optionSelected]}
                                            onPress={() => setAnswers((p) => ({ ...p, [q.id]: opt }))}
                                            disabled={isSaving}
                                        >
                                            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                                {opt}
                                            </Text>
                                            {selected && (
                                                <Ionicons name="checkmark" size={16} color={brand.white} />
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        )}
                    </Animated.View>
                ))}

                <Pressable
                    style={[styles.cta, (!allAnswered || isSaving) && styles.ctaDisabled]}
                    onPress={handleContinue}
                    disabled={!allAnswered || isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator color={brand.primary} />
                    ) : (
                        <>
                            <Text style={styles.ctaText}>Continue</Text>
                            <Ionicons name="arrow-forward" size={18} color={brand.primary} />
                        </>
                    )}
                </Pressable>
            </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingTop: 48, paddingHorizontal: 22, paddingBottom: 32 },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    header: { alignItems: 'center', marginBottom: 18 },
    title: {
        fontSize: 24,
        fontFamily: 'Poppins_800ExtraBold',
        color: brand.white,
        marginBottom: 4,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: 'rgba(255, 255, 255, 0.85)',
        textAlign: 'center',
    },
    card: {
        backgroundColor: brand.white,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    questionNumber: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: neutral.gray500,
        letterSpacing: 1,
        marginBottom: 4,
    },
    questionPrompt: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
        marginBottom: 12,
    },
    optionsWrap: { gap: 8 },
    option: {
        backgroundColor: neutral.gray50,
        borderWidth: 1,
        borderColor: neutral.gray200,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    optionSelected: {
        backgroundColor: brand.primary,
        borderColor: brand.primary,
    },
    optionText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: neutral.gray700,
    },
    optionTextSelected: {
        color: brand.white,
        fontFamily: 'Poppins_600SemiBold',
    },
    textInput: {
        backgroundColor: neutral.gray50,
        borderWidth: 1,
        borderColor: neutral.gray200,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: neutral.gray700,
    },
    cta: {
        marginTop: 6,
        height: 50,
        borderRadius: 999,
        backgroundColor: brand.white,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    ctaDisabled: { opacity: 0.5 },
    ctaText: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
    },
});

export default OnboardingQuestionsScreen;
