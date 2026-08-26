# In-app products to create — spec

For whoever sets up RevenueCat, App Store Connect and Play Console.

**The product IDs below must match exactly on both stores.** One code path
serves iOS and Android, and it looks products up by ID. A typo on one store
means that product silently fails on that platform only.

---

## 1. RevenueCat

Create a free account at revenuecat.com, then:

1. **Create a project** called `GetDraft`
2. Add both apps to it:
   - iOS — bundle ID `com.getdraft.app`
   - Android — package `com.getdraft.app`
3. Connect App Store Connect and Play Console (RevenueCat walks you through it)
4. **Send me the two public SDK keys** — one for iOS, one for Android.
   They look like `appl_xxxx` and `goog_xxxx`.

The public SDK keys are safe to share; they ship inside the app. Do **not**
send the secret API key.

---

## 2. Products

### Subscriptions — auto-renewable, monthly

| Product ID | Name | Price | What it unlocks |
|---|---|---|---|
| `starter_monthly` | Starter | **check Stripe** | Unlimited Drafts, 3 Super Drafts / month |
| `pro_monthly` | Pro | **check Stripe** | Unlimited Drafts, 5 Super Drafts / month |

> **Prices must match what Stripe already charges on web.** The live Stripe
> price IDs are in Railway as `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` —
> open them in the Stripe dashboard and copy the exact amount and currency.
> Charging a different amount per platform for the same plan will confuse users
> and complicate support.

Both go in one **subscription group** (call it `GetDraft Membership`) so users
can upgrade and downgrade between them rather than holding two at once.

### Consumables — Draft packs

These prices come from the backend and are authoritative:

| Product ID | Name | Price | Grants |
|---|---|---|---|
| `drafts_10` | 10 Drafts | **$1.00** | 10 extra Drafts |
| `drafts_50` | 50 Drafts | **$4.00** | 50 extra Drafts |
| `drafts_100` | 100 Drafts | **$7.00** | 100 extra Drafts |

Type: **Consumable** on both stores — they are used up and can be bought again.
Not subscriptions.

### The free tier is not a product

`basic` is the free plan: 20 Drafts and 1 Super Draft per month. Do **not**
create a store product for it. It is the default state of every account.

---

## 3. RevenueCat entitlements

In RevenueCat → Entitlements, create:

| Entitlement | Attach these products |
|---|---|
| `starter` | `starter_monthly` |
| `pro` | `pro_monthly` |

Draft packs need no entitlement — they are one-off grants, handled by the
webhook rather than by entitlement state.

Then create an **Offering** named `default` containing both subscriptions, so
the app can fetch what to display rather than hard-coding it.

---

## 4. Things that are easy to get wrong

**Same IDs on both stores.** `starter_monthly` on iOS must be `starter_monthly`
on Android. Not `starter.monthly`, not `starter_monthly_android`.

**App Store Connect needs more than the product.** Each subscription also
requires a localised display name, description, a review screenshot, and the
subscription group set up. Apple rejects incomplete product metadata.

**Play Console subscriptions need a base plan.** Creating the subscription is
not enough — add a base plan with the monthly renewal period and activate it,
or it stays invisible to the app.

**Tax and banking must be complete on both stores** before any product can go
live. If the client has not finished those forms, products stay in draft and
purchases fail with confusing errors.

**Test with sandbox accounts, not real cards.** App Store Connect → Users and
Access → Sandbox Testers. Play Console → Setup → License testing.

---

## 5. What happens after

Once the products exist and I have the two RevenueCat SDK keys, the app side is:

- replace the Stripe payment sheet with RevenueCat's purchase call
- a backend webhook granting the plan, reusing the entitlement code that
  already exists behind `/subscriptions/confirm`
- Stripe stays in place for web

Purchases then work on **both** iOS and Android through the stores' own
billing, which is what both Apple and Google require.
