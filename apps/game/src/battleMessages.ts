import type { BattleRoundStepNarrationDetails } from "./battleRound";
import { battleStepEvents, type BattleActionStartedEvent, type BattleEvent } from "./battleEvents";

export function composeBattleStepLines(events: readonly BattleEvent[]): string[];
export function composeBattleStepLines(details: BattleRoundStepNarrationDetails): string[];
export function composeBattleStepLines(input: readonly BattleEvent[] | BattleRoundStepNarrationDetails): string[] {
  const events = isBattleEventList(input) ? input : battleStepEvents(input);
  const message = events.find((event): event is Extract<BattleEvent, { kind: "message" }> => event.kind === "message");
  if (message) {
    return [...message.lines];
  }

  const lines: string[] = [];
  let activeAction: BattleActionStartedEvent | null = null;
  for (const event of events) {
    switch (event.kind) {
      case "actionStarted":
        activeAction = event;
        lines.push(actionStartedLine(event));
        break;
      case "missed":
        lines.push(event.targetName ? `${event.targetName} dodged!` : "It missed!");
        break;
      case "smash":
        if (usesAttackImpactNarration(activeAction)) {
          lines.push("SMAAAASH!!");
        }
        break;
      case "damage":
        if (activeAction?.action !== "item") {
          lines.push(`${event.amount} HP of damage to ${event.targetName ?? "the target"}!`);
        }
        break;
      case "heal":
        lines.push(`${event.targetName} recovered ${event.amount} HP!`);
        break;
      case "ppRestored":
        lines.push(`${event.targetName} recovered ${event.amount} PP!`);
        break;
      case "defended":
        lines.push(`${event.actorName} took a defensive stance.`);
        break;
      case "gutsSurvived":
        if (usesAttackImpactNarration(activeAction)) {
          lines.push(`${event.targetName ?? "The target"} endured the blow!`);
        }
        break;
      case "runSucceeded":
        lines.push(`${event.actorName} ran away!`);
        break;
      case "runFailed":
        lines.push(`${event.actorName} couldn't escape!`);
        break;
      case "noTarget":
        lines.push(...(event.lines ?? ["There was no target."]));
        break;
      case "message":
      case "enemyDefeated":
        break;
    }
  }
  return lines;
}

function actionStartedLine(event: BattleActionStartedEvent): string {
  switch (event.action) {
    case "psi": {
      const move = event.moveName?.trim() || "PSI";
      return `${event.actorName} tried ${move}!`;
    }
    case "item": {
      const item = event.itemName?.trim() || "an item";
      return `${event.actorName} used ${item}!`;
    }
    case "pray":
      return `${event.actorName} prayed.`;
    case "attack":
    case "spy":
    case "mirror":
      return `${event.actorName}'s attack!`;
  }
}

function usesAttackImpactNarration(action: BattleActionStartedEvent | null): boolean {
  return action?.action === "attack" || action?.action === "spy" || action?.action === "mirror";
}

function isBattleEventList(input: readonly BattleEvent[] | BattleRoundStepNarrationDetails): input is readonly BattleEvent[] {
  return Array.isArray(input);
}
