import { input, select } from "@inquirer/prompts";
import { z } from "zod";

import { createLogger } from "../core/logger.js";

const logger = createLogger("cli-prompts");

export const gameTypeSchema = z.enum(["auto", "2d", "3d"]);
export const qualitySchema = z.enum(["auto", "LOW", "MEDIUM", "HIGH"]);
export const providerSchema = z.enum(["auto", "claude", "codex", "codex-only"]);

export const createGameInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(12).max(4_000),
  type: gameTypeSchema,
  quality: qualitySchema,
  provider: providerSchema,
});

export type CreateGameInput = z.infer<typeof createGameInputSchema>;

export function parseCreateGameInput(value: unknown): CreateGameInput {
  logger.debug("Validating create game input");
  const result = createGameInputSchema.safeParse(value);
  if (!result.success) {
    logger.warn("Create game input validation failed", {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    throw new Error(`Invalid game configuration: ${z.prettifyError(result.error)}`);
  }

  logger.debug("Create game input validated", {
    name: result.data.name,
    type: result.data.type,
    quality: result.data.quality,
    provider: result.data.provider,
  });
  return result.data;
}

export async function collectCreateGameInput(): Promise<CreateGameInput> {
  logger.info("Starting interactive game configuration");
  const name = await input({
    message: "Game title:",
    validate: (value) => value.trim().length >= 2 || "Enter at least 2 characters",
  });
  const description = await input({
    message: "Game description:",
    validate: (value) => value.trim().length >= 12 || "Describe the game in at least 12 characters",
  });
  const type = await select({
    message: "Game type:",
    choices: [
      { name: "AUTO", value: "auto" as const },
      { name: "2D", value: "2d" as const },
      { name: "3D", value: "3d" as const },
    ],
  });
  const quality = await select({
    message: "Target device / quality:",
    choices: [
      { name: "AUTO", value: "auto" as const },
      { name: "LOW / compatibility", value: "LOW" as const },
      { name: "MEDIUM", value: "MEDIUM" as const },
      { name: "HIGH", value: "HIGH" as const },
    ],
  });
  const provider = await select({
    message: "AI agent:",
    choices: [
      { name: "AUTO", value: "auto" as const },
      { name: "Claude Code", value: "claude" as const },
      { name: "Codex", value: "codex" as const },
      { name: "Codex only (CRS proxy)", value: "codex-only" as const },
    ],
  });

  return parseCreateGameInput({ name, description, type, quality, provider });
}
