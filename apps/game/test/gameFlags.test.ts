import { describe, expect, it } from "vitest";
import { GameFlags, talkedFlag } from "../src/gameFlags";

describe("GameFlags", () => {
  it("sets, checks, lists, and clears session flags", () => {
    const flags = new GameFlags();

    expect(flags.has("npc:745:talked")).toBe(false);

    flags.set("npc:745:talked");
    flags.set("npc:745:talked");
    flags.set("quest:sample");

    expect(flags.has("npc:745:talked")).toBe(true);
    expect(flags.has("missing")).toBe(false);
    expect(flags.list()).toEqual(["npc:745:talked", "quest:sample"]);

    flags.clear();

    expect(flags.has("npc:745:talked")).toBe(false);
    expect(flags.list()).toEqual([]);
  });

  it("sets, unsets, lists, and clears numeric event flags", () => {
    const flags = new GameFlags();

    expect(flags.isSet(7)).toBe(false);
    expect(flags.listNums()).toEqual([]);

    flags.setNum(7);
    flags.setNum(3);
    flags.setNum(7);

    expect(flags.isSet(7)).toBe(true);
    expect(flags.isSet(3)).toBe(true);
    expect(flags.isSet(4)).toBe(false);
    expect(flags.listNums()).toEqual([3, 7]);

    flags.unsetNum(7);
    expect(flags.isSet(7)).toBe(false);
    expect(flags.listNums()).toEqual([3]);

    flags.clear();
    expect(flags.list()).toEqual([]);
    expect(flags.listNums()).toEqual([]);
  });
});

describe("talkedFlag", () => {
  it("returns the canonical NPC talked flag", () => {
    expect(talkedFlag(745)).toBe("npc:745:talked");
  });
});
