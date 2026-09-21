# In-app products to create — spec

For whoever sets up App Store Connect and Play Console.

Purchases go through **StoreKit** on iOS and **Play Billing** on Android,
directly. There is no third-party billing service. Stripe stays for web only.

**The product IDs below must match exactly on both stores.** One code path
serves iOS and Android and looks products up by ID, so a typo on one store
means that product silently fails on that platform alone.

---

## Products

### Subscriptions — auto-renewable, monthly

Four tiers, priced by the client on 2026-09-11.

| Product ID | Name | Price | What it unlocks |
|---|---|---|---|
| *(none — the free tier is not a product)* | Free | — | 20 Drafts, 1 Super Draft / month, top 10 of each ranking |
| `starter_monthly` | Starter | **USD 3.99 / month** | 60 Drafts, 2 Super Drafts / month, advanced filters, full rankings |
| `pro_monthly` | Pro | **USD 7.99 / month** | Unlimited Drafts, 5 Super Drafts / month, advanced filters, full rankings, boosted visibility in Discover |
| `elite_monthly` | Elite | **USD 12.99 / month** | Unlimited Drafts, 10 Super Drafts / month, advanced filters, full rankings, top visibility in Discover |

> These match the **live** Stripe prices on web (`Starter` 3.99, `Pro` 7.99,
> `Elite` 12.99 in the client's Stripe account). Use exactly these so the same
> plan does not cost a different sum depending on where it was bought.
>
> Both stores price by tier rather than exact figure — pick the tier equal to
> USD 3.99 / 7.99 / 12.99 in the US storefront and let the store convert the
> rest.

All three belong to **one subscription group** (call it `GetDraft Membership`)
so a user can move between them instead of holding two.

Every feature in the table is enforced by the server (`PLAN_SWIPE_LIMITS`,
`SUPER_DRAFT_LIMITS`, `PLAN_FEATURES` in `backend/src/common/types`). Nothing
on a plan card is marketing only.

### Consumables — Draft packs

| Product ID | Name | Price | Grants |
|---|---|---|---|
| `drafts_10` | 10 Drafts | **$1.00** | 10 extra Drafts |
| `drafts_50` | 50 Drafts | **$4.00** | 50 extra Drafts |
| `drafts_100` | 100 Drafts | **$7.00** | 100 extra Drafts |

Type: **Consumable** on both stores — used up, and buyable again.

> Worth raising with the client before these go live: `drafts_100` at $7.00
> costs almost the same as Pro at $7.99, which gives *unlimited* Drafts every
> month plus 5 Super Drafts. Nobody rationally buys the pack at that price, and
> side by side it makes the pack look broken.

### The free tier is not a product

`basic` — 20 Drafts, 1 Super Draft per month, top 10 of each ranking — is the
default state of every account. Do **not** create a store product for it.

---

## iOS — App Store Connect

1. Create the six products above
2. Put the three subscriptions in one subscription group
3. Give every product a **display name, description and review screenshot** —
   Apple will not make a product available without them
4. **Sign the Paid Applications Agreement**, and complete tax and banking
5. Create a **sandbox tester**: Users and Access → Sandbox Testers

> ⚠️ **Step 4 is the one that catches everyone.** Until that agreement is
> *Active*, StoreKit returns **zero products**. The app shows an empty purchase
> screen with no error, and it looks exactly like a bug in the code. Check it
> says Active, not Pending.

**No keys or secrets are needed from Apple.** The server verifies StoreKit 2
receipts by checking the signature against Apple's certificate chain, so there
is no shared secret to create, send or leak.

---

## Android — Play Console

1. **Monetise → Subscriptions**: create `starter_monthly`, `pro_monthly` and `elite_monthly`
2. Add a **base plan** to each, monthly renewal, then **activate** it —
   creating the subscription alone leaves it invisible to the app
3. **Monetise → In-app products**: create the three `drafts_*` consumables
4. Complete the **merchant account**, tax and banking
5. **Setup → License testing**: add a test account so purchases can be made
   without real money

### One credential is needed

Unlike Apple, Google's purchase tokens are opaque — the server has to ask
Google whether one is real. That needs a service account:

```
Play Console → Setup → API access → create a service account
Grant it:  View financial data, orders, and cancellation survey responses
Download:  the JSON key
```

Send that JSON, and it goes into the backend as `GOOGLE_SERVICE_ACCOUNT_JSON`.

> Until it is set, Android purchase validation **fails closed** — the server
> refuses to grant rather than trusting the app. That is deliberate: without
> Google's confirmation, a purchase claim from a device is only a claim.

---

## Easy things to get wrong

**Same IDs on both stores.** `starter_monthly` on iOS must be exactly
`starter_monthly` on Android. Not `starter.monthly`, not `starter_monthly_v2`.

**Play needs the base plan activated**, not just the subscription created.

**Both stores need tax and banking finished** before any product leaves draft.

**Test with sandbox / licence-test accounts**, never a real card.

---

## What happens once these exist

The app and server code is already written and merged:

```
services/billing.ts          buys through StoreKit / Play Billing
POST /api/billing/validate   verifies the receipt with Apple or Google,
                             then grants the plan or the Drafts
```

To switch it on: set `EXPO_PUBLIC_IAP_ENABLED=1`, add
`GOOGLE_SERVICE_ACCOUNT_JSON` for Android, and rebuild both apps.

Until then both mobile platforms sell nothing, which is the safe state — an app
with no purchase flow passes review, an app with the wrong one does not.
