/**
 * Parent-facing mock data
 * Used to power parent-specific profile and recruiter outreach examples.
 */

export interface ParentProfile {
  email: string;
  name: string;
  relationship: string;
  childAthleteEmail: string;
  childClassYear: string;
  location: string;
  bio: string;
}

export interface RecruiterParentOutreach {
  id: string;
  recruiterName: string;
  recruiterRole: 'Agent' | 'Coach';
  organization: string;
  childName: string;
  message: string;
  sentAt: string;
  verified: boolean;
  status: 'New' | 'In Review' | 'Responded';
  unreadCount: number;
}

export interface ParentChatMessage {
  id: string;
  sender: 'recruiter' | 'parent';
  text: string;
  sentAt: string;
}

export interface ParentChatThread {
  threadId: string;
  recruiterName: string;
  recruiterRole: 'Agent' | 'Coach';
  organization: string;
  childName: string;
  verified: boolean;
  messages: ParentChatMessage[];
}

export const mockParentProfiles: ParentProfile[] = [
  {
    email: 'parent1@test.com',
    name: 'Lisa Johnson',
    relationship: 'Mother',
    childAthleteEmail: 'athlete1@test.com',
    childClassYear: 'Class of 2025',
    location: 'Austin, TX, USA',
    bio: 'Focused on finding the right academic and athletic fit for my son.',
  },
  {
    email: 'parent2@test.com',
    name: 'David Williams',
    relationship: 'Father',
    childAthleteEmail: 'athlete2@test.com',
    childClassYear: 'Class of 2026',
    location: 'Paris, France',
    bio: 'Helping my son evaluate programs with long-term player development.',
  },
];

export const mockParentRecruiterOutreach: Record<string, RecruiterParentOutreach[]> = {
  'parent1@test.com': [
    {
      id: 'outreach-1',
      recruiterName: 'Sarah Williams',
      recruiterRole: 'Coach',
      organization: 'State University',
      childName: 'Marcus Johnson',
      message:
        "Hi Ms. Johnson, we'd like to invite Marcus to our spring evaluation camp after reviewing his quarterback tape.",
      sentAt: '2h ago',
      verified: true,
      status: 'New',
      unreadCount: 2,
    },
    {
      id: 'outreach-2',
      recruiterName: 'Mike Thompson',
      recruiterRole: 'Agent',
      organization: 'Elite Sports Agency',
      childName: 'Marcus Johnson',
      message:
        'Marcus fits what NFL programs are asking for at QB. Happy to schedule a call to discuss his recruiting timeline.',
      sentAt: 'Yesterday',
      verified: true,
      status: 'In Review',
      unreadCount: 0,
    },
    {
      id: 'outreach-3',
      recruiterName: 'Coach Davis',
      recruiterRole: 'Coach',
      organization: 'Premier High School',
      childName: 'Marcus Johnson',
      message:
        "We can offer a competitive offseason training slot for Marcus. Let me know if you're open to a virtual meeting.",
      sentAt: '3d ago',
      verified: true,
      status: 'Responded',
      unreadCount: 0,
    },
  ],
  'parent2@test.com': [
    {
      id: 'outreach-4',
      recruiterName: 'Jennifer Park',
      recruiterRole: 'Agent',
      organization: 'Next Level Sports',
      childName: 'Jake Williams',
      message:
        "Jake's speed profile stands out. We can help map NCAA opportunities and combine preparation.",
      sentAt: '5h ago',
      verified: true,
      status: 'New',
      unreadCount: 1,
    },
  ],
};

export const mockParentChatThreads: Record<string, ParentChatThread> = {
  'outreach-1': {
    threadId: 'outreach-1',
    recruiterName: 'Sarah Williams',
    recruiterRole: 'Coach',
    organization: 'State University',
    childName: 'Marcus Johnson',
    verified: true,
    messages: [
      {
        id: 'outreach-1-m1',
        sender: 'recruiter',
        text: "Hi Ms. Johnson, we'd like to invite Marcus to our spring evaluation camp after reviewing his quarterback tape.",
        sentAt: '9:12 AM',
      },
      {
        id: 'outreach-1-m2',
        sender: 'parent',
        text: 'Thank you, Coach. Could you share the camp dates and eligibility requirements?',
        sentAt: '9:28 AM',
      },
      {
        id: 'outreach-1-m3',
        sender: 'recruiter',
        text: 'Absolutely. Camp is March 22-24. I will send the full packet and registration link.',
        sentAt: '9:31 AM',
      },
    ],
  },
  'outreach-2': {
    threadId: 'outreach-2',
    recruiterName: 'Mike Thompson',
    recruiterRole: 'Agent',
    organization: 'Elite Sports Agency',
    childName: 'Marcus Johnson',
    verified: true,
    messages: [
      {
        id: 'outreach-2-m1',
        sender: 'recruiter',
        text: 'Marcus fits what NFL programs are asking for at QB. Happy to schedule a call to discuss his recruiting timeline.',
        sentAt: 'Yesterday',
      },
      {
        id: 'outreach-2-m2',
        sender: 'parent',
        text: 'Appreciate it. We are focused on academics first. What does your advising process look like?',
        sentAt: 'Yesterday',
      },
    ],
  },
  'outreach-3': {
    threadId: 'outreach-3',
    recruiterName: 'Coach Davis',
    recruiterRole: 'Coach',
    organization: 'Premier High School',
    childName: 'Marcus Johnson',
    verified: true,
    messages: [
      {
        id: 'outreach-3-m1',
        sender: 'recruiter',
        text: "We can offer a competitive offseason training slot for Marcus. Let me know if you're open to a virtual meeting.",
        sentAt: '3d ago',
      },
      {
        id: 'outreach-3-m2',
        sender: 'parent',
        text: 'We are open to that. Please send available times next week.',
        sentAt: '3d ago',
      },
    ],
  },
  'outreach-4': {
    threadId: 'outreach-4',
    recruiterName: 'Jennifer Park',
    recruiterRole: 'Agent',
    organization: 'Next Level Sports',
    childName: 'Jake Williams',
    verified: true,
    messages: [
      {
        id: 'outreach-4-m1',
        sender: 'recruiter',
        text: "Jake's speed profile stands out. We can help map NCAA opportunities and combine preparation.",
        sentAt: '11:04 AM',
      },
      {
        id: 'outreach-4-m2',
        sender: 'parent',
        text: 'Thanks Jennifer, would love to review your athlete development plan and references.',
        sentAt: '11:19 AM',
      },
    ],
  },
};
