import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { brand, theme } from '@/config/colors';
import { RootState } from '@/store';
import { profilesService } from '@/services/profiles';

type AthleteForm = {
  sport: string;
  position: string;
  level: string;
  bio: string;
  class_year: string;
  gpa: string;
  height: string;
  weight: string;
  forty_yard_dash: string;
  awards: string;
};

type RecruiterForm = {
  organization: string;
  sport: string;
  role_type: 'agent' | 'coach';
  bio: string;
  tags: string;
};

type ParentForm = {
  relationship: string;
  child_class_year: string;
  bio: string;
};

const emptyAthlete: AthleteForm = {
  sport: '',
  position: '',
  level: '',
  bio: '',
  class_year: '',
  gpa: '',
  height: '',
  weight: '',
  forty_yard_dash: '',
  awards: '',
};

const emptyRecruiter: RecruiterForm = {
  organization: '',
  sport: '',
  role_type: 'agent',
  bio: '',
  tags: '',
};

const emptyParent: ParentForm = {
  relationship: '',
  child_class_year: '',
  bio: '',
};

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isAthlete = user?.role === 'athlete';
  const isRecruiterOrCoach = user?.role === 'recruiter' || user?.role === 'coach';
  const isParent = user?.role === 'parent';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [athlete, setAthlete] = useState<AthleteForm>(emptyAthlete);
  const [recruiter, setRecruiter] = useState<RecruiterForm>(emptyRecruiter);
  const [parent, setParent] = useState<ParentForm>(emptyParent);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (isAthlete) {
          const data = await profilesService.getAthleteProfile();
          if (!cancelled && data) {
            setAthlete({
              sport: data.sport ?? '',
              position: data.position ?? '',
              level: data.level ?? '',
              bio: data.bio ?? '',
              class_year: data.class_year ?? '',
              gpa: data.gpa != null ? String(data.gpa) : '',
              height: data.height ?? '',
              weight: data.weight ?? '',
              forty_yard_dash: data.forty_yard_dash ?? '',
              awards: Array.isArray(data.awards) ? data.awards.join(', ') : '',
            });
          }
        } else if (isRecruiterOrCoach) {
          const data = await profilesService.getRecruiterProfile();
          if (!cancelled && data) {
            setRecruiter({
              organization: data.organization ?? '',
              sport: data.sport ?? '',
              role_type: data.role_type === 'coach' ? 'coach' : 'agent',
              bio: data.bio ?? '',
              tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
            });
          }
        } else if (isParent) {
          const data = await profilesService.getParentProfile();
          if (!cancelled && data) {
            setParent({
              relationship: data.relationship ?? '',
              child_class_year: data.child_class_year ?? '',
              bio: data.bio ?? '',
            });
          }
        }
      } catch {
        // 404 = profile not yet created; keep empty form so user can fill it in
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (user) load();
    return () => {
      cancelled = true;
    };
  }, [user, isAthlete, isRecruiterOrCoach, isParent]);

  const splitList = (s: string) =>
    s.split(',').map((x) => x.trim()).filter(Boolean);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      if (isAthlete) {
        if (!athlete.sport.trim()) {
          throw new Error('Sport is required.');
        }
        const gpaNum = athlete.gpa.trim() ? Number(athlete.gpa) : undefined;
        if (gpaNum != null && (Number.isNaN(gpaNum) || gpaNum < 0 || gpaNum > 4)) {
          throw new Error('GPA must be a number between 0 and 4.');
        }
        await profilesService.upsertAthleteProfile({
          sport: athlete.sport.trim(),
          position: athlete.position.trim() || undefined,
          level: athlete.level.trim() || undefined,
          bio: athlete.bio.trim() || undefined,
          class_year: athlete.class_year.trim() || undefined,
          gpa: gpaNum,
          height: athlete.height.trim() || undefined,
          weight: athlete.weight.trim() || undefined,
          forty_yard_dash: athlete.forty_yard_dash.trim() || undefined,
          awards: splitList(athlete.awards),
        });
      } else if (isRecruiterOrCoach) {
        if (!recruiter.organization.trim() || !recruiter.sport.trim()) {
          throw new Error('Organization and sport are required.');
        }
        await profilesService.upsertRecruiterProfile({
          organization: recruiter.organization.trim(),
          sport: recruiter.sport.trim(),
          role_type: recruiter.role_type,
          bio: recruiter.bio.trim() || undefined,
          tags: splitList(recruiter.tags),
        });
      } else if (isParent) {
        if (!parent.relationship.trim()) {
          throw new Error('Relationship is required.');
        }
        await profilesService.upsertParentProfile({
          relationship: parent.relationship.trim(),
          child_class_year: parent.child_class_year.trim() || undefined,
          bio: parent.bio.trim() || undefined,
        });
      }
      router.back();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Failed to save profile.';
      Alert.alert('Save failed', String(message));
    } finally {
      setSaving(false);
    }
  }

  if (!fontsLoaded) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={brand.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isAthlete && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Athletic Info</Text>
              <Field label="Sport *" value={athlete.sport} onChange={(v) => setAthlete({ ...athlete, sport: v })} placeholder="e.g. American Football" />
              <Field label="Position" value={athlete.position} onChange={(v) => setAthlete({ ...athlete, position: v })} placeholder="e.g. Quarterback" />
              <Field label="Level" value={athlete.level} onChange={(v) => setAthlete({ ...athlete, level: v })} placeholder="e.g. NCAA Div I" />
              <Field label="Class Year" value={athlete.class_year} onChange={(v) => setAthlete({ ...athlete, class_year: v })} placeholder="e.g. 2025" keyboardType="number-pad" />
              <Field label="GPA" value={athlete.gpa} onChange={(v) => setAthlete({ ...athlete, gpa: v })} placeholder="0.0 — 4.0" keyboardType="decimal-pad" />
              <Field label="Height" value={athlete.height} onChange={(v) => setAthlete({ ...athlete, height: v })} placeholder={`e.g. 6'2"`} />
              <Field label="Weight" value={athlete.weight} onChange={(v) => setAthlete({ ...athlete, weight: v })} placeholder="e.g. 215 lbs" />
              <Field label="40-yard dash" value={athlete.forty_yard_dash} onChange={(v) => setAthlete({ ...athlete, forty_yard_dash: v })} placeholder="e.g. 4.65s" />
              <Field label="Bio" value={athlete.bio} onChange={(v) => setAthlete({ ...athlete, bio: v })} placeholder="Short bio" multiline />
              <Field label="Awards" value={athlete.awards} onChange={(v) => setAthlete({ ...athlete, awards: v })} placeholder="Comma-separated" multiline hint="Separate awards with commas" />
            </View>
          )}

          {isRecruiterOrCoach && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recruiter Info</Text>
              <Field label="Organization *" value={recruiter.organization} onChange={(v) => setRecruiter({ ...recruiter, organization: v })} placeholder="e.g. Elite Sports Agency" />
              <Field label="Sport *" value={recruiter.sport} onChange={(v) => setRecruiter({ ...recruiter, sport: v })} placeholder="e.g. American Football" />
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Role *</Text>
                <View style={styles.toggleRow}>
                  {(['agent', 'coach'] as const).map((opt) => (
                    <Pressable
                      key={opt}
                      style={[styles.toggle, recruiter.role_type === opt && styles.toggleActive]}
                      onPress={() => setRecruiter({ ...recruiter, role_type: opt })}
                    >
                      <Text style={[styles.toggleText, recruiter.role_type === opt && styles.toggleTextActive]}>
                        {opt === 'agent' ? 'Agent' : 'Coach'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Field label="Bio" value={recruiter.bio} onChange={(v) => setRecruiter({ ...recruiter, bio: v })} placeholder="Short bio" multiline />
              <Field label="Tags" value={recruiter.tags} onChange={(v) => setRecruiter({ ...recruiter, tags: v })} placeholder="Comma-separated" hint="e.g. NFL Certified, 10+ Years" />
            </View>
          )}

          {isParent && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Parent Info</Text>
              <Field label="Relationship *" value={parent.relationship} onChange={(v) => setParent({ ...parent, relationship: v })} placeholder="Mother / Father / Guardian" />
              <Field label="Child's Class Year" value={parent.child_class_year} onChange={(v) => setParent({ ...parent, child_class_year: v })} placeholder="e.g. 2025" keyboardType="number-pad" />
              <Field label="Bio" value={parent.bio} onChange={(v) => setParent({ ...parent, bio: v })} placeholder="Short bio" multiline />
            </View>
          )}

          <Text style={styles.footnote}>
            Photos and videos are managed from the profile screen.
          </Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  hint?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="sentences"
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  headerWrap: {
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 44,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
  },
  saveButton: {
    minWidth: 60,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  section: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: theme.text,
    marginBottom: 4,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
  },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    backgroundColor: theme.surface,
  },
  toggleActive: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: theme.textSecondary,
  },
  toggleTextActive: {
    color: brand.white,
  },
  footnote: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
