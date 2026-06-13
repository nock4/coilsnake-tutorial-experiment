# Act 1 Parity — Final Report

The honest accounting of the full-parity build: what was achieved, what is an approximation, and what
is blocked by data availability. Run `pnpm parity:scorecard` for the live, machine-checked numbers;
this report is the narrative + the gap ledger.

Process: built as ~40 gated packages, each authored by a Codex subagent and verified by the
orchestrator (unit tests + tsc + the e2e suites + a default-byte-identical check + a JSON safety scan)
before commit. The EarthBound ROM and everything derived from it are reference/development inputs only:
local, gitignored, never committed, never reproduced. Committed code/tests use synthetic/neutral data;
all reporting is counts/structure.

## What the engine does (Phases 1–6, 8.1)

- **Traversal:** the full Onett-region overworld streams as chunks with collision, all vanilla NPC
  placements, doors/stairways/escalators with real destinations, and facing-aware interaction.
- **Script:** an EarthBound text engine (control-code segments, paging, pauses, substitutions), a
  bounded flow resolver that follows goto/call and evaluates real flag conditionals, event flags with
  three-rule dynamic NPC visibility, and a cutscene event executor (dialogue / flags / give-take-money
  / party / warp / battle / music-sound effects).
- **Systems:** party + stat model; the full menu (Status / Goods / PSI / Equip / Check); item use,
  equip slots, shops, ATM; save/load persistence.
- **Battle:** party-of-N vs enemy groups, the signature rolling-HP odometer (survive-fatal-blow),
  speed turn order, targeting, a command menu with PSI and items, enemy AI from real action data, the
  victory flow (EXP / level-up / money / drops) with transitions, and Act-1 bosses.

Verification at this report: full unit suite + tsc clean, the default e2e suite, the opt-in full-world
and battle e2e suites, and the parity scorecard all green; default build byte-identical with optional
modes off.

## Faithful vs approximated vs data-blocked (the ledger)

**Faithful (extracted data drives it):** map geometry, collision, NPC placements, doors/destinations,
the script text + labels + control codes, event-flag-driven dialogue branches and visibility, item /
PSI / shop / character / enemy / battle-action *data*, sprite/animation frame mapping.

**Approximated (mechanic is ours; magnitudes/specifics not in CoilSnake's output, derived from stats
and documented):**
- NPC movement behaviors (static/patrol/wander) — keyed off the numeric Movement id, not the real
  action script.
- Enemy AI effect magnitudes and PSI/item recovery amounts — the exact numbers live behind ROM
  routine pointers (Code Address); damage/heal is derived from stats.
- Equip stat bonuses and exact per-PSI PP costs — not present in the extracted tables; derived/defaulted.

**Data-blocked (not faithfully reproducible from CoilSnake's project output; would require ROM-level
reverse engineering of code/tables CoilSnake does not decompile):**
- **The canonical new-game start** — `newgame_location`/`newgame_startup` compile into ROM start data
  that is not extracted, so the literal bedroom-intro entry point (which location, which startup event
  pointer) is unknown. The engine *can run* intro event scripts; it cannot know vanilla's exact entry.
- NPC action/movement scripts and enemy-AI behavior scripts (bytecode behind action pointers).
- Exact battle/PSI effect formulas (ROM routines).

**Deferred by choice, not blocked:** audio. EarthBound's music is raw SNES sound-engine data
(.brr/.ebm) requiring APU emulation; instead the game will use **original music** through a Web Audio
layer driven by the existing music/sound event hooks (see the audio decision). This is verifiable and
copyright-clean, and matches the original-game goal.

## Honest verdict on "Act 1 plays like vanilla"

- **Systems parity: high.** Every major Act-1 system exists and is verified: move, talk (real
  flag-gated dialogue), menus/items/shops/save, and a complete battle loop through bosses.
- **Data-extraction parity: high** (scorecard PASS).
- **Playable-sequence parity: partial, and capped by data.** A literal start-to-finish vanilla Act-1
  *playthrough* (bedroom → meteor → Onett set pieces → first Sanctuary as the exact scripted sequence)
  is not reproducible, because the new-game start + event-trigger wiring is not in the extracted data.
  The pieces a playthrough needs (a populated walkable world, the event executor, battles, menus) all
  work; the vanilla *entry/sequence glue* is the missing, ROM-locked part.

So: the engine is a faithful, verified reconstruction of EarthBound's Act-1 *systems and content*, not
a turnkey replay of its opening movie. For the project's stated goal — canonize the design language,
then build an original game — this is the stronger outcome: a content-agnostic engine proven against
real data, ready for original maps, script, battles, and music.

## Recommended next steps

1. **Original audio layer** (Phase 7, reshaped): Web Audio music + SFX from an audio manifest of your
   own tracks, wired to the existing music/sound event cues. Fully gateable.
2. **Begin the original game**: author original content to the same schemas (the seams in
   design-language-checkpoint.md), defining your own new-game start and event sequence — which also
   sidesteps the only hard parity blocker, since your start data is yours to define.
3. Optional parity deepening (only if desired): ROM-level RE of movement/AI/start tables — large, and
   unnecessary for an original game.
