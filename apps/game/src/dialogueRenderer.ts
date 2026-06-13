import type { DialoguePage, DialogueSegment } from "@eb/schemas";

export const INSTANT_TEXT_SPEED_CPS = Number.POSITIVE_INFINITY;

export interface DialogueResolver {
  playerName(): string;
  partyCharName(i: number): string;
  itemName(i: number): string;
  psiName(i: number): string;
  teleportName(i: number): string;
  statName(i: number): string;
  formatNumber(n: number): string;
  formatMoney(n: number): string;
}

function indexedPlaceholder(label: string, index: number): string {
  return Number.isFinite(index) ? `[${label} ${Math.trunc(index)}]` : `[${label}]`;
}

function formattedNumber(label: string, value: number): string {
  return Number.isFinite(value) ? `${value}` : `[${label}]`;
}

export const DefaultResolver: DialogueResolver = {
  playerName: () => "PLAYER",
  partyCharName: (i) => indexedPlaceholder("char", i),
  itemName: (i) => indexedPlaceholder("item", i),
  psiName: (i) => indexedPlaceholder("psi", i),
  teleportName: (i) => indexedPlaceholder("teleport", i),
  statName: (i) => indexedPlaceholder("stat", i),
  formatNumber: (n) => formattedNumber("number", n),
  formatMoney: (n) => formattedNumber("money", n)
};

type SubstitutionSegment = Extract<DialogueSegment, { kind: "substitution" }>;

function firstArg(segment: SubstitutionSegment): number {
  return segment.args[0] ?? Number.NaN;
}

function renderSubstitution(segment: SubstitutionSegment, resolver: DialogueResolver): string {
  switch (segment.name) {
    case "playerName":
      return resolver.playerName();
    case "partyChar":
    case "user":
    case "target":
      return resolver.partyCharName(firstArg(segment));
    case "item":
      return resolver.itemName(firstArg(segment));
    case "psi":
      return resolver.psiName(firstArg(segment));
    case "number":
      return resolver.formatNumber(firstArg(segment));
    case "money":
      return resolver.formatMoney(firstArg(segment));
    case "teleport":
      return resolver.teleportName(firstArg(segment));
    case "stat":
      return resolver.statName(firstArg(segment));
  }
  return `[${segment.name}]`;
}

export function renderSegmentsToText(
  segments: readonly DialogueSegment[] | undefined,
  resolver: DialogueResolver = DefaultResolver
): string {
  let output = "";
  for (const segment of segments ?? []) {
    switch (segment.kind) {
      case "text":
        output += segment.value;
        break;
      case "break":
        output += "\n";
        break;
      case "substitution":
        output += renderSubstitution(segment, resolver);
        break;
      case "pause":
      case "prompt":
      case "style":
      case "window":
      case "control":
        break;
    }
  }
  return output;
}

export function renderPageToText(
  page: Pick<DialoguePage, "text" | "segments"> | undefined,
  resolver: DialogueResolver = DefaultResolver
): string {
  if (!page) {
    return "";
  }
  if (!page.segments || page.segments.length === 0) {
    return page.text;
  }
  const rendered = renderSegmentsToText(page.segments, resolver);
  return page.segments.every((segment) => segment.kind === "text") ? page.text : rendered;
}

export type RevealState = {
  revealedText: string;
  revealComplete: boolean;
  revealedChars: number;
  totalChars: number;
};

export function revealState(
  fullText: string,
  elapsedMs: number,
  cps: number = INSTANT_TEXT_SPEED_CPS
): RevealState {
  const totalChars = fullText.length;
  if (!Number.isFinite(cps) || cps <= 0) {
    return {
      revealedText: fullText,
      revealComplete: true,
      revealedChars: totalChars,
      totalChars
    };
  }

  const revealedChars = Math.min(totalChars, Math.floor((Math.max(0, elapsedMs) / 1000) * cps));
  return {
    revealedText: fullText.slice(0, revealedChars),
    revealComplete: revealedChars >= totalChars,
    revealedChars,
    totalChars
  };
}

export function perPagePauseMs(segments: readonly DialogueSegment[] | undefined): number {
  return (segments ?? []).reduce((total, segment) => {
    return total + (segment.kind === "pause" ? segment.frames * (1000 / 60) : 0);
  }, 0);
}

export type DialogueConfirmAction = "advance" | "completeReveal";

export function confirmActionForReveal(revealComplete: boolean): DialogueConfirmAction {
  return revealComplete ? "advance" : "completeReveal";
}

export function textSpeedCpsFromSearch(search: string | undefined | null): number {
  const raw = new URLSearchParams(search ?? "").get("textspeed");
  if (!raw || raw.trim().toLowerCase() === "instant") {
    return INSTANT_TEXT_SPEED_CPS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : INSTANT_TEXT_SPEED_CPS;
}
