import type { BattleEnemy, ItemData } from "@eb/schemas";
import { describe, expect, it } from "vitest";
import {
  createBattleState,
  resolveItemTurn,
  resolvePhysicalAttackDamage,
  type BattleActor,
  type Rng
} from "./battleLogic";

const PARTY0: BattleActor = { side: "party", index: 0 };

function enemy(overrides: Partial<BattleEnemy> = {}): BattleEnemy {
  return {
    id: 9001,
    name: "DUMMY",
    spriteId: 0,
    level: 10,
    hp: 500,
    defense: 4,
    offense: 10,
    speed: 4,
    experience: 0,
    money: 0,
    bossFlag: false,
    actions: [0, 1, 2, 3].map(() => ({ id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 })) as BattleEnemy["actions"],
    itemDropped: null,
    itemRarity: null,
    ...overrides
  };
}

function consumableItem(effect: ItemData["effect"], id = 159): ItemData {
  return {
    id,
    name: "Test item",
    type: 36,
    cost: 0,
    action: 249,
    argument: 0,
    equippable: false,
    miscFlags: ["item disappears when used"],
    effect
  };
}

function sequenceRng(values: number[]): Rng {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

describe("battle item stat buffs", () => {
  it("preserves additive buffStat behavior", () => {
    const battle = createBattleState(enemy(), { defense: 12 });
    battle.party[0].inventory = [161];

    const result = resolveItemTurn(
      battle,
      PARTY0,
      consumableItem({ kind: "buffStat", stat: "defense", amount: 5 }, 161),
      { inventorySlot: 0, targetIndex: 0 }
    );

    expect(result.skipped).toBe(false);
    expect(result.state.party[0].defense).toBe(17);
  });

  it("doubles effective guts for SMAAAASH chance", () => {
    const battle = createBattleState(enemy(), { statBonuses: { guts: 40 } });
    battle.party[0].inventory = [159];

    const before = resolvePhysicalAttackDamage(
      battle.party[0],
      battle.enemies[0],
      sequenceRng([0.99, 0.12, 0.5])
    );
    const result = resolveItemTurn(
      battle,
      PARTY0,
      consumableItem({ kind: "buffStat", stat: "guts", multiplier: 2 }),
      { inventorySlot: 0, targetIndex: 0 }
    );
    const after = resolvePhysicalAttackDamage(
      result.state.party[0],
      result.state.enemies[0],
      sequenceRng([0.99, 0.12, 0.5])
    );

    expect(result.skipped).toBe(false);
    expect(result.state.party[0].stats.guts).toBe(80);
    expect(before.smash).toBe(false);
    expect(after.smash).toBe(true);
  });
});
