/**
 * Act-1 parity scorecard.
 *
 * This scores DATA-EXTRACTION parity for Act 1 without printing copyrighted
 * names or game text. The source project is read locally, generated artifacts
 * are written to a temporary output directory only, and every emitted row is an
 * aggregate count or structure check.
 */
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { convertProject, parseCcsFile } from "../packages/eb-converter/src/index";
import {
  parseIntKeyedYaml,
  parseMapDoors,
  parseMapSprites,
  parseMapTiles,
  parseTeleportDestinationTable,
  parseYamlInteger
} from "../packages/eb-converter/src/coilsnakeYaml";
import {
  buildDialoguePages,
  isNpcVisibleAtAllClear,
  resolveScriptReferenceFlow,
  type WorldChunked,
  type WorldDoor
} from "../packages/eb-schemas/src/index";

type Status = "PASS" | "FAIL" | "INFO";

type Row = {
  check: string;
  value: string;
  expected: string;
  status: Status;
  hard?: boolean;
};

type ConvertResult = Awaited<ReturnType<typeof convertProject>>;

type ScriptSourceCounts = {
  files: number;
  commands: number;
  labels: number;
  textCommands: number;
  unknownCommands: number;
};

type SourceFixture = {
  npcCount: number;
  visibleAtStart: number;
  hiddenAtStart: number;
  doorTypes: Record<string, number>;
  mapWidthTiles: number;
  mapHeightTiles: number;
  scripts: ScriptSourceCounts;
  teleportDestinations: number;
};

type DialogueResolutionCounts = {
  interactableTextPointers: number;
  resolvedWithPages: number;
  unresolvedOrEmpty: number;
};

const SOURCE_PROJECT = "external/coilsnake-full";
const EXPECTED_CHUNKS = 320;
const EXPECTED_COLLISION = { width: 1024, height: 1280 };
const ROM_EXTENSION_PATTERN = new RegExp(String.raw`\S+\.` + "sfc" + String.raw`\b`, "g");

async function main(): Promise<void> {
  const tempOut = await mkdtemp(path.join(os.tmpdir(), "coilsnake-parity-"));
  try {
    const result = await convertProject({
      project: SOURCE_PROJECT,
      worldMode: "full",
      out: tempOut,
      battle: true,
      characters: true,
      items: true,
      shops: true
    });

    if (!("mode" in result.world) || result.world.mode !== "full") {
      printRows([
        {
          check: "Full-world mode",
          value: "not emitted",
          expected: "mode full",
          status: "FAIL",
          hard: true
        }
      ]);
      console.log("PARITY: FAIL");
      process.exitCode = 1;
      return;
    }

    const world = result.world;
    const source = await readSourceFixture();
    const dialogue = countDialogueResolution(world, result);
    const rows = buildRows(world, result, source, dialogue);
    const summary = buildSummary(world, result, source, dialogue, rows);
    printRows(rows);

    const hardFailures = rows.filter((row) => row.hard && row.status === "FAIL");
    const parity = hardFailures.length === 0 ? "PASS" : "FAIL";
    console.log(`PARITY: ${parity}`);
    console.log(JSON.stringify(summary));
    process.exitCode = parity === "PASS" ? 0 : 1;
  } catch (error) {
    console.error(sanitize(String(error instanceof Error ? error.message : error)));
    console.log("PARITY: FAIL");
    process.exitCode = 1;
  } finally {
    await rm(tempOut, { recursive: true, force: true });
  }
}

async function readSourceFixture(): Promise<SourceFixture> {
  const [mapSpritesSource, mapDoorsSource, mapTilesSource, npcConfigSource, teleportDestinationSource, scripts] = await Promise.all([
    readFile(path.join(SOURCE_PROJECT, "map_sprites.yml"), "utf8"),
    readFile(path.join(SOURCE_PROJECT, "map_doors.yml"), "utf8"),
    readFile(path.join(SOURCE_PROJECT, "map_tiles.map"), "utf8"),
    readFile(path.join(SOURCE_PROJECT, "npc_config_table.yml"), "utf8"),
    readFile(path.join(SOURCE_PROJECT, "teleport_destination_table.yml"), "utf8"),
    readSourceScriptCounts()
  ]);
  const placements = parseMapSprites(mapSpritesSource);
  const npcConfig = parseIntKeyedYaml(npcConfigSource);
  const mapRows = parseMapTiles(mapTilesSource);
  const visibleAtStart = placements.filter((placement) => {
    const config = npcConfig.get(placement.npcId);
    const eventFlag = parseOptionalEventFlag(config?.["Event Flag"]);
    return isNpcVisibleAtAllClear(config?.["Show Sprite"], eventFlag);
  }).length;
  return {
    npcCount: placements.length,
    visibleAtStart,
    hiddenAtStart: placements.length - visibleAtStart,
    doorTypes: countDoorTypes(parseMapDoors(mapDoorsSource)),
    mapWidthTiles: mapRows[0]?.length ?? 0,
    mapHeightTiles: mapRows.length,
    scripts,
    teleportDestinations: parseTeleportDestinationTable(teleportDestinationSource).length
  };
}

