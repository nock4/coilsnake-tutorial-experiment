import type { BattleEnemy, CharacterCollection, CharacterData } from "@eb/schemas";
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
export type BattleSide = "party" | "enemy";
export type BattleActor = {
  side: BattleSide;
  index: number;
};
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
  speed: number;
  isEnemy: boolean;
};

export type BattleState = {
  party: Combatant[];
  enemies: Combatant[];
};

export type PlayerCombatantOptions = Partial<Pick<Combatant, "name" | "level" | "maxHp" | "offense" | "defense" | "speed">> & {
  hpRatePerSec?: number;
  character?: CharacterData;
  partyMember?: PartyMember;
  statBonuses?: PartyMemberStatBonuses;
};

export type EnemyCombatantOptions = {
  hpRatePerSec?: number;
  speed?: number;
};

export type BattleStateOptions = PlayerCombatantOptions & {
  characters?: CharacterCollection;
  partyMembers?: PartyMember[];
  partyOptions?: PlayerCombatantOptions[];
  enemyOptions?: EnemyCombatantOptions[];
};

export type TurnResolution = {
  state: BattleState;
  actor: BattleActor;
  defender: BattleActor | null;
  damage: number;
  outcome: BattleOutcome;
  skipped: boolean;
};

export const PLAYER_DEFAULTS = {
  name: "PLAYER",
  level: 1,
  maxHp: 40,
  maxPp: 0,
  pp: 0,
  offense: 12,
  defense: 6,
  speed: 5,
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
    speed: stat(options.speed ?? PLAYER_DEFAULTS.speed) + stat(options.statBonuses?.speed ?? 0),
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
    speed: stat(options.speed ?? enemySpeed(enemy)),
    isEnemy: true
  };
}

export function buildPartyCombatants(options: BattleStateOptions = {}): Combatant[] {
  const members = options.partyMembers?.slice(0, 4) ?? [];
  if (members.length > 0) {
    return members.map((partyMember, index) => buildPlayerCombatant(playerOptionsAt(options, index, { partyMember })));
  }

  const characters = options.characters?.characters.slice(0, 4) ?? [];
  if (characters.length > 0) {
    return characters.map((character, index) => buildPlayerCombatant(playerOptionsAt(options, index, { character })));
  }

  if (options.partyMember) {
    return [buildPlayerCombatant(playerOptionsAt(options, 0, { partyMember: options.partyMember }))];
  }

  if (options.character) {
    return [buildPlayerCombatant(playerOptionsAt(options, 0, { character: options.character }))];
  }

  return [buildPlayerCombatant(playerOptionsAt(options, 0))];
}

export function createBattleState(enemies: BattleEnemy | BattleEnemy[], options: BattleStateOptions = {}): BattleState {
  const enemyList = Array.isArray(enemies) ? enemies : [enemies];
  return {
    party: buildPartyCombatants(options),
    enemies: enemyList.map((enemy, index) => buildEnemyCombatant(enemy, options.enemyOptions?.[index]))
  };
}

export function damage(attacker: Combatant, defender: Combatant, rng: Rng): number {
  const base = Math.max(1, attacker.offense - Math.floor(defender.defense / 2));
  const roll = normalizedRoll(rng());
  const spread = 0.9 + roll * 0.2;
  return Math.max(1, Math.floor(base * spread));
}

export function turnOrder(state: BattleState): BattleActor[] {
  return allActors(state)
    .filter((actor) => {
      const combatant = combatantFor(state, actor);
      return Boolean(combatant && isCombatantAlive(combatant));
    })
    .sort((a, b) => {
      const left = combatantFor(state, a);
      const right = combatantFor(state, b);
      const speedDelta = stat(right?.speed ?? 0) - stat(left?.speed ?? 0);
      if (speedDelta !== 0) {
        return speedDelta;
      }
      const sideDelta = sideTieRank(a.side) - sideTieRank(b.side);
      return sideDelta !== 0 ? sideDelta : a.index - b.index;
    });
}

export function resolveTurn(
  state: BattleState,
  actorInput: BattleActor | "player" | "enemy",
  rng: Rng,
  options: { targetIndex?: number } = {}
): TurnResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing") {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const attackerCombatant = combatantFor(state, actor);
  if (!attackerCombatant || !isCombatantAlive(attackerCombatant)) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const defender = targetForActor(state, actor, options.targetIndex);
  if (!defender) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const defenderCombatant = combatantFor(state, defender);
  if (!defenderCombatant) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const amount = damage(attackerCombatant, defenderCombatant, rng);
  const nextDefender = applyDamage(defenderCombatant, amount);
  const nextState = withCombatant(state, defender, nextDefender);
  return {
    state: nextState,
    actor,
    defender,
    damage: amount,
    outcome: outcome(nextState),
    skipped: false
  };
}

