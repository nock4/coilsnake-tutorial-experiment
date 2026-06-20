import type { CustomDialogue, NpcInteraction } from "@eb/schemas";

export const GENERATED_DRIFELLA_BARK_SOURCE = "generated:drifella-barks";

export type RuntimeCustomDialogueEntry = NpcInteraction & {
  generated?: {
    source: typeof GENERATED_DRIFELLA_BARK_SOURCE;
  };
};

export type RuntimeCustomDialogue = Omit<CustomDialogue, "byNpcId"> & {
  byNpcId: Record<string, RuntimeCustomDialogueEntry>;
};

export type CustomDialogueLookup = Pick<RuntimeCustomDialogue, "byNpcId" | "byTextPointer">;

export function isGeneratedDrifellaBarkEntry(
  entry: RuntimeCustomDialogueEntry | undefined
): entry is RuntimeCustomDialogueEntry & { generated: { source: typeof GENERATED_DRIFELLA_BARK_SOURCE } } {
  return entry?.generated?.source === GENERATED_DRIFELLA_BARK_SOURCE;
}
