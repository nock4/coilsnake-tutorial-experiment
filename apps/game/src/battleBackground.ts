import type Phaser from "phaser";
import type {
  BattleBackground,
  BattleBackgroundDistortion,
  BattleBackgroundScroll
} from "@eb/schemas";

export const MAX_BATTLE_BACKGROUND_WARP_PX = 8;

const WARP_SAMPLE_ROW = 96;

export type BattleBackgroundDebug = {
  animated: boolean;
  scrollX: number;
  scrollY: number;
  warpSample: number;
};

export type AnimatedBattleBackgroundHandle = {
  update(now: number): BattleBackgroundDebug;
  debug(): BattleBackgroundDebug;
  destroy(): void;
};

const STATIC_BACKGROUND_DEBUG: BattleBackgroundDebug = {
  animated: false,
  scrollX: 0,
  scrollY: 0,
  warpSample: 0
};

export function staticBattleBackgroundDebug(): BattleBackgroundDebug {
  return { ...STATIC_BACKGROUND_DEBUG };
}

export function scrollOffset(now: number, scroll: BattleBackgroundScroll | undefined): { x: number; y: number } {
  const seconds = finiteNumber(now) / 1000;
  return {
    x: finiteNumber(scroll?.x) * seconds,
    y: finiteNumber(scroll?.y) * seconds
  };
}

export function rowOffset(y: number, now: number, distortion: BattleBackgroundDistortion | undefined): number {
  if (!distortion) {
    return 0;
  }
  const amplitude = clamp(Math.abs(finiteNumber(distortion.amplitude)), 0, MAX_BATTLE_BACKGROUND_WARP_PX);
  const frequency = finiteNumber(distortion.frequency);
  const speed = finiteNumber(distortion.speed);
  if (amplitude === 0 || frequency === 0) {
    return 0;
  }
  return amplitude * Math.sin(frequency * finiteNumber(y) + speed * finiteNumber(now) / 1000);
}

export function hasAnimatedBattleBackground(background: BattleBackground | undefined): boolean {
  if (!background) {
    return false;
  }
  const scroll = background.scroll;
  const distortion = background.distortion;
  return Boolean(
    (scroll && (!isZero(scroll.x) || !isZero(scroll.y))) ||
    (distortion && distortion.amplitude > 0 && distortion.frequency > 0 && !isZero(distortion.speed))
  );
}

export function createAnimatedBattleBackground(
  scene: Phaser.Scene,
  sourceTextureKey: string,
  background: BattleBackground | undefined,
  displayWidth: number,
  displayHeight: number
): AnimatedBattleBackgroundHandle | undefined {
  if (!background || !hasAnimatedBattleBackground(background)) {
    return undefined;
  }
  const source = scene.textures.get(sourceTextureKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return undefined;
  }
  const width = Math.max(1, Math.floor(source.width));
  const height = Math.max(1, Math.floor(source.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return undefined;
  }
  context.imageSmoothingEnabled = false;

  const textureKey = `${sourceTextureKey}-animated`;
  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey);
  }
  const texture = scene.textures.addCanvas(textureKey, canvas);
  if (!texture) {
    return undefined;
  }
  const image = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(displayWidth, displayHeight);
  const handle = new CanvasAnimatedBattleBackground(textureKey, source, context, texture, image, background);
  handle.update(scene.time.now);
  return handle;
}

class CanvasAnimatedBattleBackground implements AnimatedBattleBackgroundHandle {
  private currentDebug = staticBattleBackgroundDebug();

  constructor(
    private readonly textureKey: string,
    private readonly source: HTMLImageElement | HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
    private readonly texture: Phaser.Textures.CanvasTexture,
    private readonly image: Phaser.GameObjects.Image,
    private readonly background: BattleBackground
  ) {}

  update(now: number): BattleBackgroundDebug {
    this.currentDebug = drawBattleBackgroundFrame(this.context, this.source, this.background, now);
    this.texture.refresh();
    return this.debug();
  }

  debug(): BattleBackgroundDebug {
    return { ...this.currentDebug };
  }

  destroy(): void {
    this.image.destroy();
    this.texture.manager.remove(this.textureKey);
  }
}

function drawBattleBackgroundFrame(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  background: BattleBackground,
  now: number
): BattleBackgroundDebug {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const scroll = scrollOffset(now, background.scroll);
  const scrollX = wrapNumber(scroll.x, width);
  const scrollY = wrapNumber(scroll.y, height);

  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y += 1) {
    const sourceY = wrapInteger(y + scrollY, height);
    const sourceX = wrapInteger(scrollX + rowOffset(y, now, background.distortion), width);
    drawWrappedRow(context, source, sourceX, sourceY, y, width);
  }

  return {
    animated: true,
    scrollX: roundDebug(scrollX),
    scrollY: roundDebug(scrollY),
    warpSample: roundDebug(rowOffset(Math.min(height - 1, WARP_SAMPLE_ROW), now, background.distortion))
  };
}

function drawWrappedRow(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  destY: number,
  width: number
): void {
  const firstWidth = width - sourceX;
  context.drawImage(source, sourceX, sourceY, firstWidth, 1, 0, destY, firstWidth, 1);
  if (sourceX > 0) {
    context.drawImage(source, 0, sourceY, sourceX, 1, firstWidth, destY, sourceX, 1);
  }
}

function finiteNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isZero(value: number): boolean {
  return Math.abs(value) < 0.0005;
}

function wrapNumber(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function wrapInteger(value: number, size: number): number {
  return Math.floor(wrapNumber(Math.round(value), size));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundDebug(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
