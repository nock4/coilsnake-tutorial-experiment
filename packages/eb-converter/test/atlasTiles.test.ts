import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FTS_ARRANGEMENT_COUNT, parseFts } from "../src/fts";
import { parseIntKeyedYaml, parseMapTiles } from "../src/coilsnakeYaml";
import { deriveArrangementCollision, loadTilesetGraphics, tallyMapUsage } from "../../../scripts/atlas/extract-tiles";

describe("tile atlas extractor", () => {
  it("parses a real tileset and derives solid arrangement metadata", async () => {
    const source = await readFile(path.join("external/coilsnake-full/Tilesets/01.fts"), "utf8");
    const tileset = parseFts(source);

    expect(tileset.arrangements).toHaveLength(FTS_ARRANGEMENT_COUNT * 16);
    expect(tileset.palettes.length).toBeGreaterThan(0);

    const solidArrangement = Array.from({ length: FTS_ARRANGEMENT_COUNT }, (_, arrangement) => ({
      arrangement,
      collision: deriveArrangementCollision(tileset, arrangement)
    })).find((entry) => entry.collision.solidCells > 0);

    expect(solidArrangement).toBeDefined();
    expect(solidArrangement?.collision.solidCells).toBeGreaterThan(0);
  });

  it("tallies full-map usage with non-negative counts and sane totals", async () => {
    const project = path.join("external/coilsnake-full");
    const [graphicsByMapTileset, mapTilesSource, mapSectorsSource] = await Promise.all([
      loadTilesetGraphics(path.join(project, "Tilesets")),
      readFile(path.join(project, "map_tiles.map"), "utf8"),
      readFile(path.join(project, "map_sectors.yml"), "utf8")
    ]);

    const usage = tallyMapUsage({
      mapRows: parseMapTiles(mapTilesSource),
      sectorEntries: parseIntKeyedYaml(mapSectorsSource),
      graphicsByMapTileset
    });

    const usageCounts = [...usage.usageByTileset.values()].flatMap((byArrangement) =>
      [...byArrangement.values()].map((entry) => entry.usageCount)
    );
    const totalUsage = usageCounts.reduce((sum, count) => sum + count, 0);

    expect(usage.mapTilesets).toHaveLength(31);
    expect(usage.mapCellCount).toBe(256 * 320);
    expect(usage.talliedCellCount).toBe(usage.mapCellCount);
    expect(totalUsage).toBe(usage.mapCellCount);
    expect(Math.min(...usageCounts)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...usageCounts)).toBeGreaterThan(1000);
  });
});
