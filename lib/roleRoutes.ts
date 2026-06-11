import { useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

export type Role = "athlete" | "coach" | "recruiter" | "parent" | "admin";

/**
 * Bare tab name (e.g. "dashboard"), used as Tabs.initialRouteName in
 * app/(tabs)/_layout.tsx. The single source of truth — both the layout
 * and the focus-redirect hook below read from here.
 */
export function initialTabForRole(role: Role | undefined): string {
  if (role === "admin") return "dashboard";
  if (role === "parent") return "home";
  return "index";
}

/**
 * Full router-replace path (e.g. "/(tabs)/dashboard"). Derived from the
 * tab name above so the two cannot drift.
 */
export function homeRouteForRole(role: Role | undefined): string {
  const tab = initialTabForRole(role);
  if (tab === "index") return "/(tabs)";
  return `/(tabs)/${tab}`;
}

/**
 * Redirect the current user to their role's home if their role is NOT
 * in the allowed list. Runs on every focus (NOT just on mount), so
 * back-navigation from another screen re-triggers it — the old per-
 * screen useEffect copies fired once and then rendered null on re-
 * focus, leaving a blank screen.
 *
 * Pass the list of roles ALLOWED on the calling screen. Examples:
 *   useRoleHomeRedirect(['athlete'])                 // post-create
 *   useRoleHomeRedirect(['athlete','coach','recruiter'])  // discover
 *   useRoleHomeRedirect(['admin'])                   // dashboard
 *
 * Returns true while a redirect is being applied (or the role hasn't
 * loaded yet) so the screen can early-return null instead of flashing
 * its content for a frame.
 */
export function useRoleHomeRedirect(allowed: Role[]): boolean {
  const router = useRouter();
  const role = useSelector(
    (s: RootState) => s.auth.user?.role as Role | undefined,
  );

  useFocusEffect(
    useCallback(() => {
      if (!role) return;
      if (allowed.includes(role)) return;
      router.replace(homeRouteForRole(role) as any);
      // useFocusEffect cleanup is unused here.
      return;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, router, allowed.join(",")]),
  );

  if (!role) return true;
  return !allowed.includes(role);
}
