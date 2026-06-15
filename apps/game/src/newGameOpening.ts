import { resolveScriptReference, type ScriptCollection, type WorldChunked, type WorldDoor } from "@eb/schemas";
import { resolveDoorWarpLanding } from "./doorTriggers";

export const EARTHBOUND_OPENING_KNOCK_REF = "data_20.l_0xc66b97";

export type WorldPoint = { x: number; y: number };

export type NewGameOpeningStart = {
  eventRef: string;
  spawn: WorldPoint;
  derivation: string;
};

export type NewGameOpeningDecision =
  | { runOpening: true; start: NewGameOpeningStart }
  | { runOpening: false; fallbackReason: "disabled" | "not_new_game" | "unresolved_opening" };

export type ResolvedNewGameOpening =
  | { resolved: true; start: NewGameOpeningStart }
  | { resolved: false; reason: "missing_world" | "missing_script" | "missing_house_entry" | "missing_upstairs_door" | "unwalkable_spawn" };

export function decideNewGameOpening(options: {
  newGame: boolean;
  disabled: boolean;
  resolvedStart?: NewGameOpeningStart;
}): NewGameOpeningDecision {
  if (options.disabled) {
    return { runOpening: false, fallbackReason: "disabled" };
  }
  if (!options.newGame) {
    return { runOpening: false, fallbackReason: "not_new_game" };
  }
  if (!options.resolvedStart) {
    return { runOpening: false, fallbackReason: "unresolved_opening" };
  }
  return { runOpening: true, start: options.resolvedStart };
}

export function resolveNewGameOpeningStart(
  world: WorldChunked | undefined,
  scripts: ScriptCollection | undefined,
  eventRef = EARTHBOUND_OPENING_KNOCK_REF
): ResolvedNewGameOpening {
  if (!world) {
    return { resolved: false, reason: "missing_world" };
  }
  if (!scripts || !resolveScriptReference(scripts, eventRef)) {
    return { resolved: false, reason: "missing_script" };
  }

  const houseEntry = nearestDoor(world.doors, world.player.spawnWorldPixel, {
    maxDistance: world.tileSize * 32
  });
  if (!houseEntry) {
    return { resolved: false, reason: "missing_house_entry" };
  }

  const upstairsDoor = nearestDoor(world.doors, houseEntry.destinationWorldPixel, {
    maxDistance: world.tileSize * 64,
    maxHorizontalOffset: world.tileSize * 4,
    above: true,
    exclude: houseEntry
  });
  if (!upstairsDoor) {
    return { resolved: false, reason: "missing_upstairs_door" };
  }

  const landing = resolveDoorWarpLanding(
    upstairsDoor.destinationWorldPixel,
    world.collision.solidRows,
    {
      cellSize: world.collision.cellSize,
      width: world.collision.width,
      height: world.collision.height
    },
    { maxRingCells: 8 }
  );
  if (!landing.walkable) {
    return { resolved: false, reason: "unwalkable_spawn" };
  }

  return {
    resolved: true,
    start: {
      eventRef,
      spawn: landing.point,
      derivation: "nearest canonical-start house door, same-column upstairs door, walkable landing"
    }
  };
}

function nearestDoor(
  doors: readonly WorldDoor[],
  point: WorldPoint,
  options: {
    maxDistance: number;
    maxHorizontalOffset?: number;
    above?: boolean;
    exclude?: WorldDoor;
  }
): WorldDoor | undefined {
  let best: { door: WorldDoor; distanceSq: number } | undefined;
  const maxDistanceSq = options.maxDistance ** 2;
  for (const door of doors) {
    if (door === options.exclude) {
      continue;
    }
    const dx = door.worldPixel.x - point.x;
    const dy = door.worldPixel.y - point.y;
    if (options.above && dy >= 0) {
      continue;
    }
    if (options.maxHorizontalOffset !== undefined && Math.abs(dx) > options.maxHorizontalOffset) {
      continue;
    }
    const distanceSq = dx ** 2 + dy ** 2;
    if (distanceSq > maxDistanceSq) {
      continue;
    }
    if (!best || distanceSq < best.distanceSq) {
      best = { door, distanceSq };
    }
  }
  return best?.door;
}
