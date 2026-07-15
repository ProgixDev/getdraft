import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import KeyboardAwareScreen from "@/components/KeyboardAwareScreen";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";
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
import { SPORTS_WITH_POSITIONS } from "@/constants/sportsData";
import { POPULAR_AGENCIES } from "@/constants/agenciesData";
import { PHONE_MAX_WIDTH } from "@/lib/responsive";

const AGENCY_OTHER = "__OTHER__";
import { profilesService } from "@/services/profiles";
import { usersService } from "@/services/users";
import { useAppDispatch } from "@/store/hooks";
import { updateUser } from "@/store/slices/authSlice";

function toIsoDate(d: Date): string {
  // Format from local date parts — toISOString() converts to UTC, which
  // shifts the DOB a day back west of UTC (and can flip minor/adult).
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}


interface ProfileSetupScreenProps {
  role: string;
  /** Sole exit — routes into the KYC gate. There is intentionally no
   *  onComplete/skip exit: every signup must pass KYC before plan. */
  onPayment: () => void;
  onBack: () => void;
}

const GENDER_OPTIONS = ["Man", "Woman"];
const RELATIONSHIP_OPTIONS = ["Mother", "Father", "Guardian", "Other"];

type StepField = {
  id: string;
  label: string;
  placeholder: string;
  icon: string;
  // Skipped by isStepComplete. The user can still fill it in but the
  // Next/Complete button doesn't wait on it. Required by default so the
  // athlete fields below keep their previous "all required" semantics.
  optional?: boolean;
};
type Step = {
  id: number;
  title: string;
  subtitle: string;
  tip: string;
  fields: StepField[];
};

