import { readFile } from "node:fs/promises";

export type RomStartPixel = { x: number; y: number };

export const DEFAULT_EB_ROM_PATH = "EarthBound (USA).sfc";
export const EB_ROM_SIZE_BYTES = 3 * 1024 * 1024;

export const NEW_GAME_START_X_SNES_ADDRESS = 0xC1FE9E;
export const NEW_GAME_START_Y_SNES_ADDRESS = 0xC1FE9B;
export const SNES_HIROM_FILE_MASK = 0x3FFFFF;

// CoilSnake-master/coilsnake/assets/mobile-sprout/lib/std.ccs documents
// newgame_location(x, y) as writes to ROM[$C1FE9E] and ROM[$C1FE9B].
export const NEW_GAME_START_X_FILE_OFFSET = snesHiRomToFileOffset(NEW_GAME_START_X_SNES_ADDRESS);
export const NEW_GAME_START_Y_FILE_OFFSET = snesHiRomToFileOffset(NEW_GAME_START_Y_SNES_ADDRESS);

export const ROM_NEW_GAME_START_DERIVATION =
  "ROM-RE canonical new-game start from std.ccs newgame_location offsets $C1FE9E (X) / $C1FE9B (Y), mapped with unheadered HiROM file=addr&0x3FFFFF.";

export function snesHiRomToFileOffset(snesAddress: number): number {
  if (!Number.isInteger(snesAddress) || snesAddress < 0xC00000 || snesAddress > 0xFFFFFF) {
    throw new Error(`SNES HiROM address must be in banks $C0-$FF: 0x${snesAddress.toString(16)}`);
  }
  return snesAddress & SNES_HIROM_FILE_MASK;
}

export function parseEbNewGameStart(bytes: Uint8Array): RomStartPixel {
  assertReadableShort(bytes, NEW_GAME_START_X_FILE_OFFSET, "new-game start X");
  assertReadableShort(bytes, NEW_GAME_START_Y_FILE_OFFSET, "new-game start Y");
  return {
    x: readUInt16LE(bytes, NEW_GAME_START_X_FILE_OFFSET),
    y: readUInt16LE(bytes, NEW_GAME_START_Y_FILE_OFFSET)
  };
}

export async function readEbNewGameStartFromRom(romPath: string): Promise<RomStartPixel | undefined> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(romPath);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  validateUnheaderedEbRom(bytes, romPath);
  return parseEbNewGameStart(bytes);
}

export function validateUnheaderedEbRom(bytes: Uint8Array, romPath = "ROM"): void {
  if (bytes.length % 1024 !== 0) {
    throw new Error(`${romPath} is not an unheadered ROM image: byte length ${bytes.length} is not divisible by 1024.`);
  }
  if (bytes.length !== EB_ROM_SIZE_BYTES) {
    throw new Error(`${romPath} is not the expected unheadered 3 MiB EarthBound ROM image: byte length ${bytes.length}.`);
  }
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function assertReadableShort(bytes: Uint8Array, offset: number, label: string): void {
  if (offset < 0 || offset + 1 >= bytes.length) {
    throw new Error(`Cannot read ${label}: file offset 0x${offset.toString(16)} is outside the provided bytes.`);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
