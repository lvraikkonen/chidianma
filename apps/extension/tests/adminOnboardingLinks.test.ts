import { describe, expect, it, vi } from "vitest";
import {
  adminOnboardingLinks,
  availableAdminOnboardingActions,
  openAdminOnboardingLink
} from "../src/adminOnboardingLinks";
import {
  popupActionContextMatches,
  type PopupViewState
} from "../src/popupController";
import { getDefaultStorageState } from "../src/storage";

describe("Admin restaurant onboarding links", () => {
  it("formats canonical credential-free links with the current group ID", () => {
    const links = adminOnboardingLinks({
      apiBaseUrl: "https://identity:secret@lunch.example/api?token=secret#old",
      group: { groupId: "group/一" },
      features: {
        restaurantBulkImport: true,
        poiReferenceSearch: true,
        poiReferenceDraft: true
      }
    });

    expect(links).toEqual([
      {
        mode: "bulk",
        label: "批量粘贴",
        url: "https://lunch.example/#restaurants?groupId=group%2F%E4%B8%80&mode=bulk"
      },
      {
        mode: "nearby",
        label: "搜索附近餐厅",
        url: "https://lunch.example/#restaurants?groupId=group%2F%E4%B8%80&mode=nearby"
      }
    ]);
    expect(links.map((link) => link.url).join("\n")).not.toMatch(
      /identity|secret|token/i
    );
  });

  it("fails closed without a validated membership or enabled capability", () => {
    expect(adminOnboardingLinks({
      apiBaseUrl: "https://lunch.example",
      features: { restaurantBulkImport: true, poiReferenceSearch: true }
    })).toEqual([]);
    expect(adminOnboardingLinks({
      apiBaseUrl: "https://lunch.example",
      group: { groupId: "group-1" }
    })).toEqual([]);
    expect(adminOnboardingLinks({
      apiBaseUrl: "https://lunch.example",
      group: { groupId: "group-1" },
      features: {
        restaurantBulkImport: false,
        poiReferenceSearch: false,
        poiReferenceDraft: true
      }
    })).toEqual([]);
  });

  it.each([
    [
      "bulk only",
      { restaurantBulkImport: true, poiReferenceSearch: false },
      [{ mode: "bulk", label: "批量粘贴" }]
    ],
    [
      "nearby search only",
      { restaurantBulkImport: false, poiReferenceSearch: true },
      [{ mode: "nearby", label: "搜索附近餐厅" }]
    ]
  ] as const)("uses the shared action selector for %s capability", (
    _case,
    features,
    expected
  ) => {
    expect(availableAdminOnboardingActions({
      group: { groupId: "group-1" },
      features
    })).toEqual(expected);
    expect(adminOnboardingLinks({
      apiBaseUrl: "https://lunch.example",
      group: { groupId: "group-1" },
      features
    }).map(({ mode, label }) => ({ mode, label }))).toEqual(expected);
  });

  it("opens the selected current-group destination without reloading", async () => {
    const state = hostState();
    const storage = currentStorage();
    const reloadPopup = vi.fn();
    const openTab = vi.fn();

    await expect(openAdminOnboardingLink({
      group: state.group,
      features: state.capabilities.features,
      mode: "bulk"
    }, {
      loadStorage: async () => storage,
      contextMatches: (candidate) => popupActionContextMatches(state, candidate),
      reloadPopup,
      openTab
    })).resolves.toBe("opened");

    expect(reloadPopup).not.toHaveBeenCalled();
    expect(openTab).toHaveBeenCalledWith(
      "http://localhost:3000/#restaurants?groupId=group-1&mode=bulk"
    );
  });

  it.each([
    ["active group changed", { activeGroupId: "group-2" }],
    ["active session disappeared", { sessionsByGroupId: {} }]
  ])("reloads after %s without opening a tab", async (_case, patch) => {
    const state = hostState();
    const storage = { ...currentStorage(), ...patch };
    const reloadPopup = vi.fn().mockResolvedValue(undefined);
    const openTab = vi.fn();

    await expect(openAdminOnboardingLink({
      group: state.group,
      features: state.capabilities.features,
      mode: "bulk"
    }, {
      loadStorage: async () => storage,
      contextMatches: (candidate) => popupActionContextMatches(state, candidate),
      reloadPopup,
      openTab
    })).resolves.toBe("stale");

    expect(reloadPopup).toHaveBeenCalledWith(storage);
    expect(openTab).not.toHaveBeenCalled();
  });
});

function hostState(): Extract<PopupViewState, { kind: "empty" }> {
  return {
    kind: "empty",
    group: {
      groupId: "group-1",
      name: "午饭组",
      role: "member",
      membershipId: "membership-1"
    },
    capabilities: {
      groupId: "group-1",
      features: {
        restaurantBulkImport: true,
        luckyRestaurantWheel: false,
        poiReferenceSearch: true,
        poiReferenceDraft: true,
        poiOfficePreset: false,
        poiProvider: "amap"
      }
    },
    response: {
      groupId: "group-1",
      officeDate: "2026-09-05",
      batchId: "batch-1",
      batchNo: 1,
      generatedAt: "2026-09-05T04:00:00.000Z",
      participationSummary: {
        joiningCount: 0,
        decidedCount: 0,
        awayCount: 0,
        undecidedCount: 1
      },
      items: []
    }
  };
}

function currentStorage() {
  return {
    ...getDefaultStorageState(),
    activeGroupId: "group-1",
    sessionsByGroupId: { "group-1": { token: "group-session-token" } },
    groupSummariesById: { "group-1": hostState().group }
  };
}
