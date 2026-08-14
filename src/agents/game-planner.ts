import { z } from "zod";

import type { AssetRequest } from "../asset-pipeline/types.js";
import { createLogger } from "../core/logger.js";
import { resolveQualityPreset, type QualityPresetName } from "../performance/budgets.js";
import type { IProvider } from "../providers/base.js";

const assetSchema = z.object({
  type: z.enum(["3d-model", "texture", "sprite", "audio", "ui"]),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()),
});

const gamePlanSchema = z.object({
  title: z.string().min(2).max(80).default("Generated Game"),
  type: z.enum(["2d", "3d"]),
  genre: z.string().min(1),
  mechanics: z.array(z.string()).min(1),
  assets: z.array(assetSchema),
  quality: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export interface GamePlan {
  title: string;
  description: string;
  type: "2d" | "3d";
  genre: string;
  mechanics: string[];
  assets: AssetRequest[];
  quality: QualityPresetName;
}

export interface PlannerHints {
  title?: string;
  type?: "auto" | "2d" | "3d";
}

const logger = createLogger("agent-game-planner");

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
}

function localPlan(prompt: string, quality: string, hints: PlannerHints): GamePlan {
  const normalized = prompt.toLowerCase();
  const threeDimensional = hints.type === "3d" || (hints.type !== "2d" && /\b3d\b|3d|тр[её]хмер|гонк|машин|танк|fps|first.person|survival|арен/iu.test(normalized));
  const type: GamePlan["type"] = threeDimensional ? "3d" : "2d";
  const genre = /гонк|racing/iu.test(normalized)
    ? "racing"
    : /платформ|platform/iu.test(normalized)
      ? "platformer"
      : /головол|puzzle|match.?3/iu.test(normalized)
        ? "puzzle"
        : type === "3d" ? "third-person-arena" : "arcade";
  const assets: AssetRequest[] = type === "3d"
    ? [
        { type: "3d-model", name: "player", description: "Readable low-poly player avatar", tags: ["character", "box"] },
        { type: "texture", name: "ground", description: "Tiling gameplay ground", tags: ["ground", "checker"] },
      ]
    : [
        { type: "sprite", name: "player", description: "High-contrast player sprite", tags: ["player", "vector"] },
        { type: "ui", name: "hud", description: "Score and game status UI", tags: ["ui", "vector"] },
      ];
  return {
    title: hints.title ?? "Generated Game",
    description: prompt,
    type,
    genre,
    mechanics: /собир|collect/iu.test(normalized) ? ["movement", "collectibles", "score"] : ["movement", "score", "restart"],
    assets,
    quality: resolveQualityPreset(quality),
  };
}

export class GamePlanner {
  public constructor(private readonly provider: IProvider) {}

  public async analyze(prompt: string, quality: string, hints: PlannerHints = {}): Promise<GamePlan> {
    logger.info("Planning game from prompt", { promptLength: prompt.length, quality, typeHint: hints.type ?? "auto" });
    try {
      const response = await this.provider.generateCode(
        [
          "Analyze this HTML5 game brief and return the implementation plan as JSON in the code field.",
          `Brief: ${prompt}`,
          `Requested quality: ${quality}. Requested type: ${hints.type ?? "auto"}.`,
          "Schema: {title,type:'2d'|'3d',genre,mechanics:string[],assets:[{type,name,description,tags:string[]}],quality:'LOW'|'MEDIUM'|'HIGH'}.",
          "Choose native Canvas for 2D and Babylon.js for 3D. Respect low-end hardware and prefer procedural assets.",
        ].join("\n"),
        { projectPath: process.cwd(), role: "GamePlanner", gameBrief: prompt },
      );
      const parsed = gamePlanSchema.parse(JSON.parse(stripFence(response.code)));
      const plan: GamePlan = {
        ...parsed,
        title: hints.title ?? parsed.title,
        description: prompt,
        type: hints.type && hints.type !== "auto" ? hints.type : parsed.type,
        quality: quality.toUpperCase() === "AUTO" ? parsed.quality : resolveQualityPreset(quality),
      };
      logger.debug("Game plan parsed", { plan });
      return plan;
    } catch (error) {
      logger.warn("AI plan was unavailable or invalid; using deterministic planner fallback", {
        provider: this.provider.kind,
        reason: error instanceof Error ? error.message : String(error),
      });
      const plan = localPlan(prompt, quality, hints);
      logger.debug("Fallback game plan created", { plan });
      return plan;
    }
  }
}

export { gamePlanSchema };
