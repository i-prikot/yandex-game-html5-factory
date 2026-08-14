import { createLogger } from "../core/logger.js";
import type { IProvider } from "./base.js";
import { ProviderUnavailableError } from "./base.js";
import { ClaudeCodeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";

export type ProviderSelection = "auto" | "claude" | "codex";

export interface ProviderCandidates {
  claude: IProvider;
  codex: IProvider;
}

const logger = createLogger("provider-factory");

export async function createProvider(
  selection: ProviderSelection,
  candidates: ProviderCandidates = {
    claude: new ClaudeCodeProvider(),
    codex: new CodexProvider(),
  },
): Promise<IProvider> {
  logger.info("Selecting host agent provider", { selection });

  if (selection !== "auto") {
    const provider = candidates[selection];
    const isAvailable = await provider.isAvailable();
    logger.debug("Explicit provider availability checked", { provider: selection, isAvailable });
    if (!isAvailable) {
      throw new ProviderUnavailableError(selection, "the selected CLI is not installed or authenticated");
    }
    logger.info("Host agent provider selected", { provider: provider.kind });
    return provider;
  }

  for (const provider of [candidates.claude, candidates.codex]) {
    const isAvailable = await provider.isAvailable();
    logger.debug("Auto-selection candidate checked", { provider: provider.kind, isAvailable });
    if (isAvailable) {
      logger.info("Host agent provider selected", { provider: provider.kind });
      return provider;
    }
  }

  throw new ProviderUnavailableError(
    "codex",
    "neither Claude Code nor Codex CLI is available; install or authenticate one host agent",
  );
}
