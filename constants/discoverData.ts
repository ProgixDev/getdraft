/**
 * Mock data for Discover feed
 * Players discover recruiters (agents, coaches)
 * Replace with API data in production
 */

import { images, videos as videoAssets } from "@/config/assets";

export interface RecruiterCard {
  id: string;
  name: string;
  role: "agent" | "coach";
  organization: string;
  location: string;
  country: string;
  distanceKm: number;
  sport: string;
  verified: boolean;
  tags: string[];
  imageUrl: string | null;
}

export const mockRecruiters: RecruiterCard[] = [
  {
    id: "1",
    name: "Mike Thompson",
    role: "agent",
    organization: "Elite Sports Agency",
    location: "Los Angeles, CA, USA",
    country: "United States",
    distanceKm: 58,
    sport: "American Football",
    verified: true,
    tags: ["NFL Certified", "10+ Years", "QB Specialist"],
    imageUrl:
      // Keyword search: sports agent / deal / handshake
      "https://images.unsplash.com/photo-1758599543278-32d9d073941e?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    id: "2",
    name: "Sarah Williams",
    role: "coach",
    organization: "State University",
    location: "Austin, TX, USA",
    country: "United States",
    distanceKm: 180,
    sport: "American Football",
    verified: true,
    tags: ["NCAA Div I", "Offensive Coordinator", "Recruiting"],
    imageUrl:
      // Keyword search: american football coach / headset / sideline
      "https://images.unsplash.com/photo-1762746301772-dc80ac6beffe?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    id: "3",
    name: "James Rodriguez",
    role: "agent",
    organization: "Pro Draft Partners",
    location: "Miami, FL, USA",
    country: "United States",
    distanceKm: 425,
    sport: "American Football",
    verified: false,
    tags: ["NFLPA Certified", "Combine Prep", "Contract Negotiation"],
    imageUrl:
      // Keyword search: agent / negotiation / business handshake
      "https://images.unsplash.com/photo-1759310610325-2c7cb621e5e3?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    id: "4",
    name: "Coach Davis",
    role: "coach",
    organization: "Premier High School",
    location: "Dallas, TX, USA",
    country: "United States",
    distanceKm: 150,
    sport: "American Football",
    verified: true,
    tags: ["State Champions", "College Pipeline", "Skill Development"],
    imageUrl:
      // Keyword search: football coach / field / game day
      "https://images.unsplash.com/photo-1762757076979-cc016f6df284?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    id: "5",
    name: "Jennifer Park",
    role: "agent",
    organization: "Next Level Sports",
    location: "London, UK",
    country: "United Kingdom",
    distanceKm: 1046,
    sport: "American Football",
    verified: true,
    tags: ["NFL Draft", "Pro Day Prep", "Agent of 5+ NFL Players"],
    imageUrl:
      // Keyword search: contract / signing / partnership
      "https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
];

/**
 * Media source: string (URI) or number (require() for local assets)
 */
export type MediaSource = string | number;

/**
 * Mock agent/recruiter profile for profile screen
 */
export interface AgentProfile {
  id: string;
  email: string;
  name: string;
  organization: string;
  location: string;
  sport: string;
  photos: MediaSource[];
  videos: MediaSource[];
  bio?: string;
}

export const mockAgentProfile: AgentProfile = {
  id: "agent-1",
  email: "agent@contact.com",
  name: "Jubin",
  organization: "Elite Sports Agency",
  location: "Los Angeles, CA",
  sport: "American Football",
  photos: [],
  videos: [],
  bio: "NFL Certified Agent • 10+ years experience • QB Specialist",
};

/**
 * Mock athlete accounts - user will add photos/videos
 */
export interface AthleteProfile {
  id: string;
  email: string;
  name: string;
  sport: string;
  position: string;
  level: string;
  location: string;
  country: string;
  distanceKm: number;
  photos: MediaSource[];
  videos: MediaSource[];
  bio?: string;
  classYear?: string;
  gpa?: number;
  height?: string;
  weight?: string;
  fortyYardDash?: string;
  awards?: string[];
  profileViews?: number;
  likesReceived?: number;
}

export const mockAthletes: AthleteProfile[] = [
  {
    id: "athlete-1",
    email: "athlete1@test.com",
    name: "Marcus Johnson",
    sport: "American Football",
    position: "Quarterback",
    level: "NCAA Div I",
    location: "Austin, TX, USA",
    country: "United States",
    distanceKm: 71,
    photos: [images.athlete1],
    videos: [videoAssets.athlete1],
    bio: "Class of 2025 QB prospect with strong arm and high football IQ.",
    classYear: "2025",
    gpa: 3.7,
    height: "6'2\"",
    weight: "215 lbs",
    fortyYardDash: "4.65s",
    awards: ["State Championship MVP 2024", "2x All-District QB"],
    profileViews: 47,
    likesReceived: 8,
  },
  {
    id: "athlete-2",
    email: "athlete2@test.com",
    name: "Jake Williams",
    sport: "American Football",
    position: "Wide Receiver",
    level: "High School",
    location: "Paris, France",
    country: "France",
    distanceKm: 1143,
    photos: [images.athlete2],
    videos: [videoAssets.athlete2],
    bio: "Speed receiver with elite separation ability and reliable hands.",
    classYear: "2026",
    height: "5'11\"",
    weight: "185 lbs",
    fortyYardDash: "4.42s",
    awards: ["All-Conference WR 2023"],
    profileViews: 23,
    likesReceived: 5,
  },
];

// -------------------------------------------------------------------
// Athlete match data — recruiters who mutually matched with an athlete
// -------------------------------------------------------------------

export interface AthleteMatch {
  id: string;
  recruiterName: string;
  recruiterRole: "agent" | "coach";
  organization: string;
  location: string;
  verified: boolean;
  matchedAt: string;
  unreadCount: number;
  lastMessage?: string;
}

export const mockAthleteMatches: Record<string, AthleteMatch[]> = {
  "athlete1@test.com": [
    {
      id: "match-1",
      recruiterName: "Mike Thompson",
      recruiterRole: "agent",
      organization: "Elite Sports Agency",
      location: "Los Angeles, CA",
      verified: true,
      matchedAt: "2h ago",
      unreadCount: 2,
      lastMessage:
        "Marcus, I've been following your highlights and think you have serious NFL potential.",
    },
    {
      id: "match-2",
      recruiterName: "Sarah Williams",
      recruiterRole: "coach",
      organization: "State University",
      location: "Austin, TX",
      verified: true,
      matchedAt: "1d ago",
      unreadCount: 0,
      lastMessage: "Looking forward to connecting with you!",
    },
  ],
  "athlete2@test.com": [
    {
      id: "match-3",
      recruiterName: "Jennifer Park",
      recruiterRole: "agent",
      organization: "Next Level Sports",
      location: "London, UK",
      verified: true,
      matchedAt: "3d ago",
      unreadCount: 1,
      lastMessage:
        "Jake, your speed metrics are impressive. 4.4 40-yard dash is elite.",
    },
  ],
};

// -------------------------------------------------------------------
// Athlete chat threads — keyed by match id
// -------------------------------------------------------------------

export interface AthleteChatMessage {
  id: string;
  sender: "athlete" | "recruiter";
  text: string;
  sentAt: string;
}

export interface AthleteChatThread {
  id: string;
  recruiterName: string;
  recruiterRole: "agent" | "coach";
  organization: string;
  verified: boolean;
  messages: AthleteChatMessage[];
}

export const mockAthleteChatThreads: Record<string, AthleteChatThread> = {
  "match-1": {
    id: "match-1",
    recruiterName: "Mike Thompson",
    recruiterRole: "agent",
    organization: "Elite Sports Agency",
    verified: true,
    messages: [
      {
        id: "m1",
        sender: "recruiter",
        text: "Marcus, I've been following your highlights and I think you have serious NFL potential. Would love to connect.",
        sentAt: "2h ago",
      },
      {
        id: "m2",
        sender: "recruiter",
        text: "My agency specializes in QB development and contract negotiation. I currently represent 3 active NFL clients.",
        sentAt: "2h ago",
      },
    ],
  },
  "match-2": {
    id: "match-2",
    recruiterName: "Sarah Williams",
    recruiterRole: "coach",
    organization: "State University",
    verified: true,
    messages: [
      {
        id: "m3",
        sender: "recruiter",
        text: "Marcus, we have a scholarship opening for a QB in our program. Your film is impressive — looking forward to connecting!",
        sentAt: "1d ago",
      },
      {
        id: "m4",
        sender: "athlete",
        text: "Thank you Coach Williams! I would love to learn more about the program and visit campus.",
        sentAt: "1d ago",
      },
    ],
  },
  "match-3": {
    id: "match-3",
    recruiterName: "Jennifer Park",
    recruiterRole: "agent",
    organization: "Next Level Sports",
    verified: true,
    messages: [
      {
        id: "m5",
        sender: "recruiter",
        text: "Jake, your speed metrics are impressive — 4.4 40-yard dash is elite. I'd love to discuss representation.",
        sentAt: "3d ago",
      },
    ],
  },
};
