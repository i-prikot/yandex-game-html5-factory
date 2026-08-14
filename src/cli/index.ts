#!/usr/bin/env node
import "dotenv/config";

import { pathToFileURL } from "node:url";

import { createLogger } from "../core/logger.js";
import { collectCreateGameInput } from "./prompts.js";

const logger = createLogger("cli");

function printHelp(): void {
  console.log(`Yandex Games AI Factory

Usage:
  npm run cli
  npm run cli -- create
  npm run cli -- build <game-slug>

The interactive create flow asks for title, description, 2D/3D mode, quality,
and the host agent. The build command becomes available after a project exists.`);
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

    logger.warn("Build command requested before pipeline integration", { slug });
    console.error("No generated project is available yet. Create a game first.");
    return 1;
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
  console.log("\nConfiguration accepted:");
  console.log(JSON.stringify(gameInput, null, 2));
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
