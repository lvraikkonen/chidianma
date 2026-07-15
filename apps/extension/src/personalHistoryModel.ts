import type {
  PersonalLunchHistoryItem,
  PersonalLunchHistoryResponse,
  PersonalPreferenceCategory
} from "@lunch/shared";

export interface PersonalHistoryItemModel {
  officeDate: string;
  restaurantName: string;
  cuisine: string;
  dish?: string | undefined;
  priceLabel?: string | undefined;
  decidedAt?: string | undefined;
  coDinerLabel: string;
}

interface PersonalHistoryBase {
  windowLabel: string;
  items: PersonalHistoryItemModel[];
}

export type PersonalHistoryModel =
  | (PersonalHistoryBase & {
    kind: "empty";
    message: string;
  })
  | (PersonalHistoryBase & {
    kind: "insufficient";
    decidedCount: number;
    averagePriceLabel?: undefined;
    categories: [];
  })
  | (PersonalHistoryBase & {
    kind: "ready";
    decidedCount: number;
    averagePriceLabel?: string | undefined;
    categories: PersonalPreferenceCategory[];
  });

function formatCurrency(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function toItemModel(item: PersonalLunchHistoryItem): PersonalHistoryItemModel {
  return {
    officeDate: item.officeDate,
    restaurantName: item.restaurantName,
    cuisine: item.cuisine,
    ...(item.dish ? { dish: item.dish } : {}),
    ...(item.averagePriceCents !== undefined
      ? { priceLabel: formatCurrency(item.averagePriceCents) }
      : {}),
    ...(item.decidedAt ? { decidedAt: item.decidedAt } : {}),
    coDinerLabel: item.coDinerCount === 0
      ? "当天没有其他同事完成决定"
      : `当天另有 ${item.coDinerCount} 位同事也完成决定`
  };
}

export function buildPersonalHistoryModel(
  response: PersonalLunchHistoryResponse
): PersonalHistoryModel {
  const windowLabel = `${response.window.startDate} 至 ${response.window.endDate}`;
  const items = response.items.map(toItemModel);
  if (items.length === 0) {
    return {
      kind: "empty",
      windowLabel,
      message: "最近 30 个办公室日期还没有已决定记录。",
      items
    };
  }
  if (response.preference.status === "insufficient") {
    return {
      kind: "insufficient",
      windowLabel,
      decidedCount: response.preference.decidedCount,
      averagePriceLabel: undefined,
      categories: [],
      items
    };
  }
  return {
    kind: "ready",
    windowLabel,
    decidedCount: response.preference.decidedCount,
    ...(response.preference.averagePriceCents !== undefined
      ? { averagePriceLabel: formatCurrency(response.preference.averagePriceCents) }
      : {}),
    categories: response.preference.categories,
    items
  };
}
