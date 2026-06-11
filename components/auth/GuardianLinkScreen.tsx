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
    RefreshControl,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
    CameraView,
    useCameraPermissions,
    useMicrophonePermissions,
    type CameraView as CameraViewType,
} from 'expo-camera';
import { VideoView, useVideoPlayer } from 'expo-video';
import { videos } from '@/config/assets';
import { uploadsService } from '@/services/uploads';
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
import { usersService } from '@/services/users';

type Step =
    | 'scan'
    | 'questions'
    | 'video-explain'   // Text-only explainer — "here's what you're about to do"
    | 'video-example'   // Full-screen autoplay of the bundled example video
    | 'video-record'    // Camera fullscreen with telepromter at the bottom
    | 'submitted';

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
    const [resuming, setResuming] = useState(true);
    const [resumeError, setResumeError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
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
    const routeFromLink = useCallback((existing: GuardianLink) => {
        setLink(existing);
        setRelationship(existing.relationship);
        if (existing.status === 'pending_video') setStep('video-explain');
        else if (
            existing.status === 'pending_admin' ||
            existing.status === 'approved' ||
            existing.status === 'declined'
        ) {
            setStep('submitted');
        }
    }, []);

    const resume = useCallback(() => {
        setResuming(true);
        setResumeError(false);
        guardianLinksService.getMyLink()
            .then((existing) => {
                if (existing) routeFromLink(existing);
            })
            .catch(() => setResumeError(true))
            .finally(() => setResuming(false));
    }, [routeFromLink]);

    useEffect(() => { resume(); }, [resume]);

    // Pull-to-refresh on the status step — a parent waiting on admin
    // approval needs a way to re-check without killing the app.
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const existing = await guardianLinksService.getMyLink();
            if (existing) routeFromLink(existing);
        } catch {
            // keep showing the last known state
        } finally {
            setRefreshing(false);
        }
    }, [routeFromLink]);

    // Declined links: let the parent re-run the whole flow from scratch.
    const handleStartOver = useCallback(() => {
        setLink(null);
        setScannedToken(null);
        setRelationship(null);
        setAthleteFullName('');
        setLivesWith(null);
        setConsent(false);
        setRecordedUri(null);
        setStep('scan');
    }, []);

    // ─── Step 1: QR scan ───────────────────────────────────────────────
    const handleBarcodeScanned = useCallback(({ data }: { data: string }) => {
        if (scannedToken || busy) return;
        setScannedToken(data);
        setStep('questions');
    }, [scannedToken, busy]);

    /**
     * Dev-only escape hatch for the QR step. Pretends the scan +
     * questionnaire succeeded so testers in the simulator can still
     * walk through the video tutorial + recording UI without a real
     * athlete account on hand. No link row is created server-side —
     * the upload step short-circuits when it sees the dev-stub id.
     */
    const handleDevSkip = useCallback(() => {
        if (busy) return;
        setScannedToken('dev-stub');
        setRelationship('parent');
        setAthleteFullName('Demo Athlete');
        setLink({ id: 'dev-stub', relationship: 'parent', status: 'pending_video' } as GuardianLink);
        setStep('video-explain');
    }, [busy]);

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
            setStep('video-explain');
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
            // Dev-stub link from the QR-skip path — no real row exists
            // on the backend. Mark the flag so resume-on-reload doesn't
            // bounce the parent back here, and jump to the success state.
            if (link.id === 'dev-stub') {
                await usersService.updateMe({
                    preferences: { dev: { guardianSkipped: true, at: new Date().toISOString() } },
                });
                setStep('submitted');
                return;
            }

            // Derive the extension from the recorded file (Android tends to
            // produce .mp4, iOS .mov). Hardcoding .mp4 / video/mp4 on an
            // iOS .mov silently misnamed the object and broke the
            // content-type header on the signed PUT.
            const lower = recordedUri.toLowerCase();
            const ext = lower.endsWith('.mov')
                ? 'mov'
                : lower.endsWith('.m4v')
                  ? 'm4v'
                  : 'mp4';
            const contentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
            const fileName = `declaration-${Date.now()}.${ext}`;
            const { signedUrl, path } = await guardianLinksService.getVideoUploadUrl({
                linkId: link.id,
                fileName,
            });

            // Stream the file from disk via FileSystem.uploadAsync — the
            // previous fetch(file://) -> blob approach loaded the entire
            // 20s recording into JS memory (fragile on Android, especially
            // on low-RAM devices) and routinely failed silently.
            await uploadsService.uploadFromUri(signedUrl, recordedUri, contentType);

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

    // Hold a neutral loading shell until /guardian-links/me resolves —
    // otherwise the scan step flashes for returning parents before the
    // resume logic jumps them to their real step.
    if (resuming) {
        return (
            <LinearGradient
                colors={[brand.primary, '#0a4d8f', brand.primary]}
                style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}
            >
                <ActivityIndicator size="large" color={brand.white} />
            </LinearGradient>
        );
    }

    // If the status check itself failed we can't know where the parent
    // left off — never guess "scan" (that reads as "your submission is
    // gone"). Show the failure and let them retry.
    if (resumeError) {
        return (
            <LinearGradient
                colors={[brand.primary, '#0a4d8f', brand.primary]}
                style={[styles.container, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}
            >
                <View style={styles.iconCircle}>
                    <Ionicons name="cloud-offline-outline" size={32} color={brand.white} />
                </View>
                <Text style={styles.title}>Can't check your status</Text>
                <Text style={[styles.subtitle, { marginBottom: 20 }]}>
                    We couldn't reach GetDraft. Check your connection and try again.
                </Text>
                <Pressable
                    style={[styles.cta, { alignSelf: 'stretch' }]}
                    onPress={resume}
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                >
                    <Text style={styles.ctaText}>Try again</Text>
                    <Ionicons name="refresh" size={18} color={brand.primary} />
                </Pressable>
            </LinearGradient>
        );
    }

    // Fullscreen-only steps render outside the gradient/scroll shell so
    // the example player and camera fill the screen edge-to-edge.
    if (step === 'video-example') {
        return (
            <VideoExampleStep
                onContinue={() => setStep('video-record')}
                onBack={() => setStep('video-explain')}
            />
        );
    }
    if (step === 'video-record') {
        return (
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
                onBack={() => setStep('video-example')}
                busy={busy}
                relationship={relationship}
                athleteFullName={athleteFullName || link?.athlete?.name || 'the athlete'}
            />
        );
    }

    return (
        <LinearGradient colors={[brand.primary, '#0a4d8f', brand.primary]} style={styles.container}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    step === 'submitted' ? (
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={brand.white}
                            colors={[semantic.success]}
                            progressBackgroundColor={brand.white}
                        />
                    ) : undefined
                }
            >
                <View style={styles.topBar}>
                    {step === 'scan' || step === 'submitted' ? (
                        <Pressable
                            style={styles.iconButton}
                            onPress={onBack}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                        >
                            <Ionicons name="arrow-back" size={22} color={brand.white} />
                        </Pressable>
                    ) : (
                        <Pressable
                            style={styles.iconButton}
                            onPress={() => {
                                if (step === 'questions') setStep('scan');
                                else if (step === 'video-explain') setStep('questions');
                            }}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
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
                        onDevSkip={handleDevSkip}
                        busy={busy}
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

                {step === 'video-explain' && (
                    <VideoExplainStep
                        relationship={relationship}
                        athleteFullName={athleteFullName || link?.athlete?.name || 'the athlete'}
                        onContinue={() => setStep('video-example')}
                    />
                )}

                {step === 'submitted' && (
                    <SubmittedStep
                        status={link?.status ?? 'pending_admin'}
                        link={link}
                        onContinue={onComplete}
                        onStartOver={handleStartOver}
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
    onDevSkip?: () => void;
    busy?: boolean;
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

            {__DEV__ && props.onDevSkip && (
                <Pressable
                    style={styles.devSkipButton}
                    onPress={props.onDevSkip}
                    disabled={props.busy}
                >
                    <Ionicons name="bug-outline" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.devSkipText}>
                        {props.busy ? 'Skipping…' : 'Skip in dev (no link)'}
                    </Text>
                </Pressable>
            )}
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

/**
 * Step 1 of the video flow — a text-only explainer that primes the
 * parent for what's about to happen. Keeps them in the gradient shell
 * with a normal back button.
 */
function VideoExplainStep(props: {
    relationship: GuardianRelationship | null;
    athleteFullName: string;
    onContinue: () => void;
}) {
    return (
        <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.header}>
                <View style={styles.iconCircle}>
                    <Ionicons name="videocam" size={36} color={brand.white} />
                </View>
                <Text style={styles.title}>Record your declaration</Text>
                <Text style={styles.subtitle}>
                    Helps us confirm you're really {props.athleteFullName}'s guardian.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.questionPrompt}>What happens next</Text>
                <ExplainRow num="1" title="Watch a short example" body="See what a good submission looks like (about 8 seconds)." />
                <ExplainRow num="2" title="Read your line" body="Subtitles will appear on the recording screen — just read them out loud." />
                <ExplainRow num="3" title="Record yourself" body="Hold the phone at eye level. 10–15 seconds is enough." />
                <ExplainRow num="4" title="Submit for review" body="Admin checks it (usually within 24 hours) and approves your link." />
            </View>

            <Pressable style={styles.cta} onPress={props.onContinue}>
                <Text style={styles.ctaText}>Watch the example</Text>
                <Ionicons name="play" size={18} color={brand.primary} />
            </Pressable>
        </Animated.View>
    );
}

function ExplainRow({ num, title, body }: { num: string; title: string; body: string }) {
    return (
        <View style={styles.explainRow}>
            <View style={styles.explainNumber}>
                <Text style={styles.explainNumberText}>{num}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.explainTitle}>{title}</Text>
                <Text style={styles.explainBody}>{body}</Text>
            </View>
        </View>
    );
}

/**
 * Step 2 — fullscreen autoplay of the bundled example video. Black
 * background, no other UI except a small close (back) button and a
 * "Continue to record" pill anchored to the bottom.
 */
function VideoExampleStep(props: { onContinue: () => void; onBack: () => void }) {
    const insets = useSafeAreaInsets();
    const player = useVideoPlayer(videos.exampleParent, (p) => {
        p.loop = false;
        p.muted = false;
        p.play();
    });
    return (
        <View style={styles.fullscreenBlack}>
            <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
            />
            <Pressable
                style={[styles.fullscreenCloseAbsolute, { top: insets.top + 8 }]}
                onPress={props.onBack}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
            >
                <Ionicons name="close" size={22} color={brand.white} />
            </Pressable>
            <View
                pointerEvents="none"
                style={[styles.fullscreenBadgeAbsolute, { top: insets.top + 14 }]}
            >
                <Ionicons name="play-circle" size={14} color={brand.white} />
                <Text style={styles.fullscreenBadgeText}>EXAMPLE</Text>
            </View>
            <View style={[styles.fullscreenBottom, { paddingBottom: insets.bottom + 16 }]}>
                <Pressable style={styles.continuePill} onPress={props.onContinue}>
                    <Text style={styles.continuePillText}>I'm ready — record now</Text>
                    <Ionicons name="arrow-forward" size={18} color={brand.primary} />
                </Pressable>
            </View>
        </View>
    );
}

/**
 * Step 3 — fullscreen camera with a telepromter card at the bottom
 * showing exactly what to say. No header chrome, no scroll — pure
 * "you're on stage now" UI. Only chrome is a small close button at
 * the top-left.
 */
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
    onBack: () => void;
    busy: boolean;
    relationship: GuardianRelationship | null;
    athleteFullName: string;
}) {
    const insets = useSafeAreaInsets();
    const rel = RELATIONSHIPS.find((r) => r.id === props.relationship)?.label.toLowerCase() ?? 'guardian';
    return (
        <View style={styles.fullscreenBlack}>
            {props.permission ? (
                <CameraView
                    ref={props.cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="front"
                    mode="video"
                />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.permFullscreen]}>
                    <Ionicons name="videocam-outline" size={36} color={brand.white} />
                    <Text style={styles.permFullscreenTitle}>Camera + mic needed</Text>
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

            {/* Top chrome — close at top-left, REC pill at top-center */}
            <Pressable
                style={[styles.fullscreenCloseAbsolute, { top: insets.top + 8 }]}
                onPress={props.onBack}
                disabled={props.isRecording}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
            >
                <Ionicons name="close" size={22} color={brand.white} />
            </Pressable>
            {props.isRecording && (
                <View
                    pointerEvents="none"
                    style={[styles.recIndicatorAbsolute, { top: insets.top + 14 }]}
                >
                    <View style={styles.recDot} />
                    <Text style={styles.recText}>REC</Text>
                </View>
            )}

            {/* Telepromter at the bottom — what to say + record button */}
            <View style={[styles.recBottom, { paddingBottom: insets.bottom + 12 }]}>
                <View style={styles.telepromter}>
                    <Text style={styles.telepromterLabel}>Read this out loud</Text>
                    <Text style={styles.telepromterText}>
                        "My name is <Text style={styles.telepromterBold}>[your full name]</Text>.
                        {' '}I am the <Text style={styles.telepromterBold}>{rel}</Text> of{' '}
                        <Text style={styles.telepromterBold}>{props.athleteFullName}</Text>.
                        I confirm that I am submitting this on the GetDraft platform on their behalf."
                    </Text>
                </View>

                {!props.recordedUri ? (
                    props.isRecording ? (
                        <Pressable
                            style={styles.recordCircleStop}
                            onPress={props.onStop}
                            accessibilityRole="button"
                            accessibilityLabel="Stop recording"
                        >
                            <View style={styles.recordStopInner} />
                        </Pressable>
                    ) : (
                        <Pressable
                            style={[styles.recordCircle, !props.permission && { opacity: 0.5 }]}
                            onPress={props.onStart}
                            disabled={!props.permission || props.busy}
                            accessibilityRole="button"
                            accessibilityLabel="Start recording"
                        >
                            <View style={styles.recordInner} />
                        </Pressable>
                    )
                ) : (
                    <View style={styles.recordActionsRow}>
                        <Pressable
                            style={styles.retakeBtn}
                            onPress={props.onRetake}
                            disabled={props.busy}
                        >
                            <Ionicons name="refresh" size={18} color={brand.white} />
                            <Text style={styles.retakeBtnText}>Retake</Text>
                        </Pressable>
                        <Pressable
                            style={styles.submitBtn}
                            onPress={props.onSubmit}
                            disabled={props.busy}
                        >
                            {props.busy ? (
                                <ActivityIndicator color={brand.primary} />
                            ) : (
                                <>
                                    <Text style={styles.submitBtnText}>Submit</Text>
                                    <Ionicons name="cloud-upload-outline" size={18} color={brand.primary} />
                                </>
                            )}
                        </Pressable>
                    </View>
                )}
            </View>
        </View>
    );
}

function SubmittedStep(props: {
    status: string;
    link: GuardianLink | null;
    onContinue: () => void;
    onStartOver: () => void;
}) {
    const approved = props.status === 'approved';
    const athleteName = props.link?.athlete?.name ?? 'your athlete';
    const relationshipLabel =
        RELATIONSHIPS.find((r) => r.id === props.link?.relationship)?.label ?? 'Guardian';

    if (props.status === 'declined') {
        return (
            <Animated.View entering={FadeIn.duration(400)}>
                <View style={styles.header}>
                    <View style={[styles.iconCircle, { backgroundColor: 'rgba(231,76,60,0.22)' }]}>
                        <Ionicons name="close-circle" size={36} color={semantic.errorLight} />
                    </View>
                    <Text style={styles.title}>Link declined</Text>
                    <Text style={styles.subtitle}>
                        Admin couldn't verify your link with {athleteName}. Review the
                        note below, then start a fresh submission.
                    </Text>
                </View>
                {!!props.link?.admin_notes && (
                    <View style={styles.unlockCard}>
                        <Text style={styles.unlockOverline}>NOTE FROM ADMIN</Text>
                        <Text style={styles.adminNoteText}>{props.link.admin_notes}</Text>
                    </View>
                )}
                <Pressable
                    style={styles.cta}
                    onPress={props.onStartOver}
                    accessibilityRole="button"
                    accessibilityLabel="Start over"
                >
                    <Text style={styles.ctaText}>Start over</Text>
                    <Ionicons name="refresh" size={18} color={brand.primary} />
                </Pressable>
            </Animated.View>
        );
    }

    if (!approved) {
        return (
            <Animated.View entering={FadeIn.duration(400)}>
                <View style={styles.header}>
                    <View style={styles.iconCircle}>
                        <Ionicons name="hourglass" size={36} color={brand.white} />
                    </View>
                    <Text style={styles.title}>Submitted for review</Text>
                    <Text style={styles.subtitle}>
                        We've sent your submission to admin. We'll notify you when it's
                        reviewed — usually within 24 hours.
                    </Text>
                    <View style={styles.refreshHint}>
                        <Ionicons name="arrow-down" size={12} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.refreshHintText}>Pull down to check again</Text>
                    </View>
                </View>
                <Pressable style={styles.cta} onPress={props.onContinue}>
                    <Text style={styles.ctaText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color={brand.primary} />
                </Pressable>
            </Animated.View>
        );
    }

    const approvedDate = props.link?.decided_at
        ? new Date(props.link.decided_at).toLocaleDateString(undefined, {
              year: 'numeric', month: 'long', day: 'numeric',
          })
        : null;
    const initials = athleteName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('') || 'A';

    return (
        <View>
            {/* Verification seal — concentric rings, springs in first */}
            <View style={styles.header}>
                <Animated.View entering={ZoomIn.duration(500).springify()} style={styles.sealOuter}>
                    <View style={styles.sealInner}>
                        <Ionicons name="checkmark" size={38} color={semantic.successLight} />
                    </View>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.verifiedPill}>
                    <Ionicons name="shield-checkmark" size={12} color={semantic.successLight} />
                    <Text style={styles.verifiedPillText}>VERIFIED GUARDIAN</Text>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(200).duration(400)}>
                    <Text style={styles.title}>You're linked!</Text>
                    <Text style={styles.subtitle}>
                        Admin has confirmed you as {athleteName}'s {relationshipLabel.toLowerCase()}.
                    </Text>
                </Animated.View>
            </View>

            {/* Credential card — dark glass, reads like an ID badge */}
            <Animated.View entering={FadeInDown.delay(320).duration(450)} style={styles.credCard}>
                <View style={styles.credIdentityRow}>
                    <View style={styles.credAvatar}>
                        <Text style={styles.credAvatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.credOverline}>ATHLETE</Text>
                        <Text style={styles.credName} numberOfLines={1}>{athleteName}</Text>
                    </View>
                    <Ionicons name="shield-checkmark" size={22} color={semantic.successLight} />
                </View>
                <View style={styles.credDivider} />
                <View style={styles.credMetaRow}>
                    <Text style={styles.credMetaLabel}>Relationship</Text>
                    <Text style={styles.credMetaValue}>{relationshipLabel}</Text>
                </View>
                {approvedDate && (
                    <View style={styles.credMetaRow}>
                        <Text style={styles.credMetaLabel}>Approved on</Text>
                        <Text style={styles.credMetaValue}>{approvedDate}</Text>
                    </View>
                )}
            </Animated.View>

            {/* What this unlocks */}
            <Animated.View entering={FadeInDown.delay(440).duration(450)} style={styles.unlockCard}>
                <Text style={styles.unlockOverline}>WHAT'S UNLOCKED</Text>
                <UnlockRow
                    icon="trophy-outline"
                    title="Follow the journey"
                    body={`Track ${athleteName}'s recruiting activity from your Draft Board.`}
                />
                <UnlockRow
                    icon="eye-outline"
                    title="See who's scouting"
                    body={`Know which coaches and recruiters draft ${athleteName}.`}
                />
                <UnlockRow
                    icon="chatbubbles-outline"
                    title="Talk to recruiters"
                    body="Message coaches and recruiters directly from the app."
                />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(560).duration(450)}>
                <Pressable style={styles.cta} onPress={props.onContinue}>
                    <Text style={styles.ctaText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color={brand.primary} />
                </Pressable>
            </Animated.View>
        </View>
    );
}

