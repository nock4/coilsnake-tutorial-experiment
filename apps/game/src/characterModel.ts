import type { CharacterData } from "@eb/schemas";
import type { Combatant } from "./battleLogic";
import { createRollingMeter } from "./rollingMeter";

export type PartyMemberStats = {
  offense: number;
  defense: number;
  speed: number;
  guts: number;
  vitality: number;
  iq: number;
  luck: number;
};

export type PartyMember = {
  id: number;
  name: string;
  level: number;
  maxHp: number;
  hp: number;
  maxPp: number;
  pp: number;
  stats: PartyMemberStats;
  inventory: number[];
  money: number;
};

export type CharacterCombatantOptions = {
  hpRatePerSec?: number;
};

const DEFAULT_HP_RATE_PER_SEC = 36;

export function buildPartyMember(data: CharacterData): PartyMember {
  const maxHp = stat(data.maxHp);
  const maxPp = stat(data.maxPp);
  return {
    id: stat(data.id),
    name: data.name,
    level: Math.max(1, stat(data.level)),
    maxHp,
    hp: maxHp,
    maxPp,
    pp: maxPp,
    stats: {
      offense: stat(data.offense),
      defense: stat(data.defense),
      speed: stat(data.speed),
      guts: stat(data.guts),
      vitality: stat(data.vitality),
      iq: stat(data.iq),
      luck: stat(data.luck)
    },
    inventory: data.startingItems.map(stat),
    money: stat(data.money)
  };
}

export function buildCombatantFromPartyMember(
  member: PartyMember,
  options: CharacterCombatantOptions = {}
): Combatant {
  const maxHp = Math.max(1, stat(member.maxHp));
  return {
    name: member.name,
    level: Math.max(1, stat(member.level)),
    maxHp,
    maxPp: stat(member.maxPp),
    pp: stat(member.pp),
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? DEFAULT_HP_RATE_PER_SEC),
    offense: stat(member.stats.offense),
    defense: stat(member.stats.defense),
    isEnemy: false
  };
}

export function buildCombatantFromCharacter(
  data: CharacterData,
  options: CharacterCombatantOptions = {}
): Combatant {
  return buildCombatantFromPartyMember(buildPartyMember(data), options);
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
