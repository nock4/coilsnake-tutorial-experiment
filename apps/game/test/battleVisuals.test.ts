import { describe, expect, it } from "vitest";
import {
  ENEMY_DEFEAT_FADE_MS,
  MENU_CURSOR_BLINK_PERIOD_MS,
  enemyDefeatVisualState,
  menuCursorVisible,
  menuRowTexts,
  selectionArrowTriangle
} from "../src/battleVisuals";

describe("battleVisuals", () => {
  describe("menuCursorVisible", () => {
    it("toggles visibility at the EB-style cursor blink cadence", () => {
      expect(menuCursorVisible(0)).toBe(true);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS / 2 - 1)).toBe(true);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS / 2)).toBe(false);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS - 1)).toBe(false);
      expect(menuCursorVisible(MENU_CURSOR_BLINK_PERIOD_MS)).toBe(true);
    });
  });

  describe("menuRowTexts", () => {
    it("keeps selection state out of row text", () => {
      const rows = menuRowTexts([
        { label: "BASH", selected: true },
        { label: "PSI", selected: false },
        { label: "OK", selected: true }
      ]);

      expect(rows).toEqual(["BASH", "PSI", "OK"]);
      expect(rows.join("\n")).not.toContain(">");
    });
  });

  describe("selectionArrowTriangle", () => {
    it("builds a right-pointing triangle in the cursor gutter", () => {
      expect(selectionArrowTriangle(17, 20, 18)).toEqual({
        x1: 17,
        y1: 24,
        x2: 17,
        y2: 34,
        x3: 26,
        y3: 29
      });
    });
  });

  describe("enemyDefeatVisualState", () => {
    it("moves from alive to dying to hidden without changing combat state", () => {
      expect(enemyDefeatVisualState(1_000, true, null)).toMatchObject({
        phase: "alive",
        visible: true,
        alpha: 1
      });

      const dying = enemyDefeatVisualState(1_000 + ENEMY_DEFEAT_FADE_MS / 2, false, 1_000);
      expect(dying.phase).toBe("dying");
      expect(dying.visible).toBe(true);
      expect(dying.alpha).toBeCloseTo(0.5);

      expect(enemyDefeatVisualState(1_000 + ENEMY_DEFEAT_FADE_MS, false, 1_000)).toMatchObject({
        phase: "hidden",
        visible: false,
        alpha: 0
      });
    });
  });
});