function buildRows(
  world: WorldChunked,
  result: ConvertResult,
  source: SourceFixture,
  dialogue: DialogueResolutionCounts
): Row[] {
  const rows: Row[] = [];
  const generatedDoorTypes = countDoorTypes(world.doors);
  const requiredSheetGroups = new Set<number>([world.player.spriteGroup]);
  for (const npc of world.npcs) {
    if (npc.visible && npc.spriteGroup !== undefined) {
      requiredSheetGroups.add(npc.spriteGroup);
    }
  }
  const visibleMissingSheets = world.npcs.filter((npc) => npc.visible && !npc.sheet);
  const totalChunks = world.counts.chunks;
  const generatedScriptCounts = result.scripts.counts;
  const generatedHiddenNpcs = world.counts.npcs - world.counts.visibleNpcs;
  const battle = result.battle;
  const enemyActionCount = battle?.enemies.reduce((total, enemy) => total + enemy.actions.length, 0) ?? 0;
  const missingDecodedActions = battle?.enemies
    .flatMap((enemy) => enemy.actions)
    .filter((action) => action.actionType === undefined || action.target === undefined)
    .length ?? 0;
  const bossCount = battle?.enemies.filter((enemy) => enemy.bossFlag).length ?? 0;

  rows.push({
    check: "NPC placements",
    value: String(world.counts.npcs),
    expected: `${source.npcCount} source placements`,
    status: world.counts.npcs === source.npcCount ? "PASS" : "FAIL"
  });
  rows.push({
    check: "NPC visibility model",
    value: `${world.counts.visibleNpcs} visible / ${generatedHiddenNpcs} hidden`,
    expected: `${source.visibleAtStart} visible / ${source.hiddenAtStart} hidden from 3-rule source model`,
    status: world.counts.visibleNpcs === source.visibleAtStart && generatedHiddenNpcs === source.hiddenAtStart
      ? "PASS"
      : "FAIL"
  });
  rows.push({
    check: "NPC dialogue resolution",
    value: `${dialogue.resolvedWithPages} resolved / ${dialogue.interactableTextPointers} interactable pointers`,
    expected: `${dialogue.unresolvedOrEmpty} unresolved-or-empty via flow resolver`,
    status: "INFO"
  });
  rows.push({
    check: "Script extraction",
    value: `${generatedScriptCounts.files} files / ${generatedScriptCounts.labels} labels / ${generatedScriptCounts.textCommands} text commands`,
    expected: `${source.scripts.files} source files / ${source.scripts.labels} source labels / ${source.scripts.textCommands} source text commands`,
    status: generatedScriptCounts.files === source.scripts.files &&
      generatedScriptCounts.labels === source.scripts.labels &&
      generatedScriptCounts.textCommands === source.scripts.textCommands
      ? "PASS"
      : "FAIL"
  });

  for (const type of sortedKeys({ ...source.doorTypes, ...generatedDoorTypes })) {
    const emitted = generatedDoorTypes[type] ?? 0;
    const expected = source.doorTypes[type] ?? 0;
    const supported = type === "door" || type === "stairway" || type === "escalator";
    rows.push({
      check: `Doors: ${type}`,
      value: String(emitted),
      expected: supported ? String(expected) : `${expected} source (${type} not emitted by runtime door schema)`,
      status: supported ? (emitted === expected ? "PASS" : "FAIL") : "INFO",
      hard: type === "door"
    });
  }

  rows.push({
    check: "Chunk grid",
    value: `${world.counts.chunksWritten} written / ${world.counts.voidChunks} void / ${totalChunks} total`,
    expected: `${EXPECTED_CHUNKS} total`,
    status: totalChunks === EXPECTED_CHUNKS ? "PASS" : "FAIL",
    hard: true
  });
  rows.push({
    check: "Sprite sheets emitted",
    value: `${result.sprites.counts.sheets} sheets; ${visibleMissingSheets.length} visible NPCs missing sheets`,
    expected: `${requiredSheetGroups.size} required groups; 0 missing`,
    status: result.sprites.counts.sheets === requiredSheetGroups.size && visibleMissingSheets.length === 0 ? "PASS" : "FAIL",
    hard: true
  });
  rows.push({
    check: "Collision grid",
    value: `${world.collision.width}x${world.collision.height}`,
    expected: `${EXPECTED_COLLISION.width}x${EXPECTED_COLLISION.height}`,
    status: world.collision.width === EXPECTED_COLLISION.width && world.collision.height === EXPECTED_COLLISION.height
      ? "PASS"
      : "FAIL",
    hard: true
  });
  rows.push({
    check: "Map dimensions",
    value: `${world.mapWidthTiles}x${world.mapHeightTiles} tiles`,
    expected: `${source.mapWidthTiles}x${source.mapHeightTiles} source tiles`,
    status: world.mapWidthTiles === source.mapWidthTiles && world.mapHeightTiles === source.mapHeightTiles
      ? "PASS"
      : "FAIL"
  });
  rows.push({
    check: "Battle extracts",
    value: `${battle?.counts.enemies ?? 0} enemies / ${bossCount} bosses / ${battle?.counts.groups ?? 0} groups`,
    expected: ">0 enemies / >0 bosses / >0 groups",
    status: (battle?.counts.enemies ?? 0) > 0 && bossCount > 0 && (battle?.counts.groups ?? 0) > 0 ? "PASS" : "FAIL"
  });
  rows.push({
    check: "Enemy actions decoded",
    value: `${enemyActionCount - missingDecodedActions} decoded / ${enemyActionCount} total; ${missingDecodedActions} missingDecoded`,
    expected: "0 missingDecoded",
    status: missingDecodedActions === 0 ? "PASS" : "FAIL",
    hard: true
  });
  rows.push({
    check: "Characters extracted",
    value: `${result.characters?.counts.characters ?? 0} characters / ${result.characters?.counts.statFieldsPopulated ?? 0} stat fields`,
    expected: ">0 characters with populated stat fields",
    status: (result.characters?.counts.characters ?? 0) > 0 && (result.characters?.counts.statFieldsPopulated ?? 0) > 0
      ? "PASS"
      : "FAIL",
    hard: true
  });
  rows.push({
    check: "Items extracted",
    value: `${result.items?.counts.items ?? 0} items / ${result.items?.counts.equippable ?? 0} equippable`,
    expected: ">0 items / >0 equippable",
    status: (result.items?.counts.items ?? 0) > 0 && (result.items?.counts.equippable ?? 0) > 0 ? "PASS" : "FAIL"
  });
  rows.push({
    check: "PSI extracted",
    value: `${result.psi?.counts.psi ?? 0} psi / ${result.psi?.counts.learnedBy ?? 0} learnedBy entries`,
    expected: ">0 psi / >0 learnedBy entries",
    status: (result.psi?.counts.psi ?? 0) > 0 && (result.psi?.counts.learnedBy ?? 0) > 0 ? "PASS" : "FAIL"
  });
  rows.push({
    check: "Shops extracted",
    value: `${result.shops?.counts.shops ?? 0} shops / ${result.shops?.counts.entries ?? 0} store-item entries`,
    expected: ">0 shops / >0 store-item entries",
    status: (result.shops?.counts.shops ?? 0) > 0 && (result.shops?.counts.entries ?? 0) > 0 ? "PASS" : "FAIL"
  });
  rows.push({
    check: "Teleport destinations",
    value: String(result.teleportDestinations?.counts.destinations ?? 0),
    expected: `${source.teleportDestinations} source destinations`,
    status: (result.teleportDestinations?.counts.destinations ?? 0) === source.teleportDestinations ? "PASS" : "FAIL"
  });

  return rows;
}

