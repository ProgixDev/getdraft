/**
 * Welcome screen slide data
 * Content for each onboarding slide
 */

import { ImageSourcePropType } from "react-native";
import { images } from "@/config/assets";

export interface WelcomeSlideData {
  id: string;
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
}

export const welcomeSlides: WelcomeSlideData[] = [
  {
    id: "welcome1",
    title: "Showcase Your\nTalent",
    subtitle:
      "Upload highlights, stats, and videos to get noticed by top recruiters and coaches across all sports.",
    image: images.welcome1,
  },
  {
    id: "welcome2",
    title: "Connect With\nRecruiters",
    subtitle:
      "Get direct access to college scouts, professional coaches, and certified agents looking for athletes like you.",
    image: images.welcome2,
  },
  {
    id: "welcome3",
    title: "Take Your Career\nTo The Next Level",
    subtitle:
      "Match with the right opportunities and unlock your potential in the sport you love.",
    image: images.welcome3,
  },
];
