import { useEffect } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const lightImpact = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export type SwipeTrigger = "draft" | "pass" | null;

export type UseCarouselGestureArgs = {
  absoluteIndex: number;
  isFocused: boolean;
  /**
   * Whether the gesture should be enabled for the focused card. Defaults to
   * `isFocused`. Pass `false` to keep the card visually focused but block
   * input (e.g. during swipeLock or out-of-swipes).
   */
  canGesture?: boolean;
  cardHeight: number;
  slotWidth: number;
  screenHeight: number;
  /**
   * Parent-owned SharedValue mirroring focusedIndex. Used by the worklet so
   * commit (focused-index advance + translateX reset) updates atomically on
   * the UI thread, avoiding a 1-frame layout flicker.
   */
  focusedIndexSV: SharedValue<number>;
  carouselTranslateX: SharedValue<number>;
  onSwipeLeft: () => void; // PASS (down)
  onSwipeRight: () => void; // DRAFT (up)
  goNext: () => void; // browse forward (left swipe)
  goPrev: () => void; // browse backward (right swipe)
  canGoNext: boolean;
  canGoPrev: boolean;
  reducedMotion: boolean;
  trigger?: SwipeTrigger;
  onTriggerHandled?: () => void;
};

export function useCarouselGesture(args: UseCarouselGestureArgs) {
  const {
    absoluteIndex,
    isFocused,
    canGesture,
    cardHeight,
    slotWidth,
    screenHeight,
    focusedIndexSV,
    carouselTranslateX,
    onSwipeLeft,
    onSwipeRight,
    goNext,
    goPrev,
    canGoNext,
    canGoPrev,
    reducedMotion,
    trigger,
    onTriggerHandled,
  } = args;
  const gestureEnabled = isFocused && (canGesture ?? true);

  const translateY = useSharedValue(0);
  const verticalThreshold = Math.min(160, Math.max(110, cardHeight * 0.18));
  const horizontalThreshold = Math.max(60, slotWidth * 0.28);
  const overlayDivisor = Math.max(80, cardHeight * 0.2);

  // When this card transitions back to focused (e.g. user browsed back to an
  // already-decided card whose translateY was flung off-screen), bring it home.
  useEffect(() => {
    if (isFocused) {
      translateY.value = 0;
    }
  }, [isFocused]);

  const horizontalPan = Gesture.Pan()
    .enabled(gestureEnabled)
    .activeOffsetX([-20, 20])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      let dx = e.translationX;
      if (!canGoPrev && dx > 0) dx = dx * 0.3;
      if (!canGoNext && dx < 0) dx = dx * 0.3;
      carouselTranslateX.value = dx;
    })
    .onEnd((e) => {
      const dx = e.translationX;
      const shouldNext =
        canGoNext && (dx < -horizontalThreshold || e.velocityX < -500);
      const shouldPrev =
        canGoPrev && (dx > horizontalThreshold || e.velocityX > 500);

      if (shouldNext) {
        runOnJS(lightImpact)();
        if (reducedMotion) {
          carouselTranslateX.value = withTiming(
            -slotWidth,
            { duration: 180 },
            (f) => {
              if (f) runOnJS(goNext)();
            },
          );
        } else {
          carouselTranslateX.value = withSpring(
            -slotWidth,
            { damping: 18, stiffness: 220 },
            (f) => {
              if (f) runOnJS(goNext)();
            },
          );
        }
      } else if (shouldPrev) {
        runOnJS(lightImpact)();
        if (reducedMotion) {
          carouselTranslateX.value = withTiming(
            slotWidth,
            { duration: 180 },
            (f) => {
              if (f) runOnJS(goPrev)();
            },
          );
        } else {
          carouselTranslateX.value = withSpring(
            slotWidth,
            { damping: 18, stiffness: 220 },
            (f) => {
              if (f) runOnJS(goPrev)();
            },
          );
        }
      } else {
        carouselTranslateX.value = withSpring(0, { damping: 18 });
      }
    });

  const verticalPan = Gesture.Pan()
    .enabled(gestureEnabled)
    .activeOffsetY([-20, 20])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const shouldDraft =
        e.translationY < -verticalThreshold || e.velocityY < -500;
      const shouldPass =
        e.translationY > verticalThreshold || e.velocityY > 500;

      if (shouldDraft) {
        runOnJS(lightImpact)();
        // Advance the index NOW — the new card becomes focused/interactive
        // on the JS thread immediately, while the old card's translateY
        // continues animating off-screen on the UI thread.
        runOnJS(onSwipeRight)();
        if (reducedMotion) {
          translateY.value = withTiming(-screenHeight * 0.3, { duration: 180 });
        } else {
          translateY.value = withSpring(-screenHeight * 1.2, {
            damping: 22,
            stiffness: 200,
          });
        }
      } else if (shouldPass) {
        runOnJS(lightImpact)();
        runOnJS(onSwipeLeft)();
        if (reducedMotion) {
          translateY.value = withTiming(screenHeight * 0.3, { duration: 180 });
        } else {
          translateY.value = withSpring(screenHeight * 1.2, {
            damping: 22,
            stiffness: 200,
          });
        }
      } else {
        translateY.value = withSpring(0, { damping: 15 });
      }
    });

  const gesture = Gesture.Race(horizontalPan, verticalPan);

  // Button-driven trigger (draft/pass). Same instant-advance pattern as the
  // gesture path: kick the index over right away so the next card is alive.
  useEffect(() => {
    if (!isFocused || !trigger) return;
    onTriggerHandled?.();
    lightImpact();
    const isDraft = trigger === "draft";
    if (isDraft) onSwipeRight();
    else onSwipeLeft();
    if (reducedMotion) {
      translateY.value = withTiming(
        isDraft ? -screenHeight * 0.3 : screenHeight * 0.3,
        { duration: 180 },
      );
    } else {
      translateY.value = withSpring(
        isDraft ? -screenHeight * 1.2 : screenHeight * 1.2,
        { damping: 22, stiffness: 200 },
      );
    }
  }, [trigger, isFocused]);

  // Unified per-card style.
  // distance = (absoluteIndex - focusedIndex) * slot + carouselTranslateX.
  // - translateX = distance (so focused at 0 when drag is 0; neighbors at ±slot)
  // - scale/opacity interpolate by |distance| / slot
  // - focused additionally applies translateY (vertical drag/fling) and a tiny drag scale
  // We include translateY in BOTH branches so a just-decided card that's now
  // a neighbor stays off-screen instead of snapping back into the prev slot.
  const cardAnimStyle = useAnimatedStyle(() => {
    const slotDistance =
      (absoluteIndex - focusedIndexSV.value) * slotWidth +
      carouselTranslateX.value;
    // A just-swiped card has its translateY mid-flight and (post-commit) is no
    // longer focused. The index has already advanced on the JS thread, so the
    // slot math would yank its translateX by -slotWidth — making it appear to
    // snap sideways while it's still flying off-screen vertically. While the
    // card is meaningfully off-center vertically, freeze translateX at 0 so it
    // travels straight up/down. As the user starts a new gesture on the new
    // focused card, translateY here stays put (off-screen) and the visual is
    // clean.
    const flinging = !isFocused && Math.abs(translateY.value) > 8;
    const distance = flinging ? carouselTranslateX.value : slotDistance;
    const normalized = Math.min(1, Math.abs(slotDistance) / slotWidth);
    const baseScale = 1 - 0.14 * normalized;
    const baseOpacity = 1 - 0.5 * normalized;
    const drag = Math.abs(translateY.value);
    const dragScale = reducedMotion ? 1 : 1 - Math.min(drag / 1400, 0.04);

    return {
      transform: [
        { translateX: distance },
        { translateY: translateY.value },
        { scale: isFocused ? baseScale * dragScale : baseScale },
      ],
      opacity: isFocused ? 1 : baseOpacity,
    };
  });

  const draftOverlayStyle = useAnimatedStyle(() => ({
    opacity: isFocused
      ? Math.min(-translateY.value / overlayDivisor, 1) * 0.9
      : 0,
  }));

  const passOverlayStyle = useAnimatedStyle(() => ({
    opacity: isFocused
      ? Math.min(translateY.value / overlayDivisor, 1) * 0.9
      : 0,
  }));

  return {
    gesture,
    cardAnimStyle,
    draftOverlayStyle,
    passOverlayStyle,
  };
}
