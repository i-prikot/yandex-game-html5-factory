import { describe, expect, it } from "vitest";

import {
  getPerformanceBudget,
  QUALITY_PRESETS,
  resolveQualityPreset,
} from "../../src/performance/budgets.js";

describe("performance budgets", () => {
  it("defines increasingly capable LOW, MEDIUM and HIGH presets", () => {
    expect(QUALITY_PRESETS.LOW.hardwareScalingLevel).toBe(2);
    expect(QUALITY_PRESETS.LOW.shadowsEnabled).toBe(false);
    expect(QUALITY_PRESETS.LOW.maxParticles).toBe(50);
    expect(QUALITY_PRESETS.MEDIUM.maxTriangles).toBeGreaterThan(QUALITY_PRESETS.LOW.maxTriangles);
    expect(QUALITY_PRESETS.HIGH.textureSize).toBe(2_048);
  });

  it("uses LOW as the compatibility fallback for AUTO and invalid values", () => {
    expect(resolveQualityPreset("AUTO")).toBe("LOW");
    expect(resolveQualityPreset("unknown")).toBe("LOW");
    expect(resolveQualityPreset("medium")).toBe("MEDIUM");
    expect(getPerformanceBudget(undefined)).toBe(QUALITY_PRESETS.LOW);
  });

  it("exposes frozen budgets so agents cannot mutate shared limits", () => {
    expect(Object.isFrozen(QUALITY_PRESETS)).toBe(true);
    expect(Object.isFrozen(QUALITY_PRESETS.LOW)).toBe(true);
  });
});
