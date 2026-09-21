import { useEffect, useState } from "react";
import { subscriptionsService } from "@/services/subscriptions";

/**
 * The signed-in user's plan id, for UI that mirrors a server-side gate --
 * a lock on the advanced filters, the "see the full board" footer on the
 * rankings. The server enforces every gate regardless; this only decides
 * what to show.
 *
 * Cached per session so several screens do not each refetch. `null` while
 * unknown, so a screen can avoid flashing a lock at a paying user.
 */

const FREE = "basic";
let cached: string | null = null;
let fetchedAt = 0;
let inflight: Promise<string> | null = null;
const TTL_MS = 60_000;

export function loadPlanId(force = false): Promise<string> {
  const fresh = cached && Date.now() - fetchedAt < TTL_MS;
  if (fresh && !force) return Promise.resolve(cached as string);
  if (inflight) return inflight;
  inflight = subscriptionsService
    .getMySubscription()
    .then((sub: any) => {
      const id = String(sub?.plan_id ?? sub?.planId ?? FREE);
      cached = id;
      fetchedAt = Date.now();
      return id;
    })
    .catch(() => cached ?? FREE)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Call after a purchase or cancellation so the next read is current. */
export function invalidatePlanId() {
  fetchedAt = 0;
}

export function usePlanId(): string | null {
  const [plan, setPlan] = useState<string | null>(cached);
  useEffect(() => {
    let alive = true;
    loadPlanId().then((id) => {
      if (alive) setPlan(id);
    });
    return () => {
      alive = false;
    };
  }, []);
  return plan;
}

export function isFreePlan(planId: string | null): boolean {
  return planId === FREE;
}
