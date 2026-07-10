# Today Recommendation Batch + Participation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stage 3 of the multi-group roadmap: a group-scoped daily recommendation batch loop with participation, decision, feedback, and a minimal Chrome extension path that proves the real lunch flow.

**Architecture:** Keep the legacy single-team recommendation API working while adding new `/api/groups/:groupId/*` lunch-loop APIs that require group session tokens. Reuse the existing Prisma Stage 1 schema, Stage 2 group knowledge data, weather adapter, and scoring helpers, but write new batch rows to `daily_recommendation_batches` and `daily_recommendation_items`.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, Prisma, PostgreSQL, Vitest, Chrome Manifest V3, `chrome.storage`, `chrome.alarms`, HMAC signed group session tokens, `packages/shared` API contracts.

**Status:** Approved for Execution

## Global Constraints

- Source spec: `specs/2026-07-08-multi-group-prototype-implementation-design.md`.
- Roadmap stage: `roadmap.md` Stage 3, Today Recommendation Batch + Participation.
- Stage 1 and Stage 2 are treated as completed by handoff.
- Preserve existing MVP legacy routes unless this plan explicitly changes a new `/api/groups/:groupId/*` route.
- New group APIs require `Authorization: Bearer <groupSessionToken>`.
- `EXTENSION_READ_TOKEN` is not accepted by any new `/api/groups/:groupId/*` lunch-loop route.
- Server permissions must use current database membership role/status, not token role/status.
- Removed memberships cannot read or write group lunch-loop data.
- Recommendation API date boundaries use each group's `officeTimezone`, falling back only where existing legacy code still uses `OFFICE_TIMEZONE`.
- `GET /api/groups/:groupId/today-recommendations` is read-only and returns 404/`no_current_batch` when no current batch exists.
- `POST /api/groups/:groupId/today-recommendations/refresh` creates a new current batch and keeps old batches for review.
- Batch refresh must use a transaction and retry serializable conflicts to avoid duplicate current batches around lunch reminder time.
- Batch generation filters to `restaurant.status = active`.
- Weather is called only by the server, never by the extension.
- If neither cached nor fetched weather is available, return `weatherUnavailable=true` and score with `weatherMatch=0`.
- Generated batches must store `scoringWeightsSnapshot`, `weatherSnapshotId`, `algorithmVersion`, `batchNo`, and item-level `scoreBreakdown`.
- Participation states are `undecided`, `joining`, `away`, and `decided`.
- When participation status is `decided`, `restaurantId` is required; when status is not `decided`, `restaurantId`, `recommendationId`, and `decidedAt` must be cleared.
- When `restaurantId` or `recommendationId` is present in a participation request, it must be a non-empty trimmed string; malformed values return 400/`invalid_participation_request` and write nothing.
- Feedback writes remain group-scoped; `avoid` feedback does not change restaurant `blocked` status.
- Extension state must persist through `chrome.storage`; do not rely on long-lived globals.
- Extension storage must bucket sessions and last recommendations by `groupId`.
- Cache fallback must read only `lastRecommendationsByGroupId[activeGroupId]`.
- Partial `lunchState` updates must use `updateStorageState(updater)` under the Web Locks exclusive lock `lunch-extension-storage-state`, and must re-read state only after acquiring the lock.
- `saveStorageState(state)` is reserved for full-state replacement and uses the same lock; Task 6 options writes must use `updateStorageState`.
- Recommendation cache writes require `groupId === response.groupId`; active cache reads return `null` when the bucket key and stored response `groupId` differ.
- Chrome extension uses `chrome.alarms`, not `setTimeout` or `setInterval`, for long-term scheduling.
- Extension tests must not import side-effectful `background.ts`.
- Extension manifest must still be emitted to `apps/extension/dist/manifest.json`.
- Plugin permissions stay minimal: `alarms`, `notifications`, `storage`, and specific API host permissions.
- Shared API contracts belong in `packages/shared`.
- Keep Fastify on Railway compatible with `host: "::"` and `port: Number(process.env.PORT ?? 3000)`.

---

## Stage 3 Preflight Patch

Before Task 1 execution, keep these plan-level rules in force for every task:

1. Verify `apps/server/prisma/schema.prisma` and applied migrations contain every Stage 3 model, field, relation, and index required for:
   - `DailyRecommendationBatch.groupId`, `officeDate`, `batchNo`, `source`, `generatedByMembershipId`, `weatherSnapshotId`, `scoringWeightsSnapshot`, `algorithmVersion`, `isCurrent`, and `createdAt`.
   - `DailyRecommendationItem.batchId`, `rank`, `restaurantId`, `recommendationId`, `score`, `scoreBreakdown`, `reason`, and `createdAt`.
   - `DailyParticipation.groupId`, `officeDate`, `membershipId`, `status`, `restaurantId`, `recommendationId`, `decidedAt`, and `updatedAt`.
   - `WeatherSnapshot.groupId`, `date`, `city`, `temperatureC`, `condition`, `precipitationProbability`, `windLevel`, `rawPayload`, and group/date/city uniqueness.
   - `ScoringWeights` group-level weights.
   - `daily_participation` unique key on `(group_id, office_date, membership_id)`.
   - `daily_recommendation_batches` unique key on `(group_id, office_date, batch_no)`.
   - `daily_recommendation_items` unique key on `(batch_id, rank)`.
2. Ensure the one-current-batch invariant is database-enforced. Preferred implementation is a SQL partial unique index on `daily_recommendation_batches(group_id, office_date) WHERE is_current = true`. Prisma cannot express this index directly, so add a SQL migration if it is missing.
3. Add or update `packages/shared/src/index.ts` verification for every new Stage 3 type, route builder, and scoring constant used from `@lunch/shared`.
4. Split extension group fetch into network-only and cache-fallback functions so `ensureGroupTodayRecommendations` refreshes on `404/no_current_batch` even when cache exists.
5. Use `weatherSnapshot.upsert` or create-conflict recovery for group weather snapshots so concurrent refreshes do not report `weatherUnavailable=true` after a uniqueness race.
6. Retry refresh transactions on `P2034` and `P2002` conflicts for both the SQL partial current-batch index and the existing `(group_id, office_date, batch_no)` unique key.
7. Add auth matrix tests for missing Authorization, read-token-only, group mismatch, and removed membership across today and participation routes.
8. Add explicit tests that recommendation generation queries only `{ groupId, status: "active" }`.
9. Merge extension storage in this order: defaults -> legacy settings -> current grouped state.
10. Treat `decided` participation as valid only for active restaurants in the path group; return 400/`restaurant_not_active` for paused or blocked restaurants.
11. Count only active memberships in participation summaries and ignore old `dailyParticipation` rows for removed memberships.
12. Serialize every extension `lunchState` write with Web Locks lock `lunch-extension-storage-state`; partial writers must re-read and merge inside the lock and must fail when the lock API is unavailable.
13. Reject recommendation cache bucket/response group mismatches and ignore mismatched stored cache values on active-group reads.
14. Reject present but non-string, empty, or whitespace-only participation `restaurantId`/`recommendationId` values with 400/`invalid_participation_request` before any upsert.

## Scope Of This Plan

In scope:

- Shared Stage 3 contracts for group today recommendations, scoring snapshots, participation, and route builders.
- Weighted scoring support that preserves legacy default scoring behavior.
- Group-scoped weather cache/fetch lookup using group office city, coordinates, and timezone.
- `GET /api/groups/:groupId/today-recommendations`.
- `POST /api/groups/:groupId/today-recommendations/refresh`.
- `GET /api/groups/:groupId/participation/today`.
- `PUT /api/groups/:groupId/participation/today`.
- Transactional current-batch creation with serializable conflict retry.
- Participation summary in today recommendation responses.
- Decision flow through participation status `decided`.
- Group-scoped feedback calls from the extension, including `avoid`.
- Extension storage support for `identityToken`, `activeGroupId`, `sessionsByGroupId`, `groupSummariesById`, `lastRecommendationsByGroupId`, and local reminder overrides.
- Extension API client support for active group session tokens, current batch GET, refresh POST, participation PUT, and feedback POST.
- Minimal popup/detail/options updates needed to prove the Stage 3 flow before Stage 4 visual rebuild.
- Regression tests for legacy `/api/today-recommendations` and `/api/feedback`.
- Roadmap status update after the plan is written.

Out of scope:

- Open Designer visual rebuild for popup, detail, settings, admin login, admin today, or admin restaurants.
- Admin dashboard, settings, scoring weight UI, member management UI, and history UI.
- Formal accounts, email login, OAuth, and complex permissions.
- Global restaurant library, restaurant sharing across groups, delivery, payment, maps, and third-party restaurant integrations.
- Machine-learning ranking.
- Production admin static hosting hardening.
- Manual Chrome Developer Mode smoke test execution, unless the implementation executor has a local browser workflow available.

## Stage 3 Acceptance Criteria

Stage 3 is complete only when:

- `GET /api/groups/:groupId/today-recommendations` requires a valid group session and returns only the current batch for the path group.
- `GET /api/groups/:groupId/today-recommendations` returns 404/`no_current_batch` and writes nothing when no current batch exists.
- `POST /api/groups/:groupId/today-recommendations/refresh` requires a valid active membership and creates a new current batch for the group office date.
- Refresh demotes previous current batches for the same `groupId + officeDate` and keeps old batch rows.
- Concurrent refresh tests demonstrate that only one current batch remains for the same `groupId + officeDate`.
- Recommendation generation uses only active restaurants from the path group.
- Scoring uses group scoring weights and stores the exact weights snapshot on the batch.
- Item `scoreBreakdown` records weekday, weather, distance, teammate recommendation, recent duplicate, and negative feedback components.
- Weather lookup uses group office fields and writes group-scoped weather snapshots.
- Weather unavailable responses set `weatherUnavailable=true` and use `weatherMatch=0`.
- Participation can be read and updated for today's group office date.
- `decided` participation requires a restaurant in the path group and stores optional recommendation only when it belongs to that restaurant and group.
- Non-`decided` participation clears restaurant, recommendation, and decision timestamp.
- Malformed present participation resource IDs return 400/`invalid_participation_request` and do not call `dailyParticipation.upsert`.
- Today recommendation responses include `participationSummary`.
- Extension options can store the active group ID and its group session token without embedding `TEAM_INVITE_CODE`.
- Extension requests send `Authorization: Bearer <groupSessionToken>` for new group APIs.
- Extension manual refresh calls `POST /api/groups/:groupId/today-recommendations/refresh`, not legacy `forceRefresh=true`.
- Extension notification flow can ensure a current batch by GET followed by refresh on 404/`no_current_batch`.
- Extension cache fallback never shows another group's cached recommendations.
- Concurrent settings, active-group/session, and recommendation-cache writes preserve every update through the shared Web Locks mutation helper.
- Extension cache helpers reject bucket/response `groupId` mismatches and ignore mismatched stored cache entries.
- Existing legacy recommendation, feedback, admin, and Stage 2 group knowledge tests still pass.
- Relevant shared, server, extension tests, typechecks, and builds pass.

## Approach Decision

Three implementation shapes were considered:

1. **Recommended: contract-first group lunch-loop vertical slice.** Add shared contracts, server batch/participation APIs, then wire the minimum extension path. This matches the roadmap and proves the real lunch loop before Stage 4 UI polish.
2. **Legacy service migration first.** Convert `getTodayRecommendations` to use new batch tables and then add group routes. This risks breaking the stable MVP compatibility path before the group API is proven.
3. **Extension-first wiring.** Start from popup/detail behavior and backfill server contracts. This would make the extension invent response shapes before `packages/shared` and server are ready.

Use approach 1.

## File Structure

- Modify: `packages/shared/src/types.ts`
  - Add Stage 3 group today recommendation, scoring, weather, and participation contracts.
- Modify: `packages/shared/src/api.ts`
  - Add `GROUP_ROUTES.participationToday(groupId)`.
- Modify: `packages/shared/src/scoring.ts`
  - Add default scoring weights and item-level breakdown support while keeping existing defaults.
- Modify: `packages/shared/src/index.ts`
  - Re-export and verify Stage 3 types, route builders, and scoring constants through the shared package barrel.
- Modify: `packages/shared/tests/groupContracts.test.ts`
  - Lock Stage 3 route builders and type literals.
- Modify: `packages/shared/tests/scoring.test.ts`
  - Lock weighted scoring and legacy default behavior.
- Modify: `apps/server/prisma/schema.prisma`
  - Add a comment documenting the SQL-managed partial unique current-batch invariant if Prisma cannot model it.
