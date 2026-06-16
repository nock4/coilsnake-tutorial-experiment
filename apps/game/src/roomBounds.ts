import { worldPixelToCollisionCell, type CollisionGrid, type WorldRect } from "./collisionOverlay";

export type RoomBoundsOptions = {
  /**
   * Maximum connected walkable cells for a region to be treated as an interior.
   * EB interiors in the generated full-world artifact are a few hundred cells;
   * the Onett overworld component sampled from the spawn point is ~32k cells.
   */
  maxInteriorWalkableCells?: number;
  /** Maximum walkable bounding-box area in collision cells for interior classification. */
  maxInteriorBoundsAreaCells?: number;
  /** Extra rendered margin around the connected walkable floor, in collision cells. */
  visualPaddingCells?: Partial<RoomVisualPaddingCells>;
};

export type RoomVisualPaddingCells = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ConnectedRoomBounds = {
  startCell: { cellX: number; cellY: number };
  walkableCells: number;
  walkableCellBounds: {
    minCellX: number;
    maxCellX: number;
    minCellY: number;
    maxCellY: number;
    widthCells: number;
    heightCells: number;
    areaCells: number;
  };
  rect: WorldRect;
  isInterior: boolean;
};

export const DEFAULT_MAX_INTERIOR_WALKABLE_CELLS = 4096;
export const DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS = 8192;
export const DEFAULT_ROOM_VISUAL_PADDING_CELLS: RoomVisualPaddingCells = {
  left: 4,
  right: 4,
  top: 24,
  bottom: 0
};

export function resolveConnectedRoomBounds(
  solidRows: readonly string[],
  grid: CollisionGrid,
  startWorldPixel: { x: number; y: number },
  options: RoomBoundsOptions = {}
): ConnectedRoomBounds | undefined {
  const startCell = worldPixelToCollisionCell(startWorldPixel, grid.cellSize);
  if (
    !startCell ||
    !isCellInGrid(startCell.cellX, startCell.cellY, grid) ||
    isSolidCell(solidRows, startCell.cellX, startCell.cellY)
  ) {
    return undefined;
  }

  const seen = new Uint8Array(grid.width * grid.height);
  const queue: Array<{ cellX: number; cellY: number }> = [startCell];
  seen[startCell.cellY * grid.width + startCell.cellX] = 1;

  let cursor = 0;
  let walkableCells = 0;
  let minCellX = startCell.cellX;
  let maxCellX = startCell.cellX;
  let minCellY = startCell.cellY;
  let maxCellY = startCell.cellY;

  while (cursor < queue.length) {
    const cell = queue[cursor];
    cursor += 1;
    walkableCells += 1;
    minCellX = Math.min(minCellX, cell.cellX);
    maxCellX = Math.max(maxCellX, cell.cellX);
    minCellY = Math.min(minCellY, cell.cellY);
    maxCellY = Math.max(maxCellY, cell.cellY);

    enqueueWalkableNeighbor(cell.cellX + 1, cell.cellY);
    enqueueWalkableNeighbor(cell.cellX - 1, cell.cellY);
    enqueueWalkableNeighbor(cell.cellX, cell.cellY + 1);
    enqueueWalkableNeighbor(cell.cellX, cell.cellY - 1);
  }

  const widthCells = maxCellX - minCellX + 1;
  const heightCells = maxCellY - minCellY + 1;
  const areaCells = widthCells * heightCells;
  const maxWalkableCells = options.maxInteriorWalkableCells ?? DEFAULT_MAX_INTERIOR_WALKABLE_CELLS;
  const maxBoundsAreaCells = options.maxInteriorBoundsAreaCells ?? DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS;
  const isInterior = walkableCells <= maxWalkableCells && areaCells <= maxBoundsAreaCells;
  const padding = { ...DEFAULT_ROOM_VISUAL_PADDING_CELLS, ...options.visualPaddingCells };
  const visualMinCellX = clampCell(minCellX - padding.left, 0, grid.width - 1);
  const visualMaxCellX = clampCell(maxCellX + padding.right, 0, grid.width - 1);
  const visualMinCellY = clampCell(minCellY - padding.top, 0, grid.height - 1);
  const visualMaxCellY = clampCell(maxCellY + padding.bottom, 0, grid.height - 1);

  return {
    startCell,
    walkableCells,
    walkableCellBounds: {
      minCellX,
      maxCellX,
      minCellY,
      maxCellY,
      widthCells,
      heightCells,
      areaCells
    },
    rect: {
      x: visualMinCellX * grid.cellSize,
      y: visualMinCellY * grid.cellSize,
      width: (visualMaxCellX - visualMinCellX + 1) * grid.cellSize,
      height: (visualMaxCellY - visualMinCellY + 1) * grid.cellSize
    },
    isInterior
  };

  function enqueueWalkableNeighbor(cellX: number, cellY: number): void {
    if (!isCellInGrid(cellX, cellY, grid) || isSolidCell(solidRows, cellX, cellY)) {
      return;
    }
    const index = cellY * grid.width + cellX;
    if (seen[index]) {
      return;
    }
    seen[index] = 1;
    queue.push({ cellX, cellY });
  }
}

function isCellInGrid(cellX: number, cellY: number, grid: CollisionGrid): boolean {
  return (
    Number.isInteger(cellX) &&
    Number.isInteger(cellY) &&
    cellX >= 0 &&
    cellY >= 0 &&
    cellX < grid.width &&
    cellY < grid.height
  );
}

function isSolidCell(solidRows: readonly string[], cellX: number, cellY: number): boolean {
  return solidRows[cellY]?.[cellX] !== "0";
}

function clampCell(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
