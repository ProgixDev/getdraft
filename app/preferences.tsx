import React, { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDispatch, useSelector } from "react-redux";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { brand, neutral, theme } from "@/config/colors";
import { SPORTS_WITH_POSITIONS } from "@/constants/sportsData";
import { getCitiesForCountry } from "@/constants/citiesData";
import { findCountryByName } from "@/constants/countryData";
import { RootState } from "@/store";
import {
  DiscoverPreferences,
  resetDiscoverPreferences,
  setDiscoverPreferences,
} from "@/store/slices/discoverPreferencesSlice";

// Cap the picker list so a long location list scrolls inside the sheet instead
// of overflowing past the bottom edge (where it was previously cut off).
const SCREEN_HEIGHT = Dimensions.get("window").height;
const LIST_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);

const DISTANCE_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any", value: null },
  { label: "25 km", value: 25 },
  { label: "50 km", value: 50 },
  { label: "100 km", value: 100 },
  { label: "250 km", value: 250 },
  { label: "500 km", value: 500 },
  { label: "1000 km", value: 1000 },
];

const RECRUITER_TYPE_OPTIONS = [
  { label: "All Recruiters", value: "all" as const },
  { label: "Agents", value: "agent" as const },
  { label: "Coaches", value: "coach" as const },
];

type SelectorKey =
  | "sport"
  | "position"
  | "level"
  | "recruiterType"
  | "city"
  | null;

interface PickerOption {
  label: string;
  value: string;
}

