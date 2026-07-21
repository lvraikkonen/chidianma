import { describe, expect, it, vi } from "vitest";
import {
  WHEEL_MAX_CANDIDATES,
  buildWheelCandidates,
  createCryptoRandomSource,
  excludeWheelCandidate,
  selectWheelCandidate,
  type WheelCandidateInput
} from "../src/wheel";

function candidate(
  index: number,
  recommendationScore = index,
  selectedWithinLast7Days = false
): WheelCandidateInput {
  return {
    restaurantId: `restaurant-${index}`,
    name: `餐厅 ${index}`,
    recommendationScore,
    selectedWithinLast7Days
  };
}

describe("buildWheelCandidates", () => {
  it("keeps zero candidates empty and refuses to draw", () => {
    const candidates = buildWheelCandidates([], "weighted");
    const randomSource = vi.fn(() => 0);

    expect(candidates).toEqual([]);
    expect(() => selectWheelCandidate(candidates, randomSource)).toThrow(
      /at least 2 candidates/
    );
    expect(randomSource).not.toHaveBeenCalled();
  });

  it("describes one candidate without pretending a draw is possible", () => {
    const candidates = buildWheelCandidates([candidate(1, 42)], "weighted");
    const randomSource = vi.fn(() => 0);

    expect(candidates).toEqual([
      expect.objectContaining({
        restaurantId: "restaurant-1",
        tickets: 1,
        probability: 1,
        cumulativeProbabilityStart: 0,
        cumulativeProbabilityEnd: 1
      })
    ]);
    expect(() => selectWheelCandidate(candidates, randomSource)).toThrow(
      /at least 2 candidates/
    );
    expect(randomSource).not.toHaveBeenCalled();
  });

  it("gives two equal-mode candidates the same tickets and sectors", () => {
    const candidates = buildWheelCandidates(
      [candidate(1, -100), candidate(2, 1_000, true)],
      "equal"
    );

    expect(
      candidates.map(({ tickets, probability }) => ({
        tickets,
        probability
      }))
    ).toEqual([
      { tickets: 1, probability: 0.5 },
      { tickets: 1, probability: 0.5 }
    ]);
    expect(
      candidates.map((item) => [
        item.cumulativeProbabilityStart,
        item.cumulativeProbabilityEnd
      ])
    ).toEqual([
      [0, 0.5],
      [0.5, 1]
    ]);
  });

  it("supports eight candidates", () => {
    const candidates = buildWheelCandidates(
      Array.from({ length: WHEEL_MAX_CANDIDATES }, (_, index) => (
        candidate(index + 1)
      )),
      "equal"
    );

    expect(candidates).toHaveLength(8);
    expect(candidates.every((item) => item.tickets === 1)).toBe(true);
    expect(candidates[0]?.probability).toBe(1 / 8);
    expect(candidates[7]?.cumulativeProbabilityEnd).toBe(1);
  });

  it("rejects more than eight candidates so truncation stays server-owned", () => {
    expect(() =>
      buildWheelCandidates(
        Array.from({ length: 10 }, (_, index) => candidate(index + 1)),
        "equal"
      )
    ).toThrow(/at most 8 candidates/);
  });

  it("maps weighted minimum, midpoint, and maximum scores to 1, 2, and 3 tickets", () => {
    const candidates = buildWheelCandidates([
      candidate(1, 0),
      candidate(2, 50),
      candidate(3, 100)
    ], "weighted");

    expect(candidates.map((item) => item.tickets)).toEqual([1, 2, 3]);
    expect(candidates.map((item) => item.probability)).toEqual([
      1 / 6,
      2 / 6,
      3 / 6
    ]);
    expect(
      candidates.map((item) => [
        item.cumulativeProbabilityStart,
        item.cumulativeProbabilityEnd
      ])
    ).toEqual([
      [0, 1 / 6],
      [1 / 6, 3 / 6],
      [3 / 6, 1]
    ]);
  });

  it("keeps equal scores equal even when recent-history signals differ", () => {
    const candidates = buildWheelCandidates([
      candidate(1, 42),
      candidate(2, 42, true),
      candidate(3, 42)
    ], "weighted");

    expect(candidates.map((item) => item.tickets)).toEqual([1, 1, 1]);
    expect(candidates.map((item) => item.probability)).toEqual([
      1 / 3,
      1 / 3,
      1 / 3
    ]);
  });

  it("lowers a recently selected restaurant by one ticket without going below one", () => {
    const candidates = buildWheelCandidates([
      candidate(1, 0, true),
      candidate(2, 50, true),
      candidate(3, 100, true)
    ], "weighted");

    expect(candidates.map((item) => item.tickets)).toEqual([1, 1, 2]);
    expect(
      Math.max(...candidates.map((item) => item.tickets))
    ).toBeLessThanOrEqual(
      3 * Math.min(...candidates.map((item) => item.tickets))
    );
  });

  it("uses documented quarter thresholds and supports negative scores", () => {
    const thresholdCandidates = buildWheelCandidates([
      candidate(1, -100),
      candidate(2, -50.002),
      candidate(3, -50),
      candidate(4, 49.998),
      candidate(5, 50),
      candidate(6, 100)
    ], "weighted");

    expect(thresholdCandidates.map((item) => item.tickets)).toEqual([
      1,
      1,
      2,
      2,
      3,
      3
    ]);
  });

  it("does not mutate the ranked input or its objects", () => {
    const rankedCandidates = [candidate(2, 2), candidate(1, 1)];
    const snapshot = structuredClone(rankedCandidates);

    buildWheelCandidates(rankedCandidates, "weighted");

    expect(rankedCandidates).toEqual(snapshot);
  });

  it("rejects missing or duplicate ids and non-finite recommendation scores", () => {
    expect(() =>
      buildWheelCandidates(
        [{ ...candidate(1), restaurantId: "" }, candidate(2)],
        "weighted"
      )
    ).toThrow(/must have a restaurantId/);
    expect(() =>
      buildWheelCandidates(
        [
          candidate(1, 1),
          { ...candidate(2, 2), restaurantId: "restaurant-1" }
        ],
        "weighted"
      )
    ).toThrow(/unique restaurantId/);
    expect(() =>
      buildWheelCandidates(
        [candidate(1, Number.NaN), candidate(2, 2)],
        "weighted"
      )
    ).toThrow(/finite recommendationScore/);
  });
});

