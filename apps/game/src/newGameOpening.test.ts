import { describe, expect, it } from "vitest";
import type { BattleData, ScriptCollection, ScriptCommand, WorldChunked } from "@eb/schemas";
import {
  decideIntroFirstBossBeatFire,
  decideIntroMeteorBattleTransition,
  decideIntroMeteorBeatFire,
  introSpineProgression,
  resolveIntroFirstBossBeatStart,
  resolveIntroMeteorBeatStart
} from "./newGameOpening";

describe("intro meteor beat helpers", () => {
  it("fires once only after the opening is complete and the player enters the trigger", () => {
    const first = decideIntroMeteorBeatFire({
      introActive: true,
      openingComplete: true,
      playerInTriggerRegion: true,
      alreadyFired: false
    });

    expect(first).toEqual({ fire: true, nextAlreadyFired: true });

    const second = decideIntroMeteorBeatFire({
      introActive: true,
      openingComplete: true,
      playerInTriggerRegion: true,
      alreadyFired: first.nextAlreadyFired
    });

    expect(second).toEqual({
      fire: false,
      nextAlreadyFired: true,
      reason: "already_fired"
    });
  });

  it("does not fire outside the new-game intro flow", () => {
    expect(decideIntroMeteorBeatFire({
      introActive: false,
      openingComplete: true,
      playerInTriggerRegion: true,
      alreadyFired: false
    })).toMatchObject({ fire: false, reason: "not_intro_active" });

    expect(decideIntroMeteorBeatFire({
      introActive: true,
      openingComplete: false,
      playerInTriggerRegion: true,
      alreadyFired: false
    })).toMatchObject({ fire: false, reason: "opening_not_complete" });
  });

  it("chooses battle handoff or return-to-control fallback", () => {
    expect(decideIntroMeteorBattleTransition({
      battleGroupResolved: true,
      battleStarted: true
    })).toEqual({
      action: "battle",
      clearIntroActive: true,
      returnControl: false
    });

    expect(decideIntroMeteorBattleTransition({
      battleGroupResolved: true,
      battleStarted: false
    })).toEqual({
      action: "return_control",
      clearIntroActive: true,
      returnControl: true,
      reason: "battle_start_failed"
    });

    expect(decideIntroMeteorBattleTransition({
      battleGroupResolved: false,
      battleStarted: false
    })).toEqual({
      action: "return_control",
      clearIntroActive: true,
      returnControl: true,
      reason: "missing_battle_group"
    });
  });

  it("resolves the trigger from a synthetic marker label and battle group data", () => {
    const world = syntheticWorld();
    const scripts = syntheticScripts("synthetic.buzz");
    const battle = syntheticBattle();

    const resolved = resolveIntroMeteorBeatStart(world, scripts, battle, {
      markerRef: "synthetic.meteor_marker",
      dialogueRef: "synthetic.buzz",
      starmanJuniorEnemyId: 7
    });

    expect(resolved).toMatchObject({
      resolved: true,
      start: {
        markerRef: "synthetic.meteor_marker",
        dialogueRef: "synthetic.buzz",
        battleGroupId: 11,
        derivation: expect.stringContaining("meteor object text pointer")
      }
    });
    expect(resolved.resolved ? resolved.start.trigger.width : 0).toBeGreaterThan(0);
  });
});

describe("intro first-boss beat helpers", () => {
  it("fires once only after bedroom opening and meteor beats are complete", () => {
    expect(decideIntroFirstBossBeatFire({
      bedroomOpeningComplete: false,
      meteorBeatComplete: true,
      playerInTriggerRegion: true,
      alreadyDone: false
    })).toMatchObject({ fire: false, reason: "opening_not_complete" });

    expect(decideIntroFirstBossBeatFire({
      bedroomOpeningComplete: true,
      meteorBeatComplete: false,
      playerInTriggerRegion: true,
      alreadyDone: false
    })).toMatchObject({ fire: false, reason: "meteor_not_complete" });

    const first = decideIntroFirstBossBeatFire({
      bedroomOpeningComplete: true,
      meteorBeatComplete: true,
      playerInTriggerRegion: true,
      alreadyDone: false
    });
    expect(first).toEqual({ fire: true, nextAlreadyDone: true });

    expect(decideIntroFirstBossBeatFire({
      bedroomOpeningComplete: true,
      meteorBeatComplete: true,
      playerInTriggerRegion: true,
      alreadyDone: first.nextAlreadyDone
    })).toEqual({
      fire: false,
      nextAlreadyDone: true,
      reason: "already_done"
    });
  });

  it("models monotonic story-spine flag progression", () => {
    expect(introSpineProgression({
      bedroomDone: false,
      meteorDone: false,
      firstBossDone: false
    })).toEqual({ monotonic: true, next: "bedroom" });

    expect(introSpineProgression({
      bedroomDone: true,
      meteorDone: false,
      firstBossDone: false
    })).toEqual({ monotonic: true, next: "meteor" });

    expect(introSpineProgression({
      bedroomDone: true,
      meteorDone: true,
      firstBossDone: false
    })).toEqual({ monotonic: true, next: "first_boss" });

    expect(introSpineProgression({
      bedroomDone: true,
      meteorDone: true,
      firstBossDone: true
    })).toEqual({ monotonic: true, next: "complete" });

    expect(introSpineProgression({
      bedroomDone: false,
      meteorDone: true,
      firstBossDone: false
    })).toEqual({ monotonic: false, violation: "meteor_without_bedroom" });

    expect(introSpineProgression({
      bedroomDone: true,
      meteorDone: false,
      firstBossDone: true
    })).toEqual({ monotonic: false, violation: "first_boss_without_meteor" });
  });

  it("resolves the first-boss trigger from a synthetic Sharks-area pointer and battle group", () => {
    const world = syntheticWorld();
    const scripts = syntheticScripts("synthetic.frank");
    const battle = syntheticBattle();

    const resolved = resolveIntroFirstBossBeatStart(world, scripts, battle, {
      dialogueRef: "synthetic.frank",
      battleGroupId: 11
    });

    expect(resolved).toMatchObject({
      resolved: true,
      start: {
        dialogueRef: "synthetic.frank",
        battleGroupId: 11,
        derivation: expect.stringContaining("Sharks-area NPC text pointer")
      }
    });
    expect(resolved.resolved ? resolved.start.trigger.width : 0).toBeGreaterThan(0);
  });
});

