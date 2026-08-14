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
  /**
   * Live deck size on the UI thread. The horizontal browse worklet derives
   * can-go-prev/next from this + focusedIndexSV so it never reads a stale
   * JS-thread boolean (which previously could wrongly block going back).
   */
  totalCountSV: SharedValue<number>;
  onSwipeLeft: () => void; // PASS  — left
  onSwipeRight: () => void; // DRAFT — right
  /** When true, a Draft (up) is blocked: the card snaps back and
   *  onDraftBlocked fires instead. Passing (down) still works. */
  draftLocked?: boolean;
  onDraftBlocked?: () => void;
  goNext: () => void; // browse forward (left swipe)
  goPrev: () => void; // browse backward (right swipe)
  canGoNext: boolean;
  canGoPrev: boolean;
  reducedMotion: boolean;
  trigger?: SwipeTrigger;
  onTriggerHandled?: () => void;
  /** Fired on a clean tap (no drag) of the focused card — opens the full
   *  profile. Composed as a Race with the pans, so a swipe never triggers it. */
  onTap?: () => void;
};

export function useCarouselGesture(args: UseCarouselGestureArgs) {
  const {
    absoluteIndex,
    isFocused,
    canGesture,
    cardHeight,
    slotWidth,
    // Retained on the interface (callers still pass them) but unused since
    // Draft/Pass moved to the horizontal axis and browse-by-drag was removed:
    // screenHeight, totalCountSV, goNext, goPrev.
    screenHeight,
    focusedIndexSV,
    carouselTranslateX,
    totalCountSV,
    onSwipeLeft,
    onSwipeRight,
    draftLocked,
    onDraftBlocked,
    goNext,
    goPrev,
    canGoNext,
    canGoPrev,
    reducedMotion,
    trigger,
    onTriggerHandled,
    onTap,
  } = args;
  // Split enabled flags:
  //  - horizontal browse is alive whenever this card is the committed focus —
  //    NOT gated by canGesture, so rapid flicks aren't held by a settle/lock.
  //  - vertical Draft/Pass keeps the canGesture gate (used by parent for the
  //    swipeLock/out-of-swipes guards).
  // The decision axis keeps the canGesture gate the parent uses for its
  // swipeLock / out-of-swipes guards.
  const decideEnabled = isFocused && (canGesture ?? true);

  // Per-card decision drag. Horizontal, because Draft/Pass commit on the
  // horizontal axis -- see the header note. Distinct from carouselTranslateX,
  // which is the shared rail position for the neighbour filmstrip.
  const decideX = useSharedValue(0);

  const verticalThreshold = Math.min(160, Math.max(110, cardHeight * 0.18));
  // Easier horizontal commit: 25% of a slot OR a velocity flick > 350.
  // Light, quick flicks now advance one card.
  const horizontalThreshold = Math.max(40, slotWidth * 0.25);
  const horizontalVelocity = 350;
  const overlayDivisor = Math.max(80, cardHeight * 0.2);

  // When this card transitions back to focused (e.g. user browsed back to an
  // already-decided card whose translateY was flung off-screen), bring it home.
  useEffect(() => {
    if (isFocused) {
      decideX.value = 0;
    }
  }, [isFocused]);

  // HORIZONTAL = the decision axis. Left commits Pass, right commits Draft.
  //
  // This used to browse the carousel while Draft/Pass lived on the vertical
  // axis. The client asked for left/right on 13 July and every swipe product
  // works this way, so the axes were swapped rather than relabelled -- an
  // earlier attempt changed only the labels, which made the tutorial and the
  // buttons describe a gesture the deck did not have.
  //
  // Browse-without-deciding is gone with it: the two cannot share an axis, and
  // Pass already covers "not this one". handleSwipeLeft/Right advance the
  // focused index themselves, so the deck still moves.
  const horizontalPan = Gesture.Pan()
    .enabled(decideEnabled)
    .activeOffsetX([-20, 20])
    // Cross-axis fail window is deliberately wider (±40) than the activation
    // window (±20) -- a diagonal swipe that crosses ±24 on BOTH axes would
    // otherwise fail both recognizers and drop the gesture entirely.
    .failOffsetY([-40, 40])
    .onUpdate((e) => {
      decideX.value = e.translationX;
    })
    .onEnd((e) => {
      const shouldDraft =
        e.translationX > horizontalThreshold || e.velocityX > 500;
      const shouldPass =
        e.translationX < -horizontalThreshold || e.velocityX < -500;

      if (shouldDraft) {
        runOnJS(lightImpact)();
        if (draftLocked) {
          // Out of Drafts: block the Draft, snap the card back, surface the
          // upgrade CTA. Passing (below) stays free.
          if (onDraftBlocked) runOnJS(onDraftBlocked)();
          decideX.value = withSpring(0, { damping: 15 });
        } else {
          // Advance the index NOW -- the new card becomes focused/interactive
          // on the JS thread immediately, while the old card's decideX
          // continues animating off-screen on the UI thread.
          runOnJS(onSwipeRight)();
          decideX.value = reducedMotion
            ? withTiming(slotWidth * 0.6, { duration: 180 })
            : withSpring(slotWidth * 1.8, { damping: 22, stiffness: 200 });
        }
      } else if (shouldPass) {
        runOnJS(lightImpact)();
        runOnJS(onSwipeLeft)();
        decideX.value = reducedMotion
          ? withTiming(-slotWidth * 0.6, { duration: 180 })
          : withSpring(-slotWidth * 1.8, { damping: 22, stiffness: 200 });
      } else {
        decideX.value = withSpring(0, { damping: 15 });
      }
    });

  // Tap the focused card to open the full profile. maxDistance keeps a drag
  // from ever registering as a tap; Race lets the pans win the moment the
  // finger moves past their activation offset.
  const tap = Gesture.Tap()
    .enabled(isFocused && !!onTap)
    .maxDuration(300)
    .maxDistance(12)
    .onEnd((_e, success) => {
      if (success && onTap) runOnJS(onTap)();
    });

  const gesture = Gesture.Race(horizontalPan, tap);

  // Button-driven trigger (draft/pass). Same instant-advance pattern as the
  // gesture path: kick the index over right away so the next card is alive.
  useEffect(() => {
    if (!isFocused || !trigger) return;
    onTriggerHandled?.();
    lightImpact();
    const isDraft = trigger === "draft";
    if (isDraft && draftLocked) {
      // Out of Drafts — surface the upgrade CTA instead of drafting.
      onDraftBlocked?.();
      return;
    }
    if (isDraft) onSwipeRight();
    else onSwipeLeft();
    if (reducedMotion) {
      decideX.value = withTiming(
        isDraft ? slotWidth * 0.6 : -slotWidth * 0.6,
        { duration: 180 },
      );
    } else {
      decideX.value = withSpring(
        isDraft ? slotWidth * 1.8 : -slotWidth * 1.8,
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
    const flinging = !isFocused && Math.abs(decideX.value) > 8;
    const visualDistance = flinging ? 0 : slotDistance;
    const normalized = Math.min(1, Math.abs(visualDistance) / slotWidth);
    // Neighbours land at scale 0.9 / opacity 0.55; centre at 1 / 1.
    const baseScale = 1 - 0.1 * normalized;
    const baseOpacity = 1 - 0.45 * normalized;
    const drag = Math.abs(decideX.value);
    const dragScale = reducedMotion ? 1 : 1 - Math.min(drag / 1400, 0.04);

    // Single-threshold flip: the card crossing the half-slot mark takes the
    // top stacking BEFORE commit. One discrete flip per card keeps Android
    // view-reorder cost minimal (continuous zIndex on the UI thread can
    // cause flicker on some devices).
    const isVisuallyCentered = Math.abs(visualDistance) < slotWidth / 2;

    return {
      transform: [
        // Slot position for the filmstrip, plus this card's own decision drag.
        // A card mid-fling is no longer the focus, so its slot offset is
        // suppressed and only the fling remains -- otherwise the rail would
        // yank it sideways as it leaves.
        { translateX: (flinging ? 0 : slotDistance) + decideX.value },
        { rotate: `${(decideX.value / slotWidth) * 8}deg` },
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
    const flinging = !isFocused && Math.abs(decideX.value) > 8;
    const visualDistance = flinging ? 0 : slotDistance;
    const normalized = Math.min(1, Math.abs(visualDistance) / slotWidth);
    return { opacity: normalized };
  });

  // DRAFT stamps on a right drag, PASS on a left one.
  const draftOverlayStyle = useAnimatedStyle(() => ({
    opacity: isFocused
      ? Math.min(decideX.value / overlayDivisor, 1) * 0.9
      : 0,
  }));

  const passOverlayStyle = useAnimatedStyle(() => ({
    opacity: isFocused
      ? Math.min(-decideX.value / overlayDivisor, 1) * 0.9
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
