import { describe, expect, it } from "vitest";
import type { CharacterData } from "@eb/schemas";
import {
  buildCombatantFromCharacter,
  buildCombatantFromPartyMember,
  buildPartyMember
} from "../src/characterModel";

const character: CharacterData = {
  id: 2,
  name: "PARTY_MEMBER",
  level: 7,
  maxHp: 88,
  maxPp: 24,
  offense: 14,
  defense: 9,
  speed: 6,
  guts: 5,
  vitality: 8,
  iq: 4,
  luck: 3,
  startingItems: [12, 13],
  money: 21
};

describe("character model", () => {
  it("builds a party member record from generated character data", () => {
    const member = buildPartyMember(character);

    expect(member).toEqual({
      id: 2,
      name: "PARTY_MEMBER",
      level: 7,
      maxHp: 88,
      hp: 88,
      maxPp: 24,
      pp: 24,
      stats: {
        offense: 14,
        defense: 9,
        speed: 6,
        guts: 5,
        vitality: 8,
        iq: 4,
        luck: 3
      },
      inventory: [12, 13],
      money: 21
    });
  });

  it("builds a battle combatant from a party member", () => {
    const member = buildPartyMember(character);
    const combatant = buildCombatantFromPartyMember(member, { hpRatePerSec: 3 });

    expect(combatant).toMatchObject({
      name: "PARTY_MEMBER",
      level: 7,
      maxHp: 88,
      maxPp: 24,
      pp: 24,
      offense: 14,
      defense: 9,
      isEnemy: false
    });
    expect(combatant.hp).toMatchObject({ displayed: 88, target: 88, ratePerSec: 3 });
  });

  it("builds a battle combatant directly from generated character data", () => {
    const combatant = buildCombatantFromCharacter(character);

    expect(combatant.name).toBe("PARTY_MEMBER");
    expect(combatant.maxHp).toBe(88);
    expect(combatant.pp).toBe(24);
  });
});
