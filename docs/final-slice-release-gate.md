# Final Slice Release Gate

## Status

The CoilSnake to Phaser foundation slice is complete.

This release gate covers the browser-hosted Phaser prototype, generated JSON
pipeline, validation, tests, QA playtests, and safety boundaries. It does not
claim emulator proof, ROM compilation, map rendering, sprite rendering, battle
systems, audio, or full game recreation.

## Implemented

- Local CoilSnake fixture import from `external/coilsnake-project`.
- Generated JSON output under `apps/game/public/generated`.
- Manifest-first loading in Phaser.
- CCScript parser v0 for the tutorial `robot.hello_world` dialogue.
- Unknown CCScript command preservation.
- SpriteGroups metadata indexing without copying or rendering PNG assets.
- NPC/script reference indexing for safe text/YML inputs.
- Tutorial status generation.
- Generated JSON validation.
- Shared Zod schemas and pure dialogue/script helpers.
- Phaser first scene with:
  - primitive play area
  - visible player marker
  - visible NPC/script marker
  - Arrow/WASD movement
  - Space/Enter interaction and dialogue advance
  - Esc/Backspace dialogue close
  - movement pause while dialogue is open
  - import status and sprite metadata panels
- Playwright UX QA routes for:
  - import status and dialogue playback
  - dialogue close/reopen and movement lock
  - exploratory bounded movement sweep
- Mantis-style robust browser e2e routes for:
  - invalid generated scripts fallback
  - invalid manifest error state
  - narrow viewport observability
- Replay recordings for the browser QA routes.
- Final root release gate script: `pnpm verify`.

## Fixture-Only Proof

- `external/coilsnake-project/tutorial-fixture-npc-reference.yml` is synthetic
  local-only scanner proof.
- It exists to prove the text/YML scanner detects `robot.hello_world`.
- It is ignored by git with the rest of `external/coilsnake-project`.
- It is not extracted ROM data and is not committed.

## Not Implemented

- Real map rendering.
- Real sprite rendering or animation.
- Extracted PNG rendering.
- Emulator integration.
- ROM compilation as part of the app pipeline.
- Battle systems.
- Audio.
- Save/load.
- Broad CCScript semantics.
- Full game recreation.

## Explicitly Forbidden For This Slice

- Reading, copying, moving, modifying, compiling, generating, or committing the ROM.
- Committing extracted CoilSnake assets.
- Committing generated public JSON other than `.gitkeep`.
- Using extracted sprites, maps, logos, sounds, or exact UI reproduction in the Phaser app.

## Generated File Contract

Current generated JSON files:

- `manifest.json`
- `scripts.json`
- `npcs.json`
- `sprite-groups.json`
- `tutorial-status.json`
- `validation-report.json`

`manifest.json` remains the app entrypoint and references the other generated
files instead of embedding imported data.

`apps/game/public/generated/.gitkeep` is the only tracked file expected under the
generated output directory.

## Release Command

Run the complete browser-slice gate from the repo root:

```sh
pnpm verify
```

The command expands to:

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
pnpm test:review
```

Replay review remains available separately:

```sh
pnpm test:replay
```

Robust browser e2e game testing is available separately:

```sh
pnpm test:mantis
```

## Safety Checks

The release gate must be accompanied by this generated JSON scan:

```sh
rg -n "EarthBound \(USA\)|\.sfc|/Users/" apps/game/public/generated/*.json || true
```

Passing means the scan prints no matches.

## Completion Definition

This slice is complete when:

- `pnpm verify` passes.
- The generated JSON safety scan prints no matches.
- Git tracks no generated JSON except `.gitkeep`.
- Git tracks no `external/coilsnake-project` files.
- The Phaser first scene remains playable through the Playwright review tests.
- The docs distinguish implemented, fixture-only proof, not implemented, and forbidden work.

## Next Milestone

Start Milestone 2 only after this release gate passes:

Real map/NPC metadata discovery, no rendering yet.