- Create: `apps/server/prisma/migrations/<timestamp>_stage3_current_batch_invariant/migration.sql`
  - Add the partial unique index for one current batch per group office date if it is missing.
- Modify: `apps/server/src/services/weather/openMeteo.ts`
  - Allow fetching weather for explicit office coordinates/timezone.
- Modify: `apps/server/src/services/weather/officeWeather.ts`
  - Add group-scoped weather lookup while preserving legacy default-group lookup.
- Create: `apps/server/src/services/recommendation/groupToday.ts`
  - Read current group batches, refresh group batches, format responses, and compute participation summaries.
- Create: `apps/server/src/routes/groupToday.ts`
  - Register group today recommendation GET and refresh routes.
- Create: `apps/server/src/routes/groupParticipation.ts`
  - Register participation read/update routes.
- Modify: `apps/server/src/app.ts`
  - Register Stage 3 group routes after group auth routes and before legacy recommendation routes.
- Create: `apps/server/tests/groupToday.test.ts`
  - Unit-test group batch service behavior with mocked Prisma.
- Create: `apps/server/tests/groupTodayRoutes.test.ts`
  - Route-test auth, 404, refresh, and cross-group protections.
- Create: `apps/server/tests/groupTodayConcurrency.test.ts`
  - Integration-style test or transaction-backed service test for concurrent refresh and current-batch uniqueness.
- Create: `apps/server/tests/groupParticipation.test.ts`
  - Route-test participation state transitions and ID ownership validation.
- Modify: `apps/server/tests/recommendation.test.ts`
  - Preserve legacy route/service behavior after scoring changes.
- Modify: `apps/extension/src/config.ts`
  - Add storage keys for the grouped storage shape.
- Modify: `apps/extension/src/storage.ts`
  - Store group sessions, active group, grouped cache, and local reminder overrides.
- Modify: `apps/extension/src/recommendationClient.ts`
  - Use group session APIs and active-group cache fallback.
- Modify: `apps/extension/src/popup.ts`
  - Minimal current group recommendation, participation, decision, and feedback controls.
- Modify: `apps/extension/src/detail.ts`
  - Minimal grouped detail rendering.
- Modify: `apps/extension/src/background.ts`
  - Use active group and ensure semantics for notifications.
- Modify: `apps/extension/src/options.ts`
  - Save active group and group session token fields.
- Modify: `apps/extension/options.html`
  - Add active group/session inputs.
- Modify: `apps/extension/tests/storage.test.ts`
  - Lock grouped storage defaults and cache isolation.
- Modify: `apps/extension/tests/recommendationClient.test.ts`
  - Lock group API headers, refresh route, participation, feedback, and cache fallback.
- Modify: `roadmap.md`
  - Link this Stage 3 plan and update Stage 2/Stage 3 status.

---

### Task 1: Shared Stage 3 Contracts And Weighted Scoring

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/scoring.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/groupContracts.test.ts`
- Modify: `packages/shared/tests/scoring.test.ts`

**Interfaces:**
- Consumes:
  - Existing `GROUP_ROUTES`, `RecommendationItem`, `FeedbackType`, `GroupSummary`, `WeatherTag`, `WeekdayTag`.
- Produces:
  - `ParticipationStatus`
  - `RecommendationBatchSource`
  - `ScoringWeightsSnapshot`
  - `ScoreBreakdown`
  - `WeatherSummary`
  - `GroupTodayRecommendationItem`
  - `ParticipationSummary`
  - `GroupTodayRecommendationsResponse`
  - `ParticipationMember`
  - `ParticipationTodayResponse`
  - `PutParticipationTodayRequest`
  - `PutParticipationTodayResponse`
  - `GROUP_ROUTES.participationToday(groupId)`
  - `LEGACY_SCORING_WEIGHTS`
  - `DEFAULT_GROUP_SCORING_WEIGHTS`
  - Barrel exports from `@lunch/shared`

- [ ] **Step 1: Extend shared contract tests**

Modify `packages/shared/tests/groupContracts.test.ts` so the Stage 3 assertions include:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_GROUP_SCORING_WEIGHTS, GROUP_ROUTES } from "../src";
import type {
  GroupTodayRecommendationsResponse,
  ParticipationStatus,
  PutParticipationTodayRequest,
  RecommendationBatchSource,
  ScoreBreakdown,
  ScoringWeightsSnapshot
} from "../src";

describe("Stage 3 shared contracts", () => {
  it("defines group today recommendation routes", () => {
    expect(GROUP_ROUTES.todayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations"
    );
    expect(GROUP_ROUTES.refreshTodayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations/refresh"
    );
    expect(GROUP_ROUTES.participationToday("group-1")).toBe(
      "/api/groups/group-1/participation/today"
    );
  });

  it("locks Stage 3 batch and participation literals", () => {
    const sources: RecommendationBatchSource[] = ["auto", "manual", "legacy"];
    const statuses: ParticipationStatus[] = ["undecided", "joining", "away", "decided"];

    expect(sources).toEqual(["auto", "manual", "legacy"]);
    expect(statuses).toEqual(["undecided", "joining", "away", "decided"]);
  });

  it("defines scoring snapshot and response shape for group today recommendations", () => {
    const weights: ScoringWeightsSnapshot = {
      weekdayMatch: 20,
      weatherMatch: 25,
      distance: 20,
      teammateRecommendation: 10,
      recentDuplicatePenalty: 12,
      negativeFeedbackPenalty: 10
    };
    const breakdown: ScoreBreakdown = {
      weekdayMatch: 20,
      weatherMatch: 0,
      distance: 20,
      teammateRecommendation: 10,
      recentDuplicatePenalty: 0,
      negativeFeedbackPenalty: -10,
      total: 40
    };
    const response: GroupTodayRecommendationsResponse = {
      groupId: "group-1",
      officeDate: "2026-07-09",
      batchId: "batch-1",
      batchNo: 2,
      generatedAt: "2026-07-09T03:30:00.000Z",
      weatherUnavailable: true,
      participationSummary: {
        joiningCount: 1,
        decidedCount: 1,
        awayCount: 0,
        undecidedCount: 2
      },
      items: [
        {
          rank: 1,
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1",
          restaurantName: "米饭小馆",
          dish: "卤肉饭",
          reason: "离办公室近，多人推荐",
          distanceMinutes: 8,
          priceBand: "30-40",
          averagePriceCents: 3500,
          tags: ["近", "下饭"],
          score: 40,
          scoreBreakdown: breakdown
        }
      ]
    };

    expect(weights.weatherMatch).toBe(25);
    expect(response.items[0]?.scoreBreakdown.total).toBe(40);
  });

  it("defines participation update request shape", () => {
    const joining: PutParticipationTodayRequest = { status: "joining" };
    const decided: PutParticipationTodayRequest = {
      status: "decided",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1"
    };

    expect(joining.status).toBe("joining");
    expect(decided.restaurantId).toBe("restaurant-1");
  });

  it("exports Stage 3 contracts from the shared package barrel", () => {
    expect(GROUP_ROUTES.participationToday("group-1")).toBe(
      "/api/groups/group-1/participation/today"
    );
    expect(DEFAULT_GROUP_SCORING_WEIGHTS.recentDuplicatePenalty).toBe(12);
  });
});
```

- [ ] **Step 2: Run the failing shared contract test**

Run:

```bash
pnpm --filter @lunch/shared test -- groupContracts.test.ts
```

Expected: FAIL because Stage 3 types and `GROUP_ROUTES.participationToday` do not exist.

- [ ] **Step 3: Add Stage 3 shared contracts**

Add these exports to `packages/shared/src/types.ts`, keeping existing legacy types intact:

```ts
export type RecommendationBatchSource = "auto" | "manual" | "legacy";
export type ParticipationStatus = "undecided" | "joining" | "away" | "decided";

export interface ScoringWeightsSnapshot {
  weekdayMatch: number;
  weatherMatch: number;
  distance: number;
  teammateRecommendation: number;
  recentDuplicatePenalty: number;
  negativeFeedbackPenalty: number;
}

export interface ScoreBreakdown {
  weekdayMatch: number;
  weatherMatch: number;
  distance: number;
  teammateRecommendation: number;
  recentDuplicatePenalty: number;
  negativeFeedbackPenalty: number;
  total: number;
}

export interface WeatherSummary {
  city: string;
  condition: WeatherTag | string;
  temperatureC?: number | undefined;
  precipitationProbability?: number | undefined;
  windLevel?: string | undefined;
  summary: string;
}

export interface GroupTodayRecommendationItem extends RecommendationItem {
  rank: number;
  priceBand?: string | undefined;
  averagePriceCents?: number | undefined;
  supportsDineIn?: boolean | undefined;
  supportsTakeout?: boolean | undefined;
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface ParticipationSummary {
  joiningCount: number;
  decidedCount: number;
  awayCount: number;
  undecidedCount: number;
}

export interface GroupTodayRecommendationsResponse {
  groupId: string;
  officeDate: string;
  batchId: string;
  batchNo: number;
  generatedAt: string;
  weather?: WeatherSummary | undefined;
  weatherUnavailable?: boolean | undefined;
  participationSummary: ParticipationSummary;
  items: GroupTodayRecommendationItem[];
  fromCache?: boolean | undefined;
}

export interface ParticipationMember {
  membershipId: string;
  displayName: string;
  status: ParticipationStatus;
  restaurantId?: string | undefined;
  recommendationId?: string | undefined;
  decidedAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface ParticipationTodayResponse {
  groupId: string;
  officeDate: string;
  members: ParticipationMember[];
  summary: ParticipationSummary;
}

export interface PutParticipationTodayRequest {
  status: ParticipationStatus;
  restaurantId?: string | undefined;
  recommendationId?: string | undefined;
}

export interface PutParticipationTodayResponse {
  groupId: string;
  officeDate: string;
  participation: ParticipationMember;
  summary: ParticipationSummary;
}
```

- [ ] **Step 4: Add the participation route builder**

Modify `packages/shared/src/api.ts`:

```ts
participationToday: (groupId: string) => `/api/groups/${groupId}/participation/today`,
```

- [ ] **Step 5: Verify shared barrel exports**

Modify `packages/shared/src/index.ts` if needed so it continues to export all public Stage 3 contracts from `api.ts`, `scoring.ts`, and `types.ts`:

```ts
export * from "./api.js";
export * from "./scoring.js";
export * from "./types.js";
```

Expected: imports such as `import { GROUP_ROUTES, DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared"` and `import type { GroupTodayRecommendationsResponse, PutParticipationTodayRequest } from "@lunch/shared"` typecheck.

- [ ] **Step 6: Extend scoring tests**

Add this test to `packages/shared/tests/scoring.test.ts`:

```ts
import { DEFAULT_GROUP_SCORING_WEIGHTS, LEGACY_SCORING_WEIGHTS, calculateRestaurantScore } from "../src/scoring";

it("supports explicit scoring weights and returns a numeric breakdown", () => {
  const result = calculateRestaurantScore({
    weekdayMatch: 1,
    weatherMatch: 0,
    distanceMinutes: 8,
    teammateRecommendationCount: 2,
    recentlyRecommended: true,
    negativeFeedbackCount: 1,
    weights: {
      weekdayMatch: 30,
      weatherMatch: 40,
      distance: 12,
      teammateRecommendation: 8,
      recentDuplicatePenalty: 5,
      negativeFeedbackPenalty: 7
    }
  });

  expect(LEGACY_SCORING_WEIGHTS.recentDuplicatePenalty).toBe(25);
  expect(DEFAULT_GROUP_SCORING_WEIGHTS.recentDuplicatePenalty).toBe(12);
  expect(result.score).toBe(38);
  expect(result.breakdown).toEqual({
    weekdayMatch: 30,
    weatherMatch: 0,
    distance: 12,
    teammateRecommendation: 8,
    recentDuplicatePenalty: -5,
    negativeFeedbackPenalty: -7,
    total: 38
  });
});
```

- [ ] **Step 7: Add weighted scoring support while preserving legacy defaults**

Modify `packages/shared/src/scoring.ts` so `calculateRestaurantScore` returns the existing `score` and `reasons`, plus `breakdown`:

