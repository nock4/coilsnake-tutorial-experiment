import { describe, expect, it } from "vitest";
import {
  isInteriorMusicSector,
  overworldMusicCueForInteriorState
} from "../src/worldMusic";
import type { SectorAreaMetadata } from "../src/roomBounds";

describe("overworld music cue selection", () => {
  it("selects interior music only while the player is in an interior", () => {
    expect(overworldMusicCueForInteriorState(false)).toBe("overworld");
    expect(overworldMusicCueForInteriorState(true)).toBe("interior");
    expect(overworldMusicCueForInteriorState(true, true)).toBe("intro");
  });

  it("classifies bounded sector areas as interiors for music", () => {
    const sectors: SectorAreaMetadata = {
      cols: 3,
      rows: 1,
      sectorWidthTiles: 10,
      sectorHeightTiles: 10,
      tileSize: 8,
      areaIds: [1, 2, 3],
      indoor: [0, 0, 1],
      bounded: [0, 1, 0]
    };

    expect(isInteriorMusicSector(sectors, { x: 4, y: 4 })).toBe(false);
    expect(isInteriorMusicSector(sectors, { x: 84, y: 4 })).toBe(true);
    expect(isInteriorMusicSector(sectors, { x: 164, y: 4 })).toBe(true);
    expect(isInteriorMusicSector(sectors, { x: 260, y: 4 })).toBe(false);
  });
});