// Each role gets its own step set so coaches don't see jersey numbers
// and parents don't see sport pickers. The athlete branch is the
// pre-existing 3-step flow verbatim; the others are new.
function getStepsForRole(role: string): Step[] {
  if (role === "coach" || role === "recruiter") {
    const isAgent = role === "recruiter";
    const orgStep: Step = {
      id: 2,
      title: isAgent ? "Agency & Sport" : "Organization & Sport",
      subtitle: isAgent
        ? "Who you scout for"
        : "Who you coach with",
      tip: isAgent
        ? "Athletes look at agency name and sport when deciding to engage"
        : "Athletes look at program name and sport when deciding to engage",
      fields: [
        {
          id: "organization",
          label: isAgent ? "Agency Name" : "Organization",
          placeholder: isAgent ? "Premier Sports Group" : "State University",
          icon: "briefcase-outline",
        },
        {
          id: "sport",
          label: "Sport",
          placeholder: "Football",
          icon: "football-outline",
        },
        {
          id: "level",
          label: "Level (optional)",
          placeholder: "Pick a level",
          icon: "trending-up-outline",
          optional: true,
        },
        ...(!isAgent
          ? ([
              {
                id: "team",
                label: "Team (optional)",
                placeholder: "Varsity Football",
                icon: "shirt-outline",
                optional: true,
              },
            ] as StepField[])
          : []),
        ...(isAgent
          ? ([
              {
                id: "region",
                label: "Region or Territory (optional)",
                placeholder: "Northeast US",
                icon: "earth-outline",
                optional: true,
              },
            ] as StepField[])
          : []),
        {
          id: "bio",
          label: "Short Bio (optional)",
          placeholder: "Brief introduction…",
          icon: "information-circle-outline",
          optional: true,
        },
      ],
    };
    return [
      {
        id: 1,
        title: "Personal Info",
        subtitle: "Tell us your name",
        tip: "Use your real name to build trust",
        fields: [
          {
            id: "firstName",
            label: "First Name",
            placeholder: "John",
            icon: "person-outline",
          },
          {
            id: "lastName",
            label: "Last Name",
            placeholder: "Doe",
            icon: "person-outline",
          },
        ],
      },
      orgStep,
    ];
  }
  if (role === "parent") {
    return [
      {
        id: 1,
        title: "Personal Info",
        subtitle: "Tell us about you",
        tip: "Your athlete's match notifications come to you",
        fields: [
          {
            id: "firstName",
            label: "First Name",
            placeholder: "John",
            icon: "person-outline",
          },
          {
            id: "lastName",
            label: "Last Name",
            placeholder: "Doe",
            icon: "person-outline",
          },
          {
            id: "relationship",
            label: "Relationship",
            placeholder: "Select",
            icon: "people-outline",
          },
          {
            id: "bio",
            label: "Short Bio (optional)",
            placeholder: "Brief introduction…",
            icon: "information-circle-outline",
            optional: true,
          },
        ],
      },
    ];
  }
  // athlete (default) — unchanged 3-step flow.
  return [
    {
      id: 1,
      title: "Personal Info",
      subtitle: "Tell us about yourself",
      tip: "Use your real name to build trust",
      fields: [
        {
          id: "firstName",
          label: "First Name",
          placeholder: "John",
          icon: "person-outline",
        },
        {
          id: "lastName",
          label: "Last Name",
          placeholder: "Doe",
          icon: "person-outline",
        },
        {
          id: "gender",
          label: "Gender",
          placeholder: "Select",
          icon: "male-female-outline",
        },
        {
          id: "dateOfBirth",
          label: "Date of Birth",
          placeholder: "MM/DD/YYYY",
          icon: "calendar-outline",
        },
      ],
    },
    {
      id: 2,
      title: "Sport Details",
      subtitle: "Share your athletic background",
      tip: "Be specific about your position and level",
      fields: [
        {
          id: "sport",
          label: "Primary Sport",
          placeholder: "Football",
          icon: "football-outline",
        },
        {
          id: "level",
          label: "Level",
          placeholder: "High School",
          icon: "trending-up-outline",
        },
        {
          id: "position",
          label: "Position",
          placeholder: "Quarterback",
          icon: "trophy-outline",
        },
        {
          id: "team",
          label: "Team / Club (optional)",
          placeholder: "Dallas Jesuit Rangers",
          icon: "shirt-outline",
          optional: true,
        },
        {
          id: "agency",
          label: "Agency (optional)",
          placeholder: "Select if signed",
          icon: "briefcase-outline",
          optional: true,
        },
        {
          id: "experience",
          label: "Years of Experience",
          placeholder: "5",
          icon: "time-outline",
        },
      ],
    },
    {
      id: 3,
      title: "Physical Attributes",
      subtitle: "Your physical stats",
      tip: "Accurate stats help better matches",
      fields: [
        {
          id: "height",
          label: "Height",
          placeholder: "6'2\"",
          icon: "resize-outline",
        },
        {
          id: "weight",
          label: "Weight",
          placeholder: "185",
          icon: "fitness-outline",
        },
      ],
    },
  ];
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  role,
  onPayment,
  onBack,
}) => {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Role-specific step set — recomputed only when the role prop changes.
  const steps = useMemo(() => getStepsForRole(role), [role]);

  const dispatch = useAppDispatch();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [sportModalVisible, setSportModalVisible] = useState(false);
  const [positionModalVisible, setPositionModalVisible] = useState(false);
  const [levelModalVisible, setLevelModalVisible] = useState(false);
  const [agencyModalVisible, setAgencyModalVisible] = useState(false);
  const [agencyCustom, setAgencyCustom] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [relationshipModalVisible, setRelationshipModalVisible] =
    useState(false);
  const [dateOfBirth, setDateOfBirth] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d;
  });
  // Little-league floor: no one under 6 can sign up — the DOB picker caps its
  // most-recent selectable date here.
  const maxAllowedDob = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 6);
    return d;
  };
  const [heightUnit, setHeightUnit] = useState<"in" | "cm">("in");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = useSharedValue(0);

  const parseHeightToInches = (value: string): number => {
    const match = value.match(/(\d+)'(\d+)"?/);
    if (match) return parseInt(match[1], 10) * 12 + parseInt(match[2], 10);
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  };

  const convertHeight = (
    value: string,
    from: "in" | "cm",
    to: "in" | "cm",
  ): string => {
    if (from === "in" && to === "cm") {
      const totalInches = parseHeightToInches(value);
      if (totalInches === 0) return "";
      return Math.round(totalInches * 2.54).toString();
    }
    if (from === "cm" && to === "in") {
      const num = parseFloat(value);
      if (isNaN(num)) return "";
      const totalInches = num / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return inches > 0 ? `${feet}'${inches}"` : `${feet}'`;
    }
    return value;
  };

  const convertWeight = (
    value: string,
    from: "lbs" | "kg",
    to: "lbs" | "kg",
  ): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    if (from === "lbs" && to === "kg")
      return Math.round(num / 2.205).toString();
    if (from === "kg" && to === "lbs")
      return Math.round(num * 2.205).toString();
    return value;
  };

  const handleHeightUnitChange = (useCm: boolean) => {
    const newUnit = useCm ? "cm" : "in";
    if (formData.height) {
      const converted = convertHeight(formData.height, heightUnit, newUnit);
      handleFieldChange("height", converted);
    }
    setHeightUnit(newUnit);
  };

  const handleWeightUnitChange = (useKg: boolean) => {
    const newUnit = useKg ? "kg" : "lbs";
    if (formData.weight) {
      const converted = convertWeight(formData.weight, weightUnit, newUnit);
      handleFieldChange("weight", converted);
    }
    setWeightUnit(newUnit);
  };

  const selectedSportData = SPORTS_WITH_POSITIONS.find(
    (s) => s.name === formData.sport,
  );
  const positionOptions = selectedSportData?.positions ?? [];
  const levelOptions = selectedSportData?.levels ?? [];

  const formatDate = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (event?.type === "dismissed") return;
    if (selectedDate) {
      setDateOfBirth(selectedDate);
      handleFieldChange("dateOfBirth", formatDate(selectedDate));
    }
  };

  const handleDateModalConfirm = () => {
    handleFieldChange("dateOfBirth", formatDate(dateOfBirth));
    setDateModalVisible(false);
  };

  const handleOpenDateModal = () => {
    let initial = dateOfBirth;
    const existing = formData.dateOfBirth;
    if (existing) {
      const parts = existing.split("/");
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10) - 1;
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
          initial = new Date(year, month, day);
          setDateOfBirth(initial);
        }
      }
    }

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        maximumDate: maxAllowedDob(),
        minimumDate: new Date(1900, 0, 1),
        onChange: handleDateChange,
      });
    } else {
      setDateModalVisible(true);
    }
  };

  const handleSportSelect = (sportName: string) => {
    handleFieldChange("sport", sportName);
    const sport = SPORTS_WITH_POSITIONS.find((s) => s.name === sportName);
    if (sport) {
      if (formData.position && !sport.positions.includes(formData.position)) {
        handleFieldChange("position", "");
      }
      if (formData.level && !sport.levels.includes(formData.level)) {
        handleFieldChange("level", "");
      }
    }
    setSportModalVisible(false);
  };

  const handlePositionSelect = (position: string) => {
    handleFieldChange("position", position);
    setPositionModalVisible(false);
  };

  const handleLevelSelect = (level: string) => {
    handleFieldChange("level", level);
    setLevelModalVisible(false);
  };

  const handleGenderSelect = (gender: string) => {
    handleFieldChange("gender", gender);
    setGenderModalVisible(false);
  };

  const handleAgencySelect = (value: string) => {
    if (value === AGENCY_OTHER) {
      setAgencyCustom(true);
      handleFieldChange("agency", "");
    } else {
      setAgencyCustom(false);
      handleFieldChange("agency", value);
    }
    setAgencyModalVisible(false);
  };

  const handleRelationshipSelect = (relationship: string) => {
    handleFieldChange("relationship", relationship);
    setRelationshipModalVisible(false);
  };

  React.useEffect(() => {
    progress.value = withTiming(((currentStep + 1) / steps.length) * 100, {
      duration: 300,
    });
    // steps.length depends on `role` via useMemo; including it keeps the
    // bar in sync if the role ever changes mid-mount.
  }, [currentStep, steps.length, progress]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const handleFieldChange = (fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        const fullName =
          `${formData.firstName ?? ""} ${formData.lastName ?? ""}`.trim();
        if (fullName) {
          // Reflect the real name in the store immediately so Discover (and
          // anywhere reading user.name) shows the actual first name instead of
          // the email-derived placeholder seeded at signup.
          dispatch(updateUser({ name: fullName }));
          try {
            await usersService.updateMe({ name: fullName });
          } catch (e) {
            console.warn(
              "[ProfileSetup] updateMe(name) failed (non-blocking):",
              e,
            );
          }
        }

        if (role === "athlete") {
          await profilesService.upsertAthleteProfile({
            sport: formData.sport,
            position: formData.position,
            level: formData.level,
            team: formData.team?.trim() || undefined,
            agency: formData.agency?.trim() || undefined,
            bio: "",
            class_year: "",
            height: formData.height
              ? `${formData.height}${heightUnit === "in" ? "" : " cm"}`
              : undefined,
            weight: formData.weight
              ? `${formData.weight} ${weightUnit}`
              : undefined,
            gender: formData.gender || undefined,
            date_of_birth: formData.dateOfBirth
              ? toIsoDate(dateOfBirth)
              : undefined,
            experience: formData.experience || undefined,
          });
        } else if (role === "coach" || role === "recruiter") {
          // tags carry the optional level + (recruiter-only) region so the
          // backend doesn't need any new columns to support those fields.
          const tags: string[] = [];
          const level = formData.level?.trim();
          const region = formData.region?.trim();
          if (level) tags.push(level);
          if (region) tags.push(region);
          await profilesService.upsertRecruiterProfile({
            organization: formData.organization?.trim() ?? "",
            sport: formData.sport?.trim() ?? "",
            role_type: role === "coach" ? "coach" : "agent",
            // Coaches list a team; agents leave it blank (field hidden for them).
            team: formData.team?.trim() || undefined,
            bio: formData.bio?.trim() || undefined,
            tags,
          });
        } else if (role === "parent") {
          await profilesService.upsertParentProfile({
            relationship: formData.relationship?.trim() ?? "",
            bio: formData.bio?.trim() || undefined,
          });
        }
        onPayment();
      } catch (err: any) {
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Could not save your profile. Please try again.";
        console.warn(
          "[ProfileSetup] upsert failed:",
          message,
          err?.response?.data,
        );
        Alert.alert("Profile not saved", message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    } else {
      onBack();
    }
  };

  const isStepComplete = () => {
    const currentFields = steps[currentStep].fields;
    return currentFields.every(
      (field) => field.optional || formData[field.id]?.trim(),
    );
  };

  const getCompletionPercentage = () => {
    // Only required fields count toward the bar — optional fields are
    // bonuses, not gates, so leaving the bar stuck below 100% when the
    // user is genuinely done would be misleading.
    const requiredFields = steps.flatMap((s) =>
      s.fields.filter((f) => !f.optional),
    );
    if (requiredFields.length === 0) return 100;
    const completed = requiredFields.filter((f) =>
      formData[f.id]?.trim(),
    ).length;
    return Math.round((completed / requiredFields.length) * 100);
  };

  if (!fontsLoaded) return null;

  const currentStepData = steps[currentStep];

  return (
    <LinearGradient
      colors={[brand.primary, "#0a4d8f", brand.primary]}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Header with Progress */}
        <View style={styles.header}>
          <View style={styles.topBar}>
            <Pressable onPress={handlePrevious} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={brand.white} />
            </Pressable>
            <View style={styles.stepIndicator}>
              <Text style={styles.stepText}>
                Step {currentStep + 1} of {steps.length}
              </Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <Animated.View
                style={[styles.progressBarFill, progressBarStyle]}
              />
            </View>
            <Text style={styles.progressText}>
              {getCompletionPercentage()}% Complete
            </Text>
          </View>
        </View>

        <KeyboardAwareScreen
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View
            key={currentStep}
            entering={FadeInDown.duration(600)}
            style={styles.card}
          >
            {/* Step Title */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{currentStepData.title}</Text>
              <Text style={styles.cardSubtitle}>
                {currentStepData.subtitle}
              </Text>
            </View>

            {/* Form Fields */}
            <View style={styles.fieldsContainer}>
              {currentStepData.fields.map((field, index) => (
                <Animated.View
                  key={field.id}
                  entering={FadeIn.duration(400).delay(index * 100)}
                  style={styles.fieldWrapper}
                >
                  {field.id === "gender" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={styles.inputContainer}
                        onPress={() => setGenderModalVisible(true)}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] || field.placeholder}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                    </>
                  ) : field.id === "relationship" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={styles.inputContainer}
                        onPress={() => setRelationshipModalVisible(true)}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] || field.placeholder}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                    </>
                  ) : field.id === "bio" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <View style={[styles.inputContainer, styles.bioContainer]}>
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.bioIcon}
                        />
                        <TextInput
                          style={[styles.input, styles.bioInput]}
                          placeholder={field.placeholder}
                          placeholderTextColor={neutral.gray400}
                          value={formData[field.id] || ""}
                          onChangeText={(value) =>
                            handleFieldChange(field.id, value)
                          }
                          multiline
                          numberOfLines={4}
                          textAlignVertical="top"
                        />
                      </View>
                    </>
                  ) : field.id === "dateOfBirth" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={styles.inputContainer}
                        onPress={handleOpenDateModal}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] || field.placeholder}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                    </>
                  ) : field.id === "sport" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={styles.inputContainer}
                        onPress={() => setSportModalVisible(true)}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] || field.placeholder}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                    </>
                  ) : field.id === "level" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={[
                          styles.inputContainer,
                          !formData.sport && styles.inputContainerDisabled,
                        ]}
                        onPress={() =>
                          formData.sport && setLevelModalVisible(true)
                        }
                        disabled={!formData.sport}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] ||
                            (formData.sport
                              ? field.placeholder
                              : "Select sport first")}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                    </>
                  ) : field.id === "position" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={[
                          styles.inputContainer,
                          !formData.sport && styles.inputContainerDisabled,
                        ]}
                        onPress={() =>
                          formData.sport && setPositionModalVisible(true)
                        }
                        disabled={!formData.sport}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] ||
                            (formData.sport
                              ? field.placeholder
                              : "Select sport first")}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                    </>
                  ) : field.id === "agency" ? (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <Pressable
                        style={styles.inputContainer}
                        onPress={() => setAgencyModalVisible(true)}
                      >
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <Text
                          style={[
                            styles.input,
                            !formData[field.id] && styles.inputPlaceholder,
                          ]}
                        >
                          {formData[field.id] ||
                            (agencyCustom ? "Type below" : field.placeholder)}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={neutral.gray400}
                        />
                      </Pressable>
                      {agencyCustom && (
                        <View
                          style={[styles.inputContainer, { marginTop: 10 }]}
                        >
                          <Ionicons
                            name="create-outline"
                            size={20}
                            color={neutral.gray400}
                            style={styles.inputIcon}
                          />
                          <TextInput
                            style={styles.input}
                            placeholder="Type your agency"
                            placeholderTextColor={neutral.gray400}
                            value={formData.agency || ""}
                            onChangeText={(value) =>
                              handleFieldChange("agency", value)
                            }
                            autoCapitalize="words"
                          />
                        </View>
                      )}
                    </>
                  ) : field.id === "height" ? (
                    <>
                      <View style={styles.fieldLabelRow}>
                        <Text style={styles.fieldLabel}>{field.label}</Text>
                        <View style={styles.unitSwitchRow}>
                          <Text
                            style={[
                              styles.unitLabel,
                              heightUnit === "in" && styles.unitLabelActive,
                            ]}
                          >
                            in
                          </Text>
                          <Switch
                            value={heightUnit === "cm"}
                            onValueChange={handleHeightUnitChange}
                            trackColor={{
                              false: neutral.gray300,
                              true: brand.primary,
                            }}
                            thumbColor={brand.white}
                          />
                          <Text
                            style={[
                              styles.unitLabel,
                              heightUnit === "cm" && styles.unitLabelActive,
                            ]}
                          >
                            cm
                          </Text>
                        </View>
                      </View>
                      <View style={styles.inputContainer}>
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder={heightUnit === "in" ? "6'2\"" : "188"}
                          placeholderTextColor={neutral.gray400}
                          value={formData[field.id] || ""}
                          onChangeText={(value) =>
                            handleFieldChange(field.id, value)
                          }
                          keyboardType={
                            heightUnit === "cm" ? "numeric" : "default"
                          }
                        />
                      </View>
                    </>
                  ) : field.id === "weight" ? (
                    <>
                      <View style={styles.fieldLabelRow}>
                        <Text style={styles.fieldLabel}>{field.label}</Text>
                        <View style={styles.unitSwitchRow}>
                          <Text
                            style={[
                              styles.unitLabel,
                              weightUnit === "lbs" && styles.unitLabelActive,
                            ]}
                          >
                            lbs
                          </Text>
                          <Switch
                            value={weightUnit === "kg"}
                            onValueChange={handleWeightUnitChange}
                            trackColor={{
                              false: neutral.gray300,
                              true: brand.primary,
                            }}
                            thumbColor={brand.white}
                          />
                          <Text
                            style={[
                              styles.unitLabel,
                              weightUnit === "kg" && styles.unitLabelActive,
                            ]}
                          >
                            kg
                          </Text>
                        </View>
                      </View>
                      <View style={styles.inputContainer}>
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder={weightUnit === "lbs" ? "185" : "84"}
                          placeholderTextColor={neutral.gray400}
                          value={formData[field.id] || ""}
                          onChangeText={(value) =>
                            handleFieldChange(field.id, value)
                          }
                          keyboardType="numeric"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                      <View style={styles.inputContainer}>
                        <Ionicons
                          name={field.icon as any}
                          size={20}
                          color={neutral.gray400}
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder={field.placeholder}
                          placeholderTextColor={neutral.gray400}
                          value={formData[field.id] || ""}
                          onChangeText={(value) =>
                            handleFieldChange(field.id, value)
                          }
                          keyboardType={
                            field.id === "experience" ? "number-pad" : "default"
                          }
                        />
                      </View>
                    </>
                  )}
                </Animated.View>
              ))}
            </View>

            {/* Date of Birth Modal (iOS only — Android uses imperative DateTimePickerAndroid) */}
            {Platform.OS === "ios" && (
              <Modal
                visible={dateModalVisible}
                transparent
                animationType="slide"
              >
                <Pressable
                  style={styles.modalOverlay}
                  onPress={() => setDateModalVisible(false)}
                >
                  <Pressable
                    style={styles.modalContent}
                    onPress={(e) => e.stopPropagation()}
                  >
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Date of Birth</Text>
                      <Pressable onPress={() => setDateModalVisible(false)}>
                        <Ionicons
                          name="close"
                          size={24}
                          color={neutral.gray600}
                        />
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={dateOfBirth}
                      mode="date"
                      display="spinner"
                      onChange={handleDateChange}
                      maximumDate={maxAllowedDob()}
                      minimumDate={new Date(1900, 0, 1)}
                      themeVariant="light"
                    />
                    <Pressable
                      style={styles.modalConfirmButton}
                      onPress={handleDateModalConfirm}
                    >
                      <Text style={styles.modalConfirmText}>Confirm</Text>
                    </Pressable>
                  </Pressable>
                </Pressable>
              </Modal>
            )}

            {/* Gender Selection Modal */}
            <Modal
              visible={genderModalVisible}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setGenderModalVisible(false)}
              >
                <Pressable
                  style={styles.modalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Gender</Text>
                    <Pressable onPress={() => setGenderModalVisible(false)}>
                      <Ionicons
                        name="close"
                        size={24}
                        color={neutral.gray600}
                      />
                    </Pressable>
                  </View>
                  <View style={styles.modalOptionsList}>
                    {GENDER_OPTIONS.map((gender) => (
                      <Pressable
                        key={gender}
                        style={[
                          styles.modalOption,
                          formData.gender === gender &&
                            styles.modalOptionSelected,
                        ]}
                        onPress={() => handleGenderSelect(gender)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            formData.gender === gender &&
                              styles.modalOptionTextSelected,
                          ]}
                        >
                          {gender}
                        </Text>
                        {formData.gender === gender && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={brand.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Relationship Selection Modal (parent only) */}
            <Modal
              visible={relationshipModalVisible}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setRelationshipModalVisible(false)}
              >
                <Pressable
                  style={styles.modalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Relationship</Text>
                    <Pressable
                      onPress={() => setRelationshipModalVisible(false)}
                    >
                      <Ionicons
                        name="close"
                        size={24}
                        color={neutral.gray600}
                      />
                    </Pressable>
                  </View>
                  <View style={styles.modalOptionsList}>
                    {RELATIONSHIP_OPTIONS.map((rel) => (
                      <Pressable
                        key={rel}
                        style={[
                          styles.modalOption,
                          formData.relationship === rel &&
                            styles.modalOptionSelected,
                        ]}
                        onPress={() => handleRelationshipSelect(rel)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            formData.relationship === rel &&
                              styles.modalOptionTextSelected,
                          ]}
                        >
                          {rel}
                        </Text>
                        {formData.relationship === rel && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={brand.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Sport Selection Modal */}
            <Modal
              visible={sportModalVisible}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setSportModalVisible(false)}
              >
                <Pressable
                  style={styles.modalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Primary Sport</Text>
                    <Pressable onPress={() => setSportModalVisible(false)}>
                      <Ionicons
                        name="close"
                        size={24}
                        color={neutral.gray600}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.modalSubtitle}>
                    15 most played sports worldwide
                  </Text>
                  <ScrollView
                    style={styles.modalScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    {SPORTS_WITH_POSITIONS.map((sport) => (
                      <Pressable
                        key={sport.id}
                        style={[
                          styles.modalOption,
                          formData.sport === sport.name &&
                            styles.modalOptionSelected,
                        ]}
                        onPress={() => handleSportSelect(sport.name)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            formData.sport === sport.name &&
                              styles.modalOptionTextSelected,
                          ]}
                        >
                          {sport.name}
                        </Text>
                        {formData.sport === sport.name && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={brand.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Agency Selection Modal — popular agencies + type-your-own */}
            <Modal
              visible={agencyModalVisible}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setAgencyModalVisible(false)}
              >
                <Pressable
                  style={styles.modalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Agency</Text>
                    <Pressable onPress={() => setAgencyModalVisible(false)}>
                      <Ionicons
                        name="close"
                        size={24}
                        color={neutral.gray600}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.modalSubtitle}>
                    Pick your agency, or choose Other to type it in
                  </Text>
                  <ScrollView
                    style={styles.modalScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    {POPULAR_AGENCIES.map((name) => (
                      <Pressable
                        key={name}
                        style={[
                          styles.modalOption,
                          formData.agency === name &&
                            styles.modalOptionSelected,
                        ]}
                        onPress={() => handleAgencySelect(name)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            formData.agency === name &&
                              styles.modalOptionTextSelected,
                          ]}
                        >
                          {name}
                        </Text>
                        {formData.agency === name && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={brand.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                    <Pressable
                      style={[
                        styles.modalOption,
                        agencyCustom && styles.modalOptionSelected,
                      ]}
                      onPress={() => handleAgencySelect(AGENCY_OTHER)}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          agencyCustom && styles.modalOptionTextSelected,
                        ]}
                      >
                        Other (type it in)
                      </Text>
                    </Pressable>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Position Selection Modal */}
            <Modal
              visible={positionModalVisible}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setPositionModalVisible(false)}
              >
                <Pressable
                  style={styles.modalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      Position {formData.sport && `(${formData.sport})`}
                    </Text>
                    <Pressable onPress={() => setPositionModalVisible(false)}>
                      <Ionicons
                        name="close"
                        size={24}
                        color={neutral.gray600}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.modalSubtitle}>Select your position</Text>
                  <ScrollView
                    style={styles.modalScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    {positionOptions.map((position) => (
                      <Pressable
                        key={position}
                        style={[
                          styles.modalOption,
                          formData.position === position &&
                            styles.modalOptionSelected,
                        ]}
                        onPress={() => handlePositionSelect(position)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            formData.position === position &&
                              styles.modalOptionTextSelected,
                          ]}
                        >
                          {position}
                        </Text>
                        {formData.position === position && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={brand.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Level Selection Modal */}
            <Modal
              visible={levelModalVisible}
              transparent
              animationType="slide"
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setLevelModalVisible(false)}
              >
                <Pressable
                  style={styles.modalContent}
                  onPress={(e) => e.stopPropagation()}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      Level {formData.sport && `(${formData.sport})`}
                    </Text>
                    <Pressable onPress={() => setLevelModalVisible(false)}>
                      <Ionicons
                        name="close"
                        size={24}
                        color={neutral.gray600}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.modalSubtitle}>
                    Select your competition level
                  </Text>
                  <ScrollView
                    style={styles.modalScroll}
                    showsVerticalScrollIndicator={false}
                  >
                    {levelOptions.map((level) => (
                      <Pressable
                        key={level}
                        style={[
                          styles.modalOption,
                          formData.level === level &&
                            styles.modalOptionSelected,
                        ]}
                        onPress={() => handleLevelSelect(level)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            formData.level === level &&
                              styles.modalOptionTextSelected,
                          ]}
                        >
                          {level}
                        </Text>
                        {formData.level === level && (
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color={brand.primary}
                          />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.nextButton,
                  !isStepComplete() && styles.nextButtonDisabled,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleNext}
                disabled={!isStepComplete() || isSubmitting}
              >
                <LinearGradient
                  colors={
                    isStepComplete()
                      ? [brand.primary, "#0a4d8f"]
                      : [neutral.gray300, neutral.gray300]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={brand.white} />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>
                        {currentStep < steps.length - 1
                          ? "Next"
                          : "Complete Profile"}
                      </Text>
                      <Ionicons
                        name={
                          currentStep < steps.length - 1
                            ? "arrow-forward"
                            : "checkmark"
                        }
                        size={20}
                        color={brand.white}
                      />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            {/* Tip */}
            <View style={styles.tipContainer}>
              <Ionicons name="bulb-outline" size={16} color={brand.primary} />
              <Text style={styles.tipText}>{currentStepData.tip}</Text>
            </View>
          </Animated.View>
        </KeyboardAwareScreen>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicator: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  stepText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
  },
  placeholder: {
    width: 40,
  },
  progressContainer: {
    gap: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: brand.white,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
    color: brand.white,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: brand.white,
    borderRadius: 24,
    padding: 24,
  },
  cardHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: "Poppins_800ExtraBold",
    color: brand.primary,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
  },
  fieldsContainer: {
    gap: 20,
    marginBottom: 24,
  },
  fieldWrapper: {
    gap: 8,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
    color: brand.primary,
  },
  unitSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unitLabel: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    color: neutral.gray500,
  },
  unitLabelActive: {
    color: brand.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: neutral.gray50,
    borderRadius: 12,
    height: 54,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: neutral.gray200,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    color: brand.primary,
  },
  inputPlaceholder: {
    color: neutral.gray400,
  },
  inputContainerDisabled: {
    opacity: 0.6,
  },
  bioContainer: {
    alignItems: "flex-start",
    paddingVertical: 12,
    minHeight: 110,
  },
  bioIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  bioInput: {
    minHeight: 86,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalContent: {
    width: "100%",
    maxWidth: PHONE_MAX_WIDTH,
    alignSelf: "center",
    backgroundColor: brand.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: brand.primary,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
    marginBottom: 16,
  },
  modalOptionsList: {
    gap: 8,
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: neutral.gray50,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  modalOptionSelected: {
    backgroundColor: brand.white,
    borderColor: brand.primary,
  },
  modalOptionText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: brand.primary,
  },
  modalOptionTextSelected: {
    fontFamily: "Poppins_600SemiBold",
  },
  modalConfirmButton: {
    backgroundColor: brand.primary,
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  modalConfirmText: {
    color: brand.white,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  actionButtons: {
    marginBottom: 16,
  },
  nextButton: {
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    color: brand.white,
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  tipContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: neutral.gray50,
    padding: 12,
    borderRadius: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: neutral.gray600,
  },
});
