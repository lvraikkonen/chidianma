import type { GroupCapabilitiesResponse, PoiCandidate } from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BulkImportEditor,
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

  it("renders provider facts and straight-line meters without inferred fields", () => {
    const html = renderToStaticMarkup(
      <NearbyResults
        response={{ provider: "amap", attribution: "数据来源：高德地图", page: 1, radius: 3000, hasMore: false, candidates: [poi] }}
        selectedPlaceIds={[]}
        pending={false}
        canSave
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
});
