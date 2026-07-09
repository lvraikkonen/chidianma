# Multi-Group Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Project override: Codex-created subagents are allowed only if the tool can explicitly enforce GPT-5.5. If GPT-5.5 cannot be enforced, do not create subagents; use inline execution with `superpowers:executing-plans`.

**Goal:** Build the first implementation slice for the multi-group prototype spec: signed identity/group sessions, group and membership persistence, invite-code join/create flows, and hard authorization invariants without wiring the full prototype UI yet.

**Architecture:** Add the multi-group auth and tenant boundary under `apps/server`, define shared contracts in `packages/shared`, and preserve the existing single-team MVP routes during migration. This plan creates the data and auth foundation that later plans will use for group-scoped restaurants, recommendation batches, participation, extension storage, and admin prototype pages.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, Prisma, PostgreSQL, Vitest, HMAC signed tokens, `packages/shared` API contracts.

**Status:** Approved for Execution

## Global Constraints

- Source spec: `specs/2026-07-08-multi-group-prototype-implementation-design.md`.
- Existing MVP spec and plan remain source of truth where this spec is silent.
- Preserve existing MVP behavior unless this plan explicitly changes it.
- Do not add email/password/OAuth or formal accounts.
- All `/api/groups/:groupId/*` new APIs require group session.
- `EXTENSION_READ_TOKEN` is not accepted as a cross-group read credential.
- Server permissions must use current database membership role/status, not token role/status.
- Removed memberships cannot be restored by invite-code join.
- Each active group must keep at least one active admin.
- New group GET APIs must not create recommendation batches.
- `identityToken` and `groupSessionToken` must be signed and expiring.
- `POST /api/groups` and `POST /api/groups/join` must reuse a valid optional `Authorization: Bearer <identityToken>` instead of always creating a new identity.
- Missing, invalid, tampered, or expired tokens must return 401, not 500.
- Removed memberships and insufficient roles must return 403 with stable error codes, not 500.
- Shared API contracts belong in `packages/shared`.
- Keep Fastify on Railway compatible with `host: "::"` and `port: Number(process.env.PORT ?? 3000)`.
- Do not create Codex subagents unless GPT-5.5 can be explicitly enforced.

---

## Scope Of This Plan

This plan implements phase 1 only:

- shared multi-group/auth contracts;
- Prisma schema and migration for identities, groups, memberships, settings, weights, batch headers/items, and group-scoped existing tables;
- signed identity and group token utilities;
- group create/join/list/session routes;
- membership authorization helpers and invariants;
- legacy default-group migration path.

This plan does not implement:

- group-scoped restaurant CRUD behavior changes beyond schema support;
- new recommendation batch generation algorithm;
- participation/feedback UI;
- extension storage migration;
- admin prototype page rebuild;
- dashboard aggregation.

Those should be separate plans after this foundation is merged.

## Stage 1 Acceptance Criteria

Stage 1 is complete only when:

- A browser identity can create two groups and `GET /api/groups` returns both.
- The same identity can join another group by invite code.
- `POST /api/groups/:groupId/session` returns a group-scoped session only for active memberships.
- Removed membership cannot rejoin with the same `identityToken` and receives 403/`removed_member`.
- Joining an already-active group is idempotent and returns a fresh session.
- Last active admin cannot be removed or downgraded.
- Stale group session tokens with old admin role claims lose admin access immediately after database role downgrade.
- Token missing, tampered, and expired cases return 401, not 500.
- Non-admin member patch returns 403.
- Existing legacy routes still pass existing tests.
- Legacy data is assigned to the default group or the migration explicitly documents what is deferred.
- `EXTENSION_READ_TOKEN` is not accepted by any new `/api/groups/:groupId/*` route.

## File Structure

- Modify: `packages/shared/src/types.ts`
  - Add shared group, membership, token, API error, and feedback `avoid` types.
- Modify: `packages/shared/src/api.ts`
  - Add group route constants and token header constants.
- Modify: `packages/shared/src/index.ts`
  - Re-export new contracts.
- Create: `packages/shared/tests/groupContracts.test.ts`
  - Lock in default role/status/feedback string unions and route constants.
- Modify: `apps/server/prisma/schema.prisma`
  - Add `Identity`, `LunchGroup`, `GroupMembership`, `GroupSettings`, `ScoringWeights`, `DailyRecommendationBatch`, `DailyRecommendationItem`.
  - Add `groupId` links and IDs needed by the new spec.
  - Keep the existing `DailyRecommendation` model usable for legacy MVP routes until the recommendation-batch plan rewires reads/writes to the new batch tables.
- Create: `apps/server/prisma/migrations/<timestamp>_multi_group_foundation/migration.sql`
  - Generated by Prisma after schema changes.
- Modify: `apps/server/prisma/seed.ts`
  - Seed default group and migrated sample data.
- Modify: `apps/server/src/env.ts`
  - Add `ALLOW_PUBLIC_GROUP_CREATION` and token TTL defaults.
- Create: `apps/server/src/services/auth/errors.ts`
  - Stable auth/domain errors mapped to HTTP 401/403/400.
- Create: `apps/server/src/services/auth/tokens.ts`
  - Signed token helpers for identity and group sessions.
- Create: `apps/server/src/services/groups/inviteCodes.ts`
  - Invite-code generation, hashing, and verification.
- Create: `apps/server/src/services/groups/memberships.ts`
  - Membership lookup, group authorization, last-admin invariant helpers.
- Create: `apps/server/src/routes/groups.ts`
  - Identity, create group, join group, list groups, and group session routes.
- Modify: `apps/server/src/routes/session.ts`
  - Keep legacy `/api/session` working by creating/using the default group.
- Modify: `apps/server/src/app.ts`
  - Register group routes.
- Create: `apps/server/tests/groupTokens.test.ts`
  - Token signature, expiry, tampering tests.
- Create: `apps/server/tests/groups.test.ts`
  - Group create/join/list/session and authorization invariant tests.
- Modify: `apps/server/tests/sessionToken.test.ts`
  - Keep old token tests passing or move shared cases to `groupTokens.test.ts`.
- Modify: `apps/server/.env.example`
  - Document new env vars.

---

### Task 1: Shared Multi-Group Contracts

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/groupContracts.test.ts`

**Interfaces:**
- Produces:
  - `GroupRole = "admin" | "member"`
  - `MembershipStatus = "active" | "removed"`
  - `GroupSummary`
  - `GroupSessionResponse`
  - `CreateIdentityRequest`
  - `CreateIdentityResponse`
  - `CreateGroupRequest`
  - `CreateGroupResponse`
  - `JoinGroupRequest`
  - `JoinGroupResponse`
  - `GroupsListResponse`
  - `RefreshGroupSessionResponse`
  - `ApiErrorResponse`
  - `FeedbackType = "want" | "skip" | "ate" | "avoid"`
  - `GROUP_ROUTES`
- Consumes: existing shared package build/test setup.

- [ ] **Step 1: Write shared contract tests**

Create `packages/shared/tests/groupContracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GROUP_ROUTES } from "../src/api";
import type { FeedbackType, GroupRole, MembershipStatus } from "../src/types";

