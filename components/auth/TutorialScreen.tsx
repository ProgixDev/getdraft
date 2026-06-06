import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Dimensions,
  FlatList,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import { brand, neutral } from "@/config/colors";

const { width, height } = Dimensions.get("window");

interface TutorialScreenProps {
  onComplete: () => void;
}

interface TutorialSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const tutorialSlides: TutorialSlide[] = [
  {
    id: "1",
    icon: "heart",
    title: "Swipe Right to Like",
    description:
      "When you see a profile you're interested in, swipe right or tap the heart to show your interest.",
  },
  {
    id: "2",
    icon: "close",
    title: "Swipe Left to Pass",
    description:
      "Not a match? Swipe left or tap the X to pass and move on to the next profile.",
  },
  {
    id: "3",
    icon: "people",
    title: "It's a Match!",
    description:
      "When both you and another user like each other, it's a match! You'll both be notified.",
  },
  {
    id: "4",
    icon: "chatbubbles",
    title: "Start Conversations",
    description:
      "Once matched, start a conversation and take your connection to the next level.",
  },
];

export const TutorialScreen: React.FC<TutorialScreenProps> = ({
  onComplete,
}) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentIndex < tutorialSlides.length - 1) {
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex });
      setCurrentIndex(nextIndex);
    } else {
      onComplete();
    }
  };

  const handleScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const renderSlide = ({
    item,
    index,
  }: {
    item: TutorialSlide;
    index: number;
  }) => (
    <View style={styles.slide}>
      <Animated.View
        entering={FadeIn.duration(600)}
        style={styles.iconContainer}
      >
        <Ionicons name={item.icon} size={80} color={brand.primary} />
      </Animated.View>
      <Animated.Text
        entering={FadeInDown.duration(600).delay(200)}
        style={styles.title}
      >
        {item.title}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.duration(600).delay(300)}
        style={styles.description}
      >
        {item.description}
      </Animated.Text>
    </View>
  );

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.headerTitle}>How Matching Works</Text>

        <FlatList
          ref={flatListRef}
          data={tutorialSlides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
        />

        <View style={styles.footer}>
          <View style={styles.dots}>
            {tutorialSlides.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === currentIndex && styles.dotActive]}
              />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleNext}
          >
            <LinearGradient
              colors={[brand.white, brand.white]}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>
                {currentIndex < tutorialSlides.length - 1
                  ? "Next"
                  : "Start Swiping!"}
              </Text>
              <Ionicons
                name={
                  currentIndex < tutorialSlides.length - 1
                    ? "arrow-forward"
                    : "rocket"
                }
                size={22}
                color={brand.primary}
              />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 80,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    textAlign: "center",
    marginBottom: 40,
  },
  slide: {
    width: width,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.white,
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255, 255, 255, 0.95)",
    textAlign: "center",
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 50,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  dotActive: {
    backgroundColor: brand.white,
    width: 24,
  },
  button: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  buttonGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
});
