export const MENU_CURSOR_BLINK_PERIOD_MS = 420;
export const MENU_CURSOR_GUTTER_PX = 14;
export const MENU_CURSOR_ARROW_WIDTH_PX = 9;
export const MENU_CURSOR_ARROW_HEIGHT_PX = 10;
export const ENEMY_DEFEAT_FADE_MS = 420;
export const ENEMY_DEFEAT_FLASH_INTERVAL_MS = 54;

export type MenuTextRow = {
  label: string;
  selected: boolean;
};

export type SelectionArrowTriangle = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
};

export type EnemyDefeatVisualState = {
  phase: "alive" | "dying" | "hidden";
  visible: boolean;
  alpha: number;
  flashActive: boolean;
  flashIntensity: number;
};

export function menuCursorVisible(now: number, periodMs = MENU_CURSOR_BLINK_PERIOD_MS): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(periodMs) || periodMs <= 0) {
    return true;
  }
  const halfPeriod = Math.max(1, periodMs / 2);
  return Math.floor(Math.max(0, now) / halfPeriod) % 2 === 0;
}

export function menuRowTexts(rows: readonly MenuTextRow[]): string[] {
  return rows.map((row) => row.label);
}

export function selectionArrowTriangle(
  x: number,
  rowTop: number,
  rowHeight: number,
  width = MENU_CURSOR_ARROW_WIDTH_PX,
  height = MENU_CURSOR_ARROW_HEIGHT_PX
): SelectionArrowTriangle {
  const centerY = Math.round(rowTop + rowHeight / 2);
  const halfHeight = Math.max(1, Math.round(height / 2));
  return {
    x1: Math.round(x),
    y1: centerY - halfHeight,
    x2: Math.round(x),
    y2: centerY + halfHeight,
    x3: Math.round(x + Math.max(1, width)),
    y3: centerY
  };
}

export function enemyDefeatVisualState(
  now: number,
  alive: boolean,
  defeatedAt: number | null,
  durationMs = ENEMY_DEFEAT_FADE_MS
): EnemyDefeatVisualState {
  if (alive) {
    return {
      phase: "alive",
      visible: true,
      alpha: 1,
      flashActive: false,
      flashIntensity: 0
    };
  }
  if (defeatedAt === null || !Number.isFinite(defeatedAt) || durationMs <= 0) {
    return hiddenDefeatState();
  }

  const elapsed = Math.max(0, finiteNow(now) - defeatedAt);
  if (elapsed >= durationMs) {
    return hiddenDefeatState();
  }

  const progress = elapsed / durationMs;
  const flashActive = Math.floor(elapsed / ENEMY_DEFEAT_FLASH_INTERVAL_MS) % 2 === 0;
  return {
    phase: "dying",
    visible: true,
    alpha: clamp01(1 - progress),
    flashActive,
    flashIntensity: flashActive ? clamp01(1 - progress * 0.45) : 0
  };
}

function hiddenDefeatState(): EnemyDefeatVisualState {
  return {
    phase: "hidden",
    visible: false,
    alpha: 0,
    flashActive: false,
    flashIntensity: 0
  };
}

function finiteNow(now: number): number {
  return Number.isFinite(now) ? now : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
