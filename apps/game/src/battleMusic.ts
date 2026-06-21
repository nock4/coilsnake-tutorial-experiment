import type { BattleOutcome } from "./battleLogic";

export type BattleMusicCue = "battle" | "victory";

export function battleMusicCueForOutcome(outcome: BattleOutcome): BattleMusicCue {
  return outcome === "win" ? "victory" : "battle";
}
