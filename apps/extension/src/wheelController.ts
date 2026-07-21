import {
  buildWheelCandidates,
  createCryptoRandomSource,
  selectWheelCandidate,
  type GroupWheelCandidate,
  type GroupWheelCandidatesResponse,
  type PutParticipationTodayRequest,
  type PutParticipationTodayResponse,
  type RandomSource,
  type WheelCandidate,
  type WheelMode
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import { putTodayParticipationForStorage } from "./recommendationClient";
import { getStorageState, type ExtensionStorageShape } from "./storage";
import { fetchGroupWheelCandidatesForStorage } from "./wheelClient";
import {
  clearLuckyWheelSession,
  loadLuckyWheelSession,
  saveLuckyWheelSession,
  type LuckyWheelSessionTicket,
  type LuckyWheelSessionV1
} from "./wheelStorage";

export type LuckyWheelDisplayCandidate = GroupWheelCandidate & WheelCandidate;

type SpinNumber = 0 | 1 | 2;

interface LuckyWheelPoolState {
  response: GroupWheelCandidatesResponse;
  mode: WheelMode;
  modeLocked: boolean;
  spinNumber: SpinNumber;
  excludedRestaurantIds: string[];
  candidates: LuckyWheelDisplayCandidate[];
}

export type LuckyWheelControllerState =
  | { kind: "loading" }
  | ({
    kind: "ready";
    canSpin: boolean;
    notice?: string | undefined;
  } & LuckyWheelPoolState)
  | ({
    kind: "spinning";
    selected: LuckyWheelDisplayCandidate;
  } & LuckyWheelPoolState)
  | ({
    kind: "result";
    source: "live" | "restored";
    selected: LuckyWheelDisplayCandidate;
    accepted: boolean;
    acceptancePending: boolean;
    accepting: boolean;
    canReroll: boolean;
    acceptError?: string | undefined;
  } & LuckyWheelPoolState)
  | ({
    kind: "insufficient";
    candidateCount: number;
    canSpin: false;
    notice?: string | undefined;
  } & LuckyWheelPoolState)
  | {
    kind: "error";
    code: string;
    message: string;
    retryable: boolean;
  };

export interface LuckyWheelControllerDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  loadCandidates: (
    storage: ExtensionStorageShape,
    signal?: AbortSignal
  ) => Promise<GroupWheelCandidatesResponse>;
  loadSession: () => Promise<LuckyWheelSessionV1 | null>;
  saveSession: (
    next: LuckyWheelSessionV1,
    expected: LuckyWheelSessionV1 | null
  ) => Promise<boolean>;
  clearSession: (expected?: LuckyWheelSessionV1) => Promise<boolean>;
  acceptDecision: (
    storage: ExtensionStorageShape,
    input: PutParticipationTodayRequest
  ) => Promise<PutParticipationTodayResponse>;
  randomSource: RandomSource;
  onStateChange?: ((state: LuckyWheelControllerState) => void) | undefined;
  onAcceptanceUpdate?: (
    (update: PutParticipationTodayResponse) => void
  ) | undefined;
}

export interface LoadLuckyWheelInput {
  storage: ExtensionStorageShape;
  enabled: boolean;
  readOnly: boolean;
  initialMode?: WheelMode | undefined;
}

interface LuckyWheelContext {
  storage: ExtensionStorageShape;
  apiBaseUrl: string;
  groupId: string;
  membershipId: string;
}

interface ActionToken {
  generation: number;
  epoch: number;
  abortController: AbortController;
}

type ReconciledSession =
  | { kind: "session"; session: LuckyWheelSessionV1 }
  | { kind: "pending-conflict" }
  | { kind: "stale" }
  | { kind: "aborted" };

function wheelContext(storage: ExtensionStorageShape): LuckyWheelContext | null {
  const groupId = storage.activeGroupId;
  if (!groupId || !storage.sessionsByGroupId[groupId]?.token) return null;
  const membershipId = storage.groupSummariesById[groupId]?.membershipId;
  if (!membershipId) return null;
  return {
    storage,
    apiBaseUrl: storage.apiBaseUrl,
    groupId,
    membershipId
  };
}

