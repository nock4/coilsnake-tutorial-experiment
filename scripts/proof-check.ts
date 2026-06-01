import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

type Snapshot = {
  schemaVersion: 1;
  generatedAt: string;
  fixtureRoot: "external/coilsnake-project";
  generatedRoot: "apps/game/public/generated";
  files: Array<{
    path: string;
    exists: boolean;
    bytes?: number;
    sha256?: string;
  }>;
  invariants: {
    npcTextPointerLines: number[];
    npc744Fields: Record<string, string>;
    npc744Placements: Array<{ line: number; x?: string; y?: string }>;
    mapDoorTextPointerCount: number;
    mapDoorNonZeroTextPointers: Array<{ line: number; value: string }>;
    mapDoorRobotHelloWorldLines: number[];
    generatedJsonFiles: string[];
  };
};

const projectRoot = process.cwd();
const fixtureRoot = path.join(projectRoot, "external", "coilsnake-project");
const generatedRoot = path.join(projectRoot, "apps", "game", "public", "generated");
const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function readText(relativePath: string): Promise<string | undefined> {
  const file = path.join(fixtureRoot, relativePath);
  if (!existsSync(file)) {
    return undefined;
  }
  return readFile(file, "utf8");
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function parseNpc744Fields(source: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^744:\s*$/.test(line));
  if (start < 0) {
    return fields;
  }
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\d+:\s*$/.test(line)) {
      break;
    }
    const match = /^  ([^:]+):\s*(.+?)\s*$/.exec(line);
    if (match) {
      fields[match[1]] = match[2].replace(/^"(.+)"$/, "$1");
    }
  }
  return fields;
}

function findNpc744Placements(source: string): Array<{ line: number; x?: string; y?: string }> {
  const lines = source.split(/\r?\n/);
  const placements: Array<{ line: number; x?: string; y?: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/NPC ID:\s*744\b/.test(lines[index])) {
      continue;
    }
    const placement: { line: number; x?: string; y?: string } = { line: index + 1 };
    for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
      const x = /^\s*X:\s*(.+?)\s*$/.exec(lines[index + offset]);
      const y = /^\s*Y:\s*(.+?)\s*$/.exec(lines[index + offset]);
      if (x) {
        placement.x = x[1];
      }
      if (y) {
        placement.y = y[1];
      }
    }
    placements.push(placement);
  }
  return placements;
}

export function isNeutralizedMapDoorPointer(value: string): boolean {
  return value.trim().replace(/^"(.+)"$/, "$1").replace(/^'(.+)'$/, "$1") === "$0";
}

function parseMapDoorPointers(source: string): Array<{ line: number; value: string }> {
  return [...source.matchAll(/Text Pointer:\s*(.+?)\s*$/gm)].map((match) => ({
    line: lineNumber(source, match.index ?? 0),
    value: match[1].trim()
  }));
}

async function checkGeneratedJsonSafety(): Promise<void> {
  if (!existsSync(generatedRoot)) {
    add("generated directory exists", false, "apps/game/public/generated is missing");
    return;
  }
  const files = (await readdir(generatedRoot)).filter((file) => file.endsWith(".json"));
  const unsafe: string[] = [];
  for (const file of files) {
    const text = await readFile(path.join(generatedRoot, file), "utf8");
    const match = /EarthBound \(USA\)|first-hack|\.sfc|\/Users\//.exec(text);
    if (match) {
      unsafe.push(`${file}: ${match[0]}`);
    }
  }
  add(
    "generated JSON has no ROM/path leaks",
    unsafe.length === 0,
    unsafe.length === 0 ? `${files.length} JSON files scanned` : unsafe.join("; ")
  );
}

