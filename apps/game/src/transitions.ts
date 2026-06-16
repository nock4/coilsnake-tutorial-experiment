export type SwirlMask = {
  progress: number;
  coverage: number;
  revealRadiusRatio: number;
  rotationRadians: number;
  spiralPitch: number;
  armCount: number;
  bandCount: number;
  baseAlpha: number;
  bandAlpha: number;
  clear: boolean;
  fullyCovered: boolean;
};

const TAU = Math.PI * 2;

export function swirlMask(progress: number): SwirlMask {
  const t = clamp01(progress);
  const eased = smoothstep(t);
  const coverage = 1 - eased;
  return {
    progress: t,
    coverage,
    revealRadiusRatio: eased * 1.18,
    rotationRadians: t * TAU * 1.65,
    spiralPitch: 2.85 + coverage * 1.35,
    armCount: 4,
    bandCount: 22,
    baseAlpha: coverage,
    bandAlpha: Math.min(1, 0.68 + coverage * 0.32),
    clear: t >= 1,
    fullyCovered: t <= 0
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
