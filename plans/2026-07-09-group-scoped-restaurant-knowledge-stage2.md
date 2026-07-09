# Group-Scoped Restaurant Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Project override: Codex-created subagents are allowed only if the tool can explicitly enforce GPT-5.5. If GPT-5.5 cannot be enforced, do not create subagents; use inline execution with `superpowers:executing-plans`.

**Goal:** Build Stage 2 of the multi-group roadmap: every lunch group can maintain an isolated restaurant and recommendation knowledge base, with member contribution rights, admin status controls, member-level `avoid` feedback, and cross-group spoofing protection.

**Architecture:** Reuse the Stage 1 identity, group session, membership, and `groupId` schema foundation. Add shared contracts for group restaurant knowledge, then add group-scoped server routes that sit beside the legacy default-group routes without changing today recommendation batch behavior.

**Tech Stack:** TypeScript, pnpm workspaces, Fastify, Prisma, PostgreSQL, Vitest, HMAC signed group session tokens, `packages/shared` API contracts.

**Status:** Approved for Execution

## Global Constraints

- Source spec: `specs/2026-07-08-multi-group-prototype-implementation-design.md`.
- Roadmap stage: `roadmap.md` Stage 2, Group-Scoped Restaurant Knowledge.
- Stage 1 foundation is treated as completed by handoff, and Stage 2 must build on its group/session/membership contracts.
- Preserve existing MVP legacy routes unless this plan explicitly changes a new `/api/groups/:groupId/*` route.
- New group APIs require `Authorization: Bearer <groupSessionToken>`.
- `EXTENSION_READ_TOKEN` is not accepted by any new `/api/groups/:groupId/*` knowledge route.
- Server permissions must use current database membership role/status, not token role/status.
- Removed memberships cannot read or write group knowledge.
- Active members can read group knowledge, add restaurants, add recommendations, write feedback, edit their own restaurants, and edit their own recommendations.
- Admins can edit all group restaurants and recommendations and can set restaurant `status`.
- Member `avoid` feedback is distinct from admin-only restaurant `blocked` status.
- `blocked` and `paused` restaurant status can only be set or restored by admins.
- Every write with `restaurantId`, `recommendationId`, or route `membershipId` must validate that the referenced row belongs to the path `groupId`.
- All Stage 2 route bodies must be runtime validated before writing Prisma.
- Invalid input must return stable 400 errors and must not be silently dropped.
- Shared API contracts belong in `packages/shared`.
- Keep Fastify on Railway compatible with `host: "::"` and `port: Number(process.env.PORT ?? 3000)`.
- Do not create Codex subagents unless GPT-5.5 can be explicitly enforced.

---

## Scope Of This Plan

In scope:

- Shared contracts for group-scoped restaurant library, recommendation mutation, and feedback mutation.
- `GET /api/groups/:groupId/restaurants`
- `POST /api/groups/:groupId/restaurants`
- `PATCH /api/groups/:groupId/restaurants/:restaurantId`
- `POST /api/groups/:groupId/recommendations`
- `PATCH /api/groups/:groupId/recommendations/:recommendationId`
- `POST /api/groups/:groupId/feedback`
- Cross-group ID spoofing tests for restaurants, recommendations, and feedback.
- Legacy default-group restaurant, recommendation, and feedback route regression tests.
- Runtime validation tests for malformed restaurant, recommendation, and feedback payloads.

Out of scope:

- `GET /api/groups/:groupId/today-recommendations`
- `POST /api/groups/:groupId/today-recommendations/refresh`
- daily recommendation batch generation or transaction locking.
- daily participation and decision flows.
- extension storage migration.
- admin prototype page rebuild.
- dashboard, settings, members list UI, reminder settings, and scoring weight UI.
- recommendation delete or hide semantics, because the approved API list includes `POST` and `PATCH` but no `DELETE`, and the current schema has no recommendation status field.

## Stage 2 Acceptance Criteria

Stage 2 is complete only when:

- An active member can list only their current group's restaurants and nested recommendations.
- An active member can create a restaurant in their group; the row stores `groupId` and `createdByMembershipId`.
- An active member can edit base fields on a restaurant they created.
- A member cannot set `active`, `paused`, or `blocked` restaurant status unless they are an admin.
- A member cannot edit another member's restaurant.
- An admin can edit any restaurant in the group and can set restaurant status.
- An active member can add a recommendation to a restaurant in their group; the row stores `groupId` and `createdByMembershipId`.
- A member can edit their own recommendation, and an admin can edit any recommendation in the group.
- A member cannot create or patch a recommendation using another group's restaurant or recommendation ID.
- An active member can write `want`, `skip`, `ate`, and `avoid` feedback in their group.
- Writing `avoid` feedback never changes `restaurant.status` to `blocked`.
- New group knowledge routes reject missing tokens, legacy read tokens, mismatched group sessions, stale removed memberships, and cross-group IDs with stable 401/403/404/400 responses.
- New group knowledge routes reject invalid body fields with stable 400 errors before writing Prisma.
- Existing legacy `/api/restaurants`, `/api/recommendations`, and `/api/feedback` tests still pass.
- Relevant server tests, shared tests, typechecks, and builds pass.

## Stage 2 Preflight Patch

Before Task 1 execution, keep these plan-level rules in force for every task:

1. Add group knowledge auth matrix tests:
   - Missing `Authorization` returns 401/`missing_token`.
   - `x-lunch-read-token` without `Authorization` returns 401.
   - `groupSessionToken.groupId != path groupId` returns 403/`group_session_mismatch`.
   - `membership.status=removed` returns 403/`active_membership_required`.
   - Cover at least restaurant list, restaurant create, recommendation create, and feedback create.
2. Add runtime body validation for all Stage 2 routes:
   - Reject invalid restaurant status with 400/`invalid_restaurant_status`.
   - Reject blank restaurant names with 400/`restaurant_name_required`.
   - Reject blank recommendation reasons with 400/`recommendation_reason_required`.
   - Reject negative or non-number `distanceMinutes` with 400/`invalid_distance_minutes`.
   - Reject negative or non-number `averagePriceCents` with 400/`invalid_average_price_cents`.
   - Reject non-array or non-string `tags`/`moodTags` with 400/`invalid_tags`.
   - Reject invalid `weatherTags` with 400/`invalid_weather_tags`.
   - Reject invalid `weekdayTags` with 400/`invalid_weekday_tags`.
   - Reject invalid feedback type with 400/`invalid_feedback_type`.
   - Reject malformed `officeDate` with 400/`invalid_office_date`.
   - Invalid fields must not be silently dropped before Prisma writes.
3. Document and preserve cross-group ID response policy:
   - Path resource IDs, such as `:restaurantId` and `:recommendationId`, return 404 when the resource is not in the path group.
   - Body reference IDs, such as `restaurantId` in create recommendation or feedback, return 400/`*_group_mismatch` when they do not belong to the path group.

## Stage 2 Response Notes

- `GET /api/groups/:groupId/restaurants` returns all restaurant statuses for library management. Stage 3 recommendation generation must filter to `status=active`.
- Stage 2 may return only `createdByMembershipId`; `createdByName` is optional and can remain `undefined` until member summary joins are added in a later member contribution/dashboard slice.

## Approach Decision

Three implementation shapes were considered:

1. **Recommended: contract-first vertical API slices.** Add shared contracts, then implement each API capability with its own tests. This keeps Stage 2 reviewable and avoids mixing restaurant knowledge with Stage 3 batch logic.
2. **Schema/service-first horizontal refactor.** Create broad repository services before routes. This adds abstraction before enough group knowledge behavior exists.
3. **Admin UI-first wiring.** Start from admin restaurant pages and backfill APIs. This conflicts with the roadmap because prototype UI wiring belongs to Stage 4.

