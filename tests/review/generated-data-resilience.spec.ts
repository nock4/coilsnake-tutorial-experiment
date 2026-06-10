import { expect, test } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  gotoFirstScene,
  waitForDebug,
  walkToNpc
} from "./gameHarness";

test("invalid scripts.json keeps the scene alive and shows a generated fallback", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await page.route("**/generated/scripts.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: "bad" })
    });
  });

  await gotoFirstScene(page);
  const loaded = await waitForDebug(page, (state) => state.resolveStatus === "npc ref only");
  expect(loaded.targetReference).toBe("robot.hello_world");
  expect(loaded.statusLines.join("\n")).toContain("robot.hello_world: npc ref only");

  await walkToNpc(page);
  await page.keyboard.press("Enter");

  await expect.poll(() => page.evaluate(() => {
    return (globalThis as unknown as { __firstSceneDebug?: { dialogueOpen: boolean; dialogueText: string } }).__firstSceneDebug;
  }), {
    message: "invalid scripts should still open a generated fallback dialogue"
  }).toMatchObject({
    dialogueOpen: true,
    dialogueText: "Generated scripts.json could not be loaded."
  });

  assertNoRuntimeIssues(issues);
});

test("invalid manifest renders a generated-data error state without a page crash", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await page.route("**/generated/manifest.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: "bad" })
    });
  });

  await gotoFirstScene(page);
  await expect.poll(() => page.evaluate(() => {
    return (globalThis as unknown as { __firstSceneDebug?: { error?: { title: string; message: string } } }).__firstSceneDebug;
  }), {
    message: "invalid manifest should publish an error state for review tooling"
  }).toMatchObject({
    error: {
      title: "Generated manifest is missing or invalid.",
      message: "Run pnpm convert, then pnpm validate."
    }
  });

  assertNoRuntimeIssues(issues);
});

test("scene remains observable on a narrow review viewport", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await page.setViewportSize({ width: 390, height: 740 });
  await gotoFirstScene(page);

  const canvasBox = await page.locator("canvas").boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(300);
  expect(canvasBox?.height).toBeGreaterThan(200);

  const state = await waitForDebug(page);
  expect(state.statusLines.join("\n")).toContain("First Scene: CoilSnake Import");
  expect(state.metadataLines.join("\n")).toContain("Asset rendering: disabled");
  assertNoRuntimeIssues(issues);
});
