import type { PoiCandidate, PoiSearchResponse, RestaurantImportRequest } from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import {
  availableOnboardingModes,
  createImportController,
  bulkImportAction,
  createNearbySearchController,
  createPasteDraft,
  nearbyCapabilityView
} from "../src/features/restaurants/onboardingModel";

function candidate(placeId: string): PoiCandidate {
  return {
    provider: "mock",
    placeId,
    name: `餐厅 ${placeId}`,
    address: `地址 ${placeId}`,
    category: "餐饮",
    latitude: 31,
    longitude: 121,
    coordinateSystem: "GCJ02",
    distanceMeters: 320,
    ticket: `ticket-${placeId}`
  };
}

function response(page: number, ids: string[]): PoiSearchResponse {
  return {
    provider: "mock",
    attribution: "模拟数据，仅供测试",
    page,
    radius: 3000,
    hasMore: page < 3,
    candidates: ids.map(candidate)
  };
}

describe("restaurant onboarding model", () => {
  it("gates bulk and nearby modes independently from current capabilities", () => {
    expect(availableOnboardingModes({
      restaurantBulkImport: true,
      poiReferenceSearch: false,
      poiReferenceDraft: true
    })).toEqual({ bulk: true, nearbySearch: false, nearbySave: true });
    expect(availableOnboardingModes({
      poiReferenceSearch: true,
      poiReferenceDraft: false
    })).toEqual({ bulk: false, nearbySearch: true, nearbySave: false });
  });

  it("retains selected nearby work when search becomes disabled but save stays enabled", () => {
    expect(nearbyCapabilityView({
      poiReferenceSearch: true,
      poiReferenceDraft: true
    }, true, true)).toEqual({ showSearchControls: true, showRetainedWork: true });

    expect(nearbyCapabilityView({
      poiReferenceSearch: false,
      poiReferenceDraft: true
    }, true, true)).toEqual({ showSearchControls: false, showRetainedWork: true });
  });

  it("integrates shared paste parsing into editable selected rows", () => {
    const draft = createPasteDraft("面馆\t一楼\n\n  饺子馆  \n坏\t列\t多了");

    expect(draft.rows.map((row) => [row.rowId, row.name, row.address, row.selected, row.error])).toEqual([
      ["line-1", "面馆", "一楼", true, undefined],
      ["line-3", "饺子馆", "", true, undefined],
      ["line-4", "坏", "列", false, "too_many_columns"]
    ]);
  });

  it("defaults known duplicates and ambiguous name-only branches to skipped preview rows", () => {
    const draft = createPasteDraft(
      "验收小面馆\n验收食堂\n新餐厅\t三楼",
      [
        { name: "验收小面馆", address: "" },
        { name: "验收食堂", address: "一楼" }
      ]
    );

    expect(draft.rows.map((row) => [row.selected, row.hint])).toEqual([
      [false, "duplicate"],
      [false, "ambiguous_branch"],
      [true, undefined]
    ]);
  });

  it("retries an uncertain import with the exact request object and corrects only rejected rows with a new ID", async () => {
    const original: RestaurantImportRequest = {
      requestId: "request-original",
      rows: [
        { rowId: "line-1", kind: "manual", name: "面馆" },
        { rowId: "line-2", kind: "manual", name: "砂锅", address: "" }
      ]
    };
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        requestId: "request-original",
        results: [
          { rowId: "line-1", status: "created", code: "created", message: "created" },
          { rowId: "line-2", status: "rejected", code: "ambiguous_branch", message: "address needed" }
        ]
      })
      .mockResolvedValueOnce({
        requestId: "request-correction",
        results: [{ rowId: "line-2", status: "created", code: "created", message: "created" }]
      });
    const ids = ["request-correction"];
    const controller = createImportController({ submit, createRequestId: () => ids.shift()! });

    await controller.submit(original);
    expect(controller.getState()).toMatchObject({ kind: "recovery", request: original });
    await controller.submit({ requestId: "must-not-replace", rows: [original.rows[0]!] });
    expect(submit).toHaveBeenCalledTimes(1);
    await controller.retry();
    expect(submit.mock.calls[1]![0]).toBe(original);
    await controller.correctRejected({
      "line-2": { rowId: "line-2", kind: "manual", name: "砂锅", address: "二楼", confirmSeparateBranch: true }
    });

    expect(submit.mock.calls[2]![0]).toEqual({
      requestId: "request-correction",
      rows: [{ rowId: "line-2", kind: "manual", name: "砂锅", address: "二楼", confirmSeparateBranch: true }]
    });
  });

  it("keeps resolved rows and every receipt ID visible when a correction response is lost", async () => {
    const original: RestaurantImportRequest = {
      requestId: "request-original",
      rows: [
        { rowId: "line-1", kind: "manual", name: "面馆" },
        { rowId: "line-2", kind: "manual", name: "砂锅" }
      ]
    };
    const correction = { rowId: "line-2", kind: "manual" as const, name: "砂锅", address: "二楼" };
    const submit = vi.fn()
      .mockResolvedValueOnce({
        requestId: "request-original",
        results: [
          { rowId: "line-1", status: "created", code: "created", message: "created" },
          { rowId: "line-2", status: "rejected", code: "ambiguous_branch", message: "address needed" }
        ]
      })
      .mockRejectedValueOnce(new Error("correction response lost"))
      .mockResolvedValueOnce({
        requestId: "request-correction",
        results: [{ rowId: "line-2", status: "created", code: "created", message: "created" }]
      });
    const controller = createImportController({ submit, createRequestId: () => "request-correction" });

    await controller.submit(original);
    expect(bulkImportAction(controller.getState())).toBe("correct-rejected");
    await controller.correctRejected({ "line-2": correction });

    expect(controller.getState()).toMatchObject({
      kind: "recovery",
      requestIds: ["request-original", "request-correction"],
      results: [
        { rowId: "line-1", status: "created" },
        { rowId: "line-2", status: "rejected" }
      ]
    });
    const correctionRequest = submit.mock.calls[1]![0];
    await controller.retry();
    expect(submit.mock.calls[2]![0]).toBe(correctionRequest);
    expect(controller.getState()).toMatchObject({
      kind: "complete",
      requestIds: ["request-original", "request-correction"],
      results: [
        { rowId: "line-1", status: "created" },
        { rowId: "line-2", status: "created" }
      ]
    });
    expect(bulkImportAction(controller.getState())).toBe("start-new-required");
  });

  it("starts a distinct import only after resolved work is explicitly reset", async () => {
    const submit = vi.fn().mockResolvedValue({
      requestId: "one",
      results: [{ rowId: "line-1", status: "created", code: "created", message: "created" }]
    });
    const controller = createImportController({ submit });
    const first = { requestId: "one", rows: [{ rowId: "line-1", kind: "manual" as const, name: "面馆" }] };
    const second = { requestId: "two", rows: [{ rowId: "line-2", kind: "manual" as const, name: "饭馆" }] };

    await controller.submit(first);
    await controller.submit(second);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(controller.resetResolved()).toEqual({ kind: "idle" });
    await controller.submit(second);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("keeps selection across pages and ignores a late response after the query changes", async () => {
    let resolveOld!: (value: PoiSearchResponse) => void;
    const search = vi.fn()
      .mockImplementationOnce(() => new Promise<PoiSearchResponse>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response(1, ["new"]))
      .mockResolvedValueOnce(response(2, ["p2"]));
    const controller = createNearbySearchController({ search });
    const center = { label: "办公楼", latitude: 31, longitude: 121, coordinateSystem: "GCJ02" as const };

    controller.configure({ groupId: "group-1", center, keyword: "面", radius: 3000 });
    const oldFlight = controller.searchPage(1);
    controller.configure({ groupId: "group-1", center, keyword: "饭", radius: 3000 });
    await controller.searchPage(1);
    controller.toggle("new", true);
    await controller.searchPage(2);
    controller.toggle("p2", true);
    resolveOld(response(1, ["old"]));
    await oldFlight;

    expect(controller.getState().pages[1]?.candidates.map((item) => item.placeId)).toEqual(["new"]);
    expect(controller.getSelected().map((item) => item.placeId)).toEqual(["new", "p2"]);
    controller.configure({ groupId: "group-2", center, keyword: "饭", radius: 3000 });
    expect(controller.getSelected()).toEqual([]);
  });
});