Use approach 1.

## File Structure

- Modify: `packages/shared/src/types.ts`
  - Add Stage 2 restaurant, recommendation, and feedback request/response contracts.
- Modify: `packages/shared/src/api.ts`
  - Add route builders for restaurant and recommendation item routes.
- Modify: `packages/shared/src/index.ts`
  - Re-export existing public contracts through the current barrel.
- Modify: `packages/shared/tests/groupContracts.test.ts`
  - Lock Stage 2 route constants and type literals.
- Create: `apps/server/src/routes/groupKnowledge.ts`
  - Register group-scoped restaurant, recommendation, and feedback routes.
- Modify: `apps/server/src/app.ts`
  - Register `registerGroupKnowledgeRoutes(app, env)` after group routes.
- Create: `apps/server/tests/groupKnowledge.test.ts`
  - Route-level tests with mocked Prisma and signed group session tokens.
- Modify: `apps/server/tests/adminRoutes.test.ts`
  - Keep legacy restaurant/recommendation write tests passing after app route registration changes.
- Modify: `apps/server/tests/feedback.test.ts`
  - Add regression that legacy feedback still accepts only legacy read/admin auth, while group feedback requires group session.
- Modify: `roadmap.md`
  - Link this plan and track Stage 2 planning status.

---

### Task 1: Shared Stage 2 Knowledge Contracts

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/groupContracts.test.ts`

**Interfaces:**
- Consumes:
  - Existing `GroupRole`, `MembershipStatus`, `RestaurantStatus`, `FeedbackType`, `GROUP_ROUTES`.
- Produces:
  - `RecommendationSummary`
  - `RestaurantSummary`
  - `RestaurantListResponse`
  - `CreateRestaurantRequest`
  - `PatchRestaurantRequest`
  - `RestaurantMutationResponse`
  - `CreateRecommendationRequest`
  - `PatchRecommendationRequest`
  - `RecommendationMutationResponse`
  - `CreateGroupFeedbackRequest`
  - `FeedbackSummary`
  - `CreateGroupFeedbackResponse`
  - `GROUP_ROUTES.restaurant(groupId, restaurantId)`
  - `GROUP_ROUTES.recommendation(groupId, recommendationId)`

- [ ] **Step 1: Extend the shared contract tests**

Modify `packages/shared/tests/groupContracts.test.ts` so it contains these tests in addition to the existing Stage 1 assertions:

```ts
import { describe, expect, it } from "vitest";
import { GROUP_ROUTES } from "../src/api";
import type {
  CreateGroupFeedbackRequest,
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  FeedbackType,
  GroupRole,
  MembershipStatus,
  PatchRestaurantRequest,
  RestaurantStatus
} from "../src/types";

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

  it("locks restaurant status as an admin-governed field", () => {
    const statuses: RestaurantStatus[] = ["active", "paused", "blocked"];
    expect(statuses).toEqual(["active", "paused", "blocked"]);
  });

  it("defines group route builders for Stage 2 knowledge APIs", () => {
    expect(GROUP_ROUTES.restaurants("group-1")).toBe("/api/groups/group-1/restaurants");
    expect(GROUP_ROUTES.restaurant("group-1", "restaurant-1")).toBe(
      "/api/groups/group-1/restaurants/restaurant-1"
    );
    expect(GROUP_ROUTES.recommendations("group-1")).toBe("/api/groups/group-1/recommendations");
    expect(GROUP_ROUTES.recommendation("group-1", "recommendation-1")).toBe(
      "/api/groups/group-1/recommendations/recommendation-1"
    );
    expect(GROUP_ROUTES.feedback("group-1")).toBe("/api/groups/group-1/feedback");
  });

  it("defines request contracts for group restaurant knowledge", () => {
    const createRestaurant: CreateRestaurantRequest = {
      name: "米饭小馆",
      area: "公司楼下",
      distanceMinutes: 8,
      cuisine: "家常菜",
      priceBand: "30-40",
      averagePriceCents: 3500,
      supportsDineIn: true,
      supportsTakeout: true,
      tags: ["下饭", "近"]
    };
    const patchRestaurant: PatchRestaurantRequest = {
      name: "米饭小馆",
      status: "paused"
    };
    const createRecommendation: CreateRecommendationRequest = {
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: ["rainy"],
      weekdayTags: ["friday"],
      moodTags: ["想吃饭"]
    };
    const feedback: CreateGroupFeedbackRequest = {
      officeDate: "2026-07-09",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      type: "avoid"
    };

    expect(createRestaurant.tags).toContain("近");
    expect(patchRestaurant.status).toBe("paused");
    expect(createRecommendation.restaurantId).toBe("restaurant-1");
    expect(feedback.type).toBe("avoid");
  });
});
```

- [ ] **Step 2: Run the failing shared contract test**

Run:

```bash
pnpm --filter @lunch/shared test -- groupContracts.test.ts
```

Expected: FAIL because the Stage 2 request/response types and `GROUP_ROUTES.restaurant` builder do not exist.

- [ ] **Step 3: Add Stage 2 types**

Append these contracts to `packages/shared/src/types.ts`, preserving all existing exports:

```ts
export interface RecommendationSummary {
  id: string;
  groupId: string;
  restaurantId: string;
  dish?: string | undefined;
  reason: string;
  weatherTags: string[];
  weekdayTags: string[];
  moodTags: string[];
  createdByMembershipId?: string | undefined;
  createdByName?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantSummary {
  id: string;
  groupId: string;
  name: string;
  area?: string | undefined;
  address?: string | undefined;
  distanceMinutes?: number | undefined;
  cuisine?: string | undefined;
  priceBand?: string | undefined;
  averagePriceCents?: number | undefined;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string[];
  status: RestaurantStatus;
  createdByMembershipId?: string | undefined;
  createdByName?: string | undefined;
  createdAt: string;
  updatedAt: string;
  recommendations: RecommendationSummary[];
}

export interface RestaurantListResponse {
  groupId: string;
  restaurants: RestaurantSummary[];
}

export interface CreateRestaurantRequest {
  name: string;
  area?: string | undefined;
  address?: string | undefined;
  distanceMinutes?: number | undefined;
  cuisine?: string | undefined;
  priceBand?: string | undefined;
  averagePriceCents?: number | undefined;
  supportsDineIn?: boolean | undefined;
  supportsTakeout?: boolean | undefined;
  tags?: string[] | undefined;
}

export interface PatchRestaurantRequest {
  name?: string | undefined;
  area?: string | null | undefined;
  address?: string | null | undefined;
  distanceMinutes?: number | null | undefined;
  cuisine?: string | null | undefined;
  priceBand?: string | null | undefined;
  averagePriceCents?: number | null | undefined;
  supportsDineIn?: boolean | undefined;
  supportsTakeout?: boolean | undefined;
  tags?: string[] | undefined;
  status?: RestaurantStatus | undefined;
}

export interface RestaurantMutationResponse {
  groupId: string;
  restaurant: RestaurantSummary;
}

export interface CreateRecommendationRequest {
  restaurantId: string;
  dish?: string | undefined;
  reason: string;
  weatherTags?: WeatherTag[] | undefined;
  weekdayTags?: WeekdayTag[] | undefined;
  moodTags?: string[] | undefined;
}

export interface PatchRecommendationRequest {
  dish?: string | null | undefined;
  reason?: string | undefined;
  weatherTags?: WeatherTag[] | undefined;
  weekdayTags?: WeekdayTag[] | undefined;
  moodTags?: string[] | undefined;
}

export interface RecommendationMutationResponse {
  groupId: string;
  recommendation: RecommendationSummary;
}

export interface CreateGroupFeedbackRequest {
  officeDate: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  type: FeedbackType;
}

export interface FeedbackSummary {
  id: string;
  groupId: string;
  officeDate: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  membershipId?: string | undefined;
  type: FeedbackType;
  createdAt: string;
}

export interface CreateGroupFeedbackResponse {
  groupId: string;
  feedback: FeedbackSummary;
}
```

- [ ] **Step 4: Add route builders**

Modify `packages/shared/src/api.ts` so `GROUP_ROUTES` contains item-level restaurant and recommendation builders:

```ts
export const GROUP_ROUTES = {
  identities: "/api/identities",
  groups: "/api/groups",
  joinGroup: "/api/groups/join",
  groupSession: (groupId: string) => `/api/groups/${groupId}/session`,
  todayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations`,
  refreshTodayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations/refresh`,
  restaurants: (groupId: string) => `/api/groups/${groupId}/restaurants`,
  restaurant: (groupId: string, restaurantId: string) => `/api/groups/${groupId}/restaurants/${restaurantId}`,
  recommendations: (groupId: string) => `/api/groups/${groupId}/recommendations`,
  recommendation: (groupId: string, recommendationId: string) =>
    `/api/groups/${groupId}/recommendations/${recommendationId}`,
  feedback: (groupId: string) => `/api/groups/${groupId}/feedback`,
  members: (groupId: string) => `/api/groups/${groupId}/members`
} as const;
```

- [ ] **Step 5: Verify shared package**

Run:

```bash
pnpm --filter @lunch/shared test -- groupContracts.test.ts
pnpm --filter @lunch/shared typecheck
pnpm --filter @lunch/shared build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/api.ts packages/shared/src/index.ts packages/shared/tests/groupContracts.test.ts
git commit -m "feat: add group knowledge shared contracts"
```

---

### Task 2: Group-Scoped Restaurant Routes

**Files:**
- Create: `apps/server/src/routes/groupKnowledge.ts`
- Modify: `apps/server/src/app.ts`
- Create: `apps/server/tests/groupKnowledge.test.ts`

**Interfaces:**
- Consumes:
  - `requireActiveMembership({ prisma, env, groupId, authorization, requiredRole? })`
  - `RestaurantListResponse`
  - `CreateRestaurantRequest`
  - `PatchRestaurantRequest`
  - `RestaurantMutationResponse`
- Produces:
  - `registerGroupKnowledgeRoutes(app: FastifyInstance, env: AppEnv): Promise<void>`
  - `GET /api/groups/:groupId/restaurants`
  - `POST /api/groups/:groupId/restaurants`
  - `PATCH /api/groups/:groupId/restaurants/:restaurantId`

- [ ] **Step 1: Write restaurant route tests**

Create `apps/server/tests/groupKnowledge.test.ts` with this shared setup and the restaurant route tests:

```ts
import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signGroupSessionToken } from "../src/services/auth/tokens";

