# AUDIT_REPORT — Backend GetDraft

> **Stack** : NestJS 11 (Fastify) + Supabase JS client (PostgREST + Auth + Storage) + Stripe v22.
> **ORM** : aucun. Le code parle à Supabase via `@supabase/supabase-js`.
> **Source de vérité unique** : 7 fichiers SQL dans `backend/src/database/migrations/`.
> **Validation globale** : `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` actif dans [src/main.ts](backend/src/main.ts).
> **Auth** : `JwtAuthGuard` global (token Supabase). `RolesGuard` global. WS gateway désormais authentifié.

Ce document est à la fois l'audit initial (Phase 0) et le journal des fixes (Phases 1-6). Chaque ligne du tableau de bugs a un statut : ✅ corrigé · ⏭️ skippé (raison).

---

## 1. Schéma reconstitué depuis les 7 migrations

| Table                | Colonnes notables (NOT NULL en gras)                                                                                                                                                                                                                                                                        | Contraintes                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `users`              | id (PK→auth.users), **email UNIQUE**, name, **role** ∈ {athlete, parent, coach, recruiter, admin}, avatar_url, is_onboarded(F), plan_id(basic) ∈ {basic, starter, pro, premium}, stripe_customer_id, stripe_subscription_id, location, country, latitude DOUBLE, longitude DOUBLE, is_banned(F), timestamps | trigger updated_at, trigger `on_auth_user_created`          |
| `athlete_profiles`   | id, **user_id UNIQUE**, **sport**, position, level, bio, class_year, gpa NUMERIC(3,2), height, weight, forty_yard_dash, awards[], photos[], videos[], profile_views, likes_received, profile_completion, timestamps                                                                                         | FK CASCADE                                                  |
| `recruiter_profiles` | id, **user_id UNIQUE**, **organization**, **sport**, **role_type** ∈ {agent, coach}, verified(F), tags[], bio, photos[], videos[], timestamps                                                                                                                                                               | FK CASCADE                                                  |
| `parent_profiles`    | id, **user_id UNIQUE**, **relationship**, child_athlete_id, child_class_year, bio, timestamps                                                                                                                                                                                                               | FK CASCADE                                                  |
| `swipes`             | id, swiper_id, swiped_id, **direction** ∈ {draft, pass}, created_at                                                                                                                                                                                                                                         | UNIQUE(swiper_id, swiped_id), CHECK swiper≠swiped (mig 008) |
| `matches`            | id, user_1_id, user_2_id, matched_at, is_active(T)                                                                                                                                                                                                                                                          | UNIQUE & CHECK user_1<user_2                                |
| `blocks`             | id, blocker_id, blocked_id, reason, created_at                                                                                                                                                                                                                                                              | UNIQUE(blocker_id, blocked_id)                              |
| `profile_views`      | id, viewer_id, viewed_id, created_at                                                                                                                                                                                                                                                                        | —                                                           |
| `outreach`           | id, recruiter_id, parent_id, **child_athlete_id**, **message**, status('New') ∈ {New, In Review, Responded}, timestamps                                                                                                                                                                                     | UNIQUE(recruiter_id, parent_id)                             |
| `outreach_messages`  | id, outreach_id, sender_id, **text**, is_read(F), created_at                                                                                                                                                                                                                                                | —                                                           |
| `messages`           | id, match_id, sender_id, **text**, is_read(F), created_at                                                                                                                                                                                                                                                   | —                                                           |
| `subscriptions`      | id, **user_id UNIQUE**, **plan_id**(basic), stripe*subscription_id, stripe_price_id, **status**(active) ∈ {active, canceled, past_due, trialing}, current_period*\*, **daily_swipe_limit**(10), swipes_used_today(0), swipes_reset_at(CURRENT_DATE), timestamps                                             | + CHECK plan_id (mig 008)                                   |
| `push_tokens`        | id, user_id, token, platform ∈ {ios, android}, created_at                                                                                                                                                                                                                                                   | UNIQUE(user_id, token)                                      |

RPCs : `increment_profile_views`, `increment_likes_received`, `increment_swipes_used`. Toutes les tables ont RLS — bypass via `service_role` côté backend.

Les types TS de chaque row sont désormais formalisés dans [src/common/types/database.types.ts](backend/src/common/types/database.types.ts).

---

## 2. Endpoints (état après fixes)

