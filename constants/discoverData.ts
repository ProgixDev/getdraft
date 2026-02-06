/**
 * Mock data for Discover feed
 * Players discover recruiters (agents, coaches)
 * Replace with API data in production
 */

import { images, videos as videoAssets } from '@/config/assets';

export interface RecruiterCard {
  id: string;
  name: string;
  role: 'agent' | 'coach';
  organization: string;
  location: string;
  sport: string;
  verified: boolean;
  tags: string[];
  imageUrl: string | null;
}

export const mockRecruiters: RecruiterCard[] = [
  {
    id: '1',
    name: 'Mike Thompson',
    role: 'agent',
    organization: 'Elite Sports Agency',
    location: 'Los Angeles, CA',
    sport: 'American Football',
    verified: true,
    tags: ['NFL Certified', '10+ Years', 'QB Specialist'],
    imageUrl:
      // Keyword search: sports agent / deal / handshake
      'https://images.unsplash.com/photo-1758599543278-32d9d073941e?auto=format&fit=crop&w=1200&h=1600&q=80',
  },
  {
    id: '2',
    name: 'Sarah Williams',
    role: 'coach',
    organization: 'State University',
    location: 'Austin, TX',
    sport: 'American Football',
    verified: true,
    tags: ['NCAA Div I', 'Offensive Coordinator', 'Recruiting'],
    imageUrl:
      // Keyword search: american football coach / headset / sideline
      'https://images.unsplash.com/photo-1762746301772-dc80ac6beffe?auto=format&fit=crop&w=1200&h=1600&q=80',
  },
  {
    id: '3',
    name: 'James Rodriguez',
    role: 'agent',
    organization: 'Pro Draft Partners',
    location: 'Miami, FL',
    sport: 'American Football',
    verified: false,
    tags: ['NFLPA Certified', 'Combine Prep', 'Contract Negotiation'],
    imageUrl:
      // Keyword search: agent / negotiation / business handshake
      'https://images.unsplash.com/photo-1759310610325-2c7cb621e5e3?auto=format&fit=crop&w=1200&h=1600&q=80',
  },
  {
    id: '4',
    name: 'Coach Davis',
    role: 'coach',
    organization: 'Premier High School',
    location: 'Dallas, TX',
    sport: 'American Football',
    verified: true,
    tags: ['State Champions', 'College Pipeline', 'Skill Development'],
    imageUrl:
      // Keyword search: football coach / field / game day
      'https://images.unsplash.com/photo-1762757076979-cc016f6df284?auto=format&fit=crop&w=1200&h=1600&q=80',
  },
  {
    id: '5',
    name: 'Jennifer Park',
    role: 'agent',
    organization: 'Next Level Sports',
    location: 'Chicago, IL',
    sport: 'American Football',
    verified: true,
    tags: ['NFL Draft', 'Pro Day Prep', 'Agent of 5+ NFL Players'],
    imageUrl:
      // Keyword search: contract / signing / partnership
      'https://images.unsplash.com/photo-1758518731462-d091b0b4ed0d?auto=format&fit=crop&w=1200&h=1600&q=80',
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
  id: 'agent-1',
  email: 'agent@contact.com',
  name: 'Jubin',
  organization: 'Elite Sports Agency',
  location: 'Los Angeles, CA',
  sport: 'American Football',
  photos: [],
  videos: [],
  bio: 'NFL Certified Agent • 10+ years experience • QB Specialist',
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
  photos: MediaSource[];
  videos: MediaSource[];
  bio?: string;
}

export const mockAthletes: AthleteProfile[] = [
  {
    id: 'athlete-1',
    email: 'athlete1@test.com',
    name: 'Marcus Johnson',
    sport: 'American Football',
    position: 'Quarterback',
    level: 'NCAA Div I',
    location: 'Austin, TX',
    photos: [images.athlete1],
    videos: [videoAssets.athlete1],
    bio: 'Class of 2025 QB prospect',
  },
  {
    id: 'athlete-2',
    email: 'athlete2@test.com',
    name: 'Jake Williams',
    sport: 'American Football',
    position: 'Wide Receiver',
    level: 'High School',
    location: 'Miami, FL',
    photos: [images.athlete2],
    videos: [videoAssets.athlete2],
    bio: 'Speed receiver, 4.4 40-yard dash',
  },
];
