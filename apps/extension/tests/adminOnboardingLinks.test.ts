import { describe, expect, it } from "vitest";
import { adminOnboardingLinks } from "../src/adminOnboardingLinks";

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
});
