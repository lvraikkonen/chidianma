# Extension Prototype UI Wiring Stage 4A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Chrome extension's popup, detail, quick-add, and settings surfaces in the approved prototype style while connecting every production state to the Stage 1-3 multi-group APIs and current-group storage.

**Architecture:** Keep the Manifest V3 extension in native TypeScript and DOM APIs. Put HTTP classification, group connection, storage mutation, popup state, recommendation view models, and quick-add orchestration in testable modules; keep `popup.ts`, `detail.ts`, and `options.ts` limited to rendering and event binding.

**Tech Stack:** TypeScript 5.7, pnpm workspaces, Vite 6, Vitest 2, Chrome Manifest V3, native DOM APIs, `chrome.storage`, Web Locks, `chrome.alarms`, `@lunch/shared` contracts.

**Status:** Review Requested

## Global Constraints

- Source design: `specs/2026-07-10-prototype-ui-wiring-stage4-design.md`.
- Roadmap stage: `roadmap.md` Stage 4A, Extension Prototype UI Wiring.
- Stage 1, Stage 2, and Stage 3 are completed prerequisites.
- Use existing Stage 1-3 API routes; do not add a database model, migration, server route, or lunch-loop semantic.
- New production extension UI uses multi-group identity and group-session APIs; raw identity and group-session token inputs are removed.
- Preserve existing legacy API helpers and regression tests unless a task explicitly changes only which helper the new UI calls.
- All `/api/groups/:groupId/*` requests use `Authorization: Bearer <groupSessionToken>`.
- Identity and group listing/session requests use the signed `identityToken` where required.
- Never render, log, or include tokens in errors.
- Every partial `lunchState` write uses `updateStorageState` under the Web Locks exclusive lock `lunch-extension-storage-state` and rereads state only after acquiring the lock.
- `saveStorageState` remains reserved for full-state replacement.
- Group sessions, summaries, reminder overrides, and recommendation caches stay bucketed by `groupId`.
- Cache fallback reads only `lastRecommendationsByGroupId[activeGroupId]` and validates the stored response `groupId`.
- Cached recommendations are visibly marked and read-only until a fresh response succeeds.
- Active group changes only after a fresh session for the requested group succeeds.
- Changing API host clears host-specific identity, read token, active group, sessions, group summaries, caches, and group reminder overrides while preserving global reminder defaults.
- The extension remains framework-free and uses safe DOM node creation plus `textContent`; do not use `innerHTML` for server data.
- Chrome long-term scheduling continues to use `chrome.alarms`, not `setTimeout` or `setInterval`.
- Extension tests must not import side-effectful `background.ts`.
- Manifest permissions remain `alarms`, `notifications`, `storage`, and specific API hosts; do not add clipboard or broad host permissions.
- `apps/extension/dist/manifest.json` must still be emitted by the build.
- Port the production visual language from `demo-design/`, but exclude the faux Chrome toolbar, prototype navigation, review metadata, static people/restaurants/weather, history, and other Stage 5 surfaces.

---

## Scope

In scope:

- Structured extension HTTP/network errors.
- Product-facing lightweight identity creation.
- Group creation, invite joining, listing, session refresh, and switching.
- One-time invite-code display after group creation.
- Group-local reminder overrides and safe API-host replacement.
- Popup states: disconnected, loading, no current batch, ready, cached, empty, session expired, forbidden/removed, and network error.
- Popup current-member participation state and summary refresh.
- Popup detail with score breakdown, feedback, and decision.
- Quick-add restaurant plus first recommendation with partial-success recovery.
- Standalone detail page as notification-click fallback.
- Prototype-aligned production HTML/CSS.
- Automated tests, typecheck, build, manifest verification, and a manual Chrome QA report.

Out of scope:

- Extension history.
- Admin UI.
- Dashboard, members, settings/weights API, or recommendation history.
- New server or database behavior.
- New Chrome permissions.

## File Structure

- Create: `apps/extension/src/apiClient.ts`
  - Parse JSON responses and expose structured HTTP/network error classification.
- Create: `apps/extension/src/groupClient.ts`
  - Call identity, group, session, restaurant, and recommendation APIs with explicit captured contexts.
- Modify: `apps/extension/src/storage.ts`
  - Add display-name and connection mutation helpers while preserving the existing storage lock.
- Modify: `apps/extension/src/recommendationClient.ts`
  - Reuse the structured client and return typed participation responses.
- Modify: `apps/extension/src/optionsController.ts`
  - Own options connection, group switch, API-host change, and reminder state transitions.
- Modify: `apps/extension/src/options.ts`
  - Bind the product-facing options DOM to the controller.
- Modify: `apps/extension/options.html`
  - Replace raw-token fields with identity, create/join, group selection, reminder, and advanced connection sections.
- Modify: `apps/extension/styles/options.css`
  - Port the production settings visual system.
- Create: `apps/extension/src/popupController.ts`
  - Load and classify popup state without touching DOM.
- Create: `apps/extension/src/recommendationViewModel.ts`
  - Convert shared response items into safe display models for popup and detail.
- Modify: `apps/extension/src/popup.ts`
  - Render state and bind popup actions.
- Modify: `apps/extension/index.html`
  - Add production popup regions and templates.
- Modify: `apps/extension/styles/popup.css`
  - Port the production popup/card/detail styles.
- Create: `apps/extension/src/quickAddController.ts`
  - Orchestrate the two-step restaurant/recommendation create flow.
- Create: `apps/extension/src/detailController.ts`
  - Load expanded recommendation state and optional restaurant focus.
- Modify: `apps/extension/src/detail.ts`
  - Render standalone detail states.
- Modify: `apps/extension/detail.html`
  - Provide the production detail shell.
- Modify: `apps/extension/styles/detail.css`
  - Port expanded-card and fallback-page styles.
- Verify unchanged behavior: `apps/extension/src/background.ts`
  - Keep `chrome.action.openPopup()` first and the fallback URL exactly `detail.html`; optional focus is handled by the detail page query itself.
- Create: `apps/extension/tests/apiClient.test.ts`
- Create: `apps/extension/tests/groupClient.test.ts`
- Create: `apps/extension/tests/popupController.test.ts`
- Create: `apps/extension/tests/recommendationViewModel.test.ts`
- Create: `apps/extension/tests/quickAddController.test.ts`
- Create: `apps/extension/tests/detailController.test.ts`
- Modify: `apps/extension/tests/storage.test.ts`
- Modify: `apps/extension/tests/recommendationClient.test.ts`
- Modify: `apps/extension/tests/optionsController.test.ts`
- Create: `qa/2026-07-10-extension-prototype-ui-wiring-stage4a.md`
- Modify: `apps/extension/README.md`

---

### Task 1: Structured HTTP Errors And Participation Client

**Files:**

- Create: `apps/extension/src/apiClient.ts`
- Modify: `apps/extension/src/recommendationClient.ts`
- Create: `apps/extension/tests/apiClient.test.ts`
- Modify: `apps/extension/tests/recommendationClient.test.ts`

**Interfaces:**

- Consumes: browser `fetch`, `ApiErrorResponse`, existing `GROUP_ROUTES`, and the existing captured active-group context.
- Produces:
  - `ExtensionApiError`
  - `requestJson<T>(input, init): Promise<T>`
  - `isServiceUnavailable(error): boolean`
  - `fetchTodayParticipation(): Promise<ParticipationTodayResponse>`
  - `putTodayParticipation(input): Promise<PutParticipationTodayResponse>`

- [ ] **Step 1: Write the structured HTTP client tests**

Create `apps/extension/tests/apiClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtensionApiError,
  isServiceUnavailable,
  requestJson
} from "../src/apiClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("extension api client", () => {
  it("preserves HTTP status and server error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: "no_current_batch",
        message: "No current recommendation batch exists"
      })
    }));

    await expect(requestJson("https://lunch.example/api/test")).rejects.toMatchObject({
      name: "ExtensionApiError",
      kind: "http",
      status: 404,
      code: "no_current_batch"
    });
  });

  it("classifies fetch rejection as a retryable network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const error = await requestJson("https://lunch.example/api/test").catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(ExtensionApiError);
    expect(error).toMatchObject({ kind: "network" });
    expect(isServiceUnavailable(error)).toBe(true);
  });

  it("treats 5xx as unavailable but not 401", () => {
    expect(isServiceUnavailable(
      new ExtensionApiError({ kind: "http", status: 503, code: "unavailable" })
    )).toBe(true);
    expect(isServiceUnavailable(
      new ExtensionApiError({ kind: "http", status: 401, code: "invalid_token" })
    )).toBe(false);
  });
});
```

Extend `apps/extension/tests/recommendationClient.test.ts` with a focused participation read/update test:

```ts
it("reads participation and returns the typed update response", async () => {
  const participation = {
    groupId: "group-1",
    officeDate: "2026-07-10",
    summary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 0
    },
    members: [{
      membershipId: "membership-1",
      displayName: "小林",
      status: "joining" as const
    }]
  };
  const update = {
    groupId: "group-1",
    officeDate: "2026-07-10",
    participation: participation.members[0],
    summary: participation.summary
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => participation })
    .mockResolvedValueOnce({ ok: true, json: async () => update });
  vi.stubGlobal("fetch", fetchMock);

  await expect(fetchTodayParticipation()).resolves.toEqual(participation);
  await expect(putTodayParticipation({ status: "joining" })).resolves.toEqual(update);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm --filter @lunch/extension test -- apiClient.test.ts recommendationClient.test.ts
```

Expected: FAIL because `apiClient.ts`, `fetchTodayParticipation`, and the typed participation return do not exist.

- [ ] **Step 3: Implement the structured HTTP client**

Create `apps/extension/src/apiClient.ts`:

```ts
import type { ApiErrorResponse } from "@lunch/shared";

export type ExtensionApiErrorKind = "http" | "network" | "invalid-response";

export class ExtensionApiError extends Error {
  readonly kind: ExtensionApiErrorKind;
  readonly status?: number | undefined;
  readonly code?: string | undefined;

  constructor(input: {
    kind: ExtensionApiErrorKind;
    status?: number | undefined;
    code?: string | undefined;
    message?: string | undefined;
  }) {
    super(input.message ?? input.code ?? input.kind);
    this.name = "ExtensionApiError";
    this.kind = input.kind;
    this.status = input.status;
    this.code = input.code;
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new ExtensionApiError({
      kind: "network",
      message: error instanceof Error ? error.message : "network_error"
    });
  }

  if (!response.ok) {
    let body: Partial<ApiErrorResponse> = {};
    try {
      body = await response.json() as Partial<ApiErrorResponse>;
    } catch {
      body = {};
    }
    throw new ExtensionApiError({
      kind: "http",
      status: response.status,
      code: body.error,
      message: body.message ?? `HTTP ${response.status}`
    });
  }

  try {
    return await response.json() as T;
  } catch {
    throw new ExtensionApiError({
      kind: "invalid-response",
      status: response.status,
      code: "invalid_json_response",
      message: "Server returned invalid JSON"
    });
  }
}

export function isServiceUnavailable(error: unknown): boolean {
  return error instanceof ExtensionApiError && (
    error.kind === "network"
    || (error.kind === "http" && error.status !== undefined && error.status >= 500)
  );
}
```

