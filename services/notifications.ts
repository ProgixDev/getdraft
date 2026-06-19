import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "./api";

// The Expo push token registered for the CURRENT user, remembered so we can
// de-register it on logout. Without this, after user A logs out and user B
// logs in on the same device the token stays mapped to A and A keeps getting
// B's pushes (registerToken upserts on (user_id, token)).
const ACTIVE_PUSH_TOKEN_KEY = "active_push_token";

export const notificationsService = {
  async registerToken(
    token: string,
    platform: "ios" | "android",
  ): Promise<void> {
    await api.post("/notifications/register-token", { token, platform });
    try {
      await AsyncStorage.setItem(ACTIVE_PUSH_TOKEN_KEY, token);
    } catch {
      // remembering the token is best-effort
    }
  },

  async removeToken(token: string): Promise<void> {
    await api.delete("/notifications/token", { data: { token } });
  },

  /**
   * De-register the device's push token for the current user. Must run while
   * the access token is still valid (i.e. BEFORE clearing auth on logout).
   * Best-effort: never throws.
   */
  async deregisterActiveToken(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem(ACTIVE_PUSH_TOKEN_KEY);
      if (token) {
        await api.delete("/notifications/token", { data: { token } });
      }
      await AsyncStorage.removeItem(ACTIVE_PUSH_TOKEN_KEY);
    } catch {
      // best-effort de-registration
    }
  },

  async getNotifications(): Promise<any[]> {
    const { data } = await api.get("/notifications");
    return data.data;
  },
};