```ts
import type { ScoreBreakdown, ScoringWeightsSnapshot } from "./types";

export const LEGACY_SCORING_WEIGHTS: ScoringWeightsSnapshot = {
  weekdayMatch: 20,
  weatherMatch: 25,
  distance: 20,
  teammateRecommendation: 10,
  recentDuplicatePenalty: 25,
  negativeFeedbackPenalty: 10
};

export const DEFAULT_GROUP_SCORING_WEIGHTS: ScoringWeightsSnapshot = {
  weekdayMatch: 20,
  weatherMatch: 25,
  distance: 20,
  teammateRecommendation: 10,
  recentDuplicatePenalty: 12,
  negativeFeedbackPenalty: 10
};

export interface ScoreInput {
  weekdayMatch: 0 | 1;
  weatherMatch: 0 | 1;
  distanceMinutes?: number | undefined;
  teammateRecommendationCount: number;
  recentlyRecommended: boolean;
  negativeFeedbackCount: number;
  weights?: ScoringWeightsSnapshot | undefined;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
}
```

Keep the current default score expectations passing:

```ts
const weights = input.weights ?? LEGACY_SCORING_WEIGHTS;
const weekdayScore = input.weekdayMatch ? weights.weekdayMatch : 0;
const weatherScore = input.weatherMatch ? weights.weatherMatch : 0;
const distanceScore = getDistanceScore(input.distanceMinutes, weights.distance);
const teammateScore = input.teammateRecommendationCount >= 2 ? weights.teammateRecommendation : 0;
const duplicatePenalty = input.recentlyRecommended ? -weights.recentDuplicatePenalty : 0;
const negativePenalty = input.negativeFeedbackCount > 0
  ? -(input.negativeFeedbackCount * weights.negativeFeedbackPenalty)
  : 0;
const total = weekdayScore + weatherScore + distanceScore + teammateScore + duplicatePenalty + negativePenalty;
```

- [ ] **Step 8: Run shared tests**

Run:

```bash
pnpm --filter @lunch/shared test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/api.ts packages/shared/src/scoring.ts packages/shared/src/index.ts packages/shared/tests/groupContracts.test.ts packages/shared/tests/scoring.test.ts
git commit -m "feat: add stage 3 lunch loop contracts"
```

---

### Task 2: Group-Scoped Weather And Today Batch Service

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20260709120000_stage3_current_batch_invariant/migration.sql`
- Modify: `apps/server/src/services/weather/openMeteo.ts`
- Modify: `apps/server/src/services/weather/officeWeather.ts`
- Create: `apps/server/src/services/recommendation/groupToday.ts`
- Create: `apps/server/tests/groupToday.test.ts`
- Create: `apps/server/tests/groupTodayConcurrency.test.ts`
- Modify: `apps/server/tests/recommendation.test.ts`

**Interfaces:**
- Consumes:
  - `requireActiveMembership` output from routes.
  - `rankRestaurantCandidates`.
  - `getOfficeDate`, `getOfficeWeekdayTag`.
  - `ScoringWeightsSnapshot`, `GroupTodayRecommendationsResponse`.
- Produces:
  - `NoCurrentBatchError`
  - `getCurrentGroupTodayRecommendations(input)`
  - `refreshGroupTodayRecommendations(input)`
  - `buildParticipationSummary(input)`
  - `getWeatherForGroupOfficeDate(input)`

- [ ] **Step 1: Verify Stage 3 schema fields and add current-batch invariant**

Inspect `apps/server/prisma/schema.prisma` and confirm these models and fields exist before service work starts:

```text
DailyRecommendationBatch:
  groupId, officeDate, batchNo, source, generatedByMembershipId,
  weatherSnapshotId, scoringWeightsSnapshot, algorithmVersion, isCurrent, createdAt

DailyRecommendationItem:
  batchId, rank, restaurantId, recommendationId, score, scoreBreakdown, reason, createdAt

DailyParticipation:
  groupId, officeDate, membershipId, status, restaurantId, recommendationId, decidedAt, updatedAt

WeatherSnapshot:
  groupId, date, city, temperatureC, condition, precipitationProbability, windLevel, rawPayload

ScoringWeights:
  weekdayMatch, weatherMatch, distance, teammateRecommendation,
  recentDuplicatePenalty, negativeFeedbackPenalty
```

Expected current state: the Stage 1 migration already created these models and most unique indexes, but it does not database-enforce one current batch per `groupId + officeDate`.

Add a comment to `DailyRecommendationBatch` in `apps/server/prisma/schema.prisma`:

```prisma
  /// One current batch per group office date is enforced by SQL partial unique index
  /// daily_recommendation_batches_one_current_key because Prisma cannot model it.
  isCurrent               Boolean                   @default(true) @map("is_current")
```

Create `apps/server/prisma/migrations/20260709120000_stage3_current_batch_invariant/migration.sql`:

```sql
-- Stage 3 lunch loop hardening.
-- Prisma cannot model partial unique indexes; this enforces one current batch
-- per group office date while allowing old non-current batches to remain.
CREATE UNIQUE INDEX IF NOT EXISTS "daily_recommendation_batches_one_current_key"
ON "daily_recommendation_batches"("group_id", "office_date")
WHERE "is_current" = true;
```

- [ ] **Step 2: Add a P2034 retry test**

When `apps/server/tests/groupToday.test.ts` is created below, add this test after the first refresh test:

```ts
it("retries refresh after a serializable transaction conflict", async () => {
  const prisma = buildPrismaForRefreshTest();
  const conflict = Object.assign(new Error("serialization failure"), {
    code: "P2034",
    clientVersion: "6.1.0"
  });
  prisma.$transaction
    .mockRejectedValueOnce(conflict)
    .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));

  const response = await refreshGroupTodayRecommendations({
    prisma: prisma as unknown as PrismaClient,
    env,
    groupId: "group-1",
    membership: {
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "member"
    }
  });

  expect(response.batchNo).toBe(1);
  expect(prisma.$transaction).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: Add a current-batch concurrency test**

Create `apps/server/tests/groupTodayConcurrency.test.ts`. Prefer a real database-backed integration test when `DATABASE_URL` is available; otherwise use a transaction-backed fake that exercises the unique current-batch invariant logic. The test must run concurrent refreshes and assert exactly one current batch remains:

```ts
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/env";
import { refreshGroupTodayRecommendations } from "../src/services/recommendation/groupToday";

const env = {
  SESSION_SECRET: "session-secret",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1"
} as AppEnv;

it("leaves exactly one current batch after concurrent refreshes", async () => {
  const prisma = buildConcurrentRefreshPrisma();
  const membership = {
    identityId: "identity-1",
    groupId: "group-1",
    membershipId: "membership-1",
    role: "member" as const
  };

  await Promise.all(
    Array.from({ length: 5 }, () =>
      refreshGroupTodayRecommendations({
        prisma: prisma as unknown as PrismaClient,
        env,
        groupId: "group-1",
        membership
      })
    )
  );

  expect(prisma.__currentBatches("group-1", "2026-07-09")).toHaveLength(1);
});
```

The helper `buildConcurrentRefreshPrisma()` must model both uniqueness races:

- Throw a Prisma-like `P2002` duplicate error if a transaction tries to leave two `isCurrent=true` batches for the same group office date.
- Throw a Prisma-like `P2002` duplicate error if two transactions both calculate the same next `batchNo` for `(groupId, officeDate)`.

Include a focused fake scenario where two transactions both calculate `batchNo=1`; the first succeeds, the second fails on the `(group_id, office_date, batch_no)` unique key, retries, creates `batchNo=2`, and the final assertion confirms only batch 2 is current.

If the implementation uses real Postgres for this test, seed two active restaurants and one active membership, run the same `Promise.all`, then query:

```ts
const currentCount = await prisma.dailyRecommendationBatch.count({
  where: { groupId: "group-1", officeDate: "2026-07-09", isCurrent: true }
});
expect(currentCount).toBe(1);
```

- [ ] **Step 4: Add service tests for read-only current batch behavior**

Create `apps/server/tests/groupToday.test.ts` with the first failing test:

```ts
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import {
  buildParticipationSummary,
  NoCurrentBatchError,
  getCurrentGroupTodayRecommendations
} from "../src/services/recommendation/groupToday";

const env = {
  SESSION_SECRET: "session-secret",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1"
} as AppEnv;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
});

it("returns 404 service error without creating a batch when no current batch exists", async () => {
  const prisma = {
    lunchGroup: {
      findUnique: vi.fn().mockResolvedValue({
        id: "group-1",
        officeTimezone: "Asia/Shanghai"
      })
    },
    dailyRecommendationBatch: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    groupMembership: { count: vi.fn().mockResolvedValue(2) },
    dailyParticipation: { groupBy: vi.fn().mockResolvedValue([]) }
  } as unknown as PrismaClient;

  await expect(
    getCurrentGroupTodayRecommendations({ prisma, env, groupId: "group-1" })
  ).rejects.toBeInstanceOf(NoCurrentBatchError);

  expect(prisma.dailyRecommendationBatch.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { groupId: "group-1", officeDate: "2026-07-09", isCurrent: true }
    })
  );
});

it("ignores removed memberships when building participation summary", async () => {
  const prisma = {
    groupMembership: {
      findMany: vi.fn().mockResolvedValue([
        { id: "membership-active", status: "active" }
      ])
    },
    dailyParticipation: {
      findMany: vi.fn().mockResolvedValue([
        { membershipId: "membership-active", status: "joining" },
        { membershipId: "membership-removed", status: "joining" }
      ])
    }
  } as unknown as PrismaClient;

  await expect(
    buildParticipationSummary({ prisma, groupId: "group-1", officeDate: "2026-07-09" })
  ).resolves.toEqual({
    joiningCount: 1,
    decidedCount: 0,
    awayCount: 0,
    undecidedCount: 0
  });

  expect(prisma.groupMembership.findMany).toHaveBeenCalledWith({
    where: { groupId: "group-1", status: "active" },
    select: { id: true }
  });
});
```

