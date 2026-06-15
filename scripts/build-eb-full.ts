import { pathToFileURL } from "node:url";
import {
  EB_FULL_WORLD_OUT,
  buildEbFullWorldDefault
} from "./build-eb-fullworld";

/**
 * Back-compat alias for the canonical complete generated-data build.
 * Keep this script name for existing docs and muscle memory.
 */
export const buildEbFull = buildEbFullWorldDefault;

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
