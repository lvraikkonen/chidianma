import type {
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  RecommendationMutationResponse,
  RecommendationSummary,
  RestaurantListResponse,
  RestaurantMutationResponse,
  RestaurantSummary
} from "./types.js";

export type RecoveryVerdict =
  | "checking"
  | "confirmed-saved"
  | "confirmed-missing"
  | "uncertain";

export interface RestaurantEntrySubmission {
  restaurant: CreateRestaurantRequest;
  recommendation: Omit<CreateRecommendationRequest, "restaurantId">;
}

export type RestaurantEntryRecoveryState =
  | { kind: "idle" }
  | { kind: "submitting-restaurant" }
  | {
      kind: "checking";
      target: "restaurant" | "recommendation";
      restaurantId?: string | undefined;
      verdict: "checking";
    }
  | { kind: "submitting-recommendation"; restaurantId: string }
  | {
      kind: "recovery";
      target: "restaurant" | "recommendation";
      verdict: "confirmed-missing" | "uncertain";
      restaurantId?: string | undefined;
      message: string;
    }
  | { kind: "complete"; restaurantId: string };

export interface RestaurantEntryRecoveryDependencies {
  membershipId: string;
  listRestaurants: () => Promise<RestaurantListResponse>;
  createRestaurant: (
    input: CreateRestaurantRequest
  ) => Promise<RestaurantMutationResponse>;
  createRecommendation: (
    input: CreateRecommendationRequest
  ) => Promise<RecommendationMutationResponse>;
}

function normalizedText(value?: string | null): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizedSet<T extends string>(values?: readonly T[]): T[] {
  return [...new Set(
    (values ?? []).map((value) => normalizedText(value) as T).filter(Boolean)
  )].sort();
}

function optionalTextMatches(
  actual: string | undefined,
  expected: string | undefined
): boolean {
  return expected === undefined
    || normalizedText(actual) === normalizedText(expected);
}

function optionalNumberMatches(
  actual: number | undefined,
  expected: number | undefined
): boolean {
  return expected === undefined || actual === expected;
}

export function sameRestaurantIdentity(
  restaurant: RestaurantSummary,
  input: Pick<CreateRestaurantRequest, "name" | "area">
): boolean {
  return normalizedText(restaurant.name).toLocaleLowerCase()
      === normalizedText(input.name).toLocaleLowerCase()
    && normalizedText(restaurant.area).toLocaleLowerCase()
      === normalizedText(input.area).toLocaleLowerCase();
}

export function restaurantMatchesSubmission(
  restaurant: RestaurantSummary,
  input: CreateRestaurantRequest,
  membershipId: string
): boolean {
  return restaurant.createdByMembershipId === membershipId
    && sameRestaurantIdentity(restaurant, input)
    && optionalTextMatches(restaurant.address, input.address)
    && optionalTextMatches(restaurant.cuisine, input.cuisine)
    && optionalTextMatches(restaurant.priceBand, input.priceBand)
    && optionalNumberMatches(restaurant.distanceMinutes, input.distanceMinutes)
    && optionalNumberMatches(restaurant.averagePriceCents, input.averagePriceCents)
    && (input.supportsDineIn === undefined
      || restaurant.supportsDineIn === input.supportsDineIn)
    && (input.supportsTakeout === undefined
      || restaurant.supportsTakeout === input.supportsTakeout)
    && JSON.stringify(normalizedSet(restaurant.tags))
      === JSON.stringify(normalizedSet(input.tags));
}

export function recommendationMatchesSubmission(
  recommendation: RecommendationSummary,
  input: Omit<CreateRecommendationRequest, "restaurantId">,
  membershipId: string
): boolean {
  return recommendation.createdByMembershipId === membershipId
    && optionalTextMatches(recommendation.dish, input.dish)
    && normalizedText(recommendation.reason) === normalizedText(input.reason)
    && JSON.stringify(normalizedSet(recommendation.weatherTags))
      === JSON.stringify(normalizedSet(input.weatherTags))
    && JSON.stringify(normalizedSet(recommendation.weekdayTags))
      === JSON.stringify(normalizedSet(input.weekdayTags))
    && JSON.stringify(normalizedSet(recommendation.moodTags))
      === JSON.stringify(normalizedSet(input.moodTags));
}