- [ ] **Step 5: Run the failing service tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupToday.test.ts groupTodayConcurrency.test.ts
```

Expected: FAIL because `groupToday.ts` and the concurrency helper do not exist.

- [ ] **Step 6: Add group-scoped weather lookup**

Modify `apps/server/src/services/weather/openMeteo.ts` to accept explicit office input:

```ts
export interface WeatherOfficeInput {
  apiBaseUrl: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export async function fetchWeatherSummaryForOffice(input: WeatherOfficeInput): Promise<WeatherSummary> {
  const url = buildWeatherUrl(input.apiBaseUrl);
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("current", "temperature_2m,precipitation,rain,wind_speed_10m");
  url.searchParams.set("timezone", input.timezone);
  return fetchWeatherUrl(url);
}

export async function fetchWeatherSummary(env: AppEnv): Promise<WeatherSummary> {
  return fetchWeatherSummaryForOffice({
    apiBaseUrl: env.WEATHER_API_BASE_URL,
    latitude: env.OFFICE_LATITUDE,
    longitude: env.OFFICE_LONGITUDE,
    timezone: env.OFFICE_TIMEZONE
  });
}
```

Move the existing fetch/parse body into `fetchWeatherUrl(url: URL)`.

Modify `apps/server/src/services/weather/officeWeather.ts` to add:

```ts
export async function getWeatherForGroupOfficeDate(input: {
  prisma: PrismaClient;
  env: AppEnv;
  group: {
    id: string;
    officeCity: string;
    officeLatitude: number;
    officeLongitude: number;
    officeTimezone: string;
  };
  date: string;
}): Promise<{ weather: WeatherSummary | null; weatherUnavailable: boolean; weatherSnapshotId?: string | undefined }> {
  const snapshotWhere = {
    groupId_date_city: {
      groupId: input.group.id,
      date: input.date,
      city: input.group.officeCity
    }
  };
  const existing = await input.prisma.weatherSnapshot.findUnique({ where: snapshotWhere });
  if (existing) {
    return {
      weather: snapshotToWeather(existing),
      weatherUnavailable: false,
      weatherSnapshotId: existing.id
    };
  }

  try {
    const weather = await fetchWeatherSummaryForOffice({
      apiBaseUrl: input.env.WEATHER_API_BASE_URL,
      latitude: input.group.officeLatitude,
      longitude: input.group.officeLongitude,
      timezone: input.group.officeTimezone
    });
    const created = await input.prisma.weatherSnapshot.upsert({
      where: snapshotWhere,
      create: {
        groupId: input.group.id,
        date: input.date,
        city: input.group.officeCity,
        temperatureC: weather.temperatureC,
        condition: weather.condition,
        precipitationProbability: weather.precipitationProbability,
        windLevel: weather.windLevel,
        rawPayload: { source: "open-meteo" }
      },
      update: {}
    });
    return { weather: snapshotToWeather(created), weatherUnavailable: false, weatherSnapshotId: created.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrent = await input.prisma.weatherSnapshot.findUnique({ where: snapshotWhere });
      if (concurrent) {
        return {
          weather: snapshotToWeather(concurrent),
          weatherUnavailable: false,
          weatherSnapshotId: concurrent.id
        };
      }
    }
    return { weather: null, weatherUnavailable: true };
  }
}
```

`snapshotToWeather()` and `weatherToSharedWeather()` must preserve `windLevel` when present:

```ts
windLevel: snapshot.windLevel ?? undefined
```

- [ ] **Step 7: Add group today service skeleton**

Create `apps/server/src/services/recommendation/groupToday.ts` with these exported boundaries:

```ts
import type {
  GroupTodayRecommendationsResponse,
  ParticipationSummary,
  ScoringWeightsSnapshot,
  WeatherSummary as SharedWeatherSummary
} from "@lunch/shared";
import { DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../env.js";
import type { MembershipContext } from "../groups/memberships.js";

export const GROUP_RECOMMENDATION_ALGORITHM_VERSION = "group-v1";

export class NoCurrentBatchError extends Error {
  constructor(public readonly groupId: string, public readonly officeDate: string) {
    super("No current recommendation batch exists");
  }
}

export async function getCurrentGroupTodayRecommendations(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
}): Promise<GroupTodayRecommendationsResponse> {
  const group = await requireGroup(input.prisma, input.groupId);
  const officeDate = getOfficeDate(new Date(), group.officeTimezone);
  const batch = await input.prisma.dailyRecommendationBatch.findFirst({
    where: { groupId: input.groupId, officeDate, isCurrent: true },
    include: {
      items: {
        orderBy: { rank: "asc" },
        include: { restaurant: true, recommendation: true }
      }
    }
  });
  if (!batch) throw new NoCurrentBatchError(input.groupId, officeDate);
  const summary = await buildParticipationSummary({ prisma: input.prisma, groupId: input.groupId, officeDate });
  return formatBatchResponse({ groupId: input.groupId, officeDate, batch, summary });
}
```

Implement `buildParticipationSummary` so it counts only active memberships:

```ts
export async function buildParticipationSummary(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  groupId: string;
  officeDate: string;
}): Promise<ParticipationSummary> {
  const activeMemberships = await input.prisma.groupMembership.findMany({
    where: { groupId: input.groupId, status: "active" },
    select: { id: true }
  });
  const activeIds = new Set(activeMemberships.map((membership) => membership.id));
  const rows = await input.prisma.dailyParticipation.findMany({
    where: { groupId: input.groupId, officeDate: input.officeDate }
  });
  const counts = { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 0 };
  const seen = new Set<string>();
  for (const row of rows) {
    if (!activeIds.has(row.membershipId)) continue;
    seen.add(row.membershipId);
    if (row.status === "joining") counts.joiningCount += 1;
    if (row.status === "decided") counts.decidedCount += 1;
    if (row.status === "away") counts.awayCount += 1;
    if (row.status === "undecided") counts.undecidedCount += 1;
  }
  counts.undecidedCount += activeMemberships.length - seen.size;
  return counts;
}
```

- [ ] **Step 8: Add refresh service tests**

Add tests to `apps/server/tests/groupToday.test.ts` for:

```ts
it("creates a manual batch with active group restaurants, score breakdown, and weights snapshot", async () => {
  const prisma = buildPrismaForRefreshTest();
  const response = await refreshGroupTodayRecommendations({
    prisma: prisma as unknown as PrismaClient,
    env,
    groupId: "group-1",
    membership: {
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "member"
    }
  });

  expect(response.groupId).toBe("group-1");
  expect(response.officeDate).toBe("2026-07-09");
  expect(response.batchNo).toBe(1);
  expect(response.items[0]).toMatchObject({
    rank: 1,
    restaurantId: "restaurant-1",
    recommendationId: "recommendation-1",
    scoreBreakdown: expect.objectContaining({ total: expect.any(Number) })
  });
  expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        groupId: "group-1",
        status: "active"
      })
    })
  );
  expect(prisma.$transaction).toHaveBeenCalled();
});

it("uses weatherMatch 0 when weather is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const prisma = buildPrismaForRefreshTest({ weatherSnapshot: null });

  const response = await refreshGroupTodayRecommendations({
    prisma: prisma as unknown as PrismaClient,
    env,
    groupId: "group-1",
    membership: {
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "member"
    }
  });

  expect(response.weatherUnavailable).toBe(true);
  expect(response.items[0]?.scoreBreakdown.weatherMatch).toBe(0);
});
```

Implement `buildPrismaForRefreshTest` inside the test file as an in-memory mock with `lunchGroup.findUnique`, `scoringWeights.findUnique`, `weatherSnapshot.findUnique`, `weatherSnapshot.upsert`, `restaurant.findMany`, `dailyRecommendationItem.findMany`, `dailyRecommendationBatch.aggregate`, `dailyRecommendationBatch.updateMany`, `dailyRecommendationBatch.create`, `groupMembership.count`, `dailyParticipation.groupBy`, and `$transaction`.

- [ ] **Step 9: Implement refresh service**

Add this implementation shape to `groupToday.ts`:

```ts
export async function refreshGroupTodayRecommendations(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
  membership: MembershipContext;
}): Promise<GroupTodayRecommendationsResponse> {
  const group = await requireGroup(input.prisma, input.groupId);
  const officeDate = getOfficeDate(new Date(), group.officeTimezone);
  const todayWeekday = getOfficeWeekdayTag(new Date(), group.officeTimezone);
  const weatherResult = await getWeatherForGroupOfficeDate({
    prisma: input.prisma,
    env: input.env,
    group,
    date: officeDate
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await input.prisma.$transaction(async (tx) => {
        const weights = await readWeightsSnapshot(tx, input.groupId);
        const ranked = await buildRankedItems({
          tx,
          groupId: input.groupId,
          officeDate,
          weekdayTag: todayWeekday,
          weatherCondition: weatherResult.weather?.condition ?? null,
          weights
        });
        const aggregate = await tx.dailyRecommendationBatch.aggregate({
          where: { groupId: input.groupId, officeDate },
          _max: { batchNo: true }
        });
        const batchNo = (aggregate._max.batchNo ?? 0) + 1;
        await tx.dailyRecommendationBatch.updateMany({
          where: { groupId: input.groupId, officeDate, isCurrent: true },
          data: { isCurrent: false }
        });
        const batch = await tx.dailyRecommendationBatch.create({
          data: {
            groupId: input.groupId,
            officeDate,
            batchNo,
            source: "manual",
            generatedByMembershipId: input.membership.membershipId,
            weatherSnapshotId: weatherResult.weatherSnapshotId ?? null,
            scoringWeightsSnapshot: weights,
            algorithmVersion: GROUP_RECOMMENDATION_ALGORITHM_VERSION,
            isCurrent: true,
            items: {
              create: ranked.map((item, index) => ({
                rank: index + 1,
                restaurantId: item.restaurantId,
                recommendationId: item.recommendationId ?? null,
                score: item.score,
                scoreBreakdown: item.scoreBreakdown,
                reason: item.reason
              }))
            }
          },
          include: {
            items: {
              orderBy: { rank: "asc" },
              include: { restaurant: true, recommendation: true }
            }
          }
        });
        const summary = await buildParticipationSummary({ prisma: tx, groupId: input.groupId, officeDate });
        return formatBatchResponse({
          groupId: input.groupId,
          officeDate,
          batch,
          summary,
          weather: weatherToSharedWeather(group.officeCity, weatherResult.weather),
          weatherUnavailable: weatherResult.weatherUnavailable
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (attempt === 2 || !isRetryableTransactionError(error)) throw error;
    }
  }

  throw new Error("Could not create group daily recommendation batch");
}
```

`buildRankedItems` must query only active restaurants in the path group:

```ts
const restaurants = await tx.restaurant.findMany({
  where: { groupId, status: "active" },
  include: {
    recommendations: true,
    feedback: { where: { officeDate, type: { in: ["skip", "avoid"] } } }
  }
});
```

`isRetryableTransactionError(error)` must retry Prisma `P2034` serialization conflicts and `P2002` unique violations for both:

- `daily_recommendation_batches_one_current_key`.
- The existing `(group_id, office_date, batch_no)` unique key, surfaced by Prisma as `daily_recommendation_batches_group_id_office_date_batch_no_key` or equivalent metadata.

The first protects the one-current-batch invariant. The second handles the race where concurrent transactions both calculate the same `max(batchNo) + 1`.

- [ ] **Step 10: Preserve legacy recommendation tests**

Update `apps/server/tests/recommendation.test.ts` only where weighted scoring adds `breakdown` fields. Keep these expectations unchanged:

```ts
expect(response.items[0]).toMatchObject({
  restaurantId: "restaurant-3",
  recommendationId: "recommendation-3",
  tags: ["近", "热乎"]
});
```

Run:

```bash
pnpm --filter @lunch/server test -- recommendation.test.ts groupToday.test.ts groupTodayConcurrency.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260709120000_stage3_current_batch_invariant/migration.sql apps/server/src/services/weather/openMeteo.ts apps/server/src/services/weather/officeWeather.ts apps/server/src/services/recommendation/groupToday.ts apps/server/tests/groupToday.test.ts apps/server/tests/groupTodayConcurrency.test.ts apps/server/tests/recommendation.test.ts
git commit -m "feat: add group today batch service"
```

---

### Task 3: Group Today Recommendation Routes

**Files:**
- Create: `apps/server/src/routes/groupToday.ts`
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/tests/groupTodayRoutes.test.ts`

**Interfaces:**
- Consumes:
  - `requireActiveMembership(input)`
  - `getCurrentGroupTodayRecommendations(input)`
  - `refreshGroupTodayRecommendations(input)`
  - `NoCurrentBatchError`
- Produces:
  - `GET /api/groups/:groupId/today-recommendations`
  - `POST /api/groups/:groupId/today-recommendations/refresh`

- [ ] **Step 1: Add route tests for auth and read-only 404**

Create `apps/server/tests/groupTodayRoutes.test.ts` with an app-inject pattern matching `groupKnowledge.test.ts`:

```ts
import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signGroupSessionToken } from "../src/services/auth/tokens";

const prisma = vi.hoisted(() => ({
  __reset: vi.fn(),
  groupMembership: {
    findUnique: vi.fn(),
    count: vi.fn()
  },
  lunchGroup: {
    findUnique: vi.fn()
  },
  dailyRecommendationBatch: {
    findFirst: vi.fn()
  },
  dailyParticipation: {
    groupBy: vi.fn()
  }
}));

vi.mock("../src/plugins/prisma", () => ({ prisma }));

function groupToken(input: {
  identityId?: string;
  groupId?: string;
  membershipId?: string;
  role?: GroupRole;
} = {}) {
  return signGroupSessionToken(
    {
      identityId: input.identityId ?? "identity-1",
      groupId: input.groupId ?? "group-1",
      membershipId: input.membershipId ?? "membership-1",
      role: input.role ?? "member",
      exp: Date.now() + 60_000
    },
    "session-secret"
  );
}

function seedMembership(status: MembershipStatus = "active") {
  prisma.groupMembership.findUnique.mockResolvedValue({
    id: "membership-1",
    groupId: "group-1",
    identityId: "identity-1",
    role: "member",
    status
  });
}
```

Add these tests:

```ts
it.each([
  ["GET", "/api/groups/group-1/today-recommendations"],
  ["POST", "/api/groups/group-1/today-recommendations/refresh"]
] as const)("returns 401/missing_token without Authorization for %s %s", async (method, url) => {
  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({ error: "missing_token" });
  await app.close();
});

it.each([
  ["GET", "/api/groups/group-1/today-recommendations"],
  ["POST", "/api/groups/group-1/today-recommendations/refresh"]
] as const)("rejects read-token-only %s %s requests", async (method, url) => {
  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    headers: { "x-lunch-read-token": "read-token" }
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({ error: "missing_token" });
  await app.close();
});

it.each([
  ["GET", "/api/groups/group-1/today-recommendations"],
  ["POST", "/api/groups/group-1/today-recommendations/refresh"]
] as const)("rejects removed memberships for %s %s", async (method, url) => {
  seedMembership("removed");

  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${groupToken()}` }
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({ error: "active_membership_required" });
  await app.close();
});

it("returns 404 and does not create a batch when no current batch exists", async () => {
  seedMembership();
  prisma.lunchGroup.findUnique.mockResolvedValue({
    id: "group-1",
    officeTimezone: "Asia/Shanghai",
    officeCity: "Shanghai",
    officeLatitude: 31.2304,
    officeLongitude: 121.4737
  });
  prisma.dailyRecommendationBatch.findFirst.mockResolvedValue(null);
  prisma.groupMembership.count.mockResolvedValue(1);
  prisma.dailyParticipation.groupBy.mockResolvedValue([]);

  const app = await buildTestApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/groups/group-1/today-recommendations",
    headers: { authorization: `Bearer ${groupToken()}` }
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ error: "no_current_batch" });
  expect(prisma.dailyRecommendationBatch.create).toBeUndefined();
  await app.close();
});
```

- [ ] **Step 2: Run the failing route tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupTodayRoutes.test.ts
```

