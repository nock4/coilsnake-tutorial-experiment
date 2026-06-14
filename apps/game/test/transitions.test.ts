import { describe, expect, it } from "vitest";
import { swirlMask } from "../src/transitions";

describe("swirlMask", () => {
  it("starts fully covered and ends cleared", () => {
    const start = swirlMask(0);
    expect(start.fullyCovered).toBe(true);
    expect(start.clear).toBe(false);
    expect(start.coverage).toBe(1);
    expect(start.baseAlpha).toBe(1);
    expect(start.revealRadiusRatio).toBe(0);

    const end = swirlMask(1);
    expect(end.fullyCovered).toBe(false);
    expect(end.clear).toBe(true);
    expect(end.coverage).toBe(0);
    expect(end.baseAlpha).toBe(0);
    expect(end.revealRadiusRatio).toBeGreaterThan(1);
  });

  it("clamps progress and is deterministic", () => {
    expect(swirlMask(-0.5)).toEqual(swirlMask(0));
    expect(swirlMask(2)).toEqual(swirlMask(1));
    expect(swirlMask(Number.NaN)).toEqual(swirlMask(0));
    expect(swirlMask(0.42)).toEqual(swirlMask(0.42));
  });

  it("reveals monotonically while staying bounded", () => {
    let previous = swirlMask(0);
    for (let step = 1; step <= 20; step += 1) {
      const current = swirlMask(step / 20);
      expect(current.coverage).toBeLessThanOrEqual(previous.coverage);
      expect(current.revealRadiusRatio).toBeGreaterThanOrEqual(previous.revealRadiusRatio);
      expect(current.coverage).toBeGreaterThanOrEqual(0);
      expect(current.coverage).toBeLessThanOrEqual(1);
      expect(current.baseAlpha).toBeGreaterThanOrEqual(0);
      expect(current.baseAlpha).toBeLessThanOrEqual(1);
      expect(current.bandAlpha).toBeGreaterThanOrEqual(0);
      expect(current.bandAlpha).toBeLessThanOrEqual(1);
      previous = current;
    }
  });
});
