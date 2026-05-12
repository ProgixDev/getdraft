import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    ActivityIndicator,
    Alert,
    TextInput,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
    CameraView,
    useCameraPermissions,
    useMicrophonePermissions,
    type CameraView as CameraViewType,
} from 'expo-camera';
import {
    useFonts,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { brand, neutral, semantic } from '@/config/colors';
import {
    guardianLinksService,
    GuardianLink,
    GuardianRelationship,
} from '@/services/guardianLinks';

type Step = 'scan' | 'questions' | 'video-intro' | 'video-record' | 'submitted';

const RELATIONSHIPS: { id: GuardianRelationship; label: string }[] = [
    { id: 'parent', label: 'Parent' },
    { id: 'legal_guardian', label: 'Legal guardian' },
    { id: 'step_parent', label: 'Step-parent' },
    { id: 'sibling', label: 'Sibling' },
    { id: 'aunt_uncle', label: 'Aunt / Uncle' },
    { id: 'grandparent', label: 'Grandparent' },
    { id: 'other', label: 'Other' },
];

interface GuardianLinkScreenProps {
    /** Called when admin has been notified and the parent can move on. */
    onComplete: () => void;
    /** Back to the previous signup step (KYC). */
    onBack: () => void;
}

export const GuardianLinkScreen: React.FC<GuardianLinkScreenProps> = ({
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

    const [cameraPerm, requestCameraPerm] = useCameraPermissions();
    const [micPerm, requestMicPerm] = useMicrophonePermissions();

    const [step, setStep] = useState<Step>('scan');
    const [busy, setBusy] = useState(false);
    const [scannedToken, setScannedToken] = useState<string | null>(null);
    const [relationship, setRelationship] = useState<GuardianRelationship | null>(null);
    const [athleteFullName, setAthleteFullName] = useState('');
    const [livesWith, setLivesWith] = useState<string | null>(null);
    const [consent, setConsent] = useState(false);
    const [link, setLink] = useState<GuardianLink | null>(null);

    const cameraRef = useRef<CameraViewType | null>(null);
    const recordingRef = useRef(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedUri, setRecordedUri] = useState<string | null>(null);

    // Resume: if a parent reloads mid-flow, /guardian-links/me tells us
    // how far they got so we don't re-show the scan step.
    useEffect(() => {
        guardianLinksService.getMyLink()
            .then((existing) => {
                if (!existing) return;
                setLink(existing);
                setRelationship(existing.relationship);
                if (existing.status === 'pending_video') setStep('video-intro');
                else if (existing.status === 'pending_admin' || existing.status === 'approved') {
                    setStep('submitted');
                }
            })
            .catch(() => {});
    }, []);

    // ─── Step 1: QR scan ───────────────────────────────────────────────
    const handleBarcodeScanned = useCallback(({ data }: { data: string }) => {
        if (scannedToken || busy) return;
        setScannedToken(data);
        setStep('questions');
    }, [scannedToken, busy]);

    // ─── Step 2: questionnaire submit ──────────────────────────────────
    const handleSubmitQuestionnaire = useCallback(async () => {
        if (!scannedToken || !relationship || busy) return;
        if (!athleteFullName.trim()) {
            Alert.alert('Almost there', 'Please type the athlete\'s full name as you know it.');
            return;
        }
        if (!consent) {
            Alert.alert('Consent required', 'Please acknowledge the truthfulness statement to continue.');
            return;
        }
        setBusy(true);
        try {
            const row = await guardianLinksService.scan({
                qrToken: scannedToken,
                relationship,
                questionnaire: {
                    athleteFullName: athleteFullName.trim(),
                    livesWithAthlete: livesWith,
                    consentAcknowledged: true,
                    consentAt: new Date().toISOString(),
                },
            });
            setLink(row);
            setStep('video-intro');
        } catch (err: any) {
            const msg = err?.response?.data?.message ?? err?.message ?? 'Could not submit. Try again.';
            Alert.alert('Could not submit', String(msg));
        } finally {
            setBusy(false);
        }
    }, [scannedToken, relationship, athleteFullName, livesWith, consent, busy]);

    // ─── Step 3: video record + upload ─────────────────────────────────
    const ensureVideoPerms = useCallback(async () => {
        if (!cameraPerm?.granted) {
            const r = await requestCameraPerm();
            if (!r.granted) return false;
        }
        if (!micPerm?.granted) {
            const r = await requestMicPerm();
            if (!r.granted) return false;
        }
        return true;
    }, [cameraPerm, micPerm, requestCameraPerm, requestMicPerm]);

    const startRecording = useCallback(async () => {
        if (recordingRef.current) return;
        const ok = await ensureVideoPerms();
        if (!ok) {
            Alert.alert('Permissions needed', 'GetDraft needs camera + microphone access to record your declaration.');
            return;
        }
        recordingRef.current = true;
        setIsRecording(true);
        try {
            const result = await cameraRef.current?.recordAsync({ maxDuration: 20 });
            if (result?.uri) setRecordedUri(result.uri);
        } catch (err: any) {
            Alert.alert('Recording failed', err?.message ?? 'Unknown error.');
        } finally {
            recordingRef.current = false;
            setIsRecording(false);
        }
    }, [ensureVideoPerms]);

    const stopRecording = useCallback(() => {
        if (!recordingRef.current) return;
        cameraRef.current?.stopRecording();
    }, []);

    const uploadAndSubmit = useCallback(async () => {
        if (!link || !recordedUri || busy) return;
        setBusy(true);
        try {
            const fileName = `declaration-${Date.now()}.mp4`;
            const { signedUrl, path } = await guardianLinksService.getVideoUploadUrl({
                linkId: link.id,
                fileName,
            });

            // Read the recorded file as a blob and PUT it to the signed URL.
            // expo-camera's recordAsync returns a file:// URI, which fetch()
            // can read as a Blob on RN.
            const fileResp = await fetch(recordedUri);
            const blob = await fileResp.blob();
            const uploadResp = await fetch(signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'video/mp4' },
                body: blob,
            });
            if (!uploadResp.ok) {
                throw new Error(`Upload failed (${uploadResp.status}).`);
            }

            await guardianLinksService.submitVideo({ linkId: link.id, storagePath: path });
            setStep('submitted');
        } catch (err: any) {
            const msg = err?.response?.data?.message ?? err?.message ?? 'Could not upload video.';
            Alert.alert('Upload failed', String(msg));
        } finally {
            setBusy(false);
        }
    }, [link, recordedUri, busy]);

    if (!fontsLoaded) return null;

    return (
        <LinearGradient colors={[brand.primary, '#0a4d8f', brand.primary]} style={styles.container}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.topBar}>
                    {step === 'scan' || step === 'submitted' ? (
                        <Pressable style={styles.iconButton} onPress={onBack} disabled={busy}>
                            <Ionicons name="arrow-back" size={22} color={brand.white} />
                        </Pressable>
                    ) : (
                        <Pressable
                            style={styles.iconButton}
                            onPress={() => {
                                if (step === 'questions') setStep('scan');
                                else if (step === 'video-intro') setStep('questions');
                                else if (step === 'video-record') setStep('video-intro');
                            }}
                            disabled={busy}
                        >
                            <Ionicons name="arrow-back" size={22} color={brand.white} />
                        </Pressable>
                    )}
                    <View style={styles.iconButton} />
                </View>

                {step === 'scan' && (
                    <ScanStep
                        permission={cameraPerm?.granted ?? false}
                        onRequestPermission={async () => {
                            const r = await requestCameraPerm();
                            if (!r.granted) {
                                Alert.alert('Camera needed', 'We need camera access to scan the athlete\'s QR.');
                            }
                        }}
                        onScanned={handleBarcodeScanned}
                        cameraRef={cameraRef}
                    />
                )}

                {step === 'questions' && (
                    <QuestionsStep
                        relationship={relationship}
                        setRelationship={setRelationship}
                        athleteFullName={athleteFullName}
                        setAthleteFullName={setAthleteFullName}
                        livesWith={livesWith}
                        setLivesWith={setLivesWith}
                        consent={consent}
                        setConsent={setConsent}
                        busy={busy}
                        onSubmit={handleSubmitQuestionnaire}
                    />
                )}

                {step === 'video-intro' && (
                    <VideoIntroStep
                        relationship={relationship}
                        athleteFullName={athleteFullName || link?.athlete?.name || 'the athlete'}
                        onContinue={() => setStep('video-record')}
                    />
                )}

                {step === 'video-record' && (
                    <VideoRecordStep
                        cameraRef={cameraRef}
                        permission={(cameraPerm?.granted ?? false) && (micPerm?.granted ?? false)}
                        onRequestPermission={ensureVideoPerms}
                        isRecording={isRecording}
                        recordedUri={recordedUri}
                        onStart={startRecording}
                        onStop={stopRecording}
                        onRetake={() => setRecordedUri(null)}
                        onSubmit={uploadAndSubmit}
                        busy={busy}
                    />
                )}

                {step === 'submitted' && (
                    <SubmittedStep
                        status={link?.status ?? 'pending_admin'}
                        onContinue={onComplete}
                    />
                )}
            </ScrollView>
        </LinearGradient>
    );
};

