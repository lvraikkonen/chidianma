import type {
  CreateGroupResponse,
  GroupSessionResponse,
  GroupSummary,
  GroupTodayRecommendationsResponse,
  RefreshGroupSessionResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import {
  createOptionsController,
  type OptionsControllerDependencies,
  type OptionsViewState
} from "../src/optionsController";
import { getDefaultStorageState } from "../src/storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function groupSummary(groupId: string): GroupSummary {
  return {
    groupId,
    name: groupId === "group-1" ? "设计组" : "产品组",
    role: "member",
    membershipId: `membership-${groupId}`
  };
}

function groupSessionResponse(groupId: string): RefreshGroupSessionResponse {
  return {
    identityToken: "fresh-identity-token",
    groupSessionToken: `session-${groupId}`,
    group: groupSummary(groupId)
  };
}

function groupCreationResponse(groupId: string): CreateGroupResponse {
  return {
    ...groupSessionResponse(groupId),
    inviteCode: "ABCD12"
  };
}

function connectedStorage() {
  return {
    ...getDefaultStorageState(),
    identityDisplayName: "小林",
    identityToken: "identity-token",
    activeGroupId: "group-1",
    sessionsByGroupId: {
      "group-1": { token: "session-group-1" }
    },
    groupSummariesById: {
      "group-1": groupSummary("group-1")
    }
  };
}

function cachedRecommendations(groupId: string): GroupTodayRecommendationsResponse {
  return {
    groupId,
    officeDate: "2026-07-10",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-10T03:30:00.000Z",
    participationSummary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: []
  };
}

function storageWithSensitiveGroupState() {
  return {
    ...connectedStorage(),
    readToken: "legacy-read-token",
    reminderTime: "12:20",
    enabled: false,
    lastRecommendationsByGroupId: {
      "group-1": cachedRecommendations("group-1")
    },
    localReminderOverridesByGroupId: {
      "group-1": { reminderTime: "12:45", enabled: true }
    }
  };
}

function clearedConnectionStorage(
  storage: ReturnType<typeof storageWithSensitiveGroupState>,
  apiBaseUrl = storage.apiBaseUrl
) {
  return {
    apiBaseUrl,
    readToken: "",
    reminderTime: storage.reminderTime,
    enabled: storage.enabled,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {},
    groupSettingsCacheByGroupId: {},
    reminderRevision: storage.reminderRevision + 1
  };
}

function optionsDependencies(
  overrides: Partial<OptionsControllerDependencies> = {}
): OptionsControllerDependencies {
  const dependencies: OptionsControllerDependencies = {
    loadStorage: vi.fn().mockResolvedValue(connectedStorage()),
    createIdentity: vi.fn().mockResolvedValue({
      identityId: "identity-1",
      identityToken: "identity-token"
    }),
    createGroup: vi.fn().mockResolvedValue(groupCreationResponse("group-2")),
    joinGroup: vi.fn().mockResolvedValue(groupSessionResponse("group-2")),
    listGroups: vi.fn().mockResolvedValue({
      groups: [groupSummary("group-1")]
    }),
    refreshSession: vi.fn().mockResolvedValue(groupSessionResponse("group-2")),
    saveIdentityConnection: vi.fn().mockResolvedValue(undefined),
    saveGroupConnection: vi.fn().mockResolvedValue(undefined),
    syncGroupSummaries: vi.fn().mockResolvedValue(undefined),
    saveReminder: vi.fn().mockResolvedValue(undefined),
    replaceApiBaseUrl: vi.fn().mockResolvedValue(undefined),
    disconnectIdentity: vi.fn().mockResolvedValue(undefined),
    render: vi.fn()
  };

  return { ...dependencies, ...overrides };
}

function lastRenderedState(render: OptionsControllerDependencies["render"]): OptionsViewState {
  const calls = vi.mocked(render).mock.calls;
  const state = calls.at(-1)?.[0];
  if (!state) throw new Error("expected controller to render");
  return state;
}

type OptionsController = ReturnType<typeof createOptionsController>;

