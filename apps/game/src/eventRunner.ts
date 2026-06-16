import { talkedFlag } from "./gameFlags";

export type DialogueEvent = { kind: "dialogue"; reference: string };
export type SetFlagEvent = { kind: "setFlag"; flag: string };

export type GameEvent = DialogueEvent | SetFlagEvent;

const CCSCRIPT_REFERENCE_PATTERN = /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/;

export type FlagReader = {
  has(flag: string): boolean;
  isSet?(flag: number): boolean;
};

function ccsReference(pointer: string | undefined): string | undefined {
  return pointer && CCSCRIPT_REFERENCE_PATTERN.test(pointer) ? pointer : undefined;
}

export function interactionEvents(
  npc: { npcId: number; eventFlag?: number; textPointer?: string; textPointer2?: string },
  fallbackReference: string,
  flags: FlagReader
): GameEvent[] {
  const flag = talkedFlag(npc.npcId);
  const hasEventFlag = npc.eventFlag !== undefined && npc.eventFlag > 0;
  const useTextPointer2 = hasEventFlag
    ? Boolean(flags.isSet?.(npc.eventFlag as number))
    : flags.has(flag);
  const reference = (useTextPointer2 ? ccsReference(npc.textPointer2) : undefined)
    ?? ccsReference(npc.textPointer)
    ?? fallbackReference;
  return [
    { kind: "dialogue", reference },
    { kind: "setFlag", flag }
  ];
}
