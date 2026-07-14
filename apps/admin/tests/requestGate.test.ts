import { describe, expect, it } from "vitest";
import { createRequestGate } from "../src/app/requestGate";

describe("request gate", () => {
  it("invalidates every earlier request when a new generation begins", () => {
    const gate = createRequestGate();
    const groupA = gate.begin();
    const groupB = gate.begin();
    expect(gate.isCurrent(groupA)).toBe(false);
    expect(gate.isCurrent(groupB)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(groupB)).toBe(false);
  });
});
