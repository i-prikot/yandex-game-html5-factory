import { createLogger } from "../core/logger.js";

export type QualityPresetName = "LOW" | "MEDIUM" | "HIGH";
export type QualitySelection = QualityPresetName | "AUTO";

export interface PerformanceBudget {
  readonly targetFPS: number;
  readonly hardwareScalingLevel: number;
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: number;
  readonly postProcessing: boolean;
  readonly maxParticles: number;
  readonly textureSize: number;
  readonly useLOD: boolean;
  readonly maxDrawCalls: number;
  readonly maxTriangles: number;
  readonly maxTextureMemoryMB: number;
  readonly maxLights: number;
  readonly maxShadowCasters: number;
  readonly maxActiveMeshes: number;
  readonly renderDistance: number;
  readonly maxNPCs: number;
}

const logger = createLogger("performance-budgets");

export const QUALITY_PRESETS: Readonly<Record<QualityPresetName, Readonly<PerformanceBudget>>> = Object.freeze({
  LOW: Object.freeze({
    targetFPS: 30,
    hardwareScalingLevel: 2,
    shadowsEnabled: false,
    shadowMapSize: 0,
    postProcessing: false,
    maxParticles: 50,
    textureSize: 512,
    useLOD: true,
    maxDrawCalls: 100,
    maxTriangles: 75_000,
    maxTextureMemoryMB: 64,
    maxLights: 2,
    maxShadowCasters: 0,
    maxActiveMeshes: 150,
    renderDistance: 60,
    maxNPCs: 8,
  }),
  MEDIUM: Object.freeze({
    targetFPS: 60,
    hardwareScalingLevel: 1.25,
    shadowsEnabled: true,
    shadowMapSize: 1_024,
    postProcessing: false,
    maxParticles: 200,
    textureSize: 1_024,
    useLOD: true,
    maxDrawCalls: 250,
    maxTriangles: 250_000,
    maxTextureMemoryMB: 192,
    maxLights: 4,
    maxShadowCasters: 12,
    maxActiveMeshes: 400,
    renderDistance: 120,
    maxNPCs: 24,
  }),
  HIGH: Object.freeze({
    targetFPS: 60,
    hardwareScalingLevel: 1,
    shadowsEnabled: true,
    shadowMapSize: 2_048,
    postProcessing: true,
    maxParticles: 1_000,
    textureSize: 2_048,
    useLOD: false,
    maxDrawCalls: 500,
    maxTriangles: 750_000,
    maxTextureMemoryMB: 512,
    maxLights: 8,
    maxShadowCasters: 40,
    maxActiveMeshes: 1_000,
    renderDistance: 240,
    maxNPCs: 64,
  }),
});

export function resolveQualityPreset(
  selection: string | undefined,
  autoFallback: QualityPresetName = "LOW",
): QualityPresetName {
  const normalized = selection?.trim().toUpperCase();
  const resolved = normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH"
    ? normalized
    : autoFallback;
  logger.debug("Performance preset resolved", { selection, autoFallback, resolved });
  return resolved;
}

export function getPerformanceBudget(selection: string | undefined): Readonly<PerformanceBudget> {
  const preset = resolveQualityPreset(selection);
  const budget = QUALITY_PRESETS[preset];
  logger.debug("Performance budget loaded", { preset, budget });
  return budget;
}