function countDialogueResolution(world: WorldChunked, result: ConvertResult): DialogueResolutionCounts {
  const interactablePointers = world.npcs
    .map((npc) => npc.interactable ? npc.textPointer : undefined)
    .filter((pointer): pointer is string => Boolean(pointer));
  let resolvedWithPages = 0;
  for (const pointer of interactablePointers) {
    const flow = resolveScriptReferenceFlow(result.scripts, pointer);
    if (!flow) {
      continue;
    }
    const pages = buildDialoguePages(flow.commands);
    if (pages.some((page) =>
      page.segments?.some((segment) => segment.kind === "text" && segment.value.trim().length > 0)
    )) {
      resolvedWithPages += 1;
    }
  }
  return {
    interactableTextPointers: interactablePointers.length,
    resolvedWithPages,
    unresolvedOrEmpty: interactablePointers.length - resolvedWithPages
  };
}

function buildSummary(
  world: WorldChunked,
  result: ConvertResult,
  source: SourceFixture,
  dialogue: DialogueResolutionCounts,
  rows: Row[]
): Record<string, unknown> {
  const generatedDoorTypes = countDoorTypes(world.doors);
  const battle = result.battle;
  const enemyActions = battle?.enemies.flatMap((enemy) => enemy.actions) ?? [];
  return {
    hardFailures: rows.filter((row) => row.hard && row.status === "FAIL").length,
    scripts: {
      files: result.scripts.counts.files,
      sourceFiles: source.scripts.files,
      commands: result.scripts.counts.commands,
      sourceCommands: source.scripts.commands,
      labels: result.scripts.counts.labels,
      sourceLabels: source.scripts.labels,
      textCommands: result.scripts.counts.textCommands,
      sourceTextCommands: source.scripts.textCommands,
      unknownCommands: result.scripts.counts.unknownCommands,
      sourceUnknownCommands: source.scripts.unknownCommands
    },
    npcs: {
      placements: world.counts.npcs,
      sourcePlacements: source.npcCount,
      visibleAtStart: world.counts.visibleNpcs,
      sourceVisibleAtStart: source.visibleAtStart,
      hiddenAtStart: world.counts.npcs - world.counts.visibleNpcs,
      sourceHiddenAtStart: source.hiddenAtStart,
      interactableTextPointers: dialogue.interactableTextPointers,
      dialogueResolved: dialogue.resolvedWithPages,
      dialogueUnresolvedOrEmpty: dialogue.unresolvedOrEmpty
    },
    doors: {
      emitted: world.counts.doors,
      sourceDoorType: source.doorTypes.door ?? 0,
      emittedDoorType: generatedDoorTypes.door ?? 0
    },
    world: {
      chunks: world.counts.chunks,
      chunksWritten: world.counts.chunksWritten,
      voidChunks: world.counts.voidChunks,
      chunkFiles: world.counts.chunkFiles,
      collisionWidth: world.collision.width,
      collisionHeight: world.collision.height,
      mapWidthTiles: world.mapWidthTiles,
      mapHeightTiles: world.mapHeightTiles,
      spriteSheets: result.sprites.counts.sheets,
      visibleMissingSheets: world.npcs.filter((npc) => npc.visible && !npc.sheet).length
    },
    battle: {
      enemies: battle?.counts.enemies ?? 0,
      bosses: battle?.enemies.filter((enemy) => enemy.bossFlag).length ?? 0,
      groups: battle?.counts.groups ?? 0,
      enemyActions: enemyActions.length,
      missingDecoded: enemyActions.filter((action) => action.actionType === undefined || action.target === undefined).length
    },
    characters: {
      characters: result.characters?.counts.characters ?? 0,
      statFieldsPopulated: result.characters?.counts.statFieldsPopulated ?? 0
    },
    items: {
      items: result.items?.counts.items ?? 0,
      equippable: result.items?.counts.equippable ?? 0
    },
    psi: {
      psi: result.psi?.counts.psi ?? 0,
      learnedBy: result.psi?.counts.learnedBy ?? 0
    },
    shops: {
      shops: result.shops?.counts.shops ?? 0,
      storeItemEntries: result.shops?.counts.entries ?? 0
    },
    teleportDestinations: {
      destinations: result.teleportDestinations?.counts.destinations ?? 0,
      sourceDestinations: source.teleportDestinations
    }
  };
}

