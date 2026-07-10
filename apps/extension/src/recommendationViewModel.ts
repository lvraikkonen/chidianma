import type {
  GroupTodayRecommendationItem,
  ScoreBreakdown
} from "@lunch/shared";

export interface RecommendationCardModel {
  restaurantId: string;
  recommendationId?: string | undefined;
  rankLabel: string;
  name: string;
  dish: string;
  reason: string;
  distanceLabel: string;
  priceLabel: string;
  modeLabel: string;
  tags: string[];
  scoreLabel: string;
}

export interface ScoreRow {
  key: keyof ScoreBreakdown;
  label: string;
  value: number;
}

function priceLabel(cents?: number): string {
  if (cents === undefined) return "";
  const yuan = cents / 100;
  return `人均 ¥${Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(1)}`;
}

function modeLabel(item: GroupTodayRecommendationItem): string {
  return [
    item.supportsDineIn ? "堂食" : "",
    item.supportsTakeout ? "外带" : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

export function toRecommendationCardModel(
  item: GroupTodayRecommendationItem
): RecommendationCardModel {
  return {
    restaurantId: item.restaurantId,
    ...(item.recommendationId
      ? { recommendationId: item.recommendationId }
      : {}),
    rankLabel: `今日第 ${item.rank} 选`,
    name: item.restaurantName,
    dish: item.dish ?? "",
    reason: item.reason,
    distanceLabel: item.distanceMinutes === undefined
      ? ""
      : `步行 ${item.distanceMinutes} 分钟`,
    priceLabel: priceLabel(item.averagePriceCents),
    modeLabel: modeLabel(item),
    tags: item.tags,
    scoreLabel: `${item.score} 分`
  };
}

const breakdownLabels: Array<[keyof ScoreBreakdown, string]> = [
  ["weekdayMatch", "星期匹配"],
  ["weatherMatch", "天气匹配"],
  ["distance", "距离"],
  ["teammateRecommendation", "同事推荐"],
  ["recentDuplicatePenalty", "近期重复"],
  ["negativeFeedbackPenalty", "负反馈"]
];

export function scoreBreakdownRows(
  item: GroupTodayRecommendationItem
): ScoreRow[] {
  return breakdownLabels.map(([key, label]) => ({
    key,
    label,
    value: item.scoreBreakdown[key]
  }));
}