export function tickBattleMeters(state: BattleState, dtMs: number): BattleState {
  return {
    party: state.party.map((combatant) => ({ ...combatant, hp: tick(combatant.hp, dtMs) })),
    enemies: state.enemies.map((combatant) => ({ ...combatant, hp: tick(combatant.hp, dtMs) }))
  };
}

export function outcome(state: BattleState): BattleOutcome {
  if (state.enemies.length === 0 || state.enemies.every((enemy) => isDepleted(enemy.hp))) {
    return "win";
  }
  if (state.party.length === 0 || state.party.every((member) => isDepleted(member.hp))) {
    return "lose";
  }
  return "ongoing";
}

export function withCombatant(
  state: BattleState,
  actorInput: BattleActor | "player" | "enemy",
  combatant: Combatant
): BattleState {
  const actor = normalizeActor(actorInput);
  if (actor.side === "party") {
    return { ...state, party: replaceAt(state.party, actor.index, combatant) };
  }
  return { ...state, enemies: replaceAt(state.enemies, actor.index, combatant) };
}

export function combatantAt(state: BattleState, actorInput: BattleActor | "player" | "enemy"): Combatant | undefined {
  return combatantFor(state, normalizeActor(actorInput));
}

export function isCombatantAlive(combatant: Pick<Combatant, "hp">): boolean {
  return !isDepleted(combatant.hp);
}

export function firstLivingIndex(combatants: Combatant[]): number {
  return combatants.findIndex(isCombatantAlive);
}

export function normalizeActor(actor: BattleActor | "player" | "enemy"): BattleActor {
  if (actor === "player") {
    return { side: "party", index: 0 };
  }
  if (actor === "enemy") {
    return { side: "enemy", index: 0 };
  }
  return actor;
}

function applyDamage(combatant: Combatant, amount: number): Combatant {
  return {
    ...combatant,
    hp: setTarget(combatant.hp, Math.max(0, combatant.hp.target - Math.max(0, Math.floor(amount))))
  };
}

function combatantFor(state: BattleState, actor: BattleActor): Combatant | undefined {
  return actor.side === "party" ? state.party[actor.index] : state.enemies[actor.index];
}

function targetForActor(state: BattleState, actor: BattleActor, targetIndex: number | undefined): BattleActor | null {
  if (actor.side === "party") {
    return livingTarget(state.enemies, "enemy", targetIndex);
  }

  // Enemy AI is intentionally simple: each enemy attacks the first living party member.
  return livingTarget(state.party, "party");
}

function livingTarget(combatants: Combatant[], side: BattleSide, requestedIndex?: number): BattleActor | null {
  if (
    requestedIndex !== undefined &&
    requestedIndex >= 0 &&
    requestedIndex < combatants.length &&
    isCombatantAlive(combatants[requestedIndex])
  ) {
    return { side, index: requestedIndex };
  }

  const index = firstLivingIndex(combatants);
  return index >= 0 ? { side, index } : null;
}

function allActors(state: BattleState): BattleActor[] {
  return [
    ...state.party.map((_, index) => ({ side: "party" as const, index })),
    ...state.enemies.map((_, index) => ({ side: "enemy" as const, index }))
  ];
}

function sideTieRank(side: BattleSide): number {
  return side === "party" ? 0 : 1;
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  if (index < 0 || index >= items.length) {
    return items;
  }
  return items.map((current, currentIndex) => (currentIndex === index ? item : current));
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

function enemySpeed(enemy: BattleEnemy): number {
  const maybeSpeed = (enemy as BattleEnemy & { speed?: number }).speed;
  return stat(maybeSpeed ?? enemy.level);
}

function playerOptionsAt(
  options: BattleStateOptions,
  index: number,
  extra: Pick<PlayerCombatantOptions, "character" | "partyMember"> = {}
): PlayerCombatantOptions {
  const indexed = options.partyOptions?.[index] ?? {};
  return {
    name: options.name,
    level: options.level,
    maxHp: options.maxHp,
    offense: options.offense,
    defense: options.defense,
    speed: options.speed,
    hpRatePerSec: options.hpRatePerSec,
    statBonuses: options.statBonuses,
    ...indexed,
    ...extra
  };
}
