/**
 * Frontend Supabase client. Used ONLY for OAuth flows (Apple, Google).
 * Every other API call goes through our NestJS backend via services/api.ts.
 *
 * The anon key + URL are baked into the bundle from app.json.extra. Both
 * are intentionally public — the anon key is meant to be shipped to
 * clients; RLS enforces who can see what.
 */
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const supabaseUrl =
  (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl ?? '';
const supabaseAnonKey =
  (Constants.expoConfig?.extra as { supabaseAnonKey?: string } | undefined)?.supabaseAnonKey ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] supabaseUrl / supabaseAnonKey not set in app.json.extra — OAuth will fail.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
