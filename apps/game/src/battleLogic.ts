import type { BattleEnemy, CharacterData } from "@eb/schemas";
import {
  createRollingMeter,
  isDepleted,
  setTarget,
  tick,
  type RollingMeterState
} from "./rollingMeter";
import {
  buildCombatantFromPartyMember,
  buildPartyMember,
  type PartyMember,
  type PartyMemberStatBonuses
} from "./characterModel";

export type Rng = () => number;
export type BattleActor = "player" | "enemy";
export type BattleOutcome = "ongoing" | "win" | "lose";

export type Combatant = {
  name: string;
  level: number;
  maxHp: number;
  maxPp: number;
  pp: number;
  hp: RollingMeterState;
  offense: number;
  defense: number;
  isEnemy: boolean;
};

export type BattleState = {
  player: Combatant;
  enemy: Combatant;
};

export type PlayerCombatantOptions = Partial<Pick<Combatant, "name" | "level" | "maxHp" | "offense" | "defense">> & {
  hpRatePerSec?: number;
  character?: CharacterData;
  partyMember?: PartyMember;
  statBonuses?: PartyMemberStatBonuses;
};

export type EnemyCombatantOptions = {
  hpRatePerSec?: number;
};

export type TurnResolution = {
  state: BattleState;
  actor: BattleActor;
  defender: BattleActor;
  damage: number;
  outcome: BattleOutcome;
};

export const PLAYER_DEFAULTS = {
  name: "PLAYER",
  level: 1,
  maxHp: 40,
  maxPp: 0,
  pp: 0,
  offense: 12,
  defense: 6,
  hpRatePerSec: 36
} as const;

const ENEMY_HP_RATE_PER_SEC = 42;

export function buildPlayerCombatant(options: PlayerCombatantOptions = {}): Combatant {
  const member = options.partyMember ?? (options.character ? buildPartyMember(options.character) : undefined);
  if (member) {
    return buildCombatantFromPartyMember(member, {
      hpRatePerSec: options.hpRatePerSec,
      statBonuses: options.statBonuses
    });
  }

  const maxHp = stat(options.maxHp ?? PLAYER_DEFAULTS.maxHp);
  return {
    name: options.name ?? PLAYER_DEFAULTS.name,
    level: stat(options.level ?? PLAYER_DEFAULTS.level),
    maxHp,
    maxPp: PLAYER_DEFAULTS.maxPp,
    pp: PLAYER_DEFAULTS.pp,
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? PLAYER_DEFAULTS.hpRatePerSec),
    offense: stat(options.offense ?? PLAYER_DEFAULTS.offense) + stat(options.statBonuses?.offense ?? 0),
    defense: stat(options.defense ?? PLAYER_DEFAULTS.defense) + stat(options.statBonuses?.defense ?? 0),
    isEnemy: false
  };
}

export function buildEnemyCombatant(enemy: BattleEnemy, options: EnemyCombatantOptions = {}): Combatant {
  const maxHp = stat(enemy.hp);
  return {
    name: enemy.name,
    level: stat(enemy.level),
    maxHp,
    maxPp: 0,
    pp: 0,
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? ENEMY_HP_RATE_PER_SEC),
    offense: stat(enemy.offense),
    defense: stat(enemy.defense),
    isEnemy: true
  };
}

export function createBattleState(enemy: BattleEnemy, playerOptions: PlayerCombatantOptions = {}): BattleState {
  return {
    player: buildPlayerCombatant(playerOptions),
    enemy: buildEnemyCombatant(enemy)
  };
}

export function damage(attacker: Combatant, defender: Combatant, rng: Rng): number {
  const base = Math.max(1, attacker.offense - Math.floor(defender.defense / 2));
  const roll = normalizedRoll(rng());
  const spread = 0.9 + roll * 0.2;
  return Math.max(1, Math.floor(base * spread));
}

export function turnOrder(_state: BattleState): BattleActor[] {
  return ["player", "enemy"];
}

export function resolveTurn(state: BattleState, actor: BattleActor, rng: Rng): TurnResolution {
  const currentOutcome = outcome(state);
  const defender = opposingActor(actor);
  if (currentOutcome !== "ongoing") {
    return { state, actor, defender, damage: 0, outcome: currentOutcome };
  }

  const attackerCombatant = combatantFor(state, actor);
  const defenderCombatant = combatantFor(state, defender);
  const amount = damage(attackerCombatant, defenderCombatant, rng);
  const nextDefender = applyDamage(defenderCombatant, amount);
  const nextState = withCombatant(state, defender, nextDefender);
  return {
    state: nextState,
    actor,
    defender,
    damage: amount,
    outcome: outcome(nextState)
  };
}

export function tickBattleMeters(state: BattleState, dtMs: number): BattleState {
  return {
    player: { ...state.player, hp: tick(state.player.hp, dtMs) },
    enemy: { ...state.enemy, hp: tick(state.enemy.hp, dtMs) }
  };
}

export function outcome(state: BattleState): BattleOutcome {
  if (isDepleted(state.enemy.hp)) {
    return "win";
  }
  if (isDepleted(state.player.hp)) {
    return "lose";
  }
  return "ongoing";
}

export function withCombatant(state: BattleState, actor: BattleActor, combatant: Combatant): BattleState {
  return actor === "player"
    ? { ...state, player: combatant }
    : { ...state, enemy: combatant };
}

function applyDamage(combatant: Combatant, amount: number): Combatant {
  return {
    ...combatant,
    hp: setTarget(combatant.hp, Math.max(0, combatant.hp.target - Math.max(0, Math.floor(amount))))
  };
}

function combatantFor(state: BattleState, actor: BattleActor): Combatant {
  return actor === "player" ? state.player : state.enemy;
}

function opposingActor(actor: BattleActor): BattleActor {
  return actor === "player" ? "enemy" : "player";
}

function normalizedRoll(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
