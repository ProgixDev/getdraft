import api, { saveTokens, clearTokens } from './api';
import type { UserRole } from '@/store/slices/authSlice';

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
  };
  isOnboarded: boolean;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  async signup(email: string, password: string, role: UserRole, name?: string): Promise<AuthResponse> {
    const { data } = await api.post('/auth/signup', { email, password, role, name });
    const result: AuthResponse = data.data;
    await saveTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post('/auth/login', { email, password });
    const result: AuthResponse = data.data;
    await saveTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  },

  async verifyEmail(token: string): Promise<void> {
    await api.post('/auth/verify-email', { token });
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email });
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      await clearTokens();
    }
  },
};
