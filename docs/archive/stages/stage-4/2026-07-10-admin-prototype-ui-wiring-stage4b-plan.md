# Admin Prototype UI Wiring Stage 4B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy single-team Admin form with a prototype-aligned React workspace for real multi-group identity/group entry, current recommendations, participation, and restaurant knowledge management.

**Architecture:** Use explicit session snapshots and feature clients so every request captures its API base, group ID, and token before it starts. Keep routing, request-generation protection, auth transitions, today state, restaurant filtering/permissions, and two-step creation in pure testable modules; React pages render those models and never invent server data.

**Tech Stack:** TypeScript 5.7, pnpm workspaces, React 19, React DOM 19, Vite 6, Vitest 2, native Fetch API, browser `localStorage`, `@lunch/shared` contracts.

**Status:** Approved for Execution

**Review amendments (2026-07-14):** Preserve the one-time invite code in the
authenticated auth state; expose authenticated create/join entry without
discarding the current group; classify participation membership failures at the
Today page level; and harden the final residue scan and optional Railway dev API
smoke scope.

## Global Constraints

- Source design: `specs/2026-07-10-prototype-ui-wiring-stage4-design.md`.
- Roadmap stage: `roadmap.md` Stage 4B, Admin Prototype UI Wiring.
- Stage 1, Stage 2, Stage 3, and the implemented/QA-verified Stage 4A shared-contract state are prerequisites.
- Use existing Stage 1-3 API routes; do not add a database model, migration, server route, or lunch-loop semantic.
- Remove the legacy `/api/session`, `/api/restaurants`, and `/api/recommendations` production UI path from Admin.
- Identity APIs use `identityToken`; every `/api/groups/:groupId/*` request uses the captured group's `groupSessionToken`.
- Tokens are stored locally but never rendered, logged, placed in route state, or included in errors.
- The one-time invite code lives only in in-memory `AuthViewState`; never persist it in `localStorage` or a URL.
- Group switching is commit-after-success: obtain a fresh session first, then change `activeGroupId`.
- Each page request captures `apiBaseUrl + groupId + token`; a stale response from Group A must never overwrite active Group B state.
- UI role/ownership controls improve clarity but never replace server permission checks.
- Members may edit a restaurant only when they created it; admins may edit every group restaurant and govern status.
- Members may edit only their own recommendations; admins may edit every group recommendation.
- Admin restaurant status `blocked` is distinct from feedback type `avoid`.
- `GET /api/groups/:groupId/today-recommendations` remains read-only and 404/`no_current_batch` becomes a generate state.
- `POST /api/groups/:groupId/today-recommendations/refresh` creates a new batch and must prevent duplicate submission.
- The strategy panel uses only returned weather, reasons, and `scoreBreakdown`; do not invent weights, algorithm versions, people, counts, or historical metrics.
- Admin navigation exposes only login/group entry, today recommendations, and restaurant library in Stage 4B.
- The authenticated shell exposes a “创建/加入小组” action that reuses group entry without clearing identity or the current active group.
- Do not add React Router, Redux, Zustand, a UI framework, or a large DOM test framework.
- Use a small hash router with `#login`, `#today`, and `#restaurants` for static-host compatibility.
- Port the production visual language from `demo-design/`, but remove prototype overview links, `data-od-*`, static data, recommendation history, dashboard, members, and settings.
- `TEAM_INVITE_CODE` is never hardcoded; invite input defaults to an empty string.

---

## Scope

In scope:

- Versioned local Admin session state for identity, active group, group summaries, and group sessions.
- Structured API errors with explicit captured request contexts.
- Identity creation, first-time and authenticated group creation/join, group list, fresh group session, disconnect, and group switching.
- Hash routes and prototype-aligned authenticated shell.
- Today current batch, weather, strategy, score breakdown, participation groups, generate, refresh, empty, and error states.
- Restaurant search, cuisine/status filtering, duplicate warning, create/edit, recommendation create/edit, and admin status governance.
- Two-step restaurant + first recommendation partial-success recovery.
- Loading, retry, session-expired, membership-removed, and operation-permission states.
- Automated pure-model/client tests, typecheck/build, browser QA, and Stage 4 integration handoff.

Out of scope:

- Dashboard, recommendation history, historical batches, statistics, members, group settings, reminder defaults, scoring weights, invite reset, or production static hosting.
- New server/database behavior.

## File Structure

- Modify: `apps/admin/src/api.ts`
  - Replace the implicit legacy token client with structured explicit-context JSON requests.
- Create: `apps/admin/src/sessionStore.ts`
  - Persist versioned multi-group Admin session state.
- Create: `apps/admin/src/clients/groups.ts`
  - Identity, group create/join/list, and session refresh calls.
- Create: `apps/admin/src/clients/today.ts`
  - Current batch, refresh, and participation calls.
- Create: `apps/admin/src/clients/restaurants.ts`
  - Restaurant and recommendation list/create/patch calls.
- Create: `apps/admin/src/features/auth/authModel.ts`
  - Auth/group-entry controller and view state.
- Create: `apps/admin/src/features/today/todayModel.ts`
  - Current-batch loading, strategy, participation groups, and refresh state.
- Create: `apps/admin/src/features/restaurants/restaurantModel.ts`
  - Filtering, duplicate detection, permissions, and two-step creation.
- Create: `apps/admin/src/app/router.ts`
  - Parse and write the three supported hash routes.
- Create: `apps/admin/src/app/requestGate.ts`
  - Prevent stale requests from committing after a group change.
- Create: `apps/admin/src/app/App.tsx`
  - Own top-level route, session, and active-group coordination.
- Create: `apps/admin/src/components/AppShell.tsx`
- Create: `apps/admin/src/components/GroupEntryPanel.tsx`
- Create: `apps/admin/src/components/Modal.tsx`
- Create: `apps/admin/src/components/StatusPanel.tsx`
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Create: `apps/admin/src/pages/TodayPage.tsx`
- Create: `apps/admin/src/pages/RestaurantsPage.tsx`
- Modify: `apps/admin/src/main.tsx`
  - Bootstrap `App` only.
- Modify: `apps/admin/src/styles.css`
  - Port the production Admin/login/today/restaurants visual system.
- Modify: `apps/admin/tests/api.test.ts`
- Create: `apps/admin/tests/sessionStore.test.ts`
- Create: `apps/admin/tests/groupClient.test.ts`
- Create: `apps/admin/tests/authModel.test.ts`
- Create: `apps/admin/tests/router.test.ts`
- Create: `apps/admin/tests/requestGate.test.ts`
- Create: `apps/admin/tests/authMarkup.test.tsx`
- Create: `apps/admin/tests/todayClient.test.ts`
- Create: `apps/admin/tests/todayModel.test.ts`
- Create: `apps/admin/tests/todayMarkup.test.tsx`
- Create: `apps/admin/tests/restaurantClient.test.ts`
- Create: `apps/admin/tests/restaurantModel.test.ts`
- Create: `apps/admin/tests/restaurantMarkup.test.tsx`
- Modify: `vitest.config.ts`
  - Collect React markup tests with the existing `*.test.tsx` naming used by this plan.
- Create: `qa/2026-07-10-admin-prototype-ui-wiring-stage4b.md`
- Modify: `README.md`
- Modify: `roadmap.md`

---

### Task 1: Explicit Admin Request Context And Versioned Session Store

**Files:**

- Modify: `apps/admin/src/api.ts`
- Create: `apps/admin/src/sessionStore.ts`
- Modify: `apps/admin/tests/api.test.ts`
- Create: `apps/admin/tests/sessionStore.test.ts`

**Interfaces:**

- Consumes: browser `fetch`, `localStorage`, `ApiErrorResponse`, and `GroupSummary`.
- Produces:
  - `AdminApiError`
  - `requestJson<T>(path, context, init): Promise<T>`
  - `AdminSessionState`
  - `readAdminSession`, `writeAdminSession`, `saveIdentity`, `saveGroupSession`, `syncGroups`, `clearGroupSession`, `disconnectAdmin`
  - `getIdentityContext` and `getActiveGroupContext`

- [ ] **Step 1: Replace legacy API tests with explicit-context tests**

Rewrite `apps/admin/tests/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiError, requestJson } from "../src/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin api", () => {
  it("uses the token passed in the captured request context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestJson<{ saved: boolean }>(
      "/api/groups/group-1/restaurants",
      { apiBaseUrl: "https://lunch.example", token: "group-session-token" },
      { method: "POST", body: JSON.stringify({ name: "巷口砂锅" }) }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lunch.example/api/groups/group-1/restaurants",
      {
        method: "POST",
        body: JSON.stringify({ name: "巷口砂锅" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer group-session-token"
        }
      }
    );
  });

  it("preserves status and server code without leaking the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "restaurant_owner_required",
        message: "Only the creator or an admin can edit restaurant"
      })
    }));

    const error = await requestJson(
      "/api/groups/group-1/restaurants/restaurant-1",
      { apiBaseUrl: "https://lunch.example", token: "secret-token" }
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ status: 403, code: "restaurant_owner_required" });
    expect(String(error)).not.toContain("secret-token");
  });
});
```

- [ ] **Step 2: Write session persistence and context tests**