- [ ] **Step 4: Refactor recommendation requests and add participation read**

In `apps/extension/src/recommendationClient.ts`, import the shared response types and replace the private error/request code with the structured client:

```ts
import type {
  ParticipationTodayResponse,
  PutParticipationTodayResponse
} from "@lunch/shared";
import {
  ExtensionApiError,
  isServiceUnavailable,
  requestJson
} from "./apiClient";

async function activeGroupJson<T>(
  context: ActiveGroupRequestContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return requestJson<T>(new URL(path, context.apiBaseUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      [AUTHORIZATION_HEADER]: `Bearer ${context.token}`
    }
  });
}

function isCacheFallbackEligible(error: unknown): boolean {
  return isServiceUnavailable(error);
}
```

Change each group response read from `Response.json()` to `activeGroupJson<T>()`. Add these exported functions:

```ts
export async function fetchTodayParticipation(): Promise<ParticipationTodayResponse> {
  const context = await requireActiveGroupRequestContext();
  return activeGroupJson<ParticipationTodayResponse>(
    context,
    GROUP_ROUTES.participationToday(context.groupId)
  );
}

export async function putTodayParticipation(
  input: PutParticipationTodayRequest
): Promise<PutParticipationTodayResponse> {
  const context = await requireActiveGroupRequestContext();
  return activeGroupJson<PutParticipationTodayResponse>(
    context,
    GROUP_ROUTES.participationToday(context.groupId),
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}
```

Keep the existing `404/no_current_batch` ensure logic, but check `ExtensionApiError.status` and `.code`. Keep legacy helper tests green.

- [ ] **Step 5: Run the focused extension tests**

Run:

```bash
pnpm --filter @lunch/extension test -- apiClient.test.ts recommendationClient.test.ts
```

Expected: PASS, including the existing cache isolation, refresh, feedback, and legacy fallback tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/extension/src/apiClient.ts apps/extension/src/recommendationClient.ts apps/extension/tests/apiClient.test.ts apps/extension/tests/recommendationClient.test.ts
git commit -m "refactor: structure extension api errors"
```

---

### Task 2: Locked Identity, Group, Host, And Reminder Storage

**Files:**

- Modify: `apps/extension/src/storage.ts`
- Modify: `apps/extension/tests/storage.test.ts`

**Interfaces:**

- Consumes: `ExtensionStorageShape`, `GroupSummary`, `GroupSessionResponse`, and `updateStorageState`.
- Produces:
  - `identityDisplayName?: string`
  - `saveIdentityConnection(displayName, identityToken)`
  - `saveGroupConnection(response)`
  - `syncGroupSummaries(groups)`
  - `clearGroupSession(groupId)`
  - `disconnectIdentity()`
  - `replaceApiBaseUrl(apiBaseUrl)`
  - `saveActiveGroupReminderOverride(input)`

- [ ] **Step 1: Add failing storage behavior tests**

Extend `apps/extension/tests/storage.test.ts`:

```ts
it("stores an identity and clears group-scoped state for a changed identity", async () => {
  const { readStoredState } = stubMutableStorage({
    ...getDefaultStorageState(),
    activeGroupId: "old-group",
    sessionsByGroupId: { "old-group": { token: "old-session" } },
    groupSummariesById: {
      "old-group": {
        groupId: "old-group",
        name: "旧小组",
        role: "member",
        membershipId: "old-membership"
      }
    }
  });

  await saveIdentityConnection("小林", "identity-token");

  expect(readStoredState()).toMatchObject({
    identityDisplayName: "小林",
    identityToken: "identity-token",
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  });
  expect(readStoredState().activeGroupId).toBeUndefined();
});

it("commits a group session and active group in one locked mutation", async () => {
  const { readStoredState } = stubMutableStorage(getDefaultStorageState());

  await saveGroupConnection({
    identityToken: "new-identity-token",
    groupSessionToken: "group-session-token",
    group: {
      groupId: "group-1",
      name: "设计组",
      role: "admin",
      membershipId: "membership-1"
    }
  });

  expect(readStoredState()).toMatchObject({
    identityToken: "new-identity-token",
    activeGroupId: "group-1",
    sessionsByGroupId: { "group-1": { token: "group-session-token" } },
    groupSummariesById: {
      "group-1": expect.objectContaining({ name: "设计组" })
    }
  });
});

it("replaces the API host without carrying credentials or group cache", async () => {
  const { readStoredState } = stubMutableStorage({
    ...getDefaultStorageState(),
    apiBaseUrl: "https://old.example",
    readToken: "old-read-token",
    reminderTime: "12:05",
    enabled: false,
    identityToken: "identity-token",
    identityDisplayName: "小林",
    activeGroupId: "group-1",
    sessionsByGroupId: { "group-1": { token: "session" } },
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: { "group-1": { reminderTime: "12:20" } }
  });

  await replaceApiBaseUrl("https://new.example/");

  expect(readStoredState()).toEqual({
    apiBaseUrl: "https://new.example",
    readToken: "",
    reminderTime: "12:05",
    enabled: false,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  });
});
```

Add this test helper near the existing lock helper:

```ts
function stubMutableStorage(initial: ReturnType<typeof getDefaultStorageState>) {
  let storedState = structuredClone(initial);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({ [STORAGE_KEYS.state]: structuredClone(storedState) })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          storedState = structuredClone(value[STORAGE_KEYS.state]) as typeof storedState;
        })
      }
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) }
  });
  return { readStoredState: () => storedState };
}
```

- [ ] **Step 2: Run the storage tests and verify failure**

Run:

```bash
pnpm --filter @lunch/extension test -- storage.test.ts
```

Expected: FAIL because the connection helpers and `identityDisplayName` do not exist.

- [ ] **Step 3: Extend the storage shape and implement locked mutations**

Add the optional field to `ExtensionStorageShape`:

```ts
identityDisplayName?: string | undefined;
```

Add these functions to `apps/extension/src/storage.ts`:

```ts
import type { GroupSessionResponse } from "@lunch/shared";

export async function saveIdentityConnection(
  displayName: string,
  identityToken: string
): Promise<void> {
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      identityDisplayName: displayName.trim(),
      identityToken,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    };
    delete next.activeGroupId;
    return next;
  });
}

export async function saveGroupConnection(
  response: GroupSessionResponse
): Promise<void> {
  await updateStorageState((state) => ({
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
  }));
}

export async function syncGroupSummaries(groups: GroupSummary[]): Promise<void> {
  const allowed = new Set(groups.map((group) => group.groupId));
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      groupSummariesById: Object.fromEntries(
        groups.map((group) => [group.groupId, group])
      ),
      sessionsByGroupId: Object.fromEntries(
        Object.entries(state.sessionsByGroupId).filter(([groupId]) => allowed.has(groupId))
      )
    };
    if (next.activeGroupId && !allowed.has(next.activeGroupId)) {
      delete next.activeGroupId;
    }
    return next;
  });
}

export async function clearGroupSession(groupId: string): Promise<void> {
  await updateStorageState((state) => {
    const sessionsByGroupId = { ...state.sessionsByGroupId };
    delete sessionsByGroupId[groupId];
    return { ...state, sessionsByGroupId };
  });
}

export async function disconnectIdentity(): Promise<void> {
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      readToken: "",
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    };
    delete next.identityToken;
    delete next.identityDisplayName;
    delete next.activeGroupId;
    return next;
  });
}

export async function replaceApiBaseUrl(apiBaseUrl: string): Promise<void> {
  const normalized = new URL(apiBaseUrl).toString().replace(/\/$/, "");
  await updateStorageState((state) => ({
    apiBaseUrl: normalized,
    readToken: "",
    reminderTime: state.reminderTime,
    enabled: state.enabled,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  }));
}

export async function saveActiveGroupReminderOverride(input: {
  reminderTime: string;
  enabled: boolean;
}): Promise<void> {
  await updateStorageState((state) => {
    if (!state.activeGroupId) {
      return { ...state, reminderTime: input.reminderTime, enabled: input.enabled };
    }
    return {
      ...state,
      localReminderOverridesByGroupId: {
        ...state.localReminderOverridesByGroupId,
        [state.activeGroupId]: input
      }
    };
  });
  await chrome.runtime.sendMessage({ type: "settingsChanged" }).catch(() => undefined);
}
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
pnpm --filter @lunch/extension test -- storage.test.ts
```

Expected: PASS, including the existing Web Locks lost-update and cache mismatch tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/extension/src/storage.ts apps/extension/tests/storage.test.ts
git commit -m "feat: persist extension group connection"
```

---

### Task 3: Identity And Group Client With Options Controller

**Files:**

- Create: `apps/extension/src/groupClient.ts`
- Modify: `apps/extension/src/optionsController.ts`
- Create: `apps/extension/tests/groupClient.test.ts`
- Modify: `apps/extension/tests/optionsController.test.ts`

**Interfaces:**

- Consumes: Task 1 `requestJson`, Task 2 locked storage helpers, and shared identity/group/restaurant contracts.
- Produces:
  - `createIdentity(apiBaseUrl, displayName)`
  - `createGroup(apiBaseUrl, identityToken, input)`
  - `joinGroup(apiBaseUrl, identityToken, inviteCode)`
  - `listGroups(apiBaseUrl, identityToken)`
  - `refreshGroupSession(apiBaseUrl, identityToken, groupId)`
  - `listGroupRestaurants(context)`
  - `createGroupRestaurant(context, input)`
  - `createGroupRecommendation(context, input)`
  - `createOptionsController(dependencies)` with `load`, `createIdentity`, `createGroup`, `joinGroup`, `switchGroup`, `saveReminder`, `replaceHost`, and `disconnect`.

- [ ] **Step 1: Write group-client request tests**

