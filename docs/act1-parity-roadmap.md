# Act 1 Vanilla Parity Roadmap

Charter (Nick, 2026-06-12): finish **Act 1 of vanilla EarthBound at ~99% parity**, then canonize a
design language and start putting our own twist on the game. ROM reading is now authorized for data
extraction (full CoilSnake decompile + custom dialogue text extraction); the ROM is never modified or
committed, and everything extracted stays local and gitignored.

## Where we stand (data audit, 2026-06-12)

Already complete in the local fixture: full 256×320 world map, 2,560 sectors, all tilesets, 2,080
door/warp entries, all 464 sprite groups, full enemy/item/PSI tables, extracted music pack data.

Missing and ROM-only:
- **Vanilla NPC placements** — current `map_sprites.yml` is empty except our 3 authored NPCs.
  Fixed by a full CoilSnake decompile.
- **The game script** — vanilla dialogue lives in ROM text banks (`$c7db8d`-style pointers);
  CoilSnake does not extract it. Requires a custom text extractor (EB text codes are documented by
  the PK Hack community).

## Phases (each with a parity scorecard, Codex-orchestrated slices)

**Phase 0 — Data foundation.** Full CoilSnake decompile into a fresh gitignored fixture
(`external/coilsnake-full`); converter pointed at it behind a flag; dialogue text extractor producing
generated script data keyed by text pointer; flag/action-script decoding survey.

**Phase 1 — Onett traversal parity** *(chosen first)*. Region streaming (camera-windowed rendering of
the full town instead of one fixed 48×44 region), doors/warps/interiors from `map_doors.yml`, all
vanilla Onett NPC placements with facing and Show Sprite flag gating, depth/foreground parity sweep.
Scorecard: walk anywhere in Onett, enter/exit every Act-1 building, NPC census matches vanilla.

**Phase 2 — Script parity.** Real event-flag semantics replacing the repo-owned talked-flag
approximation; EB text-engine command coverage (windows, pauses, prompts, names, conditionals);
NPC action scripts for Act-1 movement patterns. Scorecard: every Onett NPC says vanilla lines,
flag-gated variants behave like vanilla.

**Phase 3 — Systems.** Menus, inventory/equipment, money/ATM, phones/save, party followers.

**Phase 4 — Battles.** Rolling HP meter, Onett enemy set, Frank/Frankystein, Titanic Ant, the scripted
Starman Junior opener. Biggest system; de-risked with a one-enemy vertical slice first.

**Phase 5 — Audio.** SPC playback of extracted music packs (wasm SPC core) + SFX. Last because it is
self-contained and parity-checkable in isolation.

## Design-language note

Canonizing the design language does NOT require finishing all phases: a representative vertical
(traversal + script + one battle, i.e. Phases 0–2 plus the Phase-4 vertical slice) gives enough
surface to extract the language (tile grammar, dialogue voice, encounter rhythm, UI chrome) and start
diverging. Recommendation: revisit the twist after Phase 2.

## Standing safety rules (unchanged except ROM reads)

ROM: read-only, never modified/committed. Extracted data: gitignored, never committed. Public
generated JSON: no ROM filenames, `.sfc`, or absolute paths (enforced by validator + e2e + rg gate).