type MockMembership = {
  id: string;
  groupId: string;
  identityId: string;
  role: GroupRole;
  status: MembershipStatus;
};

type MockRestaurant = {
  id: string;
  groupId: string;
  name: string;
  area: string | null;
  address: string | null;
  distanceMinutes: number | null;
  cuisine: string | null;
  priceBand: string | null;
  averagePriceCents: number | null;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string[];
  status: "active" | "paused" | "blocked";
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recommendations?: MockRecommendation[];
};

type MockRecommendation = {
  id: string;
  groupId: string;
  restaurantId: string;
  dish: string | null;
  reason: string;
  weatherTags: string[];
  weekdayTags: string[];
  moodTags: string[];
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const prisma = vi.hoisted(() => {
  const store = {
    memberships: [] as MockMembership[],
    restaurants: [] as MockRestaurant[],
    recommendations: [] as MockRecommendation[],
    nextRestaurantId: 1,
    nextRecommendationId: 1
  };

  const withRecommendations = (restaurant: MockRestaurant) => ({
    ...restaurant,
    recommendations: store.recommendations.filter((candidate) => candidate.restaurantId === restaurant.id)
  });

  const client = {
    __reset: () => {
      store.memberships = [];
      store.restaurants = [];
      store.recommendations = [];
      store.nextRestaurantId = 1;
      store.nextRecommendationId = 1;
    },
    __seedMembership: (membership: MockMembership) => {
      store.memberships.push(membership);
    },
    __seedRestaurant: (restaurant: MockRestaurant) => {
      store.restaurants.push(restaurant);
    },
    __seedRecommendation: (recommendation: MockRecommendation) => {
      store.recommendations.push(recommendation);
    },
    groupMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return store.memberships.find((membership) => membership.id === where.id) ?? null;
      })
    },
    restaurant: {
      findMany: vi.fn(async ({ where }: { where: { groupId: string } }) => {
        return store.restaurants
          .filter((restaurant) => restaurant.groupId === where.groupId)
          .map(withRecommendations)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; groupId: string } }) => {
        const restaurant = store.restaurants.find(
          (candidate) => candidate.id === where.id && candidate.groupId === where.groupId
        );
        return restaurant ? withRecommendations(restaurant) : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockRestaurant, "id" | "createdAt" | "updatedAt"> }) => {
        const now = new Date("2026-07-09T04:00:00.000Z");
        const restaurant = {
          id: `restaurant-${store.nextRestaurantId++}`,
          createdAt: now,
          updatedAt: now,
          ...data
        };
        store.restaurants.push(restaurant);
        return withRecommendations(restaurant);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockRestaurant> }) => {
        const restaurant = store.restaurants.find((candidate) => candidate.id === where.id);
        if (!restaurant) throw new Error(`Missing restaurant ${where.id}`);
        Object.assign(restaurant, data, { updatedAt: new Date("2026-07-09T05:00:00.000Z") });
        return withRecommendations(restaurant);
      })
    },
    recommendation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    feedback: {
      create: vi.fn()
    }
  };

  return client;
});

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env = {
  DATABASE_URL: "postgresql://example",
  TEAM_INVITE_CODE: "team-code",
  SESSION_SECRET: "session-secret",
  EXTENSION_READ_TOKEN: "read-token",
  ALLOW_PUBLIC_GROUP_CREATION: true,
  IDENTITY_TOKEN_TTL_DAYS: 90,
  GROUP_SESSION_TTL_DAYS: 14,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: "31.2304",
  OFFICE_LONGITUDE: "121.4737",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: "3000"
};

async function buildTestApp() {
  Object.assign(process.env, env);
  const { buildApp } = await import("../src/app");
  return buildApp();
}

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

const baseRestaurant = {
  id: "restaurant-1",
  groupId: "group-1",
  name: "米饭小馆",
  area: "公司楼下",
  address: null,
  distanceMinutes: 8,
  cuisine: "家常菜",
  priceBand: "30-40",
  averagePriceCents: 3500,
  supportsDineIn: true,
  supportsTakeout: true,
  tags: ["下饭", "近"],
  status: "active" as const,
  createdByMembershipId: "membership-1",
  createdAt: new Date("2026-07-09T03:00:00.000Z"),
  updatedAt: new Date("2026-07-09T03:00:00.000Z")
};

