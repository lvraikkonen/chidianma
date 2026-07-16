import type {
  FeedbackType,
  GroupTodayRecommendationItem,
  PutParticipationTodayRequest,
  PutParticipationTodayResponse
} from "@lunch/shared";
import {
  applyDetailDecisionUpdate,
  runDetailActionWithContext,
  type DetailRecommendationState,
  type DetailViewState
} from "./detailController";
import { classifyPopupError } from "./popupController";
import type { PostFeedbackInput } from "./recommendationClient";
import type { ExtensionStorageShape } from "./storage";
import { createExclusiveActionGate } from "./uiAction";

export type DetailPageControl =
  | { kind: "settings"; label: "设置" }
  | { kind: "index"; label: "打开 Chrome 扩展生成推荐"; href: "index.html" }
  | { kind: "retry"; label: "重试" };

export type DetailPageRenderModel =
  | {
    kind: "recovery";
    message: string;
    control?: DetailPageControl | undefined;
  }
  | {
    kind: "recommendations";
    state: DetailRecommendationState;
    status: string;
    readOnly: boolean;
    canWrite: boolean;
  };

export interface DetailPageActionDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  postFeedback: (
    storage: ExtensionStorageShape,
    input: PostFeedbackInput
  ) => Promise<void>;
  putParticipation: (
    storage: ExtensionStorageShape,
    input: PutParticipationTodayRequest
  ) => Promise<PutParticipationTodayResponse>;
  reload: (announcement: string) => Promise<void>;
  render: (state: DetailViewState) => void;
  announce: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
}

export interface DetailPageActionCoordinator {
  submitFeedback: (
    state: Extract<DetailViewState, { kind: "ready" }>,
    item: GroupTodayRecommendationItem,
    type: FeedbackType
  ) => Promise<boolean>;
  submitDecision: (
    state: Extract<DetailViewState, { kind: "ready" }>,
    item: GroupTodayRecommendationItem
  ) => Promise<boolean>;
  isPending: () => boolean;
}

export function toDetailPageRenderModel(
  state: DetailViewState
): DetailPageRenderModel {
  if (state.kind === "disconnected") {
    return {
      kind: "recovery",
      message: "请先在设置中连接小组。",
      control: { kind: "settings", label: "设置" }
    };
  }
  if (state.kind === "no-current-batch") {
    return {
      kind: "recovery",
      message: "今天还没有生成推荐。",
      control: {
        kind: "index",
        label: "打开 Chrome 扩展生成推荐",
        href: "index.html"
      }
    };
  }
  if (state.kind === "session-expired") {
    return {
      kind: "recovery",
      message: "当前小组连接已失效，请在设置中重新连接。",
      control: { kind: "settings", label: "设置" }
    };
  }
  if (state.kind === "forbidden") {
    return {
      kind: "recovery",
      message: "你已被移出当前小组，请在设置中选择其他小组。",
      control: { kind: "settings", label: "设置" }
    };
  }
  if (state.kind === "error") {
    const recovery: DetailPageRenderModel = {
      kind: "recovery",
      message: state.message
    };
    return state.retryable
      ? {
        ...recovery,
        control: { kind: "retry", label: "重试" }
      }
      : recovery;
  }
  if (state.kind === "cached") {
    return {
      kind: "recommendations",
      state,
      status: "缓存内容仅供查看",
      readOnly: true,
      canWrite: false
    };
  }
  return {
    kind: "recommendations",
    state,
    status: state.response.weather?.summary
      ?? "今天先按距离、星期和同事推荐来挑。",
    readOnly: false,
    canWrite: true
  };
}

export function createDetailPageActionCoordinator(
  dependencies: DetailPageActionDependencies
): DetailPageActionCoordinator {
  const gate = createExclusiveActionGate({
    onPendingChange: dependencies.onPendingChange
  });

  function handleFailure(error: unknown, message: string): void {
    const kind = classifyPopupError(error);
    if (kind === "session-expired" || kind === "forbidden") {
      dependencies.render({ kind });
      return;
    }
    dependencies.announce(message);
  }

  async function submitFeedback(
    state: Extract<DetailViewState, { kind: "ready" }>,
    item: GroupTodayRecommendationItem,
    type: FeedbackType
  ): Promise<boolean> {
    return gate.run(async () => {
      dependencies.announce("提交中...");
      try {
        const result = await runDetailActionWithContext(
          state,
          dependencies.loadStorage,
          (storage) => dependencies.postFeedback(storage, {
            date: state.response.officeDate,
            restaurantId: item.restaurantId,
            ...(item.recommendationId
              ? { recommendationId: item.recommendationId }
              : {}),
            type
          })
        );
        if (result.kind === "stale") {
          await dependencies.reload(result.message);
          return;
        }
        dependencies.announce("反馈已记录。");
      } catch (error) {
        handleFailure(error, "记录反馈失败，请重试。");
      }
    });
  }

  async function submitDecision(
    state: Extract<DetailViewState, { kind: "ready" }>,
    item: GroupTodayRecommendationItem
  ): Promise<boolean> {
    return gate.run(async () => {
      dependencies.announce("提交中...");
      try {
        const result = await runDetailActionWithContext(
          state,
          dependencies.loadStorage,
          (storage) => dependencies.putParticipation(storage, {
            status: "decided",
            restaurantId: item.restaurantId,
            ...(item.recommendationId
              ? { recommendationId: item.recommendationId }
              : {})
          })
        );
        if (result.kind === "stale") {
          await dependencies.reload(result.message);
          return;
        }
        const nextState = applyDetailDecisionUpdate(state, result.value);
        if (nextState === state) {
          await dependencies.reload(
            "操作结果无法确认，已重新加载当前详情。"
          );
          return;
        }
        dependencies.render(nextState);
        dependencies.announce("今天的午饭决定已记录。");
      } catch (error) {
        handleFailure(error, "记录决定失败，请重试。");
      }
    });
  }

  return {
    submitFeedback,
    submitDecision,
    isPending: gate.isPending
  };
}