function contextMatches(
  context: LuckyWheelContext,
  storage: ExtensionStorageShape
): boolean {
  return storage.apiBaseUrl === context.apiBaseUrl
    && storage.activeGroupId === context.groupId
    && Boolean(storage.sessionsByGroupId[context.groupId]?.token)
    && storage.groupSummariesById[context.groupId]?.membershipId
      === context.membershipId;
}

function sessionMatches(
  session: LuckyWheelSessionV1,
  context: LuckyWheelContext,
  response: GroupWheelCandidatesResponse
): boolean {
  return session.apiBaseUrl === context.apiBaseUrl
    && session.groupId === context.groupId
    && session.membershipId === context.membershipId
    && session.officeDate === response.officeDate
    && session.batchId === response.batchId
    && session.algorithmVersion === response.algorithmVersion;
}

function responseScopeMatches(
  left: GroupWheelCandidatesResponse,
  right: GroupWheelCandidatesResponse
): boolean {
  return left.groupId === right.groupId
    && left.officeDate === right.officeDate
    && left.batchId === right.batchId
    && left.algorithmVersion === right.algorithmVersion;
}

function pendingBlocksReplacement(
  existing: LuckyWheelSessionV1,
  context: LuckyWheelContext,
  response: GroupWheelCandidatesResponse
): boolean {
  return existing.acceptancePending
    && existing.apiBaseUrl === context.apiBaseUrl
    && existing.groupId === context.groupId
    && existing.membershipId === context.membershipId
    && existing.officeDate === response.officeDate;
}

function markerSession(
  context: LuckyWheelContext,
  response: GroupWheelCandidatesResponse,
  mode: WheelMode
): LuckyWheelSessionV1 {
  return {
    version: 1,
    apiBaseUrl: context.apiBaseUrl,
    groupId: context.groupId,
    membershipId: context.membershipId,
    officeDate: response.officeDate,
    batchId: response.batchId,
    algorithmVersion: response.algorithmVersion,
    mode,
    spinNumber: 0,
    excludedRestaurantIds: [],
    accepted: false,
    acceptancePending: false
  };
}

function enrichCandidates(
  seeds: readonly GroupWheelCandidate[],
  calculated: readonly WheelCandidate[]
): LuckyWheelDisplayCandidate[] {
  const byId = new Map(seeds.map((candidate) => [candidate.restaurantId, candidate]));
  return calculated.map((candidate) => ({
    ...byId.get(candidate.restaurantId)!,
    ...candidate
  }));
}

function buildDisplayCandidates(
  seeds: readonly GroupWheelCandidate[],
  mode: WheelMode
): LuckyWheelDisplayCandidate[] {
  return enrichCandidates(seeds, buildWheelCandidates(seeds, mode));
}

function restoreDisplayCandidates(
  seeds: readonly GroupWheelCandidate[],
  tickets: readonly LuckyWheelSessionTicket[]
): LuckyWheelDisplayCandidate[] | null {
  if (seeds.length !== tickets.length) return null;
  const byId = new Map(seeds.map((candidate) => [candidate.restaurantId, candidate]));
  if (tickets.some(({ restaurantId }) => !byId.has(restaurantId))) return null;
  const totalTickets = tickets.reduce((total, item) => total + item.tickets, 0);
  let cumulativeTickets = 0;
  return tickets.map((item, index) => {
    const seed = byId.get(item.restaurantId)!;
    const cumulativeProbabilityStart = cumulativeTickets / totalTickets;
    cumulativeTickets += item.tickets;
    return {
      ...seed,
      tickets: item.tickets,
      probability: item.tickets / totalTickets,
      cumulativeProbabilityStart,
      cumulativeProbabilityEnd: index === tickets.length - 1
        ? 1
        : cumulativeTickets / totalTickets
    };
  });
}

function withoutLastSpin(session: LuckyWheelSessionV1): LuckyWheelSessionV1 {
  const { lastSpin: _lastSpin, ...rest } = session;
  return {
    ...rest,
    accepted: false,
    acceptancePending: false
  };
}

