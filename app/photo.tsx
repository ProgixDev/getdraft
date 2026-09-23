import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  StatusBar,
  FlatList,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

/**
 * Full-screen photo viewer, the counterpart to /video.
 *
 * Profile photo grids were plain Views: tapping a photo did nothing, while
 * the videos right below them opened a player. A grid of thumbnails is an
 * invitation to tap, so people tapped, and nothing happened.
 *
 * Params: `urls` (JSON array of strings) and `index`. A single `url` is
 * also accepted, so a caller with one photo need not build an array.
 * Swiping moves between photos; the counter shows where you are.
 */
export default function PhotoViewerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{
    urls?: string;
    url?: string;
    index?: string;
    title?: string;
  }>();

  const photos: string[] = React.useMemo(() => {
    if (typeof params.urls === 'string') {
      try {
        const parsed = JSON.parse(params.urls);
        if (Array.isArray(parsed)) {
          return parsed.filter((u): u is string => typeof u === 'string' && !!u);
        }
      } catch {
        // Malformed param -- fall through to the single-url form below.
      }
    }
    return typeof params.url === 'string' && params.url ? [params.url] : [];
  }, [params.urls, params.url]);

  const start = Math.min(
    Math.max(parseInt(String(params.index ?? '0'), 10) || 0, 0),
    Math.max(photos.length - 1, 0),
  );
  const [current, setCurrent] = useState(start);
  const listRef = useRef<FlatList<string>>(null);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      setCurrent((prev) => (i === prev ? prev : i));
    },
    [width],
  );

  if (photos.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.errorWrap}>
          <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={styles.errorText}>No photo to show.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FlatList
        ref={listRef}
        data={photos}
        keyExtractor={(u, i) => `${i}-${u}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={start}
        // Every page is exactly one screen wide, so the offset is known
        // without measuring -- which is what makes initialScrollIndex safe.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <Pressable
            style={{ width, height }}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Image
              source={{ uri: item }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={120}
            />
          </Pressable>
        )}
      />

      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {photos.length > 1
            ? `${current + 1} of ${photos.length}`
            : (params.title ?? '')}
        </Text>
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