Expected: FAIL because the route file is not registered.

- [ ] **Step 3: Implement group today routes**

Create `apps/server/src/routes/groupToday.ts`:

```ts
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { requireActiveMembership } from "../services/groups/memberships.js";
import {
  NoCurrentBatchError,
  getCurrentGroupTodayRecommendations,
  refreshGroupTodayRecommendations
} from "../services/recommendation/groupToday.js";

function sendGroupTodayError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  if (error instanceof NoCurrentBatchError) {
    reply.code(404);
    return {
      error: "no_current_batch",
      message: "No current recommendation batch exists for this group and office date"
    };
  }
  throw error;
}

export async function registerGroupTodayRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/today-recommendations", async (request, reply) => {
    try {
      await requireActiveMembership({
        prisma,
        env,
        groupId: request.params.groupId,
        authorization: request.headers.authorization
      });
      return getCurrentGroupTodayRecommendations({ prisma, env, groupId: request.params.groupId });
    } catch (error) {
      return sendGroupTodayError(reply, error);
    }
  });

  app.post<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/today-recommendations/refresh",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          authorization: request.headers.authorization
        });
        return refreshGroupTodayRecommendations({
          prisma,
          env,
          groupId: request.params.groupId,
          membership
        });
      } catch (error) {
        return sendGroupTodayError(reply, error);
      }
    }
  );
}
```

Modify `apps/server/src/app.ts`:

```ts
import { registerGroupTodayRoutes } from "./routes/groupToday.js";

await registerGroupRoutes(app, env);
await registerGroupTodayRoutes(app, env);
await registerGroupKnowledgeRoutes(app, env);
```

- [ ] **Step 4: Add refresh route tests**

Extend `apps/server/tests/groupTodayRoutes.test.ts`:

```ts
it.each([
  ["GET", "/api/groups/group-1/today-recommendations"],
  ["POST", "/api/groups/group-1/today-recommendations/refresh"]
] as const)("rejects a session token for another group on %s %s", async (method, url) => {
  seedMembership();
  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${groupToken({ groupId: "group-2" })}` }
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({ error: "group_session_mismatch" });
  await app.close();
});

it("creates a new current batch through POST refresh", async () => {
  seedMembership();
  seedRefreshPrisma(prisma);

  const app = await buildTestApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/groups/group-1/today-recommendations/refresh",
    headers: { authorization: `Bearer ${groupToken()}` }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    groupId: "group-1",
    officeDate: "2026-07-09",
    batchNo: 1,
    items: [{ rank: 1, restaurantId: "restaurant-1" }]
  });
  expect(prisma.dailyRecommendationBatch.updateMany).toHaveBeenCalledWith({
    where: { groupId: "group-1", officeDate: "2026-07-09", isCurrent: true },
    data: { isCurrent: false }
  });
  await app.close();
});
```

- [ ] **Step 5: Run route tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupTodayRoutes.test.ts groupToday.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/groupToday.ts apps/server/src/app.ts apps/server/tests/groupTodayRoutes.test.ts
git commit -m "feat: add group today recommendation routes"
```

---

### Task 4: Participation And Decision API

**Files:**
- Create: `apps/server/src/routes/groupParticipation.ts`
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/tests/groupParticipation.test.ts`
- Modify: `apps/server/src/services/recommendation/groupToday.ts`

**Interfaces:**
- Consumes:
  - `requireActiveMembership`
  - `buildParticipationSummary`
  - `PutParticipationTodayRequest`
- Produces:
  - `GET /api/groups/:groupId/participation/today`
  - `PUT /api/groups/:groupId/participation/today`

- [ ] **Step 1: Add participation route tests**

Create `apps/server/tests/groupParticipation.test.ts` with tests for:

```ts
it("returns active group members with undecided fallback", async () => {
  seedActiveMemberships([
    { id: "membership-1", displayName: "小陈" },
    { id: "membership-2", displayName: "小林" }
  ]);
  seedParticipation([{ membershipId: "membership-1", status: "joining" }]);

  const app = await buildTestApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/groups/group-1/participation/today",
    headers: { authorization: `Bearer ${groupToken()}` }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    groupId: "group-1",
    officeDate: "2026-07-09",
    summary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    members: [
      { membershipId: "membership-1", displayName: "小陈", status: "joining" },
      { membershipId: "membership-2", displayName: "小林", status: "undecided" }
    ]
  });
  await app.close();
});

it("requires restaurantId when deciding", async () => {
  seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

  const app = await buildTestApp();
  const response = await app.inject({
    method: "PUT",
    url: "/api/groups/group-1/participation/today",
    headers: { authorization: `Bearer ${groupToken()}` },
    payload: { status: "decided" }
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ error: "decision_restaurant_required" });
  await app.close();
});

it.each([
  ["GET", "/api/groups/group-1/participation/today", undefined],
  ["PUT", "/api/groups/group-1/participation/today", { status: "joining" }]
] as const)("returns 401/missing_token without Authorization for participation %s %s", async (method, url, payload) => {
  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {})
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({ error: "missing_token" });
  await app.close();
});

it.each([
  ["GET", "/api/groups/group-1/participation/today"],
  ["PUT", "/api/groups/group-1/participation/today"]
] as const)("rejects read-token-only participation %s %s requests", async (method, url) => {
  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    headers: { "x-lunch-read-token": "read-token" },
    ...(method === "PUT" ? { payload: { status: "joining" } } : {})
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toMatchObject({ error: "missing_token" });
  await app.close();
});

it.each([
  ["GET", "/api/groups/group-1/participation/today"],
  ["PUT", "/api/groups/group-1/participation/today"]
] as const)("rejects removed memberships for participation %s %s", async (method, url) => {
  seedRemovedMembership({ id: "membership-1", displayName: "小陈" });

  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${groupToken()}` },
    ...(method === "PUT" ? { payload: { status: "joining" } } : {})
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({ error: "active_membership_required" });
  await app.close();
});

it.each([
  ["GET", "/api/groups/group-1/participation/today"],
  ["PUT", "/api/groups/group-1/participation/today"]
] as const)("rejects group-mismatched participation sessions for %s %s", async (method, url) => {
  seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

  const app = await buildTestApp();
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${groupToken({ groupId: "group-2" })}` },
    ...(method === "PUT" ? { payload: { status: "joining" } } : {})
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({ error: "group_session_mismatch" });
  await app.close();
});

it("stores decided participation only for restaurant and recommendation in the path group", async () => {
  seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
  seedRestaurant({ id: "restaurant-1", groupId: "group-1" });
  seedRecommendation({ id: "recommendation-1", groupId: "group-1", restaurantId: "restaurant-1" });

  const app = await buildTestApp();
  const response = await app.inject({
    method: "PUT",
    url: "/api/groups/group-1/participation/today",
    headers: { authorization: `Bearer ${groupToken()}` },
    payload: {
      status: "decided",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1"
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    participation: {
      membershipId: "membership-1",
      status: "decided",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1"
    }
  });
  expect(prisma.dailyParticipation.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: expect.objectContaining({
        status: "decided",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        decidedAt: expect.any(Date)
      })
    })
  );
  await app.close();
});

it("rejects decided participation for paused or blocked restaurants", async () => {
  seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
  seedRestaurant({ id: "restaurant-1", groupId: "group-1", status: "blocked" });

  const app = await buildTestApp();
  const response = await app.inject({
    method: "PUT",
    url: "/api/groups/group-1/participation/today",
    headers: { authorization: `Bearer ${groupToken()}` },
    payload: {
      status: "decided",
      restaurantId: "restaurant-1"
    }
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ error: "restaurant_not_active" });
  await app.close();
});
```

Implement seed helpers in the test file with the same in-memory style as `groupKnowledge.test.ts`, including `seedRemovedMembership` and restaurant `status` support.

- [ ] **Step 2: Run the failing participation tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupParticipation.test.ts
```

Expected: FAIL because the participation route does not exist.

- [ ] **Step 3: Implement participation route validation**

Create `apps/server/src/routes/groupParticipation.ts`:

```ts
import type { ParticipationStatus, PutParticipationTodayRequest } from "@lunch/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { getOfficeDate } from "../services/dates.js";
import { requireActiveMembership } from "../services/groups/memberships.js";
import { buildParticipationSummary } from "../services/recommendation/groupToday.js";

class ParticipationValidationError extends Error {
  constructor(public readonly error: string, message: string) {
    super(message);
  }
}

const participationStatuses = new Set<ParticipationStatus>(["undecided", "joining", "away", "decided"]);

function parseParticipationBody(body: unknown): PutParticipationTodayRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ParticipationValidationError("invalid_participation_request", "Participation request body is invalid");
  }
  const record = body as Record<string, unknown>;
  const status = record.status;
  if (!participationStatuses.has(status as ParticipationStatus)) {
    throw new ParticipationValidationError("invalid_participation_status", "Participation status is invalid");
  }
  const restaurantId = typeof record.restaurantId === "string" ? record.restaurantId.trim() : undefined;
  const recommendationId = typeof record.recommendationId === "string" ? record.recommendationId.trim() : undefined;
  if (status === "decided" && !restaurantId) {
    throw new ParticipationValidationError("decision_restaurant_required", "restaurantId is required when status is decided");
  }
  return {
    status: status as ParticipationStatus,
    ...(restaurantId ? { restaurantId } : {}),
    ...(recommendationId ? { recommendationId } : {})
  };
}
```

- [ ] **Step 4: Implement participation GET**

In `registerGroupParticipationRoutes`, add:

```ts
app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/participation/today", async (request, reply) => {
  try {
    await requireActiveMembership({
      prisma,
      env,
      groupId: request.params.groupId,
      authorization: request.headers.authorization
    });
    const group = await prisma.lunchGroup.findUnique({ where: { id: request.params.groupId } });
    if (!group) {
      reply.code(404);
      return { error: "group_not_found", message: "Group not found" };
    }
    const officeDate = getOfficeDate(new Date(), group.officeTimezone);
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: request.params.groupId, status: "active" },
      include: { identity: true },
      orderBy: { joinedAt: "asc" }
    });
    const participation = await prisma.dailyParticipation.findMany({
      where: { groupId: request.params.groupId, officeDate }
    });
    const participationByMembership = new Map(participation.map((item) => [item.membershipId, item]));
    const summary = await buildParticipationSummary({ prisma, groupId: request.params.groupId, officeDate });
    return {
      groupId: request.params.groupId,
      officeDate,
      summary,
      members: memberships.map((membership) => {
        const item = participationByMembership.get(membership.id);
        return {
          membershipId: membership.id,
          displayName: membership.identity.displayName,
          status: item?.status ?? "undecided",
          ...(item?.restaurantId ? { restaurantId: item.restaurantId } : {}),
          ...(item?.recommendationId ? { recommendationId: item.recommendationId } : {}),
          ...(item?.decidedAt ? { decidedAt: item.decidedAt.toISOString() } : {}),
          ...(item?.updatedAt ? { updatedAt: item.updatedAt.toISOString() } : {})
        };
      })
    };
  } catch (error) {
    return sendParticipationError(reply, error);
  }
});
```

- [ ] **Step 5: Implement participation PUT**

Add:

```ts
app.put<{ Params: { groupId: string }; Body: PutParticipationTodayRequest }>(
  "/api/groups/:groupId/participation/today",
  async (request, reply) => {
    try {
      const membership = await requireActiveMembership({
        prisma,
        env,
        groupId: request.params.groupId,
        authorization: request.headers.authorization
      });
      const group = await prisma.lunchGroup.findUnique({ where: { id: request.params.groupId } });
      if (!group) {
        reply.code(404);
        return { error: "group_not_found", message: "Group not found" };
      }
      const officeDate = getOfficeDate(new Date(), group.officeTimezone);
      const body = parseParticipationBody(request.body);
      const currentMembership = await prisma.groupMembership.findUnique({
        where: { id: membership.membershipId },
        include: { identity: true }
      });
      if (body.status === "decided") {
        await assertDecisionReferences({
          groupId: request.params.groupId,
          restaurantId: body.restaurantId as string,
          recommendationId: body.recommendationId
        });
      }
      const clearDecision = body.status !== "decided";
      const data = {
        status: body.status,
        restaurantId: clearDecision ? null : body.restaurantId,
        recommendationId: clearDecision ? null : body.recommendationId ?? null,
        decidedAt: clearDecision ? null : new Date()
      };
      const participation = await prisma.dailyParticipation.upsert({
        where: {
          groupId_officeDate_membershipId: {
            groupId: request.params.groupId,
            officeDate,
            membershipId: membership.membershipId
          }
        },
        create: {
          groupId: request.params.groupId,
          officeDate,
          membershipId: membership.membershipId,
          ...data
        },
        update: data
      });
      const summary = await buildParticipationSummary({ prisma, groupId: request.params.groupId, officeDate });
      return {
        groupId: request.params.groupId,
        officeDate,
        summary,
        participation: {
          membershipId: membership.membershipId,
          displayName: currentMembership?.identity.displayName ?? membership.membershipId,
          status: participation.status,
          ...(participation.restaurantId ? { restaurantId: participation.restaurantId } : {}),
          ...(participation.recommendationId ? { recommendationId: participation.recommendationId } : {}),
          ...(participation.decidedAt ? { decidedAt: participation.decidedAt.toISOString() } : {}),
          updatedAt: participation.updatedAt.toISOString()
        }
      };
    } catch (error) {
      return sendParticipationError(reply, error);
    }
  }
);
```

`assertDecisionReferences` must:

```ts
const restaurant = await prisma.restaurant.findFirst({
  where: { id: restaurantId, groupId }
});
if (!restaurant) {
  throw new ParticipationValidationError("restaurant_group_mismatch", "Restaurant does not belong to route group");
}
if (restaurant.status !== "active") {
  throw new ParticipationValidationError("restaurant_not_active", "Only active restaurants can be selected");
}
if (recommendationId) {
  const recommendation = await prisma.recommendation.findFirst({
    where: { id: recommendationId, groupId, restaurantId }
  });
  if (!recommendation) {
    throw new ParticipationValidationError(
      "recommendation_group_mismatch",
      "Recommendation does not belong to route group and restaurant"
    );
  }
}
```

- [ ] **Step 6: Register routes and run tests**

Modify `apps/server/src/app.ts`:

```ts
import { registerGroupParticipationRoutes } from "./routes/groupParticipation.js";

await registerGroupTodayRoutes(app, env);
await registerGroupParticipationRoutes(app, env);
await registerGroupKnowledgeRoutes(app, env);
```

Run:

```bash
pnpm --filter @lunch/server test -- groupParticipation.test.ts groupTodayRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/groupParticipation.ts apps/server/src/app.ts apps/server/tests/groupParticipation.test.ts apps/server/src/services/recommendation/groupToday.ts
git commit -m "feat: add group participation API"
```

---

### Completed Task 5: Extension Group Storage (Historical Baseline)

> Stage 3 hardening amendment: Task 5 was completed at `1f32dec`. Do not re-execute its original whole-state read-modify-write snippets. Task 5A below is the current execution baseline and supersedes those mutation details.

**Files:**
- Modify: `apps/extension/src/config.ts`
- Modify: `apps/extension/src/storage.ts`
- Modify: `apps/extension/tests/storage.test.ts`

**Interfaces:**
- Consumes:
  - `GroupSummary`
  - `GroupTodayRecommendationsResponse`
- Produces:
  - `ExtensionStorageShape`
  - `getStorageState()`
  - `saveStorageState(state)`
  - `getActiveGroupSession()`
  - `saveGroupRecommendationCache(groupId, response)`
  - `getActiveGroupRecommendationCache()`
  - `getReminderSettingsForActiveGroup()`

- [ ] **Step 1: Add grouped storage tests**

Modify `apps/extension/tests/storage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import {
  getActiveGroupRecommendationCache,
  getActiveGroupSession,
  getDefaultStorageState,
  saveGroupRecommendationCache
} from "../src/storage";

it("uses grouped storage defaults without a read token requirement for group APIs", () => {
  expect(getDefaultStorageState()).toMatchObject({
    apiBaseUrl: "http://localhost:3000",
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  });
});

it("resolves the active group session from sessionsByGroupId", async () => {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.state]: {
            ...getDefaultStorageState(),
            activeGroupId: "group-1",
            sessionsByGroupId: {
              "group-1": { token: "group-session-token" }
            }
          }
        })
      }
    }
  });

  await expect(getActiveGroupSession()).resolves.toEqual({
    groupId: "group-1",
    token: "group-session-token"
  });
});

it("stores and reads recommendation cache only for the active group", async () => {
  const set = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue({
    [STORAGE_KEYS.state]: {
      ...getDefaultStorageState(),
      activeGroupId: "group-2",
      lastRecommendationsByGroupId: {
        "group-1": { groupId: "group-1", officeDate: "2026-07-09", items: [] }
      }
    }
  });
  vi.stubGlobal("chrome", { storage: { local: { get, set } } });

  expect(await getActiveGroupRecommendationCache()).toBeNull();

  await saveGroupRecommendationCache("group-2", {
    groupId: "group-2",
    officeDate: "2026-07-09",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-09T03:30:00.000Z",
    participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
    items: []
  });

  expect(set).toHaveBeenCalledWith({
    [STORAGE_KEYS.state]: expect.objectContaining({
      lastRecommendationsByGroupId: expect.objectContaining({
        "group-2": expect.objectContaining({ fromCache: true })
      })
    })
  });
});
```

- [ ] **Step 2: Run the failing storage tests**

Run:

```bash
pnpm --filter @lunch/extension test -- storage.test.ts
```

Expected: FAIL because grouped storage helpers do not exist.

- [ ] **Step 3: Add grouped storage keys**

Modify `apps/extension/src/config.ts`:

```ts
export const STORAGE_KEYS = {
  state: "lunchState",
  settings: "lunchSettings",
  lastRecommendation: "lunchLastRecommendation"
} as const;
```

Keep `settings` and `lastRecommendation` during Stage 3 so old installs can be migrated.

- [ ] **Step 4: Implement grouped storage shape**

Modify `apps/extension/src/storage.ts`:

```ts
import type { GroupSummary, GroupTodayRecommendationsResponse } from "@lunch/shared";
import { STORAGE_KEYS } from "./config";

export interface GroupSessionStorage {
  token: string;
  expiresAt?: string | undefined;
}

export interface LocalReminderOverride {
  reminderTime?: string | undefined;
  enabled?: boolean | undefined;
}

export interface ExtensionStorageShape {
  apiBaseUrl: string;
  readToken: string;
  reminderTime: string;
  enabled: boolean;
  activeGroupId?: string | undefined;
  identityToken?: string | undefined;
  sessionsByGroupId: Record<string, GroupSessionStorage>;
  groupSummariesById: Record<string, GroupSummary>;
  lastRecommendationsByGroupId: Record<string, GroupTodayRecommendationsResponse>;
  localReminderOverridesByGroupId: Record<string, LocalReminderOverride>;
}

export function getDefaultStorageState(): ExtensionStorageShape {
  return {
    apiBaseUrl: "http://localhost:3000",
    readToken: "dev-read-token",
    reminderTime: "11:30",
    enabled: true,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  };
}
```

Implement `getStorageState` by merging in this order so current grouped state always wins over legacy data:

```ts
const data = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.state]);
return {
  ...getDefaultStorageState(),
  ...(data[STORAGE_KEYS.settings] ?? {}),
  ...(data[STORAGE_KEYS.state] ?? {})
};
```

- [ ] **Step 5: Implement active group helpers**

Add:

```ts
export async function getActiveGroupSession(): Promise<{ groupId: string; token: string } | null> {
  const state = await getStorageState();
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const session = state.sessionsByGroupId[groupId];
  if (!session?.token) return null;
  return { groupId, token: session.token };
}

export async function saveGroupRecommendationCache(
  groupId: string,
  response: GroupTodayRecommendationsResponse
): Promise<void> {
  const state = await getStorageState();
  await saveStorageState({
    ...state,
    lastRecommendationsByGroupId: {
      ...state.lastRecommendationsByGroupId,
      [groupId]: { ...response, fromCache: true }
    }
  });
}

export async function getActiveGroupRecommendationCache(): Promise<GroupTodayRecommendationsResponse | null> {
  const state = await getStorageState();
  if (!state.activeGroupId) return null;
  return state.lastRecommendationsByGroupId[state.activeGroupId] ?? null;
}
```

Update existing `getSettings` and `saveSettings` to read/write through `getStorageState` so `background.ts` keeps working.

- [ ] **Step 6: Run extension storage tests**

Run:

```bash
pnpm --filter @lunch/extension test -- storage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/config.ts apps/extension/src/storage.ts apps/extension/tests/storage.test.ts
git commit -m "feat: add grouped extension storage"
```

---

### Task 5: Review Hardening For Participation And Extension State Isolation

**Files:**
- Modify: `apps/server/src/routes/groupParticipation.ts`
- Modify: `apps/server/tests/groupParticipation.test.ts`
- Modify: `apps/extension/src/storage.ts`
- Modify: `apps/extension/tests/storage.test.ts`

**Interfaces:**
- Consumes:
  - Existing `ExtensionStorageShape`, `getStorageState()`, `saveStorageState(state)`, `saveSettings(settings)`, `saveGroupRecommendationCache(groupId, response)`, and `getActiveGroupRecommendationCache()`.
  - Existing `parseParticipationBody(body)` and `ParticipationValidationError`.
- Produces:
  - `STORAGE_STATE_LOCK_NAME = "lunch-extension-storage-state"`.
  - `updateStorageState(updater: (state: ExtensionStorageShape) => ExtensionStorageShape): Promise<ExtensionStorageShape>`.
  - 400/`invalid_participation_request` for present but non-string, empty, or whitespace-only resource IDs.
  - `recommendation_cache_group_mismatch` rejection without a cache write.
  - `null` active-cache fallback for a stored response whose `groupId` does not match its bucket.

- [ ] **Step 1: Add failing participation resource-shape tests**

Add this table test to `apps/server/tests/groupParticipation.test.ts`:

```ts
it.each([
  ["numeric restaurantId", { status: "joining", restaurantId: 123 }],
  ["blank restaurantId", { status: "joining", restaurantId: "   " }],
  ["object recommendationId", {
    status: "decided",
    restaurantId: "restaurant-1",
    recommendationId: { id: "recommendation-1" }
  }],
  ["blank recommendationId", {
    status: "decided",
    restaurantId: "restaurant-1",
    recommendationId: ""
  }]
] as const)("rejects malformed participation resource ids: %s", async (_label, payload) => {
  seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
  seedRestaurant({ id: "restaurant-1", groupId: "group-1" });

  const app = await buildTestApp();
  const response = await app.inject({
    method: "PUT",
    url: "/api/groups/group-1/participation/today",
    headers: { authorization: `Bearer ${groupToken()}` },
    payload
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({ error: "invalid_participation_request" });
  expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
  await app.close();
});
```

- [ ] **Step 2: Run the participation test to verify RED**

Run:

```bash
pnpm --filter @lunch/server exec vitest run tests/groupParticipation.test.ts -t "malformed participation resource ids" --reporter=verbose
```

Expected: FAIL because the current parser silently treats non-string IDs as absent or accepts blank optional IDs.

- [ ] **Step 3: Reject malformed present participation IDs**

In `apps/server/src/routes/groupParticipation.ts`, add and use this helper from `parseParticipationBody`:

```ts
function parseOptionalResourceId(
  record: Record<string, unknown>,
  key: "restaurantId" | "recommendationId"
): string | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ParticipationValidationError(
      "invalid_participation_request",
      `${key} must be a non-empty string when provided`
    );
  }
  return value.trim();
}

const restaurantId = parseOptionalResourceId(record, "restaurantId");
const recommendationId = parseOptionalResourceId(record, "recommendationId");
```

Keep the existing `decision_restaurant_required`, active-restaurant, path-group, recommendation ownership, and non-`decided` clearing behavior unchanged.

- [ ] **Step 4: Verify the participation tests are GREEN**

Run:

```bash
pnpm --filter @lunch/server test -- groupParticipation.test.ts groupTodayRoutes.test.ts
```

Expected: PASS, including every existing Task 4 auth, ownership, active-restaurant, and clearing test.

- [ ] **Step 5: Add failing storage lock and cache-invariant tests**

Update the Vitest import in `apps/extension/tests/storage.test.ts` to include `beforeEach`, and the storage import to include `updateStorageState`. Add this serial Web Locks fake and make it the default for every existing writer test:

