/**
 * Mock users for development/testing
 * Remove in production - use real auth
 */

export interface MockUser {
  email: string;
  password: string;
  name: string;
  role: 'athlete' | 'parent' | 'coach' | 'recruiter';
}

export const MOCK_USERS: MockUser[] = [
  {
    email: 'agent@contact.com',
    password: 'agent123',
    name: 'Jubin',
    role: 'recruiter',
  },
  {
    email: 'athlete1@test.com',
    password: 'athlete123',
    name: 'Marcus Johnson',
    role: 'athlete',
  },
  {
    email: 'athlete2@test.com',
    password: 'athlete123',
    name: 'Jake Williams',
    role: 'athlete',
  },
];
