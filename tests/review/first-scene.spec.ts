import { expect, test } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  assertPlayerInBounds,
  attachRuntimeIssueCapture,
  gotoFirstScene,
  readDebug,
  readRequiredDebug,
  waitForDebug,
  walkToNpc
} from "./gameHarness";

test("first scene loads import status and plays imported dialogue", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);

  const initial = await waitForDebug(page);
  expect(initial.statusLines.join("\n")).toContain("First Scene: CoilSnake Import");
  expect(initial.statusLines.join("\n")).toContain("Project: found");
  expect(initial.statusLines.join("\n")).toContain("Scripts: 1 files");
  expect(initial.statusLines.join("\n")).toContain("NPC refs: 2");
  expect(initial.metadataLines.join("\n")).toContain("SpriteGroups/005.png: detected");
  expect(initial.resolveStatus).toBe("script + npc ref");

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2_850);
  await page.keyboard.up("ArrowRight");

  await expect.poll(() => readDebug(page), {
    message: "approaching the marker should show an interaction hint"
  }).toMatchObject({
    inInteractionRange: true,
    prompt: "Space/Enter: talk to the imported script marker"
  });

  await page.keyboard.press("Enter");

  await expect.poll(() => readDebug(page), {
    message: "interacting with marker should open imported dialogue"
  }).toMatchObject({
    dialogueOpen: true,
    dialogueText: "@Hello World!",
    targetReference: "robot.hello_world"
  });

  assertNoRuntimeIssues(issues);
});

test("dialogue advances, closes, and prevents movement while open", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await walkToNpc(page);
  await page.keyboard.press("Space");

  const openState = await waitForDebug(page, (state) => state.dialogueOpen);
  expect(openState.dialogueText).toBe("@Hello World!");
  expect(openState.dialoguePageCount).toBe(1);

  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(450);
  await page.keyboard.up("ArrowLeft");
  const lockedState = await readRequiredDebug(page);
  expect(lockedState.player).toEqual(openState.player);

  await page.keyboard.press("Enter");
  await expect.poll(() => readDebug(page), {
    message: "final dialogue page should close on advance"
  }).toMatchObject({ dialogueOpen: false });

  await page.keyboard.press("Space");
  await waitForDebug(page, (state) => state.dialogueOpen);
  await page.keyboard.press("Backspace");
  await expect.poll(() => readDebug(page), {
    message: "Backspace should close dialogue"
  }).toMatchObject({ dialogueOpen: false });

  assertNoRuntimeIssues(issues);
});

test("exploratory input sweep keeps the player bounded and stable", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const moves = [
    ["ArrowLeft", 2_200],
    ["ArrowUp", 1_600],
    ["ArrowRight", 4_400],
    ["ArrowDown", 2_600],
    ["KeyA", 500],
    ["KeyW", 500],
    ["KeyD", 500],
    ["KeyS", 500]
  ] as const;

  for (const [key, duration] of moves) {
    await page.keyboard.down(key);
    await page.waitForTimeout(duration);
    await page.keyboard.up(key);
    const state = await readRequiredDebug(page);
    assertPlayerInBounds(state);
    expect(state.dialogueOpen).toBe(false);
    expect(state.targetReference).toBe("robot.hello_world");
  }

  await page.keyboard.press("Enter");
  const finalState = await readRequiredDebug(page);
  assertPlayerInBounds(finalState);
  expect(finalState.targetReference).toBe("robot.hello_world");
  assertNoRuntimeIssues(issues);
});
