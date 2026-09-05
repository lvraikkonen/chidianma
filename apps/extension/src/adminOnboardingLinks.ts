import type { GroupCapabilitiesResponse } from "@lunch/shared";

export type AdminOnboardingMode = "bulk" | "nearby";

export interface AdminOnboardingLink {
  mode: AdminOnboardingMode;
  label: string;
  url: string;
}

export function adminOnboardingLinks(input: {
  apiBaseUrl: string;
  group?: { groupId: string } | undefined;
  features?: Partial<GroupCapabilitiesResponse["features"]> | undefined;
}): AdminOnboardingLink[] {
  if (!input.group || !input.features) return [];
  const modes: Array<{ mode: AdminOnboardingMode; label: string }> = [];
  if (input.features.restaurantBulkImport === true) {
    modes.push({ mode: "bulk", label: "批量粘贴" });
  }
  if (input.features.poiReferenceSearch === true) {
    modes.push({ mode: "nearby", label: "搜索附近餐厅" });
  }
  const adminRoot = `${new URL(input.apiBaseUrl).origin}/`;
  return modes.map(({ mode, label }) => {
    const params = new URLSearchParams({
      groupId: input.group!.groupId,
      mode
    });
    return {
      mode,
      label,
      url: `${adminRoot}#restaurants?${params.toString()}`
    };
  });
}