describe("multi-group shared contracts", () => {
  it("locks group role and membership status strings", () => {
    const role: GroupRole = "admin";
    const memberRole: GroupRole = "member";
    const status: MembershipStatus = "active";
    const removed: MembershipStatus = "removed";

    expect([role, memberRole, status, removed]).toEqual(["admin", "member", "active", "removed"]);
  });

  it("uses avoid feedback for member-level avoid actions", () => {
    const types: FeedbackType[] = ["want", "skip", "ate", "avoid"];
    expect(types).toContain("avoid");
    expect(types).not.toContain("blocked" as FeedbackType);
  });

  it("defines group route builders without forceRefresh writes", () => {
    expect(GROUP_ROUTES.todayRecommendations("group-1")).toBe("/api/groups/group-1/today-recommendations");
    expect(GROUP_ROUTES.refreshTodayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations/refresh"
    );
  });
});
```

- [ ] **Step 2: Run the failing shared contract test**

Run:

```bash
pnpm --filter @lunch/shared test -- groupContracts.test.ts
```

Expected: FAIL because `GROUP_ROUTES`, `GroupRole`, and `MembershipStatus` do not exist and `FeedbackType` still includes `blocked`.

- [ ] **Step 3: Add shared types**

Modify `packages/shared/src/types.ts` to include these contracts while preserving existing recommendation types:

```ts
export type GroupRole = "admin" | "member";
export type MembershipStatus = "active" | "removed";
export type FeedbackType = "want" | "skip" | "ate" | "avoid";
export type WeatherTag = "rainy" | "hot" | "cold" | "clear" | "windy";
export type WeekdayTag = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
export type RestaurantStatus = "active" | "paused" | "blocked";

export interface GroupSummary {
  groupId: string;
  name: string;
  subtitle?: string | undefined;
  role: GroupRole;
  membershipId: string;
}

export interface GroupSessionResponse {
  identityToken: string;
  groupSessionToken: string;
  group: GroupSummary;
}

export interface CreateIdentityRequest {
  displayName: string;
}

export interface CreateIdentityResponse {
  identityId: string;
  identityToken: string;
}

export interface CreateGroupRequest {
  displayName?: string | undefined;
  groupName: string;
  subtitle?: string | undefined;
}

export interface CreateGroupResponse extends GroupSessionResponse {
  inviteCode: string;
}

export interface JoinGroupRequest {
  displayName?: string | undefined;
  inviteCode: string;
}

export type JoinGroupResponse = GroupSessionResponse;

export interface GroupsListResponse {
  groups: GroupSummary[];
}

export type RefreshGroupSessionResponse = GroupSessionResponse;

export interface ApiErrorResponse {
  error: string;
  message: string;
}
```

Keep the existing `RecommendationItem` and `TodayRecommendationResponse` for legacy routes. Later plans will replace or extend today response shape.

- [ ] **Step 4: Add route constants**

Modify `packages/shared/src/api.ts`:

```ts
export const LUNCH_HEADLINE = "吃饭才是正事，中午吃点啥呢？";
export const READ_TOKEN_HEADER = "x-lunch-read-token";
export const AUTHORIZATION_HEADER = "authorization";

export const GROUP_ROUTES = {
  identities: "/api/identities",
  groups: "/api/groups",
  joinGroup: "/api/groups/join",
  groupSession: (groupId: string) => `/api/groups/${groupId}/session`,
  todayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations`,
  refreshTodayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations/refresh`,
  restaurants: (groupId: string) => `/api/groups/${groupId}/restaurants`,
  recommendations: (groupId: string) => `/api/groups/${groupId}/recommendations`,
  recommendation: (groupId: string, recommendationId: string) =>
    `/api/groups/${groupId}/recommendations/${recommendationId}`,
  feedback: (groupId: string) => `/api/groups/${groupId}/feedback`,
  members: (groupId: string) => `/api/groups/${groupId}/members`
} as const;
```

- [ ] **Step 5: Ensure exports**

Modify `packages/shared/src/index.ts` so all contracts export:

```ts
export * from "./api";
export * from "./scoring";
export * from "./types";
```

- [ ] **Step 6: Run shared tests and typecheck**

Run:

```bash
pnpm --filter @lunch/shared test -- groupContracts.test.ts
pnpm --filter @lunch/shared typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/api.ts packages/shared/src/index.ts packages/shared/tests/groupContracts.test.ts
git commit -m "feat: add multi-group shared contracts"
```

---

### Task 2: Prisma Multi-Group Schema

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<timestamp>_multi_group_foundation/migration.sql`
- Modify: `apps/server/.env.example`

**Interfaces:**
- Consumes: shared names from Task 1.
- Produces: Prisma models `Identity`, `LunchGroup`, `GroupMembership`, `GroupSettings`, `ScoringWeights`, `DailyRecommendationBatch`, `DailyRecommendationItem`.

- [ ] **Step 1: Update Prisma enums**

Modify `apps/server/prisma/schema.prisma`:

```prisma
enum RestaurantStatus {
  active
  paused
  blocked
}

enum FeedbackType {
  want
  skip
  ate
  avoid
}

enum GroupRole {
  admin
  member
}

enum MembershipStatus {
  active
  removed
}

enum RecommendationBatchSource {
  auto
  manual
  legacy
}

enum ParticipationStatus {
  undecided
  joining
  away
  decided
}
```

- [ ] **Step 2: Add group models**

Add to `apps/server/prisma/schema.prisma`:

```prisma
model Identity {
  id          String            @id @default(cuid())
  displayName String            @map("display_name")
  createdAt   DateTime          @default(now()) @map("created_at")
  lastSeenAt  DateTime?         @map("last_seen_at")
  memberships GroupMembership[]
  createdGroups LunchGroup[]    @relation("CreatedGroups")

  @@map("identities")
}

model LunchGroup {
  id                  String                @id @default(cuid())
  name                String
  subtitle            String?
  inviteCodeHash      String                @map("invite_code_hash")
  inviteCodeRotatedAt DateTime              @default(now()) @map("invite_code_rotated_at")
  inviteCodeVersion   Int                   @default(1) @map("invite_code_version")
  createdByIdentityId String                @map("created_by_identity_id")
  officeTimezone      String                @map("office_timezone")
  officeCity          String                @map("office_city")
  officeLatitude      Float                 @map("office_latitude")
  officeLongitude     Float                 @map("office_longitude")
  createdAt           DateTime              @default(now()) @map("created_at")
  updatedAt           DateTime              @updatedAt @map("updated_at")
  createdBy           Identity              @relation("CreatedGroups", fields: [createdByIdentityId], references: [id])
  memberships         GroupMembership[]
  settings            GroupSettings?
  scoringWeights      ScoringWeights?
  restaurants         Restaurant[]
  recommendations     Recommendation[]
  dailyRecommendations DailyRecommendation[]
  batches             DailyRecommendationBatch[]
  participation       DailyParticipation[]
  feedback            Feedback[]
  weatherSnapshots    WeatherSnapshot[]

  @@map("lunch_groups")
}

model GroupMembership {
  id          String           @id @default(cuid())
  groupId     String           @map("group_id")
  identityId  String           @map("identity_id")
  role        GroupRole
  status      MembershipStatus @default(active)
  joinedAt    DateTime         @default(now()) @map("joined_at")
  removedAt   DateTime?        @map("removed_at")
  group       LunchGroup       @relation(fields: [groupId], references: [id])
  identity    Identity         @relation(fields: [identityId], references: [id])
  createdRestaurants Restaurant[]
  createdRecommendations Recommendation[]
  participation DailyParticipation[]
  feedback     Feedback[]
  generatedBatches DailyRecommendationBatch[]

  @@unique([groupId, identityId])
  @@index([identityId])
  @@map("group_memberships")
}

model GroupSettings {
  groupId                String   @id @map("group_id")
  reminderTime           String   @default("11:30") @map("reminder_time")
  weekdayReminderEnabled Boolean  @default(true) @map("weekday_reminder_enabled")
  secondReminderEnabled  Boolean  @default(false) @map("second_reminder_enabled")
  notificationTitle      String   @default("吃饭才是正事，中午吃点啥呢？") @map("notification_title")
  notificationGroupLabel String?  @map("notification_group_label")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")
  group                  LunchGroup @relation(fields: [groupId], references: [id])

  @@map("group_settings")
}

model ScoringWeights {
  groupId                   String   @id @map("group_id")
  weekdayMatch              Int      @default(20) @map("weekday_match")
  weatherMatch              Int      @default(25) @map("weather_match")
  distance                  Int      @default(20)
  teammateRecommendation    Int      @default(10) @map("teammate_recommendation")
  recentDuplicatePenalty    Int      @default(12) @map("recent_duplicate_penalty")
  negativeFeedbackPenalty   Int      @default(10) @map("negative_feedback_penalty")
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")
  group                     LunchGroup @relation(fields: [groupId], references: [id])

  @@map("scoring_weights")
}
```

