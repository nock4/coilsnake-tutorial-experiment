import { describe, expect, it } from "vitest";
import {
  MAX_BATTLE_BACKGROUND_WARP_PX,
  hasAnimatedBattleBackground,
  rowOffset,
  scrollOffset
} from "../src/battleBackground";

describe("battleBackground", () => {
  describe("hasAnimatedBattleBackground", () => {
    it("keeps backgrounds static when animation params are absent", () => {
      expect(hasAnimatedBattleBackground(undefined)).toBe(false);
      expect(hasAnimatedBattleBackground({ id: 1 })).toBe(false);
      expect(hasAnimatedBattleBackground({ id: 1, scroll: { x: 0, y: 0 } })).toBe(false);
    });

    it("enables animation for scroll or time-varying distortion params", () => {
      expect(hasAnimatedBattleBackground({ id: 1, scroll: { x: 1, y: 0 } })).toBe(true);
      expect(hasAnimatedBattleBackground({
        id: 1,
        distortion: { kind: "horizontal, synthetic", amplitude: 2, frequency: 0.25, speed: 1 }
      })).toBe(true);
    });
  });

  describe("scrollOffset", () => {
    it("is deterministic for an injected time", () => {
      const scroll = { x: 12, y: -3 };

      expect(scrollOffset(5_000, scroll)).toEqual(scrollOffset(5_000, scroll));
      expect(scrollOffset(5_000, scroll)).toEqual({ x: 60, y: -15 });
    });

    it("falls back to zero when scroll params are missing", () => {
      expect(scrollOffset(5_000, undefined)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("rowOffset", () => {
    it("is deterministic for an injected time", () => {
      const distortion = { kind: "horizontal, synthetic", amplitude: 3, frequency: 0.25, speed: 2 };

      expect(rowOffset(24, 1_500, distortion)).toBe(rowOffset(24, 1_500, distortion));
    });

    it("stays bounded by the configured amplitude", () => {
      const distortion = { kind: "horizontal, synthetic", amplitude: 5, frequency: 0.2, speed: 3 };

      for (let now = 0; now <= 5_000; now += 125) {
        for (let y = 0; y < 128; y += 7) {
          expect(Math.abs(rowOffset(y, now, distortion))).toBeLessThanOrEqual(5);
        }
      }
    });

    it("clamps large amplitudes to the runtime maximum", () => {
      const distortion = { kind: "horizontal, synthetic", amplitude: 999, frequency: 0.2, speed: 3 };

      for (let now = 0; now <= 5_000; now += 125) {
        expect(Math.abs(rowOffset(42, now, distortion))).toBeLessThanOrEqual(MAX_BATTLE_BACKGROUND_WARP_PX);
      }
    });

    it("returns zero when distortion params are missing", () => {
      expect(rowOffset(24, 1_500, undefined)).toBe(0);
    });
  });
});