async function main(): Promise<void> {
  add("local fixture exists", existsSync(fixtureRoot), "external/coilsnake-project");

  const npcConfig = await readText("npc_config_table.yml");
  add("npc_config_table.yml exists", Boolean(npcConfig), "required for NPC pointer proof");
  if (npcConfig) {
    const pointerMatches = [...npcConfig.matchAll(/Text Pointer 1:\s*robot\.hello_world\b/g)];
    const fields = parseNpc744Fields(npcConfig);
    add(
      "exactly one NPC Text Pointer 1 routes robot.hello_world",
      pointerMatches.length === 1,
      pointerMatches.map((match) => `line ${lineNumber(npcConfig, match.index ?? 0)}`).join(", ") || "none"
    );
    add(
      "NPC 744 owns robot.hello_world",
      fields["Text Pointer 1"] === "robot.hello_world",
      `NPC 744 Text Pointer 1: ${fields["Text Pointer 1"] ?? "missing"}`
    );
    add("NPC 744 is person type", fields.Type === "person", `NPC 744 Type: ${fields.Type ?? "missing"}`);
    add("NPC 744 is visible", fields["Show Sprite"] === "always", `NPC 744 Show Sprite: ${fields["Show Sprite"] ?? "missing"}`);
  }

  const mapSprites = await readText("map_sprites.yml");
  add("map_sprites.yml exists", Boolean(mapSprites), "required for NPC placement proof");
  if (mapSprites) {
    const placements = findNpc744Placements(mapSprites);
    add(
      "exactly one NPC 744 placement exists",
      placements.length === 1,
      placements.map((placement) => `line ${placement.line}, X:${placement.x ?? "?"}, Y:${placement.y ?? "?"}`).join("; ") || "none"
    );
  }

  const mapDoors = await readText("map_doors.yml");
  add("map_doors.yml exists", Boolean(mapDoors), "required to reject object-text ambiguity");
  if (mapDoors) {
    const robotObjectRoutes = [...mapDoors.matchAll(/Text Pointer:\s*robot\.hello_world\b/g)];
    const textPointers = [...mapDoors.matchAll(/Text Pointer:\s*(.+?)\s*$/gm)];
    const nonZeroObjectRoutes = textPointers.filter((match) => {
      return !isNeutralizedMapDoorPointer(match[1]);
    });
    add(
      "no map-door object routes robot.hello_world",
      robotObjectRoutes.length === 0,
      robotObjectRoutes.map((match) => `line ${lineNumber(mapDoors, match.index ?? 0)}`).join(", ") || "none"
    );
    add(
      "map-door text pointers are neutralized",
      nonZeroObjectRoutes.length === 0,
      nonZeroObjectRoutes.slice(0, 8).map((match) => `line ${lineNumber(mapDoors, match.index ?? 0)}: ${match[1].trim()}`).join("; ") || "all $0"
    );
  }

  await checkGeneratedJsonSafety();

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function buildSnapshot(): Promise<Snapshot> {
  const fixtureFiles = [
    "Project.snake",
    "ccscript/robot.ccs",
    "tutorial-fixture-npc-reference.yml",
    "tutorial-run-proof.json",
    "npc_config_table.yml",
    "map_sprites.yml",
    "map_doors.yml"
  ];
  const generatedJsonFiles = existsSync(generatedRoot)
    ? (await readdir(generatedRoot)).filter((file) => file.endsWith(".json")).sort()
    : [];
  const files: Snapshot["files"] = [];
  for (const relativePath of fixtureFiles) {
    const source = await readText(relativePath);
    files.push({
      path: `external/coilsnake-project/${relativePath}`,
      exists: source !== undefined,
      ...(source === undefined ? {} : { bytes: Buffer.byteLength(source), sha256: sha256(source) })
    });
  }
  for (const file of generatedJsonFiles) {
    const source = await readFile(path.join(generatedRoot, file), "utf8");
    files.push({
      path: `apps/game/public/generated/${file}`,
      exists: true,
      bytes: Buffer.byteLength(source),
      sha256: sha256(source)
    });
  }

  const npcConfig = await readText("npc_config_table.yml") ?? "";
  const mapSprites = await readText("map_sprites.yml") ?? "";
  const mapDoors = await readText("map_doors.yml") ?? "";
  const mapDoorPointers = parseMapDoorPointers(mapDoors);
  const robotDoorRoutes = [...mapDoors.matchAll(/Text Pointer:\s*robot\.hello_world\b/g)];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureRoot: "external/coilsnake-project",
    generatedRoot: "apps/game/public/generated",
    files,
    invariants: {
      npcTextPointerLines: [...npcConfig.matchAll(/Text Pointer 1:\s*robot\.hello_world\b/g)]
        .map((match) => lineNumber(npcConfig, match.index ?? 0)),
      npc744Fields: parseNpc744Fields(npcConfig),
      npc744Placements: findNpc744Placements(mapSprites),
      mapDoorTextPointerCount: mapDoorPointers.length,
      mapDoorNonZeroTextPointers: mapDoorPointers.filter((pointer) => !isNeutralizedMapDoorPointer(pointer.value)),
      mapDoorRobotHelloWorldLines: robotDoorRoutes.map((match) => lineNumber(mapDoors, match.index ?? 0)),
      generatedJsonFiles
    }
  };
}

async function writeSnapshot(): Promise<void> {
  const outputArgIndex = process.argv.indexOf("--out");
  const outputPath = outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
    ? process.argv[outputArgIndex + 1]
    : ".codex/proof-snapshots/latest-fixture-snapshot.json";
  const snapshot = await buildSnapshot();
  const absoluteOutput = path.resolve(projectRoot, outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, snapshot: path.relative(projectRoot, absoluteOutput) }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const run = process.argv.includes("--snapshot") ? writeSnapshot : main;
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