function samePersistedResult(
  left: LuckyWheelSessionV1,
  right: LuckyWheelSessionV1
): boolean {
  return left.apiBaseUrl === right.apiBaseUrl
    && left.groupId === right.groupId
    && left.membershipId === right.membershipId
    && left.officeDate === right.officeDate
    && left.batchId === right.batchId
    && left.algorithmVersion === right.algorithmVersion
    && left.mode === right.mode
    && left.spinNumber === right.spinNumber
    && JSON.stringify(left.excludedRestaurantIds)
      === JSON.stringify(right.excludedRestaurantIds)
    && JSON.stringify(left.lastSpin) === JSON.stringify(right.lastSpin);
}

function storageErrorState(): LuckyWheelControllerState {
  return {
    kind: "error",
    code: "wheel_storage_failed",
    message: "暂时无法安全保存转盘状态，请重试。",
    retryable: true
  };
}

function actionFailureState(error: unknown): LuckyWheelControllerState {
  if (
    error instanceof ExtensionApiError
    && error.code === "lucky_restaurant_wheel_not_enabled"
  ) {
    return {
      kind: "error",
      code: error.code,
      message: "幸运大转盘暂未对当前小组开放。",
      retryable: false
    };
  }
  if (error instanceof ExtensionApiError) {
    return {
      kind: "error",
      code: error.code ?? "wheel_candidates_refresh_failed",
      message: "暂时无法刷新转盘候选，请重试。",
      retryable: true
    };
  }
  return storageErrorState();
}

function staleContextState(): LuckyWheelControllerState {
  return {
    kind: "error",
    code: "wheel_context_stale",
    message: "当前小组或推荐批次已变化，请重新打开转盘。",
    retryable: false
  };
}

function terminalResultChangedState(): LuckyWheelControllerState {
  return {
    kind: "error",
    code: "wheel_terminal_result_changed",
    message: "已提交或待确认的转盘结果对应候选已变化，不能继续重转。",
    retryable: false
  };
}

function pendingContextChangedState(): LuckyWheelControllerState {
  return {
    kind: "error",
    code: "wheel_acceptance_pending_context_changed",
    message: "上一次选择仍待确认，当前批次已变化，暂不能继续重转。",
    retryable: false
  };
}

