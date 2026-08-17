import { createLogger } from "../core/logger.js";
import type { GamePlan } from "./game-planner.js";
import type { GameplayPhase } from "./gameplay-phases.js";

export const MAX_PHASE_PROMPT_LENGTH = 1_500;

const NEXT_PHASE_BY_NAME: Readonly<Record<string, string | undefined>> = {
  scaffold: "player-movement",
  "player-movement": "game-logic",
  "game-logic": "ui-integration",
  "ui-integration": undefined,
  "scene-setup": "camera-controls",
  "camera-controls": "player-entity",
  "player-entity": "game-mechanics",
  "game-mechanics": "optimization",
  optimization: undefined,
};

const logger = createLogger("phase-prompts");

function compact(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

export function buildPhasePrompt(phase: GameplayPhase, plan: GamePlan, previousCode: string): string {
  const nextPhase = NEXT_PHASE_BY_NAME[phase.name];
  const constraint = nextPhase
    ? `Generate only code for ${phase.name}. Do not implement ${nextPhase}.`
    : `Generate only code for ${phase.name}; finalize existing behavior without adding unplanned features.`;
  const prefix = [
    `Return a complete replacement of the current gameplay module for phase '${phase.name}'.`,
    `Scope: ${compact(phase.scope, 500)}`,
    `Game context: ${plan.type.toUpperCase()} ${compact(plan.genre, 100)}; quality ${plan.quality}; ${compact(plan.description, 220)}`,
    `Mechanics: ${compact(plan.mechanics.join(", "), 180) || "none specified"}.`,
    `Completed dependencies: ${phase.dependencies.join(", ") || "none"}.`,
    "Preserve the exported template contract and all working behavior from earlier phases.",
    "The complete current module is supplied in the files context. A compact excerpt follows:",
  ].join("\n");
  const suffix = `\n${constraint}`;
  const excerptBudget = Math.max(0, MAX_PHASE_PROMPT_LENGTH - prefix.length - suffix.length - 1);
  const prompt = `${prefix}\n${compact(previousCode, excerptBudget)}${suffix}`;
  if (prompt.length > MAX_PHASE_PROMPT_LENGTH) {
    throw new Error(`Phase prompt for '${phase.name}' exceeds ${MAX_PHASE_PROMPT_LENGTH} characters`);
  }
  logger.debug("Gameplay phase prompt built", {
    phase: phase.name,
    promptLength: prompt.length,
    previousCodeBytes: previousCode.length,
    nextPhase,
  });
  return prompt;
}