const storageReadingActions: Array<{
  name: string;
  invoke: (controller: OptionsController) => Promise<void>;
}> = [
  {
    name: "createIdentity",
    invoke: (controller) => controller.createIdentity("小林")
  },
  {
    name: "createGroup",
    invoke: (controller) => controller.createGroup({ groupName: "设计组" })
  },
  {
    name: "joinGroup",
    invoke: (controller) => controller.joinGroup("ABCD12")
  },
  {
    name: "switchGroup",
    invoke: (controller) => controller.switchGroup("group-2")
  },
  {
    name: "saveReminder",
    invoke: (controller) => controller.saveReminder({
      reminderTime: "12:00",
      enabled: false
    })
  },
  {
    name: "replaceHost",
    invoke: (controller) => controller.replaceHost("https://lunch.example")
  },
  {
    name: "disconnect",
    invoke: (controller) => controller.disconnect()
  }
];

describe("options controller", () => {
  it("shows a retryable Chinese error when loading from storage rejects", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockRejectedValue(new Error("storage read failed")),
      render
    }));

    await expect(controller.load()).resolves.toBeUndefined();

    expect(lastRenderedState(render)).toMatchObject({
      kind: "identity-required",
      error: "加载设置失败：无法读取浏览器存储。请重试。"
    });
  });

  for (const action of storageReadingActions) {
    it(`resolves ${action.name} with the current ready state when its storage read rejects`, async () => {
      const storage = connectedStorage();
      const loadStorage = vi.fn()
        .mockResolvedValueOnce(storage)
        .mockResolvedValueOnce(storage)
        .mockRejectedValueOnce(new Error("storage read failed"));
      const render = vi.fn();
      const controller = createOptionsController(optionsDependencies({
        loadStorage,
        render
      }));
      await controller.load();
      render.mockClear();

      await expect(action.invoke(controller)).resolves.toBeUndefined();

      expect(render).toHaveBeenCalledOnce();
      expect(lastRenderedState(render)).toEqual({
        kind: "ready",
        storage,
        error: "加载设置失败：无法读取浏览器存储。请重试。"
      });
    });
  }

  it("requests identity setup when no identity is stored", async () => {
    const storage = getDefaultStorageState();
    const listGroups = vi.fn();
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockResolvedValue(storage),
      listGroups,
      render
    }));

    await controller.load();

    expect(listGroups).not.toHaveBeenCalled();
    expect(lastRenderedState(render)).toEqual({
      kind: "identity-required",
      storage
    });
  });

  it("syncs group summaries before rendering the reloaded ready state", async () => {
    const initial = connectedStorage();
    const synced = {
      ...initial,
      groupSummariesById: {
        "group-1": { ...groupSummary("group-1"), name: "最新设计组" }
      }
    };
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(synced);
    const listGroups = vi.fn().mockResolvedValue({
      groups: [synced.groupSummariesById["group-1"]]
    });
    const syncGroupSummaries = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      listGroups,
      syncGroupSummaries,
      render
    }));

    await controller.load("ABCD12");

    expect(listGroups).toHaveBeenCalledWith(
      initial.apiBaseUrl,
      "identity-token"
    );
    expect(syncGroupSummaries).toHaveBeenCalledWith([
      synced.groupSummariesById["group-1"]
    ]);
    expect(lastRenderedState(render)).toEqual({
      kind: "ready",
      storage: synced,
      inviteCode: "ABCD12"
    });
  });

  it("saves a created identity before reloading groups", async () => {
    const storage = getDefaultStorageState();
    const connected = connectedStorage();
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(storage)
      .mockResolvedValueOnce(connected)
      .mockResolvedValueOnce(connected);
    const createIdentity = vi.fn().mockResolvedValue({
      identityId: "identity-1",
      identityToken: "new-identity-token"
    });
    const saveIdentityConnection = vi.fn().mockResolvedValue(undefined);
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      createIdentity,
      saveIdentityConnection
    }));

    await controller.createIdentity("小林");

    expect(createIdentity).toHaveBeenCalledWith(storage.apiBaseUrl, "小林");
    expect(saveIdentityConnection).toHaveBeenCalledWith(
      "小林",
      "new-identity-token"
    );
    expect(loadStorage.mock.invocationCallOrder[1]).toBeGreaterThan(
      saveIdentityConnection.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("maps an expired identity response without surfacing its token", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      createIdentity: vi.fn().mockRejectedValue(new ExtensionApiError({
        kind: "http",
        status: 401,
        message: "identity-token-should-stay-hidden"
      })),
      render
    }));

    await controller.createIdentity("小林");

    const state = lastRenderedState(render);
    expect(state).toMatchObject({
      kind: "identity-required",
      error: "连接已失效，请重新建立身份。"
    });
    expect("error" in state ? state.error : undefined).not.toContain(
      "identity-token"
    );
  });

  it("requires an identity before creating a group", async () => {
    const createGroup = vi.fn();
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockResolvedValue(getDefaultStorageState()),
      createGroup,
      render
    }));

    await controller.createGroup({ groupName: "设计组" });

    expect(createGroup).not.toHaveBeenCalled();
    expect(lastRenderedState(render)).toMatchObject({
      kind: "identity-required",
      error: "请先建立轻量身份。"
    });
  });

  it("saves a created group before showing its invite code", async () => {
    const response = groupCreationResponse("group-2");
    const createGroup = vi.fn().mockResolvedValue(response);
    const saveGroupConnection = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      createGroup,
      saveGroupConnection,
      render
    }));

    await controller.createGroup({ groupName: "产品组" });

    expect(createGroup).toHaveBeenCalledWith(
      "http://localhost:3000",
      "identity-token",
      { groupName: "产品组" }
    );
    expect(saveGroupConnection).toHaveBeenCalledWith(response);
    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      inviteCode: "ABCD12"
    });
  });

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
    expect(JSON.stringify(render.mock.calls.at(-1)?.[0])).not.toContain("session-group-1");
  });

  it("keeps the created group invite when saving its connection rejects", async () => {
    const storage = connectedStorage();
    const response = groupCreationResponse("group-2");
    const saveGroupConnection = vi.fn().mockRejectedValue(
      new Error("group-session-token-should-stay-hidden")
    );
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockResolvedValue(storage),
      createGroup: vi.fn().mockResolvedValue(response),
      saveGroupConnection,
      render
    }));

    await expect(
      controller.createGroup({ groupName: "产品组" })
    ).resolves.toBeUndefined();

    expect(saveGroupConnection).toHaveBeenCalledWith(response);
    const state = lastRenderedState(render);
    expect(state).toEqual({
      kind: "ready",
      storage,
      inviteCode: "ABCD12",
      error: "操作没有完成，请检查网络后重试。"
    });
    expect("error" in state ? state.error : undefined).not.toContain(
      "group-session-token"
    );
  });

  it("keeps the created group invite when the immediate reload storage read rejects", async () => {
    const storage = connectedStorage();
    const response = groupCreationResponse("group-2");
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(storage)
      .mockRejectedValueOnce(new Error("identity-token-should-stay-hidden"));
    const saveGroupConnection = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      createGroup: vi.fn().mockResolvedValue(response),
      saveGroupConnection,
      render
    }));

    await expect(
      controller.createGroup({ groupName: "产品组" })
    ).resolves.toBeUndefined();

    expect(saveGroupConnection).toHaveBeenCalledWith(response);
    expect(lastRenderedState(render)).toEqual({
      kind: "ready",
      storage,
      inviteCode: "ABCD12",
      error: "加载设置失败：无法读取浏览器存储。请重试。"
    });
  });

  it("keeps the created group invite when group listing rejects", async () => {
    const storage = connectedStorage();
    const response = groupCreationResponse("group-2");
    const saveGroupConnection = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockResolvedValue(storage),
      createGroup: vi.fn().mockResolvedValue(response),
      saveGroupConnection,
      listGroups: vi.fn().mockRejectedValue(
        new Error("group-session-token-should-stay-hidden")
      ),
      render
    }));

    await expect(
      controller.createGroup({ groupName: "产品组" })
    ).resolves.toBeUndefined();

    expect(saveGroupConnection).toHaveBeenCalledWith(response);
    expect(lastRenderedState(render)).toEqual({
      kind: "ready",
      storage,
      inviteCode: "ABCD12",
      error: "操作没有完成，请检查网络后重试。"
    });
  });

  it("retains the created identity when group creation fails", async () => {
    const saveIdentity = vi.fn().mockResolvedValue(undefined);
    const disconnectIdentity = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      createIdentity: vi.fn().mockResolvedValue({
        identityId: "identity-1",
        identityToken: "identity-token"
      }),
      saveIdentityConnection: saveIdentity,
      createGroup: vi.fn().mockRejectedValue(new Error("group create failed")),
      disconnectIdentity
    }));

    await controller.createIdentity("小林");
    await expect(
      controller.createGroup({ groupName: "设计组" })
    ).resolves.toBeUndefined();

    expect(saveIdentity).toHaveBeenCalledWith("小林", "identity-token");
    expect(disconnectIdentity).not.toHaveBeenCalled();
  });

  it("requires an identity before joining a group", async () => {
    const joinGroup = vi.fn();
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockResolvedValue(getDefaultStorageState()),
      joinGroup,
      render
    }));

    await controller.joinGroup("ABCD12");

    expect(joinGroup).not.toHaveBeenCalled();
    expect(lastRenderedState(render)).toMatchObject({
      kind: "identity-required",
      error: "请先建立轻量身份。"
    });
  });

  it("saves a joined group session", async () => {
    const response = groupSessionResponse("group-2");
    const joinGroup = vi.fn().mockResolvedValue(response);
    const saveGroupConnection = vi.fn().mockResolvedValue(undefined);
    const controller = createOptionsController(optionsDependencies({
      joinGroup,
      saveGroupConnection
    }));

    await controller.joinGroup("ABCD12");

    expect(joinGroup).toHaveBeenCalledWith(
      "http://localhost:3000",
      "identity-token",
      "ABCD12"
    );
    expect(saveGroupConnection).toHaveBeenCalledWith(response);
  });

  it("maps an invalid invite code to a retryable join error", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      joinGroup: vi.fn().mockRejectedValue(new ExtensionApiError({
        kind: "http",
        status: 404,
        code: "invalid_invite_code"
      })),
      render
    }));

    await controller.joinGroup("BAD123");

    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      error: "邀请码无效或已经失效。"
    });
  });

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
      refreshSession: vi.fn(() =>
        new Promise<RefreshGroupSessionResponse>((resolve) => {
          resolveSession = resolve;
        })
      ),
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
    await vi.waitFor(() => {
      expect(lastRenderedState(render)).toMatchObject({
        kind: "ready",
        storage: { activeGroupId: "group-1" },
        pendingGroupId: "group-2"
      });
    });
    expect(saveGroup).not.toHaveBeenCalled();

    resolveSession(groupSessionResponse("group-2"));
    await switching;

    expect(saveGroup).toHaveBeenCalledWith(groupSessionResponse("group-2"));
  });

  it("keeps the old active group when session refresh reports removal", async () => {
    const storage = connectedStorage();
    const saveGroupConnection = vi.fn();
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage: vi.fn().mockResolvedValue(storage),
      refreshSession: vi.fn().mockRejectedValue(new ExtensionApiError({
        kind: "http",
        status: 403,
        code: "removed_member"
      })),
      saveGroupConnection,
      render
    }));

    await controller.switchGroup("group-2");

    expect(saveGroupConnection).not.toHaveBeenCalled();
    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      storage: { activeGroupId: "group-1" },
      error: "你已被移出该小组，请联系管理员。"
    });
  });

  it("shows a retryable Chinese error when Web Locks is unavailable", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      saveReminder: vi.fn().mockRejectedValue(
        new Error("storage_lock_unavailable")
      ),
      render
    }));

    await expect(controller.saveReminder({
      reminderTime: "12:00",
      enabled: false
    })).resolves.toBeUndefined();

    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      error: "保存设置失败：浏览器暂不支持安全保存。请重试。"
    });
  });

  it("shows a retryable Chinese error when reminder storage save rejects", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      saveReminder: vi.fn().mockRejectedValue(new Error("storage write failed")),
      render
    }));

    await expect(controller.saveReminder({
      reminderTime: "12:00",
      enabled: false
    })).resolves.toBeUndefined();

    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      error: "保存设置失败：无法写入浏览器存储。请重试。"
    });
  });

  it("reloads settings only after reminder storage save completes", async () => {
    let finishSave!: () => void;
    const saveReminder = vi.fn(() => new Promise<void>((resolve) => {
      finishSave = resolve;
    }));
    const loadStorage = vi.fn().mockResolvedValue(connectedStorage());
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      saveReminder,
      render
    }));

    const saving = controller.saveReminder({
      reminderTime: "12:00",
      enabled: false
    });
    await vi.waitFor(() => expect(saveReminder).toHaveBeenCalledOnce());

    expect(loadStorage).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();

    finishSave();
    await saving;

    expect(loadStorage).toHaveBeenCalledTimes(3);
    expect(lastRenderedState(render)).toMatchObject({ kind: "ready" });
  });

  it("replaces the API host before reloading", async () => {
    const replaceApiBaseUrl = vi.fn().mockResolvedValue(undefined);
    const loadStorage = vi.fn().mockResolvedValue(connectedStorage());
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      replaceApiBaseUrl
    }));

    await controller.replaceHost("https://lunch.example");

    expect(replaceApiBaseUrl).toHaveBeenCalledWith("https://lunch.example");
    expect(loadStorage).toHaveBeenCalledTimes(3);
  });

  it("reports an API host persistence failure", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      replaceApiBaseUrl: vi.fn().mockRejectedValue(new Error("write failed")),
      render
    }));

    await controller.replaceHost("https://lunch.example");

    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      error: "API 地址没有保存，请重试。"
    });
  });

  it("uses a normalized connection-cleared host fallback when reload fails after replacement", async () => {
    const storage = storageWithSensitiveGroupState();
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(storage)
      .mockResolvedValueOnce(storage)
      .mockResolvedValueOnce(storage)
      .mockRejectedValueOnce(new Error("post-replacement read failed"));
    const replaceApiBaseUrl = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      replaceApiBaseUrl,
      render
    }));
    await controller.load();
    render.mockClear();

    await controller.replaceHost("https://new.example/path/../");

    expect(replaceApiBaseUrl).toHaveBeenCalledWith(
      "https://new.example/path/../"
    );
    expect(lastRenderedState(render)).toEqual({
      kind: "identity-required",
      storage: clearedConnectionStorage(storage, "https://new.example"),
      error: "加载设置失败：无法读取浏览器存储。请重试。"
    });
  });

  it("disconnects the identity before returning to identity setup", async () => {
    const disconnectedStorage = getDefaultStorageState();
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(connectedStorage())
      .mockResolvedValueOnce(disconnectedStorage);
    const disconnectIdentity = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      disconnectIdentity,
      render
    }));

    await controller.disconnect();

    expect(disconnectIdentity).toHaveBeenCalledOnce();
    expect(lastRenderedState(render)).toEqual({
      kind: "identity-required",
      storage: disconnectedStorage
    });
  });

  it("reports an identity disconnect persistence failure", async () => {
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      disconnectIdentity: vi.fn().mockRejectedValue(new Error("write failed")),
      render
    }));

    await controller.disconnect();

    expect(lastRenderedState(render)).toMatchObject({
      kind: "ready",
      error: "断开连接失败，请重试。"
    });
  });

  it("uses a connection-cleared fallback when reload fails after disconnect", async () => {
    const storage = storageWithSensitiveGroupState();
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(storage)
      .mockResolvedValueOnce(storage)
      .mockResolvedValueOnce(storage)
      .mockRejectedValueOnce(new Error("post-disconnect read failed"));
    const disconnectIdentity = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn();
    const controller = createOptionsController(optionsDependencies({
      loadStorage,
      disconnectIdentity,
      render
    }));
    await controller.load();
    render.mockClear();

    await controller.disconnect();

    expect(disconnectIdentity).toHaveBeenCalledOnce();
    expect(lastRenderedState(render)).toEqual({
      kind: "identity-required",
      storage: clearedConnectionStorage(storage),
      error: "加载设置失败：无法读取浏览器存储。请重试。"
    });
  });
});
