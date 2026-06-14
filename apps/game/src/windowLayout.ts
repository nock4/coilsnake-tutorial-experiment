import type { WindowCollection, WindowLayout } from "@eb/schemas";

export const EB_UI_SCALE = 2;
export const EB_WINDOW_TILE_PX = 8;
export const EB_BITMAP_TEXT_SCALE = 1;

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContentFitWindowOptions = {
  x: number;
  y: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  lineCount?: number;
  extraHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};

export function windowLayoutToCanvasRect(
  layout: Pick<WindowLayout, "width" | "height" | "xOffset" | "yOffset">,
  scale = EB_UI_SCALE
): CanvasRect {
  const unit = EB_WINDOW_TILE_PX * scale;
  return {
    x: layout.xOffset * unit,
    y: layout.yOffset * unit,
    width: layout.width * unit,
    height: layout.height * unit
  };
}

export function findWindowLayout(
  window: WindowCollection | undefined,
  id: number
): WindowLayout | undefined {
  return window?.layouts?.find((layout) => layout.id === id);
}

export function canvasRectForWindowId(
  window: WindowCollection | undefined,
  id: number,
  fallback: CanvasRect
): CanvasRect {
  const layout = findWindowLayout(window, id);
  return layout ? windowLayoutToCanvasRect(layout) : fallback;
}

export function contentFitWindowRect(options: ContentFitWindowOptions): CanvasRect {
  const labelWidth = Math.max(0, ...options.labels.map((label) => Math.ceil(options.measureText(label))));
  const lineCount = Math.max(0, Math.ceil(options.lineCount ?? options.labels.length));
  const width = clampDimension(
    labelWidth + options.paddingX * 2,
    options.minWidth,
    options.maxWidth
  );
  const height = clampDimension(
    lineCount * options.lineHeight + options.paddingY * 2 + (options.extraHeight ?? 0),
    options.minHeight,
    options.maxHeight
  );
  return {
    x: Math.round(options.x),
    y: Math.round(options.y),
    width,
    height
  };
}

function clampDimension(value: number, minValue = 0, maxValue = Number.POSITIVE_INFINITY): number {
  const min = Math.max(0, Math.ceil(minValue));
  const max = Math.max(min, Math.floor(maxValue));
  return Math.max(min, Math.min(max, Math.ceil(value)));
}