export function createLuckyWheelController(
  dependencies: LuckyWheelControllerDependencies
) {
  let state: LuckyWheelControllerState = { kind: "loading" };
  let context: LuckyWheelContext | null = null;
  let response: GroupWheelCandidatesResponse | null = null;
  let session: LuckyWheelSessionV1 | null = null;
  let generation = 0;
  let operationEpoch = 0;
  let loadAbortController: AbortController | null = null;
  let actionAbortController: AbortController | null = null;
  let actionPending = false;

  function commit(next: LuckyWheelControllerState): LuckyWheelControllerState {
    state = next;
    dependencies.onStateChange?.(next);
    return next;
  }

  function beginAction(): ActionToken | null {
    if (actionPending) return null;
    actionPending = true;
    const token: ActionToken = {
      generation,
      epoch: ++operationEpoch,
      abortController: new AbortController()
    };
    actionAbortController = token.abortController;
    return token;
  }

  function actionIsCurrent(token: ActionToken): boolean {
    return token.generation === generation
      && token.epoch === operationEpoch
      && actionAbortController === token.abortController
      && !token.abortController.signal.aborted;
  }

  function finishAction(token: ActionToken): void {
    if (token.epoch !== operationEpoch) return;
    actionPending = false;
    if (actionAbortController === token.abortController) {
      actionAbortController = null;
    }
  }

  function availableSeeds(): GroupWheelCandidate[] {
    if (!response) return [];
    const excluded = new Set(session?.excludedRestaurantIds ?? []);
    return response.candidates.filter(
      ({ restaurantId }) => !excluded.has(restaurantId)
    );
  }

  function poolState(
    mode: WheelMode,
    spinNumber: SpinNumber,
    candidates: LuckyWheelDisplayCandidate[]
  ): LuckyWheelPoolState {
    return {
      response: response!,
      mode,
      modeLocked: spinNumber > 0,
      spinNumber,
      excludedRestaurantIds: [...(session?.excludedRestaurantIds ?? [])],
      candidates
    };
  }

  function commitAvailablePool(notice?: string): LuckyWheelControllerState {
    const mode = session?.mode ?? (
      "mode" in state ? state.mode : "weighted"
    );
    const spinNumber = session?.spinNumber ?? 0;
    const candidates = buildDisplayCandidates(availableSeeds(), mode);
    const common = poolState(mode, spinNumber, candidates);
    if (candidates.length < 2) {
      return commit({
        kind: "insufficient",
        ...common,
        candidateCount: candidates.length,
        canSpin: false,
        ...(notice ? { notice } : {})
      });
    }
    return commit({
      kind: "ready",
      ...common,
      canSpin: spinNumber < 2,
      ...(notice ? { notice } : {})
    });
  }

  async function renderReconciledSession(
    token: ActionToken,
    notice: string
  ): Promise<void> {
    if (!session?.lastSpin) {
      commitAvailablePool(notice);
      return;
    }
    const restored = restoreDisplayCandidates(
      availableSeeds(),
      session.lastSpin.candidateTickets
    );
    const selected = restored?.find(
      ({ restaurantId }) => restaurantId === session!.lastSpin!.selectedRestaurantId
    );
    if (
      restored
      && selected
      && (selected.recommendationId ?? null)
        === session.lastSpin.selectedRecommendationId
    ) {
      commit({
        kind: "result",
        ...poolState(session.mode, session.spinNumber, restored),
        source: "restored",
        selected,
        accepted: session.accepted,
        acceptancePending: session.acceptancePending,
        accepting: false,
        canReroll: !session.accepted
          && !session.acceptancePending
          && session.spinNumber < 2
      });
      return;
    }
    if (session.accepted || session.acceptancePending) {
      commit(terminalResultChangedState());
      return;
    }

    const previous = session;
    const next = withoutLastSpin(previous);
    const saved = await dependencies.saveSession(next, previous);
    if (!actionIsCurrent(token)) return;
    if (!saved) {
      commit(staleContextState());
      return;
    }
    session = next;
    commitAvailablePool("推荐批次和候选已更新，之前的结果不再可用。");
  }

  async function reconcileSession(
    expectedContext: LuckyWheelContext,
    liveResponse: GroupWheelCandidatesResponse,
    loaded: LuckyWheelSessionV1 | null,
    mode: WheelMode,
    isCurrent: () => boolean
  ): Promise<ReconciledSession> {
    if (loaded && sessionMatches(loaded, expectedContext, liveResponse)) {
      return { kind: "session", session: loaded };
    }
    if (loaded && pendingBlocksReplacement(loaded, expectedContext, liveResponse)) {
      return { kind: "pending-conflict" };
    }

    let expected = loaded;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const marker = markerSession(expectedContext, liveResponse, mode);
      const saved = await dependencies.saveSession(marker, expected);
      if (!isCurrent()) return { kind: "aborted" };
      if (saved) return { kind: "session", session: marker };

      expected = await dependencies.loadSession();
      if (!isCurrent()) return { kind: "aborted" };
      if (expected && sessionMatches(expected, expectedContext, liveResponse)) {
        return { kind: "session", session: expected };
      }
      if (expected && pendingBlocksReplacement(expected, expectedContext, liveResponse)) {
        return { kind: "pending-conflict" };
      }
    }
    return { kind: "stale" };
  }

  async function load(input: LoadLuckyWheelInput): Promise<LuckyWheelControllerState> {
    const loadGeneration = ++generation;
    operationEpoch += 1;
    loadAbortController?.abort();
    actionAbortController?.abort();
    loadAbortController = null;
    actionAbortController = null;
    actionPending = false;
    context = null;
    response = null;
    session = null;
    commit({ kind: "loading" });

    if (!input.enabled) {
      return commit({
        kind: "error",
        code: "wheel_not_enabled",
        message: "幸运大转盘暂未对当前小组开放。",
        retryable: false
      });
    }
    if (input.readOnly) {
      return commit({
        kind: "error",
        code: "wheel_read_only",
        message: "缓存内容仅供查看，暂时不能开始新的转盘。",
        retryable: false
      });
    }
    const captured = wheelContext(input.storage);
    if (!captured) {
      return commit({
        kind: "error",
        code: "wheel_connection_required",
        message: "请先连接当前小组。",
        retryable: false
      });
    }

    const initialMode = input.initialMode ?? "weighted";
    const localAbort = new AbortController();
    loadAbortController = localAbort;
    const loadIsCurrent = () => generation === loadGeneration
      && loadAbortController === localAbort
      && !localAbort.signal.aborted;

    try {
      const [loadedResponse, loadedSession] = await Promise.all([
        dependencies.loadCandidates(input.storage, localAbort.signal),
        dependencies.loadSession()
      ]);
      if (!loadIsCurrent()) return state;

      const currentStorage = await dependencies.loadStorage();
      if (!loadIsCurrent()) return state;
      if (!contextMatches(captured, currentStorage)) {
        return commit(staleContextState());
      }
      const currentContext = wheelContext(currentStorage)!;
      const reconciled = await reconcileSession(
        currentContext,
        loadedResponse,
        loadedSession,
        initialMode,
        loadIsCurrent
      );
      if (!loadIsCurrent() || reconciled.kind === "aborted") return state;
      if (reconciled.kind === "pending-conflict") {
        return commit(pendingContextChangedState());
      }
      if (reconciled.kind === "stale") return commit(staleContextState());

      context = currentContext;
      response = loadedResponse;
      session = reconciled.session;
      const seeds = availableSeeds();
      if (session.lastSpin) {
        const restored = restoreDisplayCandidates(
          seeds,
          session.lastSpin.candidateTickets
        );
        const selected = restored?.find(
          ({ restaurantId }) => restaurantId === session!.lastSpin!.selectedRestaurantId
        );
        if (
          restored
          && selected
          && (selected.recommendationId ?? null)
            === session.lastSpin.selectedRecommendationId
        ) {
          return commit({
            kind: "result",
            ...poolState(session.mode, session.spinNumber, restored),
            source: "restored",
            selected,
            accepted: session.accepted,
            acceptancePending: session.acceptancePending,
            accepting: false,
            canReroll: !session.accepted
              && !session.acceptancePending
              && session.spinNumber < 2
          });
        }
        if (session.accepted || session.acceptancePending) {
          return commit(terminalResultChangedState());
        }
        const previous = session;
        const next = withoutLastSpin(previous);
        const saved = await dependencies.saveSession(next, previous);
        if (!loadIsCurrent()) return state;
        if (!saved) return commit(staleContextState());
        session = next;
        return commitAvailablePool("候选餐厅已变化，之前的结果不再可用。");
      }
      return commitAvailablePool();
    } catch (error) {
      if (!loadIsCurrent()) return state;
      const code = error instanceof Error && "code" in error
        && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "wheel_load_failed";
      if (code === "lucky_restaurant_wheel_not_enabled") {
        return commit({
          kind: "error",
          code,
          message: "幸运大转盘暂未对当前小组开放。",
          retryable: false
        });
      }
      return commit({
        kind: "error",
        code,
        message: "暂时无法加载转盘候选，请重试。",
        retryable: true
      });
    }
  }

  function setMode(mode: WheelMode): boolean {
    if (
      (state.kind !== "ready" && state.kind !== "insufficient")
      || state.spinNumber !== 0
      || actionPending
    ) {
      return false;
    }
    const candidates = buildDisplayCandidates(availableSeeds(), mode);
    const common = poolState(mode, 0, candidates);
    if (candidates.length < 2) {
      commit({
        kind: "insufficient",
        ...common,
        candidateCount: candidates.length,
        canSpin: false
      });
    } else {
      commit({ kind: "ready", ...common, canSpin: true });
    }
    return true;
  }

  async function refreshForAction(
    token: ActionToken,
    expectedContext: LuckyWheelContext,
    mode: WheelMode
  ): Promise<"current" | "changed" | "failed"> {
    const fresh = await dependencies.loadCandidates(
      expectedContext.storage,
      token.abortController.signal
    );
    if (!actionIsCurrent(token)) return "failed";

    const currentStorage = await dependencies.loadStorage();
    if (!actionIsCurrent(token)) return "failed";
    if (!contextMatches(expectedContext, currentStorage)) {
      commit(staleContextState());
      return "failed";
    }
    const currentContext = wheelContext(currentStorage)!;
    context = currentContext;

    if (response && responseScopeMatches(response, fresh)) {
      response = fresh;
      return "current";
    }
    if (session?.acceptancePending) {
      commit(pendingContextChangedState());
      return "failed";
    }

    const reconciled = await reconcileSession(
      currentContext,
      fresh,
      session,
      mode,
      () => actionIsCurrent(token)
    );
    if (!actionIsCurrent(token) || reconciled.kind === "aborted") return "failed";
    if (reconciled.kind === "pending-conflict") {
      commit(pendingContextChangedState());
      return "failed";
    }
    if (reconciled.kind === "stale") {
      commit(staleContextState());
      return "failed";
    }
    response = fresh;
    session = reconciled.session;
    if (session.lastSpin) {
      await renderReconciledSession(
        token,
        "推荐批次已更新，已恢复另一窗口保存的转盘结果。"
      );
      if (!actionIsCurrent(token)) return "failed";
    } else {
      commitAvailablePool("推荐批次已更新，请基于新候选重新转动。");
    }
    return "changed";
  }

  async function spin(): Promise<boolean> {
    if (
      !context
      || !response
      || actionPending
      || (state.kind !== "ready" && state.kind !== "result")
      || state.spinNumber >= 2
      || (state.kind === "result" && (
        state.accepted || state.acceptancePending
      ))
    ) {
      return false;
    }
    const expectedContext = context;
    const currentSpinNumber = state.spinNumber;
    const mode = state.mode;
    const token = beginAction();
    if (!token) return false;
    try {
      const freshness = await refreshForAction(token, expectedContext, mode);
      if (freshness !== "current" || !actionIsCurrent(token)) return false;

      const drawCandidates = buildDisplayCandidates(availableSeeds(), mode);
      if (drawCandidates.length < 2) {
        commitAvailablePool();
        return false;
      }
      const selectedBase = selectWheelCandidate(
        drawCandidates,
        dependencies.randomSource
      );
      const selected = drawCandidates.find(
        ({ restaurantId }) => restaurantId === selectedBase.restaurantId
      )!;
      const nextSession: LuckyWheelSessionV1 = {
        version: 1,
        apiBaseUrl: context!.apiBaseUrl,
        groupId: context!.groupId,
        membershipId: context!.membershipId,
        officeDate: response!.officeDate,
        batchId: response!.batchId,
        algorithmVersion: response!.algorithmVersion,
        mode,
        spinNumber: (currentSpinNumber + 1) as 1 | 2,
        excludedRestaurantIds: [...(session?.excludedRestaurantIds ?? [])],
        lastSpin: {
          selectedRestaurantId: selected.restaurantId,
          selectedRecommendationId: selected.recommendationId ?? null,
          candidateTickets: drawCandidates.map(({ restaurantId, tickets }) => ({
            restaurantId,
            tickets
          }))
        },
        accepted: false,
        acceptancePending: false
      };
      const expectedSession = session;
      const saved = await dependencies.saveSession(nextSession, expectedSession);
      if (!actionIsCurrent(token)) return false;
      if (!saved) {
        commit(staleContextState());
        return false;
      }
      session = nextSession;
      commit({
        kind: "spinning",
        ...poolState(mode, nextSession.spinNumber, drawCandidates),
        selected
      });
      return true;
    } catch (error) {
      if (actionIsCurrent(token)) commit(actionFailureState(error));
      return false;
    } finally {
      finishAction(token);
    }
  }

  function finishSpin(): boolean {
    if (state.kind !== "spinning") return false;
    commit({
      kind: "result",
      response: state.response,
      mode: state.mode,
      modeLocked: true,
      spinNumber: state.spinNumber,
      excludedRestaurantIds: state.excludedRestaurantIds,
      candidates: state.candidates,
      source: "live",
      selected: state.selected,
      accepted: false,
      acceptancePending: false,
      accepting: false,
      canReroll: state.spinNumber < 2
    });
    return true;
  }

  async function excludeSelected(): Promise<boolean> {
    if (
      state.kind !== "result"
      || state.accepted
      || state.acceptancePending
      || state.accepting
      || !session
      || !context
      || actionPending
    ) {
      return false;
    }
    const expectedState = state;
    const expectedSession = session;
    const expectedContext = context;
    const token = beginAction();
    if (!token) return false;
    try {
      const currentStorage = await dependencies.loadStorage();
      if (!actionIsCurrent(token)) return false;
      if (!contextMatches(expectedContext, currentStorage)) {
        commit(staleContextState());
        return false;
      }
      const excludedRestaurantIds = [
        ...new Set([
          ...expectedSession.excludedRestaurantIds,
          expectedState.selected.restaurantId
        ])
      ];
      const next = withoutLastSpin({
        ...expectedSession,
        excludedRestaurantIds
      });
      const saved = await dependencies.saveSession(next, expectedSession);
      if (!actionIsCurrent(token)) return false;
      if (!saved) {
        commit(staleContextState());
        return false;
      }
      context = wheelContext(currentStorage)!;
      session = next;
      commitAvailablePool();
      return true;
    } catch {
      if (actionIsCurrent(token)) commit(storageErrorState());
      return false;
    } finally {
      finishAction(token);
    }
  }

  function validAcceptance(
    update: PutParticipationTodayResponse,
    selected: LuckyWheelDisplayCandidate,
    expectedContext: LuckyWheelContext,
    expectedResponse: GroupWheelCandidatesResponse
  ): boolean {
    return update.groupId === expectedContext.groupId
      && update.officeDate === expectedResponse.officeDate
      && update.participation.membershipId === expectedContext.membershipId
      && update.participation.status === "decided"
      && update.participation.restaurantId === selected.restaurantId
      && update.participation.recommendationId === selected.recommendationId;
  }

  function pendingResultState(
    resultState: Extract<LuckyWheelControllerState, { kind: "result" }>,
    input: { accepting: boolean; error?: string | undefined }
  ): LuckyWheelControllerState {
    return {
      ...resultState,
      accepted: false,
      acceptancePending: true,
      accepting: input.accepting,
      canReroll: false,
      ...(input.error ? { acceptError: input.error } : { acceptError: undefined })
    };
  }

  async function acceptSelected(): Promise<boolean> {
    if (
      state.kind !== "result"
      || state.accepted
      || state.accepting
      || !session
      || !context
      || actionPending
    ) {
      return false;
    }
    const resultState = state;
    const originalSession = session;
    const expectedContext = context;
    const token = beginAction();
    if (!token) return false;
    let claimedSession = originalSession;
    try {
      const freshness = await refreshForAction(token, expectedContext, resultState.mode);
      if (freshness !== "current" || !actionIsCurrent(token)) return false;
      const freshResponse = response!;
      const currentContext = context!;
      const currentSelected = freshResponse.candidates.find(
        ({ restaurantId }) => restaurantId === resultState.selected.restaurantId
      );
      if (
        !currentSelected
        || currentSelected.recommendationId !== resultState.selected.recommendationId
      ) {
        commit({
          ...resultState,
          accepting: false,
          canReroll: !resultState.acceptancePending && resultState.spinNumber < 2,
          acceptError: "候选餐厅已变化，请重新转动或重新打开转盘。"
        });
        return false;
      }

      if (!originalSession.acceptancePending) {
        const pending: LuckyWheelSessionV1 = {
          ...originalSession,
          accepted: false,
          acceptancePending: true
        };
        const claimed = await dependencies.saveSession(pending, originalSession);
        if (!actionIsCurrent(token)) return false;
        if (!claimed) {
          const latest = await dependencies.loadSession();
          if (!actionIsCurrent(token)) return false;
          if (!latest || !samePersistedResult(latest, originalSession)) {
            commit(staleContextState());
            return false;
          }
          if (latest.accepted) {
            session = latest;
            commit({
              ...resultState,
              accepted: true,
              acceptancePending: false,
              accepting: false,
              canReroll: false,
              acceptError: undefined
            });
            return true;
          }
          if (!latest.acceptancePending) {
            commit(staleContextState());
            return false;
          }
          claimedSession = latest;
        } else {
          claimedSession = pending;
        }
        session = claimedSession;
      }

      commit(pendingResultState(resultState, { accepting: true }));
      const update = await dependencies.acceptDecision(
        currentContext.storage,
        {
          status: "decided",
          restaurantId: resultState.selected.restaurantId,
          ...(resultState.selected.recommendationId
            ? { recommendationId: resultState.selected.recommendationId }
            : {})
        }
      );
      if (!actionIsCurrent(token)) return false;

      const latestStorage = await dependencies.loadStorage();
      if (!actionIsCurrent(token)) return false;
      if (!contextMatches(currentContext, latestStorage)) {
        commit(staleContextState());
        return false;
      }
      if (
        !validAcceptance(
          update,
          resultState.selected,
          currentContext,
          freshResponse
        )
      ) {
        commit(pendingResultState(resultState, {
          accepting: false,
          error: "暂时无法确认这次选择，请重试。"
        }));
        return false;
      }
      try {
        dependencies.onAcceptanceUpdate?.(update);
      } catch {
        // UI observers must not turn a validated Server write into a failed accept.
      }

      const acceptedSession: LuckyWheelSessionV1 = {
        ...claimedSession,
        accepted: true,
        acceptancePending: false
      };
      let saved = false;
      try {
        saved = await dependencies.saveSession(acceptedSession, claimedSession);
      } catch {
        saved = false;
      }
      if (!actionIsCurrent(token)) return false;
      if (!saved) {
        const latest = await dependencies.loadSession().catch(() => null);
        if (!actionIsCurrent(token)) return false;
        if (
          latest
          && latest.accepted
          && samePersistedResult(latest, claimedSession)
        ) {
          session = latest;
          commit({
            ...resultState,
            accepted: true,
            acceptancePending: false,
            accepting: false,
            canReroll: false,
            acceptError: undefined
          });
          return true;
        }
        session = claimedSession;
        commit(pendingResultState(resultState, {
          accepting: false,
          error: "选择已提交，但本机状态未能确认，请重新打开转盘核对。"
        }));
        return false;
      }
      session = acceptedSession;
      context = wheelContext(latestStorage)!;
      commit({
        ...resultState,
        accepted: true,
        acceptancePending: false,
        accepting: false,
        canReroll: false,
        acceptError: undefined
      });
      return true;
    } catch {
      if (actionIsCurrent(token)) {
        if (claimedSession.acceptancePending) {
          session = claimedSession;
          commit(pendingResultState(resultState, {
            accepting: false,
            error: "暂时无法确认这次选择，请重试。"
          }));
        } else {
          commit({
            ...resultState,
            accepting: false,
            acceptError: "暂时无法确认这次选择，请重试。"
          });
        }
      }
      return false;
    } finally {
      finishAction(token);
    }
  }

  function cancel(): void {
    generation += 1;
    operationEpoch += 1;
    loadAbortController?.abort();
    actionAbortController?.abort();
    loadAbortController = null;
    actionAbortController = null;
    actionPending = false;
  }

  return {
    load,
    setMode,
    spin,
    finishSpin,
    excludeSelected,
    acceptSelected,
    cancel,
    getState: () => state
  };
}

export function createExtensionLuckyWheelController(options: {
  randomSource?: RandomSource | undefined;
  onStateChange?: ((state: LuckyWheelControllerState) => void) | undefined;
  onAcceptanceUpdate?: (
    (update: PutParticipationTodayResponse) => void
  ) | undefined;
} = {}) {
  return createLuckyWheelController({
    loadStorage: getStorageState,
    loadCandidates: fetchGroupWheelCandidatesForStorage,
    loadSession: loadLuckyWheelSession,
    saveSession: saveLuckyWheelSession,
    clearSession: clearLuckyWheelSession,
    acceptDecision: putTodayParticipationForStorage,
    randomSource: options.randomSource ?? createCryptoRandomSource(),
    ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
    ...(options.onAcceptanceUpdate
      ? { onAcceptanceUpdate: options.onAcceptanceUpdate }
      : {})
  });
}