describe("group knowledge restaurant routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "admin-membership",
      groupId: "group-1",
      identityId: "identity-admin",
      role: "admin",
      status: "active"
    });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("lists only restaurants for the session group", async () => {
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-other", groupId: "group-2", name: "别组餐厅" });
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: ["rainy"],
      weekdayTags: ["thursday"],
      moodTags: ["想吃饭"],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-1",
      restaurants: [
        {
          id: "restaurant-1",
          groupId: "group-1",
          name: "米饭小馆",
          recommendations: [{ id: "recommendation-1", dish: "卤肉饭" }]
        }
      ]
    });

    await app.close();
  });

  it("creates a restaurant for the active membership group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        name: "热汤面",
        area: "园区北门",
        distanceMinutes: 9,
        cuisine: "面",
        priceBand: "25-35",
        averagePriceCents: 3000,
        supportsDineIn: true,
        supportsTakeout: false,
        tags: ["热乎"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: "group-1",
        name: "热汤面",
        status: "active",
        createdByMembershipId: "membership-1"
      }),
      include: expect.any(Object)
    });

    await app.close();
  });

  it("lets a member edit their own base restaurant fields but not status", async () => {
    prisma.__seedRestaurant(baseRestaurant);
    const app = await buildTestApp();

    const ownEdit = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { area: "二楼", tags: ["下饭", "快"] }
    });
    const statusEdit = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "blocked" }
    });

    expect(ownEdit.statusCode).toBe(200);
    expect(statusEdit.statusCode).toBe(403);
    expect(statusEdit.json()).toEqual({
      error: "admin_membership_required",
      message: "Admin membership is required to change restaurant status"
    });

    await app.close();
  });

  it("blocks a member from editing another member's restaurant", async () => {
    prisma.__seedMembership({
      id: "membership-2",
      groupId: "group-1",
      identityId: "identity-2",
      role: "member",
      status: "active"
    });
    prisma.__seedRestaurant({ ...baseRestaurant, createdByMembershipId: "membership-1" });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-2",
          membershipId: "membership-2",
          role: "member"
        })}`
      },
      payload: { area: "偷改别人餐厅" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "restaurant_owner_required",
      message: "Only the creator or an admin can edit restaurant"
    });

    await app.close();
  });

  it("lets an admin edit status on any group restaurant", async () => {
    prisma.__seedRestaurant({ ...baseRestaurant, createdByMembershipId: "membership-1" });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-admin",
          membershipId: "admin-membership",
          role: "admin"
        })}`
      },
      payload: { status: "paused" }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: "restaurant-1" },
      data: expect.objectContaining({ status: "paused" }),
      include: expect.any(Object)
    });

    await app.close();
  });

  it("blocks read-token auth and cross-group restaurant IDs", async () => {
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-2", groupId: "group-2" });
    const app = await buildTestApp();

    const readToken = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/restaurants",
      headers: { "x-lunch-read-token": "read-token" }
    });
    const crossGroupPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-2",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { area: "偷看别组" }
    });

    expect(readToken.statusCode).toBe(401);
    expect(crossGroupPatch.statusCode).toBe(404);
    expect(crossGroupPatch.json()).toEqual({ error: "restaurant_not_found", message: "Restaurant not found" });

    await app.close();
  });
});
```

- [ ] **Step 2: Run the failing restaurant route tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts
```

Expected: FAIL because `registerGroupKnowledgeRoutes` and the new routes do not exist.

- [ ] **Step 3: Create route helpers and restaurant handlers**

Create `apps/server/src/routes/groupKnowledge.ts` with the shared helpers and restaurant handlers below. Recommendation and feedback handlers are added in later tasks to the same file.