Create `apps/extension/tests/groupClient.test.ts` with exact URL/header assertions:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIdentity,
  joinGroup,
  refreshGroupSession
} from "../src/groupClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("extension group client", () => {
  it("creates a lightweight identity without an authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ identityId: "identity-1", identityToken: "identity-token" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await createIdentity("https://lunch.example", "小林");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/identities"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "小林" })
      }
    );
  });

  it("joins and refreshes a group with the identity token", async () => {
    const response = {
      identityToken: "fresh-identity-token",
      groupSessionToken: "group-session-token",
      group: {
        groupId: "group-1",
        name: "设计组",
        role: "member" as const,
        membershipId: "membership-1"
      }
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetchMock);

    await joinGroup("https://lunch.example", "identity-token", "ABCD12");
    await refreshGroupSession("https://lunch.example", "identity-token", "group-1");

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        "content-type": "application/json",
        authorization: "Bearer identity-token"
      }
    });
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(
      new URL("https://lunch.example/api/groups/group-1/session")
    );
  });
});
```

- [ ] **Step 2: Rewrite options-controller tests around the product controller**

Rewrite `apps/extension/tests/optionsController.test.ts`. Preserve the existing storage-read, Web Locks unavailable, save rejection, and success-after-save assertions by injecting the new dependency interface, then add these transition tests:

```ts
it("keeps the old active group until the requested session succeeds", async () => {
  let resolveSession!: (value: GroupSessionResponse) => void;
  const saveGroup = vi.fn().mockResolvedValue(undefined);
  const render = vi.fn();
  const controller = createOptionsController({
    loadStorage: vi.fn().mockResolvedValue({
      ...getDefaultStorageState(),
      identityToken: "identity-token",
      activeGroupId: "group-1"
    }),
    listGroups: vi.fn().mockResolvedValue({ groups: [] }),
    refreshSession: vi.fn(() => new Promise((resolve) => { resolveSession = resolve; })),
    saveGroupConnection: saveGroup,
    render,
    saveIdentityConnection: vi.fn(),
    createIdentity: vi.fn(),
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
    syncGroupSummaries: vi.fn(),
    saveReminder: vi.fn(),
    replaceApiBaseUrl: vi.fn(),
    disconnectIdentity: vi.fn()
  });

  const switching = controller.switchGroup("group-2");
  expect(saveGroup).not.toHaveBeenCalled();

  resolveSession(groupSessionResponse("group-2"));
  await switching;

  expect(saveGroup).toHaveBeenCalledWith(groupSessionResponse("group-2"));
});

it("retains the created identity when group creation fails", async () => {
  const saveIdentity = vi.fn().mockResolvedValue(undefined);
  const controller = createOptionsController(optionsDependencies({
    createIdentity: vi.fn().mockResolvedValue({
      identityId: "identity-1",
      identityToken: "identity-token"
    }),
    saveIdentityConnection: saveIdentity,
    createGroup: vi.fn().mockRejectedValue(new Error("group create failed"))
  }));

  await controller.createIdentity("小林");
  await expect(controller.createGroup({ groupName: "设计组" })).resolves.toBeUndefined();

  expect(saveIdentity).toHaveBeenCalledWith("小林", "identity-token");
});
```

Define `groupSessionResponse` and `optionsDependencies` as typed local factories in that test file; the factories must provide every dependency named in the controller interface and use `vi.fn()` defaults.

- [ ] **Step 3: Run the client/controller tests and verify failure**

Run:

```bash
pnpm --filter @lunch/extension test -- groupClient.test.ts optionsController.test.ts
```

Expected: FAIL because `groupClient.ts` and the product options controller methods do not exist.

- [ ] **Step 4: Implement the typed group client**

Create `apps/extension/src/groupClient.ts`:

```ts
import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type CreateGroupRequest,
  type CreateGroupResponse,
  type CreateIdentityResponse,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type GroupsListResponse,
  type JoinGroupResponse,
  type RecommendationMutationResponse,
  type RefreshGroupSessionResponse,
  type RestaurantListResponse,
  type RestaurantMutationResponse
} from "@lunch/shared";
import { requestJson } from "./apiClient";

export interface GroupApiContext {
  apiBaseUrl: string;
  groupId: string;
  token: string;
}

function identityHeaders(identityToken: string): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `Bearer ${identityToken}` };
}

function groupHeaders(context: GroupApiContext): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `Bearer ${context.token}` };
}

export function createIdentity(apiBaseUrl: string, displayName: string) {
  return requestJson<CreateIdentityResponse>(
    new URL(GROUP_ROUTES.identities, apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() })
    }
  );
}

export function createGroup(
  apiBaseUrl: string,
  identityToken: string,
  input: CreateGroupRequest
) {
  return requestJson<CreateGroupResponse>(new URL(GROUP_ROUTES.groups, apiBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...identityHeaders(identityToken)
    },
    body: JSON.stringify(input)
  });
}

export function joinGroup(
  apiBaseUrl: string,
  identityToken: string,
  inviteCode: string
) {
  return requestJson<JoinGroupResponse>(new URL(GROUP_ROUTES.joinGroup, apiBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...identityHeaders(identityToken)
    },
    body: JSON.stringify({ inviteCode: inviteCode.trim() })
  });
}

export function listGroups(apiBaseUrl: string, identityToken: string) {
  return requestJson<GroupsListResponse>(new URL(GROUP_ROUTES.groups, apiBaseUrl), {
    headers: identityHeaders(identityToken)
  });
}

export function refreshGroupSession(
  apiBaseUrl: string,
  identityToken: string,
  groupId: string
) {
  return requestJson<RefreshGroupSessionResponse>(
    new URL(GROUP_ROUTES.groupSession(groupId), apiBaseUrl),
    { method: "POST", headers: identityHeaders(identityToken) }
  );
}

export function listGroupRestaurants(context: GroupApiContext) {
  return requestJson<RestaurantListResponse>(
    new URL(GROUP_ROUTES.restaurants(context.groupId), context.apiBaseUrl),
    { headers: groupHeaders(context) }
  );
}

export function createGroupRestaurant(
  context: GroupApiContext,
  input: CreateRestaurantRequest
) {
  return requestJson<RestaurantMutationResponse>(
    new URL(GROUP_ROUTES.restaurants(context.groupId), context.apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...groupHeaders(context) },
      body: JSON.stringify(input)
    }
  );
}

export function createGroupRecommendation(
  context: GroupApiContext,
  input: CreateRecommendationRequest
) {
  return requestJson<RecommendationMutationResponse>(
    new URL(GROUP_ROUTES.recommendations(context.groupId), context.apiBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...groupHeaders(context) },
      body: JSON.stringify(input)
    }
  );
}
```

- [ ] **Step 5: Replace the generic options controller with the product controller**

Replace `apps/extension/src/optionsController.ts` with this controller contract and implementation. The only omitted values are imports from the exact modules created in Tasks 1-3:

```ts
import type {
  CreateGroupRequest,
  CreateGroupResponse,
  CreateIdentityResponse,
  GroupsListResponse,
  JoinGroupResponse,
  RefreshGroupSessionResponse
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import type { ExtensionStorageShape } from "./storage";

export type OptionsViewState =
  | { kind: "loading"; storage: ExtensionStorageShape }
  | { kind: "identity-required"; storage: ExtensionStorageShape; error?: string | undefined }
  | { kind: "ready"; storage: ExtensionStorageShape; inviteCode?: string | undefined; pendingGroupId?: string | undefined; error?: string | undefined };

export interface OptionsControllerDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  createIdentity: (apiBaseUrl: string, displayName: string) => Promise<CreateIdentityResponse>;
  createGroup: (apiBaseUrl: string, identityToken: string, input: CreateGroupRequest) => Promise<CreateGroupResponse>;
  joinGroup: (apiBaseUrl: string, identityToken: string, inviteCode: string) => Promise<JoinGroupResponse>;
  listGroups: (apiBaseUrl: string, identityToken: string) => Promise<GroupsListResponse>;
  refreshSession: (apiBaseUrl: string, identityToken: string, groupId: string) => Promise<RefreshGroupSessionResponse>;
  saveIdentityConnection: (displayName: string, identityToken: string) => Promise<void>;
  saveGroupConnection: (response: RefreshGroupSessionResponse) => Promise<void>;
  syncGroupSummaries: (groups: GroupsListResponse["groups"]) => Promise<void>;
  saveReminder: (input: { reminderTime: string; enabled: boolean }) => Promise<void>;
  replaceApiBaseUrl: (apiBaseUrl: string) => Promise<void>;
  disconnectIdentity: () => Promise<void>;
  render: (state: OptionsViewState) => void;
}

function mapOptionsError(error: unknown): string {
  if (error instanceof ExtensionApiError) {
    if (error.code === "invalid_invite_code") return "邀请码无效或已经失效。";
    if (error.code === "removed_member") return "你已被移出该小组，请联系管理员。";
    if (error.status === 401) return "连接已失效，请重新建立身份。";
  }
  return "操作没有完成，请检查网络后重试。";
}

