import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS,
  DEFAULT_MAX_INTERIOR_WALKABLE_CELLS,
  resolveConnectedRoomBounds
} from "../src/roomBounds";
import type { CollisionGrid } from "../src/collisionOverlay";

function rows(width: number, height: number, walkableCells: Array<[number, number]>): string[] {
  const walkable = new Set(walkableCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => walkable.has(`${x},${y}`) ? "0" : "1").join("")
  );
}

function rectCells(minX: number, minY: number, width: number, height: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let y = minY; y < minY + height; y += 1) {
    for (let x = minX; x < minX + width; x += 1) {
      cells.push([x, y]);
    }
  }
  return cells;
}

describe("connected room bounds", () => {
  it("returns a small room bounding box and classifies it as an interior", () => {
    const grid: CollisionGrid = { cellSize: 8, width: 16, height: 16 };
    const solidRows = rows(grid.width, grid.height, rectCells(4, 6, 5, 3));

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 5 * 8 + 1, y: 7 * 8 + 1 }, {
      visualPaddingCells: { left: 1, right: 2, top: 3, bottom: 0 }
    });

    expect(bounds?.isInterior).toBe(true);
    expect(bounds?.walkableCells).toBe(15);
    expect(bounds?.walkableCellBounds).toMatchObject({
      minCellX: 4,
      maxCellX: 8,
      minCellY: 6,
      maxCellY: 8,
      widthCells: 5,
      heightCells: 3,
      areaCells: 15
    });
    expect(bounds?.rect).toEqual({ x: 24, y: 24, width: 64, height: 48 });
  });

  it("keeps a large open component classified as overworld", () => {
    const widthCells = DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS + 1;
    const grid: CollisionGrid = { cellSize: 8, width: widthCells, height: 1 };
    const solidRows = rows(grid.width, grid.height, rectCells(0, 0, widthCells, 1));

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 4, y: 4 });

    expect(bounds?.isInterior).toBe(false);
    expect(bounds?.walkableCells).toBe(DEFAULT_MAX_INTERIOR_WALKABLE_CELLS + 4097);
    expect(bounds?.walkableCellBounds.areaCells).toBe(DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS + 1);
  });

  it("excludes a neighboring room separated by solid void cells", () => {
    const grid: CollisionGrid = { cellSize: 8, width: 18, height: 10 };
    const solidRows = rows(grid.width, grid.height, [
      ...rectCells(2, 2, 4, 4),
      ...rectCells(9, 2, 4, 4)
    ]);

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 3 * 8 + 1, y: 3 * 8 + 1 }, {
      visualPaddingCells: { left: 0, right: 0, top: 0, bottom: 0 }
    });

    expect(bounds?.isInterior).toBe(true);
    expect(bounds?.walkableCells).toBe(16);
    expect(bounds?.walkableCellBounds).toMatchObject({
      minCellX: 2,
      maxCellX: 5,
      minCellY: 2,
      maxCellY: 5
    });
    expect(bounds?.rect).toEqual({ x: 16, y: 16, width: 32, height: 32 });
  });
});
