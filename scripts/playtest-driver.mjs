/**
 * Autonomous playtest driver for the fleet of test subagents.
 *
 * Drives the game in a headless browser against the dev server and reports
 * structured ANOMALIES (JS errors, crashes, softlocks, stuck/boxed states,
 * invalid state, void-walks). Each tester agent runs this for one scenario,
 * then reasons over the output + screenshots and files confirmed bug findings.
 *
 * Usage:
 *   node scripts/playtest-driver.mjs --scenario '<json>' --out <dir> [--base http://127.0.0.1:5176/]
 * Scenario JSON:
 *   { "id":"...", "mode":"explore|battle|script|menu",
 *     "spawn":"x,y"?, "flags":"a,b"?, "nointro":true?,
 *     "steps":N?, "seed":N?,
 *     "battle":{ "group":N, "party":"0,1", "items":"159,153", "psi":"all", "advantage":"normal" }?,
 *     "actions":[ {do:"move",dir:"up",ms:400}, {do:"tap",key:"z"}, {do:"interact"}, {do:"menu"}, {do:"wait",ms:300}, {do:"snapshot"} ]? }
 *
 * Prints exactly one line:  RESULT_JSON:<json>
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
const scenario = JSON.parse(args.scenario ?? "{}");
const BASE = (args.base ?? "http://127.0.0.1:5176/").replace(/\/?$/, "/");
const OUT = args.out ?? "/tmp/playtest";
mkdirSync(OUT, { recursive: true });
const SID = (scenario.id ?? "s").replace(/[^a-z0-9_-]/gi, "_");

const anomalies = [];
const jsErrors = [];
const screenshots = [];
let shotN = 0;

function add(type, detail, extra = {}) {
  anomalies.push({ type, detail, ...extra });
}

// Deterministic PRNG (Math.random is fine here, but seed-stable helps repro).
let seed = (scenario.seed ?? 1234) >>> 0;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => {
    jsErrors.push(String(e.message).slice(0, 300));
    add("jsError", String(e.message).slice(0, 300));
    process.stderr.write("STACKDUMP_BEGIN\n" + String(e.stack || e.message).slice(0, 1500) + "\nSTACKDUMP_END\n");
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      // Ignore noisy expected warnings (music cue unavailable, favicon, font CDN).
      if (/staying silent|favicon|Pixelify|net::ERR/i.test(t)) return;
      jsErrors.push(t.slice(0, 300));
      add("consoleError", t.slice(0, 300));
    }
  });

  const url = BASE + "?" + buildQuery(scenario);
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    add("loadFailed", String(e).slice(0, 200), { url });
    await finish(browser, page);
    return;
  }

  // wait for a scene
  let booted = false;
  for (let i = 0; i < 60; i++) {
    const m = await dbg(page, "mode");
    if (m && m !== "error") { booted = true; break; }
    if (m === "error") { add("bootError", "scene booted into error mode"); break; }
    await page.waitForTimeout(200);
  }
  if (!booted) {
    add("noBoot", "scene never booted to a playable mode");
    await shot(page, "noboot");
    await finish(browser, page);
    return;
  }
  await page.waitForTimeout(500);
  await page.mouse.click(256, 224); // focus canvas
  await page.waitForTimeout(120);

  try {
    if (scenario.mode === "battle") await runBattle(page);
    else if (scenario.mode === "script") await runScript(page);
    else if (scenario.mode === "menu") await runMenu(page);
    else await runExplore(page);
  } catch (e) {
    add("driverError", String(e).slice(0, 200));
  }

  await checkState(page, "end");
  await shot(page, "final");
  await finish(browser, page);
};

function buildQuery(s) {
  const q = [];
  if (s.nointro !== false) q.push("nointro=1");
  if (s.spawn) q.push("spawn=" + s.spawn);
  if (s.flags) q.push("flags=" + s.flags);
  if (s.mode === "battle" && s.battle) {
    q.push("battle=" + s.battle.group);
    if (s.battle.party) q.push("party=" + s.battle.party);
    if (s.battle.items) q.push("items=" + s.battle.items);
    if (s.battle.psi) q.push("psi=" + s.battle.psi);
    if (s.battle.advantage) q.push("advantage=" + s.battle.advantage);
  }
  return q.join("&");
}

const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

async function dbg(page, key) {
  return page.evaluate((k) => {
    const d = globalThis.__firstSceneDebug;
    return d ? (k ? d[k] : d) : null;
  }, key);
}
async function snap(page) {
  return page.evaluate(() => {
    const d = globalThis.__firstSceneDebug || {};
    const b = globalThis.__battleDebug || null;
    return {
      mode: d.mode, x: d.player?.x, y: d.player?.y, locked: d.inputLocked,
      dlg: d.dialogueOpen, menu: d.menu?.open ?? d.menuOpen, shop: d.shopOpen,
      inRange: d.inInteractionRange, cue: d.musicCue, sector: d.currentSectorIndex,
      bounds: d.movementBounds, battle: b ? { phase: b.phase, command: b.command } : null
    };
  });
}
async function shot(page, tag) {
  const p = `${OUT}/${SID}-${String(shotN++).padStart(2, "0")}-${tag}.png`;
  try { await page.screenshot({ path: p }); screenshots.push(p); } catch {}
  return p;
}
async function hold(page, dir, ms) {
  await page.keyboard.down(KEYS[dir]); await page.waitForTimeout(ms); await page.keyboard.up(KEYS[dir]); await page.waitForTimeout(60);
}
async function tap(page, key, ms = 180) { await page.keyboard.press(key); await page.waitForTimeout(ms); }

async function checkState(page, where) {
  const s = await snap(page);
  if (s.mode === "error" || s.mode === "fallback") add("crash", `mode=${s.mode}`, { where });
  if (s.x != null && (!Number.isFinite(s.x) || !Number.isFinite(s.y))) add("invalidPos", `x=${s.x} y=${s.y}`, { where });
  if (s.bounds && s.x != null) {
    const m = 40;
    if (s.x < s.bounds.minX - m || s.x > s.bounds.maxX + m || s.y < s.bounds.minY - m || s.y > s.bounds.maxY + m)
      add("outOfBounds", `pos(${Math.round(s.x)},${Math.round(s.y)}) vs bounds`, { where, bounds: s.bounds });
  }
  return s;
}

let everMoved = false; // gate stuck/boxed reports: only real if the player proved mobile first

async function runExplore(page) {
  const steps = scenario.steps ?? 60;
  let prev = await snap(page);
  let stuckRun = 0;
  for (let i = 0; i < steps; i++) {
    const roll = rand();
    if (roll < 0.62) {
      const dir = pick(["up", "down", "left", "right"]);
      await hold(page, dir, 220 + Math.floor(rand() * 260));
    } else if (roll < 0.8) {
      await tap(page, "z"); // interact / advance
    } else if (roll < 0.9) {
      // open + close menu
      await tap(page, "m", 250); await tap(page, "x", 200); await tap(page, "Escape", 150);
    } else {
      await tap(page, "Enter", 150);
    }
    const s = await checkState(page, `explore#${i}`);
    if (s.mode === "battle" || s.battle) { await runBattle(page); }
    // stuck/boxed detection: player not moving across several move-heavy steps
    if (s.x != null && prev.x != null) {
      const moved = Math.hypot((s.x ?? 0) - (prev.x ?? 0), (s.y ?? 0) - (prev.y ?? 0));
      if (moved > 1) everMoved = true;
      if (moved < 1 && !s.dlg && !s.menu && !s.locked) stuckRun++; else stuckRun = 0;
      if (stuckRun === 12) {
        if (everMoved) { add("possiblyStuck", `stopped moving for ${stuckRun} steps at (${Math.round(s.x)},${Math.round(s.y)})`, { where: `explore#${i}` }); await boxedCheck(page); }
        else { add("deadSpawn", `never moved from spawn (${Math.round(s.x)},${Math.round(s.y)}) — likely an unwalkable test spawn, not a gameplay bug`, { where: `explore#${i}`, severity: "low" }); break; }
      }
    }
    if (jsErrors.length > 6) break;
    prev = s;
  }
}

// Confirm a hard box-in: try all 4 dirs from current spot, report if none move.
async function boxedCheck(page) {
  const start = await snap(page);
  if (start.x == null) return;
  let best = 0;
  for (const d of ["up", "down", "left", "right"]) {
    await hold(page, d, 350);
    const s = await snap(page);
    best = Math.max(best, Math.hypot((s.x ?? 0) - (start.x ?? 0), (s.y ?? 0) - (start.y ?? 0)));
    if (best > 6) break;
  }
  if (best <= 6 && !start.dlg && !start.menu && !start.locked && everMoved) {
    add("boxedIn", `walked to (${Math.round(start.x)},${Math.round(start.y)}) then could not move ANY direction`, { where: "boxedCheck" });
    await shot(page, "boxed");
  }
}

async function runMenu(page) {
  await tap(page, "m", 300);
  await shot(page, "menu-open");
  // walk every row + into submenus
  for (let i = 0; i < 18; i++) {
    await tap(page, "ArrowDown", 120);
    await tap(page, "z", 160);
    const s = await snap(page);
    if (s.mode === "error") { add("crash", "menu navigation crashed", { where: `menu#${i}` }); break; }
    await tap(page, "x", 120);
  }
  await tap(page, "x", 150); await tap(page, "Escape", 150);
  const s = await snap(page);
  if (s.menu) add("menuStuck", "menu did not close after Escape/cancel", { where: "menu" });
}

async function runBattle(page) {
  const deadline = Date.now() + 45000;
  let lastPhase = null, samePhase = 0, rounds = 0;
  for (let i = 0; i < 120 && Date.now() < deadline; i++) {
    const b = await page.evaluate(() => globalThis.__battleDebug || null);
    if (!b || !b.phase) { // battle ended
      if (i > 0) return;
      await page.waitForTimeout(300); continue;
    }
    if (["win", "lose", "flee", "result", "ended", "exit-transition"].includes(b.phase)) {
      await tap(page, "z", 200); return;
    }
    if (b.phase === lastPhase) samePhase++; else { samePhase = 0; rounds++; }
    lastPhase = b.phase;
    if (samePhase > 40) { add("battleSoftlock", `battle phase '${b.phase}' stuck >40 inputs`, { where: "battle" }); await shot(page, "battle-stuck"); return; }
    if (b.phase === "command-input") {
      // simple AI: mostly BASH, sometimes defend/item
      const r = rand();
      if (r < 0.7) { await tap(page, "z", 160); await tap(page, "z", 220); } // bash + confirm target
      else if (r < 0.85) { await tap(page, "ArrowDown", 120); await tap(page, "z", 200); }
      else { await tap(page, "ArrowRight", 120); await tap(page, "z", 200); }
    } else {
      await tap(page, "z", 200);
    }
  }
  const b = await page.evaluate(() => globalThis.__battleDebug || null);
  if (b && b.phase && !["win","lose","flee"].includes(b.phase)) add("battleTimeout", `battle did not resolve in 45s (phase=${b.phase})`, { where: "battle" });
}

async function runScript(page) {
  const actions = scenario.actions ?? [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.do === "move") await hold(page, a.dir, a.ms ?? 350);
    else if (a.do === "tap") await tap(page, a.key, a.ms ?? 180);
    else if (a.do === "interact") { await tap(page, "z", 250); await tap(page, "z", 220); }
    else if (a.do === "menu") await runMenu(page);
    else if (a.do === "battle") await runBattle(page);
    else if (a.do === "wait") await page.waitForTimeout(a.ms ?? 300);
    else if (a.do === "snapshot") await shot(page, `script#${i}`);
    const s = await checkState(page, `script#${i}:${a.do}`);
    if (s.battle) await runBattle(page);
  }
}

async function finish(browser, page) {
  try { await browser.close(); } catch {}
  const result = {
    scenario: { id: scenario.id, mode: scenario.mode, focus: scenario.focus ?? null },
    anomalyCount: anomalies.length,
    jsErrorCount: jsErrors.length,
    anomalies: anomalies.slice(0, 40),
    screenshots,
    ok: anomalies.length === 0
  };
  process.stdout.write("RESULT_JSON:" + JSON.stringify(result) + "\n");
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { o[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return o;
}

await main();
