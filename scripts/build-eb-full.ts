import { pathToFileURL } from "node:url";
import { DEFAULT_GENERATED_OUT } from "../packages/content-builder/src/build";
import { convertProject } from "../packages/eb-converter/src/index";
import {
  EB_FULL_WORLD_MODE,
  EB_FULL_WORLD_OUT,
  EB_FULL_WORLD_PROJECT
} from "./build-eb-fullworld";

/**
 * Builds the EB full-world WITH battle, characters, items, font, window, and
 * (derived) encounter data — i.e. everything needed to play the whole game,
 * including overworld encounters and battles. The default `build:eb-fullworld`
 * omits battle/encounter data; this is the "play everything" build behind
 * `pnpm dev:full`.
 */
export async function buildEbFull() {
  return convertProject({
    project: EB_FULL_WORLD_PROJECT,
    worldMode: EB_FULL_WORLD_MODE,
    out: EB_FULL_WORLD_OUT,
    battle: true,
    characters: true,
    items: true,
    font: true,
    window: true
  });
}

async function main(): Promise<void> {
  const result = await buildEbFull();
  const world = result.world;
  if (!("mode" in world && world.mode === "full")) {
    throw new Error("EB full build produced non-full world output.");
  }
  console.log(JSON.stringify({
    ok: result.manifest.errors.length === 0,
    out: EB_FULL_WORLD_OUT,
    counts: result.manifest.counts
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