- [ ] **Step 3: Add group links to existing models without breaking legacy routes**

Update existing models in `apps/server/prisma/schema.prisma`:

```prisma
model Restaurant {
  id                   String                @id @default(cuid())
  groupId              String                @map("group_id")
  name                 String
  area                 String?
  address              String?
  distanceMinutes      Int?                  @map("distance_minutes")
  cuisine              String?
  priceBand            String?               @map("price_band")
  averagePriceCents    Int?                  @map("average_price_cents")
  supportsDineIn       Boolean               @default(true) @map("supports_dine_in")
  supportsTakeout      Boolean               @default(false) @map("supports_takeout")
  tags                 String[]
  status               RestaurantStatus      @default(active)
  createdByMembershipId String?              @map("created_by_membership_id")
  createdAt            DateTime              @default(now()) @map("created_at")
  updatedAt            DateTime              @updatedAt @map("updated_at")
  group                LunchGroup            @relation(fields: [groupId], references: [id])
  createdByMembership  GroupMembership?      @relation(fields: [createdByMembershipId], references: [id])
  recommendations      Recommendation[]
  dailyRecommendations DailyRecommendation[]
  dailyRecommendationItems DailyRecommendationItem[]
  feedback             Feedback[]

  @@index([groupId, name, area])
  @@map("restaurants")
}
```

Also update these existing models explicitly. Keep `Teammate`, nullable legacy teammate links, and `DailyRecommendation` temporarily for legacy route compatibility until a later recommendation-batch plan rewires reads/writes to the new batch tables:

```prisma
model Recommendation {
  id                    String                @id @default(cuid())
  groupId               String                @map("group_id")
  restaurantId          String                @map("restaurant_id")
  teammateId            String?               @map("teammate_id")
  createdByMembershipId String?               @map("created_by_membership_id")
  dish                  String?
  reason                String
  weatherTags           String[]              @map("weather_tags")
  weekdayTags           String[]              @map("weekday_tags")
  moodTags              String[]              @map("mood_tags")
  createdAt             DateTime              @default(now()) @map("created_at")
  updatedAt             DateTime              @updatedAt @map("updated_at")
  group                 LunchGroup            @relation(fields: [groupId], references: [id])
  restaurant            Restaurant            @relation(fields: [restaurantId], references: [id])
  teammate              Teammate?             @relation(fields: [teammateId], references: [id])
  createdByMembership   GroupMembership?      @relation(fields: [createdByMembershipId], references: [id])
  dailyRecommendations  DailyRecommendation[]
  dailyRecommendationItems DailyRecommendationItem[]
  feedback              Feedback[]

  @@index([groupId, restaurantId])
  @@index([groupId, createdByMembershipId])
  @@map("recommendations")
}

model DailyRecommendation {
  id               String          @id @default(cuid())
  groupId          String          @map("group_id")
  date             String
  batchId          String          @map("batch_id")
  restaurantId     String          @map("restaurant_id")
  recommendationId String?         @map("recommendation_id")
  score            Int
  reason           String
  isCurrent        Boolean         @default(true) @map("is_current")
  createdAt        DateTime        @default(now()) @map("created_at")
  group            LunchGroup      @relation(fields: [groupId], references: [id])
  restaurant       Restaurant      @relation(fields: [restaurantId], references: [id])
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])

  @@index([groupId, date, isCurrent])
  @@map("daily_recommendations")
}

model WeatherSnapshot {
  id                       String   @id @default(cuid())
  groupId                  String   @map("group_id")
  date                     String
  city                     String
  temperatureC             Float?   @map("temperature_c")
  condition                String
  precipitationProbability Int?     @map("precipitation_probability")
  windLevel                String?  @map("wind_level")
  rawPayload               Json?    @map("raw_payload")
  createdAt                DateTime @default(now()) @map("created_at")
  group                    LunchGroup @relation(fields: [groupId], references: [id])

  @@unique([groupId, date, city])
  @@map("weather_snapshots")
}

model Feedback {
  id               String          @id @default(cuid())
  groupId          String          @map("group_id")
  officeDate       String          @map("office_date")
  restaurantId     String          @map("restaurant_id")
  recommendationId String?         @map("recommendation_id")
  teammateId       String?         @map("teammate_id")
  membershipId     String?         @map("membership_id")
  type             FeedbackType
  createdAt        DateTime        @default(now()) @map("created_at")
  group            LunchGroup      @relation(fields: [groupId], references: [id])
  restaurant       Restaurant      @relation(fields: [restaurantId], references: [id])
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])
  teammate         Teammate?       @relation(fields: [teammateId], references: [id])
  membership       GroupMembership? @relation(fields: [membershipId], references: [id])

  @@index([groupId, officeDate, restaurantId])
  @@index([groupId, officeDate, type])
  @@map("feedback")
}
```

- [ ] **Step 4: Add batch and participation models**

Add:

```prisma
model DailyParticipation {
  id               String    @id @default(cuid())
  groupId          String    @map("group_id")
  officeDate       String    @map("office_date")
  membershipId     String    @map("membership_id")
  status           ParticipationStatus @default(undecided)
  restaurantId     String?   @map("restaurant_id")
  recommendationId String?   @map("recommendation_id")
  decidedAt        DateTime? @map("decided_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")
  group            LunchGroup @relation(fields: [groupId], references: [id])
  membership       GroupMembership @relation(fields: [membershipId], references: [id])

  @@unique([groupId, officeDate, membershipId])
  @@map("daily_participation")
}

model DailyRecommendationBatch {
  id                       String                    @id @default(cuid())
  groupId                  String                    @map("group_id")
  officeDate               String                    @map("office_date")
  batchNo                  Int                       @map("batch_no")
  source                   RecommendationBatchSource
  generatedByMembershipId  String?                   @map("generated_by_membership_id")
  weatherSnapshotId        String?                   @map("weather_snapshot_id")
  scoringWeightsSnapshot   Json                      @map("scoring_weights_snapshot")
  algorithmVersion         String                    @map("algorithm_version")
  isCurrent                Boolean                   @default(true) @map("is_current")
  createdAt                DateTime                  @default(now()) @map("created_at")
  group                    LunchGroup                @relation(fields: [groupId], references: [id])
  generatedByMembership    GroupMembership?          @relation(fields: [generatedByMembershipId], references: [id])
  items                    DailyRecommendationItem[]

  @@unique([groupId, officeDate, batchNo])
  @@index([groupId, officeDate, isCurrent])
  @@map("daily_recommendation_batches")
}

model DailyRecommendationItem {
  id               String   @id @default(cuid())
  batchId          String   @map("batch_id")
  rank             Int
  restaurantId     String   @map("restaurant_id")
  recommendationId String?  @map("recommendation_id")
  score            Int
  scoreBreakdown   Json     @map("score_breakdown")
  reason           String
  createdAt        DateTime @default(now()) @map("created_at")
  batch            DailyRecommendationBatch @relation(fields: [batchId], references: [id])
  restaurant       Restaurant @relation(fields: [restaurantId], references: [id])
  recommendation   Recommendation? @relation(fields: [recommendationId], references: [id])

  @@unique([batchId, rank])
  @@index([batchId])
  @@map("daily_recommendation_items")
}
```

- [ ] **Step 5: Generate migration and inspect legacy backfill**

Run:

```bash
pnpm --filter @lunch/server prisma migrate dev --name multi_group_foundation
```

