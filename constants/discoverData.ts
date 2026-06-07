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
  imageUrl: number | string | null;
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
  // --- Multi-sport demo recruiters (theming/variety) ---
  // NOTE: imageUrl values below are bundled local sport images (assets/sports/*.jpg) for instant,
  // offline loading. Swap for real per-recruiter photos (CDN/backend upload) in production.
  {
    id: "6",
    name: "Carlos Mendoza",
    role: "agent",
    organization: "Global Soccer Partners",
    location: "Chicago, IL, USA",
    country: "United States",
    distanceKm: 95,
    sport: "Soccer",
    verified: true,
    tags: ["MLS Network", "Youth Development", "International Scouting"],
    imageUrl: require("@/assets/sports/soccer.jpg"),
  },
  {
    id: "7",
    name: "Marcus Lee",
    role: "coach",
    organization: "Riverside University",
    location: "Portland, OR, USA",
    country: "United States",
    distanceKm: 145,
    sport: "Basketball",
    verified: true,
    tags: ["NCAA Div I", "Player Development", "AAU Pipeline"],
    imageUrl: require("@/assets/sports/basketball.jpg"),
  },
  {
    id: "8",
    name: "Tony Marino",
    role: "agent",
    organization: "Diamond Sports Management",
    location: "St. Louis, MO, USA",
    country: "United States",
    distanceKm: 210,
    sport: "Baseball",
    verified: false,
    tags: ["MLB Pipeline", "Draft Prep", "Pitching Specialist"],
    imageUrl: require("@/assets/sports/baseball.jpg"),
  },
  {
    id: "9",
    name: "Pierre Lavoie",
    role: "coach",
    organization: "Montreal Junior Academy",
    location: "Montreal, QC, Canada",
    country: "Canada",
    distanceKm: 60,
    sport: "Hockey",
    verified: true,
    tags: ["QMJHL Scout", "Goalie Development", "U18 Champion"],
    imageUrl: require("@/assets/sports/hockey.jpg"),
  },
  {
    id: "10",
    name: "Elena Petrova",
    role: "coach",
    organization: "Sunshine Tennis Academy",
    location: "Tampa, FL, USA",
    country: "United States",
    distanceKm: 80,
    sport: "Tennis",
    verified: true,
    tags: ["NCAA Div I", "USTA Certified", "Junior Circuit"],
    imageUrl: require("@/assets/sports/tennis.jpg"),
  },
  {
    id: "11",
    name: "Rachel Kim",
    role: "coach",
    organization: "Stanford Aquatics Center",
    location: "Palo Alto, CA, USA",
    country: "United States",
    distanceKm: 50,
    sport: "Swimming",
    verified: true,
    tags: ["Olympic Trials Coach", "NCAA Div I", "Sprint Specialist"],
    imageUrl: require("@/assets/sports/swimming.jpg"),
  },
  {
    id: "12",
    name: "David Carter",
    role: "agent",
    organization: "Fairway Talent Group",
    location: "Scottsdale, AZ, USA",
    country: "United States",
    distanceKm: 180,
    sport: "Golf",
    verified: false,
    tags: ["PGA Tour Network", "Amateur Pipeline", "Sponsorship Deals"],
    imageUrl: require("@/assets/sports/golf.jpg"),
  },
  {
    id: "13",
    name: "Anna Petrescu",
    role: "coach",
    organization: "Beachside Volleyball Club",
    location: "San Diego, CA, USA",
    country: "United States",
    distanceKm: 120,
    sport: "Volleyball",
    verified: true,
    tags: ["NCAA Div I", "AAU Director", "Setter Development"],
    imageUrl: require("@/assets/sports/volleyball.jpg"),
  },
  {
    id: "14",
    name: "Raj Patel",
    role: "agent",
    organization: "Maple Cricket Group",
    location: "Toronto, ON, Canada",
    country: "Canada",
    distanceKm: 75,
    sport: "Cricket",
    verified: false,
    tags: ["Cricket Canada", "T20 Specialist", "Youth Scouting"],
    imageUrl: require("@/assets/sports/cricket.jpg"),
  },
  {
    id: "15",
    name: "Sean O'Connor",
    role: "coach",
    organization: "Boston Rugby Academy",
    location: "Boston, MA, USA",
    country: "United States",
    distanceKm: 160,
    sport: "Rugby",
    verified: true,
    tags: ["MLR Network", "Forwards Specialist", "U19 National Coach"],
    imageUrl: require("@/assets/sports/rugby.jpg"),
  },
  {
    id: "16",
    name: "Tasha Brown",
    role: "coach",
    organization: "University of Oregon",
    location: "Eugene, OR, USA",
    country: "United States",
    distanceKm: 230,
    sport: "Track & Field",
    verified: true,
    tags: ["NCAA Div I", "USATF Certified", "Sprints & Hurdles"],
    imageUrl: require("@/assets/sports/track-field.jpg"),
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
  // --- Multi-sport demo athletes (theming/variety) ---
  // NOTE: photos below are bundled local sport images (assets/sports/*.jpg) for instant, offline
  // loading. Swap for real per-athlete photos (CDN/backend upload) in production.
  {
    id: "athlete-3",
    email: "athlete3@test.com",
    name: "Diego Hernandez",
    sport: "Soccer",
    position: "Striker",
    level: "NCAA Div I",
    location: "Los Angeles, CA, USA",
    country: "United States",
    distanceKm: 35,
    photos: [require("@/assets/sports/soccer.jpg")],
    videos: [],
    bio: "Two-footed striker with a nose for goal — 18g in 14 conference games.",
    classYear: "2026",
    height: "6'0\"",
    weight: "175 lbs",
    awards: ["All-Conference First Team 2025", "Golden Boot 2024"],
    profileViews: 62,
  },
  {
    id: "athlete-4",
    email: "athlete4@test.com",
    name: "Tyrese Jackson",
    sport: "Basketball",
    position: "Point Guard",
    level: "NCAA Div II",
    location: "Atlanta, GA, USA",
    country: "United States",
    distanceKm: 110,
    photos: [require("@/assets/sports/basketball.jpg")],
    videos: [],
    bio: "Pass-first PG averaging 7.8 APG. Vocal floor general with strong handle.",
    classYear: "2025",
    height: "6'2\"",
    weight: "185 lbs",
    awards: ["Conference Assist Leader 2025"],
    profileViews: 41,
  },
  {
    id: "athlete-5",
    email: "athlete5@test.com",
    name: "Ryan O'Brien",
    sport: "Baseball",
    position: "Pitcher",
    level: "NCAA Div I",
    location: "Tampa, FL, USA",
    country: "United States",
    distanceKm: 85,
    photos: [require("@/assets/sports/baseball.jpg")],
    videos: [],
    bio: "RHP topping 95 mph with developing slider. ERA 2.31 over 78 IP.",
    classYear: "2026",
    height: "6'4\"",
    weight: "210 lbs",
    awards: ["All-Region Pitcher 2025"],
    profileViews: 53,
  },
  {
    id: "athlete-6",
    email: "athlete6@test.com",
    name: "Liam Tremblay",
    sport: "Hockey",
    position: "Center",
    level: "CEGEP (Canada)",
    location: "Quebec City, QC, Canada",
    country: "Canada",
    distanceKm: 40,
    photos: [require("@/assets/sports/hockey.jpg")],
    videos: [],
    bio: "Two-way center with elite faceoff %. Eyeing U SPORTS programs for next year.",
    classYear: "2026",
    height: "6'1\"",
    weight: "195 lbs",
    awards: ["RSEQ All-Star 2025"],
    profileViews: 34,
  },
  {
    id: "athlete-7",
    email: "athlete7@test.com",
    name: "Ava Chen",
    sport: "Tennis",
    position: "Singles",
    level: "NCAA Div I",
    location: "Miami, FL, USA",
    country: "United States",
    distanceKm: 150,
    photos: [require("@/assets/sports/tennis.jpg")],
    videos: [],
    bio: "Top-50 ITF junior. Aggressive baseliner with a heavy forehand.",
    classYear: "2025",
    height: "5'8\"",
    weight: "135 lbs",
    awards: ["ITF Junior Top 50", "State Champion 2024"],
    profileViews: 71,
  },
  {
    id: "athlete-8",
    email: "athlete8@test.com",
    name: "Sofia Martinez",
    sport: "Swimming",
    position: "Freestyle",
    level: "High School",
    location: "Phoenix, AZ, USA",
    country: "United States",
    distanceKm: 65,
    photos: [require("@/assets/sports/swimming.jpg")],
    videos: [],
    bio: "Sprint freestyler — 50 free PR 22.94. Targeting NCAA Div I programs.",
    classYear: "2027",
    height: "5'10\"",
    weight: "150 lbs",
    awards: ["State Champion 50/100 Free 2025"],
    profileViews: 29,
  },
  {
    id: "athlete-9",
    email: "athlete9@test.com",
    name: "Ethan Park",
    sport: "Golf",
    position: "Amateur",
    level: "NCAA Div I",
    location: "Charlotte, NC, USA",
    country: "United States",
    distanceKm: 200,
    photos: [require("@/assets/sports/golf.jpg")],
    videos: [],
    bio: "Scratch golfer with three collegiate top-10 finishes this season.",
    classYear: "2026",
    height: "5'11\"",
    weight: "165 lbs",
    awards: ["Conference Medalist 2025"],
    profileViews: 38,
  },
  {
    id: "athlete-10",
    email: "athlete10@test.com",
    name: "Maya Patel",
    sport: "Volleyball",
    position: "Outside Hitter",
    level: "NCAA Div II",
    location: "Denver, CO, USA",
    country: "United States",
    distanceKm: 95,
    photos: [require("@/assets/sports/volleyball.jpg")],
    videos: [],
    bio: "6-rotation OH with strong defensive instincts. 3.8 kills/set in conference.",
    classYear: "2026",
    height: "6'0\"",
    weight: "160 lbs",
    awards: ["All-Conference Second Team 2025"],
    profileViews: 44,
  },
  {
    id: "athlete-11",
    email: "athlete11@test.com",
    name: "Arjun Singh",
    sport: "Cricket",
    position: "All-rounder",
    level: "CEGEP (Canada)",
    location: "Montreal, QC, Canada",
    country: "Canada",
    distanceKm: 55,
    photos: [require("@/assets/sports/cricket.jpg")],
    videos: [],
    bio: "Right-arm medium-fast all-rounder. Captained provincial U19 side last summer.",
    classYear: "2026",
    height: "5'11\"",
    weight: "170 lbs",
    awards: ["Quebec U19 Player of the Year 2024"],
    profileViews: 22,
  },
  {
    id: "athlete-12",
    email: "athlete12@test.com",
    name: "Jamal Foster",
    sport: "Rugby",
    position: "Flanker",
    level: "College",
    location: "Berkeley, CA, USA",
    country: "United States",
    distanceKm: 70,
    photos: [require("@/assets/sports/rugby.jpg")],
    videos: [],
    bio: "Openside flanker — high motor, strong over the ball. Eyes MLR pathway.",
    classYear: "2026",
    height: "6'2\"",
    weight: "215 lbs",
    awards: ["West Coast 7s MVP 2025"],
    profileViews: 31,
  },
  {
    id: "athlete-13",
    email: "athlete13@test.com",
    name: "Aaliyah Robinson",
    sport: "Track & Field",
    position: "Sprints",
    level: "NCAA Div I",
    location: "Eugene, OR, USA",
    country: "United States",
    distanceKm: 240,
    photos: [require("@/assets/sports/track-field.jpg")],
    videos: [],
    bio: "100m PR 11.18 / 200m PR 22.74. Anchored conference-champion 4x100 relay.",
    classYear: "2025",
    height: "5'9\"",
    weight: "140 lbs",
    awards: ["Conference 100m Champion 2025", "NCAA Regionals Finalist"],
    profileViews: 58,
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
