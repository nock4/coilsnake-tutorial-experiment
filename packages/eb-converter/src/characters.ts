import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CharacterCollectionSchema,
  SCHEMA_VERSION,
  type CharacterCollection,
  type ValidationIssue
} from "@eb/schemas";
import { parseIntKeyedYaml, parseYamlInteger } from "./coilsnakeYaml";

export const CHARACTERS_FILE = "characters.json";

const MAX_PLAYABLE_CHARACTERS = 8;
const STAT_FIELDS = [
  "level",
  "experience",
  "maxHp",
  "maxPp",
  "offense",
  "defense",
  "speed",
  "guts",
  "vitality",
  "iq",
  "luck"
] as const;

const REQUIRED_CHARACTER_INPUTS = [
  "initial_stats.yml",
  "stats_growth_vars.yml",
  "exp_table.yml",
  "playable_char_gfx_table.yml",
  "psi_ability_table.yml",
  "psi_name_table.yml"
] as const;

type CharacterBuildOptions = {
  projectAbs: string;
  displayPath: string;
};

type InitialStatsEntry = {
  level: number;
  experience: number;
  money: number;
  items: number[];
};

type GrowthStats = {
  Offense: number;
  Defense: number;
  Speed: number;
  Guts: number;
  Vitality: number;
  IQ: number;
  Luck: number;
};

type CalculatedStats = {
  maxHp: number;
  maxPp: number;
  offense: number;
  defense: number;
  speed: number;
  guts: number;
  vitality: number;
  iq: number;
  luck: number;
};

type ExpThreshold = {
  level: number;
  experience: number;
};

export async function buildCharacterData(options: CharacterBuildOptions): Promise<CharacterCollection> {
  assertCharacterInputs(options.projectAbs);

  const warnings: ValidationIssue[] = [];
  const initialStats = parseInitialStats(await readFile(path.join(options.projectAbs, "initial_stats.yml"), "utf8"));
  const growthVars = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "stats_growth_vars.yml"), "utf8"));
  const expTable = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "exp_table.yml"), "utf8"));
  const gfxTable = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "playable_char_gfx_table.yml"), "utf8"));
  const names = await readCharacterNames(options.projectAbs, warnings);

  const characterIds = [...initialStats.keys()]
    .filter((id) => growthVars.has(id) && gfxTable.has(id))
    .sort((a, b) => a - b)
    .slice(0, MAX_PLAYABLE_CHARACTERS);

  const characters = characterIds.map((id) => {
    const initial = requireMapEntry(initialStats, id, "initial_stats.yml");
    const growth = readGrowthStats(requireMapEntry(growthVars, id, "stats_growth_vars.yml"), id);
    const levelFromExperience = levelForExperience(expTable.get(id), initial.experience);
    if (levelFromExperience !== undefined && levelFromExperience !== initial.level) {
      warnings.push(issue(
        "warning",
        "character_level_experience_mismatch",
        `Character ${id} initial Level does not match exp_table.yml threshold for Experience Points; using initial_stats.yml Level.`,
        "initial_stats.yml"
      ));
    }
    const calculated = calculateStats(growth, initial.level);
    const name = names.get(id);
    if (!name) {
      warnings.push(issue(
        "warning",
        "character_name_missing",
        `Character ${id} has no Name${id + 1} entry in naming_skip.yml; using a neutral runtime placeholder.`,
        "naming_skip.yml"
      ));
    }

    return {
      id,
      name: name ?? `CHARACTER_${id}`,
      level: initial.level,
      experience: initial.experience,
      maxHp: calculated.maxHp,
      maxPp: calculated.maxPp,
      offense: calculated.offense,
      defense: calculated.defense,
      speed: calculated.speed,
      guts: calculated.guts,
      vitality: calculated.vitality,
      iq: calculated.iq,
      luck: calculated.luck,
      startingItems: initial.items.filter((item) => item > 0),
      money: initial.money,
      growth: growthToRuntime(growth),
      expTable: parseExpThresholds(expTable.get(id))
    };
  });

  return CharacterCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: options.displayPath,
    derivation: {
      source: "initial_stats.yml provides Level, Experience Points, Money, and Items Possessed; stats_growth_vars.yml provides stat growth variables; exp_table.yml provides cumulative EXP thresholds and checks Experience Points against Level; naming_skip.yml supplies runtime names when present.",
      baseStats: "Level 1 starts at HP 30, PP 10, and 2 for offense, defense, speed, guts, vitality, IQ, and luck.",
      statFormula: "For each level 2..Level, mirrors CoilSnake damage_calc target-stat formula using deterministic midpoint rolls: r=5 for Vitality/IQ through level 10, r=8.5 on levels divisible by 4, otherwise r=4.5; each stat gain is truncated.",
      hpPpFormula: "After each level, HP targets 15 * Vitality and PP targets 5 * IQ; when the target increase is less than 2, deterministic midpoint increments of HP +2 and PP +1 are used.",
      uncertainty: "EarthBound's ROM level-up stat rolls are random; generated stats are deterministic midpoint estimates suitable for menu and battle model bootstrapping, not exact save-state values."
    },
    characters,
    counts: {
      characters: characters.length,
      statFieldsPopulated: characters.length * STAT_FIELDS.length,
      growthFieldsPopulated: characters.length * 7,
      expThresholds: characters.reduce((sum, character) => sum + (character.expTable?.length ?? 0), 0)
    },
    warnings
  });
}

