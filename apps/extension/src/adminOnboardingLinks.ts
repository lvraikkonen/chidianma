import type { GroupCapabilitiesResponse } from "@lunch/shared";

export type AdminOnboardingMode = "bulk" | "nearby";

export interface AdminOnboardingAction {
  mode: AdminOnboardingMode;
  label: string;
}

export interface AdminOnboardingLink extends AdminOnboardingAction {
  url: string;
}

interface AdminOnboardingAvailability {
  group?: { groupId: string } | undefined;
  features?: Partial<GroupCapabilitiesResponse["features"]> | undefined;
}

export function availableAdminOnboardingActions(
  input: AdminOnboardingAvailability
): AdminOnboardingAction[] {
  if (!input.group || !input.features) return [];
  const actions: AdminOnboardingAction[] = [];
  if (input.features.restaurantBulkImport === true) {
    actions.push({ mode: "bulk", label: "批量粘贴" });
  }
  if (input.features.poiReferenceSearch === true) {
    actions.push({ mode: "nearby", label: "搜索附近餐厅" });
  }
  return actions;
}

export function adminOnboardingLinks(
  input: AdminOnboardingAvailability & { apiBaseUrl: string }
): AdminOnboardingLink[] {
  const actions = availableAdminOnboardingActions(input);
  const group = input.group;
  if (!group || actions.length === 0) return [];
  const adminRoot = `${new URL(input.apiBaseUrl).origin}/`;
  return actions.map(({ mode, label }) => {
    const params = new URLSearchParams({
      groupId: group.groupId,
      mode
    });
    return {
      mode,
      label,
      url: `${adminRoot}#restaurants?${params.toString()}`
    };
  });
}

export async function openAdminOnboardingLink<
  Storage extends { apiBaseUrl: string }
>(
  input: AdminOnboardingAvailability & { mode: AdminOnboardingMode },
  dependencies: {
    loadStorage: () => Promise<Storage>;
    contextMatches: (storage: Storage) => boolean;
    reloadPopup: (storage: Storage) => Promise<void>;
    openTab: (url: string) => Promise<unknown>;
  }
): Promise<"opened" | "stale" | "unavailable"> {
  const storage = await dependencies.loadStorage();
  if (!dependencies.contextMatches(storage)) {
    await dependencies.reloadPopup(storage);
    return "stale";
  }
  const link = adminOnboardingLinks({
    ...input,
    apiBaseUrl: storage.apiBaseUrl
  }).find((candidate) => candidate.mode === input.mode);
  if (!link) return "unavailable";
  await dependencies.openTab(link.url);
  return "opened";
}
