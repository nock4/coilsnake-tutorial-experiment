import { describe, expect, it } from "vitest";
import type { WindowCollection } from "@eb/schemas";
import {
  EB_UI_SCALE,
  canvasRectForWindowId,
  contentFitWindowRect,
  findWindowLayout,
  windowLayoutToCanvasRect
} from "../src/windowLayout";

describe("EB window layouts", () => {
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
