import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type SportTheme = {
  gradient: [string, string, string];
  accent: string;
  icon: IoniconName;
  /** Bundled local hero image (require()'d asset id). Local = instant, offline. */
  image: number;
};

// Hero images are bundled local assets (assets/sports/*.jpg) — zero network, so
// the background swaps instantly on swipe. Sports without a dedicated photo
// (Table Tennis, Badminton, Lacrosse) and the fallback reuse default.jpg.
export const SPORT_THEMES: Record<string, SportTheme> = {
  "American Football": {
    gradient: ["#071F13", "#0E3320", "#1FAA59"],
    accent: "#1FAA59",
    icon: "american-football",
    image: require("@/assets/sports/american-football.jpg"),
  },
  Soccer: {
    gradient: ["#08210F", "#0E3A1A", "#1E9E4A"],
    accent: "#1E9E4A",
    icon: "football",
    image: require("@/assets/sports/soccer.jpg"),
  },
  Basketball: {
    gradient: ["#2A1405", "#3A1D08", "#E8772E"],
    accent: "#E8772E",
    icon: "basketball",
    image: require("@/assets/sports/basketball.jpg"),
  },
  Baseball: {
    gradient: ["#15210E", "#26331A", "#7BA428"],
    accent: "#7BA428",
    icon: "baseball",
    image: require("@/assets/sports/baseball.jpg"),
  },
  Hockey: {
    gradient: ["#06202E", "#0A2E42", "#3FA9D6"],
    accent: "#3FA9D6",
    icon: "snow",
    image: require("@/assets/sports/hockey.jpg"),
  },
  Tennis: {
    gradient: ["#0F2A12", "#1A401C", "#C7E04A"],
    accent: "#C7E04A",
    icon: "tennisball",
    image: require("@/assets/sports/tennis.jpg"),
  },
  Volleyball: {
    gradient: ["#0F2034", "#16314D", "#3B82F6"],
    accent: "#3B82F6",
    icon: "fitness",
    image: require("@/assets/sports/volleyball.jpg"),
  },
  Cricket: {
    gradient: ["#0E260F", "#1A3A16", "#4CAF50"],
    accent: "#4CAF50",
    icon: "fitness",
    image: require("@/assets/sports/cricket.jpg"),
  },
  "Table Tennis": {
    gradient: ["#0A1E2E", "#0F2C42", "#2DA8E8"],
    accent: "#2DA8E8",
    icon: "fitness",
    image: require("@/assets/sports/default.jpg"),
  },
  Rugby: {
    gradient: ["#06220F", "#0C3318", "#2E8B57"],
    accent: "#2E8B57",
    icon: "american-football",
    image: require("@/assets/sports/rugby.jpg"),
  },
  Badminton: {
    gradient: ["#13202E", "#1E3047", "#5B9BD5"],
    accent: "#5B9BD5",
    icon: "fitness",
    image: require("@/assets/sports/default.jpg"),
  },
  Swimming: {
    gradient: ["#04222E", "#063244", "#22C3D6"],
    accent: "#22C3D6",
    icon: "water",
    image: require("@/assets/sports/swimming.jpg"),
  },
  Golf: {
    gradient: ["#0C2615", "#123620", "#3DAE5A"],
    accent: "#3DAE5A",
    icon: "golf",
    image: require("@/assets/sports/golf.jpg"),
  },
  Lacrosse: {
    gradient: ["#161024", "#241638", "#8B5CF6"],
    accent: "#8B5CF6",
    icon: "fitness",
    image: require("@/assets/sports/default.jpg"),
  },
  "Track & Field": {
    gradient: ["#2A0E12", "#3A151B", "#E0455C"],
    accent: "#E0455C",
    icon: "walk",
    image: require("@/assets/sports/track-field.jpg"),
  },
  "Flag Football": {
    gradient: ["#2A1608", "#3A200C", "#E8902E"],
    accent: "#E8902E",
    icon: "american-football",
    image: require("@/assets/sports/american-football.jpg"),
  },
  Wrestling: {
    gradient: ["#241016", "#361822", "#C0392B"],
    accent: "#C0392B",
    icon: "body",
    image: require("@/assets/sports/default.jpg"),
  },
  Gymnastics: {
    gradient: ["#1E1226", "#2E1B3A", "#A55CD6"],
    accent: "#A55CD6",
    icon: "body",
    image: require("@/assets/sports/default.jpg"),
  },
  Softball: {
    gradient: ["#1A210E", "#2B331A", "#9BC22B"],
    accent: "#9BC22B",
    icon: "baseball",
    image: require("@/assets/sports/baseball.jpg"),
  },
  Boxing: {
    gradient: ["#2A0E0E", "#3A1515", "#D64545"],
    accent: "#D64545",
    icon: "fitness",
    image: require("@/assets/sports/default.jpg"),
  },
  "Alpine Skiing": {
    gradient: ["#0A1E2E", "#0F2C42", "#5BB8E8"],
    accent: "#5BB8E8",
    icon: "snow",
    image: require("@/assets/sports/default.jpg"),
  },
  Snowboarding: {
    gradient: ["#13202E", "#1E3047", "#4A9BD5"],
    accent: "#4A9BD5",
    icon: "snow",
    image: require("@/assets/sports/default.jpg"),
  },
  "Figure Skating": {
    gradient: ["#101E2E", "#182C42", "#6BB6E0"],
    accent: "#6BB6E0",
    icon: "snow",
    image: require("@/assets/sports/default.jpg"),
  },
  default: {
    gradient: ["#121212", "#1A1A1A", "#1FAA59"],
    accent: "#1FAA59",
    icon: "trophy",
    image: require("@/assets/sports/default.jpg"),
  },
};

export function getSportTheme(sport?: string): SportTheme {
  if (sport && SPORT_THEMES[sport]) return SPORT_THEMES[sport];
  return SPORT_THEMES.default;
}

// All unique bundled sport images. Preload these once at screen mount (expo-asset
// Asset.loadAsync) so the deck never waits on Metro to serve an asset on first
// view in dev — every card + background is then warm and swaps instantly.
export const SPORT_IMAGES: number[] = Array.from(
  new Set(Object.values(SPORT_THEMES).map((t) => t.image)),
);
