export const WHEEL_MIN_CANDIDATES = 2;
export const WHEEL_MAX_CANDIDATES = 8;

export type WheelMode = "equal" | "weighted";
export type WheelTicketCount = 1 | 2 | 3;
export type RandomSource = () => number;

export interface WheelCandidateInput {
  restaurantId: string;
  name: string;
  recommendationScore: number;
  selectedWithinLast7Days: boolean;
}

export interface WheelCandidate extends WheelCandidateInput {
  tickets: WheelTicketCount;
  probability: number;
  cumulativeProbabilityStart: number;
  cumulativeProbabilityEnd: number;
}

export interface CryptoRandomValuesSource {
  getRandomValues(values: Uint32Array): Uint32Array;
}

function assertValidCandidatePool(
  candidates: readonly WheelCandidateInput[]
): void {
  const restaurantIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.restaurantId.trim().length === 0) {
      throw new RangeError("Wheel candidates must have a restaurantId");
    }
    if (restaurantIds.has(candidate.restaurantId)) {
      throw new RangeError("Wheel candidates must have a unique restaurantId");
    }
    restaurantIds.add(candidate.restaurantId);
    if (!Number.isFinite(candidate.recommendationScore)) {
      throw new RangeError(
        "Wheel candidates must have a finite recommendationScore"
      );
    }
  }
}

function clampTicketCount(value: number): WheelTicketCount {
  return Math.max(1, Math.min(3, value)) as WheelTicketCount;
}

function calculateTicketCounts(
  candidates: readonly WheelCandidateInput[],
  mode: WheelMode
): WheelTicketCount[] {
  if (mode === "equal" || candidates.length === 0) {
    return candidates.map(() => 1);
  }

  const scores = candidates.map((candidate) => candidate.recommendationScore);
  const minimumScore = Math.min(...scores);
  const maximumScore = Math.max(...scores);
  if (minimumScore === maximumScore) {
    return candidates.map(() => 1);
  }

  const scoreRange = maximumScore - minimumScore;
  return candidates.map((candidate) => {
    const normalizedScore =
      (candidate.recommendationScore - minimumScore) / scoreRange;
    const scoreTickets = clampTicketCount(1 + Math.round(normalizedScore * 2));
    return candidate.selectedWithinLast7Days
      ? clampTicketCount(scoreTickets - 1)
      : scoreTickets;
  });
}

export function buildWheelCandidates(
  rankedCandidates: readonly WheelCandidateInput[],
  mode: WheelMode
): WheelCandidate[] {
  if (rankedCandidates.length > WHEEL_MAX_CANDIDATES) {
    throw new RangeError(
      `A wheel supports at most ${WHEEL_MAX_CANDIDATES} candidates`
    );
  }

  const candidates = [...rankedCandidates];
  assertValidCandidatePool(candidates);
  const tickets = calculateTicketCounts(candidates, mode);
  const totalTickets = tickets.reduce((total, count) => total + count, 0);
  let cumulativeTickets = 0;

  return candidates.map((candidate, index) => {
    const ticketCount = tickets[index]!;
    const cumulativeProbabilityStart =
      totalTickets === 0 ? 0 : cumulativeTickets / totalTickets;
    cumulativeTickets += ticketCount;
    const cumulativeProbabilityEnd =
      index === candidates.length - 1
        ? 1
        : cumulativeTickets / totalTickets;

    return {
      ...candidate,
      tickets: ticketCount,
      probability: totalTickets === 0 ? 0 : ticketCount / totalTickets,
      cumulativeProbabilityStart,
      cumulativeProbabilityEnd
    };
  });
}

export function selectWheelCandidate(
  candidates: readonly WheelCandidate[],
  randomSource: RandomSource
): WheelCandidate {
  if (candidates.length < WHEEL_MIN_CANDIDATES) {
    throw new RangeError("A wheel draw requires at least 2 candidates");
  }

  const randomValue = randomSource();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError(
      "RandomSource must return a value between 0 (inclusive) and 1 (exclusive)"
    );
  }

  const selected = candidates.find(
    (candidate) => randomValue < candidate.cumulativeProbabilityEnd
  );
  if (!selected) {
    throw new RangeError("Wheel candidate sectors must end at probability 1");
  }
  return selected;
}

export function excludeWheelCandidate(
  candidates: readonly WheelCandidate[],
  restaurantId: string,
  mode: WheelMode
): WheelCandidate[] {
  return buildWheelCandidates(
    candidates.filter((candidate) => candidate.restaurantId !== restaurantId),
    mode
  );
}

export function createCryptoRandomSource(
  source: CryptoRandomValuesSource = globalThis.crypto
): RandomSource {
  return () => {
    const values = new Uint32Array(1);
    source.getRandomValues(values);
    return values[0]! / 0x1_0000_0000;
  };
}