```ts
import type {
  CreateRestaurantRequest,
  PatchRestaurantRequest,
  RestaurantMutationResponse,
  RestaurantSummary
} from "@lunch/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { requireActiveMembership } from "../services/groups/memberships.js";

type IncludedRecommendation = {
  id: string;
  groupId: string;
  restaurantId: string;
  dish: string | null;
  reason: string;
  weatherTags: string[];
  weekdayTags: string[];
  moodTags: string[];
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type IncludedRestaurant = {
  id: string;
  groupId: string;
  name: string;
  area: string | null;
  address: string | null;
  distanceMinutes: number | null;
  cuisine: string | null;
  priceBand: string | null;
  averagePriceCents: number | null;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string[];
  status: "active" | "paused" | "blocked";
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recommendations?: IncludedRecommendation[];
};

const restaurantInclude = {
  recommendations: {
    orderBy: { createdAt: "desc" as const }
  }
};

class ValidationError extends Error {
  constructor(
    public readonly error: string,
    message: string
  ) {
    super(message);
  }
}

const restaurantStatuses = new Set(["active", "paused", "blocked"]);
const weatherTags = new Set(["rainy", "hot", "cold", "clear", "windy"]);
const weekdayTags = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  if (error instanceof ValidationError) {
    reply.code(400);
    return { error: error.error, message: error.message };
  }
  throw error;
}

function requiredString(body: unknown, field: string): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[field] : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function requiredNonBlankString(body: unknown, field: string, error: string, message: string): string {
  const value = requiredString(body, field);
  if (!value) {
    throw new ValidationError(error, message);
  }
  return value;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError("invalid_string_field", "String field is invalid");
  }
  return value.trim() || null;
}

function optionalNonNegativeNumber(value: unknown, error: string, message: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(error, message);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new ValidationError("invalid_boolean_field", "Boolean field is invalid");
  }
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown, error = "invalid_tags"): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(error, "Tags must be an array of strings");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function enumArray(value: unknown, allowed: Set<string>, error: string): string[] {
  const values = stringArray(value, error) ?? [];
  if (values.some((item) => !allowed.has(item))) {
    throw new ValidationError(error, "Tag value is invalid");
  }
  return values;
}

function restaurantStatus(value: unknown): "active" | "paused" | "blocked" {
  if (typeof value !== "string" || !restaurantStatuses.has(value)) {
    throw new ValidationError("invalid_restaurant_status", "Restaurant status is invalid");
  }
  return value as "active" | "paused" | "blocked";
}

function officeDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("invalid_office_date", "Office date must use YYYY-MM-DD");
  }
  return value;
}

function toRecommendationSummary(recommendation: IncludedRecommendation) {
  return {
    id: recommendation.id,
    groupId: recommendation.groupId,
    restaurantId: recommendation.restaurantId,
    ...(recommendation.dish ? { dish: recommendation.dish } : {}),
    reason: recommendation.reason,
    weatherTags: recommendation.weatherTags,
    weekdayTags: recommendation.weekdayTags,
    moodTags: recommendation.moodTags,
    ...(recommendation.createdByMembershipId ? { createdByMembershipId: recommendation.createdByMembershipId } : {}),
    createdAt: recommendation.createdAt.toISOString(),
    updatedAt: recommendation.updatedAt.toISOString()
  };
}

function toRestaurantSummary(restaurant: IncludedRestaurant): RestaurantSummary {
  return {
    id: restaurant.id,
    groupId: restaurant.groupId,
    name: restaurant.name,
    ...(restaurant.area ? { area: restaurant.area } : {}),
    ...(restaurant.address ? { address: restaurant.address } : {}),
    ...(restaurant.distanceMinutes === null ? {} : { distanceMinutes: restaurant.distanceMinutes }),
    ...(restaurant.cuisine ? { cuisine: restaurant.cuisine } : {}),
    ...(restaurant.priceBand ? { priceBand: restaurant.priceBand } : {}),
    ...(restaurant.averagePriceCents === null ? {} : { averagePriceCents: restaurant.averagePriceCents }),
    supportsDineIn: restaurant.supportsDineIn,
    supportsTakeout: restaurant.supportsTakeout,
    tags: restaurant.tags,
    status: restaurant.status,
    ...(restaurant.createdByMembershipId ? { createdByMembershipId: restaurant.createdByMembershipId } : {}),
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
    recommendations: (restaurant.recommendations ?? []).map(toRecommendationSummary)
  };
}

function buildRestaurantPatch(body: PatchRestaurantRequest, allowStatus: boolean) {
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    data.name = requiredNonBlankString(body, "name", "restaurant_name_required", "Restaurant name is required");
  }
  if (body.area !== undefined) data.area = optionalString(body.area);
  if (body.address !== undefined) data.address = optionalString(body.address);
  if (body.distanceMinutes !== undefined) {
    data.distanceMinutes = optionalNonNegativeNumber(
      body.distanceMinutes,
      "invalid_distance_minutes",
      "distanceMinutes must be a non-negative number"
    );
  }
  if (body.cuisine !== undefined) data.cuisine = optionalString(body.cuisine);
  if (body.priceBand !== undefined) data.priceBand = optionalString(body.priceBand);
  if (body.averagePriceCents !== undefined) {
    data.averagePriceCents = optionalNonNegativeNumber(
      body.averagePriceCents,
      "invalid_average_price_cents",
      "averagePriceCents must be a non-negative number"
    );
  }
  if (body.supportsDineIn !== undefined) data.supportsDineIn = optionalBoolean(body.supportsDineIn);
  if (body.supportsTakeout !== undefined) data.supportsTakeout = optionalBoolean(body.supportsTakeout);
  if (body.tags !== undefined) data.tags = stringArray(body.tags) ?? [];
  if (body.status !== undefined) {
    const status = restaurantStatus(body.status);
    if (allowStatus) data.status = status;
  }
  return data;
}

export async function registerGroupKnowledgeRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/restaurants", async (request, reply) => {
    try {
      await requireActiveMembership({
        prisma,
        env,
        groupId: request.params.groupId,
        authorization: request.headers.authorization
      });
      const restaurants = await prisma.restaurant.findMany({
        where: { groupId: request.params.groupId },
        include: restaurantInclude,
        orderBy: { createdAt: "desc" }
      });
      return { groupId: request.params.groupId, restaurants: restaurants.map(toRestaurantSummary) };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post<{ Params: { groupId: string }; Body: CreateRestaurantRequest }>(
    "/api/groups/:groupId/restaurants",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          authorization: request.headers.authorization
        });
        const name = requiredNonBlankString(
          request.body,
          "name",
          "restaurant_name_required",
          "Restaurant name is required"
        );
        const restaurant = await prisma.restaurant.create({
          data: {
            groupId: request.params.groupId,
            name,
            area: optionalString(request.body.area) ?? null,
            address: optionalString(request.body.address) ?? null,
            distanceMinutes:
              optionalNonNegativeNumber(
                request.body.distanceMinutes,
                "invalid_distance_minutes",
                "distanceMinutes must be a non-negative number"
              ) ?? null,
            cuisine: optionalString(request.body.cuisine) ?? null,
            priceBand: optionalString(request.body.priceBand) ?? null,
            averagePriceCents:
              optionalNonNegativeNumber(
                request.body.averagePriceCents,
                "invalid_average_price_cents",
                "averagePriceCents must be a non-negative number"
              ) ?? null,
            supportsDineIn: optionalBoolean(request.body.supportsDineIn) ?? true,
            supportsTakeout: optionalBoolean(request.body.supportsTakeout) ?? false,
            tags: stringArray(request.body.tags) ?? [],
            status: "active",
            createdByMembershipId: membership.membershipId
          },
          include: restaurantInclude
        });
        return {
          groupId: request.params.groupId,
          restaurant: toRestaurantSummary(restaurant)
        } satisfies RestaurantMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );

  app.patch<{ Params: { groupId: string; restaurantId: string }; Body: PatchRestaurantRequest }>(
    "/api/groups/:groupId/restaurants/:restaurantId",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          authorization: request.headers.authorization
        });
        const existing = await prisma.restaurant.findFirst({
          where: { id: request.params.restaurantId, groupId: request.params.groupId },
          include: restaurantInclude
        });
        if (!existing) {
          reply.code(404);
          return { error: "restaurant_not_found", message: "Restaurant not found" };
        }
        const wantsStatusChange = request.body.status !== undefined;
        if (wantsStatusChange && membership.role !== "admin") {
          reply.code(403);
          return {
            error: "admin_membership_required",
            message: "Admin membership is required to change restaurant status"
          };
        }
        if (membership.role !== "admin" && existing.createdByMembershipId !== membership.membershipId) {
          reply.code(403);
          return { error: "restaurant_owner_required", message: "Only the creator or an admin can edit restaurant" };
        }
        const data = buildRestaurantPatch(request.body, membership.role === "admin");
        if (Object.keys(data).length === 0) {
          reply.code(400);
          return { error: "empty_restaurant_patch", message: "At least one restaurant field is required" };
        }
        const restaurant = await prisma.restaurant.update({
          where: { id: existing.id },
          data,
          include: restaurantInclude
        });
        return {
          groupId: request.params.groupId,
          restaurant: toRestaurantSummary(restaurant)
        } satisfies RestaurantMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );
}
```

- [ ] **Step 4: Register the new routes**

Modify `apps/server/src/app.ts`:

```ts
import { registerGroupKnowledgeRoutes } from "./routes/groupKnowledge.js";
```

Register after `registerGroupRoutes(app, env)`:

```ts
await registerGroupRoutes(app, env);
await registerGroupKnowledgeRoutes(app, env);
await registerRecommendationRoutes(app, env);
```

