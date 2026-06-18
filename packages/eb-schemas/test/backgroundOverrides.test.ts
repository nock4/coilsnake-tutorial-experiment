import { describe, expect, it } from "vitest";
import { BackgroundOverridesSchema } from "../src/index";

describe("BackgroundOverridesSchema", () => {
  it("parses background override entries with default and EB background id mappings", () => {
    const parsed = BackgroundOverridesSchema.parse({
      schema: "swagbound.background-overrides.v1",
      default: "projections-001",
      entries: {
        "projections-001": {
          image: "assets/swagbound/battle-backgrounds/projections-001.png",
          distortion: {
            amplitude: 8,
            frequency: 2.75,
            speed: 0.85
          },
          scroll: {
            x: 1,
            y: 0
          }
        }
      },
      byBackgroundId: {
        "10": "projections-001"
      }
    });

    expect(parsed.default).toBe("projections-001");
    expect(parsed.entries["projections-001"].distortion.amplitude).toBe(8);
    expect(parsed.byBackgroundId?.["10"]).toBe("projections-001");
  });

  it("rejects unknown top-level keys", () => {
    expect(BackgroundOverridesSchema.safeParse({
      schema: "swagbound.background-overrides.v1",
      default: "projections-001",
      entries: {},
      byBackgroundId: {},
      unexpected: true
    }).success).toBe(false);
  });

  it("rejects non-decimal EB background id keys", () => {
    expect(BackgroundOverridesSchema.safeParse({
      schema: "swagbound.background-overrides.v1",
      entries: {
        "projections-001": {
          image: "assets/swagbound/battle-backgrounds/projections-001.png",
          distortion: {
            amplitude: 8,
            frequency: 2.75,
            speed: 0.85
          }
        }
      },
      byBackgroundId: {
        "0x10": "projections-001"
      }
    }).success).toBe(false);
  });
});
