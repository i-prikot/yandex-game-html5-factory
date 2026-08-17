import { createLogger } from "../core/logger.js";
import type { GamePlan } from "./game-planner.js";

export const MAX_PHASE_SCOPE_LENGTH = 2_000;
export const MAX_PHASE_ESTIMATED_TIME_MS = 90_000;

export interface GameplayPhase {
  name: string;
  scope: string;
  dependencies: string[];
  estimatedTimeMs: number;
}

export class InvalidGameplayPhaseError extends Error {
  public constructor(phaseName: string, reason: string) {
    super(`Invalid gameplay phase '${phaseName}': ${reason}`);
    this.name = "InvalidGameplayPhaseError";
  }
}

const TWO_DIMENSIONAL_PHASES: readonly GameplayPhase[] = [
  {
    name: "scaffold",
    scope: "Establish the complete module structure, state model, render loop, and exported template contract.",
    dependencies: [],
    estimatedTimeMs: 60_000,
  },
  {
    name: "player-movement",
    scope: "Implement responsive keyboard and pointer controls, player movement, boundaries, and basic collisions.",
    dependencies: ["scaffold"],
    estimatedTimeMs: 75_000,
  },
  {
    name: "game-logic",
    scope: "Implement the planned mechanics, objectives, opponents, scoring, progression, and end-state behavior.",
    dependencies: ["player-movement"],
    estimatedTimeMs: 85_000,
  },
  {
    name: "ui-integration",
    scope: "Complete the HUD, touch interaction, feedback, readiness metrics, and final public contract integration.",
    dependencies: ["game-logic"],
    estimatedTimeMs: 70_000,
  },
];

const THREE_DIMENSIONAL_PHASES: readonly GameplayPhase[] = [
  {
    name: "scene-setup",
    scope: "Establish the complete Babylon.js module structure, scene, lighting, environment, and exported contract.",
    dependencies: [],
    estimatedTimeMs: 65_000,
  },
  {
    name: "camera-controls",
    scope: "Implement the planned camera behavior and responsive keyboard, pointer, and touch input mapping.",
    dependencies: ["scene-setup"],
    estimatedTimeMs: 70_000,
  },
  {
    name: "player-entity",
    scope: "Implement the player entity, movement, boundaries, collision behavior, and visible gameplay feedback.",
    dependencies: ["camera-controls"],
    estimatedTimeMs: 80_000,
  },
  {
    name: "game-mechanics",
    scope: "Implement objectives, opponents, pickups, scoring, progression, and complete win or loss behavior.",
    dependencies: ["player-entity"],
    estimatedTimeMs: 85_000,
  },
  {
    name: "optimization",
    scope: "Apply the quality budget, complete HUD and readiness metrics, and remove unnecessary per-frame work.",
    dependencies: ["game-mechanics"],
    estimatedTimeMs: 70_000,
  },
];

const logger = createLogger("gameplay-phases");

export function validateGameplayPhases(phases: readonly GameplayPhase[]): void {
  const knownNames = new Set<string>();
  for (const phase of phases) {
    if (!phase.name.trim()) {
      throw new InvalidGameplayPhaseError("<empty>", "name must not be empty");
    }
    if (knownNames.has(phase.name)) {
      throw new InvalidGameplayPhaseError(phase.name, "name must be unique");
    }
    if (!phase.scope.trim() || phase.scope.length >= MAX_PHASE_SCOPE_LENGTH) {
      throw new InvalidGameplayPhaseError(
        phase.name,
        `scope must contain 1-${MAX_PHASE_SCOPE_LENGTH - 1} characters`,
      );
    }
    if (!Number.isSafeInteger(phase.estimatedTimeMs)
      || phase.estimatedTimeMs <= 0
      || phase.estimatedTimeMs >= MAX_PHASE_ESTIMATED_TIME_MS) {
      throw new InvalidGameplayPhaseError(
        phase.name,
        `estimatedTimeMs must be a positive integer below ${MAX_PHASE_ESTIMATED_TIME_MS}`,
      );
    }
    const missingDependency = phase.dependencies.find((dependency) => !knownNames.has(dependency));
    if (missingDependency) {
      throw new InvalidGameplayPhaseError(
        phase.name,
        `dependency '${missingDependency}' must reference an earlier phase`,
      );
    }
    knownNames.add(phase.name);
  }
}

export function resolveGameplayPhases(type: GamePlan["type"]): GameplayPhase[] {
  const source = type === "2d" ? TWO_DIMENSIONAL_PHASES : THREE_DIMENSIONAL_PHASES;
  const phases = source.map((phase) => ({ ...phase, dependencies: [...phase.dependencies] }));
  validateGameplayPhases(phases);
  const totalEstimatedTimeMs = phases.reduce((total, phase) => total + phase.estimatedTimeMs, 0);
  logger.debug("Resolved gameplay phase definitions", {
    type,
    phases: phases.map((phase) => ({ name: phase.name, dependencies: phase.dependencies })),
  });
  logger.info("Gameplay phases resolved", { type, phaseCount: phases.length, totalEstimatedTimeMs });
  return phases;
}
