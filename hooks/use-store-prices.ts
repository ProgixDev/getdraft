import { useEffect, useState } from "react";
import { USES_STORE_BILLING } from "@/constants/purchases";
import { fetchPacks, fetchSubscriptionProducts } from "@/services/billing";

/**
 * The store's own price for each product id, localised to the buyer's
 * storefront ("3,99 €", "£3.99"). Apple requires the price shown to be the one
 * StoreKit charges, so a hard-coded "$3.99" is wrong outside the US.
 *
 * Empty until loaded, and stays empty when a product is missing from the
 * store -- callers hide the buy button for a product with no price.
 */
export function useStorePrices(kind: "subs" | "packs"): {
  prices: Record<string, string>;
  loading: boolean;
} {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(USES_STORE_BILLING);

  useEffect(() => {
    if (!USES_STORE_BILLING) return;
    let cancelled = false;
    const load = kind === "subs" ? fetchSubscriptionProducts : fetchPacks;
    load()
      .then((products) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const p of products) next[p.id] = p.displayPrice;
        setPrices(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return { prices, loading };
}