function SelectorRow({
  icon,
  label,
  value,
  onPress,
  helperText,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
  helperText?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectorRow,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.selectorIconWrap}>
        <Ionicons name={icon} size={18} color={theme.text} />
      </View>
      <View style={styles.selectorContent}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <Text style={styles.selectorValue}>{value}</Text>
        {helperText ? (
          <Text style={styles.selectorHelper}>{helperText}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </Pressable>
  );
}

function OptionPickerModal({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
  emptyHint,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  emptyHint?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView
            style={[styles.modalOptions, { maxHeight: LIST_MAX_HEIGHT }]}
            contentContainerStyle={styles.modalOptionsContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {emptyHint && options.length <= 1 ? (
              <Text style={styles.modalEmptyHint}>{emptyHint}</Text>
            ) : null}
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    selected && styles.modalOptionSelected,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => onSelect(option.value)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      selected && styles.modalOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={theme.accentText}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function PreferencesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const preferences = useSelector(
    (state: RootState) => state.discoverPreferences,
  );
  const [activeModal, setActiveModal] = useState<SelectorKey>(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const isRecruiter = user?.role === "recruiter" || user?.role === "coach";

  const sportOptions = useMemo<PickerOption[]>(
    () => [
      { label: "All Sports", value: "all" },
      ...SPORTS_WITH_POSITIONS.map((sport) => ({
        label: sport.name,
        value: sport.name,
      })),
    ],
    [],
  );

  const selectedSport = useMemo(
    () =>
      SPORTS_WITH_POSITIONS.find((sport) => sport.name === preferences.sport),
    [preferences.sport],
  );

  const athletePositionOptions = useMemo<PickerOption[]>(() => {
    if (!selectedSport || preferences.sport === "all") {
      return [{ label: "Any Position", value: "all" }];
    }

    return [
      { label: "Any Position", value: "all" },
      ...selectedSport.positions.map((position) => ({
        label: position,
        value: position,
      })),
    ];
  }, [preferences.sport, selectedSport]);

  const athleteLevelOptions = useMemo<PickerOption[]>(() => {
    if (!selectedSport || preferences.sport === "all") {
      return [{ label: "Any Athletic Level", value: "all" }];
    }

    return [
      { label: "Any Athletic Level", value: "all" },
      ...selectedSport.levels.map((level) => ({ label: level, value: level })),
    ];
  }, [preferences.sport, selectedSport]);

  const cityOptions = useMemo<PickerOption[]>(() => {
    const countryCode = findCountryByName(preferences.country)?.code ?? "";
    const cities = getCitiesForCountry(countryCode);
    return [
      { label: "Any City", value: "" },
      ...cities.map((city) => ({ label: city, value: city })),
    ];
  }, [preferences.country]);

  const selectorTitle = useMemo(() => {
    if (activeModal === "sport") return "Select Sport";
    if (activeModal === "position") return "Select Position";
    if (activeModal === "level") return "Select Athletic Level";
    if (activeModal === "recruiterType") return "Select Recruiter Type";
    if (activeModal === "city") return "Select City";
    return "";
  }, [activeModal]);

  const selectorOptions = useMemo<PickerOption[]>(() => {
    if (activeModal === "sport") return sportOptions;
    if (activeModal === "position") return athletePositionOptions;
    if (activeModal === "level") return athleteLevelOptions;
    if (activeModal === "recruiterType") {
      return RECRUITER_TYPE_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      }));
    }
    if (activeModal === "city") return cityOptions;
    return [];
  }, [
    activeModal,
    athleteLevelOptions,
    athletePositionOptions,
    cityOptions,
    sportOptions,
  ]);

  const selectorValue = useMemo(() => {
    if (activeModal === "sport") return preferences.sport;
    if (activeModal === "position") return preferences.athletePosition;
    if (activeModal === "level") return preferences.athleteLevel;
    if (activeModal === "recruiterType") return preferences.recruiterType;
    if (activeModal === "city") return preferences.city;
    return "";
  }, [activeModal, preferences]);

  const setPreferences = (patch: Partial<DiscoverPreferences>) => {
    dispatch(setDiscoverPreferences({ ...preferences, ...patch }));
  };

  const handleSelectFromModal = (value: string) => {
    if (activeModal === "sport") {
      setPreferences({
        sport: value,
        athletePosition: "all",
        athleteLevel: "all",
      });
      setActiveModal(null);
      return;
    }

    if (activeModal === "position") {
      setPreferences({ athletePosition: value });
      setActiveModal(null);
      return;
    }

    if (activeModal === "level") {
      setPreferences({ athleteLevel: value });
      setActiveModal(null);
      return;
    }

    if (activeModal === "recruiterType") {
      setPreferences({
        recruiterType: value as DiscoverPreferences["recruiterType"],
      });
      setActiveModal(null);
      return;
    }

    if (activeModal === "city") {
      setPreferences({ city: value });
      setActiveModal(null);
    }
  };

  const selectedRecruiterTypeLabel =
    RECRUITER_TYPE_OPTIONS.find(
      (option) => option.value === preferences.recruiterType,
    )?.label ?? "All Recruiters";

  const selectedCityLabel =
    preferences.city !== "" ? preferences.city : "Any City";

  const selectedSportLabel =
    sportOptions.find((option) => option.value === preferences.sport)?.label ??
    "All Sports";
  const selectedPositionLabel =
    athletePositionOptions.find(
      (option) => option.value === preferences.athletePosition,
    )?.label ?? "Any Position";
  const selectedLevelLabel =
    athleteLevelOptions.find(
      (option) => option.value === preferences.athleteLevel,
    )?.label ?? "Any Athletic Level";

  const handleReset = () => {
    Alert.alert(
      "Reset filters?",
      "This restores every discovery filter to its default.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => dispatch(resetDiscoverPreferences()),
        },
      ],
    );
  };

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Discovery Preferences</Text>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 116 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Tune Your Feed</Text>
          <Text style={styles.heroSubtitle}>
            Adjust location, sport, and profile filters to match your exact
            recruiting target.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Distance</Text>
          <Text style={styles.sectionSubtitle}>
            Maximum distance from your selected country.
          </Text>
          <View style={styles.chipsRow}>
            {DISTANCE_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                style={({ pressed }) => [
                  styles.distanceChip,
                  preferences.distanceKm === option.value &&
                    styles.distanceChipActive,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => setPreferences({ distanceKm: option.value })}
              >
                <Text
                  style={[
                    styles.distanceChipText,
                    preferences.distanceKm === option.value &&
                      styles.distanceChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <SelectorRow
            icon="globe-outline"
            label="Country"
            value={preferences.country}
            helperText="Tap to open globe country selector"
            onPress={() => router.push("/preferences-country")}
          />
          <SelectorRow
            icon="location-outline"
            label="City"
            value={selectedCityLabel}
            helperText={
              preferences.city === ""
                ? "Showing all cities in selected country"
                : undefined
            }
            onPress={() => setActiveModal("city")}
          />
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>
                International Opportunities
              </Text>
              <Text style={styles.switchSubtitle}>
                Include profiles from any country, not only your selected
                country.
              </Text>
            </View>
            <Switch
              value={preferences.includeInternational}
              onValueChange={(value) =>
                setPreferences({ includeInternational: value })
              }
              trackColor={{ false: theme.borderLight, true: brand.primary }}
              thumbColor={brand.white}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sport & Role Filters</Text>
          <SelectorRow
            icon="football-outline"
            label="Sport"
            value={selectedSportLabel}
            onPress={() => setActiveModal("sport")}
          />

          {isRecruiter ? (
            <>
              <SelectorRow
                icon="body-outline"
                label="Position"
                value={selectedPositionLabel}
                helperText={
                  preferences.sport === "all"
                    ? "Pick a sport first for specific positions"
                    : undefined
                }
                onPress={() => setActiveModal("position")}
              />
              <SelectorRow
                icon="ribbon-outline"
                label="Athletic Level"
                value={selectedLevelLabel}
                helperText={
                  preferences.sport === "all"
                    ? "Pick a sport first for sport-specific levels"
                    : undefined
                }
                onPress={() => setActiveModal("level")}
              />
            </>
          ) : (
            <>
              <SelectorRow
                icon="briefcase-outline"
                label="Recruiter Type"
                value={selectedRecruiterTypeLabel}
                onPress={() => setActiveModal("recruiterType")}
              />
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>
                    Verified Recruiters Only
                  </Text>
                  <Text style={styles.switchSubtitle}>
                    Hide recruiter profiles that are not verified.
                  </Text>
                </View>
                <Switch
                  value={preferences.verifiedRecruitersOnly}
                  onValueChange={(value) =>
                    setPreferences({ verifiedRecruitersOnly: value })
                  }
                  trackColor={{ false: theme.borderLight, true: brand.primary }}
                  thumbColor={brand.white}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.resetButton,
            pressed && styles.rowPressed,
          ]}
          onPress={handleReset}
        >
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.applyButton,
            pressed && styles.rowPressed,
          ]}
          onPress={() => router.back()}
        >
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </Pressable>
      </View>

      <OptionPickerModal
        visible={activeModal !== null}
        title={selectorTitle}
        options={selectorOptions}
        selectedValue={selectorValue}
        onClose={() => setActiveModal(null)}
        onSelect={handleSelectFromModal}
        emptyHint={
          activeModal === "city"
            ? "No cities to show yet. Pick a country first to see its cities here."
            : undefined
        }
      />
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerButton: {
    width: 64,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  doneText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  title: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  heroCard: {
    backgroundColor: brand.primary,
    borderRadius: 18,
    padding: 16,
  },
  heroTitle: {
    fontSize: 19,
    fontFamily: "Poppins_700Bold",
    color: brand.white,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
    color: "rgba(255,255,255,0.92)",
  },
  section: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  sectionSubtitle: {
    marginTop: -6,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  distanceChip: {
    borderWidth: 1,
    borderColor: theme.borderLight,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.surface,
  },
  distanceChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  distanceChipText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  distanceChipTextActive: {
    color: theme.accentText,
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.surface,
  },
  selectorIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  selectorContent: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: theme.textSecondary,
  },
  selectorValue: {
    marginTop: 1,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  selectorHelper: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.surface,
  },
  switchCopy: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  switchSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
    color: theme.textSecondary,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.headerBg,
    // Lift the bar off the content so the action buttons read clearly.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  resetButton: {
    width: 108,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  resetButtonText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: theme.text,
  },
  applyButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent,
    // Make the primary CTA pop against the footer bar.
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  applyButtonText: {
    fontSize: 15,
    fontFamily: "Poppins_700Bold",
    color: theme.accentText,
  },
  rowPressed: {
    opacity: 0.85,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    maxHeight: "82%",
    backgroundColor: theme.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: theme.text,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  modalOptions: {
    marginTop: 4,
  },
  modalOptionsContent: {
    paddingBottom: 8,
  },
  modalEmptyHint: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Poppins_400Regular",
    color: theme.textMuted,
    textAlign: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  modalOptionSelected: {
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  modalOptionText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    color: theme.text,
  },
  modalOptionTextSelected: {
    color: theme.accentText,
  },
});
