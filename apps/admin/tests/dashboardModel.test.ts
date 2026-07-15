import type { DashboardResponse, RecommendationHistoryResponse } from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../src/api";
import {
  appendHistory,
  loadDashboardWorkspace,
  type DashboardWorkspaceState
} from "../src/features/dashboard/dashboardModel";

const dashboard = { groupId: "group-1" } as DashboardResponse;
const history: RecommendationHistoryResponse = {
  groupId: "group-1",
  items: [{ batchId: "batch-2" }, { batchId: "batch-1" }] as RecommendationHistoryResponse["items"],
  nextCursor: "next"
};

describe("dashboard model", () => {
  it("keeps a successful resource when its sibling load fails", async () => {
    const state = await loadDashboardWorkspace({
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      getHistory: vi.fn().mockRejectedValue(new Error("offline"))
    });
    expect(state).toEqual({
      kind: "ready",
      dashboard: { kind: "ready", value: dashboard },
      history: { kind: "error", message: "暂时无法加载推荐记录，请重试。" }
    });
  });

  it("promotes membership failures to the page boundary", async () => {
    const state = await loadDashboardWorkspace({
      getDashboard: vi.fn().mockRejectedValue(new AdminApiError({ kind: "http", status: 403, code: "active_membership_required" })),
      getHistory: vi.fn().mockResolvedValue(history)
    });
    expect(state).toEqual({ kind: "forbidden" });
  });

  it("appends cursor pages without duplicating batch ids and retains loaded data on failure", async () => {
    const state: DashboardWorkspaceState = {
      kind: "ready",
      dashboard: { kind: "ready", value: dashboard },
      history: { kind: "ready", items: history.items, nextCursor: "next", loadingMore: false }
    };
    const appended = await appendHistory(state, vi.fn().mockResolvedValue({
      groupId: "group-1",
      items: [{ batchId: "batch-1" }, { batchId: "batch-0" }],
      nextCursor: undefined
    }));
    expect(appended.kind === "ready" && appended.history.kind === "ready"
      ? appended.history.items.map((item) => item.batchId)
      : []).toEqual(["batch-2", "batch-1", "batch-0"]);

    const failed = await appendHistory(state, vi.fn().mockRejectedValue(new Error("offline")));
    expect(failed.kind === "ready" && failed.history.kind === "ready" ? failed.history : null).toMatchObject({
      items: history.items,
      loadMoreError: "加载更多失败，已加载的记录仍然保留。"
    });
  });
});
