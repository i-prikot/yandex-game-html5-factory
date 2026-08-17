import { describe, expect, it } from "vitest";

import type { GamePlan } from "../../src/agents/game-planner.js";
import { resolveGameplayPhases } from "../../src/agents/gameplay-phases.js";
import { buildPhasePrompt, MAX_PHASE_PROMPT_LENGTH } from "../../src/agents/phase-prompts.js";

function plan(type: GamePlan["type"]): GamePlan {
  return {
    title: "Arena",
    description: "A responsive game with clear objectives and visible feedback",
    type,
    genre: type === "2d" ? "platformer" : "arena",
    mechanics: ["movement", "combat", "score"],
    assets: [],
    quality: "LOW",
  };
}

describe("buildPhasePrompt", () => {
  it.each(["2d", "3d"] as const)("builds bounded prompts for every %s phase", (type) => {
    const gamePlan = plan(type);
    for (const phase of resolveGameplayPhases(type)) {
      const prompt = buildPhasePrompt(phase, gamePlan, "export const current = true;\n".repeat(500));

      expect(prompt.length).toBeLessThanOrEqual(MAX_PHASE_PROMPT_LENGTH);
      expect(prompt).toContain(`phase '${phase.name}'`);
      expect(prompt).toContain(`Scope: ${phase.scope}`);
      expect(prompt).toContain(`Game context: ${type.toUpperCase()}`);
      expect(prompt).toContain("Completed dependencies:");
      expect(prompt).toContain(`Generate only code for ${phase.name}`);
    }
  });

  it("prevents a phase from implementing the next phase", () => {
    const gamePlan = plan("3d");
    const [phase] = resolveGameplayPhases("3d");

    const prompt = buildPhasePrompt(phase!, gamePlan, "export {};");

    expect(prompt).toContain("Do not implement camera-controls.");
  });
});
