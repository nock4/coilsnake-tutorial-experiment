import {
  sectorCoordForWorldPixel,
  type SectorAreaMetadata
} from "./roomBounds";

export type OverworldMusicCue = "intro" | "overworld" | "interior";

export function overworldMusicCueForInteriorState(inInterior: boolean, introActive = false): OverworldMusicCue {
  if (introActive) {
    return "intro";
  }
  return inInterior ? "interior" : "overworld";
}

export function isInteriorMusicSector(
  sectors: SectorAreaMetadata | undefined,
  point: { x: number; y: number }
): boolean {
  if (!sectors) {
    return false;
  }
  const sector = sectorCoordForWorldPixel(point, sectors);
  if (!sector) {
    return false;
  }
  return sectors.bounded[sector.index] === 1 || sectors.indoor[sector.index] === 1;
}