Expected: Prisma creates a migration under `apps/server/prisma/migrations/*_multi_group_foundation/`.

Before committing, inspect the generated SQL and edit it if needed so existing MVP data is migrated safely:

```sql
-- Required migration shape:
-- 1. create default identity/group/membership/settings/weights if not exists
-- 2. add group_id columns to legacy tables as nullable
-- 3. backfill old rows with seed-group-default
-- 4. migrate feedback.type = 'blocked' to 'avoid'
-- 5. add foreign keys and indexes
-- 6. set group_id NOT NULL after backfill
```

Do not commit a migration that adds non-null `group_id` foreign keys to populated
legacy tables before backfilling them.

- [ ] **Step 6: Update env example**

Modify `apps/server/.env.example` to include:

```dotenv
ALLOW_PUBLIC_GROUP_CREATION=true
IDENTITY_TOKEN_TTL_DAYS=90
GROUP_SESSION_TTL_DAYS=14
```

- [ ] **Step 7: Run Prisma validation and server typecheck**

Run:

```bash
pnpm --filter @lunch/server prisma validate
pnpm --filter @lunch/server typecheck
```

Expected: PASS. If TypeScript reports missing generated Prisma model or enum types, run `pnpm --filter @lunch/server prisma generate`, then rerun the same command before continuing.

- [ ] **Step 8: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations apps/server/.env.example
git commit -m "feat: add multi-group prisma foundation"
```

---

### Task 3: Signed Identity And Group Tokens

**Files:**
- Create: `apps/server/src/services/auth/errors.ts`
- Create: `apps/server/src/services/auth/tokens.ts`
- Create: `apps/server/tests/groupTokens.test.ts`
- Modify: `apps/server/src/env.ts`

**Interfaces:**
- Consumes: `SESSION_SECRET`, `IDENTITY_TOKEN_TTL_DAYS`, `GROUP_SESSION_TTL_DAYS`.
- Produces:
  - `signIdentityToken(payload, secret): string`
  - `verifyIdentityToken(token, secret): IdentityTokenClaims`
  - `signGroupSessionToken(payload, secret): string`
  - `verifyGroupSessionToken(token, secret): GroupSessionClaims`
  - `AuthError` for stable HTTP error mapping

- [ ] **Step 1: Add env fields**

Modify `apps/server/src/env.ts`:

```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TEAM_INVITE_CODE: z.string().min(1),
  SESSION_SECRET: z.string().min(8),
  EXTENSION_READ_TOKEN: z.string().min(1),
  ALLOW_PUBLIC_GROUP_CREATION: z.coerce.boolean().default(true),
  IDENTITY_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  GROUP_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  WEATHER_API_BASE_URL: z.string().url().default("https://api.open-meteo.com/v1"),
  OFFICE_CITY: z.string().min(1).default("Shanghai"),
  OFFICE_LATITUDE: z.coerce.number().default(31.2304),
  OFFICE_LONGITUDE: z.coerce.number().default(121.4737),
  OFFICE_TIMEZONE: z.string().min(1).default("Asia/Shanghai"),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000)
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const env = EnvSchema.parse(source);
  if (env.NODE_ENV === "production" && env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 chars in production");
  }
  return env;
}
```

- [ ] **Step 2: Add auth error type**

Create `apps/server/src/services/auth/errors.ts`:

```ts
export type AuthErrorCode = "unauthorized" | "forbidden" | "bad_request";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly error: string,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}
```

- [ ] **Step 3: Write token tests**

Create `apps/server/tests/groupTokens.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/services/auth/errors";
import {
  signGroupSessionToken,
  signIdentityToken,
  verifyGroupSessionToken,
  verifyIdentityToken
} from "../src/services/auth/tokens";

describe("multi-group signed tokens", () => {
  it("verifies signed identity and group tokens before expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T04:00:00.000Z"));

    const identity = signIdentityToken({ identityId: "identity-1", exp: Date.now() + 60_000 }, "session-secret");
    expect(verifyIdentityToken(identity, "session-secret")).toEqual({
      identityId: "identity-1",
      exp: Date.now() + 60_000
    });

    const group = signGroupSessionToken(
      {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "admin",
        exp: Date.now() + 60_000
      },
      "session-secret"
    );
    expect(verifyGroupSessionToken(group, "session-secret")).toEqual({
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "admin",
      exp: Date.now() + 60_000
    });

    vi.useRealTimers();
  });

  it("rejects tampered and expired group tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T04:00:00.000Z"));

    const token = signGroupSessionToken(
      {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member",
        exp: Date.now() + 60_000
      },
      "session-secret"
    );
    const [payload] = token.split(".");

    expect(() => verifyGroupSessionToken(`${payload}.bad-signature`, "session-secret")).toThrow(AuthError);

    vi.setSystemTime(new Date("2026-07-08T04:02:00.000Z"));
    expect(() => verifyGroupSessionToken(token, "session-secret")).toThrow(AuthError);

    vi.useRealTimers();
  });

  it("rejects malformed claim shapes", () => {
    const malformed = signIdentityToken({ identityId: "", exp: Date.now() + 60_000 }, "session-secret");
    expect(() => verifyIdentityToken(malformed, "session-secret")).toThrow(AuthError);
  });
});
```

- [ ] **Step 4: Run failing token tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupTokens.test.ts
```

Expected: FAIL because `services/auth/tokens.ts` does not exist.

- [ ] **Step 5: Implement signed token helpers**

Create `apps/server/src/services/auth/tokens.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { GroupRole } from "@lunch/shared";
import { AuthError } from "./errors.js";

export interface IdentityTokenClaims {
  identityId: string;
  exp: number;
}

export interface GroupSessionClaims {
  identityId: string;
  groupId: string;
  membershipId: string;
  role: GroupRole;
  exp: number;
}

function signPayload(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyPayload<T>(token: string, secret: string): T {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token");
  }

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token signature");
  }

  let claims: T & { exp?: number };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T & { exp?: number };
  } catch {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token payload");
  }

  if (typeof claims.exp !== "number" || claims.exp <= Date.now()) {
    throw new AuthError("unauthorized", "expired_token", "Token expired");
  }
  return claims as T;
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AuthError("unauthorized", "invalid_token", `Invalid token ${field}`);
  }
}

function assertGroupRole(value: unknown): asserts value is GroupRole {
  if (value !== "admin" && value !== "member") {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token role");
  }
}

export function signIdentityToken(claims: IdentityTokenClaims, secret: string): string {
  return signPayload(claims, secret);
}

export function verifyIdentityToken(token: string, secret: string): IdentityTokenClaims {
  const claims = verifyPayload<IdentityTokenClaims>(token, secret);
  assertString(claims.identityId, "identityId");
  return claims;
}

export function signGroupSessionToken(claims: GroupSessionClaims, secret: string): string {
  return signPayload(claims, secret);
}

export function verifyGroupSessionToken(token: string, secret: string): GroupSessionClaims {
  const claims = verifyPayload<GroupSessionClaims>(token, secret);
  assertString(claims.identityId, "identityId");
  assertString(claims.groupId, "groupId");
  assertString(claims.membershipId, "membershipId");
  assertGroupRole(claims.role);
  return claims;
}

export function addDays(date: Date, days: number): number {
  return date.getTime() + days * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 6: Run token tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupTokens.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/env.ts apps/server/src/services/auth/errors.ts apps/server/src/services/auth/tokens.ts apps/server/tests/groupTokens.test.ts
git commit -m "feat: add signed multi-group tokens"
```

---

### Task 4: Invite Codes And Membership Authorization Helpers

**Files:**
- Create: `apps/server/src/services/groups/inviteCodes.ts`
- Create: `apps/server/src/services/groups/memberships.ts`
- Create: `apps/server/tests/groups.test.ts`