function syntheticWorld(): WorldChunked {
  return {
    available: true,
    mode: "full",
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    sources: {
      mapTiles: true,
      mapSectors: true,
      tilesetFiles: 0,
      mapSprites: true,
      npcConfig: true,
      spriteGroupsYml: true
    },
    tileSize: 16,
    mapWidthTiles: 8,
    mapHeightTiles: 8,
    chunkSizeTiles: 4,
    chunks: [],
    npcs: [
      {
        npcId: 1,
        spriteGroup: 1,
        eventFlag: 0,
        direction: "down",
        type: "object",
        movement: 0,
        showSprite: "always",
        textPointer: "synthetic.meteor_marker",
        textPointer2: "$0",
        interactable: true,
        visible: true,
        worldPixel: { x: 48, y: 48 }
      },
      {
        npcId: 2,
        spriteGroup: 1,
        eventFlag: 0,
        direction: "up",
        type: "person",
        movement: 0,
        showSprite: "always",
        textPointer: "synthetic.frank",
        textPointer2: "$0",
        interactable: true,
        visible: true,
        worldPixel: { x: 80, y: 72 }
      }
    ],
    doors: [],
    player: {
      spriteGroup: 1,
      spawnWorldPixel: { x: 16, y: 16 },
      spawnDerivation: "synthetic"
    },
    collision: {
      cellSize: 8,
      width: 16,
      height: 16,
      solidRows: Array.from({ length: 16 }, () => "0".repeat(16)),
      surfaceRows: Array.from({ length: 16 }, () => "00".repeat(16))
    },
    counts: {
      chunks: 0,
      chunksWritten: 0,
      voidChunks: 0,
      chunkFiles: 0,
      npcs: 2,
      visibleNpcs: 2,
      solidCells: 0,
      mapTilesetsUsed: 0,
      palettesUsed: 0,
      doors: 0,
      doorTypes: {}
    },
    warnings: []
  };
}

function syntheticScripts(reference: string): ScriptCollection {
  const [stem, labelName] = reference.split(".");
  const path = `${stem}.ccs`;
  const commands: ScriptCommand[] = [
    { cmd: "label", raw: `${labelName}:`, name: labelName, sourceLocation: { file: path, line: 1, column: 1 } },
    {
      cmd: "text",
      raw: "\"Synthetic placeholder.\"",
      value: "Synthetic placeholder.",
      segments: [{ kind: "text", value: "Synthetic placeholder." }],
      sourceLocation: { file: path, line: 2, column: 1 }
    },
    { cmd: "end", raw: "end", sourceLocation: { file: path, line: 3, column: 1 } }
  ];
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path,
      commands,
      labels: [labelName],
      counts: { commands: commands.length, labels: 1, textCommands: 1, unknownCommands: 0 },
      warnings: []
    }],
    counts: { files: 1, commands: commands.length, labels: 1, textCommands: 1, unknownCommands: 0 },
    warnings: []
  };
}

function syntheticBattle(): BattleData {
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    selection: {
      method: "synthetic",
      mapEnemyGroupIds: [],
      battleGroupIds: [11],
      placementCellMapping: "synthetic",
      fallbackUsed: false
    },
    statMapping: {
      level: "synthetic",
      hp: "synthetic",
      defense: "synthetic",
      offense: "synthetic",
      speed: "synthetic",
      experience: "synthetic",
      money: "synthetic",
      bossFlag: "synthetic",
      actions: "synthetic",
      itemDropped: "synthetic",
      itemRarity: "synthetic"
    },
    spriteFormat: {
      source: "synthetic",
      fileType: "synthetic",
      indexedPaletteBits: 4,
      transparentPaletteIndex: 0,
      allowedSizes: [[32, 32]]
    },
    assetLayout: {
      spriteDir: "synthetic",
      backgroundDir: "synthetic",
      spriteFilePattern: "synthetic",
      backgroundFilePattern: "synthetic"
    },
    enemies: [],
    groups: [{ id: 11, background1: 0, background2: 0, enemyIds: [7] }],
    backgrounds: [],
    counts: { enemies: 0, groups: 1, spriteFiles: 0, backgroundFiles: 0 },
    warnings: []
  };
}
