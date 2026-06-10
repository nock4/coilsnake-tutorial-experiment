import { expect, type Page } from "@playwright/test";

export type FirstSceneDebug = {
  dialogueOpen: boolean;
  dialogueText: string;
  dialoguePageIndex: number;
  dialoguePageCount: number;
  targetReference: string;
  player?: { x: number; y: number };
  npc?: { x: number; y: number };
  prompt: string;
  distanceToNpc?: number;
  inInteractionRange: boolean;
  movementBounds: { minX: number; maxX: number; minY: number; maxY: number };
  statusLines: string[];
  metadataLines: string[];
  tutorial?: {
    steps: number;
    passed: number;
    failed: number;
    blocked: number;
    unknown: number;
  };
  resolveStatus: string;
  error?: {
    title: string;
    message: string;
  };
};

export type RuntimeIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

export async function gotoFirstScene(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await waitForDebug(page, (state) => state.targetReference === "robot.hello_world" || Boolean(state.error));
}

export async function walkToNpc(page: Page): Promise<void> {
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2_850);
  await page.keyboard.up("ArrowRight");
  await waitForDebug(page, (state) => state.inInteractionRange);
}

export function attachRuntimeIssueCapture(page: Page): RuntimeIssues {
  const issues: RuntimeIssues = { consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    issues.pageErrors.push(error.message);
  });
  return issues;
}

export function assertNoRuntimeIssues(issues: RuntimeIssues): void {
  expect(issues).toEqual({ consoleErrors: [], pageErrors: [] });
}

export function assertPlayerInBounds(state: FirstSceneDebug): void {
  expect(state.player, "debug state should include player position").toBeDefined();
  if (!state.player) {
    return;
  }
  expect(state.player.x).toBeGreaterThanOrEqual(state.movementBounds.minX);
  expect(state.player.x).toBeLessThanOrEqual(state.movementBounds.maxX);
  expect(state.player.y).toBeGreaterThanOrEqual(state.movementBounds.minY);
  expect(state.player.y).toBeLessThanOrEqual(state.movementBounds.maxY);
}

export async function waitForDebug(page: Page, predicate: (state: FirstSceneDebug) => boolean = () => true): Promise<FirstSceneDebug> {
  await expect.poll(async () => {
    const state = await readDebug(page);
    return state ? predicate(state) : false;
  }, {
    message: "first scene debug state should reach expected condition"
  }).toBe(true);
  return readRequiredDebug(page);
}

export async function readRequiredDebug(page: Page): Promise<FirstSceneDebug> {
  const state = await readDebug(page);
  expect(state, "first scene debug state should exist").toBeDefined();
  return state as FirstSceneDebug;
}

export async function readDebug(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<FirstSceneDebug | undefined> {
  return page.evaluate(() => (globalThis as unknown as { __firstSceneDebug?: FirstSceneDebug }).__firstSceneDebug);
}