**Interfaces:**
- Consumes: Prisma models from Task 2 and token claims from Task 3.
- Produces:
  - `generateInviteCode(): string`
  - `hashInviteCode(code, secret): string`
  - `verifyInviteCode(code, hash, secret): boolean`
  - `requireActiveMembership({ prisma, env, groupId, token }): Promise<MembershipContext>`
  - `assertNotLastActiveAdmin({ prisma, groupId, membershipId }): Promise<void>`

- [ ] **Step 1: Write helper tests**

Create the first section in `apps/server/tests/groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateInviteCode, hashInviteCode, verifyInviteCode } from "../src/services/groups/inviteCodes";

describe("group invite codes", () => {
  it("hashes and verifies invite codes without storing plaintext", () => {
    const code = generateInviteCode();
    const hash = hashInviteCode(code, "session-secret");

    expect(code).toMatch(/^LUNCH-[A-Z0-9]{6}$/);
    expect(hash).not.toContain(code);
    expect(verifyInviteCode(code, hash, "session-secret")).toBe(true);
    expect(verifyInviteCode("LUNCH-BAD123", hash, "session-secret")).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing helper test**

Run:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Expected: FAIL because invite helper module does not exist.

- [ ] **Step 3: Implement invite helpers**

Create `apps/server/src/services/groups/inviteCodes.ts`:

```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `LUNCH-${suffix}`;
}

export function hashInviteCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeInviteCode(code)).digest("base64url");
}

export function verifyInviteCode(code: string, hash: string, secret: string): boolean {
  const candidate = hashInviteCode(code, secret);
  const candidateBuffer = Buffer.from(candidate);
  const hashBuffer = Buffer.from(hash);
  return candidateBuffer.length === hashBuffer.length && timingSafeEqual(candidateBuffer, hashBuffer);
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}
```

- [ ] **Step 4: Implement membership helpers**

Create `apps/server/src/services/groups/memberships.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { GroupRole } from "@lunch/shared";
import type { AppEnv } from "../../env.js";
import { AuthError } from "../auth/errors.js";
import { verifyGroupSessionToken } from "../auth/tokens.js";

export interface MembershipContext {
  identityId: string;
  groupId: string;
  membershipId: string;
  role: GroupRole;
}

export async function requireActiveMembership(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
  authorization?: string;
  requiredRole?: GroupRole;
}): Promise<MembershipContext> {
  const token = input.authorization?.startsWith("Bearer ") ? input.authorization.slice("Bearer ".length) : "";
  if (!token) {
    throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
  }
  const claims = verifyGroupSessionToken(token, input.env.SESSION_SECRET);
  if (claims.groupId !== input.groupId) {
    throw new AuthError("forbidden", "group_session_mismatch", "Group session does not match route group");
  }

  const membership = await input.prisma.groupMembership.findUnique({
    where: { id: claims.membershipId }
  });
  if (!membership || membership.groupId !== input.groupId || membership.status !== "active") {
    throw new AuthError("forbidden", "active_membership_required", "Active membership is required");
  }
  if (input.requiredRole === "admin" && membership.role !== "admin") {
    throw new AuthError("forbidden", "admin_membership_required", "Admin membership is required");
  }

  return {
    identityId: membership.identityId,
    groupId: membership.groupId,
    membershipId: membership.id,
    role: membership.role
  };
}

export async function assertNotLastActiveAdmin(input: {
  prisma: PrismaClient;
  groupId: string;
  membershipId: string;
}): Promise<void> {
  const membership = await input.prisma.groupMembership.findUnique({ where: { id: input.membershipId } });
  if (!membership || membership.role !== "admin" || membership.status !== "active") return;

  const activeAdminCount = await input.prisma.groupMembership.count({
    where: { groupId: input.groupId, role: "admin", status: "active" }
  });
  if (activeAdminCount <= 1) {
    throw new AuthError("bad_request", "last_admin", "Cannot remove or downgrade the last active admin");
  }
}
```

- [ ] **Step 5: Run helper tests and typecheck**

Run:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS. If TypeScript reports Prisma enum import mismatches, use the generated `@prisma/client` enum type names in `routes/groups.ts` and rerun this exact command before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/groups/inviteCodes.ts apps/server/src/services/groups/memberships.ts apps/server/tests/groups.test.ts
git commit -m "feat: add group invite and membership helpers"
```

---

### Task 5: Group Identity, Create, Join, List, And Session Routes

**Files:**
- Create: `apps/server/src/routes/groups.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/tests/groups.test.ts`

**Interfaces:**
- Consumes: helpers from Tasks 3-4.
- Produces:
  - `POST /api/identities`
  - `POST /api/groups`
  - `POST /api/groups/join`
  - `GET /api/groups`
  - `POST /api/groups/:groupId/session`

- [ ] **Step 1: Add route tests for create, identity reuse, and list**

Append to `apps/server/tests/groups.test.ts`:

```ts
import { buildApp } from "../src/app";
import { signGroupSessionToken, signIdentityToken } from "../src/services/auth/tokens";

describe("group routes", () => {
  it("creates an identity and group, then lists active memberships", async () => {
    const app = await buildApp();

    const createGroup = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { displayName: "李雷", groupName: "前端干饭组", subtitle: "楼下约饭" }
    });
    expect(createGroup.statusCode).toBe(200);
    const created = createGroup.json();
    expect(created.identityToken).toEqual(expect.any(String));
    expect(created.groupSessionToken).toEqual(expect.any(String));
    expect(created.group.name).toBe("前端干饭组");
    expect(created.inviteCode).toMatch(/^LUNCH-[A-Z0-9]{6}$/);

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${created.identityToken}` }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().groups).toEqual([
      expect.objectContaining({ groupId: created.group.groupId, role: "admin", membershipId: expect.any(String) })
    ]);
  });

  it("reuses an existing identity when creating a second group", async () => {
    const app = await buildApp();

    const first = (await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { displayName: "李雷", groupName: "前端干饭组" }
    })).json();

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { authorization: `Bearer ${first.identityToken}` },
      payload: { groupName: "后端干饭组" }
    });
    expect(secondResponse.statusCode).toBe(200);
    const second = secondResponse.json();
    expect(second.identityToken).toEqual(expect.any(String));
    expect(second.group.groupId).not.toBe(first.group.groupId);

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${second.identityToken}` }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().groups.map((group: { groupId: string }) => group.groupId).sort()).toEqual(
      [first.group.groupId, second.group.groupId].sort()
    );
  });

  it("returns 401 for missing and tampered identity tokens", async () => {
    const app = await buildApp();

    const missing = await app.inject({ method: "GET", url: "/api/groups" });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error).toBe("missing_token");

    const tampered = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: "Bearer bad.token" }
    });
    expect(tampered.statusCode).toBe(401);
    expect(tampered.json().error).toBe("invalid_token");
  });

  it("returns 401 for expired identity tokens", async () => {
    const app = await buildApp();
    const expiredIdentityToken = signIdentityToken(
      { identityId: "identity-expired", exp: Date.now() - 1_000 },
      "session-secret"
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${expiredIdentityToken}` }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("expired_token");
  });
});
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Expected: FAIL because group routes are not registered.

- [ ] **Step 3: Implement group routes**

Create `apps/server/src/routes/groups.ts` with these route bodies. The important rule is that `POST /api/groups` and `POST /api/groups/join` accept optional `Authorization: Bearer <identityToken>` and reuse that identity when valid. Only requests without an identity token create a new identity from `displayName`.