export function createOptionsController(dependencies: OptionsControllerDependencies) {
  let current: OptionsViewState = {
    kind: "loading",
    storage: {
      apiBaseUrl: "http://localhost:3000",
      readToken: "",
      reminderTime: "11:30",
      enabled: true,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    }
  };

  function commit(next: OptionsViewState): void {
    current = next;
    dependencies.render(next);
  }

  async function load(inviteCode?: string): Promise<void> {
    let storage: ExtensionStorageShape;
    try {
      storage = await dependencies.loadStorage();
    } catch {
      commit({
        kind: "identity-required",
        storage: current.storage,
        error: "加载设置失败：无法读取浏览器存储。请重试。"
      });
      return;
    }
    commit({ kind: "loading", storage });
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage });
      return;
    }
    try {
      const response = await dependencies.listGroups(
        storage.apiBaseUrl,
        storage.identityToken
      );
      await dependencies.syncGroupSummaries(response.groups);
      const synced = await dependencies.loadStorage();
      commit({ kind: "ready", storage: synced, ...(inviteCode ? { inviteCode } : {}) });
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function createIdentity(displayName: string): Promise<void> {
    const storage = await dependencies.loadStorage();
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.createIdentity(storage.apiBaseUrl, displayName);
      await dependencies.saveIdentityConnection(displayName, response.identityToken);
      await load();
    } catch (error) {
      commit({ kind: "identity-required", storage, error: mapOptionsError(error) });
    }
  }

  async function createGroup(input: CreateGroupRequest): Promise<void> {
    const storage = await dependencies.loadStorage();
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage, error: "请先建立轻量身份。" });
      return;
    }
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.createGroup(
        storage.apiBaseUrl,
        storage.identityToken,
        input
      );
      await dependencies.saveGroupConnection(response);
      await load(response.inviteCode);
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function joinGroup(inviteCode: string): Promise<void> {
    const storage = await dependencies.loadStorage();
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage, error: "请先建立轻量身份。" });
      return;
    }
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.joinGroup(
        storage.apiBaseUrl,
        storage.identityToken,
        inviteCode
      );
      await dependencies.saveGroupConnection(response);
      await load();
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function switchGroup(groupId: string): Promise<void> {
    const storage = await dependencies.loadStorage();
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage });
      return;
    }
    commit({ kind: "ready", storage, pendingGroupId: groupId });
    try {
      const response = await dependencies.refreshSession(
        storage.apiBaseUrl,
        storage.identityToken,
        groupId
      );
      await dependencies.saveGroupConnection(response);
      await load();
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function saveReminder(input: { reminderTime: string; enabled: boolean }) {
    const storage = await dependencies.loadStorage();
    try {
      await dependencies.saveReminder(input);
      await load();
    } catch (error) {
      const message = error instanceof Error && error.message === "storage_lock_unavailable"
        ? "保存设置失败：浏览器暂不支持安全保存。请重试。"
        : "保存设置失败：无法写入浏览器存储。请重试。";
      commit({ kind: "ready", storage, error: message });
    }
  }

  async function replaceHost(apiBaseUrl: string) {
    const storage = await dependencies.loadStorage();
    try {
      await dependencies.replaceApiBaseUrl(apiBaseUrl);
      await load();
    } catch {
      commit({ kind: "ready", storage, error: "API 地址没有保存，请重试。" });
    }
  }

  async function disconnect() {
    const storage = await dependencies.loadStorage();
    try {
      await dependencies.disconnectIdentity();
      await load();
    } catch {
      commit({ kind: "ready", storage, error: "断开连接失败，请重试。" });
    }
  }

  return {
    load,
    createIdentity,
    createGroup,
    joinGroup,
    switchGroup,
    saveReminder,
    replaceHost,
    disconnect,
    getState: () => current
  };
}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm --filter @lunch/extension test -- groupClient.test.ts optionsController.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/extension/src/groupClient.ts apps/extension/src/optionsController.ts apps/extension/tests/groupClient.test.ts apps/extension/tests/optionsController.test.ts
git commit -m "feat: add extension group connection flow"
```

---

### Task 4: Prototype-Aligned Product Settings Page

**Files:**

- Modify: `apps/extension/options.html`
- Modify: `apps/extension/src/options.ts`
- Modify: `apps/extension/styles/options.css`
- Modify: `apps/extension/tests/optionsController.test.ts`

**Interfaces:**

- Consumes: Task 3 `createOptionsController` and Task 2 locked mutation helpers.
- Produces: product-facing identity, create/join, group selector, reminder, and advanced host UI with no raw token inputs.

- [ ] **Step 1: Add controller assertions for render-safe invite and raw-token exclusion**

Add to `apps/extension/tests/optionsController.test.ts`:

```ts
it("renders the one-time invite code after group creation without exposing tokens", async () => {
  const render = vi.fn();
  const controller = createOptionsController(optionsDependencies({
    render,
    loadStorage: vi.fn().mockResolvedValue({
      ...getDefaultStorageState(),
      identityToken: "identity-token",
      identityDisplayName: "小林"
    }),
    createGroup: vi.fn().mockResolvedValue({
      ...groupSessionResponse("group-1"),
      inviteCode: "ABCD12"
    })
  }));

  await controller.createGroup({ groupName: "设计组" });

  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({
    kind: "ready",
    inviteCode: "ABCD12"
  }));
  expect(JSON.stringify(render.mock.calls.at(-1)?.[0])).not.toContain("group-session-token");
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
pnpm --filter @lunch/extension test -- optionsController.test.ts
```

Expected: FAIL until the one-time render model is returned without token fields.

- [ ] **Step 3: Replace the options HTML with production regions**

Replace the body of `apps/extension/options.html` with this structure while retaining the existing module script:

```html
<main class="settings-page">
  <header class="settings-header">
    <a class="brand" href="index.html" aria-label="返回今日推荐">
      <span class="brand-mark" aria-hidden="true">♨</span>
      <span><strong>中午吃点啥</strong><small>插件设置</small></span>
    </a>
    <p id="global-message" class="global-message" aria-live="polite"></p>
  </header>

  <section id="identity-card" class="settings-card" aria-labelledby="identity-title">
    <div class="section-heading"><span>01</span><h1 id="identity-title">连接干饭小组</h1></div>
    <div id="identity-state"></div>
  </section>

  <section id="groups-card" class="settings-card" aria-labelledby="groups-title" hidden>
    <div class="section-heading"><span>02</span><h2 id="groups-title">当前小组</h2></div>
    <div id="group-list" class="group-list"></div>
    <div class="entry-grid">
      <form id="create-group-form" class="stack">
        <h3>创建新小组</h3>
        <label>小组名称<input id="group-name" required maxlength="80" /></label>
        <label>一句话说明<input id="group-subtitle" maxlength="120" /></label>
        <button class="button primary" type="submit">创建小组</button>
      </form>
      <form id="join-group-form" class="stack">
        <h3>用邀请码加入</h3>
        <label>邀请码<input id="invite-code" required autocomplete="off" /></label>
        <button class="button secondary" type="submit">加入小组</button>
      </form>
    </div>
    <div id="invite-result" class="invite-result" aria-live="polite" hidden></div>
  </section>

  <section id="reminder-card" class="settings-card" aria-labelledby="reminder-title" hidden>
    <div class="section-heading"><span>03</span><h2 id="reminder-title">本机提醒</h2></div>
    <form id="reminder-form" class="setting-rows">
      <label class="setting-row"><span><strong>提醒时间</strong><small>当前小组的本机覆盖值</small></span><input id="reminder-time" type="time" required /></label>
      <label class="setting-row"><span><strong>工作日提醒</strong><small>周一到周五，周末不打扰</small></span><input id="reminder-enabled" type="checkbox" /></label>
      <button class="button primary" type="submit">保存提醒</button>
    </form>
  </section>

  <details class="settings-card advanced-card">
    <summary>高级连接设置</summary>
    <form id="api-host-form" class="stack">
      <label>API 地址<input id="api-base-url" type="url" required /></label>
      <p>更换地址会断开当前身份并清除该服务的分组缓存。</p>
      <button class="button danger" type="submit">更换 API 地址</button>
    </form>
  </details>
</main>
```

The disconnected identity renderer must create a form with IDs `display-name` and `identity-form`; the connected renderer must show only display name plus a `disconnect-button`. Do not create any identity-token or session-token element.

- [ ] **Step 4: Bind DOM events to the controller**

Rewrite `apps/extension/src/options.ts` so it constructs the controller with real group-client and storage dependencies. Its renderer must:

```ts
function renderOptions(state: OptionsViewState): void {
  globalMessage.textContent = state.error ?? "";
  const connected = Boolean(state.storage.identityToken);
  groupsCard.hidden = !connected;
  reminderCard.hidden = !connected || !state.storage.activeGroupId;
  apiBaseUrl.value = state.storage.apiBaseUrl;
  renderIdentity(identityState, state);
  renderGroups(groupList, state);
  renderReminder(state.storage);
  renderInvite(inviteResult, state.inviteCode);
}
```

Each form listener trims fields, disables its submit button during the awaited controller call, and restores the button on failure. API-host submission must call `window.confirm` with the exact warning in the HTML before `controller.replaceHost`.

- [ ] **Step 5: Port the production settings CSS**

Replace `apps/extension/styles/options.css` with explicit application-local tokens and layouts:

```css
:root {
  color-scheme: light;
  --paper: #f6f0e7;
  --surface: #fffdf8;
  --surface-soft: #fbf6ee;
  --ink: #2f2923;
  --muted: #786f66;
  --border: #e6d9ca;
  --accent: #e86f3d;
  --accent-ink: #8c3213;
  --accent-soft: #fde6d7;
  --danger: #a8443a;
  --shadow: 0 18px 55px rgb(75 49 31 / 10%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--paper); }
button, input { font: inherit; }
.settings-page { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 56px; }
.settings-header { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 18px; }
.brand { display: inline-flex; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
.brand-mark { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 14px; color: var(--accent-ink); background: var(--accent-soft); }
.brand strong, .brand small { display: block; }
.brand small { margin-top: 2px; color: var(--muted); }
.settings-card { margin-top: 14px; padding: 22px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); }
.section-heading { display: flex; gap: 10px; align-items: baseline; margin-bottom: 18px; }
.section-heading > span { color: var(--accent); font: 700 12px ui-monospace, monospace; }
.section-heading h1, .section-heading h2 { margin: 0; font-size: 19px; }
.stack { display: grid; gap: 12px; }
.entry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }
label { display: grid; gap: 7px; color: var(--muted); font-size: 13px; }
input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; color: var(--ink); background: white; }
input:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid rgb(232 111 61 / 24%); outline-offset: 2px; }
.button { min-height: 40px; padding: 0 15px; border: 0; border-radius: 10px; cursor: pointer; font-weight: 700; }
.button:disabled { cursor: wait; opacity: .6; }
.primary { color: white; background: var(--accent); }
.secondary { color: var(--accent-ink); background: var(--accent-soft); }
.danger { color: white; background: var(--danger); }
.group-list { display: grid; gap: 9px; }
.group-option, .setting-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 13px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-soft); }
.group-option[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); }
.setting-rows { display: grid; gap: 10px; }
.setting-row strong, .setting-row small { display: block; }
.setting-row small { margin-top: 3px; color: var(--muted); }
.invite-result { margin-top: 14px; padding: 14px; border-radius: 12px; color: var(--accent-ink); background: var(--accent-soft); }
.global-message { min-height: 20px; color: var(--danger); }
.advanced-card summary { cursor: pointer; font-weight: 700; }
.advanced-card form { margin-top: 16px; }
@media (max-width: 680px) {
  .entry-grid { grid-template-columns: 1fr; }
  .settings-header, .setting-row { align-items: stretch; flex-direction: column; }
}
```

- [ ] **Step 6: Verify options controller, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/extension test -- optionsController.test.ts storage.test.ts groupClient.test.ts
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
```

Expected: all commands PASS; `apps/extension/dist/options.html` exists and contains no `identityToken` or `groupSessionToken` input.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/extension/options.html apps/extension/src/options.ts apps/extension/styles/options.css apps/extension/tests/optionsController.test.ts
git commit -m "feat: rebuild extension group settings"
```

---

### Task 5: Popup State Controller And Recommendation View Models

**Files:**

- Create: `apps/extension/src/popupController.ts`
- Create: `apps/extension/src/recommendationViewModel.ts`
- Create: `apps/extension/tests/popupController.test.ts`
- Create: `apps/extension/tests/recommendationViewModel.test.ts`

**Interfaces:**

- Consumes: `ExtensionApiError`, current-group storage snapshot, recommendation client, participation client, and shared response types.
- Produces:
  - `PopupViewState`
  - `loadPopupState(dependencies): Promise<PopupViewState>`
  - `classifyPopupError(error): PopupFailureKind`
  - `currentMemberParticipation(response, membershipId)`
  - `RecommendationCardModel`
  - `toRecommendationCardModel(item)`
  - `scoreBreakdownRows(item)`

- [ ] **Step 1: Write popup state classification tests**

Create `apps/extension/tests/popupController.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import { loadPopupState } from "../src/popupController";
import { getDefaultStorageState } from "../src/storage";

