import type { GroupCapabilitiesResponse, PoiCandidate } from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  BulkImportEditor,
  ImportFeedback,
  NearbyResults,
  OnboardingModePicker
} from "../src/features/restaurants/RestaurantOnboardingPanel";
import { createPasteDraft } from "../src/features/restaurants/onboardingModel";

const features: GroupCapabilitiesResponse["features"] = {
  restaurantBulkImport: true,
  luckyRestaurantWheel: true,
  poiReferenceSearch: true,
  poiReferenceDraft: true,
  poiOfficePreset: true,
  poiProvider: "amap"
};

const poi: PoiCandidate = {
  provider: "amap",
  placeId: "poi-1",
  name: "一号面馆",
  address: "中山路 1 号",
  category: "餐饮服务;中餐厅",
  latitude: 31,
  longitude: 121,
  coordinateSystem: "GCJ02",
  distanceMeters: 486,
  ticket: "opaque-ticket"
};

function findButton(node: ReactNode, label: string): ReactElement<{
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}> {
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode; disabled?: boolean; onClick?: () => void }>;
    if (element.type === "button" && renderToStaticMarkup(element).includes(label)) return element;
    for (const child of Children.toArray(element.props.children)) {
      try {
        return findButton(child, label);
      } catch {
        // Continue through siblings.
      }
    }
  }
  throw new Error(`Button not found: ${label}`);
}

describe("restaurant onboarding markup", () => {
  it("shows only capability-enabled entry modes", () => {
    const html = renderToStaticMarkup(
      <OnboardingModePicker
        features={{
          luckyRestaurantWheel: features.luckyRestaurantWheel,
          poiReferenceSearch: false,
          poiReferenceDraft: features.poiReferenceDraft,
          poiOfficePreset: features.poiOfficePreset,
          poiProvider: features.poiProvider
        }}
        mode="nearby"
        onMode={vi.fn()}
      />
    );

    expect(html).not.toContain("粘贴名单");
    expect(html).toContain("附近搜索");
    expect(html).toContain("当前不能发起新的附近搜索");
  });

  it("renders editable selected paste rows with branch confirmation", () => {
    const html = renderToStaticMarkup(
      <BulkImportEditor
        rows={createPasteDraft("面馆\t一楼\n老店", [{ name: "老店", address: "" }]).rows}
        overflow={false}
        pending={false}
        action="new-import"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('value="面馆"');
    expect(html).toContain('value="一楼"');
    expect(html).toContain("确认是独立分店");
    expect(html).toContain("保存所选 1 行");
    expect(html).toContain("餐厅库已有同名同址记录，默认跳过");
  });

  it("locks ordinary Save during uncertain recovery and keeps known outcomes and receipt IDs visible", () => {
    const request = {
      requestId: "request-correction",
      rows: [{ rowId: "line-2", kind: "manual" as const, name: "砂锅", address: "二楼" }]
    };
    const state = {
      kind: "recovery" as const,
      request,
      error: new Error("lost"),
      requestIds: ["request-original", "request-correction"],
      results: [
        { rowId: "line-1", status: "created" as const, code: "created", message: "created" },
        { rowId: "line-2", status: "rejected" as const, code: "ambiguous_branch", message: "address needed" }
      ],
      rowsById: { "line-1": { rowId: "line-1", kind: "manual" as const, name: "面馆" }, "line-2": request.rows[0]! }
    };
    const editor = renderToStaticMarkup(
      <BulkImportEditor
        rows={createPasteDraft("面馆").rows}
        overflow={false}
        pending={false}
        action="disabled"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    const feedback = renderToStaticMarkup(
      <ImportFeedback state={state} onRetry={vi.fn()} onCorrect={vi.fn()} onStartNew={vi.fn()} />
    );

    expect(editor).toContain("disabled");
    expect(feedback).toContain("line-1 · 已创建");
    expect(feedback).toContain("request-original");
    expect(feedback).toContain("request-correction");
    expect(feedback).toContain("用同一请求安全重试");
  });

  it("routes the ordinary partial-success action to correction and requires a separate new-import action after resolution", () => {
    const onCorrection = vi.fn();
    const correctionTree = BulkImportEditor({
      rows: createPasteDraft("面馆").rows,
      overflow: false,
      pending: false,
      action: "correct-rejected",
      onChange: vi.fn(),
      onSubmit: onCorrection
    });
    const correction = renderToStaticMarkup(
      <BulkImportEditor
        rows={createPasteDraft("面馆").rows}
        overflow={false}
        pending={false}
        action="correct-rejected"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    const resolved = renderToStaticMarkup(
      <BulkImportEditor
        rows={createPasteDraft("面馆").rows}
        overflow={false}
        pending={false}
        action="start-new-required"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(correction).toContain("重试已修正的失败行");
    const correctionButton = findButton(correctionTree, "重试已修正的失败行");
    expect(correctionButton.props.disabled).toBe(false);
    correctionButton.props.onClick?.();
    expect(onCorrection).toHaveBeenCalledWith("correct-rejected");
    expect(resolved).toContain("disabled");
    expect(resolved).toContain("请先开始新一批");
  });

  it("renders provider facts and straight-line meters without inferred fields", () => {
    const html = renderToStaticMarkup(
      <NearbyResults
        response={{ provider: "amap", attribution: "数据来源：高德地图", page: 1, radius: 3000, hasMore: false, candidates: [poi] }}
        selectedPlaceIds={[]}
        pending={false}
        canSave
        canPaginate
        onToggle={vi.fn()}
        onPage={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html).toContain("一号面馆");
    expect(html).toContain("中山路 1 号");
    expect(html).toContain("餐饮服务;中餐厅");
    expect(html).toContain("直线距离 486 米");
    expect(html).toContain("数据来源：高德地图");
    expect(html).not.toContain("步行");
    expect(html).not.toContain("价格");
    expect(html).not.toContain("推荐理由");
    expect(html).not.toContain("opaque-ticket");
  });

  it("keeps selected result saving and recovery visible while new search/pagination are disabled", () => {
    const results = renderToStaticMarkup(
      <NearbyResults
        response={{ provider: "amap", attribution: "数据来源：高德地图", page: 2, radius: 3000, hasMore: true, candidates: [poi] }}
        selectedPlaceIds={["poi-1"]}
        pending={false}
        canSave
        canPaginate={false}
        onToggle={vi.fn()}
        onPage={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(results).toContain("预览并保存所选餐厅");
    expect(results).toMatch(/<button[^>]*disabled=""[^>]*>上一页/);
    expect(results).toMatch(/<button[^>]*disabled=""[^>]*>下一页/);
  });
});
