import type {
  GroupWheelCandidate,
  WheelMode,
  WheelTicketCount
} from "@lunch/shared";
import { STORAGE_KEYS, STORAGE_STATE_LOCK_NAME } from "./config";

export interface LuckyWheelSessionTicket {
  restaurantId: string;
  tickets: WheelTicketCount;
}

export interface LuckyWheelSessionV1 {
  version: 1;
  apiBaseUrl: string;
  groupId: string;
  membershipId: string;
  authorizationRevision: number;
  officeDate: string;
  batchId: string;
  algorithmVersion: string;
  mode: WheelMode;
  spinNumber: 0 | 1 | 2;
  excludedRestaurantIds: string[];
  lastSpin?: {
    selectedRestaurantId: string;
    selectedRecommendationId: string | null;
    candidateTickets: LuckyWheelSessionTicket[];
    selectedCandidateSnapshot?: GroupWheelCandidate | undefined;
  } | undefined;
  accepted: boolean;
  acceptancePending: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRealOfficeDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function uniqueNonEmptyStrings(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every(nonEmptyString)
    && new Set(value).size === value.length;
}

function parseTickets(value: unknown): LuckyWheelSessionTicket[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return null;
  const tickets: LuckyWheelSessionTicket[] = [];
  for (const item of value) {
    if (
      !isRecord(item)
      || !nonEmptyString(item.restaurantId)
      || ![1, 2, 3].includes(item.tickets as number)
    ) {
      return null;
    }
    tickets.push({
      restaurantId: item.restaurantId,
      tickets: item.tickets as WheelTicketCount
    });
  }
  return new Set(tickets.map(({ restaurantId }) => restaurantId)).size === tickets.length
    ? tickets
    : null;
}

function optionalNonEmptyString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return nonEmptyString(value) ? value : null;
}

function parseSelectedCandidateSnapshot(
  value: unknown
): GroupWheelCandidate | null {
  if (
    !isRecord(value)
    || !nonEmptyString(value.restaurantId)
    || !nonEmptyString(value.name)
    || !nonEmptyString(value.reason)
    || typeof value.recommendationScore !== "number"
    || !Number.isFinite(value.recommendationScore)
    || typeof value.selectedWithinLast7Days !== "boolean"
    || !Array.isArray(value.tags)
    || value.tags.some((tag) => typeof tag !== "string")
    || (
      value.distanceMinutes !== undefined
      && (
        typeof value.distanceMinutes !== "number"
        || !Number.isFinite(value.distanceMinutes)
        || value.distanceMinutes < 0
      )
    )
  ) {
    return null;
  }
  const recommendationId = optionalNonEmptyString(value.recommendationId);
  const dish = optionalNonEmptyString(value.dish);
  if (recommendationId === null || dish === null) return null;
  return {
    restaurantId: value.restaurantId,
    ...(recommendationId === undefined ? {} : { recommendationId }),
    name: value.name,
    ...(dish === undefined ? {} : { dish }),
    reason: value.reason,
    ...(value.distanceMinutes === undefined
      ? {}
      : { distanceMinutes: value.distanceMinutes }),
    tags: [...value.tags] as string[],
    recommendationScore: value.recommendationScore,
    selectedWithinLast7Days: value.selectedWithinLast7Days
  };
}