- [ ] **Step 5: Verify restaurant routes**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/groupKnowledge.ts apps/server/src/app.ts apps/server/tests/groupKnowledge.test.ts
git commit -m "feat: add group scoped restaurant routes"
```

---

### Task 3: Group-Scoped Recommendation Routes

**Files:**
- Modify: `apps/server/src/routes/groupKnowledge.ts`
- Modify: `apps/server/tests/groupKnowledge.test.ts`

**Interfaces:**
- Consumes:
  - `CreateRecommendationRequest`
  - `PatchRecommendationRequest`
  - `RecommendationMutationResponse`
  - Restaurant ownership validation from Task 2.
- Produces:
  - `POST /api/groups/:groupId/recommendations`
  - `PATCH /api/groups/:groupId/recommendations/:recommendationId`

- [ ] **Step 1: Add recommendation tests**

Append these tests to `apps/server/tests/groupKnowledge.test.ts`:

```ts
describe("group knowledge recommendation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "membership-2",
      groupId: "group-1",
      identityId: "identity-2",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "admin-membership",
      groupId: "group-1",
      identityId: "identity-admin",
      role: "admin",
      status: "active"
    });
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-2", groupId: "group-2", name: "别组餐厅" });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("creates a recommendation for a restaurant in the active membership group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        restaurantId: "restaurant-1",
        dish: "卤肉饭",
        reason: "稳定下饭",
        weatherTags: ["rainy"],
        weekdayTags: ["thursday"],
        moodTags: ["想吃饭"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: {
        groupId: "group-1",
        restaurantId: "restaurant-1",
        createdByMembershipId: "membership-1",
        dish: "卤肉饭",
        reason: "稳定下饭",
        weatherTags: ["rainy"],
        weekdayTags: ["thursday"],
        moodTags: ["想吃饭"]
      }
    });

    await app.close();
  });

  it("rejects recommendation creation with a restaurant from another group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        restaurantId: "restaurant-2",
        reason: "不能跨组写推荐"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "restaurant_group_mismatch",
      message: "Restaurant does not belong to route group"
    });
    expect(prisma.recommendation.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("lets a member patch their own recommendation and blocks another member", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const ownPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { reason: "今天特别适合", moodTags: ["想吃饭"] }
    });
    const otherPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-2",
          membershipId: "membership-2",
          role: "member"
        })}`
      },
      payload: { reason: "改别人的推荐" }
    });

    expect(ownPatch.statusCode).toBe(200);
    expect(otherPatch.statusCode).toBe(403);
    expect(otherPatch.json()).toEqual({
      error: "recommendation_owner_required",
      message: "Only the creator or an admin can edit recommendation"
    });

    await app.close();
  });

  it("lets an admin patch any recommendation in the group", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-admin",
          membershipId: "admin-membership",
          role: "admin"
        })}`
      },
      payload: { dish: "鸡腿饭", reason: "管理员补充口味信息" }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.recommendation.update).toHaveBeenCalledWith({
      where: { id: "recommendation-1" },
      data: { dish: "鸡腿饭", reason: "管理员补充口味信息" }
    });

    await app.close();
  });

  it("returns not found for a recommendation outside the route group", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-2",
      groupId: "group-2",
      restaurantId: "restaurant-2",
      dish: null,
      reason: "别组推荐",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: null,
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-2",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { reason: "跨组更新" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "recommendation_not_found", message: "Recommendation not found" });

    await app.close();
  });
});
```

Add the following mock methods to the `recommendation` mock created in Task 2:

```ts
recommendation: {
  findFirst: vi.fn(async ({ where }: { where: { id: string; groupId: string } }) => {
    return store.recommendations.find(
      (candidate) => candidate.id === where.id && candidate.groupId === where.groupId
    ) ?? null;
  }),
  create: vi.fn(async ({ data }: { data: Omit<MockRecommendation, "id" | "createdAt" | "updatedAt"> }) => {
    const now = new Date("2026-07-09T04:10:00.000Z");
    const recommendation = {
      id: `recommendation-${store.nextRecommendationId++}`,
      createdAt: now,
      updatedAt: now,
      ...data
    };
    store.recommendations.push(recommendation);
    return recommendation;
  }),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockRecommendation> }) => {
    const recommendation = store.recommendations.find((candidate) => candidate.id === where.id);
    if (!recommendation) throw new Error(`Missing recommendation ${where.id}`);
    Object.assign(recommendation, data, { updatedAt: new Date("2026-07-09T05:10:00.000Z") });
    return recommendation;
  })
}
```

- [ ] **Step 2: Run the failing recommendation route tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts
```

Expected: FAIL because the recommendation routes are not registered.

- [ ] **Step 3: Add recommendation handlers**

Add these imports to `apps/server/src/routes/groupKnowledge.ts`:

```ts
import type {
  CreateRecommendationRequest,
  PatchRecommendationRequest,
  RecommendationMutationResponse
} from "@lunch/shared";
```

Add these helper types and functions near the existing restaurant helpers:

```ts
type RecommendationRow = IncludedRecommendation;

function moodTagArray(value: unknown): string[] {
  return stringArray(value, "invalid_tags") ?? [];
}

function weatherTagArray(value: unknown): string[] {
  return enumArray(value, weatherTags, "invalid_weather_tags");
}

function weekdayTagArray(value: unknown): string[] {
  return enumArray(value, weekdayTags, "invalid_weekday_tags");
}

function recommendationPatch(body: PatchRecommendationRequest) {
  const data: Record<string, unknown> = {};
  if (body.dish !== undefined) data.dish = optionalString(body.dish);
  if (body.reason !== undefined) {
    data.reason = requiredNonBlankString(
      body,
      "reason",
      "recommendation_reason_required",
      "Recommendation reason is required"
    );
  }
  if (body.weatherTags !== undefined) data.weatherTags = weatherTagArray(body.weatherTags);
  if (body.weekdayTags !== undefined) data.weekdayTags = weekdayTagArray(body.weekdayTags);
  if (body.moodTags !== undefined) data.moodTags = moodTagArray(body.moodTags);
  return data;
}

async function findRestaurantForWrite(groupId: string, restaurantId: string) {
  return prisma.restaurant.findFirst({
    where: { id: restaurantId, groupId },
    include: restaurantInclude
  });
}
```

Add these handlers inside `registerGroupKnowledgeRoutes` after the restaurant handlers:

```ts
  app.post<{ Params: { groupId: string }; Body: CreateRecommendationRequest }>(
    "/api/groups/:groupId/recommendations",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          authorization: request.headers.authorization
        });
        const reason = requiredNonBlankString(
          request.body,
          "reason",
          "recommendation_reason_required",
          "Recommendation reason is required"
        );
        const restaurant = await findRestaurantForWrite(request.params.groupId, request.body.restaurantId);
        if (!restaurant) {
          reply.code(400);
          return {
            error: "restaurant_group_mismatch",
            message: "Restaurant does not belong to route group"
          };
        }
        const recommendation = await prisma.recommendation.create({
          data: {
            groupId: request.params.groupId,
            restaurantId: restaurant.id,
            createdByMembershipId: membership.membershipId,
            dish: optionalString(request.body.dish) ?? null,
            reason,
            weatherTags: weatherTagArray(request.body.weatherTags),
            weekdayTags: weekdayTagArray(request.body.weekdayTags),
            moodTags: moodTagArray(request.body.moodTags)
          }
        });
        return {
          groupId: request.params.groupId,
          recommendation: toRecommendationSummary(recommendation as RecommendationRow)
        } satisfies RecommendationMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );

  app.patch<{ Params: { groupId: string; recommendationId: string }; Body: PatchRecommendationRequest }>(
    "/api/groups/:groupId/recommendations/:recommendationId",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          authorization: request.headers.authorization
        });
        const existing = await prisma.recommendation.findFirst({
          where: { id: request.params.recommendationId, groupId: request.params.groupId }
        });
        if (!existing) {
          reply.code(404);
          return { error: "recommendation_not_found", message: "Recommendation not found" };
        }
        if (membership.role !== "admin" && existing.createdByMembershipId !== membership.membershipId) {
          reply.code(403);
          return {
            error: "recommendation_owner_required",
            message: "Only the creator or an admin can edit recommendation"
          };
        }
        const data = recommendationPatch(request.body);
        if (Object.keys(data).length === 0) {
          reply.code(400);
          return { error: "empty_recommendation_patch", message: "At least one recommendation field is required" };
        }
        const recommendation = await prisma.recommendation.update({
          where: { id: existing.id },
          data
        });
        return {
          groupId: request.params.groupId,
          recommendation: toRecommendationSummary(recommendation as RecommendationRow)
        } satisfies RecommendationMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );
```