```ts
import type { FastifyInstance } from "fastify";
import type { CreateGroupRequest, CreateGroupResponse, GroupSessionResponse } from "@lunch/shared";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { addDays, signGroupSessionToken, signIdentityToken, verifyIdentityToken } from "../services/auth/tokens.js";
import { generateInviteCode, hashInviteCode, verifyInviteCode } from "../services/groups/inviteCodes.js";

function bearerToken(authorization?: string): string {
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
}

function authErrorResponse(reply: { code(statusCode: number): unknown }, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  throw error;
}

function groupSummary(membership: { id: string; role: "admin" | "member"; group: { id: string; name: string; subtitle: string | null } }) {
  return {
    groupId: membership.group.id,
    name: membership.group.name,
    ...(membership.group.subtitle ? { subtitle: membership.group.subtitle } : {}),
    role: membership.role,
    membershipId: membership.id
  };
}

async function resolveIdentityForRequest(input: {
  authorization?: string;
  displayName?: string;
  env: AppEnv;
}) {
  const token = bearerToken(input.authorization);
  if (token) {
    const claims = verifyIdentityToken(token, input.env.SESSION_SECRET);
    const identity = await prisma.identity.findUnique({ where: { id: claims.identityId } });
    if (!identity) {
      throw new AuthError("unauthorized", "invalid_token", "Identity token is no longer valid");
    }
    return prisma.identity.update({ where: { id: identity.id }, data: { lastSeenAt: new Date() } });
  }

  const displayName = input.displayName?.trim();
  if (!displayName) {
    throw new AuthError("bad_request", "display_name_required", "Display name is required");
  }
  return prisma.identity.create({ data: { displayName, lastSeenAt: new Date() } });
}

function signTokens(input: {
  identityId: string;
  groupId: string;
  membershipId: string;
  role: "admin" | "member";
  env: AppEnv;
}): { identityToken: string; groupSessionToken: string } {
  const now = new Date();
  return {
    identityToken: signIdentityToken(
      { identityId: input.identityId, exp: addDays(now, input.env.IDENTITY_TOKEN_TTL_DAYS) },
      input.env.SESSION_SECRET
    ),
    groupSessionToken: signGroupSessionToken(
      {
        identityId: input.identityId,
        groupId: input.groupId,
        membershipId: input.membershipId,
        role: input.role,
        exp: addDays(now, input.env.GROUP_SESSION_TTL_DAYS)
      },
      input.env.SESSION_SECRET
    )
  };
}

export async function registerGroupRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{ Body: { displayName: string } }>("/api/identities", async (request, reply) => {
    const displayName = request.body.displayName.trim();
    if (!displayName) {
      reply.code(400);
      return { error: "display_name_required", message: "Display name is required" };
    }
    const identity = await prisma.identity.create({ data: { displayName, lastSeenAt: new Date() } });
    return {
      identityId: identity.id,
      identityToken: signIdentityToken(
        { identityId: identity.id, exp: addDays(new Date(), env.IDENTITY_TOKEN_TTL_DAYS) },
        env.SESSION_SECRET
      )
    };
  });

  app.post<{ Body: CreateGroupRequest }>("/api/groups", async (request, reply) => {
    try {
      if (!env.ALLOW_PUBLIC_GROUP_CREATION) {
        reply.code(403);
        return { error: "group_creation_disabled", message: "Group creation is disabled" };
      }
      const groupName = request.body.groupName?.trim();
      if (!groupName) {
        reply.code(400);
        return { error: "invalid_group_create_request", message: "Group name is required" };
      }

      const identity = await resolveIdentityForRequest({
        authorization: request.headers.authorization,
        displayName: request.body.displayName,
        env
      });

      const inviteCode = generateInviteCode();
      const result = await prisma.$transaction(async (tx) => {
        const group = await tx.lunchGroup.create({
          data: {
            name: groupName,
            subtitle: request.body.subtitle?.trim() || null,
            inviteCodeHash: hashInviteCode(inviteCode, env.SESSION_SECRET),
            createdByIdentityId: identity.id,
            officeTimezone: env.OFFICE_TIMEZONE,
            officeCity: env.OFFICE_CITY,
            officeLatitude: env.OFFICE_LATITUDE,
            officeLongitude: env.OFFICE_LONGITUDE
          }
        });
        const membership = await tx.groupMembership.create({
          data: { groupId: group.id, identityId: identity.id, role: "admin", status: "active" },
          include: { group: true }
        });
        await tx.groupSettings.create({ data: { groupId: group.id, notificationGroupLabel: group.name } });
        await tx.scoringWeights.create({ data: { groupId: group.id } });
        return { group, membership };
      });

      const tokens = signTokens({
        identityId: identity.id,
        groupId: result.group.id,
        membershipId: result.membership.id,
        role: result.membership.role,
        env
      });
      return { ...tokens, group: groupSummary(result.membership), inviteCode } satisfies CreateGroupResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.get("/api/groups", async (request, reply) => {
    try {
      const token = bearerToken(request.headers.authorization);
      if (!token) throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
      const claims = verifyIdentityToken(token, env.SESSION_SECRET);
      const memberships = await prisma.groupMembership.findMany({
        where: { identityId: claims.identityId, status: "active" },
        include: { group: true },
        orderBy: { joinedAt: "asc" }
      });
      return { groups: memberships.map(groupSummary) };
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });
}
```

Additional join/session routes are implemented in Step 5.

- [ ] **Step 4: Register group routes**

Modify `apps/server/src/app.ts`:

```ts
import { registerGroupRoutes } from "./routes/groups.js";
```

Register after health:

```ts
await registerHealthRoutes(app);
await registerGroupRoutes(app, env);
```

- [ ] **Step 5: Add join and session route tests**

Append tests for join identity reuse, idempotent join, removed behavior, and session exchange:

```ts
it("joins a group with invite code and exchanges identity token for group session", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();

  const joinedResponse = await app.inject({
    method: "POST",
    url: "/api/groups/join",
    payload: { displayName: "小赵", inviteCode: created.inviteCode }
  });
  expect(joinedResponse.statusCode).toBe(200);
  const joined = joinedResponse.json();
  expect(joined.group.groupId).toBe(created.group.groupId);
  expect(joined.group.role).toBe("member");

  const sessionResponse = await app.inject({
    method: "POST",
    url: `/api/groups/${created.group.groupId}/session`,
    headers: { authorization: `Bearer ${joined.identityToken}` }
  });
  expect(sessionResponse.statusCode).toBe(200);
  expect(sessionResponse.json().groupSessionToken).toEqual(expect.any(String));
});

it("reuses an existing identity when joining another group", async () => {
  const app = await buildApp();

  const groupA = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "小王", groupName: "A 组" }
  })).json();
  const groupB = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "小张", groupName: "B 组" }
  })).json();

  const join = await app.inject({
    method: "POST",
    url: "/api/groups/join",
    headers: { authorization: `Bearer ${groupA.identityToken}` },
    payload: { inviteCode: groupB.inviteCode }
  });
  expect(join.statusCode).toBe(200);

  const list = await app.inject({
    method: "GET",
    url: "/api/groups",
    headers: { authorization: `Bearer ${join.json().identityToken}` }
  });
  expect(list.json().groups.map((group: { groupId: string }) => group.groupId).sort()).toEqual(
    [groupA.group.groupId, groupB.group.groupId].sort()
  );
});

it("joining an already-active group is idempotent and returns a fresh session", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();

  const joinAgain = await app.inject({
    method: "POST",
    url: "/api/groups/join",
    headers: { authorization: `Bearer ${created.identityToken}` },
    payload: { inviteCode: created.inviteCode }
  });
  expect(joinAgain.statusCode).toBe(200);
  expect(joinAgain.json().group.membershipId).toBe(created.group.membershipId);
  expect(joinAgain.json().groupSessionToken).toEqual(expect.any(String));
});
```

- [ ] **Step 6: Implement join and session routes**

Add to `registerGroupRoutes`:

```ts
app.post<{ Body: { displayName?: string; inviteCode: string } }>("/api/groups/join", async (request, reply) => {
  try {
    const groups = await prisma.lunchGroup.findMany();
    const group = groups.find((candidate) =>
      verifyInviteCode(request.body.inviteCode, candidate.inviteCodeHash, env.SESSION_SECRET)
    );
    if (!group) {
      reply.code(401);
      return { error: "invalid_invite_code", message: "Invite code is invalid" };
    }

    const identity = await resolveIdentityForRequest({
      authorization: request.headers.authorization,
      displayName: request.body.displayName,
      env
    });

    const membership = await prisma.$transaction(async (tx) => {
      const existing = await tx.groupMembership.findUnique({
        where: { groupId_identityId: { groupId: group.id, identityId: identity.id } },
        include: { group: true }
      });

      if (existing?.status === "removed") {
        throw new AuthError("forbidden", "removed_member", "Removed member must be restored by an admin");
      }
      if (existing?.status === "active") {
        return existing;
      }

      return tx.groupMembership.create({
        data: { groupId: group.id, identityId: identity.id, role: "member", status: "active" },
        include: { group: true }
      });
    });

    const tokens = signTokens({
      identityId: identity.id,
      groupId: membership.groupId,
      membershipId: membership.id,
      role: membership.role,
      env
    });
    return { ...tokens, group: groupSummary(membership) } satisfies GroupSessionResponse;
  } catch (error) {
    return authErrorResponse(reply, error);
  }
});

app.post<{ Params: { groupId: string } }>("/api/groups/:groupId/session", async (request, reply) => {
  try {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
    const claims = verifyIdentityToken(token, env.SESSION_SECRET);
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_identityId: { groupId: request.params.groupId, identityId: claims.identityId } },
      include: { group: true }
    });
    if (!membership || membership.status !== "active") {
      throw new AuthError("forbidden", "active_membership_required", "Active membership is required");
    }
    const tokens = signTokens({
      identityId: membership.identityId,
      groupId: membership.groupId,
      membershipId: membership.id,
      role: membership.role,
      env
    });
    return { ...tokens, group: groupSummary(membership) } satisfies GroupSessionResponse;
  } catch (error) {
    return authErrorResponse(reply, error);
  }
});
```

- [ ] **Step 7: Run group route tests**

Run:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS after adjusting Prisma compound key names if generated names differ.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/routes/groups.ts apps/server/src/app.ts apps/server/tests/groups.test.ts
git commit -m "feat: add group identity and join routes"
```

---

### Task 6: Authorization Invariants And Legacy Session Compatibility

**Files:**
- Modify: `apps/server/src/routes/groups.ts`
- Modify: `apps/server/src/routes/session.ts`
- Modify: `apps/server/tests/groups.test.ts`
- Modify: `apps/server/tests/adminRoutes.test.ts`

**Interfaces:**
- Consumes: group routes and membership helpers.
- Produces: last-admin invariant enforcement, removed-member guard, legacy `/api/session` compatibility through default group.

- [ ] **Step 1: Add authorization invariant tests**

Append to `apps/server/tests/groups.test.ts`:

```ts
it("rejects removing or downgrading the last active admin", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();

  const response = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
    headers: { authorization: `Bearer ${created.groupSessionToken}` },
    payload: { role: "member" }
  });
  expect(response.statusCode).toBe(400);
  expect(response.json().error).toBe("last_admin");
});

it("returns 403 when a non-admin patches members", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();
  const joined = (await app.inject({
    method: "POST",
    url: "/api/groups/join",
    payload: { displayName: "成员", inviteCode: created.inviteCode }
  })).json();

  const response = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
    headers: { authorization: `Bearer ${joined.groupSessionToken}` },
    payload: { role: "member" }
  });
  expect(response.statusCode).toBe(403);
  expect(response.json().error).toBe("admin_membership_required");
});

it("does not allow a removed membership to rejoin with the same identity token", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();
  const joined = (await app.inject({
    method: "POST",
    url: "/api/groups/join",
    payload: { displayName: "成员", inviteCode: created.inviteCode }
  })).json();

  const remove = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
    headers: { authorization: `Bearer ${created.groupSessionToken}` },
    payload: { status: "removed" }
  });
  expect(remove.statusCode).toBe(200);

  const rejoin = await app.inject({
    method: "POST",
    url: "/api/groups/join",
    headers: { authorization: `Bearer ${joined.identityToken}` },
    payload: { inviteCode: created.inviteCode }
  });
  expect(rejoin.statusCode).toBe(403);
  expect(rejoin.json().error).toBe("removed_member");

  const session = await app.inject({
    method: "POST",
    url: `/api/groups/${created.group.groupId}/session`,
    headers: { authorization: `Bearer ${joined.identityToken}` }
  });
  expect(session.statusCode).toBe(403);
  expect(session.json().error).toBe("active_membership_required");
});

it("does not trust stale admin role in an old group session token", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();
  const oldAdminSession = created.groupSessionToken;
  const joined = (await app.inject({
    method: "POST",
    url: "/api/groups/join",
    payload: { displayName: "成员", inviteCode: created.inviteCode }
  })).json();

  const promote = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
    headers: { authorization: `Bearer ${created.groupSessionToken}` },
    payload: { role: "admin" }
  });
  expect(promote.statusCode).toBe(200);

  const refreshedMemberSession = await app.inject({
    method: "POST",
    url: `/api/groups/${created.group.groupId}/session`,
    headers: { authorization: `Bearer ${joined.identityToken}` }
  });
  expect(refreshedMemberSession.statusCode).toBe(200);

  const downgradeOriginalAdmin = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
    headers: { authorization: `Bearer ${refreshedMemberSession.json().groupSessionToken}` },
    payload: { role: "member" }
  });
  expect(downgradeOriginalAdmin.statusCode).toBe(200);

  const staleAdminAttempt = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
    headers: { authorization: `Bearer ${oldAdminSession}` },
    payload: { role: "member" }
  });
  expect(staleAdminAttempt.statusCode).toBe(403);
  expect(staleAdminAttempt.json().error).toBe("admin_membership_required");
});

it("returns 401 for expired group session tokens on group-scoped routes", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();
  const expiredGroupSessionToken = signGroupSessionToken(
    {
      identityId: "identity-expired",
      groupId: created.group.groupId,
      membershipId: created.group.membershipId,
      role: "admin",
      exp: Date.now() - 1_000
    },
    "session-secret"
  );

  const response = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
    headers: { authorization: `Bearer ${expiredGroupSessionToken}` },
    payload: { role: "member" }
  });
  expect(response.statusCode).toBe(401);
  expect(response.json().error).toBe("expired_token");
});

