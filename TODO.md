# GetDraft Rebrand - Implementation TODO

**Project:** MyRoster → GetDraft  
**Started:** February 2026  
**Status:** In Progress

---

## Phase 1: Foundation & Branding

### 1.1 App Configuration
- [ ] Update `app.json` - Change name, slug, scheme to "getdraft"
- [ ] Update `package.json` - Change project name
- [x] Rename folder from "myroster" to "getdraft" ✅ **COMPLETED**
- [x] Rename parent folder from "MyRoster" to "GetDraft" ✅ **COMPLETED**

### 1.2 Brand Colors & Assets
- [x] Update `config/colors.ts` - Add GetDraft black/white palette (#121212, #FFFFFF) ✅ **COMPLETED**
- [ ] Replace all logo assets in `assets/` folder
  - [x] `logo_white.png` (already added) ✅ **COMPLETED**
  - [ ] `Logo.png` → `logo.png` (new GetDraft logo)
  - [ ] `Logo-two.png` → `logo_text.png` (new typography logo)
  - [ ] Update icon.png, splash-icon.png, favicon.png
- [ ] Update `config/assets.ts` - Update all asset references

### 1.3 Core Screens - Branding Update
- [x] **Splash Screen** - Black (#121212) background, white logo ✅ **COMPLETED**
  - Removed image background
  - Set background to #121212 (black)
  - Using white logo: `assets/logo_white.png`
  - Simplified styles, removed overlay
  - Updated brand references
- [ ] Welcome Screen - Update slides with GetDraft content
- [ ] Auth Screen - Update branding, add 4 role options

---

## Phase 2: User Roles & Authentication

### 2.1 Auth System Updates
- [ ] Update `store/slices/authSlice.ts` - Add 'parent' and 'coach' roles
- [ ] Create user role types file `types/user.ts`
- [ ] Update auth screen with 4 role selection cards:
  - [ ] Athlete ($550/year)
  - [ ] Parent (Included or $250/year)
  - [ ] Coach ($250/year)
  - [ ] Recruiter/Agent ($250/year)

### 2.2 Onboarding Flows
- [ ] **Athlete Onboarding** (5 steps)
  - [ ] Step 1: Personal info
  - [ ] Step 2: Athletic profile
  - [ ] Step 3: Media & highlights
  - [ ] Step 4: Recruiting goals
  - [ ] Step 5: Profile review
- [ ] **Parent Onboarding** (4 steps)
  - [ ] Step 1: Parent info
  - [ ] Step 2: Link to athlete
  - [ ] Step 3: Permissions setup
  - [ ] Step 4: Notifications
- [ ] **Coach Onboarding** (4 steps)
  - [ ] Step 1: Coach profile
  - [ ] Step 2: Scouting preferences
  - [ ] Step 3: Organization verification
  - [ ] Step 4: Preferences
- [ ] **Recruiter/Agent Onboarding** (4 steps)
  - [ ] Step 1: Recruiter profile
  - [ ] Step 2: Certification & verification
  - [ ] Step 3: Recruitment preferences
  - [ ] Step 4: Advanced settings

---

## Phase 3: Backend Setup (Supabase)

### 3.1 Database Schema
- [ ] Create `users` table
- [ ] Create `athlete_profiles` table
- [ ] Create `parent_profiles` table
- [ ] Create `coach_profiles` table
- [ ] Create `recruiter_profiles` table
- [ ] Create `swipes` table
- [ ] Create `matches` table
- [ ] Create `messages` table
- [ ] Create `subscriptions` table (Stripe integration)

### 3.2 Row Level Security (RLS)
- [ ] Set up RLS policies for all tables
- [ ] Configure user authentication with Supabase Auth
- [ ] Set up Realtime subscriptions for chat

### 3.3 Stripe Integration
- [ ] Set up Stripe account and API keys
- [ ] Create Stripe products and prices
  - [ ] Athlete: $550/year
  - [ ] Parent: $250/year
  - [ ] Coach: $250/year
  - [ ] Recruiter/Agent: $250/year
- [ ] Implement Stripe Checkout flow
- [ ] Set up webhooks for payment events
- [ ] Create subscription management API

---

## Phase 4: Core Features

### 4.1 Profile Management
- [ ] Athlete profile screen (view/edit)
- [ ] Coach profile screen (view/edit)
- [ ] Recruiter profile screen (view/edit)
- [ ] Parent dashboard screen
- [ ] Profile completeness calculator
- [ ] Media upload (photos/videos)
- [ ] External video links (HUDL, YouTube)

### 4.2 Swipe Feed (Coach/Recruiter)
- [ ] Build swipe interface component
- [ ] Implement swipe gestures (left/right)
- [ ] Create athlete card component
- [ ] Add feed filters
- [ ] Implement feed ranking algorithm
- [ ] Add "View Full Profile" modal

### 4.3 Matching System
- [ ] Swipe action handler (like/pass)
- [ ] Match creation logic (mutual interest)
- [ ] Athlete match approval flow
- [ ] Parent match approval (if enabled)
- [ ] "It's a Match!" notification screen
- [ ] Match list screen

### 4.4 Messaging
- [ ] Create chat screen (1:1)
- [ ] Implement Supabase Realtime for messages
- [ ] Add typing indicators
- [ ] Add read receipts
- [ ] Message input component
- [ ] Media sharing in chat
- [ ] Document sharing (for recruiters)

---

## Phase 5: Role-Specific Features

### 5.1 Parent Features
- [ ] Parent-athlete linking flow
- [ ] Parent dashboard
- [ ] Match monitoring
- [ ] Message oversight (if permitted)
- [ ] Permission management settings

### 5.2 Coach Features
- [ ] Favorites/watchlist
- [ ] Add notes to saved athletes
- [ ] Export watchlist (CSV)
- [ ] Scouting preferences editor

### 5.3 Recruiter/Agent Features
- [ ] Shortlist/board (Kanban view)
- [ ] Pipeline stages
- [ ] Private athlete notes
- [ ] Deal status tracking
- [ ] Export shortlist (CSV, PDF)

### 5.4 Admin Dashboard
- [ ] Dashboard metrics overview
- [ ] User management (CRUD)
- [ ] Content moderation queue
- [ ] Subscription management
- [ ] Analytics reports
- [ ] Platform settings

---

## Phase 6: Notifications & Communication

### 6.1 Push Notifications
- [ ] Set up Expo Notifications
- [ ] New match notification
- [ ] New message notification
- [ ] Match request notification (for athletes)
- [ ] Profile view notification (optional)

### 6.2 Email Notifications
- [ ] Set up email service (SendGrid/Postmark)
- [ ] Welcome email template
- [ ] Credentials email (after payment)
- [ ] Password reset email
- [ ] Weekly activity summary
- [ ] Subscription reminders

---

## Phase 7: Safety & Moderation

### 7.1 Safety Features
- [ ] Block user functionality
- [ ] Report user/content functionality
- [ ] Content moderation system (AI + manual)
- [ ] Age verification for minors (16-17)
- [ ] Parental controls for minor accounts

### 7.2 Verification System
- [ ] Coach/organization verification flow
- [ ] Agent license verification
- [ ] Verified badge display
- [ ] Document upload and review

---

## Phase 8: Polish & Optimization

### 8.1 UI/UX Polish
- [ ] Loading states for all screens
- [ ] Error states and error handling
- [ ] Empty states for lists
- [ ] Skeleton loaders
- [ ] Smooth transitions and animations
- [ ] Dark mode support (if needed)

### 8.2 Performance
- [ ] Image optimization
- [ ] Video loading optimization
- [ ] Feed pagination
- [ ] Message pagination
- [ ] Profile caching
- [ ] Reduce bundle size

### 8.3 Analytics
- [ ] Integrate analytics (Mixpanel/Amplitude)
- [ ] Track user events:
  - [ ] Swipes
  - [ ] Matches
  - [ ] Messages sent
  - [ ] Profile views
  - [ ] Subscription events

---

## Phase 9: Testing & QA

### 9.1 Unit Tests
- [ ] Redux slices tests
- [ ] Utility functions tests
- [ ] Component tests

### 9.2 Integration Tests
- [ ] Auth flow tests
- [ ] Matching flow tests
- [ ] Payment flow tests

### 9.3 E2E Tests
- [ ] Complete user flows for each role
- [ ] Cross-platform testing (iOS/Android)

### 9.4 Manual QA
- [ ] Test all user flows
- [ ] Test edge cases
- [ ] Test error scenarios
- [ ] Performance testing
- [ ] Accessibility testing

---

## Phase 10: Launch Preparation

### 10.1 App Store Setup
- [ ] iOS App Store listing
  - [ ] Screenshots
  - [ ] App description
  - [ ] Keywords
  - [ ] Privacy policy
  - [ ] Terms of service
- [ ] Google Play Store listing
  - [ ] Screenshots
  - [ ] App description
  - [ ] Keywords
  - [ ] Privacy policy
  - [ ] Terms of service

### 10.2 Marketing
- [ ] Landing page (getdraft.com)
- [ ] Demo video
- [ ] Social media accounts
- [ ] Press kit

### 10.3 Documentation
- [x] WORKFLOW.md - Complete user workflow documentation
- [ ] API documentation
- [ ] Admin documentation
- [ ] User guides/FAQs

---

## Current Priority

**✅ Completed:**
- [x] Phase 1.3: Splash Screen - Black background (#121212), white logo
- [x] Phase 1.1: Renamed folders (myroster → getdraft, MyRoster → GetDraft)
- [x] Phase 1.2: Updated brand colors to GetDraft palette

**Now Working On:**
- [ ] Phase 1.1: Update app.json configuration
- [ ] Phase 1.2: Replace remaining brand assets

**Next Up:**
- [ ] Phase 1.3: Update Welcome Screen
- [ ] Phase 2.1: Update auth system with new roles

---

## Notes

- Logo file: `assets/logo_white.png` (white logo on transparent background)
- Color palette: Black (#121212) and White (#FFFFFF) as primary brand colors
- App name: **GetDraft** (formerly MyRoster)
- Platform: Expo/React Native (iOS & Android)
- Backend: Supabase
- Payments: Stripe

---

**Last Updated:** February 6, 2026
