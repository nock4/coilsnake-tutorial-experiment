import type { GameData } from "./loader";
import type { PartyStateSnapshot } from "./partyState";
import type { Facing } from "./playerController";
import type { SaveFlagsSnapshot, SaveSlotPersistence } from "./saveState";

export type BattleReturnSource = "encounter" | "event";
export type BattleReturnOutcome = "win" | "lose" | "flee";

export type BattleReturnEncounterState = {
  enabled: boolean;
  cooldownMs: number;
  rngSeed: number;
  lastEncounterGroup?: number;
};

export type ChunkedWorldRestore = {
  player: {
    x: number;
    y: number;
    facing: Facing;
  };
  flags: SaveFlagsSnapshot;
  party: PartyStateSnapshot;
  encounter: BattleReturnEncounterState;
  source: BattleReturnSource;
  outcome?: BattleReturnOutcome;
};

export type BattleReturnContext = {
  sceneKey: "chunked-world";
  gameData: GameData;
  saveSlot: number;
  saveSlots?: SaveSlotPersistence;
  restore: ChunkedWorldRestore;
};
