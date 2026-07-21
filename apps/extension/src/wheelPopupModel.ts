import type { WheelMode } from "@lunch/shared";
import type { PopupViewState } from "./popupController";
import type {
  LuckyWheelControllerState,
  LuckyWheelDisplayCandidate
} from "./wheelController";

export const WHEEL_SPIN_DURATION_MS = 3_000;
const WHEEL_FULL_ROTATIONS = 5;

export interface WheelSectorPresentation {
  restaurantId: string;
  number: number;
  label: string;
  startDegrees: number;
  endDegrees: number;
  midpointDegrees: number;
  colorIndex: number;
}

export interface WheelCandidatePresentation {
  restaurantId: string;
  number: number;
  name: string;
  tickets: 1 | 2 | 3;
  probabilityLabel: string;
}

export interface WheelResultPresentation {
  restaurantId: string;
  name: string;
  dish?: string | undefined;
  distanceLabel?: string | undefined;
  reason: string;
  tags: string[];
  recentVisitLabel?: string | undefined;
}

interface WheelPoolPresentation {
  mode: WheelMode;
  modeLocked: boolean;
  spinNumber: 0 | 1 | 2;
  busy: boolean;
  candidates: WheelCandidatePresentation[];
  sectors: WheelSectorPresentation[];
  gradient: string;
  notice?: string | undefined;
}

export type WheelPopupModel =
  | {
    kind: "loading";
    busy: true;
    status: string;
  }
  | ({
    kind: "ready";
    canSpin: boolean;
    status: string;
  } & WheelPoolPresentation)
  | ({
    kind: "spinning";
    status: string;
  } & WheelPoolPresentation)
  | ({
    kind: "result";
    source: "live" | "restored";
    selected: WheelResultPresentation;
    accepted: boolean;
    acceptancePending: boolean;
    accepting: boolean;
    canAccept: boolean;
    canExclude: boolean;
    canReroll: boolean;
    rerollLabel?: string | undefined;
    acceptLabel: string;
    acceptError?: string | undefined;
    status: string;
  } & WheelPoolPresentation)
  | ({
    kind: "insufficient";
    candidateCount: number;
    canRetry: boolean;
    message: string;
    status: string;
  } & WheelPoolPresentation)
  | {
    kind: "error";
    code: string;
    message: string;
    retryable: boolean;
    busy: false;
    status: string;
  };

export interface WheelAnimationPlan {
  selectedRestaurantId: string;
  selectedMidpointDegrees: number;
  targetRotationDegrees: number;
  durationMs: number;
}

export function luckyWheelEntryAvailable(
  state: PopupViewState
): state is Extract<PopupViewState, { kind: "ready" | "empty" }> {
  return (state.kind === "ready" || state.kind === "empty")
    && state.capabilities.features.luckyRestaurantWheel;
}

export function formatWheelProbability(probability: number): string {
  const percentage = probability * 100;
  const rounded = Math.round(percentage);
  return `${Math.abs(percentage - rounded) < 0.05
    ? rounded.toFixed(0)
    : percentage.toFixed(1)}%`;
}

export function createWheelSectors(
  candidates: readonly LuckyWheelDisplayCandidate[]
): WheelSectorPresentation[] {
  return candidates.map((candidate, index) => {
    const startDegrees = candidate.cumulativeProbabilityStart * 360;
    const endDegrees = candidate.cumulativeProbabilityEnd * 360;
    return {
      restaurantId: candidate.restaurantId,
      number: index + 1,
      label: String(index + 1),
      startDegrees,
      endDegrees,
      midpointDegrees: startDegrees + (endDegrees - startDegrees) / 2,
      colorIndex: index % 4
    };
  });
}

function wheelGradient(sectors: readonly WheelSectorPresentation[]): string {
  if (sectors.length === 0) return "var(--surface-soft)";
  const stops = sectors.map((sector) => (
    `var(--wheel-sector-${sector.colorIndex + 1}) `
    + `${sector.startDegrees}deg ${sector.endDegrees}deg`
  ));
  return `conic-gradient(${stops.join(", ")})`;
}

function candidatePresentations(
  candidates: readonly LuckyWheelDisplayCandidate[]
): WheelCandidatePresentation[] {
  return candidates.map((candidate, index) => ({
    restaurantId: candidate.restaurantId,
    number: index + 1,
    name: candidate.name,
    tickets: candidate.tickets,
    probabilityLabel: formatWheelProbability(candidate.probability)
  }));
}

function poolPresentation(
  state: Extract<
    LuckyWheelControllerState,
    { kind: "ready" | "spinning" | "result" | "insufficient" }
  >,
  interactionPending: boolean
): WheelPoolPresentation {
  const sectors = createWheelSectors(state.candidates);
  return {
    mode: state.mode,
    modeLocked: state.modeLocked,
    spinNumber: state.spinNumber,
    busy: interactionPending || state.kind === "spinning" || (
      state.kind === "result" && state.accepting
    ),
    candidates: candidatePresentations(state.candidates),
    sectors,
    gradient: wheelGradient(sectors),
    ...("notice" in state && state.notice ? { notice: state.notice } : {})
  };
}

