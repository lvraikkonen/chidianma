import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HookHarness } from "./helpers/hookHarness";
import { RestaurantOnboardingPanel, BulkImportEditor, ImportFeedback, NearbyResults } from "../src/features/restaurants/RestaurantOnboardingPanel";
import * as client from "../src/clients/onboarding";
import type { PoiGeocodeResponse, PoiSearchResponse, RestaurantImportRequest } from "@lunch/shared";

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  const { harnessHooks } = await import("./helpers/hookHarness");
  return { ...real, ...harnessHooks(real) };
});
vi.mock("../src/clients/onboarding", () => ({
  getOnboardingCapabilities: vi.fn(), getOnboardingSettings: vi.fn(),
  geocodePoi: vi.fn(), searchPoi: vi.fn(), importRestaurants: vi.fn(), patchSearchCenter: vi.fn()
}));

type Element = ReactElement<Record<string, any>>;
function elements(node: ReactNode): Element[] {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...Children.toArray(element.props.children).flatMap(elements)];
}
function field(tree: ReactNode, label: string): Element {
  const parent = elements(tree).find((e) => e.type === "label" && renderToStaticMarkup(e).includes(label));
  const input = parent && elements(parent).find((e) => e.type === "input" || e.type === "textarea");
  if (!input) throw new Error(`Missing field ${label}`);
  return input;
}
function button(tree: ReactNode, label: string): Element {
  const result = elements(tree).find((e) => e.type === "button" && renderToStaticMarkup(e).includes(label));
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
}
function component(tree: ReactNode, type: unknown): Element {
  const result = elements(tree).find((e) => e.type === type);
  if (!result) throw new Error("Missing component");
  return result;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }
const center = { label: "旧地址解析结果", latitude: 31, longitude: 121, coordinateSystem: "GCJ02" as const };
const geocoded: PoiGeocodeResponse = { provider: "mock", attribution: "模拟数据", centers: [center] };
const nearby: PoiSearchResponse = {
  provider: "mock", attribution: "模拟数据", page: 1, radius: 3000, hasMore: false,
  candidates: [{ provider: "mock", placeId: "place-1", name: "原始面馆", address: "原始地址", category: "餐饮", latitude: 31, longitude: 121, coordinateSystem: "GCJ02", distanceMeters: 20, ticket: "opaque-ticket" }]
};
const mounted: HookHarness<ReactNode>[] = [];
function panel(mode: "bulk" | "nearby" = "bulk") {
  const harness = new HookHarness<ReactNode>(() => RestaurantOnboardingPanel({
    context: { apiBaseUrl: "", token: "group-token", groupId: "group-1" },
    group: { groupId: "group-1", membershipId: "membership-1", name: "组", role: "admin" },
    restaurants: [], initialMode: mode, onImported: vi.fn(), onOpenToday: vi.fn(), onMembershipInvalid: vi.fn()
  }));
  mounted.push(harness); return harness;
}
function receipt(request: RestaurantImportRequest, rejected = false) {
  return { requestId: request.requestId, results: request.rows.map((row, index) => ({ rowId: row.rowId, status: rejected && index === request.rows.length - 1 ? "rejected" : "created", code: rejected && index === request.rows.length - 1 ? "ambiguous_branch" : "created", message: "结果" })) };
}
async function paste(h: HookHarness<ReactNode>, text: string) {
  field(h.tree, "粘贴餐厅名单").props.onChange({ target: { value: text } }); await h.flush();
  button(h.tree, "生成预览").props.onClick(); await h.flush();
}
function feedback(h: HookHarness<ReactNode>) { return renderToStaticMarkup(component(h.tree, ImportFeedback)); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(client.getOnboardingCapabilities).mockResolvedValue({ groupId: "group-1", features: { restaurantBulkImport: true, poiReferenceSearch: true, poiReferenceDraft: true, luckyRestaurantWheel: true, poiOfficePreset: true, poiProvider: "mock" } });
  vi.mocked(client.getOnboardingSettings).mockResolvedValue({ searchCenter: center } as Awaited<ReturnType<typeof client.getOnboardingSettings>>);
  vi.mocked(client.searchPoi).mockResolvedValue(nearby);
});
afterEach(() => { mounted.splice(0).forEach((h) => h.unmount()); });

