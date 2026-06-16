import { describe, expect, it } from "vitest";
import type { WorldDoor } from "@eb/schemas";
import {
  doorAtFeet,
  feetInDoorCell,
  resolveAdjacentDoorIntentTrigger,
  resolveDoorWarpLanding,
  resolveDoorIntentTrigger,
  resolveDoorTrigger,
  type DoorTriggerResult,
  type DoorTriggerState
} from "../src/doorTriggers";
import type { CollisionGrid } from "../src/collisionOverlay";
import { PLAYER_FOOT_BOX } from "../src/collisionFootprint";

const GRID: CollisionGrid = { cellSize: 8, width: 12, height: 12 };

const door: WorldDoor = {
  type: "door",
  worldPixel: { x: 536, y: 288 },
  destinationWorldPixel: { x: 640, y: 768 },
  direction: "up",
  eventFlag: "0x0",
  textPointer: "$0",
  style: 1
};

function rows(width: number, height: number, solidCells: Array<[number, number]>): string[] {
  const solid = new Set(solidCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => solid.has(`${x},${y}`) ? "1" : "0").join("")
  );
}

describe("door trigger cells", () => {
  it("matches any feet position inside the one 8px trigger cell", () => {
    expect(feetInDoorCell({ x: 536, y: 288 }, door, 8)).toBe(true);
    expect(feetInDoorCell({ x: 543.9, y: 295.9 }, door, 8)).toBe(true);
    expect(feetInDoorCell({ x: 544, y: 288 }, door, 8)).toBe(false);
    expect(feetInDoorCell({ x: 536, y: 296 }, door, 8)).toBe(false);
    expect(doorAtFeet({ x: 540, y: 292 }, [door], 8)).toBe(door);
  });
});

describe("door retrigger suppression", () => {
  it("triggers once, stays suppressed while on any door, then rearms after clearing", () => {
    let state = { suppressUntilClear: false };

    const first = resolveDoorTrigger({ x: 540, y: 292 }, [door], state, 8);
    expect(first.door).toBe(door);
    expect(first.suppressUntilClear).toBe(true);

    state = { suppressUntilClear: first.suppressUntilClear };
    const stillOnDoor = resolveDoorTrigger({ x: 541, y: 293 }, [door], state, 8);
    expect(stillOnDoor.door).toBeUndefined();
    expect(stillOnDoor.suppressUntilClear).toBe(true);

    state = { suppressUntilClear: stillOnDoor.suppressUntilClear };
    const cleared = resolveDoorTrigger({ x: 544, y: 293 }, [door], state, 8);
    expect(cleared.door).toBeUndefined();
    expect(cleared.suppressUntilClear).toBe(false);

    state = { suppressUntilClear: cleared.suppressUntilClear };
    const retrigger = resolveDoorTrigger({ x: 540, y: 292 }, [door], state, 8);
    expect(retrigger.door).toBe(door);
  });

  it("does not trigger immediately when a teleport lands on another door cell", () => {
    const destinationDoor: WorldDoor = {
      ...door,
      worldPixel: door.destinationWorldPixel,
      destinationWorldPixel: { x: 100, y: 100 }
    };

    const suppressed = resolveDoorTrigger({ x: 640, y: 768 }, [door, destinationDoor], { suppressUntilClear: true }, 8);

    expect(suppressed.door).toBeUndefined();
    expect(suppressed.suppressUntilClear).toBe(true);
  });
});

