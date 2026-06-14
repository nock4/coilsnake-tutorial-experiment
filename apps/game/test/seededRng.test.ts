import { describe, expect, it } from "vitest";
import { createStatefulRng, hashSeed, seedFromSearch } from "../src/seededRng";

describe("stateful seeded RNG", () => {
  it("replays the same sequence from the same seed and resumes from saved state", () => {
    const left = createStatefulRng(123);
    const right = createStatefulRng(123);

    expect([left.next(), left.next(), left.next()]).toEqual([right.next(), right.next(), right.next()]);

    const saved = left.state();
    const resumed = createStatefulRng(0);
    resumed.setState(saved);

    expect(resumed.next()).toBe(left.next());
  });

  it("parses numeric and string search seeds", () => {
    expect(seedFromSearch("?encounterSeed=42", "encounterSeed")).toBe(42);
    expect(seedFromSearch("?encounterSeed=fixed", "encounterSeed")).toBe(hashSeed("fixed"));
  });
});