Create `apps/admin/tests/sessionStore.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_SESSION_KEY,
  disconnectAdmin,
  getActiveGroupContext,
  getDefaultAdminSession,
  readAdminSession,
  saveGroupSession,
  saveIdentity
} from "../src/sessionStore";

function stubStorage(initial?: unknown) {
  let stored = initial === undefined ? null : JSON.stringify(initial);
  const localStorage = {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key: string, value: string) => { stored = value; }),
    removeItem: vi.fn(() => { stored = null; })
  };
  vi.stubGlobal("window", { localStorage });
  return { read: () => stored === null ? null : JSON.parse(stored) };
}

afterEach(() => vi.unstubAllGlobals());

describe("admin session store", () => {
  it("ignores malformed and legacy token-only storage", () => {
    stubStorage({ token: "legacy-token" });
    expect(readAdminSession()).toEqual(getDefaultAdminSession());
  });

  it("saves identity before a group exists", () => {
    const storage = stubStorage();
    saveIdentity("小林", "identity-token");
    expect(storage.read()).toMatchObject({
      version: 2,
      displayName: "小林",
      identityToken: "identity-token",
      sessionsByGroupId: {},
      groupSummariesById: {}
    });
  });

  it("commits group session and active group together", () => {
    const storage = stubStorage(getDefaultAdminSession());
    saveGroupSession({
      identityToken: "fresh-identity-token",
      groupSessionToken: "group-session-token",
      group: {
        groupId: "group-1",
        name: "设计组",
        role: "admin",
        membershipId: "membership-1"
      }
    });
    expect(getActiveGroupContext()).toEqual({
      apiBaseUrl: "",
      groupId: "group-1",
      token: "group-session-token",
      group: expect.objectContaining({ name: "设计组" })
    });
    expect(storage.read().activeGroupId).toBe("group-1");
  });

  it("disconnects without mutating any server state", () => {
    const storage = stubStorage(getDefaultAdminSession());
    disconnectAdmin();
    expect(storage.read()).toBeNull();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(ADMIN_SESSION_KEY);
  });
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- api.test.ts sessionStore.test.ts
```

Expected: FAIL because the explicit API and session store do not exist.

- [ ] **Step 4: Implement explicit JSON requests**

Replace `apps/admin/src/api.ts`:

```ts
import type { ApiErrorResponse } from "@lunch/shared";

export interface AdminRequestContext {
  apiBaseUrl: string;
  token?: string | undefined;
  signal?: AbortSignal | undefined;
}

export class AdminApiError extends Error {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly kind: "http" | "network" | "invalid-response";

  constructor(input: {
    kind: "http" | "network" | "invalid-response";
    status?: number | undefined;
    code?: string | undefined;
    message?: string | undefined;
  }) {
    super(input.message ?? input.code ?? input.kind);
    this.name = "AdminApiError";
    this.kind = input.kind;
    this.status = input.status;
    this.code = input.code;
  }
}

export async function requestJson<T>(
  path: string,
  context: AdminRequestContext,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${context.apiBaseUrl}${path}`, {
      ...init,
      ...(context.signal ? { signal: context.signal } : {}),
      headers: {
        "content-type": "application/json",
        ...(context.token ? { authorization: `Bearer ${context.token}` } : {}),
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    throw new AdminApiError({
      kind: "network",
      message: error instanceof Error ? error.message : "network_error"
    });
  }

  if (!response.ok) {
    let body: Partial<ApiErrorResponse> = {};
    try { body = await response.json() as Partial<ApiErrorResponse>; } catch { body = {}; }
    throw new AdminApiError({
      kind: "http",
      status: response.status,
      code: body.error,
      message: body.message ?? `HTTP ${response.status}`
    });
  }

  try { return await response.json() as T; }
  catch {
    throw new AdminApiError({
      kind: "invalid-response",
      status: response.status,
      code: "invalid_json_response"
    });
  }
}
```

- [ ] **Step 5: Implement the versioned session store**

Create `apps/admin/src/sessionStore.ts`:

```ts
import type { GroupSessionResponse, GroupSummary } from "@lunch/shared";

export const ADMIN_SESSION_KEY = "lunchAdminSessionState.v2";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export interface AdminSessionState {
  version: 2;
  apiBaseUrl: string;
  displayName?: string | undefined;
  identityToken?: string | undefined;
  activeGroupId?: string | undefined;
  sessionsByGroupId: Record<string, { token: string }>;
  groupSummariesById: Record<string, GroupSummary>;
}

export function getDefaultAdminSession(): AdminSessionState {
  return {
    version: 2,
    apiBaseUrl: API_BASE_URL,
    sessionsByGroupId: {},
    groupSummariesById: {}
  };
}

export function readAdminSession(): AdminSessionState {
  const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return getDefaultAdminSession();
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSessionState>;
    if (parsed.version !== 2) return getDefaultAdminSession();
    return { ...getDefaultAdminSession(), ...parsed };
  } catch {
    return getDefaultAdminSession();
  }
}

export function writeAdminSession(state: AdminSessionState): void {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(state));
}

export function saveIdentity(displayName: string, identityToken: string): void {
  writeAdminSession({
    ...getDefaultAdminSession(),
    displayName: displayName.trim(),
    identityToken
  });
}

export function saveGroupSession(response: GroupSessionResponse): void {
  const state = readAdminSession();
  writeAdminSession({
    ...state,
    identityToken: response.identityToken,
    activeGroupId: response.group.groupId,
    sessionsByGroupId: {
      ...state.sessionsByGroupId,
      [response.group.groupId]: { token: response.groupSessionToken }
    },
    groupSummariesById: {
      ...state.groupSummariesById,
      [response.group.groupId]: response.group
    }
  });
}

export function syncGroups(groups: GroupSummary[]): void {
  const state = readAdminSession();
  const ids = new Set(groups.map((group) => group.groupId));
  const next = {
    ...state,
    groupSummariesById: Object.fromEntries(groups.map((group) => [group.groupId, group])),
    sessionsByGroupId: Object.fromEntries(
      Object.entries(state.sessionsByGroupId).filter(([groupId]) => ids.has(groupId))
    )
  };
  if (next.activeGroupId && !ids.has(next.activeGroupId)) delete next.activeGroupId;
  writeAdminSession(next);
}

export function clearGroupSession(groupId: string): void {
  const state = readAdminSession();
  const sessionsByGroupId = { ...state.sessionsByGroupId };
  delete sessionsByGroupId[groupId];
  const next = { ...state, sessionsByGroupId };
  if (next.activeGroupId === groupId) delete next.activeGroupId;
  writeAdminSession(next);
}

export function disconnectAdmin(): void {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function getIdentityContext() {
  const state = readAdminSession();
  return state.identityToken
    ? { apiBaseUrl: state.apiBaseUrl, token: state.identityToken }
    : null;
}

export function getActiveGroupContext() {
  const state = readAdminSession();
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const session = state.sessionsByGroupId[groupId];
  const group = state.groupSummariesById[groupId];
  return session && group
    ? { apiBaseUrl: state.apiBaseUrl, groupId, token: session.token, group }
    : null;
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @lunch/admin test -- api.test.ts sessionStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/admin/src/api.ts apps/admin/src/sessionStore.ts apps/admin/tests/api.test.ts apps/admin/tests/sessionStore.test.ts
git commit -m "refactor: add admin group session store"
```

---

### Task 2: Group Client And Auth/Group-Entry Model

**Files:**

- Create: `apps/admin/src/clients/groups.ts`
- Create: `apps/admin/src/features/auth/authModel.ts`
- Create: `apps/admin/tests/groupClient.test.ts`
- Create: `apps/admin/tests/authModel.test.ts`

**Interfaces:**

- Consumes: Task 1 explicit request and session helpers plus shared group contracts.
- Produces: typed identity/group functions and `createAuthController` with load/create identity/create group/join/switch/disconnect methods.

- [ ] **Step 1: Write exact group request tests**

Create `apps/admin/tests/groupClient.test.ts` and call every group client in order with a fetch mock that returns valid shared response objects. Use these exact call expectations:

```ts
expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
  ["https://lunch.example/api/identities", "POST"],
  ["https://lunch.example/api/groups", "POST"],
  ["https://lunch.example/api/groups/join", "POST"],
  ["https://lunch.example/api/groups", undefined],
  ["https://lunch.example/api/groups/group-1/session", "POST"]
]);
expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
  "content-type": "application/json"
});
for (const call of fetchMock.mock.calls.slice(1)) {
  expect(call[1]?.headers).toMatchObject({
    authorization: "Bearer identity-token"
  });
}
```

Verify that all calls after identity creation carry `authorization: Bearer identity-token` and that the identity creation call does not.

- [ ] **Step 2: Write auth transition and safe-switch tests**

Create `apps/admin/tests/authModel.test.ts`:

```ts
it("retains a created identity after group join fails", async () => {
  const saveIdentity = vi.fn();
  const controller = createAuthController(authDependencies({
    readSession: vi.fn()
      .mockReturnValueOnce(disconnectedSession())
      .mockReturnValue(identityOnlySession()),
    createIdentity: vi.fn().mockResolvedValue({
      identityId: "identity-1",
      identityToken: "identity-token"
    }),
    saveIdentity,
    joinGroup: vi.fn().mockRejectedValue(new AdminApiError({
      kind: "http",
      status: 400,
      code: "invalid_invite_code"
    }))
  }));

  await controller.createIdentity("小林");
  await controller.joinGroup("BAD-CODE");

  expect(saveIdentity).toHaveBeenCalledWith("小林", "identity-token");
  expect(controller.getState()).toMatchObject({
    kind: "group-entry",
    error: "邀请码无效或已经失效。"
  });
});