describe("popup controller", () => {
  it("returns disconnected before making a network request", async () => {
    const loadRecommendations = vi.fn();
    const state = await loadPopupState({
      loadStorage: vi.fn().mockResolvedValue(getDefaultStorageState()),
      loadRecommendations,
      loadParticipation: vi.fn()
    });

    expect(state.kind).toBe("disconnected");
    expect(loadRecommendations).not.toHaveBeenCalled();
  });

  it("maps no_current_batch to a generate state", async () => {
    const state = await loadPopupState(popupDependencies({
      loadRecommendations: vi.fn().mockRejectedValue(
        new ExtensionApiError({
          kind: "http",
          status: 404,
          code: "no_current_batch"
        })
      )
    }));

    expect(state).toMatchObject({ kind: "no-current-batch", groupId: "group-1" });
  });

  it("marks matching cached data read-only without fetching participation", async () => {
    const loadParticipation = vi.fn();
    const state = await loadPopupState(popupDependencies({
      loadRecommendations: vi.fn().mockResolvedValue({
        ...todayResponse("group-1"),
        fromCache: true
      }),
      loadParticipation
    }));

    expect(state).toMatchObject({ kind: "cached", readOnly: true });
    expect(loadParticipation).not.toHaveBeenCalled();
  });

  it("matches the active membership and preserves recommendations if participation fails", async () => {
    const state = await loadPopupState(popupDependencies({
      loadParticipation: vi.fn().mockRejectedValue(
        new ExtensionApiError({ kind: "http", status: 503 })
      )
    }));

    expect(state).toMatchObject({
      kind: "ready",
      participationUnavailable: true
    });
  });
});
```

In the same file, add factories that return the exact shared response objects already used in `recommendationClient.test.ts`: active `group-1`, membership `membership-1`, session token `group-session-token`, office date `2026-07-10`, batch `batch-1`, and one active recommendation item. `popupDependencies` must merge overrides into three `vi.fn()` dependencies named in `PopupDependencies`.

- [ ] **Step 2: Write recommendation model tests**

Create `apps/extension/tests/recommendationViewModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  scoreBreakdownRows,
  toRecommendationCardModel
} from "../src/recommendationViewModel";

describe("recommendation view models", () => {
  const item = {
    rank: 1,
    restaurantId: "restaurant-1",
    recommendationId: "recommendation-1",
    restaurantName: "巷口砂锅",
    dish: "番茄肥牛砂锅",
    reason: "下雨天热乎且离得近",
    distanceMinutes: 6,
    averagePriceCents: 2800,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["热乎", "近"],
    score: 55,
    scoreBreakdown: {
      weekdayMatch: 10,
      weatherMatch: 20,
      distance: 20,
      teammateRecommendation: 10,
      recentDuplicatePenalty: -5,
      negativeFeedbackPenalty: 0,
      total: 55
    }
  };

  it("formats only real item data", () => {
    expect(toRecommendationCardModel(item)).toEqual({
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      rankLabel: "今日第 1 选",
      name: "巷口砂锅",
      dish: "番茄肥牛砂锅",
      reason: "下雨天热乎且离得近",
      distanceLabel: "步行 6 分钟",
      priceLabel: "人均 ¥28",
      modeLabel: "堂食 · 外带",
      tags: ["热乎", "近"],
      scoreLabel: "55 分"
    });
  });

  it("keeps penalties visible in the score rows", () => {
    expect(scoreBreakdownRows(item)).toContainEqual({
      key: "recentDuplicatePenalty",
      label: "近期重复",
      value: -5
    });
  });
});
```

- [ ] **Step 3: Run the new tests and verify failure**

Run:

```bash
pnpm --filter @lunch/extension test -- popupController.test.ts recommendationViewModel.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement popup state loading**

Create `apps/extension/src/popupController.ts` with this state union and load behavior:

```ts
import type {
  GroupSummary,
  GroupTodayRecommendationsResponse,
  ParticipationMember,
  ParticipationTodayResponse
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import type { ExtensionStorageShape } from "./storage";

export type PopupViewState =
  | { kind: "disconnected" }
  | { kind: "no-current-batch"; groupId: string; group: GroupSummary }
  | { kind: "cached"; response: GroupTodayRecommendationsResponse; group: GroupSummary; readOnly: true }
  | { kind: "empty"; response: GroupTodayRecommendationsResponse; group: GroupSummary }
  | { kind: "ready"; response: GroupTodayRecommendationsResponse; group: GroupSummary; participation?: ParticipationTodayResponse | undefined; currentMember?: ParticipationMember | undefined; participationUnavailable?: boolean | undefined }
  | { kind: "session-expired"; group?: GroupSummary | undefined }
  | { kind: "forbidden"; group?: GroupSummary | undefined }
  | { kind: "error"; group?: GroupSummary | undefined; message: string };

export interface PopupDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  loadRecommendations: () => Promise<GroupTodayRecommendationsResponse>;
  loadParticipation: () => Promise<ParticipationTodayResponse>;
}

export function currentMemberParticipation(
  participation: ParticipationTodayResponse,
  membershipId: string
): ParticipationMember | undefined {
  return participation.members.find((member) => member.membershipId === membershipId);
}

export async function loadPopupState(
  dependencies: PopupDependencies
): Promise<PopupViewState> {
  const storage = await dependencies.loadStorage();
  const groupId = storage.activeGroupId;
  const group = groupId ? storage.groupSummariesById[groupId] : undefined;
  const session = groupId ? storage.sessionsByGroupId[groupId] : undefined;
  if (!groupId || !group || !session?.token) return { kind: "disconnected" };

  try {
    const response = await dependencies.loadRecommendations();
    if (response.fromCache) return { kind: "cached", response, group, readOnly: true };
    if (response.items.length === 0) return { kind: "empty", response, group };
    try {
      const participation = await dependencies.loadParticipation();
      return {
        kind: "ready",
        response,
        group,
        participation,
        currentMember: currentMemberParticipation(participation, group.membershipId)
      };
    } catch {
      return { kind: "ready", response, group, participationUnavailable: true };
    }
  } catch (error) {
    if (error instanceof ExtensionApiError) {
      if (error.status === 404 && error.code === "no_current_batch") {
        return { kind: "no-current-batch", groupId, group };
      }
      if (error.status === 401) return { kind: "session-expired", group };
      if (error.status === 403) return { kind: "forbidden", group };
    }
    return { kind: "error", group, message: "暂时无法加载今日推荐，请重试。" };
  }
}
```

- [ ] **Step 5: Implement recommendation display models**

Create `apps/extension/src/recommendationViewModel.ts`:

```ts
import type { GroupTodayRecommendationItem, ScoreBreakdown } from "@lunch/shared";

export interface RecommendationCardModel {
  restaurantId: string;
  recommendationId?: string | undefined;
  rankLabel: string;
  name: string;
  dish: string;
  reason: string;
  distanceLabel: string;
  priceLabel: string;
  modeLabel: string;
  tags: string[];
  scoreLabel: string;
}

export interface ScoreRow {
  key: keyof ScoreBreakdown;
  label: string;
  value: number;
}

function priceLabel(cents?: number): string {
  if (cents === undefined) return "";
  const yuan = cents / 100;
  return `人均 ¥${Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(1)}`;
}

function modeLabel(item: GroupTodayRecommendationItem): string {
  return [item.supportsDineIn ? "堂食" : "", item.supportsTakeout ? "外带" : ""]
    .filter(Boolean)
    .join(" · ");
}

export function toRecommendationCardModel(
  item: GroupTodayRecommendationItem
): RecommendationCardModel {
  return {
    restaurantId: item.restaurantId,
    ...(item.recommendationId ? { recommendationId: item.recommendationId } : {}),
    rankLabel: `今日第 ${item.rank} 选`,
    name: item.restaurantName,
    dish: item.dish ?? "",
    reason: item.reason,
    distanceLabel: item.distanceMinutes === undefined
      ? ""
      : `步行 ${item.distanceMinutes} 分钟`,
    priceLabel: priceLabel(item.averagePriceCents),
    modeLabel: modeLabel(item),
    tags: item.tags,
    scoreLabel: `${item.score} 分`
  };
}

const breakdownLabels: Array<[keyof ScoreBreakdown, string]> = [
  ["weekdayMatch", "星期匹配"],
  ["weatherMatch", "天气匹配"],
  ["distance", "距离"],
  ["teammateRecommendation", "同事推荐"],
  ["recentDuplicatePenalty", "近期重复"],
  ["negativeFeedbackPenalty", "负反馈"]
];

export function scoreBreakdownRows(item: GroupTodayRecommendationItem): ScoreRow[] {
  return breakdownLabels.map(([key, label]) => ({
    key,
    label,
    value: item.scoreBreakdown[key]
  }));
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @lunch/extension test -- popupController.test.ts recommendationViewModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/extension/src/popupController.ts apps/extension/src/recommendationViewModel.ts apps/extension/tests/popupController.test.ts apps/extension/tests/recommendationViewModel.test.ts
git commit -m "feat: model extension popup states"
```

---

### Task 6: Production Popup And Inline Detail UI

**Files:**

- Modify: `apps/extension/index.html`
- Modify: `apps/extension/src/popup.ts`
- Modify: `apps/extension/styles/popup.css`
- Modify: `apps/extension/tests/popupController.test.ts`

**Interfaces:**

- Consumes: Task 5 popup state and recommendation models plus Task 1 participation/feedback/refresh APIs.
- Produces: production popup rendering, inline detail navigation, participation controls, generate/refresh actions, feedback, and decision UX.

- [ ] **Step 1: Add action-state tests to the popup controller**

Add tests proving that a successful participation update replaces both the current member and summary, and that cached state reports `readOnly: true`. Use this expected transition:

```ts
expect(applyParticipationUpdate(readyState, update)).toMatchObject({
  kind: "ready",
  currentMember: { status: "joining" },
  response: {
    participationSummary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 0
    }
  }
});
```

- [ ] **Step 2: Run the controller test and verify failure**

Run:

```bash
pnpm --filter @lunch/extension test -- popupController.test.ts
```

Expected: FAIL because `applyParticipationUpdate` is missing.

- [ ] **Step 3: Implement immutable action-state updates**

Add this implementation to `popupController.ts`:

```ts
import type { PutParticipationTodayResponse } from "@lunch/shared";

export function applyParticipationUpdate(
  state: PopupViewState,
  update: PutParticipationTodayResponse
): PopupViewState {
  if (state.kind !== "ready") return state;
  return {
    ...state,
    currentMember: update.participation,
    response: {
      ...state.response,
      participationSummary: update.summary
    },
    participation: state.participation
      ? {
          ...state.participation,
          summary: update.summary,
          members: state.participation.members.map((member) =>
            member.membershipId === update.participation.membershipId
              ? update.participation
              : member
          )
        }
      : undefined
  };
}
```

- [ ] **Step 4: Replace the popup HTML shell**

Replace the `<main>` content in `apps/extension/index.html`:

```html
<main class="popup-shell">
  <header class="popup-header">
    <div class="brand-lockup">
      <span class="brand-mark" aria-hidden="true">♨</span>
      <span><strong>中午吃点啥</strong><small id="active-group-name"></small></span>
    </div>
    <button id="open-settings" class="icon-button" type="button" aria-label="打开设置">⚙</button>
  </header>
  <section id="popup-status" class="status-panel" aria-live="polite"></section>
  <section id="popup-content" class="popup-content"></section>
  <footer id="popup-actions" class="popup-actions" hidden>
    <button id="refresh" class="button secondary" type="button">换一批</button>
    <button id="quick-add" class="button ghost" type="button">加个新店</button>
  </footer>
</main>
<template id="recommendation-card-template">
  <article class="recommendation-card">
    <button class="card-open" type="button">
      <span class="rank"></span><strong class="name"></strong><span class="dish"></span>
      <span class="metadata"></span><span class="reason"></span><span class="chips"></span>
    </button>
  </article>
</template>
```

