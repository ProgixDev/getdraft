import { useEffect } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
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
  // Split enabled flags:
  //  - horizontal browse is alive whenever this card is the committed focus —
  //    NOT gated by canGesture, so rapid flicks aren't held by a settle/lock.
  //  - vertical Draft/Pass keeps the canGesture gate (used by parent for the
  //    swipeLock/out-of-swipes guards).
  const horizontalEnabled = isFocused;
  const verticalEnabled = isFocused && (canGesture ?? true);

  const translateY = useSharedValue(0);
  // Baseline captured at each new pan start so a gesture begun mid-settle
  // picks up from the current animated position with no jump.
  const horizontalStartTx = useSharedValue(0);

  const verticalThreshold = Math.min(160, Math.max(110, cardHeight * 0.18));
  // Easier horizontal commit: 25% of a slot OR a velocity flick > 350.
  // Light, quick flicks now advance one card.
  const horizontalThreshold = Math.max(40, slotWidth * 0.25);
  const horizontalVelocity = 350;
  const overlayDivisor = Math.max(80, cardHeight * 0.2);

  // Fast, crisp settle — lands in ~160-200ms with no soft overshoot.
  const fastSpring = { damping: 24, stiffness: 280, mass: 0.6 } as const;
  const fastTiming = { duration: 160, easing: Easing.out(Easing.cubic) };

  // When this card transitions back to focused (e.g. user browsed back to an
  // already-decided card whose translateY was flung off-screen), bring it home.
  useEffect(() => {
    if (isFocused) {
      translateY.value = 0;
    }
  }, [isFocused]);

  const horizontalPan = Gesture.Pan()
    .enabled(horizontalEnabled)
    .activeOffsetX([-20, 20])
    .failOffsetY([-24, 24])
    .onStart(() => {
      // Interruptible carousel: pick up from wherever the previous animation
      // left off. Direct writes to carouselTranslateX in onUpdate also
      // implicitly cancel any in-flight spring/timing.
      horizontalStartTx.value = carouselTranslateX.value;
    })
    .onUpdate((e) => {
      let dx = e.translationX;
      if (!canGoPrev && dx > 0) dx = dx * 0.3;
      if (!canGoNext && dx < 0) dx = dx * 0.3;
      carouselTranslateX.value = horizontalStartTx.value + dx;
    })
    .onEnd((e) => {
      const dx = e.translationX;
      const shouldNext =
        canGoNext &&
        (dx < -horizontalThreshold || e.velocityX < -horizontalVelocity);
      const shouldPrev =
        canGoPrev &&
        (dx > horizontalThreshold || e.velocityX > horizontalVelocity);

      if (shouldNext) {
        runOnJS(lightImpact)();
        // EAGER COMMIT: advance focus on the UI thread NOW so the new centre
        // card is gesture-live (its slot math uses focusedIndexSV directly).
        // Compensate carouselTranslateX by +slot so the visual position is
        // identical at the commit instant, then spring it to 0. React state
        // catches up on the same tick via runOnJS(goNext).
        focusedIndexSV.value = focusedIndexSV.value + 1;
        carouselTranslateX.value = carouselTranslateX.value + slotWidth;
        runOnJS(goNext)();
        carouselTranslateX.value = reducedMotion
          ? withTiming(0, fastTiming)
          : withSpring(0, fastSpring);
      } else if (shouldPrev) {
        runOnJS(lightImpact)();
        focusedIndexSV.value = focusedIndexSV.value - 1;
        carouselTranslateX.value = carouselTranslateX.value - slotWidth;
        runOnJS(goPrev)();
        carouselTranslateX.value = reducedMotion
          ? withTiming(0, fastTiming)
          : withSpring(0, fastSpring);
      } else {
        carouselTranslateX.value = reducedMotion
          ? withTiming(0, fastTiming)
          : withSpring(0, fastSpring);
      }
    });

  const verticalPan = Gesture.Pan()
    .enabled(verticalEnabled)
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

  // Unified per-card style — emphasis (scale/opacity/zIndex/elevation) all
  // driven off the LIVE on-screen position so the centre card never "pops" at
  // commit. The card crossing toward the centre rises and sharpens in step
  // with the finger; the card sliding away dims and drops back.
  //
  // slotDistance = (absoluteIndex - focusedIndex) * slot + carouselTranslateX
  //               i.e. the live x-offset from the visual centre.
  //
  // A just-decided card that's mid-fling vertically is no longer the committed
  // focus, but visually it sits at x=0 while flying up/down — so we treat it
  // as visually centred (visualDistance = 0) for emphasis. Otherwise the slot
  // math would yank its translateX by ±slot and dim it as it leaves, which
  // looks wrong.
  const cardAnimStyle = useAnimatedStyle(() => {
    const slotDistance =
      (absoluteIndex - focusedIndexSV.value) * slotWidth +
      carouselTranslateX.value;
    const flinging = !isFocused && Math.abs(translateY.value) > 8;
    const visualDistance = flinging ? 0 : slotDistance;
    const normalized = Math.min(1, Math.abs(visualDistance) / slotWidth);
    // Neighbours land at scale 0.9 / opacity 0.55; centre at 1 / 1.
    const baseScale = 1 - 0.1 * normalized;
    const baseOpacity = 1 - 0.45 * normalized;
    const drag = Math.abs(translateY.value);
    const dragScale = reducedMotion ? 1 : 1 - Math.min(drag / 1400, 0.04);

    // Single-threshold flip: the card crossing the half-slot mark takes the
    // top stacking BEFORE commit. One discrete flip per card keeps Android
    // view-reorder cost minimal (continuous zIndex on the UI thread can
    // cause flicker on some devices).
    const isVisuallyCentered = Math.abs(visualDistance) < slotWidth / 2;

    return {
      transform: [
        { translateX: flinging ? 0 : slotDistance },
        { translateY: translateY.value },
        { scale: baseScale * dragScale },
      ],
      opacity: baseOpacity,
      zIndex: isVisuallyCentered ? 10 : 1,
      elevation: isVisuallyCentered ? 14 : 0,
    };
  });

  // Blur overlay opacity, driven off the same live visual distance — centre
  // card renders at 0 (no blur), neighbours at 1 (full blur), interpolated
  // continuously through a swipe so there's no snap on commit.
  const blurOverlayStyle = useAnimatedStyle(() => {
    const slotDistance =
      (absoluteIndex - focusedIndexSV.value) * slotWidth +
      carouselTranslateX.value;
    const flinging = !isFocused && Math.abs(translateY.value) > 8;
    const visualDistance = flinging ? 0 : slotDistance;
    const normalized = Math.min(1, Math.abs(visualDistance) / slotWidth);
    return { opacity: normalized };
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
    blurOverlayStyle,
    draftOverlayStyle,
    passOverlayStyle,
  };
}