// ─────────────────────────────────────────────────────────────────────
// Sub-components — each is a self-contained step rendering
// ─────────────────────────────────────────────────────────────────────

function ScanStep(props: {
    permission: boolean;
    onRequestPermission: () => Promise<void> | void;
    onScanned: (e: { data: string }) => void;
    cameraRef: React.MutableRefObject<CameraViewType | null>;
}) {
    return (
        <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.header}>
                <View style={styles.iconCircle}>
                    <Ionicons name="qr-code" size={36} color={brand.white} />
                </View>
                <Text style={styles.title}>Scan the athlete's QR</Text>
                <Text style={styles.subtitle}>
                    Ask your athlete to open Settings → Link a guardian and show you the code.
                </Text>
            </View>

            <View style={styles.scannerCard}>
                {props.permission ? (
                    <View style={styles.scannerFrame}>
                        <CameraView
                            ref={props.cameraRef}
                            style={StyleSheet.absoluteFill}
                            facing="back"
                            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                            onBarcodeScanned={props.onScanned}
                        />
                        <View pointerEvents="none" style={styles.scannerOverlay}>
                            <View style={[styles.scannerCorner, { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3 }]} />
                            <View style={[styles.scannerCorner, { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3 }]} />
                            <View style={[styles.scannerCorner, { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
                            <View style={[styles.scannerCorner, { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3 }]} />
                        </View>
                    </View>
                ) : (
                    <View style={styles.permPrompt}>
                        <Ionicons name="camera-outline" size={32} color={brand.primary} />
                        <Text style={styles.permTitle}>Camera access needed</Text>
                        <Text style={styles.permSubtitle}>So you can scan the athlete's QR.</Text>
                        <Pressable style={styles.permButton} onPress={props.onRequestPermission}>
                            <Text style={styles.permButtonText}>Allow camera</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

function QuestionsStep(props: {
    relationship: GuardianRelationship | null;
    setRelationship: (r: GuardianRelationship) => void;
    athleteFullName: string;
    setAthleteFullName: (s: string) => void;
    livesWith: string | null;
    setLivesWith: (s: string) => void;
    consent: boolean;
    setConsent: (b: boolean) => void;
    busy: boolean;
    onSubmit: () => void;
}) {
    const canContinue = !!props.relationship && !!props.athleteFullName.trim() && !!props.livesWith && props.consent;
    return (
        <Animated.View entering={FadeInDown.duration(400)}>
            <View style={styles.header}>
                <Text style={styles.title}>Tell us about your athlete</Text>
                <Text style={styles.subtitle}>
                    Quick relationship questions. Admin will review with the video next.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.questionPrompt}>What's your relationship?</Text>
                <View style={styles.optionsWrap}>
                    {RELATIONSHIPS.map((r) => {
                        const selected = props.relationship === r.id;
                        return (
                            <Pressable
                                key={r.id}
                                style={[styles.option, selected && styles.optionSelected]}
                                onPress={() => props.setRelationship(r.id)}
                                disabled={props.busy}
                            >
                                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                    {r.label}
                                </Text>
                                {selected && <Ionicons name="checkmark" size={16} color={brand.white} />}
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.questionPrompt}>Athlete's full name</Text>
                <TextInput
                    style={styles.textInput}
                    value={props.athleteFullName}
                    onChangeText={props.setAthleteFullName}
                    placeholder="e.g. Marcus Carter"
                    placeholderTextColor={neutral.gray400}
                    editable={!props.busy}
                />
                <Text style={styles.fieldHint}>
                    Must match what's on file — admin cross-checks this with the athlete's profile.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.questionPrompt}>Do you live with the athlete?</Text>
                <View style={styles.optionsWrap}>
                    {['Yes, same household', 'Sometimes / split custody', 'No, different household'].map((opt) => {
                        const selected = props.livesWith === opt;
                        return (
                            <Pressable
                                key={opt}
                                style={[styles.option, selected && styles.optionSelected]}
                                onPress={() => props.setLivesWith(opt)}
                                disabled={props.busy}
                            >
                                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{opt}</Text>
                                {selected && <Ionicons name="checkmark" size={16} color={brand.white} />}
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <Pressable
                style={[styles.consentRow, props.consent && styles.consentRowChecked]}
                onPress={() => props.setConsent(!props.consent)}
                disabled={props.busy}
            >
                <View style={[styles.checkbox, props.consent && styles.checkboxChecked]}>
                    {props.consent && <Ionicons name="checkmark" size={14} color={brand.white} />}
                </View>
                <Text style={styles.consentText}>
                    I confirm that the information above is true. I understand that making
                    false claims may result in my account being removed.
                </Text>
            </Pressable>

            <Pressable
                style={[styles.cta, (!canContinue || props.busy) && styles.ctaDisabled]}
                onPress={props.onSubmit}
                disabled={!canContinue || props.busy}
            >
                {props.busy ? (
                    <ActivityIndicator color={brand.primary} />
                ) : (
                    <>
                        <Text style={styles.ctaText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={18} color={brand.primary} />
                    </>
                )}
            </Pressable>
        </Animated.View>
    );
}

function VideoIntroStep(props: {
    relationship: GuardianRelationship | null;
    athleteFullName: string;
    onContinue: () => void;
}) {
    const rel = RELATIONSHIPS.find((r) => r.id === props.relationship)?.label.toLowerCase() ?? 'guardian';
    return (
        <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.header}>
                <View style={styles.iconCircle}>
                    <Ionicons name="videocam" size={36} color={brand.white} />
                </View>
                <Text style={styles.title}>Record a quick video</Text>
                <Text style={styles.subtitle}>
                    Helps us confirm you're really {props.athleteFullName}'s guardian.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.questionPrompt}>Here's what to say:</Text>
                <View style={styles.scriptBox}>
                    <Text style={styles.scriptText}>
                        "My name is <Text style={styles.scriptBold}>[your full name]</Text>.
                        I am the <Text style={styles.scriptBold}>{rel}</Text> of <Text style={styles.scriptBold}>{props.athleteFullName}</Text>.
                        I confirm that I am submitting this on the GetDraft platform on their behalf."
                    </Text>
                </View>
                <View style={styles.bulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={semantic.success} />
                    <Text style={styles.bulletText}>Hold the phone at eye level, look at the camera.</Text>
                </View>
                <View style={styles.bulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={semantic.success} />
                    <Text style={styles.bulletText}>Speak clearly. Quiet, well-lit space.</Text>
                </View>
                <View style={styles.bulletRow}>
                    <Ionicons name="checkmark-circle" size={16} color={semantic.success} />
                    <Text style={styles.bulletText}>Use your real name and the athlete's real name.</Text>
                </View>
            </View>

            <Pressable style={styles.cta} onPress={props.onContinue}>
                <Text style={styles.ctaText}>I'm ready — record now</Text>
                <Ionicons name="arrow-forward" size={18} color={brand.primary} />
            </Pressable>
        </Animated.View>
    );
}

function VideoRecordStep(props: {
    cameraRef: React.MutableRefObject<CameraViewType | null>;
    permission: boolean;
    onRequestPermission: () => Promise<boolean>;
    isRecording: boolean;
    recordedUri: string | null;
    onStart: () => void;
    onStop: () => void;
    onRetake: () => void;
    onSubmit: () => void;
    busy: boolean;
}) {
    return (
        <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.header}>
                <Text style={styles.title}>Record your declaration</Text>
                <Text style={styles.subtitle}>10–15 seconds is plenty.</Text>
            </View>

            <View style={styles.cameraCard}>
                {props.permission ? (
                    <View style={styles.cameraFrame}>
                        <CameraView
                            ref={props.cameraRef}
                            style={StyleSheet.absoluteFill}
                            facing="front"
                            mode="video"
                        />
                        {props.isRecording && (
                            <View style={styles.recIndicator}>
                                <View style={styles.recDot} />
                                <Text style={styles.recText}>REC</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={styles.permPrompt}>
                        <Ionicons name="videocam-outline" size={32} color={brand.primary} />
                        <Text style={styles.permTitle}>Camera + mic needed</Text>
                        <Pressable
                            style={styles.permButton}
                            onPress={async () => {
                                const ok = await props.onRequestPermission();
                                if (!ok) Alert.alert('Permissions needed', 'Please allow camera + microphone.');
                            }}
                        >
                            <Text style={styles.permButtonText}>Allow access</Text>
                        </Pressable>
                    </View>
                )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                {!props.recordedUri ? (
                    props.isRecording ? (
                        <Pressable
                            style={[styles.cta, { backgroundColor: '#E54B4B', flex: 1 }]}
                            onPress={props.onStop}
                        >
                            <Ionicons name="stop" size={18} color={brand.white} />
                            <Text style={[styles.ctaText, { color: brand.white }]}>Stop</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            style={[styles.cta, { flex: 1 }, !props.permission && styles.ctaDisabled]}
                            onPress={props.onStart}
                            disabled={!props.permission || props.busy}
                        >
                            <Ionicons name="radio-button-on" size={18} color={brand.primary} />
                            <Text style={styles.ctaText}>Start recording</Text>
                        </Pressable>
                    )
                ) : (
                    <>
                        <Pressable
                            style={[styles.cta, { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)' }]}
                            onPress={props.onRetake}
                            disabled={props.busy}
                        >
                            <Text style={[styles.ctaText, { color: brand.white }]}>Retake</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.cta, { flex: 1.4 }]}
                            onPress={props.onSubmit}
                            disabled={props.busy}
                        >
                            {props.busy ? (
                                <ActivityIndicator color={brand.primary} />
                            ) : (
                                <>
                                    <Text style={styles.ctaText}>Submit for review</Text>
                                    <Ionicons name="cloud-upload-outline" size={18} color={brand.primary} />
                                </>
                            )}
                        </Pressable>
                    </>
                )}
            </View>
        </Animated.View>
    );
}

function SubmittedStep(props: { status: string; onContinue: () => void }) {
    const approved = props.status === 'approved';
    return (
        <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.header}>
                <View style={[styles.iconCircle, { backgroundColor: approved ? 'rgba(0,184,148,0.25)' : 'rgba(255,255,255,0.16)' }]}>
                    <Ionicons
                        name={approved ? 'checkmark-circle' : 'hourglass'}
                        size={36}
                        color={approved ? semantic.successLight : brand.white}
                    />
                </View>
                <Text style={styles.title}>
                    {approved ? 'You\'re linked!' : 'Submitted for review'}
                </Text>
                <Text style={styles.subtitle}>
                    {approved
                        ? 'Admin has confirmed your link with the athlete.'
                        : "We've sent your submission to admin. We'll notify you when it's reviewed — usually within 24 hours."}
                </Text>
            </View>
            <Pressable style={styles.cta} onPress={props.onContinue}>
                <Text style={styles.ctaText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={brand.primary} />
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingTop: 48, paddingHorizontal: 22, paddingBottom: 32 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    iconButton: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    header: { alignItems: 'center', marginBottom: 18 },
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.16)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    title: {
        fontSize: 22, fontFamily: 'Poppins_800ExtraBold',
        color: brand.white, marginBottom: 4, textAlign: 'center',
    },
    subtitle: {
        fontSize: 13, fontFamily: 'Poppins_400Regular',
        color: 'rgba(255, 255, 255, 0.85)', textAlign: 'center',
        paddingHorizontal: 8,
    },
    card: { backgroundColor: brand.white, borderRadius: 16, padding: 16, marginBottom: 12 },
    questionPrompt: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: brand.primary, marginBottom: 10 },
    optionsWrap: { gap: 8 },
    option: {
        backgroundColor: neutral.gray50,
        borderWidth: 1, borderColor: neutral.gray200,
        borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    optionSelected: { backgroundColor: brand.primary, borderColor: brand.primary },
    optionText: { fontSize: 14, fontFamily: 'Poppins_500Medium', color: neutral.gray700 },
    optionTextSelected: { color: brand.white, fontFamily: 'Poppins_600SemiBold' },
    textInput: {
        backgroundColor: neutral.gray50,
        borderWidth: 1, borderColor: neutral.gray200, borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 12,
        fontSize: 14, fontFamily: 'Poppins_500Medium', color: neutral.gray700,
    },
    fieldHint: { marginTop: 6, fontSize: 11, fontFamily: 'Poppins_400Regular', color: neutral.gray500 },
    consentRow: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        alignItems: 'flex-start',
    },
    consentRowChecked: { backgroundColor: 'rgba(255,255,255,0.16)' },
    checkbox: {
        width: 20, height: 20, borderRadius: 5,
        borderWidth: 2, borderColor: brand.white,
        alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: brand.white, borderColor: brand.white },
    consentText: {
        flex: 1, fontSize: 12, fontFamily: 'Poppins_400Regular',
        color: brand.white, lineHeight: 17,
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
    ctaText: { fontSize: 15, fontFamily: 'Poppins_700Bold', color: brand.primary },
    scannerCard: {
        backgroundColor: brand.white,
        borderRadius: 18,
        padding: 12,
    },
    scannerFrame: {
        aspectRatio: 1,
        backgroundColor: '#000',
        borderRadius: 12,
        overflow: 'hidden',
    },
    scannerOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    scannerCorner: {
        position: 'absolute',
        width: 28,
        height: 28,
        borderColor: brand.white,
    },
    permPrompt: {
        backgroundColor: brand.white,
        borderRadius: 18,
        padding: 24,
        alignItems: 'center',
        gap: 6,
    },
    permTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: brand.primary, marginTop: 6 },
    permSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: neutral.gray600, textAlign: 'center' },
    permButton: {
        marginTop: 10,
        backgroundColor: brand.primary,
        paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    },
    permButtonText: { color: brand.white, fontFamily: 'Poppins_600SemiBold' },
    scriptBox: {
        backgroundColor: neutral.gray50,
        borderRadius: 10,
        padding: 12,
        borderLeftWidth: 3,
        borderLeftColor: brand.primary,
        marginBottom: 10,
    },
    scriptText: {
        fontSize: 13, fontFamily: 'Poppins_400Regular',
        color: neutral.gray700, lineHeight: 19,
    },
    scriptBold: { fontFamily: 'Poppins_700Bold', color: brand.primary },
    bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    bulletText: { fontSize: 12, fontFamily: 'Poppins_500Medium', color: neutral.gray700, flex: 1 },
    cameraCard: { backgroundColor: brand.white, borderRadius: 18, padding: 12 },
    cameraFrame: { aspectRatio: 9 / 16, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
    recIndicator: {
        position: 'absolute',
        top: 10, left: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 999,
        flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E54B4B' },
    recText: { color: brand.white, fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 1 },
});

export default GuardianLinkScreen;