- [ ] **Step 5: Rewrite popup rendering and event binding**

In `apps/extension/src/popup.ts`, keep one local `currentState` and one `selectedRestaurantId`. Implement named render functions for every `PopupViewState.kind`. Requirements:

```ts
async function reloadPopup(): Promise<void> {
  renderLoading();
  currentState = await loadPopupState({
    loadStorage: getStorageState,
    loadRecommendations: fetchGroupTodayRecommendationsWithCacheFallback,
    loadParticipation: fetchTodayParticipation
  });
  renderPopup(currentState);
}

function renderPopup(state: PopupViewState): void {
  popupContent.replaceChildren();
  popupStatus.replaceChildren();
  activeGroupName.textContent = "group" in state && state.group ? state.group.name : "";
  popupActions.hidden = state.kind !== "ready" && state.kind !== "empty";
  if (state.kind === "disconnected") renderDisconnected();
  if (state.kind === "no-current-batch") renderGenerate(state);
  if (state.kind === "cached") renderRecommendations(state, true);
  if (state.kind === "empty") renderEmpty(state);
  if (state.kind === "ready") renderReady(state);
  if (state.kind === "session-expired") renderReconnect(state);
  if (state.kind === "forbidden") renderForbidden(state);
  if (state.kind === "error") renderError(state.message);
}
```

The ready renderer creates “今天参与” and “今天不吃” controls, reflects `currentMember.status`, and applies the typed PUT response through `applyParticipationUpdate`. Recommendation detail uses the selected item and renders score rows, feedback buttons, and “就决定是你了”. Cached detail renders the same data but sets all write buttons disabled and shows “缓存内容仅供查看”.

All data text uses `textContent`. Inline SVG may be created from hardcoded local markup only; no server value may enter SVG/HTML source.

- [ ] **Step 6: Port production popup CSS**

Replace `apps/extension/styles/popup.css` with these complete warm-paper tokens and popup-specific rules:

```css
:root {
  color-scheme: light;
  --paper: #f6f0e7;
  --surface: #fffdf8;
  --surface-soft: #fbf6ee;
  --ink: #2f2923;
  --muted: #786f66;
  --border: #e6d9ca;
  --accent: #e86f3d;
  --accent-ink: #8c3213;
  --accent-soft: #fde6d7;
  --danger: #a8443a;
  --shadow: 0 18px 55px rgb(75 49 31 / 10%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
}
* { box-sizing: border-box; }
body { width: 390px; min-height: 520px; margin: 0; color: var(--ink); background: var(--paper); }
.popup-shell { min-height: 520px; display: flex; flex-direction: column; background: var(--surface); }
.popup-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.brand-lockup { display: flex; gap: 10px; align-items: center; }
.brand-lockup strong, .brand-lockup small { display: block; }
.brand-lockup small { max-width: 230px; margin-top: 2px; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.brand-mark { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 12px; color: var(--accent-ink); background: var(--accent-soft); }
.icon-button { width: 36px; height: 36px; border: 0; border-radius: 10px; color: var(--muted); background: transparent; cursor: pointer; }
.popup-content { flex: 1; padding: 18px; overflow-y: auto; }
.status-panel:not(:empty) { margin: 12px 18px 0; padding: 12px; border-radius: 12px; color: var(--accent-ink); background: var(--accent-soft); }
.context-line { display: flex; flex-wrap: wrap; gap: 6px; color: var(--muted); font-size: 12px; }
.hero-question { margin: 10px 0 14px; font: 750 24px/1.25 ui-sans-serif, system-ui; letter-spacing: -.03em; }
.hero-question span { color: var(--accent); }
.weather-note { margin-bottom: 12px; padding: 11px 12px; border-radius: 12px; color: #4d6683; background: #edf5fb; }
.participation-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.recommendations { display: grid; gap: 10px; }
.recommendation-card { border: 1px solid var(--border); border-radius: 15px; background: white; box-shadow: 0 8px 24px rgb(75 49 31 / 7%); overflow: hidden; }
.card-open { width: 100%; display: grid; gap: 6px; padding: 14px; border: 0; color: inherit; text-align: left; background: transparent; cursor: pointer; }
.rank { color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.name { font-size: 17px; }
.dish, .metadata { color: var(--muted); font-size: 12px; }
.reason { font-size: 13px; line-height: 1.55; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { padding: 4px 8px; border-radius: 999px; color: var(--accent-ink); background: var(--accent-soft); font-size: 11px; }
.popup-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 18px 16px; border-top: 1px solid var(--border); }
.button { min-height: 40px; border: 0; border-radius: 11px; font-weight: 750; cursor: pointer; }
.button:disabled { cursor: not-allowed; opacity: .52; }
.primary { color: white; background: var(--accent); }
.secondary { color: var(--accent-ink); background: var(--accent-soft); }
.ghost { color: var(--ink); background: var(--surface-soft); }
.detail-panel { display: grid; gap: 12px; }
.score-grid { display: grid; grid-template-columns: 1fr auto; gap: 7px 12px; padding: 12px; border-radius: 12px; background: var(--surface-soft); }
.feedback-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
```

- [ ] **Step 7: Run popup tests, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/extension test -- popupController.test.ts recommendationViewModel.test.ts recommendationClient.test.ts uiAction.test.ts
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
```

Expected: PASS; `dist/index.html` contains the production shell and no faux toolbar/prototype navigation.

- [ ] **Step 8: Commit Task 6**

```bash
git add apps/extension/index.html apps/extension/src/popup.ts apps/extension/src/popupController.ts apps/extension/styles/popup.css apps/extension/tests/popupController.test.ts
git commit -m "feat: rebuild extension lunch popup"
```

---

### Task 7: Quick-Add With Partial-Success Recovery

**Files:**

- Create: `apps/extension/src/quickAddController.ts`
- Create: `apps/extension/tests/quickAddController.test.ts`
- Modify: `apps/extension/src/popup.ts`
- Modify: `apps/extension/styles/popup.css`

**Interfaces:**

- Consumes: Task 3 `createGroupRestaurant`, `createGroupRecommendation`, and captured `GroupApiContext`.
- Produces:
  - `QuickAddInput`
  - `QuickAddState`
  - `createQuickAddController(dependencies)`
  - `submit(input)` and `retryRecommendation()` without duplicate restaurant creation.

- [ ] **Step 1: Write full, first-step failure, and partial-success tests**

Create `apps/extension/tests/quickAddController.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createQuickAddController } from "../src/quickAddController";

const input = {
  name: "巷口砂锅",
  area: "A 楼底商",
  cuisine: "砂锅",
  averagePriceCents: 2800,
  distanceMinutes: 6,
  tags: ["热乎", "近"],
  dish: "番茄肥牛砂锅",
  reason: "下雨天热乎且离得近",
  weatherTags: ["rainy" as const],
  weekdayTags: ["friday" as const],
  moodTags: ["热乎"]
};

