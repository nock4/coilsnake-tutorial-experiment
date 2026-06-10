# Mantis E2E Game Testing Report

## Scope

This pass applies a Mantis-style robust e2e approach to the browser-hosted Phaser
slice. The target is the first playable scene and generated JSON pipeline, not
Snes9x emulator proof or ROM compilation.

## What Changed

- Added a reusable Playwright game harness in `tests/review/gameHarness.ts`.
- Expanded browser e2e coverage from 3 scenarios to 6 scenarios.
- Added adverse generated-data scenarios for invalid `scripts.json` and invalid
  `manifest.json`.
- Added a narrow viewport scene observability test.
- Added a safe generated-data error debug state in the Phaser app.
- Added `pnpm test:mantis` as the explicit robust e2e game-test command.

## Test Strategy

The suite uses Mantis-style test structure:

- Stable game harness instead of duplicated raw test steps.
- Runtime issue capture for browser console errors and page errors.
- State-based game assertions through `globalThis.__firstSceneDebug`.
- Directed player routes for expected tutorial behavior.
- Adverse generated-data routes for broken JSON contracts.
- Exploratory input sweep for movement bounds and state stability.

## Scenarios

Implemented Playwright scenarios:

- First scene loads import status and plays imported dialogue.
- Dialogue advances, closes, and prevents movement while open.
- Exploratory input sweep keeps the player bounded and stable.
- Invalid `scripts.json` keeps the scene alive and shows a generated fallback.
- Invalid `manifest.json` renders a generated-data error state without a page crash.
- Scene remains observable on a narrow review viewport.

## Commands

Run the robust e2e game suite:

```sh
pnpm test:mantis
```

Run the full release gate:

```sh
pnpm verify
```

## Current Result

`pnpm test:mantis` passed:

```text
6 passed
```

## Safety Boundaries

- The tests do not read, copy, move, modify, compile, generate, or commit the ROM.
- The tests do not commit extracted CoilSnake assets.
- The tests only load browser-served generated JSON and synthetic route overrides.
- The adverse-data tests mock generated JSON responses in Playwright; they do not mutate fixture files.
- The Phaser scene still uses primitive graphics and system fonts only.

## Remaining Gap

This is robust browser e2e coverage for the playable Phaser slice. It does not
prove emulator behavior, real map rendering, real sprite rendering, battle
systems, audio, or full game recreation.
