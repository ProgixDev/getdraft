import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { brand, theme } from "@/config/colors";
import { SPORTS_WITH_POSITIONS } from "@/constants/sportsData";
import { RootState } from "@/store";
import { login as setLoggedInUser } from "@/store/slices/authSlice";
import { profilesService } from "@/services/profiles";
import { usersService } from "@/services/users";
import { uploadsService, UploadBucket } from "@/services/uploads";
import { pickAndUploadMedia } from "@/services/media";
import LocationPicker from "@/components/LocationPicker";

const AVATAR_BUCKET = "avatars";

const GENDER_OPTIONS = ["Man", "Woman"];

type SelectorKey = "sport" | "position" | "level" | "gender" | null;

type Role = "athlete" | "recruiter" | "coach" | "parent" | undefined;

interface PickerOption {
  label: string;
  value: string;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._\-]/g, "_");
}

function extFromMime(mime: string | undefined) {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDobForDisplay(d: Date | null): string {
  if (!d) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}/${d.getFullYear()}`;
}

// Lifted from profile.tsx — needed for the swipe-card photo/video manager
// that now lives here. Discover.service reads the same photos[]/videos[]
// arrays back, so as long as we write the same shape, the swipe deck
// keeps rendering the right media.
function pathFromPublicUrl(url: string, bucket: UploadBucket): string | null {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return null;
  }
}

// Whitelist of fields we round-trip back through the upsert when only one
// field changes — keeps unrelated columns intact (the upsert is a PUT, not
// a PATCH). Identical lists to the ones profile.tsx used to maintain.
const ATHLETE_DTO_FIELDS = [
  "sport",
  "position",
  "level",
  "bio",
  "class_year",
  "gpa",
  "height",
  "weight",
  "forty_yard_dash",
  "awards",
  "photos",
  "videos",
] as const;

const RECRUITER_DTO_FIELDS = [
  "organization",
  "sport",
  "role_type",
  "tags",
  "bio",
  "photos",
  "videos",
] as const;

function pickFields<T extends string>(
  src: any,
  keys: readonly T[],
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) {
    const v = src?.[k];
    if (v != null) out[k] = v;
  }
  return out;
}

const MAX_GALLERY_PHOTOS = 6;
const MAX_HIGHLIGHT_VIDEOS = 1;

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const isOnboarded = useSelector((state: RootState) => state.auth.isOnboarded);

  const role = authUser?.role as Role;
  const isAthlete = role === "athlete";
  const isRecruiter = role === "recruiter" || role === "coach";
  const isParent = role === "parent";

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [bio, setBio] = useState("");
  const [sport, setSport] = useState("");
  const [organization, setOrganization] = useState("");
  const [position, setPosition] = useState("");
  const [level, setLevel] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState<Date | null>(null);
  const [dobModalVisible, setDobModalVisible] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploadedUrl, setAvatarUploadedUrl] = useState<string | null>(
    null,
  );
  const [existingProfile, setExistingProfile] = useState<any | null>(null);
  const [activeModal, setActiveModal] = useState<SelectorKey>(null);

  // Swipe-card media now lives here (used to live on profile.tsx). Both
  // arrays are committed IMMEDIATELY on add/delete — they don't wait on
  // the Save button — because uploads happen out-of-band and reverting
  // them on cancel would orphan blobs in storage.
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [galleryVideos, setGalleryVideos] = useState<string[]>([]);
  const [mediaBusy, setMediaBusy] = useState<null | "photos" | "videos">(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const profileFetch = isAthlete
      ? profilesService.getAthleteProfile()
      : isRecruiter
        ? profilesService.getRecruiterProfile()
        : isParent
          ? profilesService.getParentProfile()
          : Promise.resolve(null);

    Promise.all([
      usersService.getMe().catch(() => null),
      profileFetch.catch(() => null),
    ]).then(([me, p]) => {
      if (cancelled) return;
      if (me) {
        setName(me.name ?? "");
        setLocation(me.location ?? "");
        setLatitude(typeof me.latitude === "number" ? me.latitude : null);
        setLongitude(typeof me.longitude === "number" ? me.longitude : null);
        setAvatarPreview(me.avatar_url ?? null);
      }
      if (p) {
        setExistingProfile(p);
        setBio(p.bio ?? "");
        if (!isParent) setSport(p.sport ?? "");
        if (isRecruiter) setOrganization(p.organization ?? "");
        if (isAthlete) {
          setPosition(p.position ?? "");
          setLevel(p.level ?? "");
          setHeight(p.height ?? "");
          setWeight(p.weight ?? "");
          setGender(p.gender ?? "");
          setDob(fromIsoDate(p.date_of_birth));
        }
        if (isAthlete || isRecruiter) {
          setGalleryPhotos(Array.isArray(p.photos) ? p.photos : []);
          setGalleryVideos(Array.isArray(p.videos) ? p.videos : []);
        }
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isAthlete, isRecruiter, isParent]);

  const selectedSport = useMemo(
    () => SPORTS_WITH_POSITIONS.find((s) => s.name === sport),
    [sport],
  );

  const sportOptions = useMemo<PickerOption[]>(
    () =>
      SPORTS_WITH_POSITIONS.map((s) => ({ label: s.name, value: s.name })),
    [],
  );

  const positionOptions = useMemo<PickerOption[]>(() => {
    if (!selectedSport) return [];
    return selectedSport.positions.map((p) => ({ label: p, value: p }));
  }, [selectedSport]);

  const levelOptions = useMemo<PickerOption[]>(() => {
    if (!selectedSport) return [];
    return selectedSport.levels.map((l) => ({ label: l, value: l }));
  }, [selectedSport]);

  const genderOptions = useMemo<PickerOption[]>(
    () => GENDER_OPTIONS.map((g) => ({ label: g, value: g })),
    [],
  );

  const modalTitle =
    activeModal === "sport"
      ? "Select Sport"
      : activeModal === "position"
        ? "Select Position"
        : activeModal === "level"
          ? "Select Athletic Level"
          : activeModal === "gender"
            ? "Select Gender"
            : "";

  const modalOptions: PickerOption[] =
    activeModal === "sport"
      ? sportOptions
      : activeModal === "position"
        ? positionOptions
        : activeModal === "level"
          ? levelOptions
          : activeModal === "gender"
            ? genderOptions
            : [];

  const modalSelected =
    activeModal === "sport"
      ? sport
      : activeModal === "position"
        ? position
        : activeModal === "level"
          ? level
          : activeModal === "gender"
            ? gender
            : "";

  const handleSelectFromModal = (value: string) => {
    if (activeModal === "sport") {
      if (value !== sport) {
        setSport(value);
        setPosition("");
        setLevel("");
      }
    } else if (activeModal === "position") {
      setPosition(value);
    } else if (activeModal === "level") {
      setLevel(value);
    } else if (activeModal === "gender") {
      setGender(value);
    }
    setActiveModal(null);
  };

  const handleDobChange = (event: any, selectedDate?: Date) => {
    if (event?.type === "dismissed") return;
    if (selectedDate) setDob(selectedDate);
  };

  const handleOpenDob = () => {
    const initial = dob ?? (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 18);
      return d;
    })();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        maximumDate: new Date(),
        minimumDate: new Date(1900, 0, 1),
        onChange: handleDobChange,
      });
    } else {
      if (!dob) setDob(initial);
      setDobModalVisible(true);
    }
  };

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to change your profile image.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const localUri = asset.uri;
    setAvatarPreview(localUri);
    setUploadingAvatar(true);
    try {
      const mime = asset.mimeType ?? "image/jpeg";
      const ext = extFromMime(mime);
      const fileName = sanitizeFileName(`avatar-${Date.now()}.${ext}`);
      // Native streaming upload (FileSystem.uploadAsync) — same path
      // post-create uses. fetch().blob() on a file:// URI is unreliable
      // and memory-heavy on-device, so never load the file into JS.
      const uploaded = await uploadsService.uploadAsset(
        AVATAR_BUCKET,
        localUri,
        fileName,
        mime,
      );
      setAvatarUploadedUrl(uploaded.publicUrl);
    } catch (err: any) {
      setAvatarPreview(null);
      setAvatarUploadedUrl(null);
      Alert.alert("Upload failed", err?.message ?? "Could not upload image.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Lifted verbatim from profile.tsx so the upsert shape stays identical
  // (discover.service reads photos[]/videos[] off the same row). Validates
  // the profile is set up enough to own media first, then appends new
  // URLs and rewrites the array.
  const handleAddMedia = async (kind: "photos" | "videos") => {
    if (mediaBusy) return;
    if (!isAthlete && !isRecruiter) return;
    const currentArr = kind === "photos" ? galleryPhotos : galleryVideos;
    const cap = kind === "photos" ? MAX_GALLERY_PHOTOS : MAX_HIGHLIGHT_VIDEOS;
    if (currentArr.length >= cap) {
      Alert.alert(
        kind === "photos" ? "Photo limit" : "Video limit",
        kind === "photos"
          ? `You can have up to ${cap} swipe-card photos. Delete one to add another.`
          : `You can have up to ${cap} highlight video. Delete it to add another.`,
      );
      return;
    }
    setMediaBusy(kind);
    try {
      let current: any = {};
      try {
        current = isAthlete
          ? await profilesService.getAthleteProfile()
          : await profilesService.getRecruiterProfile();
      } catch {
        /* 404 = no profile yet */
      }
      if (isAthlete && !current?.sport) {
        Alert.alert(
          "Set up your profile first",
          "Pick a sport above before uploading media.",
        );
        return;
      }
      if (
        isRecruiter &&
        (!current?.organization || !current?.sport || !current?.role_type)
      ) {
        Alert.alert(
          "Set up your profile first",
          "Add your organization, sport, and role before uploading media.",
        );
        return;
      }
      const remaining = cap - currentArr.length;
      const newUrls = await pickAndUploadMedia(
        kind === "videos" ? "video" : "image",
        kind,
        {
          allowsMultipleSelection: kind === "photos",
          selectionLimit: kind === "photos" ? Math.max(1, remaining) : 1,
        },
      );
      if (newUrls.length === 0) return;
      const merged = pickFields(
        current,
        isAthlete ? ATHLETE_DTO_FIELDS : RECRUITER_DTO_FIELDS,
      );
      const existing: string[] = Array.isArray(current[kind])
        ? current[kind]
        : currentArr;
      const next = [...existing, ...newUrls].slice(0, cap);
      merged[kind] = next;
      if (isAthlete) {
        await profilesService.upsertAthleteProfile(merged);
      } else {
        await profilesService.upsertRecruiterProfile(merged);
      }
      if (kind === "photos") setGalleryPhotos(next);
      else setGalleryVideos(next);
    } catch (err: any) {
      Alert.alert(
        "Upload failed",
        err?.message ?? "Something went wrong while uploading.",
      );
    } finally {
      setMediaBusy(null);
    }
  };

  const handleDeleteMedia = (kind: "photos" | "videos", url: string) => {
    if (mediaBusy) return;
    if (!isAthlete && !isRecruiter) return;
    Alert.alert(
      kind === "videos" ? "Delete this video?" : "Delete this photo?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setMediaBusy(kind);
            try {
              let current: any = {};
              try {
                current = isAthlete
                  ? await profilesService.getAthleteProfile()
                  : await profilesService.getRecruiterProfile();
              } catch {
                return; // 404 — nothing to delete from
              }
              const existing: string[] = Array.isArray(current[kind])
                ? current[kind]
                : kind === "photos"
                  ? galleryPhotos
                  : galleryVideos;
              const next = existing.filter((u: string) => u !== url);
              if (next.length === existing.length) return; // not in array

              // Persist the array FIRST, then best-effort blob delete.
              // If we removed the blob first and the upsert failed, the
              // profile still held the (now-broken) public URL — the card
              // would render an empty box. Flipping the order means a
              // failed blob delete just leaves an orphan in storage that
              // the upload-cleanup sweep can reclaim later.
              const merged = pickFields(
                current,
                isAthlete ? ATHLETE_DTO_FIELDS : RECRUITER_DTO_FIELDS,
              );
              merged[kind] = next;
              if (isAthlete) {
                await profilesService.upsertAthleteProfile(merged);
              } else {
                await profilesService.upsertRecruiterProfile(merged);
              }
              if (kind === "photos") setGalleryPhotos(next);
              else setGalleryVideos(next);

              const bucket: UploadBucket =
                kind === "videos" ? "videos" : "photos";
              const path = pathFromPublicUrl(url, bucket);
              if (path) {
                await uploadsService
                  .deleteFile(bucket, path)
                  .catch(() => {});
              }
            } catch (err: any) {
              Alert.alert(
                "Could not delete",
                err?.message ?? "Try again in a moment.",
              );
            } finally {
              setMediaBusy(null);
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErrorMsg("Name is required.");
      return;
    }
    if (!isParent && !sport) {
      setErrorMsg("Pick a sport.");
      return;
    }
    if (isRecruiter && !organization.trim()) {
      setErrorMsg("Organization is required.");
      return;
    }
    setErrorMsg(null);
    setSaving(true);
    try {
      const userUpdates: Record<string, any> = {
        name: name.trim(),
        location: location.trim(),
      };
      if (latitude !== null) userUpdates.latitude = latitude;
      if (longitude !== null) userUpdates.longitude = longitude;
      if (avatarUploadedUrl) userUpdates.avatar_url = avatarUploadedUrl;
      const updatedUser = await usersService.updateMe(userUpdates);

      if (isAthlete) {
        // Gallery photos[] + videos[] are managed by handleAddMedia /
        // handleDeleteMedia and committed immediately, so the Save
        // button no longer touches them. Previously this branch wrote
        // `photos: [avatarUploadedUrl]` whenever the avatar changed,
        // which wiped the swipe-card gallery — that override is gone.
        await profilesService.upsertAthleteProfile({
          sport,
          // Empty string (not undefined) so an emptied field is actually
          // persisted as cleared — `|| undefined` made these unclearable
          // after first save, because Nest's PATCH drops undefined keys
          // and keeps the previous value.
          position: position,
          level: level,
          bio: bio.trim(),
          height: height.trim(),
          weight: weight.trim(),
          gender: gender || undefined,
          date_of_birth: dob ? toIsoDate(dob) : undefined,
        });
      } else if (isRecruiter) {
        const prev = existingProfile ?? {};
        await profilesService.upsertRecruiterProfile({
          organization: organization.trim(),
          sport,
          role_type: prev.role_type ?? (role === "coach" ? "coach" : "agent"),
          tags: prev.tags ?? [],
          bio: bio.trim(),
        });
      } else if (isParent) {
        const prev = existingProfile ?? {};
        await profilesService.upsertParentProfile({
          relationship: prev.relationship ?? "Parent",
          child_athlete_id: prev.child_athlete_id ?? undefined,
          child_class_year: prev.child_class_year ?? undefined,
          bio: bio.trim(),
        });
      }

      if (authUser) {
        dispatch(
          setLoggedInUser({
            user: {
              ...authUser,
              name: updatedUser?.name ?? userUpdates.name,
            },
            isOnboarded,
          }),
        );
      }

      router.back();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        "Could not save changes.";
      setErrorMsg(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (!fontsLoaded) return null;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>Edit Profile</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.text} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>Edit Profile</Text>
          <Pressable
            style={styles.headerButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <View style={styles.avatarSection}>
          <Pressable
            onPress={handlePickAvatar}
            style={styles.avatarTouch}
            disabled={uploadingAvatar}
          >
            <View style={styles.avatarPlaceholder}>
              {avatarPreview ? (
                <Image
                  source={{ uri: avatarPreview }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={56} color={theme.textMuted} />
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color={brand.white} />
                </View>
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={16} color={brand.white} />
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap photo to change</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={theme.inputPlaceholder}
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <LocationPicker
              value={location}
              latitude={latitude}
              longitude={longitude}
              onChange={({ label, latitude: lat, longitude: lng }) => {
                setLocation(label);
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Description / Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself"
              placeholderTextColor={theme.inputPlaceholder}
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
        </View>

        {isRecruiter && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Organization</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {role === "coach" ? "Organization" : "Agency Name"}
              </Text>
              <TextInput
                value={organization}
                onChangeText={setOrganization}
                placeholder={
                  role === "coach" ? "State University" : "Premier Sports Group"
                }
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.input}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
          </View>
        )}

        {!isParent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sport</Text>

            <SelectorRow
              icon="football-outline"
              label="Sport"
              value={sport || "Select a sport"}
              placeholder={!sport}
              onPress={() => setActiveModal("sport")}
            />

            {isAthlete && (
              <>
                <SelectorRow
                  icon="body-outline"
                  label="Position"
                  value={position || (sport ? "Select position" : "Pick a sport first")}
                  placeholder={!position}
                  disabled={!sport}
                  onPress={() => sport && setActiveModal("position")}
                />
                <SelectorRow
                  icon="ribbon-outline"
                  label="Athletic Level"
                  value={level || (sport ? "Select level" : "Pick a sport first")}
                  placeholder={!level}
                  disabled={!sport}
                  onPress={() => sport && setActiveModal("level")}
                />
              </>
            )}
          </View>
        )}

        {isAthlete && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Info</Text>

            <SelectorRow
              icon="male-female-outline"
              label="Gender"
              value={gender || "Select gender"}
              placeholder={!gender}
              onPress={() => setActiveModal("gender")}
            />

            <SelectorRow
              icon="calendar-outline"
              label="Date of Birth"
              value={dob ? formatDobForDisplay(dob) : "Select date"}
              placeholder={!dob}
              onPress={handleOpenDob}
            />
          </View>
        )}

        {isAthlete && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Physical Attributes</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Height</Text>
              <TextInput
                value={height}
                onChangeText={setHeight}
                placeholder={"e.g. 6'2\" or 188 cm"}
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.input}
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Weight</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                placeholder="e.g. 185 lbs or 84 kg"
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.input}
                autoCapitalize="none"
                returnKeyType="done"
              />
            </View>
          </View>
        )}

        {(isAthlete || isRecruiter) && (
          <View style={styles.section}>
            <View style={styles.mediaHeader}>
              <Text style={styles.sectionTitle}>Swipe-card photos</Text>
              <Text style={styles.mediaSubLabel}>
                {galleryPhotos.length}/{MAX_GALLERY_PHOTOS}
              </Text>
            </View>
            <Text style={styles.mediaHelper}>
              These show on your card in Discover. Tap to add, long-press to remove.
            </Text>
            <View style={styles.galleryGrid}>
              {galleryPhotos.map((url) => (
                <Pressable
                  key={url}
                  style={styles.galleryTile}
                  onLongPress={() => handleDeleteMedia("photos", url)}
                  delayLongPress={400}
                  disabled={mediaBusy !== null}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
              {galleryPhotos.length < MAX_GALLERY_PHOTOS && (
                <Pressable
                  style={[styles.galleryTile, styles.galleryAddTile]}
                  onPress={() => handleAddMedia("photos")}
                  disabled={mediaBusy !== null}
                >
                  {mediaBusy === "photos" ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Ionicons name="add" size={24} color={theme.text} />
                  )}
                </Pressable>
              )}
            </View>
          </View>
        )}

        {(isAthlete || isRecruiter) && (
          <View style={styles.section}>
            <View style={styles.mediaHeader}>
              <Text style={styles.sectionTitle}>Highlight video</Text>
              <Text style={styles.mediaSubLabel}>
                {galleryVideos.length}/{MAX_HIGHLIGHT_VIDEOS}
              </Text>
            </View>
            <Text style={styles.mediaHelper}>
              The reel that plays on your card. Tap to add, long-press to remove.
            </Text>
            <View style={styles.videoList}>
              {galleryVideos.map((url) => (
                <Pressable
                  key={url}
                  style={styles.videoTile}
                  onLongPress={() => handleDeleteMedia("videos", url)}
                  delayLongPress={400}
                  disabled={mediaBusy !== null}
                >
                  <View style={styles.videoTileInner}>
                    <Ionicons
                      name="play-circle"
                      size={42}
                      color={brand.white}
                    />
                    <Text style={styles.videoTileLabel}>Highlight reel</Text>
                  </View>
                </Pressable>
              ))}
              {galleryVideos.length < MAX_HIGHLIGHT_VIDEOS && (
                <Pressable
                  style={[styles.videoTile, styles.videoAddTile]}
                  onPress={() => handleAddMedia("videos")}
                  disabled={mediaBusy !== null}
                >
                  {mediaBusy === "videos" ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <>
                      <Ionicons
                        name="videocam-outline"
                        size={26}
                        color={theme.text}
                      />
                      <Text style={styles.videoAddLabel}>Add highlight video</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        )}

        {errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#FF7675" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            (saving || uploadingAvatar || mediaBusy !== null) &&
              styles.saveButtonDisabled,
            pressed && styles.pressed,
          ]}
          onPress={handleSave}
          disabled={saving || uploadingAvatar || mediaBusy !== null}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </Pressable>
      </View>

      <OptionPickerModal
        visible={activeModal !== null}
        title={modalTitle}
        options={modalOptions}
        selectedValue={modalSelected}
        onClose={() => setActiveModal(null)}
        onSelect={handleSelectFromModal}
      />

      {Platform.OS === "ios" && (
        <Modal
          visible={dobModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDobModalVisible(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setDobModalVisible(false)}
            />
            <View
              style={[
                styles.modalSheet,
                { paddingBottom: insets.bottom + 18 },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Date of Birth</Text>
                <Pressable
                  onPress={() => setDobModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </Pressable>
              </View>
              <DateTimePicker
                value={dob ?? new Date()}
                mode="date"
                display="spinner"
                onChange={handleDobChange}
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                themeVariant="dark"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  { marginTop: 12 },
                ]}
                onPress={() => setDobModalVisible(false)}
              >
                <Text style={styles.saveButtonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function SelectorRow({
  icon,
  label,
  value,
  placeholder,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  placeholder?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.selectorRow,
        disabled && styles.selectorRowDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.selectorIconWrap}>
        <Ionicons name={icon} size={18} color={theme.text} />
      </View>
      <View style={styles.selectorContent}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <Text
          style={[
            styles.selectorValue,
            placeholder && styles.selectorValuePlaceholder,
          ]}
        >
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

function OptionPickerModal({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[styles.modalSheet, { paddingBottom: insets.bottom + 18 }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalOptions}
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    selected && styles.modalOptionSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => onSelect(option.value)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      selected && styles.modalOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={theme.accentText}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerButton: {
    minWidth: 64,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  saveText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 14,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 8,
  },
  avatarTouch: {
    position: "relative",
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: theme.border,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.bg,
  },
  avatarHint: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  section: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
    fontSize: 14,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.surface,
  },
  selectorRowDisabled: {
    opacity: 0.55,
  },
  selectorIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectorContent: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  selectorValue: {
    marginTop: 1,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  selectorValuePlaceholder: {
    color: theme.textMuted,
    fontFamily: "Poppins_400Regular",
  },
  mediaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mediaSubLabel: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  mediaHelper: {
    marginTop: -4,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    lineHeight: 18,
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  galleryTile: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: theme.surface,
    overflow: "hidden",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  galleryAddTile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.borderLight,
    backgroundColor: "transparent",
  },
  videoList: {
    gap: 10,
    marginTop: 4,
  },
  videoTile: {
    height: 110,
    borderRadius: 12,
    backgroundColor: theme.surfaceSecondary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  videoTileInner: {
    alignItems: "center",
    gap: 6,
  },
  videoTileLabel: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  videoAddTile: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.borderLight,
    backgroundColor: "transparent",
  },
  videoAddLabel: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(231,76,60,0.12)",
    borderColor: "rgba(231,76,60,0.6)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: "#FF7675",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.headerBg,
  },
  saveButton: {
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },
  pressed: {
    opacity: 0.85,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalSheet: {
    maxHeight: "70%",
    backgroundColor: theme.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  modalOptions: {
    marginTop: 4,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  modalOptionSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  modalOptionText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  modalOptionTextSelected: {
    color: theme.accentText,
  },
});
