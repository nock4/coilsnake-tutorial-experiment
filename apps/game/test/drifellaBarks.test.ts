import { describe, expect, it } from "vitest";
import { drifellaBarkForNpcId, stableHash } from "../src/drifellaBarks";

describe("drifella bark assignment", () => {
  it("hashes NPC ids deterministically", () => {
    expect([
      stableHash(0),
      stableHash(1),
      stableHash(35),
      stableHash(404),
      stableHash(745),
      stableHash(1582),
      stableHash(100000)
    ]).toEqual([
      0,
      1753845952,
      2205916390,
      669351308,
      568668031,
      1611562335,
      727286121
    ]);
  });

  it("assigns the same NPC id to the same phrase across calls", () => {
    const pool = ["alpha", "beta", "gamma", "delta", "epsilon"];

    expect(drifellaBarkForNpcId(404, pool)).toBe(drifellaBarkForNpcId(404, pool));
    expect(drifellaBarkForNpcId(404, pool)).toBe(pool[stableHash(404) % pool.length]);
  });

  it("spreads sequential NPC ids across the phrase pool", () => {
    const pool = Array.from({ length: 32 }, (_, index) => `phrase-${index}`);
    const counts = new Map(pool.map((phrase) => [phrase, 0]));

    for (let npcId = 0; npcId < 1024; npcId += 1) {
      const phrase = drifellaBarkForNpcId(npcId, pool);
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }

    const values = [...counts.values()];
    expect(values.every((value) => value > 0)).toBe(true);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(32);
  });
});