function resultPresentation(
  candidate: LuckyWheelDisplayCandidate,
  mode: WheelMode
): WheelResultPresentation {
  return {
    restaurantId: candidate.restaurantId,
    name: candidate.name,
    ...(candidate.dish ? { dish: candidate.dish } : {}),
    ...(candidate.distanceMinutes === undefined
      ? {}
      : { distanceLabel: `步行约 ${candidate.distanceMinutes} 分钟` }),
    reason: candidate.reason,
    tags: [...candidate.tags],
    ...(mode === "weighted" && candidate.selectedWithinLast7Days
      ? { recentVisitLabel: "最近 7 天内去过，本轮加权已考虑这一点。" }
      : {})
  };
}

export function toWheelPopupModel(
  state: LuckyWheelControllerState,
  options: { interactionPending?: boolean | undefined } = {}
): WheelPopupModel {
  if (state.kind === "loading") {
    return {
      kind: "loading",
      busy: true,
      status: "正在加载符合条件的转盘候选。"
    };
  }
  if (state.kind === "error") {
    return {
      kind: "error",
      code: state.code,
      message: state.message,
      retryable: state.retryable,
      busy: false,
      status: state.message
    };
  }

  const interactionPending = options.interactionPending ?? false;
  const pool = poolPresentation(state, interactionPending);
  if (state.kind === "ready") {
    return {
      kind: "ready",
      ...pool,
      canSpin: state.canSpin,
      status: interactionPending
        ? "正在处理转盘操作，请稍候。"
        : state.notice ?? (
          state.canSpin
            ? `已有 ${state.candidates.length} 家餐厅可以参与抽签。`
            : "本轮的两次抽签机会已经用完。"
        )
    };
  }
  if (state.kind === "spinning") {
    return {
      kind: "spinning",
      ...pool,
      status: "转盘正在转动，结果即将揭晓。"
    };
  }
  if (state.kind === "insufficient") {
    const message = state.candidateCount === 0
      ? "当前没有符合条件的转盘候选。"
      : "至少需要 2 家符合条件的餐厅才能转动。";
    return {
      kind: "insufficient",
      ...pool,
      candidateCount: state.candidateCount,
      canRetry: true,
      message,
      status: state.notice ?? message
    };
  }

  const selected = resultPresentation(state.selected, state.mode);
  const remainingRerolls = Math.max(0, 2 - state.spinNumber);
  const acceptedStatus = `已选定 ${selected.name}。`;
  const status = state.accepted
    ? acceptedStatus
    : state.acceptancePending
      ? state.acceptError ?? `正在确认 ${selected.name}。`
      : interactionPending
        ? "正在处理转盘操作，请稍候。"
        : `抽签结果是 ${selected.name}。`;
  return {
    kind: "result",
    ...pool,
    source: state.source,
    selected,
    accepted: state.accepted,
    acceptancePending: state.acceptancePending,
    accepting: state.accepting,
    canAccept: !interactionPending && !state.accepted && !state.accepting,
    canExclude: !state.accepted
      && !state.acceptancePending
      && !state.accepting
      && !interactionPending,
    canReroll: state.canReroll && !interactionPending,
    ...(state.canReroll && !interactionPending
      ? { rerollLabel: `再转一次（剩余 ${remainingRerolls} 次）` }
      : {}),
    acceptLabel: state.accepted
      ? "已选定"
      : state.accepting
        ? "正在记录..."
        : state.acceptancePending
          ? "重试确认"
          : "就这家",
    ...(state.acceptError ? { acceptError: state.acceptError } : {}),
    status
  };
}

function normalizedDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function createWheelAnimationPlan(input: {
  candidates: readonly LuckyWheelDisplayCandidate[];
  selectedRestaurantId: string;
  currentRotationDegrees: number;
  reducedMotion: boolean;
}): WheelAnimationPlan {
  const sector = createWheelSectors(input.candidates).find(
    ({ restaurantId }) => restaurantId === input.selectedRestaurantId
  );
  if (!sector) throw new RangeError("wheel_selected_sector_missing");

  const restingDegrees = normalizedDegrees(-sector.midpointDegrees);
  const currentDegrees = normalizedDegrees(input.currentRotationDegrees);
  const alignmentDelta = normalizedDegrees(restingDegrees - currentDegrees);
  return {
    selectedRestaurantId: input.selectedRestaurantId,
    selectedMidpointDegrees: sector.midpointDegrees,
    targetRotationDegrees: input.currentRotationDegrees
      + WHEEL_FULL_ROTATIONS * 360
      + alignmentDelta,
    durationMs: input.reducedMotion ? 0 : WHEEL_SPIN_DURATION_MS
  };
}
