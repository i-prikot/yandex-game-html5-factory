import ts from "typescript";

import { createLogger } from "../core/logger.js";
import {
  QUALITY_PRESETS,
  resolveQualityPreset,
  type PerformanceBudget,
  type QualityPresetName,
} from "./budgets.js";

const START_MARKER = "// <factory:performance-budget>";
const END_MARKER = "// </factory:performance-budget>";
const logger = createLogger("performance-injector");

function stripExistingBudget(code: string): string {
  const start = code.indexOf(START_MARKER);
  const end = code.indexOf(END_MARKER);
  if (start === -1 && end === -1) return code;
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Performance budget markers are malformed");
  }
  return `${code.slice(0, start)}${code.slice(end + END_MARKER.length)}`.replace(/\n{3,}/gu, "\n\n");
}

function findConstructedVariable(sourceFile: ts.SourceFile, className: string): ts.VariableStatement | undefined {
  let match: ts.VariableStatement | undefined;
  const visit = (node: ts.Node): void => {
    if (match) return;
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (initializer && ts.isNewExpression(initializer)) {
          const expression = initializer.expression.getText(sourceFile);
          if (expression === className || expression.endsWith(`.${className}`)) {
            match = node;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return match;
}

function serializeBudget(
  preset: QualityPresetName,
  budget: Readonly<PerformanceBudget>,
  includeEngineSettings: boolean,
  includeSceneSettings: boolean,
): string {
  const lines = [
    START_MARKER,
    `const FACTORY_QUALITY_PRESET = "${preset}" as const;`,
    "const FACTORY_PERFORMANCE_BUDGET = Object.freeze({",
    `  targetFPS: ${budget.targetFPS},`,
    `  hardwareScalingLevel: ${budget.hardwareScalingLevel},`,
    `  shadowsEnabled: ${budget.shadowsEnabled},`,
    `  shadowMapSize: ${budget.shadowMapSize},`,
    `  postProcessing: ${budget.postProcessing},`,
    `  maxParticles: ${budget.maxParticles},`,
    `  textureSize: ${budget.textureSize},`,
    `  useLOD: ${budget.useLOD},`,
    `  maxDrawCalls: ${budget.maxDrawCalls},`,
    `  maxTriangles: ${budget.maxTriangles},`,
    `  maxTextureMemoryMB: ${budget.maxTextureMemoryMB},`,
    `  maxLights: ${budget.maxLights},`,
    `  maxShadowCasters: ${budget.maxShadowCasters},`,
    `  maxActiveMeshes: ${budget.maxActiveMeshes},`,
    `  renderDistance: ${budget.renderDistance},`,
    `  maxNPCs: ${budget.maxNPCs},`,
    "});",
  ];
  if (includeEngineSettings) lines.push(`engine.setHardwareScalingLevel(${budget.hardwareScalingLevel});`);
  if (includeSceneSettings) {
    lines.push(`scene.shadowsEnabled = ${budget.shadowsEnabled};`);
    lines.push(`scene.particlesEnabled = ${budget.maxParticles > 0};`);
  }
  lines.push(END_MARKER);
  return lines.join("\n");
}

export function applyBudget(code: string, selection: string): string {
  logger.info("Applying performance budget", { selection });
  const preset = resolveQualityPreset(selection);
  const budget = QUALITY_PRESETS[preset];
  const cleanCode = stripExistingBudget(code);
  const sourceFile = ts.createSourceFile("game.ts", cleanCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const engineStatement = findConstructedVariable(sourceFile, "Engine");
  const sceneStatement = findConstructedVariable(sourceFile, "Scene");

  if (!engineStatement) {
    logger.debug("No Babylon Engine constructor found; injecting budget metadata only", { preset });
    const metadata = serializeBudget(preset, budget, false, false);
    return `${metadata}\n\n${cleanCode.trimStart()}`;
  }

  const insertionStatement = sceneStatement ?? engineStatement;
  const metadata = serializeBudget(preset, budget, true, Boolean(sceneStatement));
  const indentedMetadata = metadata.replaceAll("\n", "\n  ");
  const result = `${cleanCode.slice(0, insertionStatement.end)}\n  ${indentedMetadata}${cleanCode.slice(insertionStatement.end)}`;
  logger.debug("Performance budget injected", {
    preset,
    engineFound: Boolean(engineStatement),
    sceneFound: Boolean(sceneStatement),
    hardwareScalingLevel: budget.hardwareScalingLevel,
    maxParticles: budget.maxParticles,
  });
  return result;
}
