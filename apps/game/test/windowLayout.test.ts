import { describe, expect, it } from "vitest";
import type { WindowCollection } from "@eb/schemas";
import {
  EB_BITMAP_TEXT_SCALE,
  EB_TEXT_LINE_SPACING,
  EB_UI_SCALE,
  battleWindowRect,
  canvasRectForWindowId,
  contentFitWindowRect,
  dialogueTextWidth,
  dialogueWindowRect,
  ebTextLineHeight,
  findWindowLayout,
  menuWindowRect,
  windowLayoutToCanvasRect
} from "../src/windowLayout";

describe("EB window layouts", () => {
  it("keeps bitmap text at the same 2x scale as EB UI windows", () => {
    expect(EB_BITMAP_TEXT_SCALE).toBe(EB_UI_SCALE);
    expect(EB_TEXT_LINE_SPACING).toBe(8);
    expect(ebTextLineHeight()).toBe(24);
    expect(ebTextLineHeight({ lineSpacing: 0 })).toBe(16);
  });

  it("converts tile-unit EB config entries to 2x canvas rectangles", () => {
    expect(windowLayoutToCanvasRect({
      width: 5,
      height: 3,
      xOffset: 2,
      yOffset: 4
    }, EB_UI_SCALE)).toEqual({
      x: 32,
      y: 64,
      width: 80,
      height: 48
    });
  });

  it("selects generated layout ids and falls back when absent", () => {
    const window: WindowCollection = {
      defaultFlavorId: 0,
      transparentKey: { r: 0, g: 224, b: 112 },
      flavors: [{
        id: 0,
        file: "assets/window/0.png",
        corner: { x: 32, y: 0, w: 8, h: 8 },
        hEdge: { x: 40, y: 0, w: 8, h: 8 },
        vEdge: { x: 48, y: 0, w: 8, h: 8 },
        moreArrow: { x: 32, y: 8, w: 8, h: 8 },
        interiorColor: { r: 16, g: 16, b: 16 }
      }],
      layouts: [
        { id: 0, width: 7, height: 5, xOffset: 3, yOffset: 2 }
      ]
    };
    const fallback = { x: 24, y: 24, width: 100, height: 80 };

    expect(findWindowLayout(window, 0)?.width).toBe(7);
    expect(canvasRectForWindowId(window, 0, fallback)).toEqual({
      x: 48,
      y: 32,
      width: 112,
      height: 80
    });
    expect(canvasRectForWindowId(window, 99, fallback)).toEqual(fallback);
  });

  it("fits the dialogue window wide, shallow, and bottom-anchored on the 512x448 canvas", () => {
    const rect = dialogueWindowRect({
      screen: { width: 512, height: 448 },
      sideMargin: 16,
      bottomMargin: 16,
      paddingX: 24,
      paddingY: 18,
      visibleLines: 4,
      lineHeight: ebTextLineHeight()
    });

    expect(rect).toEqual({
      x: 16,
      y: 300,
      width: 480,
      height: 132
    });
    expect(rect.x + rect.width).toBeLessThanOrEqual(512);
    expect(rect.y + rect.height).toBeLessThanOrEqual(448);
    expect(rect.height).toBeLessThanOrEqual(Math.floor(448 / 3));
    expect(dialogueTextWidth(rect, 24)).toBe(432);
  });

  it("sizes overworld menus to scaled text and clamps cascading windows inside the screen", () => {
    const measureText = (text: string) => text.length * 8;
    const mainRect = menuWindowRect({
      screen: { width: 512, height: 448 },
      x: 16,
      y: 16,
      labels: ["Talk", "Goods", "Equip", "Status", "PSI", "Check"],
      measureText,
      lineHeight: ebTextLineHeight(),
      paddingX: 30,
      paddingY: 14,
      leftMargin: 16,
      rightMargin: 16,
      bottomMargin: 16,
      minWidth: 64,
      maxVisibleItems: 8
    });
    const submenuRect = menuWindowRect({
      screen: { width: 512, height: 448 },
      x: 430,
      y: 16,
      labels: ["Command", "A very long submenu item"],
      measureText,
      lineHeight: ebTextLineHeight(),
      paddingX: 30,
      paddingY: 14,
      leftMargin: 16,
      rightMargin: 16,
      bottomMargin: 16,
      minWidth: 64,
      maxVisibleItems: 8,
      titleLines: 1,
      titleGap: 8
    });

    expect(mainRect).toEqual({
      x: 16,
      y: 16,
      width: 108,
      height: 172
    });
    expect(mainRect.x + mainRect.width).toBeLessThanOrEqual(512);
    expect(mainRect.y + mainRect.height).toBeLessThanOrEqual(448);
    expect(submenuRect.x + submenuRect.width).toBeLessThanOrEqual(512 - 16);
    expect(submenuRect.y + submenuRect.height).toBeLessThanOrEqual(448);
    expect(submenuRect.x).toBeGreaterThanOrEqual(16);
  });

  it("fits battle command and status windows snugly at the bottom without overflow", () => {
    const screen = { width: 512, height: 448 };
    const measureText = (text: string) => text.length * 8;
    const lineHeight = ebTextLineHeight();
    const commandRect = battleWindowRect({
      screen,
      x: 16,
      labels: ["BASH", "PSI", "GOODS", "AUTO"],
      measureText,
      lineHeight,
      paddingX: 30,
      paddingY: 14,
      bottomMargin: 8,
      leftMargin: 16,
      rightMargin: 16,
      minWidth: 80,
      maxWidth: 180,
      maxHeight: 144
    });
    const statusRect = battleWindowRect({
      screen,
      x: commandRect.x + commandRect.width + 8,
      labels: ["Ness  HP 090 PP 20", "Paula HP 045 PP 18"],
      measureText,
      lineHeight,
      paddingX: 34,
      paddingY: 14,
      bottomMargin: 8,
      leftMargin: 16,
      rightMargin: 16,
      minWidth: 160,
      maxWidth: screen.width - (commandRect.x + commandRect.width + 8) - 16,
      maxHeight: 144
    });

    expect(commandRect).toEqual({
      x: 16,
      y: 316,
      width: 100,
      height: 124
    });
    expect(statusRect).toEqual({
      x: 124,
      y: 364,
      width: 212,
      height: 76
    });
    expect(commandRect.x + commandRect.width).toBeLessThanOrEqual(512);
    expect(commandRect.y + commandRect.height).toBeLessThanOrEqual(448);
    expect(statusRect.x + statusRect.width).toBeLessThanOrEqual(512);
    expect(statusRect.y + statusRect.height).toBeLessThanOrEqual(448);
  });

  it("sizes a window snugly from labels and font metrics", () => {
    const rect = contentFitWindowRect({
      x: 16,
      y: 20,
      labels: ["Talk", "Goods", "> Status"],
      measureText: (text) => text.length * 6,
      lineHeight: 18,
      paddingX: 14,
      paddingY: 10
    });

    expect(rect).toEqual({
      x: 16,
      y: 20,
      width: 76,
      height: 74
    });
  });

  it("clamps content-fit windows to min and max bounds", () => {
    const rect = contentFitWindowRect({
      x: 0,
      y: 0,
      labels: ["A long synthetic menu item"],
      measureText: (text) => text.length * 8,
      lineHeight: 16,
      paddingX: 12,
      paddingY: 8,
      lineCount: 8,
      minWidth: 60,
      maxWidth: 120,
      maxHeight: 96
    });

    expect(rect).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 96
    });
  });
});
