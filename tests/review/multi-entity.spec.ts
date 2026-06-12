import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  gotoFirstScene,
  readRequiredDebug,
  waitForDebug,
  walkToNpc,
  type FirstSceneDebug
} from "./gameHarness";

type Direction = "up" | "right" | "down" | "left";
type DebugNpc = NonNullable<FirstSceneDebug["npcs"]>[number];
type WorldNpc = {
  npcId: number;
  spriteGroup?: number;
  direction?: Direction;
  regionPixel: { x: number; y: number };
  sheet?: string;
  interactable: boolean;
  visible: boolean;
};
type WorldJson = {
  npcs: WorldNpc[];
};

const NPC_IDS = [744, 745, 746] as const;

async function loadWorld(page: Page): Promise<WorldJson> {
  return await (await page.request.get("/generated/world.json")).json() as WorldJson;
}

function worldNpc(world: WorldJson, npcId: number): WorldNpc {
  const npc = world.npcs.find((item) => item.npcId === npcId);
  expect(npc, `world.json should contain NPC ${npcId}`).toBeDefined();
  return npc as WorldNpc;
}

function debugNpc(state: FirstSceneDebug, npcId: number): DebugNpc {
  const npc = state.npcs?.find((item) => item.id === npcId);
  expect(npc, `debug state should contain NPC ${npcId}`).toBeDefined();
  return npc as DebugNpc;
}

async function readDebugNpc(page: Page, npcId: number): Promise<DebugNpc> {
  return debugNpc(await readRequiredDebug(page), npcId);
}

function expectFacingTowardPlayer(npc: DebugNpc, player: { x: number; y: number }): void {
  const dx = player.x - npc.x;
  const dy = player.y - npc.y;
  const signMatches = (
    (npc.facing === "left" && dx < 0) ||
    (npc.facing === "right" && dx > 0) ||
    (npc.facing === "up" && dy < 0) ||
    (npc.facing === "down" && dy > 0)
  );
  expect(signMatches, `NPC ${npc.id} should face toward player at ${player.x},${player.y}`).toBe(true);
}

test("three imported NPCs render with live state", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const state = await waitForDebug(page, (item) => item.mode === "world" && (item.npcs?.length ?? 0) >= 3);
  const world = await loadWorld(page);

  expect(state.world).toMatchObject({ npcCount: 3, visibleNpcCount: 3, assetsLoaded: true });
  for (const npcId of NPC_IDS) {
    const debug = debugNpc(state, npcId);
    const generated = worldNpc(world, npcId);
    expect(debug.visible, `NPC ${npcId} should be visible`).toBe(true);
    expect(debug.interactable, `NPC ${npcId} should be interactable`).toBe(true);
    expect(debug.facing, `NPC ${npcId} initial facing should match world.json`).toBe(generated.direction);
  }

  expect(NPC_IDS.map((npcId) => worldNpc(world, npcId).spriteGroup)).toEqual([5, 2, 4]);
  const sheets = NPC_IDS.map((npcId) => worldNpc(world, npcId).sheet);
  expect(sheets).toEqual(["assets/sprites/005.png", "assets/sprites/002.png", "assets/sprites/004.png"]);
  expect(new Set(sheets).size, "NPCs should use three different sprite sheets").toBe(3);

  assertNoRuntimeIssues(issues);
});

test("each NPC speaks its own imported dialogue", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && (state.npcs?.length ?? 0) >= 3);

  await walkToNpc(page, 745);
  expect((await readRequiredDebug(page)).interactionTargetId).toBe(745);
  await page.keyboard.press("Space");
  const greeterOpen = await waitForDebug(page, (state) => state.dialogueOpen && state.activeNpcId === 745);
  expect(greeterOpen.dialogueText).toBe("@Beep boop. I greet, therefore I am.");

  await page.keyboard.press("Escape");
  await waitForDebug(page, (state) => !state.dialogueOpen);
  await page.waitForTimeout(250);

  await walkToNpc(page, 744);
  expect((await readRequiredDebug(page)).interactionTargetId).toBe(744);
  await page.keyboard.press("Space");
  const robotOpen = await waitForDebug(page, (state) => state.dialogueOpen && state.activeNpcId === 744);
  expect(robotOpen.dialogueText).toBe("@Hello World!");

  await page.keyboard.press("Escape");
  await waitForDebug(page, (state) => !state.dialogueOpen);
  assertNoRuntimeIssues(issues);
});

test("patroller moves autonomously and stays in its lane", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.npcs?.some((npc) => npc.id === 746)));
  const origin = worldNpc(await loadWorld(page), 746).regionPixel;

  const samples: DebugNpc[] = [];
  for (let index = 0; index < 10; index += 1) {
    samples.push(await readDebugNpc(page, 746));
    await page.waitForTimeout(300);
  }

  const xs = samples.map((npc) => npc.x);
  const ys = samples.map((npc) => npc.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  expect(maxX - minX, "patroller x should vary over repeated samples").toBeGreaterThanOrEqual(8);
  expect(maxY - minY, "patroller y should stay constant").toBeLessThan(0.01);
  for (const x of xs) {
    expect(x, "patroller x should stay inside its generated patrol lane").toBeGreaterThanOrEqual(origin.x - 25);
    expect(x, "patroller x should stay inside its generated patrol lane").toBeLessThanOrEqual(origin.x + 25);
  }

  assertNoRuntimeIssues(issues);
});

test("dialogue pauses the patroller and turns it toward the player", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.npcs?.some((npc) => npc.id === 746)));

  await walkToNpc(page, 746);
  expect((await readRequiredDebug(page)).interactionTargetId).toBe(746);
  await page.keyboard.press("Space");
  const openState = await waitForDebug(page, (state) => state.dialogueOpen && state.activeNpcId === 746);
  const openNpc = debugNpc(openState, 746);

  expect(openState.player, "debug state should include player position").toBeDefined();
  expect(openNpc.paused, "patroller should pause while its dialogue is open").toBe(true);
  expect(openNpc.moving, "patroller should not move while paused for dialogue").toBe(false);
  expectFacingTowardPlayer(openNpc, openState.player!);
  expect(openState.dialogueText).toBe("@Patrolling this canyon. Step aside, hero.");

  await page.waitForTimeout(700);
  const heldNpc = await readDebugNpc(page, 746);
  expect(heldNpc.x, "paused patroller x should remain unchanged").toBeCloseTo(openNpc.x, 3);
  expect(heldNpc.y, "paused patroller y should remain unchanged").toBeCloseTo(openNpc.y, 3);

  await page.keyboard.press("Escape");
  await waitForDebug(page, (state) => !state.dialogueOpen);
  await expect.poll(async () => {
    const npc = await readDebugNpc(page, 746);
    return !npc.paused && npc.moving && (npc.facing === "left" || npc.facing === "right");
  }, {
    message: "patroller should resume its horizontal patrol after dialogue closes",
    timeout: 4_000
  }).toBe(true);

  assertNoRuntimeIssues(issues);
});

test("generated JSON safety scan stays clean with the hack applied", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const manifest = await (await page.request.get("/generated/manifest.json")).json() as { files: Record<string, string> };
  const files = ["manifest.json", ...Object.values(manifest.files)];
  const forbidden = /EarthBound \(USA\)|\.sfc|\/Users\//;

  for (const file of files) {
    const body = await (await page.request.get(`/generated/${file}`)).text();
    expect(forbidden.test(body), `${file} must not leak ROM names or absolute paths`).toBe(false);
  }

  assertNoRuntimeIssues(issues);
});