function UnlockRow({ icon, title, body }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    body: string;
}) {
    return (
        <View style={styles.unlockRow}>
            <View style={styles.unlockIconCircle}>
                <Ionicons name={icon} size={16} color={semantic.successLight} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.unlockTitle}>{title}</Text>
                <Text style={styles.unlockBody}>{body}</Text>
            </View>
        </View>
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
    exampleVideoFrame: {
        aspectRatio: 9 / 16,
        maxHeight: 320,
        backgroundColor: '#000',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 4,
        alignSelf: 'stretch',
    },
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
    devSkipButton: {
        marginTop: 14,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.4)',
    },
    devSkipText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: 'rgba(255,255,255,0.7)' },

    // ── Approved state — verification seal ─────────────────────────
    sealOuter: {
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: 'rgba(0,184,148,0.14)',
        borderWidth: 1, borderColor: 'rgba(85,239,196,0.35)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
    },
    sealInner: {
        width: 66, height: 66, borderRadius: 33,
        backgroundColor: 'rgba(0,184,148,0.28)',
        alignItems: 'center', justifyContent: 'center',
    },
    verifiedPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(0,184,148,0.16)',
        borderWidth: 1, borderColor: 'rgba(85,239,196,0.4)',
        paddingHorizontal: 12, paddingVertical: 5,
        borderRadius: 999, marginBottom: 12,
    },
    verifiedPillText: {
        fontSize: 10, fontFamily: 'Poppins_700Bold',
        color: semantic.successLight, letterSpacing: 1.5,
    },

    // ── Approved state — credential card ───────────────────────────
    credCard: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
        borderRadius: 18, padding: 16, marginBottom: 12,
    },
    credIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    credAvatar: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: 'rgba(0,184,148,0.2)',
        borderWidth: 1.5, borderColor: semantic.successLight,
        alignItems: 'center', justifyContent: 'center',
    },
    credAvatarText: {
        fontSize: 18, fontFamily: 'Poppins_800ExtraBold', color: brand.white,
    },
    credOverline: {
        fontSize: 9, fontFamily: 'Poppins_700Bold',
        color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 1,
    },
    credName: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: brand.white },
    credDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255,255,255,0.16)',
        marginVertical: 12,
    },
    credMetaRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingVertical: 4,
    },
    credMetaLabel: {
        fontSize: 12, fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.55)',
    },
    credMetaValue: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: brand.white },

    // ── Approved state — unlock card ───────────────────────────────
    unlockCard: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
        borderRadius: 18, padding: 16, marginBottom: 12,
    },
    unlockOverline: {
        fontSize: 10, fontFamily: 'Poppins_700Bold',
        color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 4,
    },
    unlockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12 },
    unlockIconCircle: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(0,184,148,0.16)',
        alignItems: 'center', justifyContent: 'center',
    },
    unlockTitle: {
        fontSize: 13.5, fontFamily: 'Poppins_700Bold',
        color: brand.white, marginBottom: 1,
    },
    unlockBody: {
        fontSize: 12, fontFamily: 'Poppins_400Regular',
        color: 'rgba(255,255,255,0.65)', lineHeight: 17,
    },
    adminNoteText: {
        fontSize: 13, fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.85)', lineHeight: 19, marginTop: 4,
    },
    refreshHint: {
        flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12,
    },
    refreshHintText: {
        fontSize: 11, fontFamily: 'Poppins_500Medium',
        color: 'rgba(255,255,255,0.6)',
    },

    // ── Step 1 explainer rows ──────────────────────────────────────
    explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 12 },
    explainNumber: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: brand.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    explainNumberText: { color: brand.white, fontSize: 13, fontFamily: 'Poppins_700Bold' },
    explainTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: brand.primary, marginBottom: 2 },
    explainBody: { fontSize: 12, fontFamily: 'Poppins_400Regular', color: neutral.gray700, lineHeight: 17 },

    // ── Fullscreen shells (example player + record) ────────────────
    fullscreenBlack: { flex: 1, backgroundColor: '#000' },
    fullscreenTopBar: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        zIndex: 10,
    },
    fullscreenIcon: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },
    fullscreenCloseAbsolute: {
        position: 'absolute',
        left: 16,
        zIndex: 20,
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },
    fullscreenBadgeAbsolute: {
        position: 'absolute',
        left: '50%',
        transform: [{ translateX: -50 }],
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 999,
        zIndex: 19,
    },
    recIndicatorAbsolute: {
        position: 'absolute',
        left: '50%',
        transform: [{ translateX: -35 }],
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 999,
        zIndex: 19,
    },
    fullscreenBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 999,
    },
    fullscreenBadgeText: {
        color: brand.white,
        fontFamily: 'Poppins_700Bold',
        fontSize: 10,
        letterSpacing: 1,
    },
    fullscreenBottom: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        paddingHorizontal: 22,
        zIndex: 10,
    },
    continuePill: {
        height: 52,
        borderRadius: 999,
        backgroundColor: brand.white,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    continuePillText: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        color: brand.primary,
    },

    // ── Record screen ──────────────────────────────────────────────
    permFullscreen: {
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 32,
    },
    permFullscreenTitle: {
        color: brand.white,
        fontFamily: 'Poppins_700Bold',
        fontSize: 16,
    },
    recIndicatorFloating: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    recBottom: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        paddingHorizontal: 18,
        gap: 14,
        alignItems: 'center',
    },
    telepromter: {
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        width: '100%',
    },
    telepromterLabel: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    telepromterText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: brand.white,
        lineHeight: 20,
    },
    telepromterBold: {
        fontFamily: 'Poppins_700Bold',
        color: '#FFD966',
    },
    recordCircle: {
        width: 76, height: 76, borderRadius: 38,
        backgroundColor: 'transparent',
        borderWidth: 4,
        borderColor: brand.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordInner: {
        width: 58, height: 58, borderRadius: 29,
        backgroundColor: '#E54B4B',
    },
    recordCircleStop: {
        width: 76, height: 76, borderRadius: 38,
        borderWidth: 4,
        borderColor: brand.white,
        backgroundColor: 'transparent',
        alignItems: 'center', justifyContent: 'center',
    },
    recordStopInner: {
        width: 26, height: 26, borderRadius: 4,
        backgroundColor: '#E54B4B',
    },
    recordActionsRow: { flexDirection: 'row', gap: 10, width: '100%' },
    retakeBtn: {
        flex: 1, height: 50, borderRadius: 25,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    retakeBtnText: {
        color: brand.white, fontSize: 14, fontFamily: 'Poppins_600SemiBold',
    },
    submitBtn: {
        flex: 1.4, height: 50, borderRadius: 25,
        backgroundColor: brand.white,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    submitBtnText: {
        color: brand.primary, fontSize: 14, fontFamily: 'Poppins_700Bold',
    },
});

export default GuardianLinkScreen;
