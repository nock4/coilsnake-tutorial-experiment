import { describe, expect, it } from "vitest";
import { spriteBottomY, spriteSortDepth } from "../src/renderDepth";

describe("render depth helpers", () => {
  it("uses a feet-origin sprite y as its bottom depth", () => {
    expect(spriteBottomY({ y: 144, originY: 1, displayHeight: 24 })).toBe(144);
    expect(spriteSortDepth(144)).toBe(144);
  });

  it("converts center and top anchors to rendered bottom y", () => {
    expect(spriteBottomY({ y: 144, originY: 0.5, displayHeight: 24 })).toBe(156);
    expect(spriteBottomY({ y: 144, originY: 0, displayHeight: 24 })).toBe(168);
  });

  it("keeps depth finite for malformed actor measurements", () => {
    expect(spriteBottomY({ y: Number.NaN, originY: Number.NaN, displayHeight: Number.NaN })).toBe(0);
    expect(spriteSortDepth(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