it("does not accept EXTENSION_READ_TOKEN on new group routes", async () => {
  const app = await buildApp();
  const created = (await app.inject({
    method: "POST",
    url: "/api/groups",
    payload: { displayName: "组长", groupName: "午饭组" }
  })).json();

  const response = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
    headers: { "x-lunch-read-token": "read-token" },
    payload: { role: "member" }
  });
  expect(response.statusCode).toBe(401);
  expect(response.json().error).toBe("missing_token");
});
```

- [ ] **Step 2: Implement member patch route**

Add to `registerGroupRoutes`:

```ts
app.patch<{
  Params: { groupId: string; membershipId: string };
  Body: { role?: "admin" | "member"; status?: "active" | "removed" };
}>("/api/groups/:groupId/members/:membershipId", async (request, reply) => {
  try {
    if (request.body.role && request.body.role !== "admin" && request.body.role !== "member") {
      reply.code(400);
      return { error: "invalid_member_role", message: "Role must be admin or member" };
    }
    if (request.body.status && request.body.status !== "active" && request.body.status !== "removed") {
      reply.code(400);
      return { error: "invalid_membership_status", message: "Status must be active or removed" };
    }

    await requireActiveMembership({
      prisma,
      env,
      groupId: request.params.groupId,
      authorization: request.headers.authorization,
      requiredRole: "admin"
    });

    const target = await prisma.groupMembership.findUnique({ where: { id: request.params.membershipId } });
    if (!target || target.groupId !== request.params.groupId) {
      reply.code(404);
      return { error: "member_not_found", message: "Member not found" };
    }

    if ((request.body.role === "member" || request.body.status === "removed") && target.role === "admin") {
      await assertNotLastActiveAdmin({ prisma, groupId: request.params.groupId, membershipId: target.id });
    }

    return prisma.groupMembership.update({
      where: { id: target.id },
      data: {
        ...(request.body.role ? { role: request.body.role } : {}),
        ...(request.body.status
          ? { status: request.body.status, removedAt: request.body.status === "removed" ? new Date() : null }
          : {})
      }
    });
  } catch (error) {
    return authErrorResponse(reply, error);
  }
});
```

Ensure `routes/groups.ts` imports `requireActiveMembership`, `assertNotLastActiveAdmin`, and uses the `authErrorResponse` helper from Task 5.

- [ ] **Step 3: Keep legacy session route working**

Modify `apps/server/src/routes/session.ts` so `/api/session` still accepts `TEAM_INVITE_CODE`, creates or reuses a default group, and returns the legacy `{ token, teammate }` shape. Do not change admin UI yet.

Implementation rule:

```ts
// Keep this route as legacy compatibility until admin is rewired to group sessions.
```

The legacy route may continue using `signSessionToken` for now, but it must not be used by new `/api/groups/:groupId/*` APIs.

- [ ] **Step 4: Run existing admin/session tests**

Run:

```bash
pnpm --filter @lunch/server test -- sessionToken.test.ts adminRoutes.test.ts groups.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS. Existing admin tests should still pass because `/api/session` and existing admin write APIs remain compatible in this foundation slice.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/groups.ts apps/server/src/routes/session.ts apps/server/tests/groups.test.ts apps/server/tests/adminRoutes.test.ts
git commit -m "feat: enforce group membership invariants"
```

---

### Task 7: Default Group Migration And Verification

**Files:**
- Modify: `apps/server/prisma/seed.ts`
- Create: `apps/server/tests/defaultGroupMigration.test.ts`
- Modify: `apps/server/README.md`

**Interfaces:**
- Consumes: Prisma schema and group helpers.
- Produces: deterministic default group for existing MVP data and test/dev seed.
- Leaves current recommendation reads on legacy `DailyRecommendation`; the next recommendation-batch plan will switch route behavior to `DailyRecommendationBatch` and `DailyRecommendationItem`.

- [ ] **Step 1: Add migration verification test**

Create `apps/server/tests/defaultGroupMigration.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("default group migration", () => {
  it("backfills legacy rows before enforcing non-null group ids", () => {
    const migrationsDir = join(process.cwd(), "prisma", "migrations");
    const migrationDir = readdirSync(migrationsDir).find((name) => name.endsWith("_multi_group_foundation"));
    expect(migrationDir).toBeTruthy();

    const migrationPath = join(migrationsDir, migrationDir!, "migration.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("seed-group-default");
    expect(sql).toMatch(/UPDATE\s+"?restaurants"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/UPDATE\s+"?recommendations"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/UPDATE\s+"?feedback"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/UPDATE\s+"?daily_recommendations"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/blocked/i);
    expect(sql).toMatch(/avoid/i);

    const firstBackfill = sql.search(/UPDATE\s+"?restaurants"?\s+SET\s+"?group_id"?/i);
    const firstNotNull = sql.search(/ALTER\s+COLUMN\s+"?group_id"?\s+SET\s+NOT\s+NULL/i);
    expect(firstBackfill).toBeGreaterThanOrEqual(0);
    expect(firstNotNull).toBeGreaterThan(firstBackfill);
  });
});
```

This test is not a replacement for running the migration against PostgreSQL, but
it prevents the most dangerous plan failure: adding non-null `group_id` columns
to populated legacy tables before backfilling them.

- [ ] **Step 2: Update seed to create default group**

Modify `apps/server/prisma/seed.ts`:

```ts
const defaultIdentity = await prisma.identity.upsert({
  where: { id: "seed-identity-admin" },
  update: { displayName: "Demo 同事", lastSeenAt: new Date() },
  create: { id: "seed-identity-admin", displayName: "Demo 同事", lastSeenAt: new Date() }
});

const defaultGroup = await prisma.lunchGroup.upsert({
  where: { id: "seed-group-default" },
  update: {},
  create: {
    id: "seed-group-default",
    name: "Dev团队",
    subtitle: "干饭小分队",
    inviteCodeHash: hashInviteCode("LUNCH-2026AA", process.env.SESSION_SECRET ?? "dev-session-secret"),
    createdByIdentityId: defaultIdentity.id,
    officeTimezone: process.env.OFFICE_TIMEZONE ?? "Asia/Shanghai",
    officeCity: process.env.OFFICE_CITY ?? "Shanghai",
    officeLatitude: Number(process.env.OFFICE_LATITUDE ?? 31.2304),
    officeLongitude: Number(process.env.OFFICE_LONGITUDE ?? 121.4737)
  }
});
```

Then create default membership, settings, and weights with upserts. Existing seeded restaurants, recommendations, feedback, weather snapshots, and legacy daily recommendations must include `groupId: defaultGroup.id`.

- [ ] **Step 3: Document migration expectations**

Modify `apps/server/README.md` to add:

```md
## Multi-Group Foundation

The multi-group foundation migrates old single-team data into a default group:

- group name: `Dev团队`
- group subtitle: `干饭小分队`
- legacy daily recommendation rows keep `groupId` for compatibility during the foundation slice
- later recommendation-batch migration copies legacy rows into `daily_recommendation_batches/items`
- copied legacy batch source: `legacy`
- copied legacy algorithm version: `legacy-v1`
- legacy feedback type `blocked` is migrated to member feedback type `avoid`
- migration SQL must backfill legacy `group_id` values before setting `group_id NOT NULL`

New `/api/groups/:groupId/*` routes require group session tokens. `EXTENSION_READ_TOKEN` is retained only for legacy read compatibility and readiness/debug use.
```

- [ ] **Step 4: Run seed-related checks**

Run:

```bash
pnpm --filter @lunch/server test -- defaultGroupMigration.test.ts groups.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/seed.ts apps/server/tests/defaultGroupMigration.test.ts apps/server/README.md
git commit -m "feat: seed default multi-group data"
```

---

### Task 8: Foundation Verification

**Files:**
- No new files.
- Verify all touched packages.

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: verified foundation ready for the next implementation plan.

- [ ] **Step 1: Run focused test suites**

Run:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/server test -- groupTokens.test.ts groups.test.ts defaultGroupMigration.test.ts sessionToken.test.ts adminRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package typechecks**

Run:

```bash
pnpm --filter @lunch/shared typecheck
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full repo checks if time allows**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: PASS. If unrelated failures appear, document them with exact failing test names and commands.

- [ ] **Step 4: Summarize handoff**

Include in the implementation handoff:

```md
Implemented:
- shared multi-group contracts
- Prisma multi-group foundation
- signed identity/group tokens
- group create/join/list/session routes
- last-admin and removed-member invariants
- default group seed/migration notes

Not implemented in this plan:
- group-scoped restaurant behavior changes
- today recommendation batch generation
- participation and feedback routes
- extension group storage
- admin prototype pages
- dashboard aggregation

Subagents:
- State whether subagents were used.
- If used, confirm every Codex-created subagent used GPT-5.5.
- If not used, state no subagents were used.
```

- [ ] **Step 5: Commit final verification notes if docs changed**

If README or plan checkboxes were updated during execution:

```bash
git add apps/server/README.md plans/2026-07-08-multi-group-foundation-stage1.md
git commit -m "docs: record multi-group foundation verification"
```
