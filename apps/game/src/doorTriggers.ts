import type { WorldDoor } from "@eb/schemas";
import { resolveWalkableFootprintDestination, walkableFootprintClear, type FootBox } from "./collisionFootprint";
import type { CollisionGrid } from "./collisionOverlay";

export type DoorTriggerState = {
  suppressUntilClear: boolean;
  suppressedDoorCell?: DoorCell;
};

export type DoorTriggerResult = {
  door?: WorldDoor;
  suppressUntilClear: boolean;
  suppressedDoorCell?: DoorCell;
};

export type DoorCell = { x: number; y: number };

export type DoorIntentDirection = {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  preferredAxis?: "x" | "y";
};

export type DoorWarpLanding = {
  point: { x: number; y: number };
  walkable: boolean;
};

export function feetInDoorCell(
  feet: { x: number; y: number },
  door: Pick<WorldDoor, "worldPixel">,
  cellSize: number
): boolean {
  return (
    Math.floor(feet.x / cellSize) === Math.floor(door.worldPixel.x / cellSize) &&
    Math.floor(feet.y / cellSize) === Math.floor(door.worldPixel.y / cellSize)
  );
}

export function doorAtFeet(
  feet: { x: number; y: number },
  doors: readonly WorldDoor[],
  cellSize: number
): WorldDoor | undefined {
  return doors.find((door) => feetInDoorCell(feet, door, cellSize));
}

export function resolveDoorTrigger(
  feet: { x: number; y: number },
  doors: readonly WorldDoor[],
  state: DoorTriggerState,
  cellSize: number
): DoorTriggerResult {
  const currentDoor = doorAtFeet(feet, doors, cellSize);
  if (state.suppressUntilClear) {
    return doorResult(Boolean(currentDoor), undefined, state.suppressedDoorCell);
  }
  if (!currentDoor) {
    return { suppressUntilClear: false };
  }
  return { door: currentDoor, suppressUntilClear: true };
}

export function resolveAdjacentDoorIntentTrigger(
  currentFeet: { x: number; y: number },
  movement: DoorIntentDirection,
  doors: readonly WorldDoor[],
  state: DoorTriggerState,
  cellSize: number
): DoorTriggerResult {
  const currentDoor = doorAtFeet(currentFeet, doors, cellSize);
  if (state.suppressUntilClear) {
    if (state.suppressedDoorCell) {
      const suppressedDoorCell = state.suppressedDoorCell;
      const stillInSuppressedCell = sameCell(feetCell(currentFeet, cellSize), suppressedDoorCell);
      const stillPressingSuppressedCell = adjacentProbeCells(currentFeet, movement, cellSize)
        .some((cell) => sameCell(cell, suppressedDoorCell));
      return doorResult(stillInSuppressedCell || stillPressingSuppressedCell, undefined, suppressedDoorCell);
    }
    return { suppressUntilClear: Boolean(currentDoor) };
  }

  if (currentDoor) {
    return doorResult(true, undefined, doorCell(currentDoor, cellSize));
  }

  const adjacentDoor = adjacentProbeCells(currentFeet, movement, cellSize)
    .map((cell) => doorAtCell(cell, doors, cellSize))
    .find((door): door is WorldDoor => Boolean(door));
  if (!adjacentDoor) {
    return { suppressUntilClear: false };
  }
  return doorResult(true, adjacentDoor, doorCell(adjacentDoor, cellSize));
}

export function resolveDoorWarpLanding(
  destination: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  options: { maxRingCells?: number; box?: FootBox } = {}
): DoorWarpLanding {
  const point = resolveWalkableFootprintDestination(destination, solidRows, grid, options);
  return {
    point,
    walkable: walkableFootprintClear(point, solidRows, grid, options.box)
  };
}

export function resolveDoorIntentTrigger(
  currentFeet: { x: number; y: number },
  intendedFeet: { x: number; y: number },
  doors: readonly WorldDoor[],
  state: DoorTriggerState,
  cellSize: number
): DoorTriggerResult {
  const currentDoor = doorAtFeet(currentFeet, doors, cellSize);
  if (state.suppressUntilClear && currentDoor) {
    return doorResult(true, undefined, state.suppressedDoorCell ?? doorCell(currentDoor, cellSize));
  }
  if (currentDoor) {
    return doorResult(true, undefined, doorCell(currentDoor, cellSize));
  }

  const intendedDoor = doorAtFeet(intendedFeet, doors, cellSize);
  if (!intendedDoor) {
    return { suppressUntilClear: false };
  }
  if (sameDoorCell(currentFeet, intendedFeet, cellSize)) {
    return { suppressUntilClear: false };
  }
  return doorResult(true, intendedDoor, doorCell(intendedDoor, cellSize));
}

function sameDoorCell(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cellSize: number
): boolean {
  return Math.floor(a.x / cellSize) === Math.floor(b.x / cellSize)
    && Math.floor(a.y / cellSize) === Math.floor(b.y / cellSize);
}

function adjacentProbeCells(
  feet: { x: number; y: number },
  movement: DoorIntentDirection,
  cellSize: number
): DoorCell[] {
  if (movement.dx === 0 && movement.dy === 0) {
    return [];
  }

  const current = feetCell(feet, cellSize);
  if (movement.dx !== 0 && movement.dy === 0) {
    return [{ x: current.x + movement.dx, y: current.y }];
  }
  if (movement.dy !== 0 && movement.dx === 0) {
    return [{ x: current.x, y: current.y + movement.dy }];
  }

  const xCell: DoorCell = { x: current.x + movement.dx, y: current.y };
  const yCell: DoorCell = { x: current.x, y: current.y + movement.dy };
  const diagonalCell: DoorCell = { x: current.x + movement.dx, y: current.y + movement.dy };
  const axisCells = movement.preferredAxis === "y" ? [yCell, xCell] : [xCell, yCell];
  return [...axisCells, diagonalCell];
}

function doorAtCell(cell: DoorCell, doors: readonly WorldDoor[], cellSize: number): WorldDoor | undefined {
  return doors.find((door) => sameCell(doorCell(door, cellSize), cell));
}

function feetCell(feet: { x: number; y: number }, cellSize: number): DoorCell {
  return {
    x: Math.floor(feet.x / cellSize),
    y: Math.floor(feet.y / cellSize)
  };
}

function doorCell(door: Pick<WorldDoor, "worldPixel">, cellSize: number): DoorCell {
  return {
    x: Math.floor(door.worldPixel.x / cellSize),
    y: Math.floor(door.worldPixel.y / cellSize)
  };
}

function sameCell(a: DoorCell, b: DoorCell): boolean {
  return a.x === b.x && a.y === b.y;
}

function doorResult(
  suppressUntilClear: boolean,
  door?: WorldDoor,
  suppressedDoorCell?: DoorCell
): DoorTriggerResult {
  const result: DoorTriggerResult = { suppressUntilClear };
  if (door) {
    result.door = door;
  }
  if (suppressUntilClear && suppressedDoorCell) {
    result.suppressedDoorCell = suppressedDoorCell;
  }
  return result;
}