it("commits the requested group only after fresh session succeeds", async () => {
  let resolveSession!: (response: GroupSessionResponse) => void;
  const saveGroupSession = vi.fn();
  const controller = createAuthController(authDependencies({
    refreshGroupSession: vi.fn(() => new Promise((resolve) => { resolveSession = resolve; })),
    saveGroupSession
  }));

  const switching = controller.switchGroup("group-2");
  expect(saveGroupSession).not.toHaveBeenCalled();
  resolveSession(groupSessionResponse("group-2"));
  await switching;
  expect(saveGroupSession).toHaveBeenCalledWith(groupSessionResponse("group-2"));
});

it("surfaces the one-time invite code after creating a group", async () => {
  const controller = createAuthController(authDependencies({
    createGroup: vi.fn().mockResolvedValue({
      identityToken: "fresh-identity-token",
      groupSessionToken: "group-session-token",
      group: groupSummary("group-1"),
      inviteCode: "LUNCH-ABC123"
    })
  }));

  await controller.createGroup({ groupName: "设计组" });

  expect(controller.getState()).toMatchObject({
    kind: "authenticated",
    inviteCode: "LUNCH-ABC123"
  });
});

it.each(["create", "join"] as const)(
  "keeps the prior authenticated group when %s another group fails",
  async (operation) => {
    const saveGroupSession = vi.fn();
    const failure = new AdminApiError({ kind: "network" });
    const controller = createAuthController(authDependencies({
      saveGroupSession,
      ...(operation === "create"
        ? { createGroup: vi.fn().mockRejectedValue(failure) }
        : { joinGroup: vi.fn().mockRejectedValue(failure) })
    }));

    if (operation === "create") await controller.createGroup({ groupName: "新小组" });
    else await controller.joinGroup("LUNCH-NEW123");

    expect(saveGroupSession).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      kind: "authenticated",
      session: {
        identityToken: "identity-token",
        activeGroupId: "group-1"
      },
      error: "操作没有完成，请检查网络后重试。"
    });
  }
);
```

Add typed factories for disconnected, identity-only, and authenticated sessions
plus the full dependency interface with deterministic default mocks. The
authenticated default fixture has `identityToken: "identity-token"` and usable
active `group-1`; tests for first-time entry explicitly use the identity-only
fixture.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- groupClient.test.ts authModel.test.ts
```

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement group clients**

Create `apps/admin/src/clients/groups.ts`:

```ts
import {
  GROUP_ROUTES,
  type CreateGroupRequest,
  type CreateGroupResponse,
  type CreateIdentityResponse,
  type GroupsListResponse,
  type JoinGroupResponse,
  type RefreshGroupSessionResponse
} from "@lunch/shared";
import { requestJson, type AdminRequestContext } from "../api";

type IdentityContext = AdminRequestContext & { token: string };

export function createIdentity(apiBaseUrl: string, displayName: string) {
  return requestJson<CreateIdentityResponse>(
    GROUP_ROUTES.identities,
    { apiBaseUrl },
    {
      method: "POST",
      body: JSON.stringify({ displayName: displayName.trim() })
    }
  );
}

export function createGroup(context: IdentityContext, input: CreateGroupRequest) {
  return requestJson<CreateGroupResponse>(GROUP_ROUTES.groups, context, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function joinGroup(context: IdentityContext, inviteCode: string) {
  return requestJson<JoinGroupResponse>(GROUP_ROUTES.joinGroup, context, {
    method: "POST",
    body: JSON.stringify({ inviteCode: inviteCode.trim() })
  });
}

export function listGroups(context: IdentityContext) {
  return requestJson<GroupsListResponse>(GROUP_ROUTES.groups, context);
}

export function refreshGroupSession(context: IdentityContext, groupId: string) {
  return requestJson<RefreshGroupSessionResponse>(
    GROUP_ROUTES.groupSession(groupId),
    context,
    { method: "POST" }
  );
}
```

- [ ] **Step 5: Implement the auth controller state machine**

Create `apps/admin/src/features/auth/authModel.ts` with this state union and controller. Import the shared response types, `AdminApiError`, `AdminSessionState`, and the exact session helper types used below:

```ts
export type AuthViewState =
  | { kind: "loading" }
  | { kind: "identity-entry"; error?: string | undefined }
  | { kind: "group-entry"; session: AdminSessionState; groups: GroupSummary[]; inviteCode?: string | undefined; error?: string | undefined }
  | { kind: "switching"; session: AdminSessionState; groups: GroupSummary[]; pendingGroupId: string }
  | { kind: "authenticated"; session: AdminSessionState; groups: GroupSummary[]; inviteCode?: string | undefined; error?: string | undefined };

export interface AuthControllerDependencies {
  readSession: () => AdminSessionState;
  saveIdentity: (displayName: string, identityToken: string) => void;
  saveGroupSession: (response: GroupSessionResponse) => void;
  syncGroups: (groups: GroupSummary[]) => void;
  clearGroupSession: (groupId: string) => void;
  disconnectAdmin: () => void;
  createIdentity: (apiBaseUrl: string, displayName: string) => Promise<CreateIdentityResponse>;
  createGroup: (context: { apiBaseUrl: string; token: string }, input: CreateGroupRequest) => Promise<CreateGroupResponse>;
  joinGroup: (context: { apiBaseUrl: string; token: string }, inviteCode: string) => Promise<JoinGroupResponse>;
  listGroups: (context: { apiBaseUrl: string; token: string }) => Promise<GroupsListResponse>;
  refreshGroupSession: (context: { apiBaseUrl: string; token: string }, groupId: string) => Promise<RefreshGroupSessionResponse>;
  onState?: ((state: AuthViewState) => void) | undefined;
}

function authMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === "invalid_invite_code") return "邀请码无效或已经失效。";
    if (error.code === "removed_member") return "你已被移出该小组，请联系管理员。";
    if (error.status === 401) return "身份连接已失效，请重新进入。";
  }
  return "操作没有完成，请检查网络后重试。";
}

export function isMembershipInvalid(error: unknown): boolean {
  return error instanceof AdminApiError && (
    error.status === 401
    || (error.status === 403 && [
      "active_membership_required",
      "removed_member"
    ].includes(error.code ?? ""))
  );
}

function hasUsableActiveGroup(session: AdminSessionState): boolean {
  const groupId = session.activeGroupId;
  return Boolean(
    groupId
    && session.sessionsByGroupId[groupId]
    && session.groupSummariesById[groupId]
  );
}

function groupEntryFailureState(
  session: AdminSessionState,
  error: unknown,
  inviteCode?: string
): AuthViewState {
  const common = {
    session,
    groups: Object.values(session.groupSummariesById),
    ...(inviteCode ? { inviteCode } : {}),
    error: authMessage(error)
  };
  return hasUsableActiveGroup(session)
    ? { kind: "authenticated", ...common }
    : { kind: "group-entry", ...common };
}

export function createAuthController(dependencies: AuthControllerDependencies) {
  let state: AuthViewState = { kind: "loading" };
  const commit = (next: AuthViewState) => {
    state = next;
    dependencies.onState?.(next);
  };

  async function load(inviteCode?: string): Promise<AuthViewState> {
    const session = dependencies.readSession();
    if (!session.identityToken) {
      commit({ kind: "identity-entry" });
      return state;
    }
    commit({ kind: "loading" });
    try {
      const response = await dependencies.listGroups({
        apiBaseUrl: session.apiBaseUrl,
        token: session.identityToken
      });
      dependencies.syncGroups(response.groups);
      const synced = dependencies.readSession();
      const next = hasUsableActiveGroup(synced)
        ? {
            kind: "authenticated" as const,
            session: synced,
            groups: response.groups,
            ...(inviteCode ? { inviteCode } : {})
          }
        : {
            kind: "group-entry" as const,
            session: synced,
            groups: response.groups,
            ...(inviteCode ? { inviteCode } : {})
          };
      commit(next);
      return state;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        dependencies.disconnectAdmin();
        commit({ kind: "identity-entry", error: authMessage(error) });
      } else {
        commit(groupEntryFailureState(session, error, inviteCode));
      }
      return state;
    }
  }

  async function createIdentity(displayName: string): Promise<void> {
    const session = dependencies.readSession();
    commit({ kind: "loading" });
    try {
      const response = await dependencies.createIdentity(session.apiBaseUrl, displayName);
      dependencies.saveIdentity(displayName, response.identityToken);
      await load();
    } catch (error) {
      commit({ kind: "identity-entry", error: authMessage(error) });
    }
  }

  function identityContext() {
    const session = dependencies.readSession();
    if (!session.identityToken) return null;
    return { session, context: { apiBaseUrl: session.apiBaseUrl, token: session.identityToken } };
  }

  async function createGroupEntry(input: CreateGroupRequest): Promise<void> {
    const current = identityContext();
    if (!current) { commit({ kind: "identity-entry" }); return; }
    try {
      const response = await dependencies.createGroup(current.context, input);
      dependencies.saveGroupSession(response);
      await load(response.inviteCode);
    } catch (error) {
      commit(groupEntryFailureState(current.session, error));
    }
  }

  async function joinGroupEntry(inviteCode: string): Promise<void> {
    const current = identityContext();
    if (!current) { commit({ kind: "identity-entry" }); return; }
    try {
      const response = await dependencies.joinGroup(current.context, inviteCode);
      dependencies.saveGroupSession(response);
      await load();
    } catch (error) {
      commit(groupEntryFailureState(current.session, error));
    }
  }

  async function switchGroup(groupId: string): Promise<void> {
    const current = identityContext();
    if (!current) { commit({ kind: "identity-entry" }); return; }
    const groups = Object.values(current.session.groupSummariesById);
    commit({ kind: "switching", session: current.session, groups, pendingGroupId: groupId });
    try {
      const response = await dependencies.refreshGroupSession(current.context, groupId);
      dependencies.saveGroupSession(response);
      await load();
    } catch (error) {
      commit({
        kind: "authenticated",
        session: current.session,
        groups,
        error: authMessage(error)
      });
    }
  }

  async function handleGroupError(error: unknown, groupId: string): Promise<void> {
    if (isMembershipInvalid(error)) {
      dependencies.clearGroupSession(groupId);
      await load();
    }
  }

  function disconnect(): void {
    dependencies.disconnectAdmin();
    commit({ kind: "identity-entry" });
  }

  return {
    load,
    createIdentity,
    createGroup: createGroupEntry,
    joinGroup: joinGroupEntry,
    switchGroup,
    handleGroupError,
    disconnect,
    getState: () => state
  };
}
```

