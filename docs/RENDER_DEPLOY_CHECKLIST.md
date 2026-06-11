# Render deploy checklist — GetDraft backend

Redeploy of `getdraft-api` on Render with the onboarding-billing port.
Repo: `render.yaml` at repo root (rootDir `backend`; build
`npm install --include=dev && npm run build` — `--include=dev` is REQUIRED
or `nest build` fails under `NODE_ENV=production`; start `node dist/main`;
Render injects `PORT`, do **not** set it).

## 1. Environment variables (names only — copy values from `backend/.env`)

Set in the Render dashboard ("Environment" tab). Every name below is
templated in `backend/.env.example` unless noted.

### Server
| Name | Note |
|---|---|
| `NODE_ENV` | **`production`** — this also hard-disables the TEST_PHONES OTP bypass |
| `PORT` | ❌ do NOT set — Render injects it |

### Database (Prisma — not in .env.example, copy from backend/.env)
| Name | Note |
|---|---|
| `DATABASE_URL` | use the **6543 pooler** URL (Supavisor), not direct 5432 |

### Supabase
| Name | Note |
|---|---|
| `SUPABASE_URL` | |
| `SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | |
| `SUPABASE_JWT_SECRET` | |

### Stripe
| Name | Note |
|---|---|
| `STRIPE_SECRET_KEY` | test key until launch |
| `STRIPE_WEBHOOK_SECRET` | the **dashboard endpoint's** `whsec_…` (see §3), NOT a Stripe-CLI one |
| `STRIPE_PUBLISHABLE_KEY` | |
| `STRIPE_PRICE_STARTER` | |
| `STRIPE_PRICE_PRO` | |
| `STRIPE_PRICE_PREMIUM` | legacy, still read by config — keep set |

### Email (SMTP)
| Name |
|---|
| `SMTP_HOST` |
| `SMTP_PORT` |
| `SMTP_USER` |
| `SMTP_PASS` |
| `MAIL_FROM` |

### Auth / OTP
| Name | Note |
|---|---|
| `AUTH_VERIFICATION_SECRET` | |
| `TWILIO_ACCOUNT_SID` | |
| `TWILIO_API_KEY_SID` | |
| `TWILIO_API_KEY_SECRET` | |
| `TWILIO_VERIFY_SERVICE_SID` | |
| `TEST_PHONES` | **leave EMPTY on Render** — never ship the purge/bypass allowlist |

### KYC (Didit)
| Name | Note |
|---|---|
| `DIDIT_API_KEY` | |
| `DIDIT_WORKFLOW_ID` | |
| `DIDIT_WEBHOOK_SECRET` | required in production (signature checks skip when unset) |
| `PUBLIC_BACKEND_URL` | **the Render URL itself** (`https://getdraft-api.onrender.com`) — Didit redirect target |

### Guardian linking
| Name | Note |
|---|---|
| `GUARDIAN_QR_SECRET` | falls back to JWT_SECRET when unset — set it explicitly |

### Push
| Name | Note |
|---|---|
| `EXPO_ACCESS_TOKEN` | required for push sends from the server |

### App
| Name | Note |
|---|---|
| `FRONTEND_URL` | `getdraft://` |
| `CORS_ORIGINS` | |

## 2. Deploy + verify

1. Push branch / trigger deploy in the Render dashboard.
2. Wait for boot (free tier cold start ~50 s), then verify:
   - `GET https://getdraft-api.onrender.com/api/health` → `{"status":"ok"}`
   - New routes exist: `GET /api/guardian-links/me` **without** a token →
     expect **401** (route exists, auth required) — a **404** means the old
     build is still live.
   - `GET /api/subscriptions/swipe-packs` without a token → 401, same logic.
3. Warm the dyno before any client demo (free tier sleeps after ~15 min).

## 3. Stripe webhook (closes the local webhook gap)

1. Stripe dashboard → Developers → Webhooks → endpoint URL:
   `https://getdraft-api.onrender.com/api/webhooks/stripe`
2. Events: `invoice.paid`, `invoice.payment_succeeded`,
   `invoice.payment_failed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `payment_intent.succeeded`, `checkout.session.completed`.
3. Copy the endpoint's `whsec_…` into Render's `STRIPE_WEBHOOK_SECRET`
   and redeploy/restart. (If a Stripe-CLI secret was temporarily placed in
   `backend/.env` for local forwarding, restore the dashboard value there
   too.)

## 4. Supabase OAuth (still pending — Apple/Google untestable until done)

1. Supabase dashboard → Authentication → Providers → enable **Google** and
   **Apple** with their client IDs/secrets.
2. Authentication → URL Configuration → add redirect URL:
   `getdraft://auth/callback`
3. Until this is done, the Apple/Google buttons on the welcome screen will
   error — phone + email paths are unaffected.

## 5. App side after deploy

- Production builds point at Render via `EXPO_PUBLIC_API_URL` (eas.json) /
  the baked default in `services/api.ts` — no change needed if the URL is
  unchanged.
- Dev builds keep auto-targeting the LAN backend.
