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
  stats?: CalculatedStats;
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

type MutableInitialStatsEntry = Omit<InitialStatsEntry, "stats"> & {
  statValues: Partial<CalculatedStats>;
};

type InitialStatField = keyof CalculatedStats;

const INITIAL_STAT_FIELDS: Record<string, InitialStatField> = {
  HP: "maxHp",
  "Max HP": "maxHp",
  MaxHp: "maxHp",
  maxHp: "maxHp",
  PP: "maxPp",
  "Max PP": "maxPp",
  MaxPp: "maxPp",
  maxPp: "maxPp",
  Offense: "offense",
  offense: "offense",
  Defense: "defense",
  defense: "defense",
  Speed: "speed",
  speed: "speed",
  Guts: "guts",
  guts: "guts",
  Vitality: "vitality",
  vitality: "vitality",
  IQ: "iq",
  iq: "iq",
  Luck: "luck",
  luck: "luck"
};

export async function buildCharacterData(options: CharacterBuildOptions): Promise<CharacterCollection> {
  assertCharacterInputs(options.projectAbs);

  const warnings: ValidationIssue[] = [];
  const initialStatsPath = path.join(options.projectAbs, "initial_stats.yml");
  const initialStats = existsSync(initialStatsPath)
    ? parseInitialStats(await readFile(initialStatsPath, "utf8"))
    : undefined;
  if (!initialStats) {
    warnings.push(issue(
      "warning",
      "character_initial_stats_missing",
      "initial_stats.yml is missing; generated characters use neutral level-1 starting state and empty inventory.",
      "initial_stats.yml"
    ));
  }
  const growthVars = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "stats_growth_vars.yml"), "utf8"));
  const expTable = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "exp_table.yml"), "utf8"));
  const gfxTable = parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "playable_char_gfx_table.yml"), "utf8"));
  const names = await readCharacterNames(options.projectAbs, warnings);

  const characterIds = [...(initialStats?.keys() ?? growthVars.keys())]
    .filter((id) => growthVars.has(id) && gfxTable.has(id))
    .sort((a, b) => a - b)
    .slice(0, MAX_PLAYABLE_CHARACTERS);

  const characters = characterIds.map((id) => {
    const initial = initialStats?.get(id) ?? defaultInitialStatsEntry();
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
    const calculated = initial.stats
      ?? (initialStats ? calculateStatsFromProjectData(growth, initial.level) : calculateStats(growth, initial.level));
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
      source: "initial_stats.yml provides Level, Experience Points, Money, Items Possessed, and explicit starting stats when exported; stats_growth_vars.yml provides per-character stat variables when initial_stats.yml omits explicit stats; exp_table.yml provides cumulative EXP thresholds and checks Experience Points against Level; naming_skip.yml supplies runtime names when present.",
      baseStats: "When explicit starting stats are unavailable but initial_stats.yml is present, per-character growth variables seed HP, PP, and base stats so runtime characters do not use uniform neutral placeholders. If initial_stats.yml is absent, generation falls back to the neutral level-1 starting state.",
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
  const entries = new Map<number, MutableInitialStatsEntry>();
  let current: MutableInitialStatsEntry | undefined;
  let collectingItems = false;

  for (const line of source.split(/\r?\n/)) {
    const blockMatch = /^(0x[0-9a-fA-F]+|\d+):\s*$/.exec(line);
    if (blockMatch) {
      current = { level: Number.NaN, experience: Number.NaN, money: Number.NaN, items: [], statValues: {} };
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
      } else {
        const statField = INITIAL_STAT_FIELDS[key];
        if (statField) {
          current.statValues[statField] = requiredInteger(value, `initial_stats.yml ${key}`);
        }
      }
      continue;
    }

    const itemMatch = /^ {2}-\s*(\S+)\s*$/.exec(line);
    if (collectingItems && itemMatch) {
      current.items.push(requiredInteger(stripQuotes(itemMatch[1]), "initial_stats.yml Items Possessed"));
    }
  }

  const parsed = new Map<number, InitialStatsEntry>();
  for (const [id, entry] of entries) {
    if ([entry.level, entry.experience, entry.money].some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid or missing initial_stats.yml numeric fields for character ${id}.`);
    }
    const stats = completeInitialStats(entry.statValues);
    parsed.set(id, {
      level: entry.level,
      experience: entry.experience,
      money: entry.money,
      items: entry.items,
      ...(stats ? { stats } : {})
    });
  }
  return parsed;
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
  return calculateStatsFromBase(neutralBaseStats(), growth, endLevel);
}

function calculateStatsFromProjectData(growth: GrowthStats, endLevel: number): CalculatedStats {
  return calculateStatsFromBase({
    maxHp: Math.max(1, growth.Vitality) * 15,
    maxPp: Math.max(0, growth.IQ) * 5,
    offense: Math.max(1, growth.Offense),
    defense: Math.max(1, growth.Defense),
    speed: Math.max(1, growth.Speed),
    guts: Math.max(1, growth.Guts),
    vitality: Math.max(1, growth.Vitality),
    iq: Math.max(0, growth.IQ),
    luck: Math.max(1, growth.Luck)
  }, growth, endLevel);
}

function neutralBaseStats(): CalculatedStats {
  return {
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
}

function calculateStatsFromBase(base: CalculatedStats, growth: GrowthStats, endLevel: number): CalculatedStats {
  const stats = {
    ...base
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

function completeInitialStats(values: Partial<CalculatedStats>): CalculatedStats | undefined {
  const stats: CalculatedStats = {
    maxHp: values.maxHp ?? Number.NaN,
    maxPp: values.maxPp ?? Number.NaN,
    offense: values.offense ?? Number.NaN,
    defense: values.defense ?? Number.NaN,
    speed: values.speed ?? Number.NaN,
    guts: values.guts ?? Number.NaN,
    vitality: values.vitality ?? Number.NaN,
    iq: values.iq ?? Number.NaN,
    luck: values.luck ?? Number.NaN
  };
  return Object.values(stats).every((value) => Number.isFinite(value)) ? stats : undefined;
}

function defaultInitialStatsEntry(): InitialStatsEntry {
  return {
    level: 1,
    experience: 0,
    money: 0,
    items: []
  };
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
