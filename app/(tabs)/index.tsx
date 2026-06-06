import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  Image,
  ScrollView,
  useWindowDimensions,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector } from "react-redux";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, semantic, theme } from "@/config/colors";
import {
  mockRecruiters,
  mockAthletes,
  RecruiterCard,
  AthleteProfile,
} from "@/constants/discoverData";
import { mockParentProfiles } from "@/constants/parentData";
import { AthleteCard } from "@/components/discover/AthleteCard";
import { RootState } from "@/store";
import { discoverService } from "@/services/discover";

// ------------------------------------------------------------------
// DiscoverCard — shown to athletes swiping on recruiters
// ------------------------------------------------------------------
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
      const shouldSwipeLeft =
        e.translationX < -swipeThreshold || e.velocityX < -400;
      const shouldSwipeRight =
        e.translationX > swipeThreshold || e.velocityX > 400;

      if (shouldSwipeLeft) {
        translateX.value = withSpring(
          -screenWidth * 1.2,
          { damping: 15 },
          () => {
            runOnJS(onSwipeLeft)();
          },
        );
      } else if (shouldSwipeRight) {
        translateX.value = withSpring(
          screenWidth * 1.2,
          { damping: 15 },
          () => {
            runOnJS(onSwipeRight)();
          },
        );
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
      <Animated.View
        style={[
          styles.card,
          { width: cardWidth, height: cardHeight },
          animatedStyle,
        ]}
      >
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
                name={recruiter.role === "agent" ? "briefcase" : "school"}
                size={72}
                color={theme.textMuted}
              />
            </View>
          )}

          <View style={styles.cardTag}>
            <Ionicons name="diamond" size={12} color={brand.white} />
            <Text style={styles.cardTagText}>Open to Recruiting</Text>
          </View>

          <Animated.View
            style={[styles.overlay, styles.likeOverlay, likeOverlayStyle]}
          >
            <Text style={[styles.overlayText, { color: semantic.success }]}>
              DRAFT
            </Text>
          </Animated.View>
          <Animated.View
            style={[styles.overlay, styles.nopeOverlay, nopeOverlayStyle]}
          >
            <Text style={[styles.overlayText, { color: semantic.error }]}>
              PASS
            </Text>
          </Animated.View>

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)", "rgba(0,0,0,0.9)"]}
            style={styles.cardOverlay}
          >
            <View style={styles.overlayLocation}>
              <Ionicons name="location" size={14} color={brand.white} />
              <Text style={styles.overlayLocationText}>
                {recruiter.location}
              </Text>
            </View>
            <View style={styles.overlayNameRow}>
              <Text style={styles.overlayName}>
                {recruiter.name},{" "}
                {recruiter.role === "agent" ? "Agent" : "Coach"}
              </Text>
              {recruiter.verified && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={semantic.success}
                />
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

// ------------------------------------------------------------------
// Match celebration overlay
// ------------------------------------------------------------------
function MatchOverlay({
  recruiterName,
  onDismiss,
}: {
  recruiterName: string;
  onDismiss: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={styles.matchOverlay}
    >
      <LinearGradient
        colors={["rgba(0,0,0,0.85)", "rgba(18,18,18,0.97)"]}
        style={styles.matchOverlayInner}
      >
        <Text style={styles.matchEmoji}>🤝</Text>
        <Text style={styles.matchTitle}>Game On!</Text>
        <Text style={styles.matchSubtitle}>
          You and {recruiterName} are ready to connect.
        </Text>
        <Pressable style={styles.matchMessageButton} onPress={onDismiss}>
          <Ionicons name="chatbubble-outline" size={18} color={brand.white} />
          <Text style={styles.matchMessageButtonText}>Send a Message</Text>
        </Pressable>
        <Pressable style={styles.matchKeepButton} onPress={onDismiss}>
          <Text style={styles.matchKeepButtonText}>Keep Scouting</Text>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

// ------------------------------------------------------------------
// Main Discover Screen
// ------------------------------------------------------------------
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const user = useSelector((state: RootState) => state.auth.user);
  const preferences = useSelector(
    (state: RootState) => state.discoverPreferences,
  );
  const isRecruiter = user?.role === "recruiter" || user?.role === "coach";
  const isParent = user?.role === "parent";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [swipeLock, setSwipeLock] = useState(false);
  const [cardAreaHeight, setCardAreaHeight] = useState(0);
  const [matchOverlay, setMatchOverlay] = useState<{
    visible: boolean;
    name: string;
  }>({
    visible: false,
    name: "",
  });
  const [apiCards, setApiCards] = useState<any[] | null>(null);
  const [swipesRemaining, setSwipesRemaining] = useState<number | null>(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Fetch discover feed from API (falls back to mock data)
  useEffect(() => {
    if (isParent) return;
    discoverService
      .getFeed({
        sport: preferences.sport !== "all" ? preferences.sport : undefined,
        distanceKm: preferences.distanceKm ?? undefined,
        includeInternational: preferences.includeInternational,
        country: preferences.country || undefined,
        recruiterType:
          preferences.recruiterType !== "all"
            ? preferences.recruiterType
            : undefined,
        athletePosition:
          preferences.athletePosition !== "all"
            ? preferences.athletePosition
            : undefined,
        athleteLevel:
          preferences.athleteLevel !== "all"
            ? preferences.athleteLevel
            : undefined,
        verifiedRecruitersOnly: preferences.verifiedRecruitersOnly || undefined,
      })
      .then((res) => {
        setApiCards(res.cards);
        setSwipesRemaining(res.swipesRemaining);
      })
      .catch(() => {
        // Fallback to mock data
        setApiCards(null);
      });
  }, [isParent, preferences]);

  const displayName = user?.name?.split(" ")[0] || "Player";
  const parentProfile = isParent
    ? mockParentProfiles.find((parent) => parent.email === user?.email)
    : null;
  const managedAthlete = parentProfile
    ? mockAthletes.find(
        (athlete) => athlete.email === parentProfile.childAthleteEmail,
      )
    : null;
  const managedAthleteName = managedAthlete?.name ?? null;
  const discoverTitle =
    isParent && managedAthleteName
      ? `Opportunities for ${managedAthleteName.split(" ")[0]}`
      : "Let's Start Scouting";

  const discoverItems = useMemo(() => {
    // Use API data if available
    if (apiCards && apiCards.length > 0) {
      const query = searchQuery.trim().toLowerCase();
      if (query.length === 0) return apiCards;
      return apiCards.filter((card: any) =>
        [card.name, card.sport, card.organization, card.location, card.position]
          .filter(Boolean)
          .some((field: string) => field.toLowerCase().includes(query)),
      );
    }

    // Fallback to mock data
    const query = searchQuery.trim().toLowerCase();
    const shouldFilterByCountry = !preferences.includeInternational;

    if (isRecruiter) {
      return mockAthletes.filter((athlete) => {
        const matchesSearch =
          query.length === 0 ||
          [
            athlete.name,
            athlete.sport,
            athlete.position,
            athlete.level,
            athlete.location,
          ].some((field) => field.toLowerCase().includes(query));

        if (!matchesSearch) return false;
        if (preferences.sport !== "all" && athlete.sport !== preferences.sport)
          return false;
        if (
          preferences.distanceKm !== null &&
          athlete.distanceKm > preferences.distanceKm
        ) {
          return false;
        }
        if (shouldFilterByCountry && athlete.country !== preferences.country)
          return false;
        if (
          preferences.athletePosition !== "all" &&
          athlete.position !== preferences.athletePosition
        ) {
          return false;
        }
        if (
          preferences.athleteLevel !== "all" &&
          athlete.level !== preferences.athleteLevel
        ) {
          return false;
        }
        return true;
      });
    }

    return mockRecruiters.filter((recruiter) => {
      const matchesSearch =
        query.length === 0 ||
        [
          recruiter.name,
          recruiter.organization,
          recruiter.sport,
          recruiter.location,
          recruiter.role,
        ].some((field) => field.toLowerCase().includes(query));

      if (!matchesSearch) return false;
      if (preferences.sport !== "all" && recruiter.sport !== preferences.sport)
        return false;
      if (
        preferences.distanceKm !== null &&
        recruiter.distanceKm > preferences.distanceKm
      ) {
        return false;
      }
      if (shouldFilterByCountry && recruiter.country !== preferences.country)
        return false;
      if (
        preferences.recruiterType !== "all" &&
        recruiter.role !== preferences.recruiterType
      ) {
        return false;
      }
      if (preferences.verifiedRecruitersOnly && !recruiter.verified)
        return false;

      return true;
    });
  }, [isRecruiter, preferences, searchQuery]);

  useEffect(() => {
    setCurrentIndex(0);
    setSwipeLock(false);
  }, [isRecruiter, preferences, searchQuery]);

  useEffect(() => {
    if (isParent) {
      router.replace("/(tabs)/matches");
    }
  }, [isParent, router]);

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
    const byRatio = Math.round(cardWidth * (4 / 3));
    const fallback = Math.round(screenHeight * 0.58);
    const available =
      cardAreaHeight > 0 ? Math.max(0, cardAreaHeight - 12) : fallback;
    return Math.min(byRatio, available);
  }, [cardAreaHeight, cardWidth, screenHeight]);

  const circleSize = useMemo(() => {
    return Math.min(64, Math.max(52, Math.round(screenWidth * 0.16)));
  }, [screenWidth]);

  const messageHeight = useMemo(
    () => Math.round(circleSize * 0.82),
    [circleSize],
  );
  const actionIconSize = useMemo(
    () => Math.round(circleSize * 0.44),
    [circleSize],
  );

  const handleSwipeLeft = () => {
    setSwipeLock(true);
    const current = discoverItems[currentIndex];
    const targetId = current?.id;
    if (targetId) {
      discoverService.swipe(targetId, "pass").catch(() => {});
    }
    setCurrentIndex((i) => Math.min(i + 1, discoverItems.length));
    setTimeout(() => setSwipeLock(false), 400);
  };

  const handleSwipeRight = useCallback(() => {
    setSwipeLock(true);
    const current = discoverItems[currentIndex];
    const name =
      (current as RecruiterCard)?.name ??
      (current as AthleteProfile)?.name ??
      "";
    const targetId = current?.id;

    if (targetId) {
      discoverService
        .swipe(targetId, "draft")
        .then((res) => {
          if (res.matched) {
            setMatchOverlay({ visible: true, name });
          }
          setSwipesRemaining(res.swipesRemaining);
        })
        .catch(() => {
          // Show match overlay as fallback for demo
          if (!isRecruiter && name) {
            setMatchOverlay({ visible: true, name });
          }
        });
    } else if (!isRecruiter && name) {
      setMatchOverlay({ visible: true, name });
    }

    setCurrentIndex((i) => Math.min(i + 1, discoverItems.length));
    setTimeout(() => setSwipeLock(false), 400);
  }, [discoverItems, currentIndex, isRecruiter]);

  const handleMatchDismiss = useCallback(() => {
    setMatchOverlay({ visible: false, name: "" });
  }, []);

  const handleSendMessage = useCallback(() => {
    // Navigate to matches where the user can start a conversation
    router.push("/(tabs)/matches");
  }, [router]);

  if (!fontsLoaded) return null;
  if (isParent) return null;

  const hasMoreCards = currentIndex < discoverItems.length;
  const remaining = discoverItems.length - currentIndex;
  const stackItems = hasMoreCards
    ? discoverItems.slice(currentIndex, currentIndex + 2).reverse()
    : [];
  const topStackIndex = stackItems.length - 1;
  const parentDiscoverItems = isParent
    ? (discoverItems as RecruiterCard[])
    : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {displayName} 👋</Text>
          <Text style={styles.title}>{discoverTitle}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.notifyButton}
            onPress={() =>
              Alert.alert("Notifications", "No new notifications.")
            }
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={theme.text}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              isRecruiter ? "Find athletes..." : "Find coaches, agents..."
            }
            placeholderTextColor={theme.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={styles.filterButton}
          onPress={() => router.push("/preferences")}
        >
          <Ionicons name="options-outline" size={22} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <View style={[styles.tab, styles.tabActive]}>
          <Text style={styles.tabTextActive}>Discover</Text>
        </View>
        <Pressable
          style={styles.tab}
          onPress={() => router.push("/(tabs)/matches")}
        >
          <Text style={styles.tabText}>
            {isParent ? "Inbox" : "Draft Board"}
          </Text>
        </Pressable>
        {hasMoreCards && !isRecruiter && (
          <View style={styles.cardCounter}>
            <Text style={styles.cardCounterText}>{remaining} left</Text>
          </View>
        )}
      </View>

      {isParent ? (
        <ScrollView
          style={styles.parentDiscoverScroll}
          contentContainerStyle={[
            styles.parentDiscoverContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {managedAthlete ? (
            <View style={styles.parentSummaryCard}>
              <Text style={styles.parentSummaryTitle}>
                Managing {managedAthlete.name}
              </Text>
              <Text style={styles.parentSummarySubtitle}>
                {managedAthlete.sport} • {managedAthlete.position} •{" "}
                {managedAthlete.level}
              </Text>
            </View>
          ) : null}

          <Text style={styles.parentSectionTitle}>Discover Recruiters</Text>

          {parentDiscoverItems.length > 0 ? (
            parentDiscoverItems.map((recruiter) => (
              <View key={recruiter.id} style={styles.parentRecruiterCard}>
                <View style={styles.parentRecruiterTopRow}>
                  <Text style={styles.parentRecruiterName}>
                    {recruiter.name} •{" "}
                    {recruiter.role === "agent" ? "Agent" : "Coach"}
                  </Text>
                  {recruiter.verified && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={semantic.success}
                    />
                  )}
                </View>
                <Text style={styles.parentRecruiterOrg}>
                  {recruiter.organization}
                </Text>
                <View style={styles.parentRecruiterMetaRow}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={theme.textMuted}
                  />
                  <Text style={styles.parentRecruiterMetaText}>
                    {recruiter.location}
                  </Text>
                </View>
                <View style={styles.parentRecruiterTagRow}>
                  {recruiter.tags.slice(0, 2).map((tag) => (
                    <View
                      key={`${recruiter.id}-${tag}`}
                      style={styles.parentTag}
                    >
                      <Text style={styles.parentTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.parentEmptyState}>
              <Ionicons
                name="compass-outline"
                size={46}
                color={theme.textMuted}
              />
              <Text style={styles.parentEmptyTitle}>No recruiters found</Text>
              <Text style={styles.parentEmptySubtitle}>
                Try updating Preferences to widen your distance or country.
              </Text>
              <Pressable
                style={styles.parentAdjustButton}
                onPress={() => router.push("/preferences")}
              >
                <Text style={styles.parentAdjustButtonText}>
                  Adjust Preferences
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.cardsContainer} onLayout={handleCardAreaLayout}>
          {hasMoreCards ? (
            stackItems.map((item, i) => {
              const isTopCard = i === topStackIndex;
              const canSwipe = isTopCard && !swipeLock;
              const isBackCard = !isTopCard;
              return (
                <View
                  key={`${isTopCard ? "top" : "next"}-${item.id}`}
                  style={[
                    styles.cardWrapper,
                    {
                      zIndex: isTopCard ? 2 : 1,
                      opacity: isTopCard ? 1 : 0.92,
                      transform: isBackCard
                        ? [{ scale: 0.96 }, { translateY: 12 }]
                        : [],
                    },
                  ]}
                  pointerEvents={isTopCard ? "auto" : "none"}
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
              <Ionicons
                name="people-outline"
                size={64}
                color={theme.textMuted}
              />
              <Text style={styles.emptyTitle}>You've seen everyone!</Text>
              <Text style={styles.emptySubtitle}>
                Check back later for new{" "}
                {isRecruiter ? "athletes" : "recruiters"}, or widen your search.
              </Text>
              <Pressable
                style={styles.emptyAdjustButton}
                onPress={() => router.push("/preferences")}
              >
                <Ionicons
                  name="options-outline"
                  size={16}
                  color={theme.accentText}
                />
                <Text style={styles.emptyAdjustButtonText}>
                  Adjust Preferences
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {!isParent && hasMoreCards && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.circleButton,
              styles.passButton,
              {
                width: circleSize,
                height: circleSize,
                borderRadius: circleSize / 2,
              },
              pressed && styles.pressed,
            ]}
            onPress={handleSwipeLeft}
          >
            <Ionicons name="close" size={actionIconSize} color={brand.white} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.messageButton,
              { height: messageHeight, borderRadius: messageHeight / 2 },
              pressed && styles.pressed,
            ]}
            onPress={handleSendMessage}
          >
            <Ionicons name="chatbubble-outline" size={20} color={theme.text} />
            <Text style={styles.messageButtonText}>Messages</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.circleButton,
              styles.draftButton,
              {
                width: circleSize,
                height: circleSize,
                borderRadius: circleSize / 2,
              },
              pressed && styles.pressed,
            ]}
            onPress={handleSwipeRight}
          >
            <Ionicons
              name="checkmark"
              size={actionIconSize}
              color={brand.white}
            />
          </Pressable>
        </View>
      )}

      {matchOverlay.visible && (
        <MatchOverlay
          recruiterName={matchOverlay.name}
          onDismiss={handleMatchDismiss}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.headerBg,
  },
  greeting: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  title: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notifyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: theme.headerBg,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: theme.inputText,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: theme.headerBg,
  },
  cardCounter: {
    marginLeft: "auto",
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardCounterText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  parentDiscoverScroll: {
    flex: 1,
  },
  parentDiscoverContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  parentSummaryCard: {
    backgroundColor: brand.primary,
    borderRadius: 14,
    padding: 14,
  },
  parentSummaryTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  parentSummarySubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.9)",
  },
  parentSectionTitle: {
    marginTop: 2,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  parentRecruiterCard: {
    backgroundColor: theme.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 14,
    gap: 6,
  },
  parentRecruiterTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  parentRecruiterName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  parentRecruiterOrg: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  parentRecruiterMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  parentRecruiterMetaText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  parentRecruiterTagRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  parentTag: {
    backgroundColor: theme.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  parentTagText: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  parentEmptyState: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    alignItems: "center",
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  parentEmptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  parentEmptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    lineHeight: 20,
  },
  parentAdjustButton: {
    marginTop: 12,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 18,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  parentAdjustButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: theme.accent,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  tabTextActive: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  cardsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
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
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTag: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cardTagText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily: "Poppins_800ExtraBold",
    letterSpacing: 4,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 40,
  },
  overlayLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  overlayLocationText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.95)",
  },
  overlayNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlayName: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  overlayOrg: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.9)",
    marginTop: 4,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: brand.white,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyAdjustButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.accent,
    borderRadius: 24,
  },
  emptyAdjustButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: theme.accentText,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  circleButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  passButton: {
    backgroundColor: semantic.error,
  },
  messageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
  },
  messageButtonText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  draftButton: {
    backgroundColor: semantic.success,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  // Match celebration overlay
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  matchOverlayInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  matchEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  matchTitle: {
    fontSize: 36,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    textAlign: "center",
  },
  matchSubtitle: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 24,
  },
  matchMessageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 40,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: brand.white,
    borderRadius: 30,
  },
  matchMessageButtonText: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
  matchKeepButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  matchKeepButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
});
