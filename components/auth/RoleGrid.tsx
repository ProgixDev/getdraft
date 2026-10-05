import React from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { PHONE_MAX_WIDTH } from "@/lib/responsive";
import { brand, neutral } from "@/config/colors";
import type { UserRole } from "@/lib/roles";

// Phone-width app frame, not the raw window (tablets are wider than the frame).
const width = Math.min(Dimensions.get("window").width, PHONE_MAX_WIDTH);

/** The account types a person can sign up as (admins are created by hand). */
export type SignupRole = Exclude<UserRole, "admin">;

interface RoleOption {
  id: SignupRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  caption: string;
  description: string;
}

const roleOptions: RoleOption[] = [
  {
    id: "athlete",
    label: "Player",
    icon: "trophy",
    caption: "Athlete",
    description: "Showcase your talent",
  },
  {
    id: "parent",
    label: "Parent",
    icon: "people",
    caption: "Guardian",
    description: "Manage your athlete's journey",
  },
  {
    id: "coach",
    label: "Coach",
    icon: "clipboard",
    // Not "Team Staff": a club signing up must not mistake this card for
    // the Team / Club one below.
    caption: "Coaching Staff",
    description: "Scout for talent",
  },
  {
    id: "recruiter",
    label: "Agent",
    icon: "business",
    caption: "Professional",
    description: "Discover athletes",
  },
];

// The fifth account type. An organisation rather than a person, so it gets
// its own full-width row under the 2x2 grid instead of a lone half card.
const teamOption: RoleOption = {
  id: "team",
  label: "Team / Club",
  icon: "shield",
  caption: "Organisation",
  description: "Clubs, schools & academies",
};

interface RoleCardProps {
  option: RoleOption;
  isActive: boolean;
  onPress: () => void;
  /** Full-width row: icon on the left, texts on the right. */
  wide?: boolean;
}

const RoleCard: React.FC<RoleCardProps> = ({
  option,
  isActive,
  onPress,
  wide,
}) => {
  const texts = (
    <>
      <Text
        style={[
          styles.roleLabel,
          wide && styles.roleLabelWide,
          isActive && styles.roleLabelActive,
        ]}
      >
        {option.label}
      </Text>
      <Text
        style={[
          styles.roleDescription,
          wide && styles.roleDescriptionWide,
          isActive && styles.roleDescriptionActive,
        ]}
      >
        {option.description}
      </Text>
      <Text style={[styles.roleCaption, isActive && styles.roleCaptionActive]}>
        {option.caption}
      </Text>
    </>
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.roleCard,
        wide && styles.roleCardWide,
        isActive && styles.roleCardActive,
        pressed && styles.roleCardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${option.label}, ${option.caption}. ${option.description}`}
    >
      <View
        style={[
          styles.roleIconContainer,
          wide && styles.roleIconContainerWide,
          isActive && styles.roleIconContainerActive,
        ]}
      >
        <Ionicons
          name={option.icon}
          size={24}
          color={isActive ? brand.white : brand.primary}
        />
      </View>
      {wide ? <View style={styles.roleTextsWide}>{texts}</View> : texts}
    </Pressable>
  );
};

interface RoleGridProps {
  value: SignupRole;
  onChange: (role: SignupRole) => void;
  /**
   * Whether to offer Team / Club. Comes from the server (useTeamRoleEnabled),
   * which refuses team signups until its switch is on; the card stays hidden
   * until the server has said yes.
   */
  teamEnabled: boolean;
}

/**
 * The "Choose Your Role" cards, shared by the three signup entry points
 * (email, phone, Apple/Google) so they cannot drift apart.
 */
export const RoleGrid: React.FC<RoleGridProps> = ({
  value,
  onChange,
  teamEnabled,
}) => (
  <View style={styles.rolesGrid} accessibilityRole="radiogroup">
    {roleOptions.map((roleOption) => (
      <RoleCard
        key={roleOption.id}
        option={roleOption}
        isActive={value === roleOption.id}
        onPress={() => onChange(roleOption.id)}
      />
    ))}
    {teamEnabled && (
      // The answer arrives a moment after the grid is drawn, so the card
      // fades in rather than popping.
      <Animated.View entering={FadeIn.duration(300)} style={styles.wideSlot}>
        <RoleCard
          option={teamOption}
          isActive={value === teamOption.id}
          onPress={() => onChange(teamOption.id)}
          wide
        />
      </Animated.View>
    )}
  </View>
);

const styles = StyleSheet.create({
  rolesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  roleCard: {
    width: (width - 60) / 2,
    backgroundColor: neutral.gray50,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  // Spans both columns, edge to edge with the cards above it.
  wideSlot: {
    width: "100%",
  },
  roleCardWide: {
    width: "100%",
    flexDirection: "row",
  },
  roleCardActive: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
    shadowColor: brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  roleCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  roleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  roleIconContainerWide: {
    marginBottom: 0,
    marginRight: 14,
  },
  roleIconContainerActive: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  roleTextsWide: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
    marginBottom: 4,
  },
  roleLabelWide: {
    marginBottom: 2,
  },
  roleLabelActive: {
    color: brand.white,
  },
  roleDescription: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
    textAlign: "center",
    marginBottom: 8,
  },
  roleDescriptionWide: {
    textAlign: "left",
    marginBottom: 4,
  },
  roleDescriptionActive: {
    color: "rgba(255,255,255,0.85)",
  },
  roleCaption: {
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
  roleCaptionActive: {
    color: brand.white,
  },
});