describe("selectWheelCandidate", () => {
  const candidates = buildWheelCandidates([
    candidate(1, 0),
    candidate(2, 50),
    candidate(3, 100)
  ], "weighted");

  it.each([
    [0, "restaurant-1"],
    [1 / 6 - Number.EPSILON, "restaurant-1"],
    [1 / 6, "restaurant-2"],
    [0.5, "restaurant-3"],
    [0.999_999, "restaurant-3"]
  ] as const)("maps fixed random value %s to %s", (randomValue, expectedId) => {
    const randomSource = vi.fn(() => randomValue);

    expect(selectWheelCandidate(candidates, randomSource).restaurantId).toBe(
      expectedId
    );
    expect(randomSource).toHaveBeenCalledOnce();
  });

  it.each([-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects out-of-contract random value %s",
    (randomValue) => {
      expect(() => selectWheelCandidate(candidates, () => randomValue)).toThrow(
        /between 0 \(inclusive\) and 1 \(exclusive\)/
      );
    }
  );
});

describe("excludeWheelCandidate", () => {
  it("removes only the session candidate and recalculates tickets and probability", () => {
    const original = buildWheelCandidates([
      candidate(1, 0),
      candidate(2, 50),
      candidate(3, 100)
    ], "weighted");

    const remaining = excludeWheelCandidate(original, "restaurant-1", "weighted");

    expect(original.map((item) => item.restaurantId)).toEqual([
      "restaurant-1",
      "restaurant-2",
      "restaurant-3"
    ]);
    expect(
      remaining.map((item) => ({
        restaurantId: item.restaurantId,
        tickets: item.tickets,
        probability: item.probability
      }))
    ).toEqual([
      { restaurantId: "restaurant-2", tickets: 1, probability: 0.25 },
      { restaurantId: "restaurant-3", tickets: 3, probability: 0.75 }
    ]);
    expect(remaining[1]?.cumulativeProbabilityEnd).toBe(1);
  });

  it("can reduce the session below the drawable minimum without consuming randomness", () => {
    const original = buildWheelCandidates([
      candidate(1, 0),
      candidate(2, 100)
    ], "weighted");
    const remaining = excludeWheelCandidate(original, "restaurant-1", "weighted");
    const randomSource = vi.fn(() => 0);

    expect(remaining).toEqual([
      expect.objectContaining({
        restaurantId: "restaurant-2",
        tickets: 1,
        probability: 1
      })
    ]);
    expect(() => selectWheelCandidate(remaining, randomSource)).toThrow(
      /at least 2 candidates/
    );
    expect(randomSource).not.toHaveBeenCalled();
  });

  it("keeps the pool equivalent when the excluded id is absent", () => {
    const original = buildWheelCandidates([
      candidate(1, 0),
      candidate(2, 100)
    ], "weighted");

    expect(
      excludeWheelCandidate(original, "restaurant-unknown", "weighted")
    ).toEqual(original);
  });
});

describe("createCryptoRandomSource", () => {
  it.each([0, 0xffff_ffff])(
    "normalizes Uint32 value %s into the RandomSource range",
    (uint32Value) => {
      const getRandomValues = vi.fn((values: Uint32Array) => {
        values[0] = uint32Value;
        return values;
      });
      const randomSource = createCryptoRandomSource({ getRandomValues });

      expect(randomSource()).toBe(uint32Value / 0x1_0000_0000);
      expect(getRandomValues).toHaveBeenCalledOnce();
    }
  );
});
