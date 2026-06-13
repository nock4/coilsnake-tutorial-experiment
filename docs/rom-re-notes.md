# ROM RE Notes

This repository treats the local EB ROM as read-only source material. The ROM is not committed, moved, or modified by tooling, and extracted values remain in gitignored generated output only.

## New-Game Start Location

CoilSnake does not expose the vanilla new-game player start in project YAML. The method source is CoilSnake's committed `CoilSnake-master/coilsnake/assets/mobile-sprout/lib/std.ccs`, where `newgame_location(x, y)` writes:

- X pixels to SNES address `$C1FE9E`
- Y pixels to SNES address `$C1FE9B`

For an unheadered 3 MiB HiROM image, banks `$C0-$FF` map to file offsets with:

```text
file_offset = snes_address & 0x3FFFFF
```

That yields these ROM-read offsets:

- X pixels: file offset `0x1FE9E` (`$C1FE9E & 0x3FFFFF`)
- Y pixels: file offset `0x1FE9B` (`$C1FE9B & 0x3FFFFF`)

The full-world build reads those two little-endian shorts from the local ROM when available and uses the result as the default player spawn. If the ROM is absent, the build falls back to the existing deterministic ring search near NPC 744.
