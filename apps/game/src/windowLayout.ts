import type { WindowCollection, WindowLayout } from "@eb/schemas";

export const EB_UI_SCALE = 2;
export const EB_WINDOW_TILE_PX = 8;
export const EB_BITMAP_TEXT_SCALE = 2;
export const EB_NATIVE_GLYPH_HEIGHT_PX = EB_WINDOW_TILE_PX;
export const EB_TEXT_LINE_SPACING = 8;

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenSize = {
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

export type TextLineHeightOptions = {
  glyphHeight?: number;
  textScale?: number;
  lineSpacing?: number;
};

export type DialogueWindowRectOptions = {
  screen: ScreenSize;
  sideMargin: number;
  bottomMargin: number;
  paddingX: number;
  paddingY: number;
  visibleLines: number;
  lineHeight: number;
};

export type MenuWindowRectOptions = {
  screen: ScreenSize;
  x: number;
  y: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  leftMargin?: number;
  rightMargin: number;
  bottomMargin: number;
  minWidth: number;
  maxVisibleItems: number;
  titleLines?: number;
  titleGap?: number;
};

export type BattleWindowRectOptions = {
  screen: ScreenSize;
  x: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  bottomMargin: number;
  leftMargin: number;
  rightMargin: number;
  minWidth: number;
  maxWidth?: number;
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

export function ebTextLineHeight(options: TextLineHeightOptions = {}): number {
  const glyphHeight = Math.max(1, Math.ceil(options.glyphHeight ?? EB_NATIVE_GLYPH_HEIGHT_PX));
  const textScale = Math.max(1, Math.round(options.textScale ?? EB_BITMAP_TEXT_SCALE));
  const lineSpacing = Math.max(0, Math.ceil(options.lineSpacing ?? EB_TEXT_LINE_SPACING));
  return glyphHeight * textScale + lineSpacing;
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

export function dialogueWindowRect(options: DialogueWindowRectOptions): CanvasRect {
  const sideMargin = Math.max(0, Math.ceil(options.sideMargin));
  const bottomMargin = Math.max(0, Math.ceil(options.bottomMargin));
  const width = Math.min(
    Math.max(1, Math.floor(options.screen.width)),
    Math.max(1, Math.floor(options.screen.width - sideMargin * 2))
  );
  const maxHeight = Math.max(
    1,
    Math.min(
      Math.max(1, Math.floor(options.screen.height - bottomMargin)),
      Math.floor(options.screen.height / 3)
    )
  );
  const height = clampDimension(
    options.visibleLines * options.lineHeight + options.paddingY * 2,
    1,
    maxHeight
  );
  return {
    x: Math.min(sideMargin, Math.max(0, Math.floor(options.screen.width - width))),
    y: Math.max(0, Math.round(options.screen.height - height - bottomMargin)),
    width,
    height
  };
}

export function dialogueTextWidth(rect: Pick<CanvasRect, "width">, paddingX: number): number {
  return Math.max(1, Math.floor(rect.width - Math.max(0, paddingX) * 2));
}

export function menuWindowRect(options: MenuWindowRectOptions): CanvasRect {
  const leftMargin = Math.max(0, Math.ceil(options.leftMargin ?? 0));
  const rightMargin = Math.max(0, Math.ceil(options.rightMargin));
  const titleLines = Math.max(0, Math.ceil(options.titleLines ?? 0));
  const titleGap = titleLines > 0 ? Math.max(0, Math.ceil(options.titleGap ?? 0)) : 0;
  const maxHeight = Math.max(
    options.lineHeight + options.paddingY * 2,
    Math.floor(options.screen.height - options.y - options.bottomMargin)
  );
  const maxItemLines = Math.max(
    1,
    Math.floor((maxHeight - options.paddingY * 2 - titleLines * options.lineHeight - titleGap) / options.lineHeight)
  );
  const visibleItemCount = Math.min(
    Math.max(0, options.labels.length - titleLines),
    Math.max(1, options.maxVisibleItems),
    maxItemLines
  );
  const lineCount = visibleItemCount + titleLines;
  const maxScreenWidth = Math.max(1, Math.floor(options.screen.width - leftMargin - rightMargin));
  const maxWidth = Math.max(1, maxScreenWidth);
  const minWidth = Math.min(Math.max(1, Math.ceil(options.minWidth)), maxWidth);
  const rect = contentFitWindowRect({
    x: options.x,
    y: options.y,
    labels: options.labels,
    measureText: options.measureText,
    lineHeight: options.lineHeight,
    lineCount,
    extraHeight: titleGap,
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    minWidth,
    maxWidth,
    maxHeight
  });
  return clampRectToScreen(rect, options.screen, {
    left: leftMargin,
    right: rightMargin,
    top: options.y,
    bottom: options.bottomMargin
  });
}

export function battleWindowRect(options: BattleWindowRectOptions): CanvasRect {
  const screenMaxWidth = Math.max(1, Math.floor(options.screen.width - options.leftMargin - options.rightMargin));
  const maxWidth = Math.min(screenMaxWidth, Math.max(1, Math.floor(options.maxWidth ?? screenMaxWidth)));
  const minWidth = Math.min(Math.max(1, Math.ceil(options.minWidth)), maxWidth);
  const maxHeight = Math.max(
    options.lineHeight + options.paddingY * 2,
    Math.floor(options.maxHeight ?? (options.screen.height - options.bottomMargin))
  );
  const rect = contentFitWindowRect({
    x: options.x,
    y: 0,
    labels: options.labels,
    measureText: options.measureText,
    lineHeight: options.lineHeight,
    lineCount: Math.max(1, options.labels.length),
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    minWidth,
    maxWidth,
    maxHeight
  });
  const y = Math.max(0, Math.round(options.screen.height - rect.height - options.bottomMargin));
  return clampRectToScreen({ ...rect, y }, options.screen, {
    left: options.leftMargin,
    right: options.rightMargin,
    top: 0,
    bottom: options.bottomMargin
  });
}

function clampDimension(value: number, minValue = 0, maxValue = Number.POSITIVE_INFINITY): number {
  const min = Math.max(0, Math.ceil(minValue));
  const max = Math.max(min, Math.floor(maxValue));
  return Math.max(min, Math.min(max, Math.ceil(value)));
}

function clampRectToScreen(
  rect: CanvasRect,
  screen: ScreenSize,
  margins: { left: number; right: number; top: number; bottom: number }
): CanvasRect {
  const width = Math.min(rect.width, Math.max(1, Math.floor(screen.width - margins.left - margins.right)));
  const height = Math.min(rect.height, Math.max(1, Math.floor(screen.height - margins.top - margins.bottom)));
  const maxX = Math.max(margins.left, Math.floor(screen.width - margins.right - width));
  const maxY = Math.max(margins.top, Math.floor(screen.height - margins.bottom - height));
  return {
    x: clampNumber(Math.round(rect.x), margins.left, maxX),
    y: clampNumber(Math.round(rect.y), margins.top, maxY),
    width,
    height
  };
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}