| Endpoint                                                                                                                   | Méthode | Statut |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| `/api/auth/{signup,login,verify-email,refresh,forgot-password,logout}`                                                     | POST    | ✅     |
| `/api/users/me`, `/me/onboarding`, `/me/blocks` ⭐, `/me/profile-views` ⭐                                                 | GET/PUT | ✅     |
| `/api/users/:id`, `/:id/view`, `/:id/block` (DTO `reason`), `/:id/block` DELETE 204                                        | —       | ✅     |
| `/api/profiles/{athlete,recruiter,parent}`                                                                                 | GET/PUT | ✅     |
| `/api/profiles/:userId`                                                                                                    | GET     | ✅     |
| `/api/discover/feed`, `/swipe`, `/who-drafted-me` (plan lu en BDD)                                                         | —       | ✅     |
| `/api/matches`, `/:id`, DELETE `/:id` (204)                                                                                | —       | ✅     |
| `/api/outreach` POST/GET, `/:id` GET (avec relations), `/:id/status` PUT, `/:id/messages` GET/POST, `/:id` DELETE ⭐ (204) | —       | ✅     |
| `/api/chat/threads`, `/threads/:matchId/messages` GET/POST, `/threads/:matchId/read`                                       | —       | ✅     |
| `/api/subscriptions/me`, `/checkout`, `/portal`, webhook `/webhooks/stripe`                                                | —       | ✅     |
| `/api/notifications/register-token`, `/token` (DTO RemoveTokenDto, 204)                                                    | —       | ✅     |
| `/api/uploads/signed-url` (DTO SignedUrlDto), DELETE `/uploads` (DTO DeleteFileDto, scope userId/)                         | —       | ✅     |
| `/api/stats/globe`, `/welcome`, `/profile/:userId` (par rôle)                                                              | —       | ✅     |
| `/api/admin/users`, `/users/:id/verify`, `/users/:id/ban`, `/stats` (404 si introuvable)                                   | —       | ✅     |

⭐ = endpoints ajoutés en Phase 2.

---

## 3. Bugs trouvés et fixes appliqués

### 🔴 Critiques

| #   | Source                                                                                                                                                                                                                                         | Fix                                                                                                                                                                                                                                         | Statut |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | [uploads.controller.ts](backend/src/modules/uploads/uploads.controller.ts) → `deleteFile` body brut, aucun check de propriétaire du `path`                                                                                                     | DTO `DeleteFileDto` + service vérifie `path.startsWith(userId/)` sinon `ForbiddenException` ([uploads.service.ts:42](backend/src/modules/uploads/uploads.service.ts#L42))                                                                   | ✅     |
| C2  | [uploads.controller.ts](backend/src/modules/uploads/uploads.controller.ts) → `getSignedUrl` body sans DTO                                                                                                                                      | DTO `SignedUrlDto` (bucket whitelist + `@Matches` regex anti-traversal sur fileName, sanitisation côté service)                                                                                                                             | ✅     |
| C3  | [chat.gateway.ts](backend/src/modules/chat/chat.gateway.ts) → `userId` du handshake non vérifié                                                                                                                                                | Auth Bearer-token dans `handleConnection` via `supabase.auth.getUser`, déconnexion si invalide. `userId` sourcé de `client.data.userId`. Vérif d'appartenance au match avant `join_thread`.                                                 | ✅     |
| C4  | [discover.service.ts](backend/src/modules/discover/discover.service.ts) → self-swipe possible                                                                                                                                                  | `BadRequestException('Cannot swipe yourself')` au début de `swipe()` + CHECK SQL `swipes_no_self_swipe` (mig 008)                                                                                                                           | ✅     |
| C5  | Idem → swipe sur user bloqué (deux directions)                                                                                                                                                                                                 | Pré-check `blocks` (OR sur les deux sens) → `ForbiddenException('Cannot swipe a blocked user')`                                                                                                                                             | ✅     |
| C6  | [subscriptions.service.ts](backend/src/modules/subscriptions/subscriptions.service.ts) → Stripe v22 a déplacé `current_period_*`, `trial_end`, `cancel_at`, `canceled_at` dans `items.data[0]`. Plus `trial_end`/`cancel_at`/etc. à reprendre. | Helper `toIso()` + lecture via `sub.items?.data?.[0]?.current_period_*` (avec optional chaining), persistance de `stripe_price_id`, fallback `Stripe.subscriptions.retrieve` dans `checkout.session.completed` pour récupérer les périodes. | ✅     |

### 🟠 Importants

