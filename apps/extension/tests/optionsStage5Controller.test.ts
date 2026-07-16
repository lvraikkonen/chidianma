import type {
  GroupSettingsResponse,
  PersonalLunchHistoryResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import {
  createOptionsController,
  type OptionsControllerDependencies,
  type OptionsViewState
} from "../src/optionsController";
import type { ExtensionGroupContext } from "../src/stage5Client";
import {
  getDefaultStorageState,
  type ExtensionStorageShape
} from "../src/storage";

function groupSummary(groupId: string, membershipId: string) {
  return { groupId, name: groupId, role: "member" as const, membershipId };
}

function connectedStorage(
  groupId = "group-1",
  membershipId = "membership-1",
  token = "token-1"
): ExtensionStorageShape {
  return {
    ...getDefaultStorageState(),
    apiBaseUrl: "https://lunch.example",
    identityToken: "identity-token",
    identityDisplayName: "小林",
    activeGroupId: groupId,
    sessionsByGroupId: { [groupId]: { token } },
    groupSummariesById: {
      [groupId]: groupSummary(groupId, membershipId)
    }
  };
}

function settings(groupId = "group-1"): GroupSettingsResponse {
  return {
    groupId,
    group: {
      name: groupId,
      officeTimezone: "Asia/Shanghai",
      officeCity: "上海",
      officeLatitude: 31.23,
      officeLongitude: 121.47
    },
    reminder: {
      reminderTime: "11:30",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false,
      notificationTitle: "午饭时间"
    },
    scoringWeights: {
      weekdayMatch: 20,
      weatherMatch: 20,
      distance: 20,
      teammateRecommendation: 20,
      recentDuplicatePenalty: 20,
      negativeFeedbackPenalty: 20
    },
    invite: { version: 1, rotatedAt: "2026-07-14T00:00:00.000Z" }
  };
}

function history(
  groupId = "group-1",
  membershipId = "membership-1"
): PersonalLunchHistoryResponse {
  return {
    groupId,
    membershipId,
    window: { startDate: "2026-06-15", endDate: "2026-07-14" },
    items: [],
    preference: { status: "insufficient", decidedCount: 0 }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixture(initial = connectedStorage()) {
  let storage = structuredClone(initial);
  const render = vi.fn();
  const dependencies: OptionsControllerDependencies = {
    loadStorage: vi.fn(async () => structuredClone(storage)),
    createIdentity: vi.fn(),
    redeemIdentityLinkCode: vi.fn(),
    createIdentityLinkCode: vi.fn(),
    resetIdentitySessions: vi.fn(),
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
    listGroups: vi.fn(async () => ({
      groups: Object.values(storage.groupSummariesById)
    })),
    refreshSession: vi.fn(async (_api, _identity, groupId) => ({
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: `refreshed-${groupId}`,
      groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      group: storage.groupSummariesById[groupId]!
    })),
    saveIdentityConnection: vi.fn(),
    saveRenewedIdentityConnection: vi.fn(),
    saveResetIdentityConnection: vi.fn(),
    refreshIdentitySession: vi.fn(async () => ({
      identityId: "identity-1",
      displayName: "小林",
      identityToken: storage.identityToken ?? "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z"
    })),
    saveGroupConnection: vi.fn(async (response) => {
      storage.activeGroupId = response.group.groupId;
      storage.identityToken = response.identityToken;
      storage.sessionsByGroupId[response.group.groupId] = {
        token: response.groupSessionToken
      };
      storage.groupSummariesById[response.group.groupId] = response.group;
    }),
    syncGroupSummaries: vi.fn(),
    saveReminder: vi.fn(),
    replaceApiBaseUrl: vi.fn(),
    disconnectIdentity: vi.fn(),
    getGroupSettingsForContext: vi.fn(async (context) => settings(context.groupId)),
    getPersonalHistoryForContext: vi.fn(async (context) => history(
      context.groupId,
      context.membershipId
    )),
    saveGroupSettingsCache: vi.fn(),
    clearGroupSession: vi.fn(async (groupId) => {
      delete storage.sessionsByGroupId[groupId];
    }),
    saveGroupReminderOverride: vi.fn(),
    clearGroupReminderOverride: vi.fn(),
    render
  };
  return {
    dependencies,
    render,
    getStorage: () => storage,
    setStorage: (next: ExtensionStorageShape) => { storage = next; }
  };
}

function lastState(render: ReturnType<typeof vi.fn>): OptionsViewState {
  return render.mock.calls.at(-1)![0] as OptionsViewState;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stage 5 options resources", () => {
  it("loads settings and history independently in parallel", async () => {
    const test = fixture();
    vi.mocked(test.dependencies.getPersonalHistoryForContext!)
      .mockRejectedValue(new TypeError("offline"));
    const controller = createOptionsController(test.dependencies);

    await controller.load();

    expect(lastState(test.render)).toMatchObject({
      kind: "ready",
      groupSettings: { status: "ready", data: { groupId: "group-1" } },
      personalHistory: { status: "error" }
    });
    expect(test.dependencies.getGroupSettingsForContext).toHaveBeenCalledOnce();
    expect(test.dependencies.getPersonalHistoryForContext).toHaveBeenCalledOnce();
  });

  it("clears the identity when a resource still returns 401 after client retry", async () => {
    const test = fixture();
    const settingsClient = vi.mocked(test.dependencies.getGroupSettingsForContext!);
    const historyClient = vi.mocked(test.dependencies.getPersonalHistoryForContext!);
    settingsClient.mockRejectedValue(
      new ExtensionApiError({ kind: "http", status: 401 })
    );
    historyClient.mockRejectedValue(
      new ExtensionApiError({ kind: "http", status: 401 })
    );
    const controller = createOptionsController(test.dependencies);

    await controller.load();

    expect(test.dependencies.refreshSession).toHaveBeenCalledTimes(1);
    expect(test.dependencies.disconnectIdentity).toHaveBeenCalledTimes(1);
    expect(test.dependencies.clearGroupSession).not.toHaveBeenCalled();
    expect(lastState(test.render)).toMatchObject({
      kind: "identity-required",
      error: "连接已失效，请重新建立身份。"
    });
  });

  it("clears the identity when startup group-session renewal is unauthorized", async () => {
    const test = fixture();
    vi.mocked(test.dependencies.refreshSession).mockRejectedValue(
      new ExtensionApiError({ kind: "http", status: 401 })
    );
    const controller = createOptionsController(test.dependencies);

    await controller.load();

    expect(test.dependencies.refreshSession).toHaveBeenCalledTimes(1);
    expect(test.dependencies.disconnectIdentity).toHaveBeenCalledTimes(1);
    expect(test.dependencies.clearGroupSession).not.toHaveBeenCalled();
    expect(test.dependencies.getGroupSettingsForContext).not.toHaveBeenCalled();
    expect(test.dependencies.getPersonalHistoryForContext).not.toHaveBeenCalled();
    expect(lastState(test.render)).toMatchObject({
      kind: "identity-required",
      error: "连接已失效，请重新建立身份。"
    });
  });

  it("clears and resynchronizes a removed active membership", async () => {
    const test = fixture();
    vi.mocked(test.dependencies.getGroupSettingsForContext!).mockRejectedValue(
      new ExtensionApiError({
        kind: "http",
        status: 403,
        code: "active_membership_required"
      })
    );
    const controller = createOptionsController(test.dependencies);

    await controller.load();

    expect(test.dependencies.clearGroupSession).toHaveBeenCalledWith("group-1");
    expect(test.dependencies.listGroups).toHaveBeenCalledTimes(2);
    expect(test.dependencies.syncGroupSummaries).toHaveBeenCalledTimes(2);
    expect(lastState(test.render)).toMatchObject({
      kind: "ready",
      error: "身份连接已失效，请重新连接当前小组。"
    });
  });

  it("drops late group A resources after a new group B load", async () => {
    const test = fixture();
    const lateSettings = deferred<GroupSettingsResponse>();
    vi.mocked(test.dependencies.getGroupSettingsForContext!)
      .mockImplementation((context: ExtensionGroupContext) => context.groupId === "group-1"
        ? lateSettings.promise
        : Promise.resolve(settings("group-2")));
    const controller = createOptionsController(test.dependencies);
    const firstLoad = controller.load();
    await vi.waitFor(() => {
      expect(test.dependencies.getGroupSettingsForContext).toHaveBeenCalled();
    });
    test.setStorage(connectedStorage("group-2", "membership-2", "token-2"));

    await controller.load();
    lateSettings.resolve(settings("group-1"));
    await firstLoad;

    expect(lastState(test.render)).toMatchObject({
      storage: { activeGroupId: "group-2" },
      groupSettings: { status: "ready", data: { groupId: "group-2" } },
      personalHistory: {
        status: "ready",
        data: { groupId: "group-2", membershipId: "membership-2" }
      }
    });
    expect(test.dependencies.saveGroupSettingsCache)
      .not.toHaveBeenCalledWith("group-1", expect.anything(), expect.anything());
  });

  it("invalidates old resources as soon as a group switch starts", async () => {
    const test = fixture();
    const lateSettings = deferred<GroupSettingsResponse>();
    const lateSwitch = deferred<Awaited<ReturnType<
      OptionsControllerDependencies["refreshSession"]
    >>>();
    vi.mocked(test.dependencies.getGroupSettingsForContext!)
      .mockReturnValue(lateSettings.promise);
    vi.mocked(test.dependencies.refreshSession)
      .mockResolvedValueOnce({
        identityToken: "identity-token",
        identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
        groupSessionToken: "refreshed-group-1",
        groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
        group: groupSummary("group-1", "membership-1")
      })
      .mockReturnValueOnce(lateSwitch.promise);
    const controller = createOptionsController(test.dependencies);
    const firstLoad = controller.load();
    await vi.waitFor(() => {
      expect(test.dependencies.getGroupSettingsForContext).toHaveBeenCalled();
    });

    const switching = controller.switchGroup("group-2");
    await vi.waitFor(() => {
      expect(test.dependencies.refreshSession).toHaveBeenCalled();
    });
    lateSettings.resolve(settings("group-1"));
    await firstLoad;

    expect(test.dependencies.saveGroupSettingsCache)
      .not.toHaveBeenCalledWith("group-1", expect.anything(), expect.anything());
    expect(lastState(test.render)).toMatchObject({
      kind: "ready",
      pendingGroupId: "group-2"
    });
    expect(lastState(test.render)).not.toHaveProperty("groupSettings");

    lateSwitch.resolve({
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "token-2",
      groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      group: groupSummary("group-2", "membership-2")
    });
    await switching;
  });

  it("saves a local reminder without reloading personal history", async () => {
    const test = fixture();
    const controller = createOptionsController(test.dependencies);
    await controller.load();
    vi.mocked(test.dependencies.getPersonalHistoryForContext!).mockClear();

    await controller.saveReminderOverride({
      reminderTime: "12:05",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false
    });

    expect(test.dependencies.saveGroupReminderOverride).toHaveBeenCalledWith(
      "group-1",
      {
        reminderTime: "12:05",
        weekdayReminderEnabled: true,
        secondReminderEnabled: false
      }
    );
    expect(test.dependencies.getPersonalHistoryForContext).not.toHaveBeenCalled();
  });
});
