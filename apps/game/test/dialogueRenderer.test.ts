import { afterEach, describe, expect, it, vi } from "vitest";
import type { DialoguePage, DialogueSegment } from "@eb/schemas";
import {
  DefaultResolver,
  INSTANT_TEXT_SPEED_CPS,
  confirmActionForReveal,
  perPagePauseMs,
  renderPageToText,
  renderSegmentsToText,
  revealState,
  type DialogueResolver
} from "../src/dialogueRenderer";
import { DialogueController } from "../src/state";

const fakeResolver: DialogueResolver = {
  playerName: () => "PLAYER_TEST",
  partyCharName: (i) => `CHAR_${i}`,
  itemName: (i) => `ITEM_${i}`,
  psiName: (i) => `PSI_${i}`,
  teleportName: (i) => `TELEPORT_${i}`,
  statName: (i) => `STAT_${i}`,
  formatNumber: (n) => `NUMBER_${n}`,
  formatMoney: (n) => `MONEY_${n}`
};

function page(text: string, segments: DialogueSegment[]): DialoguePage {
  return {
    text,
    ended: false,
    unknownCommands: [],
    segments
  };
}

describe("renderSegmentsToText", () => {
  it("renders plain text verbatim", () => {
    expect(renderSegmentsToText([{ kind: "text", value: "Alpha beta." }])).toBe("Alpha beta.");
  });

  it("flattens line, newline, and clear breaks to newline characters", () => {
    expect(renderSegmentsToText([
      { kind: "text", value: "A" },
      { kind: "break", break: "line" },
      { kind: "text", value: "B" },
      { kind: "break", break: "newline" },
      { kind: "text", value: "C" },
      { kind: "break", break: "clear" },
      { kind: "text", value: "D" }
    ])).toBe("A\nB\nC\nD");
  });

  it("resolves substitutions through the injected resolver", () => {
    expect(renderSegmentsToText([
      { kind: "substitution", name: "playerName", args: [] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "partyChar", args: [2] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "item", args: [5] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "psi", args: [7] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "number", args: [42] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "money", args: [99] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "teleport", args: [3] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "stat", args: [4] }
    ], fakeResolver)).toBe("PLAYER_TEST / CHAR_2 / ITEM_5 / PSI_7 / NUMBER_42 / MONEY_99 / TELEPORT_3 / STAT_4");
  });

  it("uses neutral default placeholders for unresolved generated names", () => {
    expect(DefaultResolver.playerName()).toBe("PLAYER");
    expect(renderSegmentsToText([
      { kind: "substitution", name: "item", args: [] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "partyChar", args: [3] }
    ])).toBe("[item] / [char 3]");
  });

  it("omits timing, flow, style, window, and raw control segments from display text", () => {
    expect(renderSegmentsToText([
      { kind: "text", value: "A" },
      { kind: "pause", frames: 12 },
      { kind: "prompt" },
      { kind: "style", style: "color", value: "1" },
      { kind: "window", op: "switch", args: [1] },
      { kind: "control", code: "raw", raw: "[00]" },
      { kind: "text", value: "B" }
    ])).toBe("AB");
  });

  it("keeps a single plain-text segment identical to page.text", () => {
    const dialoguePage = page("Synthetic page text.", [{ kind: "text", value: "Synthetic page text." }]);
    expect(renderSegmentsToText(dialoguePage.segments)).toBe(dialoguePage.text);
  });

  it("keeps synthetic tutorial pages identical to their flattened text", () => {
    const tutorialPages = [
      page("Training page one.", [{ kind: "text", value: "Training page one." }]),
      page("Training page two.\nContinued.", [
        { kind: "text", value: "Training page two." },
        { kind: "break", break: "newline" },
        { kind: "text", value: "Continued." }
      ])
    ];

    expect(tutorialPages.map((dialoguePage) => renderSegmentsToText(dialoguePage.segments))).toEqual(
      tutorialPages.map((dialoguePage) => dialoguePage.text)
    );
  });

  it("keeps page.text for all-text pages that were already flattened by the page builder", () => {
    const dialoguePage = page("First text command.\nSecond text command.", [
      { kind: "text", value: "First text command." },
      { kind: "text", value: "Second text command." }
    ]);

    expect(renderPageToText(dialoguePage)).toBe(dialoguePage.text);
  });
});

describe("perPagePauseMs", () => {
  it("sums pause frames as 60 fps milliseconds", () => {
    expect(perPagePauseMs([
      { kind: "pause", frames: 3 },
      { kind: "text", value: "A" },
      { kind: "pause", frames: 6 }
    ])).toBeCloseTo(150);
  });
});

describe("revealState", () => {
  it("reveals full text immediately at instant speed", () => {
    expect(revealState("ABCDE", 0, INSTANT_TEXT_SPEED_CPS)).toEqual({
      revealedText: "ABCDE",
      revealComplete: true,
      revealedChars: 5,
      totalChars: 5
    });
    expect(revealState("ABCDE", 0, 0).revealComplete).toBe(true);
  });

  it("reveals partial text before completing at finite speed", () => {
    expect(revealState("abcdef", 500, 4)).toEqual({
      revealedText: "ab",
      revealComplete: false,
      revealedChars: 2,
      totalChars: 6
    });
    expect(revealState("abcdef", 1500, 4)).toEqual({
      revealedText: "abcdef",
      revealComplete: true,
      revealedChars: 6,
      totalChars: 6
    });
  });
});

describe("confirmActionForReveal", () => {
  it("advances only after the current reveal is complete", () => {
    expect(confirmActionForReveal(true)).toBe("advance");
    expect(confirmActionForReveal(false)).toBe("completeReveal");
  });
});

describe("DialogueController reveal-aware confirm behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function twoPages(): DialoguePage[] {
    return [
      page("Training page one.", [{ kind: "text", value: "Training page one." }]),
      page("Training page two.", [{ kind: "text", value: "Training page two." }])
    ];
  }

  it("instant speed advances one page per confirm press", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dialogue = new DialogueController({ textSpeedCps: INSTANT_TEXT_SPEED_CPS });
    dialogue.start(twoPages());

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.revealComplete).toBe(true);
    expect(dialogue.revealedText).toBe("Training page one.");

    expect(dialogue.advance()).toBe(true);
    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.advances).toBe(1);
    expect(dialogue.currentText).toBe("Training page two.");
  });

  it("finite speed uses first confirm to complete reveal, then second confirm to advance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dialogue = new DialogueController({ textSpeedCps: 2 });
    dialogue.start(twoPages());

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.revealComplete).toBe(false);
    expect(dialogue.revealedText).not.toBe(dialogue.currentText);

    expect(dialogue.advance()).toBe(true);
    expect(dialogue.pageIndex).toBe(0);
    expect(dialogue.advances).toBe(0);
    expect(dialogue.revealComplete).toBe(true);
    expect(dialogue.revealedText).toBe(dialogue.currentText);

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.advance()).toBe(true);
    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.advances).toBe(1);
  });
});
