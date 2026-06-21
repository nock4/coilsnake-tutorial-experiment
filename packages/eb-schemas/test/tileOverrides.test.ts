import { describe, expect, it } from "vitest";
import { TileOverridesSchema } from "../src/index";

describe("TileOverridesSchema", () => {
  it("parses byTile art keyed by map tileset and arrangement", () => {
    const parsed = TileOverridesSchema.parse({
      schema: "swagbound.tile-overrides.v1",
      comment: "Use usageCount in content/atlas/tiles.json to choose high-impact tiles.",
      byTile: {
        "0:42": {
          image: "assets/swagbound/tiles/sidewalk-001.png"
        }
      }
    });

    expect(parsed.byTile["0:42"].image).toBe("assets/swagbound/tiles/sidewalk-001.png");
  });

  it("rejects malformed tile keys and paths outside public assets", () => {
    expect(TileOverridesSchema.safeParse({
      schema: "swagbound.tile-overrides.v1",
      byTile: {
        "0x0:42": {
          image: "assets/swagbound/tiles/sidewalk-001.png"
        }
      }
    }).success).toBe(false);

    expect(TileOverridesSchema.safeParse({
      schema: "swagbound.tile-overrides.v1",
      byTile: {
        "0:42": {
          image: "../private/sidewalk.png"
        }
      }
    }).success).toBe(false);
  });
});
