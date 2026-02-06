import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  mockRecruiters,
  mockAthletes,
  RecruiterCard,
  AthleteProfile,
} from '@/constants/discoverData';
import { AthleteCard } from '@/components/discover/AthleteCard';
import { RootState } from '@/store';

function DiscoverCard({
  recruiter,
  onSwipeLeft,
  onSwipeRight,
  isTop,
  cardWidth,
  cardHeight,
  screenWidth,
}: {
  recruiter: RecruiterCard;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
  cardWidth: number;
  cardHeight: number;
  screenWidth: number;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
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

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width: cardWidth, height: cardHeight }, animatedStyle]}>
        <View style={styles.cardImage}>
          {recruiter.imageUrl ? (
            <Image
              source={{ uri: recruiter.imageUrl }}
              style={styles.media}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons
                name={recruiter.role === 'agent' ? 'briefcase' : 'school'}
                size={72}
                color={neutral.gray400}
              />
            </View>
          )}

          <View style={styles.cardTag}>
            <Ionicons name="diamond" size={12} color={brand.white} />
            <Text style={styles.cardTagText}>Open to Recruiting</Text>
          </View>

          <Animated.View style={[styles.overlay, styles.likeOverlay, likeOverlayStyle]}>
            <Text style={[styles.overlayText, { color: semantic.success }]}>LIKE</Text>
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
              <Text style={styles.overlayLocationText}>{recruiter.location}</Text>
            </View>
            <View style={styles.overlayNameRow}>
              <Text style={styles.overlayName}>
                {recruiter.name}, {recruiter.role === 'agent' ? 'Agent' : 'Coach'}
              </Text>
              {recruiter.verified && (
                <Ionicons name="checkmark-circle" size={20} color={semantic.success} />
              )}
            </View>
            <Text style={styles.overlayOrg}>{recruiter.organization}</Text>
            <View style={styles.tagRow}>
              {recruiter.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const user = useSelector((state: RootState) => state.auth.user);
  const isRecruiter = user?.role === 'recruiter' || user?.role === 'coach';
  const discoverItems = isRecruiter ? mockAthletes : mockRecruiters;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [swipeLock, setSwipeLock] = useState(false);
  const [cardAreaHeight, setCardAreaHeight] = useState(0);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const displayName = user?.name?.split(' ')[0] || 'Player';

  const handleCardAreaLayout = useCallback((e: any) => {
    const next = Math.round(e?.nativeEvent?.layout?.height ?? 0);
    if (next > 0) setCardAreaHeight(next);
  }, []);

  const cardWidth = useMemo(() => {
    const horizontalPadding = 16;
    const maxWidth = 460;
    return Math.min(screenWidth - horizontalPadding * 2, maxWidth);
  }, [screenWidth]);

  const cardHeight = useMemo(() => {
    const byRatio = Math.round(cardWidth * (4 / 3)); // ~3:4 card ratio
    const fallback = Math.round(screenHeight * 0.58);
    const available = cardAreaHeight > 0 ? Math.max(0, cardAreaHeight - 12) : fallback;
    return Math.min(byRatio, available);
  }, [cardAreaHeight, cardWidth, screenHeight]);

  const circleSize = useMemo(() => {
    // Responsive action buttons (small phones -> 52, larger -> 64)
    return Math.min(64, Math.max(52, Math.round(screenWidth * 0.16)));
  }, [screenWidth]);

  const messageHeight = useMemo(() => Math.round(circleSize * 0.82), [circleSize]);
  const actionIconSize = useMemo(() => Math.round(circleSize * 0.44), [circleSize]);

  const handleSwipeLeft = () => {
    setSwipeLock(true);
    setCurrentIndex((i) => Math.min(i + 1, discoverItems.length));
    setTimeout(() => setSwipeLock(false), 400);
  };

  const handleSwipeRight = () => {
    setSwipeLock(true);
    setCurrentIndex((i) => Math.min(i + 1, discoverItems.length));
    setTimeout(() => setSwipeLock(false), 400);
  };

  const handleSendMessage = () => {
    handleSwipeRight();
  };

  if (!fontsLoaded) return null;

  const hasMoreCards = currentIndex < discoverItems.length;
  const stackItems = hasMoreCards
    ? discoverItems.slice(currentIndex, currentIndex + 2).reverse()
    : [];
  const topStackIndex = stackItems.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {displayName} 👋</Text>
          <Text style={styles.title}>Let&apos;s Find a Match</Text>
        </View>
        <Pressable style={styles.notifyButton}>
          <Ionicons name="notifications-outline" size={24} color={brand.primary} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={neutral.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder={isRecruiter ? 'Find athletes...' : 'Find coaches, agents...'}
            placeholderTextColor={neutral.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <Pressable style={styles.filterButton}>
          <Ionicons name="options-outline" size={22} color={brand.primary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <View style={[styles.tab, styles.tabActive]}>
          <Text style={styles.tabTextActive}>Discover</Text>
        </View>
        <View style={styles.tab}>
          <Text style={styles.tabText}>Matches</Text>
        </View>
      </View>

      <View style={styles.cardsContainer} onLayout={handleCardAreaLayout}>
        {hasMoreCards ? (
          stackItems.map((item, i) => {
            const isTopCard = i === topStackIndex;
            const canSwipe = isTopCard && !swipeLock;
            const isBackCard = !isTopCard;
            return (
              <View
                key={`${isTopCard ? 'top' : 'next'}-${item.id}`}
                style={[
                  styles.cardWrapper,
                  {
                    zIndex: isTopCard ? 2 : 1,
                    opacity: isTopCard ? 1 : 0.92,
                    transform: isBackCard ? [{ scale: 0.96 }, { translateY: 12 }] : [],
                  },
                ]}
                pointerEvents={isTopCard ? 'auto' : 'none'}
              >
                {isRecruiter ? (
                  <AthleteCard
                    athlete={item as AthleteProfile}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    isTop={canSwipe}
                    isActive={isTopCard}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                    screenWidth={screenWidth}
                  />
                ) : (
                  <DiscoverCard
                    recruiter={item as RecruiterCard}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    isTop={canSwipe}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                    screenWidth={screenWidth}
                  />
                )}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={neutral.gray400} />
            <Text style={styles.emptyTitle}>No more profiles</Text>
            <Text style={styles.emptySubtitle}>
              Check back later for new {isRecruiter ? 'athletes' : 'recruiters'}
            </Text>
          </View>
        )}
      </View>

      {hasMoreCards && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.circleButton,
              styles.passButton,
              { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
              pressed && styles.pressed,
            ]}
            onPress={handleSwipeLeft}
          >
            <Ionicons name="close" size={actionIconSize} color={semantic.error} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.messageButton,
              { height: messageHeight, borderRadius: messageHeight / 2 },
              pressed && styles.pressed,
            ]}
            onPress={handleSendMessage}
          >
            <Ionicons name="chatbubble-outline" size={20} color={brand.primary} />
            <Text style={styles.messageButtonText}>Send a message</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.circleButton,
              styles.heartButton,
              { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
              pressed && styles.pressed,
            ]}
            onPress={handleSwipeRight}
          >
            <Ionicons name="heart" size={actionIconSize} color={brand.white} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutral.gray100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: brand.white,
  },
  greeting: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray600,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: brand.primary,
  },
  notifyButton: {
    padding: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: brand.white,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: neutral.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    color: brand.primary,
  },
  filterButton: {
    padding: 8,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: brand.white,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: brand.primary,
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    color: neutral.gray600,
  },
  tabTextActive: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.white,
  },
  cardsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: brand.white,
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
    backgroundColor: neutral.gray200,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
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
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: brand.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: brand.primary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: neutral.gray600,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  circleButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  passButton: {
    backgroundColor: neutral.gray200,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: neutral.gray200,
    paddingHorizontal: 16,
  },
  messageButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: brand.primary,
  },
  heartButton: {
    backgroundColor: brand.primary,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