function countDoorTypes(doors: Array<Pick<WorldDoor, "type">> | Array<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const door of doors) {
    counts[door.type] = (counts[door.type] ?? 0) + 1;
  }
  return counts;
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort((a, b) => a.localeCompare(b));
}

function parseOptionalEventFlag(value: string | undefined): number | undefined {
  const parsed = parseYamlInteger(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

async function readSourceScriptCounts(): Promise<ScriptSourceCounts> {
  const ccscriptRoot = path.join(SOURCE_PROJECT, "ccscript");
  const files = (await walkFiles(ccscriptRoot))
    .filter((file) => file.endsWith(".ccs"))
    .sort((a, b) => a.localeCompare(b));
  const totals: ScriptSourceCounts = {
    files: files.length,
    commands: 0,
    labels: 0,
    textCommands: 0,
    unknownCommands: 0
  };
  for (const file of files) {
    const relativePath = toPosix(path.relative(SOURCE_PROJECT, file));
    const parsed = parseCcsFile(relativePath, await readFile(file, "utf8"));
    totals.commands += parsed.commands.length;
    totals.labels += parsed.labels.length;
    totals.textCommands += parsed.commands.filter((command) => command.cmd === "text").length;
    totals.unknownCommands += parsed.commands.filter((command) => command.cmd === "unknown").length;
  }
  return totals;
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(resolved) : [resolved];
  }));
  return files.flat();
}

function toPosix(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
}

function printRows(rows: Row[]): void {
  const headers = ["Check", "Value", "Expected", "Status"];
  const body = rows.map((row) => [row.check, row.value, row.expected, row.status]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index].length))
  );
  const print = (cells: string[]) => {
    console.log(`| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`);
  };
  print(headers);
  console.log(`| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`);
  for (const row of body) {
    print(row);
  }
}

function sanitize(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+(?:\/[^\s]*)?/g, "<local-path>")
    .replace(/EarthBound \(USA\)/g, "<rom>")
    .replace(ROM_EXTENSION_PATTERN, "<rom-file>");
}

void main();