```ts
function serialLockManager() {
  let queue = Promise.resolve();
  return {
    request: vi.fn((
      _name: string,
      _options: LockOptions,
      callback: () => Promise<unknown>
    ) => {
      const run = queue.then(callback);
      queue = run.then(() => undefined, () => undefined);
      return run;
    })
  };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: serialLockManager() });
});
```

Add the concurrency regression. Its mutable fake must update `storedState` from every `chrome.storage.local.set` call so later lock holders re-read the previous holder's write:

```ts
it("serializes settings, active group session, and cache mutations without lost updates", async () => {
  let storedState = getDefaultStorageState();
  const locks = serialLockManager();
  const get = vi.fn(async () => ({ [STORAGE_KEYS.state]: structuredClone(storedState) }));
  const set = vi.fn(async (value: Record<string, unknown>) => {
    storedState = structuredClone(value[STORAGE_KEYS.state]) as typeof storedState;
  });
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", {
    storage: { local: { get, set } },
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) }
  });

  await Promise.all([
    saveSettings({
      apiBaseUrl: "https://lunch.example",
      readToken: "read-token",
      reminderTime: "12:00",
      enabled: false
    }),
    updateStorageState((state) => ({
      ...state,
      activeGroupId: "group-2",
      sessionsByGroupId: {
        ...state.sessionsByGroupId,
        "group-2": { token: "group-session-token" }
      }
    })),
    saveGroupRecommendationCache(
      "group-1",
      recommendationResponse("group-1", "batch-1")
    )
  ]);

  expect(locks.request).toHaveBeenCalledTimes(3);
  expect(storedState).toMatchObject({
    apiBaseUrl: "https://lunch.example",
    reminderTime: "12:00",
    enabled: false,
    activeGroupId: "group-2",
    sessionsByGroupId: {
      "group-2": { token: "group-session-token" }
    },
    lastRecommendationsByGroupId: {
      "group-1": expect.objectContaining({ groupId: "group-1", fromCache: true })
    }
  });
});
```

Add cache mismatch and lock-unavailable regressions:

```ts
it("rejects a recommendation response for another cache group", async () => {
  const set = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { locks: serialLockManager() });
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn(), set } }
  });

  await expect(
    saveGroupRecommendationCache(
      "group-1",
      recommendationResponse("group-2", "batch-2")
    )
  ).rejects.toThrow("recommendation_cache_group_mismatch");
  expect(set).not.toHaveBeenCalled();
});

it("ignores a stored cache whose response group does not match the active bucket", async () => {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.state]: {
            ...getDefaultStorageState(),
            activeGroupId: "group-1",
            lastRecommendationsByGroupId: {
              "group-1": recommendationResponse("group-2", "batch-2")
            }
          }
        })
      }
    }
  });

  await expect(getActiveGroupRecommendationCache()).resolves.toBeNull();
});

it("fails writes when Web Locks is unavailable", async () => {
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  });

  await expect(
    updateStorageState((state) => state)
  ).rejects.toThrow("storage_lock_unavailable");
});
```

- [ ] **Step 6: Run the storage tests to verify RED**

Run:

```bash
pnpm --filter @lunch/extension test -- storage.test.ts
```

Expected: FAIL because `updateStorageState` does not exist, writes do not acquire Web Locks, and cache helpers do not enforce response/bucket `groupId` equality.

- [ ] **Step 7: Implement the Web Locks state mutation boundary**

In `apps/extension/src/storage.ts`, add the locked write helpers:

```ts
export const STORAGE_STATE_LOCK_NAME = "lunch-extension-storage-state";

export type StorageStateUpdater = (
  state: ExtensionStorageShape
) => ExtensionStorageShape;

function getStorageLockManager(): LockManager {
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error("storage_lock_unavailable");
  return locks;
}

async function writeStorageStateUnlocked(state: ExtensionStorageShape): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: state });
}

export async function saveStorageState(state: ExtensionStorageShape): Promise<void> {
  await getStorageLockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    () => writeStorageStateUnlocked(state)
  );
}

export async function updateStorageState(
  updater: StorageStateUpdater
): Promise<ExtensionStorageShape> {
  return getStorageLockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    async () => {
      const current = await getStorageState();
      const next = updater(current);
      await writeStorageStateUnlocked(next);
      return next;
    }
  );
}
```

Do not call `saveStorageState` from inside `updateStorageState`; nested requests for the same exclusive lock can deadlock.

- [ ] **Step 8: Move partial writers behind `updateStorageState` and enforce cache group invariants**

Replace partial state writes in `apps/extension/src/storage.ts`:

```ts
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await updateStorageState((state) => ({ ...state, ...settings }));
  await chrome.runtime.sendMessage({ type: "settingsChanged" }).catch(() => undefined);
}

export async function saveGroupRecommendationCache(
  groupId: string,
  response: GroupTodayRecommendationsResponse
): Promise<void> {
  if (response.groupId !== groupId) {
    throw new Error("recommendation_cache_group_mismatch");
  }
  await updateStorageState((state) => ({
    ...state,
    lastRecommendationsByGroupId: {
      ...state.lastRecommendationsByGroupId,
      [groupId]: { ...response, fromCache: true }
    }
  }));
}

export async function getActiveGroupRecommendationCache(): Promise<GroupTodayRecommendationsResponse | null> {
  const state = await getStorageState();
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const cached = state.lastRecommendationsByGroupId[groupId];
  return cached?.groupId === groupId ? cached : null;
}
```

- [ ] **Step 9: Run focused and package verification**

Run:

```bash
pnpm --filter @lunch/server test -- groupParticipation.test.ts groupTodayRoutes.test.ts
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/server build
pnpm --filter @lunch/extension test -- storage.test.ts
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
git diff --check
```

Expected: PASS. Extension build still emits `apps/extension/dist/manifest.json`.

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/routes/groupParticipation.ts apps/server/tests/groupParticipation.test.ts apps/extension/src/storage.ts apps/extension/tests/storage.test.ts
git commit -m "fix: harden stage 3 group state"
```

---

### Task 6: Extension Group API Client And Minimal UI Flow

**Files:**
- Modify: `apps/extension/src/recommendationClient.ts`
- Modify: `apps/extension/src/popup.ts`
- Modify: `apps/extension/src/detail.ts`
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/extension/src/options.ts`
- Modify: `apps/extension/options.html`
- Modify: `apps/extension/tests/recommendationClient.test.ts`

**Interfaces:**
- Consumes:
  - `GROUP_ROUTES`
  - `AUTHORIZATION_HEADER`
  - `GroupTodayRecommendationsResponse`
  - `PutParticipationTodayRequest`
  - `FeedbackType`
  - `getActiveGroupSession`
- Produces:
  - `ExtensionRecommendationResponse`
  - `fetchGroupTodayRecommendationsNetworkOnly()`
  - `fetchGroupTodayRecommendationsWithCacheFallback()`
  - `fetchGroupTodayRecommendations(options)`
  - `refreshGroupTodayRecommendations()`
  - `ensureGroupTodayRecommendations()`
  - `putTodayParticipation(input)`
  - `decideTodayRecommendation(item)`
  - `postFeedback(input)` using group route when active group exists

- [ ] **Step 1: Add recommendation client tests**

Modify `apps/extension/tests/recommendationClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTHORIZATION_HEADER, GROUP_ROUTES, READ_TOKEN_HEADER } from "@lunch/shared";
import { STORAGE_KEYS } from "../src/config";
import {
  ensureGroupTodayRecommendations,
  fetchTodayRecommendations,
  postFeedback,
  putTodayParticipation,
  refreshGroupTodayRecommendations
} from "../src/recommendationClient";
import { getDefaultStorageState } from "../src/storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubGroupedState(extra: Partial<ReturnType<typeof getDefaultStorageState>> = {}) {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.state]: {
            ...getDefaultStorageState(),
            apiBaseUrl: "https://lunch.example",
            activeGroupId: "group-1",
            sessionsByGroupId: {
              "group-1": { token: "group-session-token" }
            },
            ...extra
          }
        }),
        set: vi.fn().mockResolvedValue(undefined)
      }
    }
  });
}

it("fetches current group today recommendations with the group session token", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      groupId: "group-1",
      officeDate: "2026-07-09",
      batchId: "batch-1",
      batchNo: 1,
      generatedAt: "2026-07-09T03:30:00.000Z",
      participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
      items: []
    })
  } as Response));
  vi.stubGlobal("fetch", fetchMock);
  stubGroupedState();

  await fetchTodayRecommendations();

  const [url, init] = fetchMock.mock.calls[0]!;
  expect((url as URL).toString()).toBe(
    `https://lunch.example${GROUP_ROUTES.todayRecommendations("group-1")}`
  );
  expect(init).toMatchObject({
    headers: { [AUTHORIZATION_HEADER]: "Bearer group-session-token" }
  });
});

it("refreshes current group recommendations with POST refresh", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      groupId: "group-1",
      officeDate: "2026-07-09",
      batchId: "batch-2",
      batchNo: 2,
      generatedAt: "2026-07-09T04:00:00.000Z",
      participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
      items: []
    })
  } as Response));
  vi.stubGlobal("fetch", fetchMock);
  stubGroupedState();

  await refreshGroupTodayRecommendations();

  const [url, init] = fetchMock.mock.calls[0]!;
  expect((url as URL).toString()).toBe(
    `https://lunch.example${GROUP_ROUTES.refreshTodayRecommendations("group-1")}`
  );
  expect(init).toMatchObject({ method: "POST" });
});

it("ensures recommendations by refreshing after no_current_batch", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "no_current_batch", message: "No current batch" })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        groupId: "group-1",
        officeDate: "2026-07-09",
        batchId: "batch-1",
        batchNo: 1,
        generatedAt: "2026-07-09T03:30:00.000Z",
        participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
        items: []
      })
    });
  vi.stubGlobal("fetch", fetchMock);
  stubGroupedState({
    lastRecommendationsByGroupId: {
      "group-1": {
        groupId: "group-1",
        officeDate: "2026-07-08",
        batchId: "old-batch",
        batchNo: 1,
        generatedAt: "2026-07-08T03:30:00.000Z",
        participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
        items: [],
        fromCache: true
      }
    }
  });

  await ensureGroupTodayRecommendations();

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((fetchMock.mock.calls[1]?.[0] as URL).toString()).toBe(
    `https://lunch.example${GROUP_ROUTES.refreshTodayRecommendations("group-1")}`
  );
});

it("posts participation decisions to the active group", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  vi.stubGlobal("fetch", fetchMock);
  stubGroupedState();

  await putTodayParticipation({ status: "joining" });

  expect(fetchMock).toHaveBeenCalledWith(
    new URL("https://lunch.example/api/groups/group-1/participation/today"),
    expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({
        "content-type": "application/json",
        authorization: "Bearer group-session-token"
      }),
      body: JSON.stringify({ status: "joining" })
    })
  );
});

it("posts avoid feedback to the active group with group session auth", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  vi.stubGlobal("fetch", fetchMock);
  stubGroupedState();

  await postFeedback({
    date: "2026-07-09",
    restaurantId: "restaurant-1",
    recommendationId: "recommendation-1",
    type: "avoid"
  });

  expect(fetchMock).toHaveBeenCalledWith(
    new URL("https://lunch.example/api/groups/group-1/feedback"),
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
        authorization: "Bearer group-session-token"
      }),
      body: JSON.stringify({
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "avoid"
      })
    })
  );
});

it("keeps legacy feedback fallback when no active group session exists", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true } as Response));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          [STORAGE_KEYS.state]: {
            ...getDefaultStorageState(),
            apiBaseUrl: "https://lunch.example",
            readToken: "read-token"
          }
        })
      }
    }
  });

  await postFeedback({
    date: "2026-07-09",
    restaurantId: "restaurant-1",
    recommendationId: "recommendation-1",
    type: "want"
  });

  expect(fetchMock).toHaveBeenCalledWith(
    new URL("https://lunch.example/api/feedback"),
    expect.objectContaining({
      method: "POST",
      headers: {
        "content-type": "application/json",
        [READ_TOKEN_HEADER]: "read-token"
      },
      body: JSON.stringify({
        date: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "want"
      })
    })
  );
});
```

- [ ] **Step 2: Run the failing client tests**

Run:

```bash
pnpm --filter @lunch/extension test -- recommendationClient.test.ts
```

Expected: FAIL because group client functions do not exist.

- [ ] **Step 3: Implement group API client**

Modify `apps/extension/src/recommendationClient.ts`:

```ts
import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  READ_TOKEN_HEADER,
  type FeedbackType,
  type GroupTodayRecommendationItem,
  type GroupTodayRecommendationsResponse,
  type PutParticipationTodayRequest,
  type TodayRecommendationResponse
} from "@lunch/shared";
import {
  getActiveGroupRecommendationCache,
  getActiveGroupSession,
  getRecommendationCache,
  getStorageState,
  saveGroupRecommendationCache,
  saveRecommendationCache
} from "./storage";