- [ ] **Step 4: Verify recommendation routes**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/groupKnowledge.ts apps/server/tests/groupKnowledge.test.ts
git commit -m "feat: add group scoped recommendation routes"
```

---

### Task 4: Group-Scoped Feedback And Avoid Semantics

**Files:**
- Modify: `apps/server/src/routes/groupKnowledge.ts`
- Modify: `apps/server/tests/groupKnowledge.test.ts`
- Modify: `apps/server/tests/feedback.test.ts`

**Interfaces:**
- Consumes:
  - `CreateGroupFeedbackRequest`
  - `CreateGroupFeedbackResponse`
  - `FeedbackType = "want" | "skip" | "ate" | "avoid"`
- Produces:
  - `POST /api/groups/:groupId/feedback`

- [ ] **Step 1: Add group feedback, auth matrix, and validation tests**

Append these tests to `apps/server/tests/groupKnowledge.test.ts`:

```ts
describe("group knowledge feedback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-2", groupId: "group-2", name: "别组餐厅" });
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    prisma.__seedRecommendation({
      id: "recommendation-2",
      groupId: "group-2",
      restaurantId: "restaurant-2",
      dish: null,
      reason: "别组推荐",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: null,
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("writes avoid feedback for the active group without blocking the restaurant", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "avoid"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: {
        groupId: "group-1",
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        membershipId: "membership-1",
        type: "avoid"
      }
    });
    expect(prisma.restaurant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "blocked" }) })
    );

    await app.close();
  });

  it("rejects feedback for a restaurant from another group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-2",
        type: "skip"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "restaurant_group_mismatch",
      message: "Restaurant does not belong to route group"
    });
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects feedback when recommendation does not belong to the route group or restaurant", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-2",
        type: "ate"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "recommendation_group_mismatch",
      message: "Recommendation does not belong to route group and restaurant"
    });
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects read-token-only auth on group feedback", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { "x-lunch-read-token": "read-token" },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        type: "want"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });
});
```

Append this shared auth matrix and runtime validation block to `apps/server/tests/groupKnowledge.test.ts` after the feedback route tests:

```ts
describe("group knowledge route auth and validation matrix", () => {
  const routeCases = [
    { method: "GET", url: "/api/groups/group-1/restaurants" },
    { method: "POST", url: "/api/groups/group-1/restaurants", payload: { name: "新餐厅" } },
    {
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      payload: { restaurantId: "restaurant-1", reason: "推荐" }
    },
    {
      method: "POST",
      url: "/api/groups/group-1/feedback",
      payload: { officeDate: "2026-07-09", restaurantId: "restaurant-1", type: "want" }
    }
  ] as const;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "membership-removed",
      groupId: "group-1",
      identityId: "identity-removed",
      role: "member",
      status: "removed"
    });
    prisma.__seedMembership({
      id: "admin-membership",
      groupId: "group-1",
      identityId: "identity-admin",
      role: "admin",
      status: "active"
    });
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  async function injectRoute(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    route: (typeof routeCases)[number],
    headers?: Record<string, string>
  ) {
    return app.inject({
      method: route.method,
      url: route.url,
      ...(headers ? { headers } : {}),
      ...("payload" in route ? { payload: route.payload } : {})
    });
  }

  it.each(routeCases)("rejects missing group session for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });

    await app.close();
  });

  it.each(routeCases)("rejects read-token-only auth for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route, { "x-lunch-read-token": "read-token" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });

    await app.close();
  });

  it.each(routeCases)("rejects mismatched group sessions for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route, {
      authorization: `Bearer ${groupToken({ groupId: "group-2", membershipId: "membership-1" })}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "group_session_mismatch" });

    await app.close();
  });

  it.each(routeCases)("rejects removed memberships for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route, {
      authorization: `Bearer ${groupToken({
        identityId: "identity-removed",
        membershipId: "membership-removed",
        role: "member"
      })}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "active_membership_required" });

    await app.close();
  });

  it("rejects invalid restaurant body fields before writing", async () => {
    const app = await buildTestApp();

    const badDistance = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { name: "坏距离", distanceMinutes: -1 }
    });
    const badTags = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { name: "坏标签", tags: "近" }
    });
    const badStatus = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-admin",
          membershipId: "admin-membership",
          role: "admin"
        })}`
      },
      payload: { status: "retired" }
    });

    expect(badDistance.statusCode).toBe(400);
    expect(badDistance.json()).toMatchObject({ error: "invalid_distance_minutes" });
    expect(badTags.statusCode).toBe(400);
    expect(badTags.json()).toMatchObject({ error: "invalid_tags" });
    expect(badStatus.statusCode).toBe(400);
    expect(badStatus.json()).toMatchObject({ error: "invalid_restaurant_status" });

    await app.close();
  });

  it("rejects invalid recommendation tags and blank reasons before writing", async () => {
    const app = await buildTestApp();

    const badReason = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "   " }
    });
    const badWeather = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "推荐", weatherTags: ["snowy"] }
    });
    const badWeekday = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "推荐", weekdayTags: ["sunday"] }
    });

    expect(badReason.statusCode).toBe(400);
    expect(badReason.json()).toMatchObject({ error: "recommendation_reason_required" });
    expect(badWeather.statusCode).toBe(400);
    expect(badWeather.json()).toMatchObject({ error: "invalid_weather_tags" });
    expect(badWeekday.statusCode).toBe(400);
    expect(badWeekday.json()).toMatchObject({ error: "invalid_weekday_tags" });

    await app.close();
  });

  it("rejects invalid feedback type and malformed office date before writing", async () => {
    const app = await buildTestApp();

    const badType = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { officeDate: "2026-07-09", restaurantId: "restaurant-1", type: "blocked" }
    });
    const badDate = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { officeDate: "07/09/2026", restaurantId: "restaurant-1", type: "want" }
    });

    expect(badType.statusCode).toBe(400);
    expect(badType.json()).toMatchObject({ error: "invalid_feedback_type" });
    expect(badDate.statusCode).toBe(400);
    expect(badDate.json()).toMatchObject({ error: "invalid_office_date" });

    await app.close();
  });
});
```

Add this mock implementation to the `feedback` mock:

```ts
feedback: {
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "feedback-1",
    createdAt: new Date("2026-07-09T06:00:00.000Z"),
    ...data
  }))
}
```

- [ ] **Step 2: Run the failing feedback, auth matrix, and validation tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts
```

Expected: FAIL because `POST /api/groups/:groupId/feedback` is not registered and validation helpers are not strict yet.

- [ ] **Step 3: Add group feedback handler**

Add these imports to `apps/server/src/routes/groupKnowledge.ts`:

```ts
import type {
  CreateGroupFeedbackRequest,
  CreateGroupFeedbackResponse,
  FeedbackSummary,
  FeedbackType
} from "@lunch/shared";
```

Add these helpers:

```ts
const feedbackTypes = new Set<FeedbackType>(["want", "skip", "ate", "avoid"]);

function toFeedbackSummary(feedback: {
  id: string;
  groupId: string;
  officeDate: string;
  restaurantId: string;
  recommendationId: string | null;
  membershipId: string | null;
  type: FeedbackType;
  createdAt: Date;
}): FeedbackSummary {
  return {
    id: feedback.id,
    groupId: feedback.groupId,
    officeDate: feedback.officeDate,
    restaurantId: feedback.restaurantId,
    ...(feedback.recommendationId ? { recommendationId: feedback.recommendationId } : {}),
    ...(feedback.membershipId ? { membershipId: feedback.membershipId } : {}),
    type: feedback.type,
    createdAt: feedback.createdAt.toISOString()
  };
}
```

Add this handler inside `registerGroupKnowledgeRoutes` after the recommendation handlers:

```ts
  app.post<{ Params: { groupId: string }; Body: CreateGroupFeedbackRequest }>(
    "/api/groups/:groupId/feedback",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          authorization: request.headers.authorization
        });
        const type = request.body.type;
        if (!feedbackTypes.has(type)) {
          reply.code(400);
          return { error: "invalid_feedback_type", message: "Feedback type is invalid" };
        }
        const officeDateValue = officeDate(request.body.officeDate);
        const restaurant = await findRestaurantForWrite(request.params.groupId, request.body.restaurantId);
        if (!restaurant) {
          reply.code(400);
          return {
            error: "restaurant_group_mismatch",
            message: "Restaurant does not belong to route group"
          };
        }
        if (request.body.recommendationId) {
          const recommendation = await prisma.recommendation.findFirst({
            where: {
              id: request.body.recommendationId,
              groupId: request.params.groupId,
              restaurantId: restaurant.id
            }
          });
          if (!recommendation) {
            reply.code(400);
            return {
              error: "recommendation_group_mismatch",
              message: "Recommendation does not belong to route group and restaurant"
            };
          }
        }
        const feedback = await prisma.feedback.create({
          data: {
            groupId: request.params.groupId,
            officeDate: officeDateValue,
            restaurantId: restaurant.id,
            recommendationId: request.body.recommendationId ?? null,
            membershipId: membership.membershipId,
            type
          }
        });
        return {
          groupId: request.params.groupId,
          feedback: toFeedbackSummary(feedback)
        } satisfies CreateGroupFeedbackResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );
