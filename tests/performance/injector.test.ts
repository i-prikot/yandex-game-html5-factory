import { describe, expect, it } from "vitest";

import { applyBudget } from "../../src/performance/injector.js";

const BABYLON_BOOTSTRAP = `
async function bootstrap() {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  engine.runRenderLoop(() => scene.render());
}
`;

describe("applyBudget", () => {
  it("injects the LOW hardware and scene constraints", () => {
    const output = applyBudget(BABYLON_BOOTSTRAP, "LOW");

    expect(output).toContain("engine.setHardwareScalingLevel(2)");
    expect(output).toContain("shadowsEnabled: false");
    expect(output).toContain("maxParticles: 50");
    expect(output).toContain("textureSize: 512");
    expect(output).toContain("scene.shadowsEnabled = false");
  });

  it("replaces an existing injected budget instead of duplicating it", () => {
    const output = applyBudget(applyBudget(BABYLON_BOOTSTRAP, "LOW"), "HIGH");

    expect(output.match(/<factory:performance-budget>/gu)).toHaveLength(1);
    expect(output).toContain("engine.setHardwareScalingLevel(1)");
    expect(output).toContain("maxParticles: 1000");
    expect(output).not.toContain("maxParticles: 50");
  });

  it("adds portable budget metadata to non-Babylon code", () => {
    const output = applyBudget("requestAnimationFrame(frame);", "MEDIUM");

    expect(output).toContain('FACTORY_QUALITY_PRESET = "MEDIUM"');
    expect(output).toContain("requestAnimationFrame(frame)");
    expect(output).not.toContain("setHardwareScalingLevel");
  });
});