describe("actual onboarding panel interactions", () => {
  it.each(["搜索中心地址", "城市（可选）"])("invalidates a pending geocode and old choices when %s changes", async (label) => {
    const h = panel("nearby"); await h.flush();
    field(h.tree, "搜索中心地址").props.onChange({ target: { value: "旧地址" } }); await h.flush();
    vi.mocked(client.geocodePoi).mockResolvedValueOnce(geocoded);
    await elements(h.tree).find((e) => e.type === "form")!.props.onSubmit({ preventDefault() {} }); await h.flush();
    expect(renderToStaticMarkup(h.tree)).toContain("确认搜索中心");
    field(h.tree, label).props.onChange({ target: { value: "新输入" } }); await h.flush();
    expect(renderToStaticMarkup(h.tree)).not.toContain("确认搜索中心");
    const flight = deferred<PoiGeocodeResponse>(); vi.mocked(client.geocodePoi).mockReturnValueOnce(flight.promise);
    const pending = elements(h.tree).find((e) => e.type === "form")!.props.onSubmit({ preventDefault() {} }); await h.flush();
    const signal = vi.mocked(client.geocodePoi).mock.calls[1]![0].signal;
    field(h.tree, label).props.onChange({ target: { value: "再次修改" } }); await h.flush();
    expect(signal?.aborted).toBe(true);
    flight.resolve(geocoded); await pending; await h.flush();
    expect(renderToStaticMarkup(h.tree)).not.toContain("确认搜索中心");
    expect(button(h.tree, "解析地址").props.disabled).toBe(false);
  });

  it("counts and submits only selected rejected rows for correction", async () => {
    vi.mocked(client.importRestaurants).mockImplementation(async (_context, request) => receipt(request, true) as any);
    const h = panel(); await h.flush(); await paste(h, "成功面馆\t一楼\n失败砂锅\t二楼");
    await component(h.tree, BulkImportEditor).props.onSubmit("new-import"); await h.flush();
    const editor = component(h.tree, BulkImportEditor);
    expect(renderToStaticMarkup(editor)).toContain("重试已修正的失败行（1 行）");
    await editor.props.onSubmit("correct-rejected"); await h.flush();
    expect(vi.mocked(client.importRestaurants).mock.calls[1]![1].rows.map((row) => row.rowId)).toEqual(["line-2"]);
  });

  it("keeps original manual receipt labels through edited preview, response loss and corrected-row recovery", async () => {
    vi.mocked(client.importRestaurants)
      .mockRejectedValueOnce(new Error("lost"))
      .mockImplementationOnce(async (_c, request) => receipt(request, true) as any)
      .mockRejectedValueOnce(new Error("correction lost"))
      .mockImplementationOnce(async (_c, request) => receipt(request) as any);
    const h = panel(); await h.flush(); await paste(h, "原始面馆\t原始地址\n原始砂锅\t旧分店");
    await component(h.tree, BulkImportEditor).props.onSubmit("new-import"); await h.flush();
    await paste(h, "编辑后面馆\t新地址\n修正砂锅\t新分店");
    expect(feedback(h)).toContain("原始面馆"); expect(feedback(h)).toContain("原始地址");
    expect(feedback(h)).not.toContain("编辑后面馆");
    await component(h.tree, ImportFeedback).props.onRetry(); await h.flush();
    expect(vi.mocked(client.importRestaurants).mock.calls[1]![1]).toBe(vi.mocked(client.importRestaurants).mock.calls[0]![1]);
    expect(feedback(h)).toContain("原始砂锅");
    await component(h.tree, BulkImportEditor).props.onSubmit("correct-rejected"); await h.flush();
    expect(feedback(h)).toContain("原始面馆"); expect(feedback(h)).toContain("修正砂锅");
    expect(feedback(h)).toMatch(/class="rejected"[^]*原始砂锅[^]*旧分店/);
    await paste(h, "又改面馆\n又改砂锅");
    await component(h.tree, ImportFeedback).props.onRetry(); await h.flush();
    expect(feedback(h)).toContain("原始面馆"); expect(feedback(h)).toContain("修正砂锅"); expect(feedback(h)).toContain("新分店");
    expect(feedback(h)).not.toContain("又改");
  });

  it("retains POI receipt labels through selection changes, loss and branch correction, and locks completed save", async () => {
    vi.mocked(client.importRestaurants)
      .mockRejectedValueOnce(new Error("lost"))
      .mockImplementationOnce(async (_c, request) => receipt(request, true) as any)
      .mockImplementationOnce(async (_c, request) => receipt(request) as any);
    const h = panel("nearby"); await h.flush();
    button(h.tree, "搜索附近餐厅").props.onClick(); await h.flush();
    component(h.tree, NearbyResults).props.onToggle("place-1", true); await h.flush();
    component(h.tree, NearbyResults).props.onSave(); await h.flush();
    // Save preview is a child component; invoke its real function for its button.
    const preview = elements(h.tree).find((e) => typeof e.type === "function" && e.props.candidates)!;
    await button((preview.type as Function)(preview.props), "确认保存").props.onClick(); await h.flush();
    component(h.tree, NearbyResults).props.onToggle("place-1", false); await h.flush();
    expect(feedback(h)).toContain("原始面馆"); expect(feedback(h)).toContain("原始地址"); expect(feedback(h)).not.toContain("opaque-ticket");
    await component(h.tree, ImportFeedback).props.onRetry(); await h.flush();
    await component(h.tree, ImportFeedback).props.onCorrect({ "poi-1": { rowId: "poi-1", kind: "poi", ticket: "opaque-ticket", confirmSeparateBranch: true } }); await h.flush();
    expect(feedback(h)).toContain("原始面馆"); expect(feedback(h)).toContain("原始地址");
    component(h.tree, NearbyResults).props.onToggle("place-1", true); await h.flush();
    const completedPreview = elements(h.tree).find((e) => typeof e.type === "function" && e.props.candidates);
    if (completedPreview) expect(button((completedPreview.type as Function)(completedPreview.props), "确认保存").props.disabled).toBe(true);
    expect(component(h.tree, NearbyResults).props.saveLocked).toBe(true);
  });
});