function parseLuckyWheelSession(value: unknown): LuckyWheelSessionV1 | null {
  if (
    !isRecord(value)
    || value.version !== 1
    || !nonEmptyString(value.apiBaseUrl)
    || !nonEmptyString(value.groupId)
    || !nonEmptyString(value.membershipId)
    || !isRealOfficeDate(value.officeDate)
    || !nonEmptyString(value.batchId)
    || !nonEmptyString(value.algorithmVersion)
    || (value.mode !== "equal" && value.mode !== "weighted")
    || ![0, 1, 2].includes(value.spinNumber as number)
    || !uniqueNonEmptyStrings(value.excludedRestaurantIds)
    || typeof value.accepted !== "boolean"
    || typeof value.acceptancePending !== "boolean"
  ) {
    return null;
  }
  const authorizationRevision = value.authorizationRevision === undefined
    ? 0
    : value.authorizationRevision;
  if (
    !Number.isInteger(authorizationRevision)
    || (authorizationRevision as number) < 0
  ) {
    return null;
  }

  let lastSpin: LuckyWheelSessionV1["lastSpin"];
  if (value.lastSpin !== undefined) {
    const rawLastSpin = value.lastSpin;
    if (
      !isRecord(rawLastSpin)
      || !nonEmptyString(rawLastSpin.selectedRestaurantId)
      || (
        rawLastSpin.selectedRecommendationId !== null
        && !nonEmptyString(rawLastSpin.selectedRecommendationId)
      )
    ) {
      return null;
    }
    const selectedRestaurantId = rawLastSpin.selectedRestaurantId;
    const selectedRecommendationId = rawLastSpin.selectedRecommendationId as string | null;
    const candidateTickets = parseTickets(rawLastSpin.candidateTickets);
    const selectedCandidateSnapshot = rawLastSpin.selectedCandidateSnapshot === undefined
      ? undefined
      : parseSelectedCandidateSnapshot(rawLastSpin.selectedCandidateSnapshot);
    if (
      !candidateTickets
      || !candidateTickets.some(
        ({ restaurantId }) => restaurantId === selectedRestaurantId
      )
      || candidateTickets.some(({ restaurantId }) => (
        (value.excludedRestaurantIds as string[]).includes(restaurantId)
      ))
      || selectedCandidateSnapshot === null
      || (
        selectedCandidateSnapshot !== undefined
        && (
          selectedCandidateSnapshot.restaurantId !== selectedRestaurantId
          || (selectedCandidateSnapshot.recommendationId ?? null)
            !== selectedRecommendationId
        )
      )
    ) {
      return null;
    }
    lastSpin = {
      selectedRestaurantId,
      selectedRecommendationId,
      candidateTickets,
      ...(selectedCandidateSnapshot === undefined
        ? {}
        : { selectedCandidateSnapshot })
    };
  }
  if (
    (value.spinNumber === 0 && lastSpin)
    || (value.spinNumber === 0 && value.excludedRestaurantIds.length > 0)
    || (value.accepted && value.acceptancePending)
    || ((value.accepted || value.acceptancePending) && !lastSpin)
  ) {
    return null;
  }

  return {
    version: 1,
    apiBaseUrl: value.apiBaseUrl,
    groupId: value.groupId,
    membershipId: value.membershipId,
    authorizationRevision: authorizationRevision as number,
    officeDate: value.officeDate,
    batchId: value.batchId,
    algorithmVersion: value.algorithmVersion,
    mode: value.mode,
    spinNumber: value.spinNumber as 0 | 1 | 2,
    excludedRestaurantIds: [...value.excludedRestaurantIds],
    ...(lastSpin ? { lastSpin } : {}),
    accepted: value.accepted,
    acceptancePending: value.acceptancePending
  };
}

function sameSession(
  left: LuckyWheelSessionV1 | null,
  right: LuckyWheelSessionV1 | null
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function activeContextMatches(
  rawState: unknown,
  session: LuckyWheelSessionV1
): boolean {
  if (!isRecord(rawState)) return false;
  const sessions = rawState.sessionsByGroupId;
  const groups = rawState.groupSummariesById;
  if (!isRecord(sessions) || !isRecord(groups)) return false;
  const activeSession = sessions[session.groupId];
  const activeGroup = groups[session.groupId];
  const authorizationRevision = rawState.authorizationRevision === undefined
    ? 0
    : rawState.authorizationRevision;
  return rawState.apiBaseUrl === session.apiBaseUrl
    && rawState.activeGroupId === session.groupId
    && isRecord(activeSession)
    && nonEmptyString(activeSession.token)
    && isRecord(activeGroup)
    && activeGroup.membershipId === session.membershipId
    && Number.isInteger(authorizationRevision)
    && (authorizationRevision as number) >= 0
    && authorizationRevision === session.authorizationRevision;
}

function lockManager(): LockManager {
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error("storage_lock_unavailable");
  return locks;
}

export async function loadLuckyWheelSession(): Promise<LuckyWheelSessionV1 | null> {
  return lockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    async () => {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.luckyWheelSession);
      const raw = stored[STORAGE_KEYS.luckyWheelSession];
      if (raw === undefined) return null;
      const parsed = parseLuckyWheelSession(raw);
      if (!parsed) {
        await chrome.storage.local.remove(STORAGE_KEYS.luckyWheelSession);
        return null;
      }
      return parsed;
    }
  );
}

export async function saveLuckyWheelSession(
  next: LuckyWheelSessionV1,
  expected: LuckyWheelSessionV1 | null
): Promise<boolean> {
  const normalized = parseLuckyWheelSession(next);
  if (!normalized) throw new TypeError("invalid_lucky_wheel_session");
  return lockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    async () => {
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.state,
        STORAGE_KEYS.luckyWheelSession
      ]);
      const rawCurrent = stored[STORAGE_KEYS.luckyWheelSession];
      const current = rawCurrent === undefined
        ? null
        : parseLuckyWheelSession(rawCurrent);
      if (!sameSession(current, expected)) return false;
      if (!activeContextMatches(stored[STORAGE_KEYS.state], normalized)) {
        return false;
      }
      await chrome.storage.local.set({
        [STORAGE_KEYS.luckyWheelSession]: normalized
      });
      return true;
    }
  );
}

export async function clearLuckyWheelSession(
  expected?: LuckyWheelSessionV1
): Promise<boolean> {
  return lockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    async () => {
      if (expected) {
        const stored = await chrome.storage.local.get(STORAGE_KEYS.luckyWheelSession);
        const rawCurrent = stored[STORAGE_KEYS.luckyWheelSession];
        const current = rawCurrent === undefined
          ? null
          : parseLuckyWheelSession(rawCurrent);
        if (!sameSession(current, expected)) return false;
      }
      await chrome.storage.local.remove(STORAGE_KEYS.luckyWheelSession);
      return true;
    }
  );
}