export function createRestaurantEntryRecoveryController(
  dependencies: RestaurantEntryRecoveryDependencies
) {
  let state: RestaurantEntryRecoveryState = { kind: "idle" };
  let submission: RestaurantEntrySubmission | null = null;
  let restaurantIdsBefore = new Set<string>();
  let duplicateBeforeCreate = false;

  function recovery(
    target: "restaurant" | "recommendation",
    verdict: "confirmed-missing" | "uncertain",
    message: string,
    restaurantId?: string
  ): RestaurantEntryRecoveryState {
    state = {
      kind: "recovery",
      target,
      verdict,
      message,
      ...(restaurantId ? { restaurantId } : {})
    };
    return state;
  }

  async function loadRestaurantList(
    target: "restaurant" | "recommendation",
    restaurantId?: string
  ): Promise<RestaurantSummary[] | null> {
    state = {
      kind: "checking",
      target,
      verdict: "checking",
      ...(restaurantId ? { restaurantId } : {})
    };
    try {
      return (await dependencies.listRestaurants()).restaurants;
    } catch {
      recovery(
        target,
        "uncertain",
        target === "restaurant"
          ? "暂时无法核对餐厅是否已经保存；为避免重复新增，当前不允许再次写入。"
          : "暂时无法核对推荐是否已经保存；为避免重复推荐，当前不允许再次写入。",
        restaurantId
      );
      return null;
    }
  }

  async function reconcileRecommendation(
    restaurantId: string
  ): Promise<RestaurantEntryRecoveryState> {
    if (!submission) throw new Error("entry_recovery_submission_missing");
    const restaurants = await loadRestaurantList("recommendation", restaurantId);
    if (!restaurants) return state;
    const restaurant = restaurants.find((item) => item.id === restaurantId);
    if (!restaurant) {
      return recovery(
        "recommendation",
        "uncertain",
        "餐厅已返回成功，但当前列表中无法确认该餐厅；暂不允许再次保存推荐。",
        restaurantId
      );
    }
    const saved = restaurant.recommendations.some((recommendation) => (
      recommendationMatchesSubmission(
        recommendation,
        submission!.recommendation,
        dependencies.membershipId
      )
    ));
    if (saved) {
      state = { kind: "complete", restaurantId };
      return state;
    }
    return recovery(
      "recommendation",
      "confirmed-missing",
      "已确认餐厅保存成功、推荐尚未保存，可以安全重试推荐。",
      restaurantId
    );
  }

  async function saveRecommendation(
    restaurantId: string
  ): Promise<RestaurantEntryRecoveryState> {
    if (!submission) throw new Error("entry_recovery_submission_missing");
    state = { kind: "submitting-recommendation", restaurantId };
    try {
      await dependencies.createRecommendation({
        restaurantId,
        ...submission.recommendation
      });
      state = { kind: "complete", restaurantId };
      return state;
    } catch {
      return reconcileRecommendation(restaurantId);
    }
  }

  async function reconcileRestaurant(): Promise<RestaurantEntryRecoveryState> {
    if (!submission) throw new Error("entry_recovery_submission_missing");
    const restaurants = await loadRestaurantList("restaurant");
    if (!restaurants) return state;

    if (duplicateBeforeCreate) {
      const duplicateStillExists = restaurants.some((restaurant) => (
        sameRestaurantIdentity(restaurant, submission!.restaurant)
      ));
      if (duplicateStillExists) {
        return recovery(
          "restaurant",
          "uncertain",
          "已存在同名同区域餐厅，请先在餐厅库核对并为现有餐厅补充推荐。"
        );
      }
      duplicateBeforeCreate = false;
      return recovery(
        "restaurant",
        "confirmed-missing",
        "同名餐厅已不存在，可以安全重试保存餐厅和推荐。"
      );
    }

    const candidates = restaurants.filter((restaurant) => (
      !restaurantIdsBefore.has(restaurant.id)
      && restaurantMatchesSubmission(
        restaurant,
        submission!.restaurant,
        dependencies.membershipId
      )
    ));
    if (candidates.length === 1) {
      return saveRecommendation(candidates[0]!.id);
    }
    if (candidates.length === 0) {
      return recovery(
        "restaurant",
        "confirmed-missing",
        "已确认餐厅没有保存，可以安全重试保存餐厅和推荐。"
      );
    }
    return recovery(
      "restaurant",
      "uncertain",
      "核对时发现多个可能由本次操作创建的餐厅；请先到餐厅库确认，当前不允许再次写入。"
    );
  }

  async function prepareAndCreate(): Promise<RestaurantEntryRecoveryState> {
    if (!submission) throw new Error("entry_recovery_submission_missing");
    const restaurants = await loadRestaurantList("restaurant");
    if (!restaurants) return state;
    restaurantIdsBefore = new Set(restaurants.map((restaurant) => restaurant.id));
    duplicateBeforeCreate = restaurants.some((restaurant) => (
      sameRestaurantIdentity(restaurant, submission!.restaurant)
    ));
    if (duplicateBeforeCreate) {
      return recovery(
        "restaurant",
        "uncertain",
        "已存在同名同区域餐厅，请先在餐厅库核对并为现有餐厅补充推荐。"
      );
    }

    state = { kind: "submitting-restaurant" };
    try {
      const response = await dependencies.createRestaurant(submission.restaurant);
      return saveRecommendation(response.restaurant.id);
    } catch {
      return reconcileRestaurant();
    }
  }

  async function submit(
    input: RestaurantEntrySubmission
  ): Promise<RestaurantEntryRecoveryState> {
    submission = {
      restaurant: {
        name: input.restaurant.name.trim(),
        ...(input.restaurant.area?.trim()
          ? { area: input.restaurant.area.trim() }
          : {}),
        ...(input.restaurant.address?.trim()
          ? { address: input.restaurant.address.trim() }
          : {}),
        ...(input.restaurant.cuisine?.trim()
          ? { cuisine: input.restaurant.cuisine.trim() }
          : {}),
        ...(input.restaurant.priceBand?.trim()
          ? { priceBand: input.restaurant.priceBand.trim() }
          : {}),
        ...(input.restaurant.distanceMinutes === undefined
          ? {}
          : { distanceMinutes: input.restaurant.distanceMinutes }),
        ...(input.restaurant.averagePriceCents === undefined
          ? {}
          : { averagePriceCents: input.restaurant.averagePriceCents }),
        ...(input.restaurant.supportsDineIn === undefined
          ? {}
          : { supportsDineIn: input.restaurant.supportsDineIn }),
        ...(input.restaurant.supportsTakeout === undefined
          ? {}
          : { supportsTakeout: input.restaurant.supportsTakeout }),
        tags: normalizedSet(input.restaurant.tags)
      },
      recommendation: {
        ...(input.recommendation.dish?.trim()
          ? { dish: input.recommendation.dish.trim() }
          : {}),
        reason: input.recommendation.reason.trim(),
        weatherTags: normalizedSet(input.recommendation.weatherTags),
        weekdayTags: normalizedSet(input.recommendation.weekdayTags),
        moodTags: normalizedSet(input.recommendation.moodTags)
      }
    };
    duplicateBeforeCreate = false;
    restaurantIdsBefore = new Set();
    return prepareAndCreate();
  }

  async function retry(): Promise<RestaurantEntryRecoveryState> {
    if (state.kind !== "recovery" || state.verdict !== "confirmed-missing") {
      throw new Error("entry_recovery_retry_unavailable");
    }
    return state.target === "restaurant"
      ? prepareAndCreate()
      : saveRecommendation(state.restaurantId!);
  }

  async function recheck(): Promise<RestaurantEntryRecoveryState> {
    if (state.kind !== "recovery") {
      throw new Error("entry_recovery_recheck_unavailable");
    }
    return state.target === "restaurant"
      ? reconcileRestaurant()
      : reconcileRecommendation(state.restaurantId!);
  }

  return {
    submit,
    retry,
    recheck,
    getState: () => state
  };
}