Task 8 adds the complete membership-versus-operation test matrix for this stable `isMembershipInvalid` signature.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @lunch/admin test -- groupClient.test.ts authModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/admin/src/clients/groups.ts apps/admin/src/features/auth/authModel.ts apps/admin/tests/groupClient.test.ts apps/admin/tests/authModel.test.ts
git commit -m "feat: add admin group entry flow"
```

---

### Task 3: Hash Router, Request Gate, And Authenticated Shell

**Files:**

- Create: `apps/admin/src/app/router.ts`
- Create: `apps/admin/src/app/requestGate.ts`
- Create: `apps/admin/src/app/App.tsx`
- Create: `apps/admin/src/components/AppShell.tsx`
- Create: `apps/admin/src/components/GroupEntryPanel.tsx`
- Create: `apps/admin/src/components/StatusPanel.tsx`
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Modify: `apps/admin/src/main.tsx`
- Create: `apps/admin/tests/authMarkup.test.tsx`
- Create: `apps/admin/tests/router.test.ts`
- Create: `apps/admin/tests/requestGate.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**

- Consumes: Task 2 auth controller and Task 1 session snapshots.
- Produces: `AdminRoute`, route subscription, monotonic request tokens, reusable group-entry UI, and an authenticated shell with two navigation links plus a create/join action.

- [ ] **Step 1: Write router, stale-request, and auth-shell markup tests**

Create `apps/admin/tests/router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAdminRoute } from "../src/app/router";

describe("admin router", () => {
  it.each([
    ["#login", "login"],
    ["#today", "today"],
    ["#restaurants", "restaurants"],
    ["#dashboard", "today"],
    ["", "today"]
  ] as const)("maps %s to %s", (hash, route) => {
    expect(parseAdminRoute(hash)).toBe(route);
  });
});
```

Create `apps/admin/tests/requestGate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRequestGate } from "../src/app/requestGate";

it("invalidates every earlier request when a new generation begins", () => {
  const gate = createRequestGate();
  const groupA = gate.begin();
  const groupB = gate.begin();
  expect(gate.isCurrent(groupA)).toBe(false);
  expect(gate.isCurrent(groupB)).toBe(true);
  gate.invalidate();
  expect(gate.isCurrent(groupB)).toBe(false);
});
```

Create `apps/admin/tests/authMarkup.test.tsx` with
`react-dom/server` markup checks that lock these authenticated-shell states:

- The closed shell renders a “创建/加入小组” button in addition to, but not as,
  a third navigation link.
- Opening the action renders the same `GroupEntryPanel` used by first-time
  entry, with create and join forms and an empty invite input default.
- An authenticated state carrying `inviteCode: "LUNCH-ABC123"` renders that
  one-time code in an `aria-live="polite"` region.
- No token value is rendered in either closed or open markup.

Update the root `vitest.config.ts` include globs from `*.test.ts` to
`*.test.{ts,tsx}` so these React markup tests, and the Task 5/7 markup tests,
are actually collected.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- router.test.ts requestGate.test.ts authMarkup.test.tsx
```

Expected: FAIL because the app helpers are missing.

- [ ] **Step 3: Implement router and request gate**

Create `router.ts`:

```ts
export type AdminRoute = "login" | "today" | "restaurants";

export function parseAdminRoute(hash: string): AdminRoute {
  if (hash === "#login") return "login";
  if (hash === "#restaurants") return "restaurants";
  return "today";
}

export function navigate(route: AdminRoute): void {
  window.location.hash = route;
}

export function subscribeRoute(listener: (route: AdminRoute) => void): () => void {
  const handle = () => listener(parseAdminRoute(window.location.hash));
  window.addEventListener("hashchange", handle);
  return () => window.removeEventListener("hashchange", handle);
}
```

Create `requestGate.ts`:

```ts
export function createRequestGate() {
  let generation = 0;
  return {
    begin(): number { generation += 1; return generation; },
    isCurrent(candidate: number): boolean { return candidate === generation; },
    invalidate(): void { generation += 1; }
  };
}
```

- [ ] **Step 4: Build the shell and login/group-entry page**

`AppShell` must render only two navigation buttons/links, an active-group
`<select>`, display name, disconnect action, and a non-navigation
“创建/加入小组” action. Do not render dashboard, history, settings, member,
prototype, or extension links.

Extract `GroupEntryPanel` and reuse it in both `LoginPage` and the authenticated
shell. `LoginPage` receives `AuthViewState` plus callbacks for identity, create
group, join group, switch group, and disconnect. Invite input starts as `""`.
One-time invite code appears in an `aria-live="polite"` region only when
present in the model.

`App.tsx` owns a local open/closed state for the authenticated group-entry
panel. Opening or closing it does not clear identity, group sessions, the
current `activeGroupId`, or current same-group page data. Create/join keeps the
panel open when the controller returns an inline failure; success commits and
switches to the returned group only after its endpoint returns the fresh group
session. A successful create keeps the panel or authenticated banner visible
long enough to surface the one-time invite code from `AuthViewState`.

`App.tsx` owns auth state, route state, and request gate. On successful group
switch, authenticated create, or authenticated join it calls
`requestGate.invalidate()`, clears the previous group's page data, and only
then renders the returned active group. If there is no active group context, it
forces the login/group-entry page.

Replace `main.tsx` with:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 5: Run tests, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/admin test -- router.test.ts requestGate.test.ts authModel.test.ts authMarkup.test.tsx
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
```

Expected: PASS; production bundle contains no `/api/session` literal.

- [ ] **Step 6: Commit Task 3**

```bash
git add vitest.config.ts apps/admin/src/app apps/admin/src/components/AppShell.tsx apps/admin/src/components/GroupEntryPanel.tsx apps/admin/src/components/StatusPanel.tsx apps/admin/src/pages/LoginPage.tsx apps/admin/src/main.tsx apps/admin/tests/authMarkup.test.tsx apps/admin/tests/router.test.ts apps/admin/tests/requestGate.test.ts
git commit -m "feat: add admin multi-group shell"
```

---

### Task 4: Today And Participation Client/Model

**Files:**

- Create: `apps/admin/src/clients/today.ts`
- Create: `apps/admin/src/features/today/todayModel.ts`
- Create: `apps/admin/tests/todayClient.test.ts`
- Create: `apps/admin/tests/todayModel.test.ts`

**Interfaces:**

- Consumes: captured active-group context, shared today/participation contracts, and Task 1 `AdminApiError`.
- Produces: current batch GET, refresh POST, participation GET, `TodayViewState`, participation grouping, strategy rows, and stale-safe view loaders.

- [ ] **Step 1: Write route/header tests**

Create `apps/admin/tests/todayClient.test.ts` asserting this call matrix:

```ts
expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
  ["https://lunch.example/api/groups/group-1/today-recommendations", undefined],
  ["https://lunch.example/api/groups/group-1/today-recommendations/refresh", "POST"],
  ["https://lunch.example/api/groups/group-1/participation/today", undefined]
]);
expect(fetchMock.mock.calls.every(([, init]) =>
  (init?.headers as Record<string, string>).authorization === "Bearer group-session-token"
)).toBe(true);
```

- [ ] **Step 2: Write today model state tests**

Create `apps/admin/tests/todayModel.test.ts`:

```ts
it("turns no_current_batch into a generate state while retaining participation", async () => {
  const state = await loadTodayView(todayDependencies({
    getToday: vi.fn().mockRejectedValue(new AdminApiError({
      kind: "http",
      status: 404,
      code: "no_current_batch"
    }))
  }));
  expect(state).toMatchObject({
    kind: "no-current-batch",
    participation: expect.objectContaining({ groupId: "group-1" })
  });
});

it("groups every active member by participation status", async () => {
  const state = await loadTodayView(todayDependencies());
  expect(state.kind === "ready" && state.participationGroups).toEqual({
    joining: [expect.objectContaining({ membershipId: "membership-1" })],
    decided: [],
    away: [],
    undecided: [expect.objectContaining({ membershipId: "membership-2" })]
  });
});

it("returns session-expired when participation rejects with 401", async () => {
  const state = await loadTodayView(todayDependencies({
    getToday: vi.fn().mockResolvedValue(todayResponse()),
    getParticipation: vi.fn().mockRejectedValue(new AdminApiError({
      kind: "http",
      status: 401,
      code: "invalid_session"
    }))
  }));

  expect(state).toEqual({ kind: "session-expired" });
});

it("returns forbidden when participation reports a removed membership", async () => {
  const state = await loadTodayView(todayDependencies({
    getToday: vi.fn().mockResolvedValue(todayResponse()),
    getParticipation: vi.fn().mockRejectedValue(new AdminApiError({
      kind: "http",
      status: 403,
      code: "removed_member"
    }))
  }));

  expect(state).toEqual({ kind: "forbidden" });
});

it("derives strategy rows only from the returned breakdown", () => {
  expect(buildStrategyRows(todayResponse())).toEqual([
    { key: "weather", label: "天气匹配", value: 20 },
    { key: "weekday", label: "星期匹配", value: 10 },
    { key: "distance", label: "距离", value: 20 },
    { key: "teammate", label: "同事推荐", value: 10 },
    { key: "recent", label: "近期重复", value: -5 },
    { key: "negative", label: "负反馈", value: 0 }
  ]);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- todayClient.test.ts todayModel.test.ts
```

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement today clients**

Create `apps/admin/src/clients/today.ts`:

```ts
export interface AdminGroupContext extends AdminRequestContext {
  groupId: string;
  token: string;
}

export function getToday(context: AdminGroupContext) {
  return requestJson<GroupTodayRecommendationsResponse>(
    GROUP_ROUTES.todayRecommendations(context.groupId),
    context
  );
}

export function refreshToday(context: AdminGroupContext) {
  return requestJson<GroupTodayRecommendationsResponse>(
    GROUP_ROUTES.refreshTodayRecommendations(context.groupId),
    context,
    { method: "POST" }
  );
}

export function getParticipation(context: AdminGroupContext) {
  return requestJson<ParticipationTodayResponse>(
    GROUP_ROUTES.participationToday(context.groupId),
    context
  );
}
```

- [ ] **Step 5: Implement the today view model**

Create `todayModel.ts` with this complete state and load implementation:

```ts
export type TodayViewState =
  | { kind: "loading" }
  | { kind: "no-current-batch"; participation?: ParticipationTodayResponse | undefined }
  | { kind: "empty"; response: GroupTodayRecommendationsResponse; participation?: ParticipationTodayResponse | undefined }
  | { kind: "ready"; response: GroupTodayRecommendationsResponse; participation?: ParticipationTodayResponse | undefined; participationGroups: ParticipationGroups; refreshError?: string | undefined }
  | { kind: "session-expired" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export type ParticipationGroups = Record<
  "joining" | "decided" | "away" | "undecided",
  ParticipationMember[]
>;

export interface TodayDependencies {
  getToday: () => Promise<GroupTodayRecommendationsResponse>;
  refreshToday: () => Promise<GroupTodayRecommendationsResponse>;
  getParticipation: () => Promise<ParticipationTodayResponse>;
}

export function groupParticipation(
  response?: ParticipationTodayResponse
): ParticipationGroups {
  const groups: ParticipationGroups = {
    joining: [],
    decided: [],
    away: [],
    undecided: []
  };
  for (const member of response?.members ?? []) groups[member.status].push(member);
  return groups;
}

export function buildStrategyRows(response: GroupTodayRecommendationsResponse) {
  const first = response.items[0];
  if (!first) return [];
  return [
    { key: "weather", label: "天气匹配", value: first.scoreBreakdown.weatherMatch },
    { key: "weekday", label: "星期匹配", value: first.scoreBreakdown.weekdayMatch },
    { key: "distance", label: "距离", value: first.scoreBreakdown.distance },
    { key: "teammate", label: "同事推荐", value: first.scoreBreakdown.teammateRecommendation },
    { key: "recent", label: "近期重复", value: first.scoreBreakdown.recentDuplicatePenalty },
    { key: "negative", label: "负反馈", value: first.scoreBreakdown.negativeFeedbackPenalty }
  ] as const;
}

function failureState(error: unknown): TodayViewState {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return { kind: "session-expired" };
    if (error.status === 403 && [
      "active_membership_required",
      "removed_member"
    ].includes(error.code ?? "")) return { kind: "forbidden" };
  }
  return { kind: "error", message: "暂时无法加载今日推荐，请重试。" };
}

export async function loadTodayView(
  dependencies: TodayDependencies
): Promise<TodayViewState> {
  const [todayResult, participationResult] = await Promise.allSettled([
    dependencies.getToday(),
    dependencies.getParticipation()
  ]);

  if (participationResult.status === "rejected") {
    const participationFailure = failureState(participationResult.reason);
    if (participationFailure.kind === "session-expired"
      || participationFailure.kind === "forbidden") {
      return participationFailure;
    }
  }

  const participation = participationResult.status === "fulfilled"
    ? participationResult.value
    : undefined;

  if (todayResult.status === "rejected") {
    const error = todayResult.reason;
    if (error instanceof AdminApiError
      && error.status === 404
      && error.code === "no_current_batch") {
      return { kind: "no-current-batch", ...(participation ? { participation } : {}) };
    }
    return failureState(error);
  }

  if (todayResult.value.items.length === 0) {
    return {
      kind: "empty",
      response: todayResult.value,
      ...(participation ? { participation } : {})
    };
  }

  return {
    kind: "ready",
    response: todayResult.value,
    ...(participation ? { participation } : {}),
    participationGroups: groupParticipation(participation)
  };
}

export async function refreshTodayView(
  prior: TodayViewState,
  dependencies: TodayDependencies
): Promise<TodayViewState> {
  try {
    const response = await dependencies.refreshToday();
    let participation: ParticipationTodayResponse | undefined;
    try {
      participation = await dependencies.getParticipation();
    } catch (error) {
      const participationFailure = failureState(error);
      if (participationFailure.kind === "session-expired"
        || participationFailure.kind === "forbidden") {
        return participationFailure;
      }
    }
    if (response.items.length === 0) {
      return { kind: "empty", response, ...(participation ? { participation } : {}) };
    }
    return {
      kind: "ready",
      response,
      ...(participation ? { participation } : {}),
      participationGroups: groupParticipation(participation)
    };
  } catch (error) {
    if (prior.kind === "ready") {
      return { ...prior, refreshError: "重新生成失败，仍显示上一批结果。" };
    }
    return failureState(error);
  }
}
```

Import `ParticipationMember`, `ParticipationTodayResponse`, and `GroupTodayRecommendationsResponse` from `@lunch/shared` plus `AdminApiError` from `../../api`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @lunch/admin test -- todayClient.test.ts todayModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/admin/src/clients/today.ts apps/admin/src/features/today/todayModel.ts apps/admin/tests/todayClient.test.ts apps/admin/tests/todayModel.test.ts
git commit -m "feat: model admin today recommendations"
```

---

### Task 5: Prototype-Aligned Today Page

**Files:**

- Create: `apps/admin/src/pages/TodayPage.tsx`
- Create: `apps/admin/tests/todayMarkup.test.tsx`
- Modify: `apps/admin/src/app/App.tsx`
- Modify: `apps/admin/src/styles.css`

**Interfaces:**

- Consumes: Task 4 `TodayViewState` and view helpers, Task 3 request gate, and active group context.
- Produces: real today page with generate, refresh, weather, strategy, cards, breakdown, participation groups, and explicit failure states.

- [ ] **Step 1: Write server-rendered markup assertions**

Create `apps/admin/tests/todayMarkup.test.tsx` using `renderToStaticMarkup` from `react-dom/server`:

```tsx
it("renders only real batch and participation values", () => {
  const html = renderToStaticMarkup(
    <TodayPage
      state={readyTodayState()}
      onGenerate={vi.fn()}
      onRefresh={vi.fn()}
      onOpenRestaurants={vi.fn()}
    />
  );
  expect(html).toContain("当前批次 #2");
  expect(html).toContain("巷口砂锅");
  expect(html).toContain("天气匹配");
  expect(html).toContain("小林");
  expect(html).not.toContain("#046");
  expect(html).not.toContain("张三、李雷");
});

it("renders generation instead of an error for no current batch", () => {
  const html = renderToStaticMarkup(
    <TodayPage
      state={{ kind: "no-current-batch" }}
      onGenerate={vi.fn()}
      onRefresh={vi.fn()}
      onOpenRestaurants={vi.fn()}
    />
  );
  expect(html).toContain("生成今日推荐");
  expect(html).not.toContain("加载失败");
});
```

- [ ] **Step 2: Run the markup test and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- todayMarkup.test.tsx
```

Expected: FAIL because `TodayPage` is missing.

- [ ] **Step 3: Implement the today page**

`TodayPage.tsx` accepts the props used by the tests. Render:

- Page heading and refresh/generate action.
- Weather panel with `weatherUnavailable` copy when needed.
- Strategy panel from `buildStrategyRows`.
- Batch label using returned `batchNo` and locale-formatted `generatedAt`.
- Recommendation cards with name, dish, real reason, score, and every score component.
- Participation columns for joining, decided, away, and undecided.
- Empty state linking to restaurants.
- Session-expired, forbidden, generic error, and retry panels.

