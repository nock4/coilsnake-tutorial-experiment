import { describe, expect, it } from "vitest";
import { battleMusicCueForOutcome } from "../src/battleMusic";

describe("battle music cue selection", () => {
  it("uses the victory cue only for won battles", () => {
    expect(battleMusicCueForOutcome("ongoing")).toBe("battle");
    expect(battleMusicCueForOutcome("lose")).toBe("battle");
    expect(battleMusicCueForOutcome("win")).toBe("victory");
  });
});