describe("extension quick add controller", () => {
  it("creates the restaurant before its first recommendation", async () => {
    const createRestaurant = vi.fn().mockResolvedValue({
      restaurant: { id: "restaurant-1" }
    });
    const createRecommendation = vi.fn().mockResolvedValue({
      recommendation: { id: "recommendation-1" }
    });
    const controller = createQuickAddController({ createRestaurant, createRecommendation });

    await expect(controller.submit(input)).resolves.toMatchObject({ kind: "complete" });
    expect(createRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: "restaurant-1",
      dish: "番茄肥牛砂锅"
    }));
  });

  it("does not call recommendation creation when restaurant creation fails", async () => {
    const createRecommendation = vi.fn();
    const controller = createQuickAddController({
      createRestaurant: vi.fn().mockRejectedValue(new Error("restaurant failed")),
      createRecommendation
    });

    await expect(controller.submit(input)).resolves.toMatchObject({ kind: "restaurant-error" });
    expect(createRecommendation).not.toHaveBeenCalled();
  });

  it("retries only the recommendation after partial success", async () => {
    const createRestaurant = vi.fn().mockResolvedValue({ restaurant: { id: "restaurant-1" } });
    const createRecommendation = vi.fn()
      .mockRejectedValueOnce(new Error("recommendation failed"))
      .mockResolvedValueOnce({ recommendation: { id: "recommendation-1" } });
    const controller = createQuickAddController({ createRestaurant, createRecommendation });

    await expect(controller.submit(input)).resolves.toMatchObject({
      kind: "recommendation-error",
      restaurantId: "restaurant-1"
    });
    await expect(controller.retryRecommendation()).resolves.toMatchObject({ kind: "complete" });
    expect(createRestaurant).toHaveBeenCalledTimes(1);
    expect(createRecommendation).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
pnpm --filter @lunch/extension test -- quickAddController.test.ts
```

Expected: FAIL because `quickAddController.ts` does not exist.

- [ ] **Step 3: Implement the two-step controller**

Create `apps/extension/src/quickAddController.ts` with the explicit state union and controller:

```ts
export type QuickAddState =
  | { kind: "idle" }
  | { kind: "submitting-restaurant" }
  | { kind: "submitting-recommendation"; restaurantId: string }
  | { kind: "restaurant-error"; message: string }
  | { kind: "recommendation-error"; restaurantId: string; message: string }
  | { kind: "complete"; restaurantId: string };

export interface QuickAddInput {
  name: string;
  area?: string | undefined;
  cuisine?: string | undefined;
  averagePriceCents?: number | undefined;
  distanceMinutes?: number | undefined;
  tags: string[];
  dish: string;
  reason: string;
  weatherTags: WeatherTag[];
  weekdayTags: WeekdayTag[];
  moodTags: string[];
}

export function createQuickAddController(dependencies: {
  createRestaurant: (input: CreateRestaurantRequest) => Promise<RestaurantMutationResponse>;
  createRecommendation: (input: CreateRecommendationRequest) => Promise<RecommendationMutationResponse>;
}) {
  let state: QuickAddState = { kind: "idle" };
  let pendingRecommendation: CreateRecommendationRequest | null = null;

  async function saveRecommendation(input: CreateRecommendationRequest): Promise<QuickAddState> {
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

  async function submit(input: QuickAddInput): Promise<QuickAddState> {
    state = { kind: "submitting-restaurant" };
    pendingRecommendation = null;
    try {
      const response = await dependencies.createRestaurant({
        name: input.name.trim(),
        ...(input.area?.trim() ? { area: input.area.trim() } : {}),
        ...(input.cuisine?.trim() ? { cuisine: input.cuisine.trim() } : {}),
        ...(input.averagePriceCents === undefined ? {} : { averagePriceCents: input.averagePriceCents }),
        ...(input.distanceMinutes === undefined ? {} : { distanceMinutes: input.distanceMinutes }),
        tags: input.tags
      });
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

  async function retryRecommendation(): Promise<QuickAddState> {
    if (!pendingRecommendation) throw new Error("quick_add_retry_unavailable");
    return saveRecommendation(pendingRecommendation);
  }

  return { submit, retryRecommendation, getState: () => state };
}
```

Import the request/response types plus `WeatherTag` and `WeekdayTag` from `@lunch/shared` at the top of the file.

- [ ] **Step 4: Add the popup quick-add form and rendering**

In `popup.ts`, render a form when the quick-add action is selected. Use these fields and backend mappings:

- `name` required.
- `area`, `cuisine`, `averagePriceCents`, and `distanceMinutes` optional numeric/text fields.
- `tags` from checked local chips.
- `dish` and `reason` required for the first recommendation.
- `weatherTags`, `weekdayTags`, and `moodTags` from explicit checkboxes.

On `recommendation-error`, keep the form and show two buttons: “重试保存推荐” calls `retryRecommendation`; “完成并返回” returns to the empty/ready popup and reloads. The latter acknowledges the restaurant exists without pretending the recommendation succeeded.

Add `.quick-add-form`, `.field-grid`, `.tag-picker`, `.field-error`, and `.partial-success` styles using existing popup tokens.

- [ ] **Step 5: Run quick-add and popup checks**

Run:

```bash
pnpm --filter @lunch/extension test -- quickAddController.test.ts popupController.test.ts groupClient.test.ts
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add apps/extension/src/quickAddController.ts apps/extension/src/popup.ts apps/extension/styles/popup.css apps/extension/tests/quickAddController.test.ts
git commit -m "feat: add extension restaurant quick entry"
```

---

### Task 8: Standalone Detail And Notification Fallback

**Files:**

- Create: `apps/extension/src/detailController.ts`
- Create: `apps/extension/tests/detailController.test.ts`
- Modify: `apps/extension/detail.html`
- Modify: `apps/extension/src/detail.ts`
- Modify: `apps/extension/styles/detail.css`
- Verify unchanged behavior: `apps/extension/src/background.ts`
- Modify: `plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md`

**Interfaces:**

- Consumes: popup/current-group clients, recommendation view models, group restaurant list, and optional `restaurantId` URL query.
- Produces:
  - `loadDetailState(dependencies, restaurantId?)`
  - `runDetailActionWithContext(state, loadStorage, action)`
  - `applyDetailDecisionUpdate(state, update)`
  - `mergeDetailAnnouncement(state, announcement)`
  - focused or expanded-list detail rendering
  - exact existing notification fallback URL `detail.html`; optional focus remains a detail-page query capability for other entry points.

- [ ] **Step 1: Write detail loading, error-parity, and action-context tests**

Create `apps/extension/tests/detailController.test.ts`:

```ts
import type { PutParticipationTodayResponse } from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import {
  applyDetailDecisionUpdate,
  loadDetailState,
  mergeDetailAnnouncement,
  runDetailActionWithContext
} from "../src/detailController";
import { getDefaultStorageState } from "../src/storage";

describe("standalone detail controller", () => {
  it("focuses the requested restaurant and enriches it with real recommendations", async () => {
    const state = await loadDetailState(detailDependencies(), "restaurant-2");
    expect(state).toMatchObject({
      kind: "ready",
      items: [{ item: { restaurantId: "restaurant-2" } }]
    });
    expect(state.kind === "ready" && state.items[0]?.recommendations).toEqual([
      expect.objectContaining({ reason: "番茄汤底开胃" })
    ]);
  });

  it("keeps cached detail read-only", async () => {
    const state = await loadDetailState(detailDependencies({ fromCache: true }));
    expect(state).toMatchObject({ kind: "cached", readOnly: true });
  });

  it("returns every today item when the notification fallback has no focus", async () => {
    const state = await loadDetailState(detailDependencies());
    expect(state.kind === "ready" && state.items.map(({ item }) => item.restaurantId))
      .toEqual(["restaurant-1", "restaurant-2"]);
  });

  it("keeps fresh today items when optional restaurant enrichment fails", async () => {
    const state = await loadDetailState(detailDependencies({
      loadRestaurants: vi.fn().mockRejectedValue(new TypeError("offline"))
    }));
    expect(state).toMatchObject({
      kind: "ready",
      items: [
        { item: { restaurantId: "restaurant-1" }, recommendations: [] },
        { item: { restaurantId: "restaurant-2" }, recommendations: [] }
      ]
    });
  });

  it("does not request restaurant enrichment for an empty fresh batch", async () => {
    const loadRestaurants = vi.fn();
    const state = await loadDetailState(detailDependencies({
      response: { ...todayResponse(), items: [] },
      loadRestaurants
    }));
    expect(state).toMatchObject({ kind: "ready", items: [] });
    expect(loadRestaurants).not.toHaveBeenCalled();
  });

  it.each([
    [new ExtensionApiError({ kind: "http", status: 404, code: "no_current_batch" }), "no-current-batch"],
    [new ExtensionApiError({ kind: "http", status: 401 }), "session-expired"],
    [new ExtensionApiError({ kind: "http", status: 403 }), "forbidden"]
  ] as const)("maps structured recommendation failure to %s", async (error, kind) => {
    const state = await loadDetailState(detailDependencies({
      loadRecommendations: vi.fn().mockRejectedValue(error)
    }));
    expect(state.kind).toBe(kind);
  });

  it("returns a retryable safe error for network recommendation failure", async () => {
    const state = await loadDetailState(detailDependencies({
      loadRecommendations: vi.fn().mockRejectedValue(new TypeError("offline"))
    }));
    expect(state).toEqual({
      kind: "error",
      message: "暂时无法加载推荐详情，请重试。",
      retryable: true
    });
  });

  it("prevents a rendered group action after the active group changes", async () => {
    const action = vi.fn();
    const result = await runDetailActionWithContext(
      readyDetailState(),
      vi.fn().mockResolvedValue(connectedStorage("group-2")),
      action
    );
    expect(result.kind).toBe("stale");
    expect(action).not.toHaveBeenCalled();
  });

  it("passes one captured storage snapshot to a matching group action", async () => {
    const storage = connectedStorage("group-1");
    const action = vi.fn().mockResolvedValue("saved");
    await expect(runDetailActionWithContext(
      readyDetailState(),
      vi.fn().mockResolvedValue(storage),
      action
    )).resolves.toMatchObject({ kind: "performed", value: "saved" });
    expect(action).toHaveBeenCalledWith(storage);
  });

  it("replaces the local decided restaurant and participation summary", () => {
    const update = participationUpdate("restaurant-2");
    expect(applyDetailDecisionUpdate(readyDetailState("restaurant-1"), update))
      .toMatchObject({
        kind: "ready",
        decidedRestaurantId: "restaurant-2",
        response: { participationSummary: update.summary }
      });
  });

  it.each([
    { groupId: "group-2" },
    { officeDate: "2026-07-11" }
  ])("does not merge a decision from another recommendation batch", (override) => {
    const state = readyDetailState("restaurant-1");
    const update = { ...participationUpdate("restaurant-2"), ...override };
    expect(applyDetailDecisionUpdate(state, update)).toBe(state);
  });

  it("keeps cached content visibly marked when adding an announcement", () => {
    expect(mergeDetailAnnouncement(
      cachedDetailState(),
      "当前小组已切换，已加载当前小组内容，请重新操作。"
    )).toBe(
      "当前小组已切换，已加载当前小组内容，请重新操作。 缓存内容仅供查看"
    );
  });
});
```

The dependency factory returns two today items and a `RestaurantListResponse` containing matching recommendation reasons without relying on `createdByName`. It accepts exact overrides for `response`, `loadRecommendations`, and `loadRestaurants`. `connectedStorage(groupId)` starts from `getDefaultStorageState()` and includes the requested active group, matching group summary, and session token. `readyDetailState(decidedRestaurantId?)` is a fresh `ready` state for `group-1`; `cachedDetailState()` contains the same response with `fromCache: true`, empty enrichment, and `readOnly: true`. `participationUpdate(restaurantId)` returns a typed `PutParticipationTodayResponse` whose member status is `decided` and whose summary has `decidedCount: 1`.

- [ ] **Step 2: Run the expanded detail tests and verify failure**

Run:

```bash
pnpm --filter @lunch/extension test -- detailController.test.ts
```

Expected: FAIL because structured detail states, optional-enrichment fallback, captured action context, batch-safe decision-state replacement, and cached announcement merging are missing.

- [ ] **Step 3: Implement detail loading, popup-equivalent error rules, and pure action state**

Create `detailController.ts` with these exact state and helper contracts:

```ts
import type {
  GroupTodayRecommendationItem,
  GroupTodayRecommendationsResponse,
  PutParticipationTodayResponse,
  RecommendationSummary,
  RestaurantListResponse
} from "@lunch/shared";
import { classifyPopupError } from "./popupController";
import type { ExtensionStorageShape } from "./storage";

export interface DetailItem {
  item: GroupTodayRecommendationItem;
  recommendations: RecommendationSummary[];
}

export type DetailViewState =
  | { kind: "ready"; response: GroupTodayRecommendationsResponse; items: DetailItem[]; readOnly: false; decidedRestaurantId?: string | undefined }
  | { kind: "cached"; response: GroupTodayRecommendationsResponse; items: DetailItem[]; readOnly: true }
  | { kind: "disconnected" }
  | { kind: "no-current-batch" }
  | { kind: "session-expired" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string; retryable: boolean };

export type DetailRecommendationState = Extract<
  DetailViewState,
  { kind: "ready" | "cached" }
>;

export type DetailActionContextResult<T> =
  | { kind: "performed"; storage: ExtensionStorageShape; value: T }
  | { kind: "stale"; storage: ExtensionStorageShape; message: string };

function detailFailureState(error: unknown): DetailViewState {
  const kind = classifyPopupError(error);
  if (kind === "no-current-batch") return { kind };
  if (kind === "session-expired") return { kind };
  if (kind === "forbidden") return { kind };
  return {
    kind: "error",
    message: "暂时无法加载推荐详情，请重试。",
    retryable: true
  };
}

function readyItems(
  response: GroupTodayRecommendationsResponse,
  selected: GroupTodayRecommendationItem[],
  restaurants?: RestaurantListResponse
): Extract<DetailViewState, { kind: "ready" }> {
  const byId = new Map(
    (restaurants?.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant])
  );
  return {
    kind: "ready",
    response,
    readOnly: false,
    items: selected.map((item) => ({
      item,
      recommendations: byId.get(item.restaurantId)?.recommendations ?? []
    }))
  };
}

export async function loadDetailState(
  dependencies: {
    loadRecommendations: () => Promise<GroupTodayRecommendationsResponse>;
    loadRestaurants: () => Promise<RestaurantListResponse>;
  },
  restaurantId?: string
): Promise<DetailViewState> {
  try {
    const response = await dependencies.loadRecommendations();
    const selected = restaurantId
      ? response.items.filter((item) => item.restaurantId === restaurantId)
      : response.items;
    if (restaurantId && selected.length === 0) {
      return {
        kind: "error",
        message: "今天的推荐里没有这家餐厅。",
        retryable: false
      };
    }
    if (response.fromCache) {
      return {
        kind: "cached",
        response,
        readOnly: true,
        items: selected.map((item) => ({ item, recommendations: [] }))
      };
    }
    if (selected.length === 0) return readyItems(response, selected);
    try {
      return readyItems(response, selected, await dependencies.loadRestaurants());
    } catch (error) {
      const kind = classifyPopupError(error);
      if (kind === "session-expired") return { kind };
      if (kind === "forbidden") return { kind };
      return readyItems(response, selected);
    }
  } catch (error) {
    return detailFailureState(error);
  }
}

export async function runDetailActionWithContext<T>(
  state: DetailRecommendationState,
  loadStorage: () => Promise<ExtensionStorageShape>,
  action: (storage: ExtensionStorageShape) => Promise<T>
): Promise<DetailActionContextResult<T>> {
  const storage = await loadStorage();
  const groupId = state.response.groupId;
  if (
    storage.activeGroupId !== groupId
    || !storage.sessionsByGroupId[groupId]?.token
  ) {
    return {
      kind: "stale",
      storage,
      message: "当前小组已切换，已加载当前小组内容，请重新操作。"
    };
  }
  return {
    kind: "performed",
    storage,
    value: await action(storage)
  };
}

export function mergeDetailAnnouncement(
  state: DetailViewState,
  announcement: string
): string {
  return state.kind === "cached"
    ? `${announcement} 缓存内容仅供查看`
    : announcement;
}

export function applyDetailDecisionUpdate(
  state: DetailViewState,
  update: PutParticipationTodayResponse
): DetailViewState {
  if (
    state.kind !== "ready"
    || update.groupId !== state.response.groupId
    || update.officeDate !== state.response.officeDate
    || update.participation.status !== "decided"
    || !update.participation.restaurantId
  ) return state;
  return {
    ...state,
    decidedRestaurantId: update.participation.restaurantId,
    response: {
      ...state.response,
      participationSummary: update.summary
    }
  };
}
```

- [ ] **Step 4: Replace detail HTML and render every recoverable state**

Use this production shell in `detail.html`:

```html
<main class="detail-page">
  <header class="detail-header">
    <a href="index.html" class="brand"><span aria-hidden="true">♨</span>中午吃点啥</a>
    <button id="detail-settings" type="button">设置</button>
  </header>
  <section id="detail-status" aria-live="polite"></section>
  <section id="detail-content" class="detail-content"></section>
</main>
```

`detail.ts` reads `new URLSearchParams(location.search).get("restaurantId")`, captures one storage snapshot for the load, and returns `disconnected` before any request when the active group, matching group summary, or active-group session is missing. It renders these exact recovery states:

- `disconnected`: “请先在设置中连接小组。” plus a settings button.
- `no-current-batch`: “今天还没有生成推荐。” plus an `index.html` link labeled “打开插件生成推荐”.
- `session-expired`: “当前小组连接已失效，请在设置中重新连接。” plus a settings button.
- `forbidden`: “你已被移出当前小组，请在设置中选择其他小组。” plus a settings button.
- retryable `error`: safe message plus a “重试” button that reruns the full load.
- non-retryable focus error: safe message without a retry button.
- `ready` and `cached`: expanded cards; cached state visibly says “缓存内容仅供查看” and creates no write buttons.

Reuse `toRecommendationCardModel` and `scoreBreakdownRows`; do not duplicate formatting. All server values use DOM creation plus `textContent`.

For fresh writes, capture the rendered `DetailRecommendationState` in each handler and call `runDetailActionWithContext`. Pass the returned storage snapshot to `postFeedbackForStorage` or `putTodayParticipationForStorage`; do not call the helpers that reread storage. A stale result reruns the full detail load and displays its stable stale-group message. Map 401/403 action failures to `session-expired`/`forbidden`; keep other action failures inline.

Create one page-level `createExclusiveActionGate`. Every currently enabled feedback and decision button has `data-write-action="true"`; the already-decided button is disabled and omits that attribute. The gate's `onPendingChange` disables or restores the current `[data-write-action="true"]` buttons so two cards cannot submit concurrently without re-enabling the selected decision. After a successful decision, call `applyDetailDecisionUpdate`. If it returns the identical rendered state because the response group/date or participation payload does not match, rerun the full load with “操作结果无法确认，已重新加载当前详情。” and do not show success. Otherwise rerender all cards, label only the chosen restaurant “已决定，就是这家”, and leave other restaurants available for an explicit later switch.

When `reloadDetail(announcement)` receives an announcement, pass the newly loaded state and announcement through `mergeDetailAnnouncement` before assigning `status.textContent`. This preserves the visible “缓存内容仅供查看” marker when a stale action reload falls back to cache.

- [ ] **Step 5: Port detail CSS and keep background side effects isolated**

Replace `apps/extension/styles/detail.css` with these explicit local tokens and layout rules:

```css
:root {
  color-scheme: light;
  --paper: #f6f0e7;
  --surface: #fffdf8;
  --surface-soft: #fbf6ee;
  --ink: #2f2923;
  --muted: #786f66;
  --border: #e6d9ca;
  --accent: #e86f3d;
  --accent-ink: #8c3213;
  --accent-soft: #fde6d7;
  --danger: #a8443a;
  --shadow: 0 18px 55px rgb(75 49 31 / 10%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--paper); }
.detail-page { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 48px; }
.detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.detail-content { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.expanded-card { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); }
.expanded-card h2 { margin: 0; color: var(--ink); font-size: 20px; }
.expanded-meta { color: var(--muted); font-size: 13px; }
.score-grid { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; padding: 12px; border-radius: 12px; background: var(--surface-soft); }
.feedback-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.detail-error { padding: 18px; border-radius: 14px; color: var(--danger); background: #f8e5e2; }
@media (max-width: 820px) { .detail-content { grid-template-columns: 1fr; } }
```

Do not import `background.ts` in tests. Stage 4A notification clicks do not carry a selected restaurant ID, so retain `detail.html` as the exact fallback URL. Keep `chrome.action.openPopup()` as the first attempt and `chrome.tabs.create` as fallback.

- [ ] **Step 6: Run detail, extension regression, typecheck, and build**

Run:

```bash
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
test -f apps/extension/dist/manifest.json
```

Expected: all commands PASS; no extension test imports `background.ts`; manifest exists.

- [ ] **Step 7: Commit Task 8**

```bash
git add plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md apps/extension/detail.html apps/extension/src/detail.ts apps/extension/src/detailController.ts apps/extension/styles/detail.css apps/extension/tests/detailController.test.ts
git commit -m "feat: rebuild extension recommendation detail"
```

---

### Task 9: Stage 4A Documentation, Manual QA, And Full Verification

**Files:**

- Modify: `apps/extension/README.md`
- Create: `qa/2026-07-10-extension-prototype-ui-wiring-stage4a.md`

**Interfaces:**

- Consumes: completed Tasks 1-8 and a local Stage 1-3 server/database.
- Produces: reproducible connection instructions, recorded manual state coverage, and Stage 4A handoff evidence.

- [ ] **Step 1: Update extension usage documentation**

Document these exact user steps in `apps/extension/README.md`:

1. Build and load `apps/extension/dist` unpacked.
2. Open extension settings.
3. Confirm or change API host.
4. Enter a display name and create or join a group.
5. Switch among returned groups without copying tokens.
6. Configure the active group's local reminder override.
7. Open popup and generate a missing current batch.

State that raw tokens are intentionally hidden and that changing API host clears host-specific connection state and cache.

- [ ] **Step 2: Run all automated verification from a fresh build**

Run:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
test -f apps/extension/dist/manifest.json
rg -n '"permissions": \["alarms", "notifications", "storage"\]' apps/extension/dist/manifest.json
rg -n 'identityToken|groupSessionToken' apps/extension/dist/options.html
```

Expected:

- Shared and extension tests PASS.
- Extension typecheck and build PASS.
- Manifest exists with the approved permission list.
- The final `rg` command returns no matches because raw-token fields are absent from production options HTML.

- [ ] **Step 3: Perform Chrome Developer Mode validation**

Use two identities and two groups against the local server. Record PASS/FAIL plus notes for:

- Disconnected popup and settings entry.
- Identity creation, group creation, one-time invite display, and invite join.
- Group list and switch; failed switch leaves the previous group active.
- No-current-batch generate.
- Ready popup with weather available and unavailable.
- Participation joining/away, decision, and four feedback types.
- Cached current-group-only read-only state after stopping the server.
- Session-expired and removed-member state.
- Empty recommendation state and quick-add.
- Quick-add partial success by failing the recommendation request after restaurant creation, then retrying only recommendation creation.
- Popup inline detail and standalone `detail.html` fallback.
- Reminder rescheduling after a group-local override.
- No faux toolbar, prototype nav, static people/restaurants/weather, or history view.

- [ ] **Step 4: Write the QA report with actual evidence**

Create `qa/2026-07-10-extension-prototype-ui-wiring-stage4a.md` only after the checks have run. The report must contain the literal tested commit from `git rev-parse HEAD`, the literal Chrome version from `chrome://version`, the literal server URL used, each command with its observed exit result, and one evidence row for every manual state in Step 3. Under Known Issues, write the observed issues or the single word `None`. Do not pre-create the report with invented results.

- [ ] **Step 5: Run the repository regression required at handoff**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS. If a command fails, record the exact failure in the QA report and do not mark Stage 4A complete.

- [ ] **Step 6: Commit Task 9**

```bash
git add apps/extension/README.md qa/2026-07-10-extension-prototype-ui-wiring-stage4a.md
git commit -m "docs: verify stage 4a extension wiring"
```

## Stage 4A Completion Gate

Spec coverage map:

| Design requirement | Implementing tasks |
| --- | --- |
| Structured errors and existing contract use | Tasks 1 and 3 |
| Locked identity/group/session/host/reminder storage | Tasks 2-4 |
| Product-facing create/join/list/switch settings | Tasks 3-4 |
| Popup states, participation, generate, refresh, feedback, and decision | Tasks 5-6 |
| Current-group-only read-only cache | Tasks 1, 2, 5, and 6 |
| Restaurant plus first-recommendation quick-add and partial recovery | Task 7 |
| Popup detail and standalone notification fallback | Tasks 6 and 8 |
| Prototype visual rules, accessibility, Chrome validation, and handoff | Tasks 4, 6, 8, and 9 |

Before handing Stage 4A to Stage 4B execution, confirm:

- Every task commit exists and focused tests passed immediately before its commit.
- Product options contain no raw token fields.
- Popup, inline detail, standalone detail, quick-add, and settings contain only real API/storage data.
- Cached actions are read-only and group-isolated.
- Current-group session refresh commits before active-group change.
- The two-step quick-add never duplicates the restaurant on recommendation retry.
- Extension permissions did not expand.
- Root tests, typecheck, and build pass.
- The QA report contains only captured results and no invented evidence.
