export type SpriteDepthAnchor = {
  y: number;
  originY: number;
  displayHeight: number;
};

export function spriteBottomY(anchor: SpriteDepthAnchor): number {
  const y = finiteOr(anchor.y, 0);
  const originY = finiteOr(anchor.originY, 1);
  const displayHeight = Math.abs(finiteOr(anchor.displayHeight, 0));
  return y + (1 - originY) * displayHeight;
}

export function spriteSortDepth(worldBottomY: number): number {
  return finiteOr(worldBottomY, 0);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
