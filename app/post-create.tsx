import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

import { brand, theme } from "@/config/colors";
import { RootState } from "@/store";
import { postsService } from "@/services/posts";
import { uploadsService } from "@/services/uploads";

type PickedKind = "post" | "reel";

interface PickedAsset {
  uri: string;
  mimeType: string;
  kind: PickedKind;
  mediaType: "image" | "video";
  ext: string;
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
  if (mime.includes("video")) return "mp4";
  return "jpg";
}

export default function PostCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSelector((s: RootState) => s.auth.user);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Posting is an athlete affordance only. Recruiters/coaches/parents/admins
  // who somehow land here (stale deep link, history) bounce back to their
  // home — the Feed tab is already hidden from their tab bar.
  React.useEffect(() => {
    if (!user?.role) return;
    if (user.role === "athlete") return;
    if (user.role === "admin") router.replace("/(tabs)/dashboard");
    else if (user.role === "parent") router.replace("/(tabs)/home");
    else router.replace("/(tabs)");
  }, [user?.role, router]);

  const videoPlayer = useVideoPlayer(
    asset?.kind === "reel" ? asset.uri : "",
    (p) => {
      p.loop = true;
      p.muted = true;
    },
  );

  const handlePick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo/video access to create a post.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      videoMaxDuration: 60,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const isVideo = a.type === "video" || (a.mimeType ?? "").startsWith("video/");
    const mime = a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
    setAsset({
      uri: a.uri,
      mimeType: mime,
      kind: isVideo ? "reel" : "post",
      mediaType: isVideo ? "video" : "image",
      ext: extFromMime(mime),
    });
    setErrorMsg(null);
  };

  const handleShare = async () => {
    if (!asset) {
      setErrorMsg("Pick a photo or video first.");
      return;
    }
    if (!user?.id) {
      setErrorMsg("You need to be signed in.");
      return;
    }
    setErrorMsg(null);
    setUploading(true);
    try {
      const fileName = `${Date.now()}.${asset.ext}`;
      const signed = await uploadsService.getSignedUploadUrl("posts", fileName);
      const blob = await (await fetch(asset.uri)).blob();
      await uploadsService.uploadFile(signed.signedUrl, blob, asset.mimeType);
      await postsService.createPost({
        kind: asset.kind,
        mediaUrl: signed.publicUrl,
        mediaType: asset.mediaType,
        caption: caption.trim() || undefined,
      });
      router.replace("/(tabs)/feed");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? err?.message ?? "Could not share.";
      setErrorMsg(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setUploading(false);
    }
  };

  if (!fontsLoaded) return null;

  const isVideo = asset?.kind === "reel";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.back()}
          disabled={uploading}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>New {isVideo ? "Reel" : "Post"}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.shareBtn,
            (uploading || !asset) && styles.shareBtnDisabled,
            pressed && styles.pressed,
          ]}
          onPress={handleShare}
          disabled={uploading || !asset}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : (
            <Text style={styles.shareText}>Share</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.previewWrap}>
          {asset ? (
            isVideo ? (
              <VideoView
                player={videoPlayer}
                style={styles.previewMedia}
                contentFit="cover"
                nativeControls={false}
              />
            ) : (
              <ExpoImage
                source={{ uri: asset.uri }}
                style={styles.previewMedia}
                contentFit="cover"
              />
            )
          ) : (
            <Pressable
              style={styles.previewEmpty}
              onPress={handlePick}
              disabled={uploading}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={42}
                color={theme.textMuted}
              />
              <Text style={styles.previewEmptyTitle}>Tap to choose media</Text>
              <Text style={styles.previewEmptyHint}>
                Photos become Posts, videos become Reels (max 60s).
              </Text>
            </Pressable>
          )}

          {asset && (
            <Pressable
              style={styles.changeMediaBtn}
              onPress={handlePick}
              disabled={uploading}
            >
              <Ionicons name="swap-horizontal" size={14} color={brand.white} />
              <Text style={styles.changeMediaText}>Change media</Text>
            </Pressable>
          )}
        </View>

        {asset && (
          <View style={styles.kindRow}>
            <View
              style={[
                styles.kindBadge,
                isVideo ? styles.kindReel : styles.kindPost,
              ]}
            >
              <Ionicons
                name={isVideo ? "play" : "image"}
                size={12}
                color={brand.white}
              />
              <Text style={styles.kindText}>{isVideo ? "Reel" : "Post"}</Text>
            </View>
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Caption (optional)</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Share something about this moment…"
            placeholderTextColor={theme.inputPlaceholder}
            style={[styles.input, styles.textArea]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!uploading}
            maxLength={2000}
          />
        </View>

        {errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#FF7675" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  shareBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: theme.accent,
  },
  shareBtnDisabled: {
    opacity: 0.55,
  },
  shareText: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },
  scrollContent: {
    padding: 14,
    gap: 14,
  },
  previewWrap: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
    position: "relative",
  },
  previewMedia: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#000",
  },
  previewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    paddingHorizontal: 24,
    gap: 8,
  },
  previewEmptyTitle: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  previewEmptyHint: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    textAlign: "center",
  },
  changeMediaBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  changeMediaText: {
    color: brand.white,
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  kindRow: {
    flexDirection: "row",
  },
  kindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  kindPost: {
    backgroundColor: "#0984E3",
  },
  kindReel: {
    backgroundColor: "#6C5CE7",
  },
  kindText: {
    color: brand.white,
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 0.4,
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
    minHeight: 110,
    paddingTop: 12,
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
  pressed: {
    opacity: 0.85,
  },
});