| #   | Source                                                          | Fix                                                                                                                                                                       | Statut |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I1  | `whoDraftedMe` plan hardcodé `'pro'`                            | Service lit `subscriptions.plan_id` de la BDD à chaque appel ([discover.service.ts:289](backend/src/modules/discover/discover.service.ts#L289))                           | ✅     |
| I2  | `blocks.reason` jamais persisté                                 | DTO `BlockUserDto` (optional, `@MaxLength(1000)`), insert avec `reason ?? null` ([users.service.ts:139](backend/src/modules/users/users.service.ts#L139))                 | ✅     |
| I3  | `chat.sendMessage` jetait `NotFoundException` sur erreur insert | Remplacé par `BadRequestException`                                                                                                                                        | ✅     |
| I4  | `createOutreach` insère outreach + message sans transaction     | Compensating delete sur `outreach` si l'insert `outreach_messages` échoue ([outreach.service.ts:69](backend/src/modules/outreach/outreach.service.ts#L69))                | ✅     |
| I5  | `outreach.sendMessage` pas de gestion d'erreur insert           | `BadRequestException(error.message)` ajouté                                                                                                                               | ✅     |
| I6  | `getOutreach(:id)` ne renvoyait pas les relations               | Désormais joint recruiter + recruiter_profile + parent + child                                                                                                            | ✅     |
| I7  | `RegisterTokenDto.platform` utilisait `as any`                  | Enum `PushPlatform` (ajoutée à `common/types`) + `@MaxLength(255)` sur token                                                                                              | ✅     |
| I8  | `removeToken(@Body('token'))` sans DTO                          | DTO `RemoveTokenDto`                                                                                                                                                      | ✅     |
| I9  | `logout(@Body('accessToken'))` sans DTO                         | DTO `LogoutDto`, fallback sur header Bearer                                                                                                                               | ✅     |
| I10 | `getProfileStats` ne lit qu'`athlete_profiles`                  | Branchement par `users.role` + count de `profile_views` pour les non-athlètes                                                                                             | ✅     |
| I11 | `dbQuery.not('id', 'in', ...)` mal escapé                       | Inchangé pour l'instant — exclu si `allExcluded.length === 0`. Note : valeurs étant des UUIDs, l'injection PostgREST est limitée. À revoir si on autorise du texte libre. | ⏭️     |
| I12 | Cards recruteurs sans bio/photos/videos                         | Ajoutés dans `getRecruiterFeed` mapping                                                                                                                                   | ✅     |
| I13 | `distanceKm: 0` hardcodé                                        | Hors scope (TODO haversine)                                                                                                                                               | ⏭️     |
| I14 | `trackProfileView` non-déduplication                            | Hors scope (cas d'usage = analytics, doublons OK) ; index `idx_profile_views_viewer_viewed` ajouté pour permettre dedup futur                                             | ⏭️     |
| I15 | Webhook checkout sans transaction                               | Compensating skip de `users.update` si `subscriptions.update` échoue + log d'erreur                                                                                       | ✅     |
| I16 | `stripe_price_id` jamais persisté                               | Lecture de `items.data[0].price.id` lors de `checkout.session.completed` et `customer.subscription.updated`                                                               | ✅     |

### 🟡 Moyens

| #       | Source                                                     | Fix                                                                                         | Statut              |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| M1      | `@Param('id')` non-UUID                                    | `ParseUUIDPipe` ajouté dans : matches, profiles, users, outreach, admin                     | ✅                  |
| M2      | `updated_at` injecté manuellement (redondant avec trigger) | Retiré dans users + profiles + outreach + subscriptions                                     | ✅                  |
| M3      | DELETE renvoyait 200 + body                                | `@HttpCode(204)` + interceptor n'enveloppe plus quand status=204 ou data=undefined          | ✅                  |
| M5      | `TransformInterceptor` détection fragile                   | Réécrit pour utiliser le `statusCode` réel + `data === undefined`                           | ✅                  |
| M6      | `console.log` dans `main.ts`                               | Remplacé par `Logger('Bootstrap')`                                                          | ✅                  |
| M7      | `verifyRecruiter` ne checkait pas le row                   | `select('id')` + `NotFoundException` si vide                                                | ✅ (idem `banUser`) |
| M9      | `daily_swipe_limit = 10` dupliqué                          | `PLAN_SWIPE_LIMITS[PlanId.BASIC]` utilisé dans webhook ; reste de la dette à voir plus tard | ⏭️ partiel          |
| M10     | `auth.signOut` sur client public au lieu d'admin           | Désormais sur `getAdminClient()`                                                            | ✅                  |
| M11     | Rôle JWT ≠ rôle BDD si promoté                             | Hors scope (impacterait l'auth) — à tracker                                                 | ⏭️                  |
| M12-M14 | `error.code === '23505'` → `BadRequestException`           | Remplacé par `ConflictException` (409) dans discover/users/outreach                         | ✅                  |

### 🟢 Mineurs / observations

- **N5 Logger** : ajouté `Logger` dans `DiscoverService`, `OutreachService`, `SubscriptionsService`, `NotificationsService`, `ChatGateway` pour les warnings/erreurs structurées.
- **Tests** : les 5 spec files (`auth/discover/chat/matches/subscriptions`) ont été adaptés au nouveau comportement (mocks `maybeSingle`, `auth.admin.signOut` sur admin client, signature `whoDraftedMe`, ConflictException). **45/45 tests passent**.

---

## 4. Persistance — diff final DTO ↔ BDD

| Entité                  | Tous les champs DTO sont persistés ?                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| users PUT /me           | ✅                                                                                                                 |
| athlete_profiles PUT    | ✅                                                                                                                 |
| recruiter_profiles PUT  | ✅                                                                                                                 |
| parent_profiles PUT     | ✅                                                                                                                 |
| swipes POST             | ✅                                                                                                                 |
| blocks POST             | ✅ (`reason` désormais persisté)                                                                                   |
| profile_views POST      | ✅                                                                                                                 |
| outreach POST           | ✅                                                                                                                 |
| outreach_messages POST  | ✅                                                                                                                 |
| messages POST           | ✅                                                                                                                 |
| subscriptions (webhook) | ✅ (`stripe_price_id`, `current_period_*` corrects en v22, `stripe_subscription_id` synchronisé sur `users` aussi) |
| push_tokens POST        | ✅                                                                                                                 |

Plus aucun champ client n'est silencieusement ignoré.

---

## 5. Migration 008 — fichier produit

[`src/database/migrations/008_audit_constraints_and_indexes.sql`](backend/src/database/migrations/008_audit_constraints_and_indexes.sql) (également agrégée dans [`MIGRATIONS_TO_RUN.sql`](backend/MIGRATIONS_TO_RUN.sql) à la racine du backend).

```sql
-- 1. Defense-in-depth against self-swipe (the service blocks it too).
ALTER TABLE public.swipes
  DROP CONSTRAINT IF EXISTS swipes_no_self_swipe;
ALTER TABLE public.swipes
  ADD CONSTRAINT swipes_no_self_swipe CHECK (swiper_id <> swiped_id);

-- 2. CHECK on subscriptions.plan_id mirrors users.plan_id (consistency).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_check
  CHECK (plan_id IN ('basic', 'starter', 'pro', 'premium'));

-- 3. Index for subscription lookup by Stripe subscription id (used in webhooks).
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- 4. Index for unique (viewer, viewed) profile-view dedup queries.
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_viewed
  ON public.profile_views(viewer_id, viewed_id, created_at DESC);
```

⚠️ **À exécuter manuellement** : ouvre ton outil SQL favori et colle [`MIGRATIONS_TO_RUN.sql`](backend/MIGRATIONS_TO_RUN.sql) — c'est non-destructif (DROP CONSTRAINT IF EXISTS / CREATE INDEX IF NOT EXISTS).

---

## 6. Livrables produits

- [`AUDIT_REPORT.md`](backend/AUDIT_REPORT.md) — ce document.
- [`MIGRATIONS_TO_RUN.sql`](backend/MIGRATIONS_TO_RUN.sql) — SQL prêt à exécuter (1 seule migration 008).
- [`API_TESTS.http`](backend/API_TESTS.http) — REST Client compatible, ordonné top-to-bottom, avec `@name` sur chaque create + GET de vérification + PATCH + DELETE.
- Code : voir les commits atomiques par domaine (cf. `git log`).
- Build & tests : `npm run build` ✅ — `npm test` ✅ (45/45).

---

## 7. Skipped (pour décisions futures)

- **Multi-tenancy / tenancy** — explicitement out of scope.
- **Logger structuré (pino)** — Nest `Logger` standard utilisé pour ne pas alourdir les deps.
- **Rate-limiting** signup/login/swipe — à mettre en place avec `@nestjs/throttler` quand prêt.
- **Cache pour `whoDraftedMe` plan** — choix Q2 : pas de cache, lecture DB systématique.
- **Distance haversine** sur les feeds (`distanceKm: 0` hardcodé) — feature à implémenter quand UI prête.
- **JWT role mismatch DB** (M11) — un user promu admin via DB doit refresh son token. À documenter pour l'ops.
