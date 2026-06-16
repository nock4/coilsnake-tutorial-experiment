# Multi-Entity Overworld Scripting Report

Date: 2026-06-12
Slice: real NPC placements, per-NPC facing/behaviors, interaction triggers, and a tiny event runner.
Process note: this slice was orchestrated by Claude with **Codex subagents writing the code** in three
packages (fixture hack → runtime → e2e), each passing a verification gate (unit + type + browser suites
run by the orchestrator, since the Codex sandbox cannot bind localhost or launch browsers) before commit.

## What changed

1. **Two authored NPCs ("the second hack").** The local fixture had exactly one NPC placement (the
   tutorial robot 744), so multi-entity work required new placements — authored the way a real
   romhacker would: [scripts/apply-npc-hack.ts](../scripts/apply-npc-hack.ts) (`pnpm hack:npcs`,
   `pnpm hack:npcs:revert`) edits the local gitignored CoilSnake project with line-targeted,
   idempotent, backed-up changes:
   - `map_sprites.yml`: NPC 745 at world (7536, 7152) [cell 27/29, X:112 Y:240]; NPC 746 at
     world (7848, 7152) [cell 27/30, X:168 Y:240]. Both coordinates were verified walkable/reachable
     against the generated collision grid before authoring.
   - `npc_config_table.yml`: entries 745/746 overwritten (as the tutorial itself overwrote 744) —
     greeter: Sprite 2, Direction right, `robot.greeter`; patroller: Sprite 4, Direction left,
     `robot.patroller`; both `Show Sprite: always`, `Movement: 0`.
   - `ccscript/robot.ccs`: two new labels with original dialogue text.
   The fixture itself stays uncommitted; `.orig-backup` copies and `--revert` make the hack reversible.
2. **NPC runtime** ([npcController.ts](../apps/game/src/npcController.ts)): each visible NPC wraps the
   same `PlayerState` machine the player uses (`stepPlayer` with synthetic input), so facing/walk
   frames/collision behave identically. Behaviors: `static` and `patrol` (axis, range, speed) with
   reversal at lane ends and on obstruction, and a `paused` flag.
3. **Behavior config** ([npcBehaviors.ts](../apps/game/src/npcBehaviors.ts)): repo-owned npcId →
   behavior map (746 patrols x ±24px at 40px/s). Repo-owned because imported `Movement` codes are
   vanilla action-script pointers we have not decoded — documented, not faked.
4. **Event runner** ([eventRunner.ts](../apps/game/src/eventRunner.ts)): interaction resolves to a list
   of `GameEvent`s; the only kind today is `dialogue` (NPC ccscript pointer, else fallback reference).
   The union is the seam where future kinds (movement, flags, cutscenes) plug in.
5. **Scene integration**: NPCs step every frame with live collision against the map, the player, and
   each other; the player's collision and interaction targeting use live NPC positions. Opening
   dialogue pauses the target NPC, stores its facing, turns it toward the player (dominant-axis
   `facingToward`), and restores facing/behavior on close. Debug state publishes per-NPC live
   x/y/facing/moving/behaviorKind/paused plus `activeNpcId`.
6. **E2E coverage** ([multi-entity.spec.ts](../tests/review/multi-entity.spec.ts)): three NPCs render
   with distinct imported sheets (groups 5/2/4) and config facings; greeter and robot each speak their
   own imported dialogue in one session; the patroller demonstrably moves (multi-sampled) and stays in
   its generated lane ±25px; dialogue pauses it, turns it toward the player, and it resumes after
   close; the JSON safety scan re-checked with the hack applied. `walkToNpc(page, npcId)` now navigates
   to any NPC by live coordinates.

## Interaction/behavior rules

- Interaction remains facing-aware (28px range, in-front cone); with several candidates the nearest in
  front wins (unit-tested; the map's narrow band makes a true two-in-front e2e geometrically
  impossible — NPC bodies seal the corridor, documented limitation).
- Patrol lane = placement ± rangePx, clamped by map bounds; obstruction (player standing in the lane)
  reverses direction rather than pushing through.
- During dialogue: player input locked, target NPC paused and facing the player; other NPCs keep
  moving. On close the NPC resumes with its pre-dialogue facing.

## Verification (run by the orchestrator, outside the Codex sandbox)

```sh
pnpm hack:npcs            # idempotent ("already applied" on re-run); revert cycle verified
pnpm convert && pnpm validate   # ok, worldNpcs: 3, spriteSheets: 4, 0 errors
pnpm test                 # 66 unit tests pass (incl. patrol/pause/facing/event-runner)
pnpm exec tsc --noEmit    # clean
pnpm test:mantis          # 18 e2e tests pass — 3 consecutive green runs
pnpm verify               # full chain green end-to-end
rg -n "EarthBound \(USA\)|\.sfc|/Users/" apps/game/public/generated/*.json   # no matches
```

Visual QA: screenshots + test recordings confirm three distinct sprites, the patroller walking its
lane, face-to-face greeter interaction, and pause/turn/resume during dialogue.

## Safety checks

- ROM untouched; fixture edits confined to `external/coilsnake-project` with extension guards
  (`.sfc/.smc` refused) and path confinement; fixture remains gitignored; backups + revert verified.
- Generated output stays under `apps/game/public/generated`; public JSON safety scan clean
  (validator + e2e test + manual rg).

## Known gaps

- Local-machine dependency: tests now require `pnpm hack:npcs` to have been applied to the local
  fixture (same class of dependency as the original tutorial-modified fixture, but stronger — a
  pristine fixture fails the multi-entity tests until the hack script runs). The script is committed
  and one command restores either state.
- Imported `Movement` codes still undecoded; behaviors are repo-owned config.
- Only the `dialogue` event kind exists; the runner returns a single event today.
- Prompt text says "the robot" for every NPC.
- NPC-vs-NPC collision uses the same fixed 28×28 body as the player rather than per-group imported
  collision metadata.

## Next recommended milestone

**Event-driven scripting depth**: a second event kind (e.g. `face`/`move` steps before dialogue, or
flag-gated dialogue variants using `Text Pointer 2`), multi-page dialogue content in the fixture to
exercise paging with real data, and per-NPC prompts. Alternatively: region expansion (larger render
window or second region) to bring vanilla map content with more tilesets into the slice.