Disable refresh/generate while its promise is pending. Ask for `window.confirm("重新生成会创建一个新的当前批次，确定继续吗？")` before refresh.

- [ ] **Step 4: Wire stale-safe loading in App**

When route or active group changes:

```tsx
useEffect(() => {
  if (route !== "today" || !groupContext) return;
  const request = requestGate.begin();
  setTodayState({ kind: "loading" });
  void loadTodayView(todayDependencies(groupContext)).then((next) => {
    if (requestGate.isCurrent(request)) setTodayState(next);
  });
}, [route, groupContext?.groupId, groupContext?.token]);
```

On session-expired, clear only that group's session and return to group selection. On membership-level forbidden, sync groups and return to selection. Operation-level permission errors stay inside the page.

- [ ] **Step 5: Add today-specific styles**

Add these exact today-page rules to `styles.css`; do not copy the prototype's archive/history selectors:

```css
.snapshot-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 14px; margin-bottom: 18px; }
.panel { padding: 18px; border: 1px solid #e5d9cb; border-radius: 16px; background: #fffdf9; }
.weather-snapshot { display: flex; gap: 14px; align-items: center; min-height: 74px; }
.weather-temperature { color: #29241f; font-size: 28px; font-weight: 750; }
.strategy-list { display: grid; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; }
.strategy-row { display: grid; grid-template-columns: 88px 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
.batch-heading { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 18px 0 12px; }
.result-list { display: grid; gap: 12px; }
.result-card { padding: 16px; border: 1px solid #e5d9cb; border-radius: 16px; background: #fffdf9; }
.result-header { display: flex; gap: 12px; align-items: flex-start; }
.score-value { margin-left: auto; color: #923914; font-size: 26px; font-weight: 800; }
.breakdown-grid { display: grid; grid-template-columns: 1fr auto; gap: 7px 14px; margin-top: 12px; padding: 12px; border-radius: 12px; background: #faf5ed; }
.participation-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
.participation-column { min-height: 120px; padding: 14px; border: 1px solid #e5d9cb; border-radius: 14px; background: #fffdf9; }
.member-chip { display: block; margin-top: 7px; padding: 7px 9px; border-radius: 999px; background: #f2eadf; font-size: 12px; }
.empty-state { display: grid; justify-items: center; gap: 12px; padding: 44px 20px; border: 1px dashed #d9c8b6; border-radius: 16px; text-align: center; background: #fffdf9; }
@media (max-width: 980px) {
  .snapshot-grid { grid-template-columns: 1fr; }
  .participation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .participation-grid { grid-template-columns: 1fr; }
  .strategy-row { grid-template-columns: 1fr auto; }
  .strategy-row > :first-child { grid-column: 1 / -1; }
}
```

- [ ] **Step 6: Run today tests, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/admin test -- todayClient.test.ts todayModel.test.ts todayMarkup.test.tsx requestGate.test.ts
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/admin/src/pages/TodayPage.tsx apps/admin/src/app/App.tsx apps/admin/src/styles.css apps/admin/tests/todayMarkup.test.tsx
git commit -m "feat: rebuild admin today page"
```

---

### Task 6: Restaurant Client, Filtering, Permissions, And Two-Step Create

**Files:**

- Create: `apps/admin/src/clients/restaurants.ts`
- Create: `apps/admin/src/features/restaurants/restaurantModel.ts`
- Create: `apps/admin/tests/restaurantClient.test.ts`
- Create: `apps/admin/tests/restaurantModel.test.ts`

**Interfaces:**

- Consumes: captured group context and shared restaurant/recommendation contracts.
- Produces: list/create/patch client calls, filtering, duplicate detection, permission derivation, and two-step create/retry state.

- [ ] **Step 1: Write restaurant route tests**

Create `apps/admin/tests/restaurantClient.test.ts` and assert:

```ts
expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
  ["https://lunch.example/api/groups/group-1/restaurants", undefined],
  ["https://lunch.example/api/groups/group-1/restaurants", "POST"],
  ["https://lunch.example/api/groups/group-1/restaurants/restaurant-1", "PATCH"],
  ["https://lunch.example/api/groups/group-1/recommendations", "POST"],
  ["https://lunch.example/api/groups/group-1/recommendations/recommendation-1", "PATCH"]
]);
```

Verify every call uses the captured group session and never reads global session state during the request.

- [ ] **Step 2: Write filtering, duplicate, permission, and recovery tests**

Create `apps/admin/tests/restaurantModel.test.ts`:

```ts
it("filters by normalized search, cuisine, and status", () => {
  expect(filterRestaurants(restaurants, {
    query: "A楼",
    cuisine: "砂锅",
    status: "active"
  })).toEqual([expect.objectContaining({ id: "restaurant-1" })]);
});

it("warns on normalized same name and area without blocking", () => {
  expect(findDuplicateRestaurant(restaurants, {
    name: " 巷口砂锅 ",
    area: "a 楼底商"
  })).toMatchObject({ id: "restaurant-1" });
});

it("derives member and admin controls from role and ownership", () => {
  expect(restaurantPermissions(memberGroup, ownedRestaurant)).toEqual({
    canEdit: true,
    canManageStatus: false
  });
  expect(restaurantPermissions(memberGroup, otherRestaurant)).toEqual({
    canEdit: false,
    canManageStatus: false
  });
  expect(restaurantPermissions(adminGroup, otherRestaurant)).toEqual({
    canEdit: true,
    canManageStatus: true
  });
});

