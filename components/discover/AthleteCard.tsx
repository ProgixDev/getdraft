import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { brand, neutral, semantic, theme } from '@/config/colors';
import { AthleteProfile } from '@/constants/discoverData';

type MediaPhase = 'video' | 'image';

interface AthleteCardProps {
  athlete: AthleteProfile;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  isActive?: boolean;
  cardWidth: number;
  cardHeight: number;
  screenWidth: number;
}

export function AthleteCard({
  athlete,
  onSwipeLeft,
  onSwipeRight,
  isTop,
  isActive,
  cardWidth,
  cardHeight,
  screenWidth,
}: AthleteCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const active = isActive ?? isTop;

  const hasVideo = athlete.videos.length > 0;
  const hasPhoto = athlete.photos.length > 0;
  const firstVideo = athlete.videos[0];
  const firstPhoto = athlete.photos[0];

  const [phase, setPhase] = useState<MediaPhase>(() =>
    active && hasVideo ? 'video' : 'image'
  );
  const [videoReady, setVideoReady] = useState(false);

  // expo-video's useVideoPlayer accepts a string URL or a number (require'd asset).
  // MediaSource is `string | number`, so we pass it through directly.
  const videoSource: string | number = hasVideo && firstVideo != null ? firstVideo : '';

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    setVideoReady(false);
    setPhase(active && hasVideo ? 'video' : 'image');
    if (active && hasVideo && player) {
      player.play();
    }
  }, [athlete.id, active, hasVideo]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') {
        setVideoReady(true);
      }
    });
    const endSub = player.addListener('playToEnd', () => {
      if (hasPhoto) setPhase('image');
    });
    return () => { sub.remove(); endSub.remove(); };
  }, [player, hasPhoto]);

  const swipeThreshold = Math.min(140, Math.max(90, cardWidth * 0.28));
  const overlayDivisor = Math.max(80, cardWidth * 0.25);

  const panGesture = Gesture.Pan()
    .enabled(isTop)
    .activeOffsetX(20)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2;
    })
    .onEnd((e) => {
      const shouldSwipeLeft = e.translationX < -swipeThreshold || e.velocityX < -400;
      const shouldSwipeRight = e.translationX > swipeThreshold || e.velocityX > 400;

      if (shouldSwipeLeft) {
        translateX.value = withSpring(-screenWidth * 1.2, { damping: 15 }, () => {
          runOnJS(onSwipeLeft)();
        });
      } else if (shouldSwipeRight) {
        translateX.value = withSpring(screenWidth * 1.2, { damping: 15 }, () => {
          runOnJS(onSwipeRight)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 15 });
        translateY.value = withSpring(0, { damping: 15 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = (translateX.value / screenWidth) * 12;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeOverlayStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / overlayDivisor, 1) * 0.9,
  }));

  const nopeOverlayStyle = useAnimatedStyle(() => ({
    opacity: Math.min(-translateX.value / overlayDivisor, 1) * 0.9,
  }));

  const getImageSource = () =>
    typeof firstPhoto === 'string' ? { uri: firstPhoto } : firstPhoto;

  const renderMedia = () => {
    if (active && phase === 'video' && hasVideo && player) {
      return (
        <VideoView
          player={player}
          style={styles.media}
          contentFit="cover"
          nativeControls={false}
        />
      );
    }

    if (hasPhoto) {
      return (
        <Image
          source={getImageSource()}
          style={styles.media}
          resizeMode="cover"
        />
      );
    }

    return (
      <View style={styles.placeholderImage}>
        <Ionicons name="person" size={72} color={theme.textMuted} />
      </View>
    );
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth, height: cardHeight }, animatedStyle]}>
        <View style={styles.cardImage}>
          {renderMedia()}
          {active && phase === 'video' && hasVideo && !videoReady && (
            <View style={styles.videoLoading}>
              <ActivityIndicator size="large" color={brand.white} />
            </View>
          )}

          <View style={styles.cardTag}>
            <Ionicons name="diamond" size={12} color={brand.white} />
            <Text style={styles.cardTagText}>Available for Recruitment</Text>
          </View>

          <Animated.View style={[styles.overlay, styles.likeOverlay, likeOverlayStyle]}>
            <Text style={[styles.overlayText, { color: semantic.success }]}>DRAFT</Text>
          </Animated.View>
          <Animated.View style={[styles.overlay, styles.nopeOverlay, nopeOverlayStyle]}>
            <Text style={[styles.overlayText, { color: semantic.error }]}>PASS</Text>
          </Animated.View>

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
            style={styles.cardOverlay}
          >
            <View style={styles.overlayLocation}>
              <Ionicons name="location" size={14} color={brand.white} />
              <Text style={styles.overlayLocationText}>{athlete.location}</Text>
            </View>
            <View style={styles.overlayNameRow}>
              <Text style={styles.overlayName}>
                {athlete.name}, {athlete.position}
              </Text>
              <Ionicons name="checkmark-circle" size={20} color={semantic.success} />
            </View>
            <Text style={styles.overlayOrg}>{athlete.level} • {athlete.sport}</Text>
            {athlete.bio && (
              <Text style={styles.overlayBio} numberOfLines={2}>{athlete.bio}</Text>
            )}
          </LinearGradient>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  cardImage: {
    flex: 1,
    backgroundColor: theme.surface,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutral.gray800,
  },
  placeholderImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTag: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cardTagText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderRadius: 24,
  },
  likeOverlay: {
    borderColor: semantic.success,
  },
  nopeOverlay: {
    borderColor: semantic.error,
  },
  overlayText: {
    fontSize: 42,
    fontFamily: 'Poppins_800ExtraBold',
    letterSpacing: 4,
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 40,
  },
  overlayLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  overlayLocationText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.95)',
  },
  overlayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayName: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: brand.white,
  },
  overlayOrg: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  overlayBio: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
  },
});