function assertCharacterInputs(projectAbs: string): void {
  for (const relativePath of REQUIRED_CHARACTER_INPUTS) {
    if (!existsSync(path.join(projectAbs, relativePath))) {
      throw new Error(`Character extraction requires ${relativePath}.`);
    }
  }
}

function parseInitialStats(source: string): Map<number, InitialStatsEntry> {
  const entries = new Map<number, InitialStatsEntry>();
  let current: InitialStatsEntry | undefined;
  let collectingItems = false;

  for (const line of source.split(/\r?\n/)) {
    const blockMatch = /^(0x[0-9a-fA-F]+|\d+):\s*$/.exec(line);
    if (blockMatch) {
      current = { level: Number.NaN, experience: Number.NaN, money: Number.NaN, items: [] };
      entries.set(parseYamlInteger(blockMatch[1]), current);
      collectingItems = false;
      continue;
    }
    if (!current) {
      continue;
    }

    const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
    if (fieldMatch && !line.startsWith("   ")) {
      const key = fieldMatch[1].trim();
      const value = stripQuotes(fieldMatch[2].trim());
      collectingItems = key === "Items Possessed";
      if (key === "Level") {
        current.level = requiredInteger(value, "initial_stats.yml Level");
      } else if (key === "Experience Points") {
        current.experience = requiredInteger(value, "initial_stats.yml Experience Points");
      } else if (key === "Money") {
        current.money = requiredInteger(value, "initial_stats.yml Money");
      }
      continue;
    }

    const itemMatch = /^ {2}-\s*(\S+)\s*$/.exec(line);
    if (collectingItems && itemMatch) {
      current.items.push(requiredInteger(stripQuotes(itemMatch[1]), "initial_stats.yml Items Possessed"));
    }
  }

  for (const [id, entry] of entries) {
    if ([entry.level, entry.experience, entry.money].some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid or missing initial_stats.yml numeric fields for character ${id}.`);
    }
  }
  return entries;
}

async function readCharacterNames(projectAbs: string, warnings: ValidationIssue[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const file = path.join(projectAbs, "naming_skip.yml");
  if (!existsSync(file)) {
    warnings.push(issue(
      "warning",
      "character_names_missing",
      "naming_skip.yml is missing; generated character names will use neutral runtime placeholders.",
      "naming_skip.yml"
    ));
    return names;
  }

  const source = await readFile(file, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = /^Name(\d+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const id = Number.parseInt(match[1], 10) - 1;
    if (id >= 0) {
      names.set(id, stripQuotes(match[2].trim()));
    }
  }
  return names;
}

function readGrowthStats(entry: Record<string, string>, id: number): GrowthStats {
  return {
    Offense: requiredInteger(entry.Offense, `stats_growth_vars.yml Offense for character ${id}`),
    Defense: requiredInteger(entry.Defense, `stats_growth_vars.yml Defense for character ${id}`),
    Speed: requiredInteger(entry.Speed, `stats_growth_vars.yml Speed for character ${id}`),
    Guts: requiredInteger(entry.Guts, `stats_growth_vars.yml Guts for character ${id}`),
    Vitality: requiredInteger(entry.Vitality, `stats_growth_vars.yml Vitality for character ${id}`),
    IQ: requiredInteger(entry.IQ, `stats_growth_vars.yml IQ for character ${id}`),
    Luck: requiredInteger(entry.Luck, `stats_growth_vars.yml Luck for character ${id}`)
  };
}

function growthToRuntime(growth: GrowthStats): {
  offense: number;
  defense: number;
  speed: number;
  guts: number;
  vitality: number;
  iq: number;
  luck: number;
} {
  return {
    offense: growth.Offense,
    defense: growth.Defense,
    speed: growth.Speed,
    guts: growth.Guts,
    vitality: growth.Vitality,
    iq: growth.IQ,
    luck: growth.Luck
  };
}

function calculateStats(growth: GrowthStats, endLevel: number): CalculatedStats {
  const stats = {
    maxHp: 30,
    maxPp: 10,
    offense: 2,
    defense: 2,
    speed: 2,
    guts: 2,
    vitality: 2,
    iq: 2,
    luck: 2
  };

  for (let level = 2; level <= Math.max(1, Math.floor(endLevel)); level += 1) {
    stats.offense = calcNewStat("Offense", growth, level, stats.offense);
    stats.defense = calcNewStat("Defense", growth, level, stats.defense);
    stats.speed = calcNewStat("Speed", growth, level, stats.speed);
    stats.guts = calcNewStat("Guts", growth, level, stats.guts);
    stats.vitality = calcNewStat("Vitality", growth, level, stats.vitality);
    stats.iq = calcNewStat("IQ", growth, level, stats.iq);
    stats.luck = calcNewStat("Luck", growth, level, stats.luck);

    const targetHp = 15 * stats.vitality;
    stats.maxHp = targetHp - stats.maxHp < 2 ? stats.maxHp + 2 : targetHp;

    const targetPp = 5 * stats.iq;
    stats.maxPp = targetPp - stats.maxPp < 2 ? stats.maxPp + 1 : targetPp;
  }

  return stats;
}

function calcNewStat(statName: keyof GrowthStats, growth: GrowthStats, newLevel: number, oldStatValue: number): number {
  const r = midpointRoll(statName, newLevel);
  const targetGap = (growth[statName] * (newLevel - 1)) - ((oldStatValue - 2) * 10);
  return oldStatValue + Math.trunc(targetGap * (r / 50));
}

function midpointRoll(statName: keyof GrowthStats, newLevel: number): number {
  if ((statName === "Vitality" || statName === "IQ") && newLevel <= 10) {
    return 5;
  }
  if (newLevel % 4 === 0) {
    return 8.5;
  }
  return 4.5;
}

function levelForExperience(entry: Record<string, string> | undefined, experience: number): number | undefined {
  const thresholds = parseExpThresholds(entry);
  return thresholds.reduce<number | undefined>(
    (level, threshold) => experience >= threshold.experience ? threshold.level : level,
    undefined
  );
}

function parseExpThresholds(entry: Record<string, string> | undefined): ExpThreshold[] {
  if (!entry) {
    return [];
  }
  return Object.entries(entry)
    .map(([key, value]) => {
      const match = /^Level\s+(\d+)\s+EXP$/.exec(key);
      return match ? { level: Number.parseInt(match[1], 10), experience: parseYamlInteger(value) } : undefined;
    })
    .filter((item): item is ExpThreshold =>
      item !== undefined && item.level > 0 && Number.isFinite(item.experience)
    )
    .sort((a, b) => a.level - b.level);
}

function requiredInteger(value: string | undefined, field: string): number {
  const parsed = parseYamlInteger(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid or missing numeric character field "${field}".`);
  }
  return Math.max(0, Math.floor(parsed));
}

function requireMapEntry<K, V>(map: Map<K, V>, key: K, source: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing ${source} entry for id ${String(key)}.`);
  }
  return value;
}

function stripQuotes(value: string): string {
  const match = /^"(.*)"$|^'(.*)'$/.exec(value);
  if (match) {
    return match[1] ?? match[2] ?? value;
  }
  return value;
}

function issue(severity: ValidationIssue["severity"], code: string, message: string, issuePath?: string): ValidationIssue {
  return { severity, code, message, ...(issuePath ? { path: issuePath } : {}) };
}
