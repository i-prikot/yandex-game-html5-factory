#!/usr/bin/env node
import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BuildManager } from "../agents/build-manager.js";
import { createLogger } from "../core/logger.js";
import { FactoryPipeline, type PipelineProgress } from "../pipeline/orchestrator.js";
import { collectCreateGameInput } from "./prompts.js";

const logger = createLogger("cli");

function printHelp(): void {
  console.log(`Yandex Games AI Factory

Usage:
  npm run cli
  npm run cli -- create
  npm run cli -- build <game-slug>

The interactive create flow asks for title, description, 2D/3D mode, quality,
and the host agent. The build command packages an existing generated project.`);
}

function printProgress(event: PipelineProgress): void {
  const marker = event.status === "started" ? "RUN" : event.status === "completed" ? "OK" : "FAIL";
  console.log(`[${marker}] ${event.stage}: ${event.message}`);
}

export async function runCli(args: string[]): Promise<number> {
  const command = args[0] ?? "create";
  logger.info("CLI command started", { command });

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  if (command === "build") {
    const slug = args[1];
    if (!slug) {
      logger.warn("Build command is missing a game slug");
      console.error("Usage: npm run cli -- build <game-slug>");
      return 2;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/u.test(slug)) {
      logger.warn("Build command received an unsafe slug", { slug });
      console.error("Game slug may contain only lowercase letters, numbers, and hyphens.");
      return 2;
    }
    const projectsRoot = resolve(process.env.FACTORY_PROJECTS_DIR ?? "projects");
    const projectPath = resolve(projectsRoot, slug);
    logger.info("Rebuilding generated game", { slug, projectPath });
    const production = await new BuildManager().buildForYandex(projectPath);
    console.log(`[OK] Package: ${production.packagePath}`);
    return 0;
  }

  if (command !== "create") {
    logger.warn("Unknown CLI command", { command });
    printHelp();
    return 2;
  }

  const gameInput = await collectCreateGameInput();
  logger.info("Game configuration collected", {
    name: gameInput.name,
    type: gameInput.type,
    quality: gameInput.quality,
    provider: gameInput.provider,
  });
  console.log("\nStarting autonomous game pipeline...\n");
  const result = await new FactoryPipeline().run(
    gameInput.description,
    gameInput.quality,
    gameInput.provider,
    {
      title: gameInput.name,
      type: gameInput.type,
      onProgress: printProgress,
    },
  );
  console.log(`\n[OK] Project: ${result.projectPath}`);
  console.log(`[OK] Package: ${result.production.packagePath}`);
  console.log(`[OK] Visual validation iterations: ${result.validation.iterations.length}`);
  return 0;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      logger.error("CLI failed", error);
      process.exitCode = 1;
    });
}
