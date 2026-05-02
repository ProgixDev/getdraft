// Row types aligned with backend/src/database/migrations/*.sql.
// Source of truth: the SQL migrations. Update this file whenever a new
// migration changes a table.

import {
  OutreachStatus,
  PlanId,
  RecruiterRoleType,
  SubscriptionStatus,
  SwipeDirection,
  UserRole,
} from './index';

export type Iso8601 = string;
export type Uuid = string;

export interface UserRow {
  id: Uuid;
  email: string;
  name: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_onboarded: boolean;
  plan_id: PlanId;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  location: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  is_banned: boolean;
  created_at: Iso8601;
  updated_at: Iso8601;
}

export interface AthleteProfileRow {
  id: Uuid;
  user_id: Uuid;
  sport: string;
  position: string | null;
  level: string | null;
  bio: string | null;
  class_year: string | null;
  gpa: number | null;
  height: string | null;
  weight: string | null;
  forty_yard_dash: string | null;
  awards: string[];
  photos: string[];
  videos: string[];
  profile_views: number;
  likes_received: number;
  profile_completion: number;
  created_at: Iso8601;
  updated_at: Iso8601;
}

export interface RecruiterProfileRow {
  id: Uuid;
  user_id: Uuid;
  organization: string;
  sport: string;
  role_type: RecruiterRoleType;
  verified: boolean;
  tags: string[];
  bio: string | null;
  photos: string[];
  videos: string[];
  created_at: Iso8601;
  updated_at: Iso8601;
}

export interface ParentProfileRow {
  id: Uuid;
  user_id: Uuid;
  relationship: string;
  child_athlete_id: Uuid | null;
  child_class_year: string | null;
  bio: string | null;
  created_at: Iso8601;
  updated_at: Iso8601;
}

export interface SwipeRow {
  id: Uuid;
  swiper_id: Uuid;
  swiped_id: Uuid;
  direction: SwipeDirection;
  created_at: Iso8601;
}

export interface MatchRow {
  id: Uuid;
  user_1_id: Uuid;
  user_2_id: Uuid;
  matched_at: Iso8601;
  is_active: boolean;
}

export interface BlockRow {
  id: Uuid;
  blocker_id: Uuid;
  blocked_id: Uuid;
  reason: string | null;
  created_at: Iso8601;
}

export interface ProfileViewRow {
  id: Uuid;
  viewer_id: Uuid;
  viewed_id: Uuid;
  created_at: Iso8601;
}

export interface OutreachRow {
  id: Uuid;
  recruiter_id: Uuid;
  parent_id: Uuid;
  child_athlete_id: Uuid;
  message: string;
  status: OutreachStatus;
  created_at: Iso8601;
  updated_at: Iso8601;
}

export interface OutreachMessageRow {
  id: Uuid;
  outreach_id: Uuid;
  sender_id: Uuid;
  text: string;
  is_read: boolean;
  created_at: Iso8601;
}

export interface MessageRow {
  id: Uuid;
  match_id: Uuid;
  sender_id: Uuid;
  text: string;
  is_read: boolean;
  created_at: Iso8601;
}

export interface SubscriptionRow {
  id: Uuid;
  user_id: Uuid;
  plan_id: PlanId;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  current_period_start: Iso8601 | null;
  current_period_end: Iso8601 | null;
  daily_swipe_limit: number;
  swipes_used_today: number;
  swipes_reset_at: string;
  created_at: Iso8601;
  updated_at: Iso8601;
}

export interface PushTokenRow {
  id: Uuid;
  user_id: Uuid;
  token: string;
  platform: 'ios' | 'android' | null;
  created_at: Iso8601;
}