it("retries only recommendation creation after partial success", async () => {
  const createRestaurant = vi.fn().mockResolvedValue({ restaurant: { id: "restaurant-new" } });
  const createRecommendation = vi.fn()
    .mockRejectedValueOnce(new Error("recommendation failed"))
    .mockResolvedValueOnce({ recommendation: { id: "recommendation-new" } });
  const controller = createRestaurantEntryController({ createRestaurant, createRecommendation });

  await controller.submit(createEntryInput);
  await controller.retryRecommendation();

  expect(createRestaurant).toHaveBeenCalledTimes(1);
  expect(createRecommendation).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- restaurantClient.test.ts restaurantModel.test.ts
```

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement restaurant/recommendation clients**

Create `apps/admin/src/clients/restaurants.ts`:

```ts
import {
  GROUP_ROUTES,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type PatchRecommendationRequest,
  type PatchRestaurantRequest,
  type RecommendationMutationResponse,
  type RestaurantListResponse,
  type RestaurantMutationResponse
} from "@lunch/shared";
import { requestJson } from "../api";
import type { AdminGroupContext } from "./today";

export function listRestaurants(context: AdminGroupContext) {
  return requestJson<RestaurantListResponse>(
    GROUP_ROUTES.restaurants(context.groupId),
    context
  );
}

export function createRestaurant(
  context: AdminGroupContext,
  input: CreateRestaurantRequest
) {
  return requestJson<RestaurantMutationResponse>(
    GROUP_ROUTES.restaurants(context.groupId),
    context,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function patchRestaurant(
  context: AdminGroupContext,
  restaurantId: string,
  input: PatchRestaurantRequest
) {
  return requestJson<RestaurantMutationResponse>(
    GROUP_ROUTES.restaurant(context.groupId, restaurantId),
    context,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export function createRecommendation(
  context: AdminGroupContext,
  input: CreateRecommendationRequest
) {
  return requestJson<RecommendationMutationResponse>(
    GROUP_ROUTES.recommendations(context.groupId),
    context,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function patchRecommendation(
  context: AdminGroupContext,
  recommendationId: string,
  input: PatchRecommendationRequest
) {
  return requestJson<RecommendationMutationResponse>(
    GROUP_ROUTES.recommendation(context.groupId, recommendationId),
    context,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}
```

- [ ] **Step 5: Implement restaurant models and two-step controller**

Create `restaurantModel.ts` with the following pure helpers and controller:

```ts
import type {
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  GroupSummary,
  RecommendationMutationResponse,
  RecommendationSummary,
  RestaurantMutationResponse,
  RestaurantStatus,
  RestaurantSummary,
  WeatherTag,
  WeekdayTag
} from "@lunch/shared";

export interface RestaurantFilter {
  query: string;
  cuisine: string;
  status: "all" | RestaurantStatus;
}

export function normalizeRestaurantText(value?: string): string {
  return (value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}

export function filterRestaurants(
  restaurants: RestaurantSummary[],
  filter: RestaurantFilter
): RestaurantSummary[] {
  const query = normalizeRestaurantText(filter.query);
  return restaurants.filter((restaurant) => {
    const searchable = [
      restaurant.name,
      restaurant.area,
      restaurant.cuisine,
      ...restaurant.recommendations.flatMap((recommendation) => [
        recommendation.dish,
        recommendation.reason
      ])
    ].map(normalizeRestaurantText).join("|");
    return (!query || searchable.includes(query))
      && (!filter.cuisine || restaurant.cuisine === filter.cuisine)
      && (filter.status === "all" || restaurant.status === filter.status);
  });
}

export function findDuplicateRestaurant(
  restaurants: RestaurantSummary[],
  input: { name: string; area?: string | undefined }
): RestaurantSummary | undefined {
  const name = normalizeRestaurantText(input.name);
  const area = normalizeRestaurantText(input.area);
  return restaurants.find((restaurant) =>
    normalizeRestaurantText(restaurant.name) === name
    && normalizeRestaurantText(restaurant.area) === area
  );
}

export function restaurantPermissions(group: GroupSummary, restaurant: RestaurantSummary) {
  return {
    canEdit: group.role === "admin"
      || restaurant.createdByMembershipId === group.membershipId,
    canManageStatus: group.role === "admin"
  };
}

export function recommendationPermissions(
  group: GroupSummary,
  recommendation: RecommendationSummary
) {
  return {
    canEdit: group.role === "admin"
      || recommendation.createdByMembershipId === group.membershipId
  };
}

export interface CreateRestaurantEntryInput {
  restaurant: CreateRestaurantRequest;
  dish: string;
  reason: string;
  weatherTags: WeatherTag[];
  weekdayTags: WeekdayTag[];
  moodTags: string[];
}

export type RestaurantEntryState =
  | { kind: "idle" }
  | { kind: "submitting-restaurant" }
  | { kind: "submitting-recommendation"; restaurantId: string }
  | { kind: "restaurant-error"; message: string }
  | { kind: "recommendation-error"; restaurantId: string; message: string }
  | { kind: "complete"; restaurantId: string };

export function createRestaurantEntryController(dependencies: {
  createRestaurant: (input: CreateRestaurantRequest) => Promise<RestaurantMutationResponse>;
  createRecommendation: (input: CreateRecommendationRequest) => Promise<RecommendationMutationResponse>;
}) {
  let state: RestaurantEntryState = { kind: "idle" };
  let pendingRecommendation: CreateRecommendationRequest | null = null;

  async function saveRecommendation(input: CreateRecommendationRequest) {
    state = { kind: "submitting-recommendation", restaurantId: input.restaurantId };
    try {
      await dependencies.createRecommendation(input);
      pendingRecommendation = null;
      state = { kind: "complete", restaurantId: input.restaurantId };
    } catch {
      pendingRecommendation = input;
      state = {
        kind: "recommendation-error",
        restaurantId: input.restaurantId,
        message: "餐厅已保存，推荐尚未保存。"
      };
    }
    return state;
  }

  async function submit(input: CreateRestaurantEntryInput) {
    state = { kind: "submitting-restaurant" };
    pendingRecommendation = null;
    try {
      const response = await dependencies.createRestaurant(input.restaurant);
      return saveRecommendation({
        restaurantId: response.restaurant.id,
        dish: input.dish.trim(),
        reason: input.reason.trim(),
        weatherTags: input.weatherTags,
        weekdayTags: input.weekdayTags,
        moodTags: input.moodTags
      });
    } catch {
      state = { kind: "restaurant-error", message: "餐厅没有保存，请重试。" };
      return state;
    }
  }

  async function retryRecommendation() {
    if (!pendingRecommendation) throw new Error("restaurant_entry_retry_unavailable");
    return saveRecommendation(pendingRecommendation);
  }

  return { submit, retryRecommendation, getState: () => state };
}
```

The UI duplicate decision remains outside the controller: the form asks confirmation with the matched restaurant name and area, then calls `submit` only after confirmation.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @lunch/admin test -- restaurantClient.test.ts restaurantModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add apps/admin/src/clients/restaurants.ts apps/admin/src/features/restaurants/restaurantModel.ts apps/admin/tests/restaurantClient.test.ts apps/admin/tests/restaurantModel.test.ts
git commit -m "feat: model admin restaurant library"
```

---

### Task 7: Prototype-Aligned Restaurant Library And Accessible Modal

**Files:**

- Create: `apps/admin/src/components/Modal.tsx`
- Create: `apps/admin/src/pages/RestaurantsPage.tsx`
- Create: `apps/admin/tests/restaurantMarkup.test.tsx`
- Modify: `apps/admin/src/app/App.tsx`
- Modify: `apps/admin/src/styles.css`

**Interfaces:**

- Consumes: Task 6 models/clients, current group summary, and Task 3 request gate.
- Produces: real restaurant table/cards, filters, create/edit/recommendation modal, partial-success recovery, and role-aware status controls.

- [ ] **Step 1: Write server-rendered permission and empty-state tests**

Create `apps/admin/tests/restaurantMarkup.test.tsx`:

```tsx
it("hides status governance from a member but keeps owned edit", () => {
  const html = renderToStaticMarkup(
    <RestaurantsPage {...restaurantPageProps({ group: memberGroup })} />
  );
  expect(html).toContain("编辑餐厅");
  expect(html).not.toContain("暂停餐厅");
  expect(html).not.toContain("设为避雷");
});

it("shows admin status governance and real empty copy", () => {
  const html = renderToStaticMarkup(
    <RestaurantsPage {...restaurantPageProps({ group: adminGroup, restaurants: [] })} />
  );
  expect(html).toContain("先添加 5–10 家常去餐厅");
  expect(html).toContain("新增餐厅");
});
```

- [ ] **Step 2: Run markup test and verify failure**

Run:

```bash
pnpm --filter @lunch/admin test -- restaurantMarkup.test.tsx
```

Expected: FAIL because the page and modal are missing.

- [ ] **Step 3: Implement the accessible modal**

Create `apps/admin/src/components/Modal.tsx`:

```tsx
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal(props: {
  open: boolean;
  title: string;
  pending?: boolean | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(
      "[data-autofocus], input, select, textarea, button"
    );
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.pending) props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [props.open, props.pending, props.onClose]);

  if (!props.open) return null;
  return (
    <div className="overlay">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <h2 id={titleId}>{props.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            disabled={props.pending}
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement restaurant page rendering and forms**

`RestaurantsPage` receives loaded restaurants, group summary, filter state, pending/error state, and callbacks. Render:

- Search input, cuisine select, and segmented status filter.
- Count summary from filtered real rows.
- Responsive table with restaurant, area, cuisine, price, distance, recommendation count, status, and permitted actions.
- Empty state with “先添加 5–10 家常去餐厅”.
- Create/edit modal with restaurant fields matching shared requests.
- Required first-recommendation fields for create.
- Recommendation-only modal for adding/editing recommendation.
- Admin-only pause/restore/block buttons.

Before create, call `findDuplicateRestaurant`; confirm with the real matched name/area. For partial success, keep recommendation fields and show “餐厅已保存，推荐尚未保存” plus retry-recommendation action.

- [ ] **Step 5: Wire stale-safe loading and operation errors**

Use a new request generation for each load. On group switch, clear restaurant state before the new request. A membership-level 401/403 returns to group selection; `restaurant_owner_required`, `recommendation_owner_required`, and `admin_membership_required` stay as inline operation errors and do not disconnect.

- [ ] **Step 6: Add restaurant and modal styles**

Add explicit `.toolbar`, `.search-field`, `.segment`, `.table-wrap`, `.restaurant-table`, `.status-badge`, `.row-actions`, `.overlay`, `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`, `.form-grid`, `.tag-picker`, `.partial-success`, and mobile card/table fallback styles to `styles.css`.

Use a maximum modal width of 680px, sticky footer inside the scrolling modal, visible focus outlines, and the prototype's warm semantic status colors.

- [ ] **Step 7: Run restaurant tests, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/admin test -- restaurantClient.test.ts restaurantModel.test.ts restaurantMarkup.test.tsx requestGate.test.ts
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add apps/admin/src/components/Modal.tsx apps/admin/src/pages/RestaurantsPage.tsx apps/admin/src/app/App.tsx apps/admin/src/styles.css apps/admin/tests/restaurantMarkup.test.tsx
git commit -m "feat: rebuild admin restaurant library"
```

---

### Task 8: Final Visual System, Auth Recovery, And Stage 4 Integration

**Files:**

- Modify: `apps/admin/src/app/App.tsx`
- Modify: `apps/admin/src/components/AppShell.tsx`
- Modify: `apps/admin/src/components/StatusPanel.tsx`
- Modify: `apps/admin/src/pages/LoginPage.tsx`
- Modify: `apps/admin/src/pages/TodayPage.tsx`
- Modify: `apps/admin/src/pages/RestaurantsPage.tsx`
- Modify: `apps/admin/src/styles.css`
- Modify: `apps/admin/tests/authModel.test.ts`
- Modify: `apps/admin/tests/requestGate.test.ts`

**Interfaces:**

- Consumes: all prior Stage 4B tasks.
- Produces: complete production state mapping, warm prototype visual system, narrow-screen layout, and consistent group switch/recovery across pages.

- [ ] **Step 1: Add membership-level versus operation-level error tests**

Add to `authModel.test.ts`:

```ts
it.each(["active_membership_required", "removed_member"])(
  "exits the active group for membership error %s",
  async (code) => {
    const clearGroupSession = vi.fn();
    const controller = createAuthController(authDependencies({ clearGroupSession }));
    await controller.handleGroupError(new AdminApiError({
      kind: "http",
      status: 403,
      code
    }), "group-1");
    expect(clearGroupSession).toHaveBeenCalledWith("group-1");
  }
);

it("keeps the session for an operation permission error", async () => {
  const clearGroupSession = vi.fn();
  const controller = createAuthController(authDependencies({ clearGroupSession }));
  await controller.handleGroupError(new AdminApiError({
    kind: "http",
    status: 403,
    code: "restaurant_owner_required"
  }), "group-1");
  expect(clearGroupSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run auth tests and verify PASS**

Run:

```bash
pnpm --filter @lunch/admin test -- authModel.test.ts requestGate.test.ts
```

Expected: PASS because Task 2 established the classifier; these tests lock the full recovery matrix before the integration edits.

- [ ] **Step 3: Implement consistent recovery and stale-data clearing**

Use the Task 2 `isMembershipInvalid` classifier in App. App clears page state and invalidates its request gate on successful group switch, authenticated group create/join, disconnect, membership invalidation, and route exit. It retains same-group data on refresh network/5xx failure and adds a refresh-error banner.

- [ ] **Step 4: Replace the legacy stylesheet with production tokens and responsive shell**

At the start of `styles.css`, use these tokens:

```css
:root {
  color-scheme: light;
  --paper: #f4efe7;
  --surface: #fffdf9;
  --surface-2: #faf5ed;
  --surface-3: #f2eadf;
  --fg: #433c35;
  --fg-strong: #29241f;
  --muted: #7d746b;
  --border: #e5d9cb;
  --accent: #e86f3d;
  --accent-ink: #923914;
  --accent-soft: #fde5d6;
  --rain: #4d718f;
  --rain-soft: #e9f2f8;
  --want: #4f8a64;
  --want-soft: #e8f3eb;
  --paused: #9a6b22;
  --paused-soft: #f7edd8;
  --blocked: #a9473d;
  --blocked-soft: #f8e5e2;
  --shadow: 0 18px 60px rgb(67 45 28 / 10%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; color: var(--fg); background: var(--paper); }
button, input, select, textarea { font: inherit; }
.admin-shell { min-height: 100vh; display: grid; grid-template-columns: 244px minmax(0, 1fr); }
.sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; padding: 20px 14px; border-right: 1px solid var(--border); background: var(--surface); }
.main-column { min-width: 0; }
.topbar { min-height: 70px; display: flex; gap: 16px; align-items: center; padding: 12px 28px; border-bottom: 1px solid var(--border); background: rgb(255 253 249 / 90%); }
.content { width: min(1180px, 100%); margin: 0 auto; padding: 28px; }
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 28px 20px; }
.login-card { width: min(460px, 100%); padding: 26px; border: 1px solid var(--border); border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); }
.button { min-height: 40px; padding: 0 15px; border: 0; border-radius: 10px; cursor: pointer; font-weight: 750; }
.button.primary { color: white; background: var(--accent); }
.button.secondary { color: var(--accent-ink); background: var(--accent-soft); }
.button.ghost { color: var(--fg); background: var(--surface-2); }
.button.danger { color: white; background: var(--blocked); }
.button:disabled { cursor: wait; opacity: .58; }
input, select, textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; color: var(--fg-strong); background: white; }
:focus-visible { outline: 3px solid rgb(232 111 61 / 25%); outline-offset: 2px; }
@media (max-width: 820px) {
  .admin-shell { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; flex-direction: row; align-items: center; overflow-x: auto; }
  .topbar { align-items: stretch; flex-direction: column; padding: 14px 16px; }
  .content { padding: 18px 16px 48px; }
}
```

Delete every legacy `.page` form style and every unused prototype history/dashboard/settings selector. Keep page-specific selectors introduced in Tasks 5 and 7.

- [ ] **Step 5: Run all Admin checks**

Run:

```bash
pnpm --filter @lunch/admin test
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
rg -n '/api/session([^[:alnum:]_/-]|$)|/api/restaurants([^[:alnum:]_/-]|$)|/api/recommendations([^[:alnum:]_/-]|$)|Demo 同事|#046|张三、李雷|data-od-|admin-dashboard|admin-history|admin-members|admin-settings|#dashboard|#history|#members|#settings' apps/admin/src apps/admin/dist
```

Expected: tests, typecheck, and build PASS; the final `rg` returns no production matches.

- [ ] **Step 6: Commit Task 8**

```bash
git add apps/admin/src apps/admin/tests
git commit -m "feat: harden admin prototype states"
```

---

### Task 9: Admin QA, Full Stage 4 Regression, And Roadmap Handoff

**Files:**

- Modify: `README.md`
- Create: `qa/2026-07-10-admin-prototype-ui-wiring-stage4b.md`
- Modify: `roadmap.md`

**Interfaces:**

- Consumes: completed Stage 4A and Stage 4B implementation plus a local real server/database.
- Produces: Admin usage docs, actual QA evidence, full repository verification, and final Stage 4 roadmap status.

- [ ] **Step 1: Update local Admin instructions**

In `README.md`, replace the legacy invite-login instructions with:

1. Start shared/server/Admin using the existing pnpm scripts.
2. Enter a display name to create a lightweight identity.
3. Create a group or join with a real invite code.
4. Select the active group.
5. Use Today and Restaurants; no raw token or `TEAM_INVITE_CODE` is embedded.

Keep Railway static Admin hosting explicitly deferred to Stage 6.

- [ ] **Step 2: Run focused and root automated verification**

Run:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/server test
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
pnpm --filter @lunch/admin test
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
pnpm test
pnpm typecheck
pnpm build
```

Expected: every command PASS.

- [ ] **Step 3: Perform browser validation with two identities and two groups**

Execute and record a result plus evidence for each case:

- First identity creation, group creation, one-time invite display, and second identity join.
- Authenticated “创建/加入小组” panel, create-another-group invite display, join-another-group success, and create/join failure preserving the prior active group.
- Returning identity group list and fresh-session group switch.
- Failed switch preserving the previous active group.
- Group A slow today/restaurant responses never appearing after switching to Group B.
- No-current-batch generate and manual refresh confirmation.
- Weather available/unavailable, complete score breakdown, and all participation groups.
- Empty restaurant library, search, cuisine/status filters, duplicate warning, and two-step create partial recovery.
- Member-owned versus other-owned edit controls.
- Admin pause/restore/block controls and member read-only status.
- Identity-token expiry, group-session expiry, removed membership, and operation-level 403.
- Desktop and narrow-screen layout.
- No dashboard/history/members/settings links or static prototype data.

Optional Railway dev API smoke (supplemental to, not a replacement for, the
local mutation/error-state QA): run the local Admin build/dev server with
`VITE_API_BASE_URL=https://lunchserver-production.up.railway.app` and verify
identity creation, group create/join/list/switch, Today, and Restaurants
against the Railway dev API. Record whether this optional smoke was run. Do not
mark Admin static hosting complete; it remains Stage 6 work.

- [ ] **Step 4: Write the Stage 4B QA report with captured evidence**

Create `qa/2026-07-10-admin-prototype-ui-wiring-stage4b.md`. Include the tested commit, browser version, server URL, database fixture description, each command/result, every manual state/result, screenshots or notes available in the workspace, and observed known issues. Do not claim an unexecuted state passed. If the optional Railway dev API smoke was run, record it separately from local Admin hosting and keep Stage 6 static-hosting status unchanged.

- [ ] **Step 5: Update roadmap only after both QA reports pass**

When Stage 4A and Stage 4B acceptance criteria are satisfied, update `roadmap.md`:

- Stage 4 status becomes `Done`.
- Detailed Plan links both Stage 4A and Stage 4B plan files.
- Stage 4 expected scope notes the completed quick-add and explicit deferral of history/dashboard/settings.
- Progress tracker marks Stage 4 detailed plan and implementation verified.
- Stage 5 status becomes `Ready for Planning`.

If either QA report has an unresolved acceptance failure, keep Stage 4 `In Progress` and list the failing state in the handoff.

- [ ] **Step 6: Commit Task 9**

```bash
git add README.md roadmap.md qa/2026-07-10-admin-prototype-ui-wiring-stage4b.md
git commit -m "docs: complete stage 4 prototype wiring"
```

## Stage 4B Completion Gate

Spec coverage map:

| Design requirement | Implementing tasks |
| --- | --- |
| Versioned explicit identity/group session state | Tasks 1-2 |
| Product-facing first-time/authenticated create/join/list/switch and login recovery | Tasks 2-3 and 8 |
| Hash routing and Stage 4-only shell | Task 3 |
| Today batch, weather, strategy, breakdown, participation, generate/refresh | Tasks 4-5 |
| Restaurant filtering, duplicate warning, create/edit/recommendations/status | Tasks 6-7 |
| Ownership/role permissions and partial-success recovery | Tasks 6-8 |
| Cross-group stale-response protection | Tasks 3, 5, 7, and 8 |
| Prototype visuals, accessibility, browser QA, full Stage 4 handoff | Tasks 3, 5, 7, 8, and 9 |

Before marking Stage 4 complete, confirm:

- Admin production UI contains no legacy session/login calls or static prototype values.
- Returning identities can list and safely switch active groups.
- Authenticated users can open create/join entry; failure preserves the prior active group and successful create surfaces its one-time invite code.
- Today and restaurant requests capture group/token context and stale Group A results cannot commit into Group B.
- Today no-batch, ready, refresh, empty, participation, session-expired, forbidden, and retry states are verified.
- Restaurant filtering, duplicate warning, permissions, status governance, recommendation ownership, and partial-success retry are verified.
- Navigation exposes only Stage 4 pages.
- Stage 4A remains green after Stage 4B.
- Shared, server, extension, Admin, and root tests/typechecks/builds pass.
- Both QA reports contain actual evidence.
- Roadmap status matches the actual verified outcome.