```

- [ ] **Step 4: Add legacy feedback regression**

Modify `apps/server/tests/feedback.test.ts` and add:

```ts
it("keeps legacy feedback on the default group while group feedback requires group session", async () => {
  prisma.feedback.create.mockResolvedValue({
    id: "feedback-legacy",
    groupId: "seed-group-default",
    officeDate: "2026-07-09",
    restaurantId: "restaurant-1",
    recommendationId: null,
    type: "avoid"
  });

  const app = await buildTestApp();
  const legacy = await app.inject({
    method: "POST",
    url: "/api/feedback",
    headers: { "x-lunch-read-token": "read-token" },
    payload: {
      date: "2026-07-09",
      restaurantId: "restaurant-1",
      type: "avoid"
    }
  });
  const groupRoute = await app.inject({
    method: "POST",
    url: "/api/groups/group-1/feedback",
    headers: { "x-lunch-read-token": "read-token" },
    payload: {
      officeDate: "2026-07-09",
      restaurantId: "restaurant-1",
      type: "avoid"
    }
  });

  expect(legacy.statusCode).toBe(200);
  expect(groupRoute.statusCode).toBe(401);

  await app.close();
});
```

- [ ] **Step 5: Verify feedback behavior**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts feedback.test.ts
pnpm --filter @lunch/server typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/groupKnowledge.ts apps/server/tests/groupKnowledge.test.ts apps/server/tests/feedback.test.ts
git commit -m "feat: add group scoped feedback route"
```

---

### Task 5: Regression, Roadmap, And Handoff Checks

**Files:**
- Modify: `apps/server/tests/adminRoutes.test.ts`
- Modify: `roadmap.md`

**Interfaces:**
- Consumes:
  - All Stage 2 route and shared contracts from Tasks 1-4.
- Produces:
  - Updated roadmap reference to this plan after review approval.
  - Final Stage 2 verification summary.

- [ ] **Step 1: Add legacy route regression assertions**

Modify `apps/server/tests/adminRoutes.test.ts` in the existing restaurant/recommendation write test so it still asserts legacy writes go to `DEFAULT_GROUP_ID` and legacy admin session auth remains valid:

```ts
expect(prisma.restaurant.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    groupId: "seed-group-default",
    name: "米饭小馆",
    tags: ["新推荐"],
    status: "active"
  })
});
expect(prisma.recommendation.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    groupId: "seed-group-default",
    restaurantId: "restaurant-1",
    teammateId: "teammate-1",
    reason: "稳定下饭"
  })
});
```

- [ ] **Step 2: Run targeted regression tests**

Run:

```bash
pnpm --filter @lunch/server test -- groupKnowledge.test.ts adminRoutes.test.ts feedback.test.ts groups.test.ts
```

Expected: PASS.

- [ ] **Step 3: Update roadmap after plan approval**

After human review approves this plan, modify `roadmap.md`:

```md
| Stage 2 | Group-Scoped Restaurant Knowledge | Approved for Execution | [`plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md`](plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md) | Each group can maintain its own isolated restaurant and recommendation knowledge base |
```

Update the tracker:

```md
- [x] Stage 2 detailed implementation plan written.
- [ ] Stage 2 implemented and verified.
```

If the Stage 1 implementation handoff includes passing verification output, also update:

```md
- [x] Stage 1 implemented and verified.
```

If Stage 1 verification output is not present in the current thread, leave that line unchanged and mention that the roadmap still needs the Stage 1 verification link or summary.

- [ ] **Step 4: Run full affected checks**

Run:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/shared typecheck
pnpm --filter @lunch/shared build
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/server build
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Stage 2 implementation handoff summary**

Write the handoff summary with these exact sections:

```md
## Changed Files

- `packages/shared/src/types.ts`
- `packages/shared/src/api.ts`
- `packages/shared/tests/groupContracts.test.ts`
- `apps/server/src/routes/groupKnowledge.ts`
- `apps/server/src/app.ts`
- `apps/server/tests/groupKnowledge.test.ts`
- `apps/server/tests/adminRoutes.test.ts`
- `apps/server/tests/feedback.test.ts`
- `roadmap.md`

## Behavior

- Added group-scoped restaurant list/create/patch routes.
- Added group-scoped recommendation create/patch routes.
- Added group-scoped feedback route with member-level `avoid` semantics.
- Preserved legacy default-group routes.

## Tests Added

- Shared contract tests for Stage 2 route builders and request types.
- Server route tests for group-scoped restaurant isolation and permissions.
- Server route tests for group-scoped recommendation isolation and permissions.
- Server route tests for group-scoped feedback and `avoid` behavior.
- Server route auth matrix tests for missing tokens, read-token-only auth, mismatched group sessions, and removed memberships.
- Server route runtime validation tests for malformed restaurant, recommendation, and feedback payloads.
- Legacy regression checks for default-group routes.

## Tests Run

- `pnpm --filter @lunch/shared test`
- `pnpm --filter @lunch/shared typecheck`
- `pnpm --filter @lunch/shared build`
- `pnpm --filter @lunch/server test`
- `pnpm --filter @lunch/server typecheck`
- `pnpm --filter @lunch/server build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## Known Issues

- Recommendation delete/hide is not implemented because the approved Stage 2 API list has no `DELETE` route and the schema has no recommendation status field.
- Stage 3 still owns today recommendation batches, participation, decision, extension storage, and cache fallback.

## Subagent Rule

- No Codex subagents were created unless GPT-5.5 was explicitly enforced.
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/tests/adminRoutes.test.ts roadmap.md
git commit -m "test: verify group knowledge regressions"
```

---

## Final Verification Matrix

Run these checks before marking Stage 2 implemented:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/shared typecheck
pnpm --filter @lunch/shared build
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/server build
pnpm test
pnpm typecheck
pnpm build
```

For any failing check, keep the task open and record the failing command plus the failure summary in the handoff.

## Plan Self-Review

- Spec coverage: Stage 2 roadmap items are covered by Tasks 1-5, including auth matrix coverage, runtime body validation, and cross-group ID response policy. Stage 3 today batches and participation are explicitly out of scope.
- Placeholder scan: No task depends on an undefined file, route, type, or command.
- Type consistency: Route builders, request types, response types, and route handler names are consistent across tasks.
- Boundary check: This plan preserves legacy default-group APIs and keeps prototype UI wiring in Stage 4.
- Subagent compliance: The plan repeats the GPT-5.5-only subagent rule in the worker header and handoff.
