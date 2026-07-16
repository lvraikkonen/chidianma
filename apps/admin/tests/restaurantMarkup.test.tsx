import type {
  GroupSummary,
  RecommendationSummary,
  RestaurantSummary
} from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RestaurantsPage } from "../src/pages/RestaurantsPage";
import type { RestaurantEntryState } from "../src/features/restaurants/restaurantModel";

function group(role: "admin" | "member", membershipId: string): GroupSummary {
  return {
    groupId: "group-1",
    name: "设计组",
    role,
    membershipId
  };
}

function recommendation(
  overrides: Partial<RecommendationSummary> = {}
): RecommendationSummary {
  return {
    id: "recommendation-1",
    groupId: "group-1",
    restaurantId: "restaurant-1",
    dish: "番茄肥牛砂锅",
    reason: "热乎，出餐快",
    weatherTags: [],
    weekdayTags: [],
    moodTags: [],
    createdByMembershipId: "membership-member",
    createdByName: "小林",
    createdAt: "2026-07-14T18:00:00.000Z",
    updatedAt: "2026-07-14T18:00:00.000Z",
    ...overrides
  };
}

function restaurant(
  overrides: Partial<RestaurantSummary> = {}
): RestaurantSummary {
  return {
    id: "restaurant-1",
    groupId: "group-1",
    name: "巷口砂锅",
    area: "A 楼底商",
    cuisine: "砂锅",
    distanceMinutes: 6,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["热乎"],
    status: "active",
    createdByMembershipId: "membership-member",
    createdByName: "小林",
    createdAt: "2026-07-14T18:00:00.000Z",
    updatedAt: "2026-07-14T18:00:00.000Z",
    recommendations: [recommendation()],
    ...overrides
  };
}

function pageProps(input: {
  group?: GroupSummary;
  restaurants?: RestaurantSummary[];
  entryState?: RestaurantEntryState;
} = {}) {
  return {
    group: input.group ?? group("admin", "membership-admin"),
    restaurants: input.restaurants ?? [restaurant()],
    loading: false,
    entryState: input.entryState ?? { kind: "idle" as const },
    onRetryLoad: vi.fn(),
    onCreateEntry: vi.fn(),
    onRetryEntry: vi.fn(),
    onRecheckEntry: vi.fn(),
    onPatchRestaurant: vi.fn(),
    onCreateRecommendation: vi.fn(),
    onPatchRecommendation: vi.fn()
  };
}

describe("restaurant page markup", () => {
  it("hides status governance from a member but keeps owned edit", () => {
    const html = renderToStaticMarkup(
      <RestaurantsPage {...pageProps({
        group: group("member", "membership-member")
      })} />
    );

    expect(html).toContain("编辑餐厅");
    expect(html).toContain("编辑推荐");
    expect(html).not.toContain("暂停餐厅");
    expect(html).not.toContain("设为避雷");
  });

  it("shows admin status governance", () => {
    const html = renderToStaticMarkup(<RestaurantsPage {...pageProps()} />);

    expect(html).toContain("暂停餐厅");
    expect(html).toContain("设为避雷");
  });

  it("shows real empty copy and create action", () => {
    const html = renderToStaticMarkup(
      <RestaurantsPage {...pageProps({ restaurants: [] })} />
    );

    expect(html).toContain("先添加 5–10 家常去餐厅");
    expect(html).toContain("新增餐厅");
  });

  it("renders partial-success recovery without losing the saved restaurant", () => {
    const html = renderToStaticMarkup(
      <RestaurantsPage {...pageProps({
        entryState: {
          kind: "recovery",
          target: "recommendation",
          verdict: "confirmed-missing",
          restaurantId: "restaurant-new",
          message: "已确认餐厅保存成功、推荐尚未保存，可以安全重试推荐。"
        }
      })} />
    );

    expect(html).toContain("餐厅已保存，推荐尚未保存");
    expect(html).toContain("安全重试");
  });
});
