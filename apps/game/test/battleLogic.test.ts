import { describe, expect, it } from "vitest";
import type { BattleEnemy } from "@eb/schemas";
import {
  buildEnemyCombatant,
  buildPlayerCombatant,
  createBattleState,
  damage,
  outcome,
  resolveTurn,
  tickBattleMeters,
  turnOrder,
  withCombatant,
  type BattleState
} from "../src/battleLogic";
import { setTarget } from "../src/rollingMeter";

const opponent: BattleEnemy = {
  id: 1,
  name: "OPPONENT",
  spriteId: 1,
  level: 3,
  hp: 24,
  defense: 4,
  offense: 8,
  experience: 0,
  bossFlag: false,
  actions: [
    { id: 0, arg: 0 },
    { id: 0, arg: 0 },
    { id: 0, arg: 0 },
    { id: 0, arg: 0 }
  ],
  itemDropped: null
};

function state(): BattleState {
  return createBattleState(opponent, {
    maxHp: 30,
    offense: 20,
    defense: 6,
    hpRatePerSec: 2
  });
}

describe("battle damage", () => {
  it("is deterministic when RNG is injected", () => {
    const player = buildPlayerCombatant({ offense: 20 });
    const enemy = buildEnemyCombatant({ ...opponent, defense: 4 });

    expect(damage(player, enemy, () => 0)).toBe(16);
    expect(damage(player, enemy, () => 0.5)).toBe(18);
    expect(damage(player, enemy, () => 1)).toBe(19);
  });
});

describe("battle turn resolution", () => {
  it("uses player-first turn order", () => {
    expect(turnOrder(state())).toEqual(["player", "enemy"]);
  });

  it("applies attack damage to the defender target HP", () => {
    const result = resolveTurn(state(), "player", () => 0.5);

    expect(result.actor).toBe("player");
    expect(result.defender).toBe("enemy");
    expect(result.damage).toBe(18);
    expect(result.state.enemy.hp.displayed).toBe(24);
    expect(result.state.enemy.hp.target).toBe(6);
    expect(result.state.enemy.hp.isRolling).toBe(true);
  });
});

describe("battle outcomes", () => {
  it("wins only when enemy displayed HP reaches zero", () => {
    let battle = state();
    battle = withCombatant(battle, "enemy", {
      ...battle.enemy,
      hp: setTarget(battle.enemy.hp, 0)
    });

    expect(outcome(battle)).toBe("ongoing");
    battle = tickBattleMeters(battle, 1000);
    expect(battle.enemy.hp.displayed).toBe(0);
    expect(outcome(battle)).toBe("win");
  });

  it("loses only when player displayed HP reaches zero", () => {
    let battle = state();
    battle = withCombatant(battle, "player", {
      ...battle.player,
      hp: setTarget(battle.player.hp, 0)
    });

    expect(outcome(battle)).toBe("ongoing");
    battle = tickBattleMeters(battle, 15_000);
    expect(battle.player.hp.displayed).toBe(0);
    expect(outcome(battle)).toBe("lose");
  });

  it("survives a pending fatal target when the enemy displayed HP reaches zero first", () => {
    let battle = state();
    battle = withCombatant(battle, "player", {
      ...battle.player,
      hp: setTarget(battle.player.hp, 0)
    });
    battle = withCombatant(battle, "enemy", {
      ...battle.enemy,
      hp: setTarget({ ...battle.enemy.hp, displayed: 1, target: 1, isRolling: false }, 0)
    });

    battle = tickBattleMeters(battle, 500);

    expect(battle.player.hp.target).toBe(0);
    expect(battle.player.hp.displayed).toBeGreaterThan(0);
    expect(battle.enemy.hp.displayed).toBe(0);
    expect(outcome(battle)).toBe("win");
  });
});