class ApiError extends Error {
  constructor(public readonly status: number, public readonly error?: string | undefined) {
    super(error ? `HTTP ${status}: ${error}` : `HTTP ${status}`);
  }
}

export type ExtensionRecommendationResponse = TodayRecommendationResponse | GroupTodayRecommendationsResponse;

export function isGroupResponse(
  response: ExtensionRecommendationResponse
): response is GroupTodayRecommendationsResponse {
  return "groupId" in response && "officeDate" in response;
}

async function activeGroupRequest(path: string, init: RequestInit = {}) {
  const state = await getStorageState();
  const session = await getActiveGroupSession();
  if (!session) throw new Error("No active group session configured");
  const response = await fetch(new URL(path, state.apiBaseUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      [AUTHORIZATION_HEADER]: `Bearer ${session.token}`
    }
  });
  if (!response.ok) {
    let error: string | undefined;
    try {
      error = ((await response.json()) as { error?: string }).error;
    } catch {
      error = undefined;
    }
    throw new ApiError(response.status, error);
  }
  return { response, groupId: session.groupId };
}

export async function fetchGroupTodayRecommendationsNetworkOnly(): Promise<GroupTodayRecommendationsResponse> {
  const session = await getActiveGroupSession();
  if (!session) throw new Error("No active group session configured");
  const { response, groupId } = await activeGroupRequest(GROUP_ROUTES.todayRecommendations(session.groupId));
  const data = (await response.json()) as GroupTodayRecommendationsResponse;
  await saveGroupRecommendationCache(groupId, data);
  return data;
}

export async function fetchGroupTodayRecommendationsWithCacheFallback(): Promise<GroupTodayRecommendationsResponse> {
  try {
    return await fetchGroupTodayRecommendationsNetworkOnly();
  } catch (error) {
    const cached = await getActiveGroupRecommendationCache();
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}

export const fetchGroupTodayRecommendations = fetchGroupTodayRecommendationsWithCacheFallback;

export async function refreshGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  const session = await getActiveGroupSession();
  if (!session) throw new Error("No active group session configured");
  const { response, groupId } = await activeGroupRequest(GROUP_ROUTES.refreshTodayRecommendations(session.groupId), {
    method: "POST"
  });
  const data = (await response.json()) as GroupTodayRecommendationsResponse;
  await saveGroupRecommendationCache(groupId, data);
  return data;
}

export async function ensureGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  try {
    return await fetchGroupTodayRecommendationsNetworkOnly();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.error === "no_current_batch") {
      return refreshGroupTodayRecommendations();
    }
    const cached = await getActiveGroupRecommendationCache();
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}
```

Keep `fetchTodayRecommendations` exported for existing callers, but change its return type to `Promise<ExtensionRecommendationResponse>`. Route it to `fetchGroupTodayRecommendationsWithCacheFallback()` when an active group exists. If no active group session is configured, keep the legacy read-token behavior so older development setups still work.

Popup, detail, and background code must branch with `"officeDate" in response` or the `isGroupResponse(response)` helper before reading group-only fields such as `officeDate`, `weather`, `participationSummary`, `score`, or `scoreBreakdown`.

- [ ] **Step 4: Implement participation and feedback client calls**

Add:

```ts
export async function putTodayParticipation(input: PutParticipationTodayRequest): Promise<void> {
  const session = await getActiveGroupSession();
  if (!session) throw new Error("No active group session configured");
  await activeGroupRequest(GROUP_ROUTES.participationToday(session.groupId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function decideTodayRecommendation(item: GroupTodayRecommendationItem): Promise<void> {
  await putTodayParticipation({
    status: "decided",
    restaurantId: item.restaurantId,
    ...(item.recommendationId ? { recommendationId: item.recommendationId } : {})
  });
}
```

Update `postFeedback` so group mode posts:

```ts
const session = await getActiveGroupSession();
if (session) {
  await activeGroupRequest(GROUP_ROUTES.feedback(session.groupId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      officeDate: input.date,
      restaurantId: input.restaurantId,
      ...(input.recommendationId ? { recommendationId: input.recommendationId } : {}),
      type: input.type
    })
  });
  return;
}
```

If no active group session exists, keep the legacy fallback exactly as before:

```ts
const settings = await getStorageState();
const url = new URL("/api/feedback", settings.apiBaseUrl);
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    [READ_TOKEN_HEADER]: settings.readToken
  },
  body: JSON.stringify(input)
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
```

- [ ] **Step 5: Wire minimal popup interactions**

Modify `apps/extension/src/popup.ts`:

```ts
import type { GroupTodayRecommendationItem, GroupTodayRecommendationsResponse } from "@lunch/shared";
import {
  decideTodayRecommendation,
  fetchTodayRecommendations,
  postFeedback,
  putTodayParticipation,
  refreshGroupTodayRecommendations
} from "./recommendationClient";

refreshButton.addEventListener("click", () => {
  void renderRefresh();
});

async function renderRefresh() {
  setStatus("正在重新生成今日推荐...");
  itemsEl.replaceChildren();
  try {
    const response = await refreshGroupTodayRecommendations();
    renderGroupResponse(response);
  } catch (error) {
    setStatus(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
```

When rendering a group response, show:

```ts
dateEl.textContent = response.fromCache ? `${response.officeDate}｜缓存` : response.officeDate;
weatherEl.textContent = response.weather?.summary ?? "今天先按距离、星期和同事推荐来挑。";
```

Add two participation buttons before cards:

```ts
const joinButton = document.createElement("button");
joinButton.type = "button";
joinButton.textContent = "今天参与";
joinButton.addEventListener("click", async () => {
  await putTodayParticipation({ status: "joining" });
  joinButton.textContent = "已记录参与";
});

const awayButton = document.createElement("button");
awayButton.type = "button";
awayButton.textContent = "今天不吃";
awayButton.addEventListener("click", async () => {
  await putTodayParticipation({ status: "away" });
  awayButton.textContent = "已记录不吃";
});
```

Add a decision button on each card:

```ts
const decideButton = document.createElement("button");
decideButton.type = "button";
decideButton.textContent = "就决定是你了";
decideButton.addEventListener("click", async () => {
  await decideTodayRecommendation(item);
  decideButton.textContent = "已决定";
  decideButton.disabled = true;
});
```

Include `avoid` in feedback labels:

```ts
for (const [type, label] of [["want", "想吃"], ["skip", "不想吃"], ["ate", "已吃过"], ["avoid", "避雷"]] as const) {
  // Existing feedback button creation remains.
}
```

- [ ] **Step 6: Update background notification ensure flow**

Modify `apps/extension/src/background.ts`:

```ts
import { ensureGroupTodayRecommendations, fetchTodayRecommendations } from "./recommendationClient";

export async function showLunchNotification(): Promise<void> {
  const recommendation = await ensureGroupTodayRecommendations().catch(() => fetchTodayRecommendations());
  const names = recommendation.items.map((item) => item.restaurantName).join("、");
  const weatherSummary = "weather" in recommendation
    ? recommendation.weather?.summary
    : recommendation.weatherSummary;
  // Existing notification creation follows.
}
```

- [ ] **Step 7: Add minimal active group fields to options**

Modify `apps/extension/options.html` with inputs:

```html
<label>
  当前小组 ID
  <input id="activeGroupId" name="activeGroupId" />
</label>
<label>
  当前小组 Session Token
  <input id="groupSessionToken" name="groupSessionToken" />
</label>
<label>
  Identity Token
  <input id="identityToken" name="identityToken" />
</label>
```

Modify `apps/extension/src/options.ts` to load through `getStorageState` and save partial fields through `updateStorageState`. Do not pass a snapshot previously returned by `getStorageState` into `saveStorageState`. Import the hardened helpers:

```ts
import { getStorageState, updateStorageState } from "./storage";
```

When `activeGroupId` and `groupSessionToken` are non-empty, save inside the updater:

```ts
await updateStorageState((state) => ({
  ...state,
  activeGroupId: activeGroupId.value.trim(),
  identityToken: identityToken.value.trim() || undefined,
  sessionsByGroupId: {
    ...state.sessionsByGroupId,
    [activeGroupId.value.trim()]: { token: groupSessionToken.value.trim() }
  }
}));
```

- [ ] **Step 8: Run extension tests, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
```

Expected: PASS, and `apps/extension/dist/manifest.json` exists after build.

- [ ] **Step 9: Commit**

```bash
git add apps/extension/src/recommendationClient.ts apps/extension/src/popup.ts apps/extension/src/detail.ts apps/extension/src/background.ts apps/extension/src/options.ts apps/extension/options.html apps/extension/tests/recommendationClient.test.ts
git commit -m "feat: wire extension to group lunch loop"
```

---

### Task 7: Integration Regression, Roadmap, And Handoff

**Files:**
- Modify: `roadmap.md`
- Modify: any tests touched by type-level changes from Tasks 1-6.

**Interfaces:**
- Consumes:
  - Completed Stage 3 shared/server/extension changes.
- Produces:
  - Updated roadmap with Stage 2 marked done per handoff and Stage 3 plan linked.
  - Final implementation handoff summary.

- [ ] **Step 1: Run focused regression suites**

Run:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/server test -- groupToday.test.ts groupTodayConcurrency.test.ts groupTodayRoutes.test.ts groupParticipation.test.ts groupKnowledge.test.ts recommendation.test.ts feedback.test.ts
pnpm --filter @lunch/extension test
```

Expected: PASS.

- [ ] **Step 2: Run affected typechecks and builds**

Run:

```bash
pnpm --filter @lunch/shared build
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
```

Expected: PASS.

- [ ] **Step 3: Run workspace checks**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Update roadmap**

Modify `roadmap.md`:

```md
| Stage 2 | Group-Scoped Restaurant Knowledge | Done | [`plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md`](plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md) | Each group can maintain its own isolated restaurant and recommendation knowledge base |
| Stage 3 | Today Recommendation Batch + Participation | Approved for Execution | [`plans/2026-07-09-today-recommendation-batch-participation-stage3.md`](plans/2026-07-09-today-recommendation-batch-participation-stage3.md) | Core lunch loop plus minimal extension auth/storage/API client |
```

Update the progress tracker:

```md
- [x] Stage 2 implemented and verified.
- [x] Stage 3 detailed implementation plan written.
- [ ] Stage 3 implemented and verified.
```

- [ ] **Step 5: Optional manual extension smoke test**

When a local Chrome Developer Mode check is practical, load `apps/extension/dist` and verify:

```text
1. Options can save API base URL, active group ID, identity token, and group session token.
2. Popup fetches current group recommendations.
3. Manual refresh creates a new batch.
4. "今天参与", "今天不吃", and "就决定是你了" write participation.
5. Feedback buttons write group feedback.
6. Disabling the server shows only the active group's cached recommendations.
```

If this manual check is not run, disclose it in the handoff.

- [ ] **Step 6: Final handoff**

Write a handoff summary with:

```md
Implemented changes:
- Shared Stage 3 contracts and weighted scoring.
- Group today recommendation batch APIs.
- Group participation APIs.
- Extension active-group session, cache, recommendation, participation, decision, and feedback flow.

Files changed:
- List all changed files.

Tests added:
- Shared contract/scoring tests.
- Server group today/participation tests.
- Extension storage/client tests.

Tests run:
- List exact commands and outcomes.

Manual checks:
- State whether Chrome Developer Mode smoke test was run.

Known issues:
- State any remaining issues.

Source-of-truth updates:
- `roadmap.md`.

Subagent disclosure:
- State whether subagents were used.
- Name a subagent model only when it was explicitly selected or otherwise verifiable.
- State any platform limitation relevant to model selection.
```

- [ ] **Step 7: Commit**

```bash
git add roadmap.md
git commit -m "docs: update stage 3 roadmap status"
```

## Self-Review Checklist

- Every Stage 3 roadmap expected-scope item is covered by at least one task.
- The plan keeps Stage 4 prototype UI wiring out of Stage 3.
- New group APIs reject missing tokens, mismatched group sessions, and removed memberships through `requireActiveMembership`.
- GET today recommendations is read-only and has a 404/`no_current_batch` path.
- Refresh uses transaction retry and preserves previous batches.
- Participation decision references validate path group ownership.
- Extension cache is keyed by active group.
- Legacy MVP behavior remains covered by regression tests.
- Subagent use and any verifiable model-selection details are disclosed truthfully.