describe("door movement intent", () => {
  it("does not trigger without active movement into a door cell", () => {
    const result = resolveDoorIntentTrigger(
      { x: 552, y: 292 },
      { x: 552, y: 292 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(false);
  });

  it("does not trigger when the player was placed inside a door cell", () => {
    const result = resolveDoorIntentTrigger(
      { x: 540, y: 292 },
      { x: 541, y: 292 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(true);
  });

  it("triggers when intended movement enters a door cell", () => {
    const result = resolveDoorIntentTrigger(
      { x: 540, y: 296 },
      { x: 540, y: 295.5 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBe(door);
    expect(result.suppressUntilClear).toBe(true);
  });

  it("keeps walkable door cells reachable through active entry", () => {
    const result = resolveDoorIntentTrigger(
      { x: 535.5, y: 292 },
      { x: 536, y: 292 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBe(door);
    expect(result.suppressUntilClear).toBe(true);
  });

  it("does not trigger for non-door movement intent", () => {
    const result = resolveDoorIntentTrigger(
      { x: 552, y: 292 },
      { x: 553, y: 292 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(false);
  });

  it("does not retrigger while the player remains on a suppressed door cell", () => {
    const result = resolveDoorIntentTrigger(
      { x: 540, y: 292 },
      { x: 541, y: 292 },
      [door],
      { suppressUntilClear: true },
      8
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(true);
  });

  it("allows a new active entry after the player has cleared a just-warped guard", () => {
    const result = resolveDoorIntentTrigger(
      { x: 540, y: 296 },
      { x: 540, y: 295.5 },
      [door],
      { suppressUntilClear: true },
      8
    );

    expect(result.door).toBe(door);
    expect(result.suppressUntilClear).toBe(true);
  });
});

describe("adjacent door movement intent", () => {
  it("fires a door in the adjacent cell when the player presses toward it", () => {
    const result = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 296 },
      { dx: 0, dy: -1 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBe(door);
    expect(result.suppressUntilClear).toBe(true);
    expect(result.suppressedDoorCell).toEqual({ x: 67, y: 36 });
  });

  it("does not fire when pressing away from or parallel to the adjacent door cell", () => {
    const away = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 296 },
      { dx: 0, dy: 1 },
      [door],
      { suppressUntilClear: false },
      8
    );
    const parallel = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 296 },
      { dx: 1, dy: 0 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(away.door).toBeUndefined();
    expect(away.suppressUntilClear).toBe(false);
    expect(parallel.door).toBeUndefined();
    expect(parallel.suppressUntilClear).toBe(false);
  });

  it("does not fire while idle", () => {
    const result = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 296 },
      { dx: 0, dy: 0 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(false);
  });

  it("fires once while held into the same door cell and rearms after the approach clears", () => {
    let state: DoorTriggerState = { suppressUntilClear: false };

    const first = resolveAdjacentDoorIntentTrigger({ x: 540, y: 296 }, { dx: 0, dy: -1 }, [door], state, 8);
    expect(first.door).toBe(door);
    expect(first.suppressUntilClear).toBe(true);

    state = stateFrom(first);
    const held = resolveAdjacentDoorIntentTrigger({ x: 540, y: 296 }, { dx: 0, dy: -1 }, [door], state, 8);
    expect(held.door).toBeUndefined();
    expect(held.suppressUntilClear).toBe(true);

    state = stateFrom(held);
    const cleared = resolveAdjacentDoorIntentTrigger({ x: 540, y: 296 }, { dx: 1, dy: 0 }, [door], state, 8);
    expect(cleared.door).toBeUndefined();
    expect(cleared.suppressUntilClear).toBe(false);

    state = stateFrom(cleared);
    const retrigger = resolveAdjacentDoorIntentTrigger({ x: 540, y: 296 }, { dx: 0, dy: -1 }, [door], state, 8);
    expect(retrigger.door).toBe(door);
  });

  it("does not fire when the door is more than one cell away", () => {
    const result = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 304 },
      { dx: 0, dy: -1 },
      [door],
      { suppressUntilClear: false },
      8
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(false);
  });

  it("uses the preferred axis first for diagonal input", () => {
    const leftDoor: WorldDoor = {
      ...door,
      worldPixel: { x: 528, y: 296 },
      destinationWorldPixel: { x: 700, y: 768 }
    };

    const preferY = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 300 },
      { dx: -1, dy: -1, preferredAxis: "y" },
      [leftDoor, door],
      { suppressUntilClear: false },
      8
    );
    const preferX = resolveAdjacentDoorIntentTrigger(
      { x: 540, y: 300 },
      { dx: -1, dy: -1, preferredAxis: "x" },
      [leftDoor, door],
      { suppressUntilClear: false },
      8
    );

    expect(preferY.door).toBe(door);
    expect(preferX.door).toBe(leftDoor);
  });

  it("fires a set-back door when the pressed footprint can reach it through one gap cell", () => {
    const setBackDoor: WorldDoor = {
      ...door,
      worldPixel: { x: 32, y: 32 }
    };

    const result = resolveAdjacentDoorIntentTrigger(
      { x: 16, y: 32 },
      { dx: 1, dy: 0 },
      [setBackDoor],
      { suppressUntilClear: false },
      8,
      { footBox: PLAYER_FOOT_BOX }
    );

    expect(result.door).toBe(setBackDoor);
    expect(result.suppressUntilClear).toBe(true);
    expect(result.suppressedDoorCell).toEqual({ x: 4, y: 4 });
  });

  it("does not fire footprint-range doors to the side or behind", () => {
    const sideDoor: WorldDoor = {
      ...door,
      worldPixel: { x: 32, y: 48 }
    };
    const behindDoor: WorldDoor = {
      ...door,
      worldPixel: { x: 0, y: 32 }
    };

    const side = resolveAdjacentDoorIntentTrigger(
      { x: 16, y: 32 },
      { dx: 1, dy: 0 },
      [sideDoor],
      { suppressUntilClear: false },
      8,
      { footBox: PLAYER_FOOT_BOX }
    );
    const behind = resolveAdjacentDoorIntentTrigger(
      { x: 16, y: 32 },
      { dx: 1, dy: 0 },
      [behindDoor],
      { suppressUntilClear: false },
      8,
      { footBox: PLAYER_FOOT_BOX }
    );

    expect(side.door).toBeUndefined();
    expect(side.suppressUntilClear).toBe(false);
    expect(behind.door).toBeUndefined();
    expect(behind.suppressUntilClear).toBe(false);
  });

  it("does not fire a footprint-range door while idle", () => {
    const setBackDoor: WorldDoor = {
      ...door,
      worldPixel: { x: 32, y: 32 }
    };

    const result = resolveAdjacentDoorIntentTrigger(
      { x: 16, y: 32 },
      { dx: 0, dy: 0 },
      [setBackDoor],
      { suppressUntilClear: false },
      8,
      { footBox: PLAYER_FOOT_BOX }
    );

    expect(result.door).toBeUndefined();
    expect(result.suppressUntilClear).toBe(false);
  });

  it("debounces footprint-range door intent while the same press is held", () => {
    const setBackDoor: WorldDoor = {
      ...door,
      worldPixel: { x: 32, y: 32 }
    };

    const first = resolveAdjacentDoorIntentTrigger(
      { x: 16, y: 32 },
      { dx: 1, dy: 0 },
      [setBackDoor],
      { suppressUntilClear: false },
      8,
      { footBox: PLAYER_FOOT_BOX }
    );
    const held = resolveAdjacentDoorIntentTrigger(
      { x: 16, y: 32 },
      { dx: 1, dy: 0 },
      [setBackDoor],
      stateFrom(first),
      8,
      { footBox: PLAYER_FOOT_BOX }
    );

    expect(first.door).toBe(setBackDoor);
    expect(held.door).toBeUndefined();
    expect(held.suppressUntilClear).toBe(true);
    expect(held.suppressedDoorCell).toEqual({ x: 4, y: 4 });
  });
});

describe("door warp landing guard", () => {
  it("keeps an unrecoverably solid destination from moving the player while consuming the door press", () => {
    const invalidDestinationDoor: WorldDoor = {
      ...door,
      destinationWorldPixel: { x: 34, y: 35 }
    };
    const allSolidRows = rows(GRID.width, GRID.height, Array.from({ length: GRID.width * GRID.height }, (_, index) => [
      index % GRID.width,
      Math.floor(index / GRID.width)
    ]));
    const player = { x: 540, y: 296 };

    const trigger = resolveAdjacentDoorIntentTrigger(
      player,
      { dx: 0, dy: -1 },
      [invalidDestinationDoor],
      { suppressUntilClear: false },
      GRID.cellSize
    );
    const landing = resolveDoorWarpLanding(
      invalidDestinationDoor.destinationWorldPixel,
      allSolidRows,
      GRID,
      { maxRingCells: 2 }
    );
    const finalPlayer = landing.walkable ? landing.point : player;

    expect(trigger.door).toBe(invalidDestinationDoor);
    expect(trigger.suppressUntilClear).toBe(true);
    expect(trigger.suppressedDoorCell).toEqual({ x: 67, y: 36 });
    expect(landing.walkable).toBe(false);
    expect(landing.point).toEqual(invalidDestinationDoor.destinationWorldPixel);
    expect(finalPlayer).toEqual(player);
  });

  it("keeps a snap-recoverable destination warping to the recovered walkable point", () => {
    const solidRows = rows(GRID.width, GRID.height, [[4, 4]]);
    const destination = { x: 34, y: 35 };

    const landing = resolveDoorWarpLanding(destination, solidRows, GRID, { maxRingCells: 4 });

    expect(landing.walkable).toBe(true);
    expect(landing.point).not.toEqual(destination);
  });
});

function stateFrom(result: DoorTriggerResult): DoorTriggerState {
  return result.suppressedDoorCell
    ? { suppressUntilClear: result.suppressUntilClear, suppressedDoorCell: result.suppressedDoorCell }
    : { suppressUntilClear: result.suppressUntilClear };
}
