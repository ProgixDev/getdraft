import React from 'react';
import { View, StyleSheet, Pressable, Text, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

export default function VideoPlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();

  const source = typeof url === 'string' ? url : '';
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = false;
    if (source) p.play();
  });

  if (!source) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.errorWrap}>
          <Ionicons name="videocam-off-outline" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={styles.errorText}>No video to play.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        allowsFullscreen
        allowsPictureInPicture
        nativeControls
      />
      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
        <View style={styles.closeButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
});
