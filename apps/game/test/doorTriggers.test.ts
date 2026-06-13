import { describe, expect, it } from "vitest";
import type { WorldDoor } from "@eb/schemas";
import { doorAtFeet, feetInDoorCell, resolveDoorTrigger } from "../src/doorTriggers";

const door: WorldDoor = {
  type: "door",
  worldPixel: { x: 536, y: 288 },
  destinationWorldPixel: { x: 640, y: 768 },
  direction: "up",
  eventFlag: "0x0",
  textPointer: "$0",
  style: 1
};

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
