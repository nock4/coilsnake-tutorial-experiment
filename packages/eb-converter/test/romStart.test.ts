import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EB_ROM_SIZE_BYTES,
  NEW_GAME_START_X_FILE_OFFSET,
  NEW_GAME_START_X_SNES_ADDRESS,
  NEW_GAME_START_Y_FILE_OFFSET,
  NEW_GAME_START_Y_SNES_ADDRESS,
  parseEbNewGameStart,
  readEbNewGameStartFromRom,
  snesHiRomToFileOffset
} from "../src/romStart";

describe("ROM new-game start extractor", () => {
  it("maps SNES HiROM banks $C0-$FF to file offsets", () => {
    expect(snesHiRomToFileOffset(NEW_GAME_START_X_SNES_ADDRESS)).toBe(NEW_GAME_START_X_FILE_OFFSET);
    expect(snesHiRomToFileOffset(NEW_GAME_START_Y_SNES_ADDRESS)).toBe(NEW_GAME_START_Y_FILE_OFFSET);
    expect(NEW_GAME_START_X_FILE_OFFSET).toBe(0x1FE9E);
    expect(NEW_GAME_START_Y_FILE_OFFSET).toBe(0x1FE9B);
    expect(snesHiRomToFileOffset(0xFF1234)).toBe(0x3F1234);
    expect(() => snesHiRomToFileOffset(0xBFFFFF)).toThrow("banks $C0-$FF");
  });

  it("parses little-endian start coordinates from synthetic bytes", () => {
    const bytes = new Uint8Array(Math.max(NEW_GAME_START_X_FILE_OFFSET, NEW_GAME_START_Y_FILE_OFFSET) + 2);
    bytes[NEW_GAME_START_X_FILE_OFFSET] = 0x34;
    bytes[NEW_GAME_START_X_FILE_OFFSET + 1] = 0x12;
    bytes[NEW_GAME_START_Y_FILE_OFFSET] = 0xCD;
    bytes[NEW_GAME_START_Y_FILE_OFFSET + 1] = 0xAB;

    expect(parseEbNewGameStart(bytes)).toEqual({ x: 0x1234, y: 0xABCD });
  });

  it("returns undefined when the ROM path is absent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-rom-start-"));
    try {
      await expect(readEbNewGameStartFromRom(path.join(temp, "missing.sfc"))).resolves.toBeUndefined();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects a present ROM path with the wrong size", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-rom-start-"));
    try {
      const badRom = path.join(temp, "bad.sfc");
      await writeFile(badRom, new Uint8Array(1024));
      await expect(readEbNewGameStartFromRom(badRom)).rejects.toThrow("unheadered 3 MiB");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("reads a validated unheadered ROM image without hardcoded coordinates", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-rom-start-"));
    try {
      const rom = path.join(temp, "synthetic.sfc");
      const bytes = new Uint8Array(EB_ROM_SIZE_BYTES);
      bytes[NEW_GAME_START_X_FILE_OFFSET] = 0x78;
      bytes[NEW_GAME_START_X_FILE_OFFSET + 1] = 0x56;
      bytes[NEW_GAME_START_Y_FILE_OFFSET] = 0xBC;
      bytes[NEW_GAME_START_Y_FILE_OFFSET + 1] = 0x9A;
      await writeFile(rom, bytes);

      await expect(readEbNewGameStartFromRom(rom)).resolves.toEqual({ x: 0x5678, y: 0x9ABC });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
