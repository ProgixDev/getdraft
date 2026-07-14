import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, theme } from "@/config/colors";
import { pickAndUploadMedia } from "@/services/media";
import { profilesService } from "@/services/profiles";

// Client requirement: athletes must add at least 4 photos/videos at signup so
// the profiles scouts browse are never empty. Video is optional (any mix of 4).
const MIN_MEDIA = 4;
const MAX_PHOTOS = 6;
const MAX_VIDEOS = 1; // matches the single "highlight video" cap in edit-profile

interface Props {
  /** Athlete profile row already exists from the previous step; we merge the
   *  chosen media into it, then advance. */
  onComplete: () => void;
  onBack: () => void;
}

export const MediaUploadScreen: React.FC<Props> = ({ onComplete, onBack }) => {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "photo" | "video">(null);
  const [saving, setSaving] = useState(false);

  const total = photos.length + videos.length;
  const canContinue = total >= MIN_MEDIA;

  const addPhotos = async () => {
    if (busy) return;
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Photo limit", `You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setBusy("photo");
    try {
      const remaining = MAX_PHOTOS - photos.length;
      const urls = await pickAndUploadMedia("image", "photos", {
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, remaining),
      });
      if (urls.length) setPhotos((p) => [...p, ...urls].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const addVideo = async () => {
    if (busy) return;
    if (videos.length >= MAX_VIDEOS) {
      Alert.alert("Video limit", `You can add ${MAX_VIDEOS} highlight video.`);
      return;
    }
    setBusy("video");
    try {
      const urls = await pickAndUploadMedia("video", "videos", {
        selectionLimit: 1,
      });
      if (urls.length) setVideos((v) => [...v, ...urls].slice(0, MAX_VIDEOS));
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const handleContinue = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      // Partial upsert — only photos/videos columns are touched, so the
      // profile fields set on the previous step are preserved.
      await profilesService.upsertAthleteProfile({ photos, videos });
      onComplete();
    } catch (e: any) {
      Alert.alert(
        "Could not save your media",
        e?.response?.data?.message ?? e?.message ?? "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={brand.white} />
          </Pressable>
          <Text style={styles.stepText}>Add your media</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Show your game</Text>
          <Text style={styles.subtitle}>
            Add at least {MIN_MEDIA} photos or videos so scouts can see you in
            action. Profiles with media get noticed first.
          </Text>

          <View style={styles.counterRow}>
            <Ionicons
              name={canContinue ? "checkmark-circle" : "images-outline"}
              size={18}
              color={canContinue ? "#3AD07A" : brand.white}
            />
            <Text style={styles.counterText}>
              {total}/{MIN_MEDIA} added
              {canContinue ? "" : ` · ${MIN_MEDIA - total} to go`}
            </Text>
          </View>

          <View style={styles.grid}>
            {photos.map((url) => (
              <View key={url} style={styles.thumbWrap}>
                <Image source={{ uri: url }} style={styles.thumb} />
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => setPhotos((p) => p.filter((u) => u !== url))}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {videos.map((url) => (
              <View key={url} style={styles.thumbWrap}>
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Ionicons name="videocam" size={26} color="#fff" />
                </View>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => setVideos((v) => v.filter((u) => u !== url))}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={styles.addBtn}
              onPress={addPhotos}
              disabled={!!busy}
            >
              {busy === "photo" ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <>
                  <Ionicons name="image" size={20} color={brand.white} />
                  <Text style={styles.addBtnText}>Add photos</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.addBtn}
              onPress={addVideo}
              disabled={!!busy}
            >
              {busy === "video" ? (
                <ActivityIndicator color={brand.white} />
              ) : (
                <>
                  <Ionicons name="videocam" size={20} color={brand.white} />
                  <Text style={styles.addBtnText}>Add video</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>

        <Pressable
          style={[
            styles.continueBtn,
            (!canContinue || saving) && styles.continueBtnDisabled,
            { marginBottom: insets.bottom + 12 },
          ]}
          onPress={handleContinue}
          disabled={!canContinue || saving}
        >
          {saving ? (
            <ActivityIndicator color={brand.primary} />
          ) : (
            <Text style={styles.continueText}>
              {canContinue ? "Continue" : `Add ${MIN_MEDIA - total} more`}
            </Text>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { width: 40 },
  stepText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  scroll: { paddingBottom: 16 },
  title: {
    fontSize: 26,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.75)",
    marginTop: 8,
    lineHeight: 20,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    marginBottom: 12,
  },
  counterText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  thumbWrap: {
    width: "30%",
    aspectRatio: 1,
  },
  thumb: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  videoThumb: {
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  addBtnText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  continueBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueText: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
});

export default MediaUploadScreen;
