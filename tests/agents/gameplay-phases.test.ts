import { describe, expect, it } from "vitest";

import {
  InvalidGameplayPhaseError,
  MAX_PHASE_ESTIMATED_TIME_MS,
  MAX_PHASE_SCOPE_LENGTH,
  resolveGameplayPhases,
  validateGameplayPhases,
  type GameplayPhase,
} from "../../src/agents/gameplay-phases.js";

function phase(overrides: Partial<GameplayPhase> = {}): GameplayPhase {
  return {
    name: "phase-one",
    scope: "Implement one bounded capability",
    dependencies: [],
    estimatedTimeMs: 60_000,
    ...overrides,
  };
}

describe("gameplay phases", () => {
  it("resolves the expected 2D and 3D phase sequences", () => {
    expect(resolveGameplayPhases("2d").map(({ name }) => name)).toEqual([
      "scaffold",
      "player-movement",
      "game-logic",
      "ui-integration",
    ]);
    expect(resolveGameplayPhases("3d").map(({ name }) => name)).toEqual([
      "scene-setup",
      "camera-controls",
      "player-entity",
      "game-mechanics",
      "optimization",
    ]);
  });

  it("returns independent phase and dependency arrays", () => {
    const first = resolveGameplayPhases("2d");
    first[0]!.name = "changed";
    first[1]!.dependencies.push("changed");

    const second = resolveGameplayPhases("2d");

    expect(second[0]!.name).toBe("scaffold");
    expect(second[1]!.dependencies).toEqual(["scaffold"]);
  });

  it.each([
    ["empty name", [phase({ name: "" })], "name must not be empty"],
    ["duplicate name", [phase(), phase()], "name must be unique"],
    ["empty scope", [phase({ scope: "" })], "scope must contain"],
    ["scope boundary", [phase({ scope: "x".repeat(MAX_PHASE_SCOPE_LENGTH) })], "scope must contain"],
    ["zero estimate", [phase({ estimatedTimeMs: 0 })], "estimatedTimeMs"],
    ["estimate boundary", [phase({ estimatedTimeMs: MAX_PHASE_ESTIMATED_TIME_MS })], "estimatedTimeMs"],
    ["forward dependency", [phase({ dependencies: ["later"] })], "must reference an earlier phase"],
  ])("rejects %s", (_label, phases, message) => {
    expect(() => validateGameplayPhases(phases as GameplayPhase[]))
      .toThrow(expect.objectContaining({ name: "InvalidGameplayPhaseError", message: expect.stringContaining(message as string) }));
  });

  it("accepts a dependency on an earlier valid phase", () => {
    expect(() => validateGameplayPhases([
      phase(),
      phase({ name: "phase-two", dependencies: ["phase-one"] }),
    ])).not.toThrow(InvalidGameplayPhaseError);
  });
});
